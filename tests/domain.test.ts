import test from "node:test";
import assert from "node:assert/strict";

import { PROGRAMS, getProgramById } from "../src/lib/data/programs";
import {
  balancedShortlist,
  dominantFactorGap,
  rankPrograms,
  scoreProgram,
} from "../src/lib/domain/scoring";
import { FACTOR_META, FACTOR_ORDER } from "../src/lib/domain/taxonomy";
import { buildDiagnosis } from "../src/lib/domain/diagnosis";
import { buildRoadmap, nextAction, roadmapProgress } from "../src/lib/domain/roadmap";
import { clampToRange, profileSchema, reviveProfile } from "../src/lib/domain/validation";
import { createEmptyProfile } from "../src/lib/store/journey.state";
import { programSchema } from "../src/lib/data/schema";
import { detectRealityCheck } from "../src/lib/domain/realityCheck";
import { applyRealityCheckRewrite } from "../src/lib/ai/enrich";
import type {
  FactorId,
  FactorScore,
  MatchResult,
  Profile,
  RealityCheckFinding,
} from "../src/lib/domain/types";

/* ============================================================================
   Тесты доменного слоя.

   Проверяем ровно то, что будет проверять жюри: реакцию продукта на изменение
   вводных, объяснимость выдачи и отсутствие выдуманной точности.

   Запуск: npm test
   ========================================================================= */

function baseProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    version: 1,
    grade: 11,
    track: "IB",
    intakeYear: new Date().getFullYear() + 1,
    academics: {
      gpaBand: "high",
      predictedIB: 36,
      strongSubjects: ["Математика", "Физика"],
    },
    languages: {
      ielts: 7,
      englishSelf: "advanced",
      kazakh: "fluent",
      russian: "fluent",
    },
    budget: {
      annualTuitionUSD: 15000,
      needsFunding: false,
      livingCoveredUSD: 6000,
    },
    preferences: {
      countries: ["KZ", "TR"],
      fields: ["cs"],
      instructionLanguages: ["en"],
      preferCloseToHome: false,
      needsDorm: true,
      campusPreference: "any",
    },
    ...overrides,
  };
}

/* ——— Каталог ————————————————————————————————————————————————————— */

test("каталог: у каждой программы есть источник и пометка достоверности", () => {
  assert.ok(PROGRAMS.length >= 30, "каталог должен быть содержательным");
  for (const program of PROGRAMS) {
    assert.ok(program.source.url.startsWith("http"), `${program.id}: нет ссылки`);
    assert.ok(
      ["verified", "demo"].includes(program.dataConfidence),
      `${program.id}: не указана достоверность данных`,
    );
  }
});

test("каталог: идентификаторы уникальны", () => {
  const ids = new Set(PROGRAMS.map((p) => p.id));
  assert.equal(ids.size, PROGRAMS.length);
});

/* ——— Скоринг ————————————————————————————————————————————————————— */

test("скоринг: сумма весов факторов равна единице", () => {
  const match = scoreProgram(baseProfile(), PROGRAMS[0]);
  const sum = match.factors.reduce((acc, f) => acc + f.weight, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `сумма весов = ${sum}`);
});

test("скоринг: итог всегда в диапазоне 0..100", () => {
  const profile = baseProfile();
  for (const program of PROGRAMS) {
    const { score } = scoreProgram(profile, program);
    assert.ok(score >= 0 && score <= 100, `${program.id}: score = ${score}`);
  }
});

test("скоринг: у каждого фактора есть человекочитаемое объяснение", () => {
  const match = scoreProgram(baseProfile(), PROGRAMS[0]);
  for (const factor of match.factors) {
    assert.ok(factor.detail.length > 10, `${factor.id}: пустое объяснение`);
  }
});

test("скоринг: выбранное направление поднимает программу выше непрофильной", () => {
  const profile = baseProfile({
    preferences: { ...baseProfile().preferences, fields: ["cs"] },
  });
  const cs = scoreProgram(profile, getProgramById("kz-aitu-cs")!);
  const med = scoreProgram(profile, getProgramById("kz-amu-med")!);
  assert.ok(cs.score > med.score, "CS должна быть выше медицины при интересе к CS");
});

/* ——— Реакция на изменение вводных (сценарий жюри) ——————————————— */

test("реакция: снижение бюджета меняет оценку дорогой программы", () => {
  const rich = baseProfile({
    budget: { annualTuitionUSD: 50000, needsFunding: false, livingCoveredUSD: 20000 },
    preferences: { ...baseProfile().preferences, countries: ["GB"] },
  });
  const poor = baseProfile({
    budget: { annualTuitionUSD: 3000, needsFunding: true, livingCoveredUSD: 2000 },
    preferences: { ...baseProfile().preferences, countries: ["GB"] },
  });

  const expensive = getProgramById("gb-manchester-cs")!;
  const withMoney = scoreProgram(rich, expensive).score;
  const withoutMoney = scoreProgram(poor, expensive).score;

  assert.ok(
    withMoney > withoutMoney + 5,
    `бюджет должен заметно влиять: ${withMoney} против ${withoutMoney}`,
  );
});

test("реакция: смена страны переставляет топ выдачи", () => {
  const kz = baseProfile({
    preferences: { ...baseProfile().preferences, countries: ["KZ"] },
  });
  const tr = baseProfile({
    preferences: { ...baseProfile().preferences, countries: ["TR"] },
  });

  const topKz = rankPrograms(kz, PROGRAMS, { limit: 3 })[0];
  const topTr = rankPrograms(tr, PROGRAMS, { limit: 3 })[0];

  assert.equal(topKz.program.country, "KZ");
  assert.equal(topTr.program.country, "TR");
  assert.notEqual(topKz.program.id, topTr.program.id);
});

test("реакция: появление IELTS повышает языковой фактор", () => {
  const without = baseProfile({
    languages: {
      englishSelf: "intermediate",
      kazakh: "fluent",
      russian: "fluent",
    },
  });
  const with7 = baseProfile();

  const program = getProgramById("tr-bilkent-cs")!;
  const a = scoreProgram(without, program).factors.find((f) => f.id === "language")!;
  const b = scoreProgram(with7, program).factors.find((f) => f.id === "language")!;

  assert.ok(b.score > a.score, "официальный балл должен улучшать языковой фактор");
});

test("реакция: требование стипендии опускает программы без финансирования", () => {
  const program = getProgramById("gb-qmul-law")!; // fundingAvailable: false
  const free = scoreProgram(baseProfile(), program).factors.find(
    (f) => f.id === "budget",
  )!;
  const needsFunding = scoreProgram(
    baseProfile({
      budget: { annualTuitionUSD: 15000, needsFunding: true, livingCoveredUSD: 6000 },
    }),
    program,
  ).factors.find((f) => f.id === "budget")!;

  assert.ok(needsFunding.score < free.score);
});

/* ——— Ранжирование ———————————————————————————————————————————————— */

test("ранжирование: результат отсортирован по убыванию оценки", () => {
  const results = rankPrograms(baseProfile(), PROGRAMS, { limit: 10, hideBlocked: true });
  for (let i = 1; i < results.length; i += 1) {
    assert.ok(
      results[i - 1].score >= results[i].score,
      `порядок нарушен на позиции ${i}`,
    );
  }
});

test("ранжирование: не более двух программ одного университета", () => {
  const results = rankPrograms(baseProfile(), PROGRAMS, { limit: 14 });
  const counts = new Map<string, number>();
  for (const r of results) {
    counts.set(r.program.university, (counts.get(r.program.university) ?? 0) + 1);
  }
  for (const [university, count] of counts) {
    assert.ok(count <= 2, `${university}: ${count} программ в выдаче`);
  }
});

test("ранжирование: выдаёт минимум три варианта — требование кейса", () => {
  const results = rankPrograms(baseProfile(), PROGRAMS, { limit: 12, hideBlocked: true });
  assert.ok(results.length >= 3, `получено только ${results.length}`);
});

test("ранжирование: в выдаче представлены все три полосы", () => {
  // Дорогие сильные программы проседают по бюджету и вылетают из окна выдачи.
  // Механизм добора обязан всё равно показать амбициозный вариант.
  const results = rankPrograms(baseProfile(), PROGRAMS, {
    limit: 14,
    hideBlocked: true,
  });
  const bands = new Set(results.map((r) => r.band));
  assert.ok(bands.has("reach"), "амбициозный вариант должен быть предложен");
  assert.ok(bands.has("safe") || bands.has("target"));
});

test("ранжирование: добор не подсовывает страну вне выбранных", () => {
  const profile = baseProfile({
    preferences: { ...baseProfile().preferences, countries: ["KZ", "TR", "AE"] },
  });
  const results = rankPrograms(profile, PROGRAMS, { limit: 14, hideBlocked: true });
  const reach = results.find((r) => r.band === "reach");
  assert.ok(reach, "амбициозный вариант должен присутствовать");
  assert.ok(
    ["KZ", "TR", "AE"].includes(reach.program.country),
    `добор выбрал ${reach.program.country} вне списка стран`,
  );
});

test("ранжирование: сбалансированная подборка покрывает разные полосы", () => {
  const results = rankPrograms(baseProfile(), PROGRAMS, { limit: 14 });
  const picked = balancedShortlist(results);
  const bands = new Set(picked.map((p) => p.band));
  assert.ok(bands.size >= 2, "подборка должна быть разнообразной по полосам");
});

test("ранжирование: сбалансированная подборка не содержит дублей", () => {
  const results = rankPrograms(baseProfile(), PROGRAMS, { limit: 12 });
  const picked = balancedShortlist(results);
  const ids = new Set(picked.map((p) => p.program.id));
  assert.equal(ids.size, picked.length);
  assert.ok(picked.length <= 3);
});

test("ранжирование: детерминировано — одинаковый вход даёт одинаковый выход", () => {
  const a = rankPrograms(baseProfile(), PROGRAMS, { limit: 8 }).map((r) => r.program.id);
  const b = rankPrograms(baseProfile(), PROGRAMS, { limit: 8 }).map((r) => r.program.id);
  assert.deepEqual(a, b);
});

/* ——— Диагностика ————————————————————————————————————————————————— */

test("диагностика: заполнена для любого профиля", () => {
  const diagnosis = buildDiagnosis(baseProfile());
  assert.ok(diagnosis.headline.length > 10);
  assert.ok(diagnosis.summary.length > 50);
  assert.ok(diagnosis.goal.length > 20);
  assert.equal(diagnosis.generatedBy, "rules");
});

test("диагностика: отсутствие языкового теста попадает в пробелы", () => {
  const profile = baseProfile({
    languages: { englishSelf: "intermediate", kazakh: "fluent", russian: "fluent" },
    preferences: { ...baseProfile().preferences, countries: ["GB"] },
  });
  const diagnosis = buildDiagnosis(profile);
  const hasLanguageGap = diagnosis.gaps.some((g) =>
    g.title.toLowerCase().includes("языков"),
  );
  assert.ok(hasLanguageGap, "пробел по языку должен быть найден");
});

/* ——— Маршрут ————————————————————————————————————————————————————— */

test("маршрут: состав задач зависит от профиля", () => {
  const program = getProgramById("tr-bilkent-cs")!;

  const withIelts = buildRoadmap(baseProfile(), program);
  const withoutIelts = buildRoadmap(
    baseProfile({
      languages: { englishSelf: "intermediate", kazakh: "fluent", russian: "fluent" },
    }),
    program,
  );

  const hasPrep = (r: typeof withIelts) =>
    r.tasks.some((t) => t.id.endsWith("ielts-prep"));

  assert.equal(hasPrep(withIelts), false, "с готовым IELTS подготовки быть не должно");
  assert.equal(hasPrep(withoutIelts), true, "без IELTS подготовка обязана появиться");
});

test("маршрут: задачи отсортированы по сроку", () => {
  const roadmap = buildRoadmap(baseProfile(), PROGRAMS[0]);
  for (let i = 1; i < roadmap.tasks.length; i += 1) {
    const prev = roadmap.tasks[i - 1].dueDate ?? "";
    const current = roadmap.tasks[i].dueDate ?? "";
    assert.ok(prev <= current, `порядок сроков нарушен на позиции ${i}`);
  }
});

test("маршрут: у каждой задачи есть объяснение и срок", () => {
  const roadmap = buildRoadmap(baseProfile(), PROGRAMS[0]);
  assert.ok(roadmap.tasks.length >= 5);
  for (const task of roadmap.tasks) {
    assert.ok(task.why.length > 20, `${task.id}: нет объяснения`);
    assert.ok(task.dueLabel.length > 0, `${task.id}: нет метки срока`);
  }
});

test("маршрут: следующее действие — первая незакрытая задача", () => {
  const roadmap = buildRoadmap(baseProfile(), PROGRAMS[0]);
  const first = roadmap.tasks[0];

  assert.equal(nextAction(roadmap, {})?.id, first.id);
  assert.equal(
    nextAction(roadmap, { [first.id]: true })?.id,
    roadmap.tasks[1].id,
    "после отметки должен сдвигаться на следующую",
  );
});

test("маршрут: прогресс считается корректно", () => {
  const roadmap = buildRoadmap(baseProfile(), PROGRAMS[0]);
  const all = Object.fromEntries(roadmap.tasks.map((t) => [t.id, true]));

  assert.equal(roadmapProgress(roadmap, {}).percent, 0);
  assert.equal(roadmapProgress(roadmap, all).percent, 100);
  assert.equal(nextAction(roadmap, all), null);
});

/* ——— Честность выдачи ——————————————————————————————————————————— */

test("честность: полоса поступления категориальная, без процентов шанса", () => {
  const match = scoreProgram(baseProfile(), PROGRAMS[0]);
  assert.ok(["safe", "target", "reach"].includes(match.band));
  // В объяснениях не должно быть обещаний поступления.
  const text = [...match.reasons, ...match.watchouts].join(" ").toLowerCase();
  for (const forbidden of ["гарант", "точно поступ", "100%"]) {
    assert.ok(!text.includes(forbidden), `найдено обещание: ${forbidden}`);
  }
});

test("честность: закрытый приём отмечается как блокер", () => {
  const past = baseProfile({ intakeYear: 2024 });
  const match = scoreProgram(past, PROGRAMS[0]);
  assert.ok(match.blockers.length > 0, "прошедший набор должен быть блокером");
});

/* ——— Валидация API ——————————————————————————————————————————————— */

test("валидация: корректный профиль проходит схему", () => {
  assert.equal(profileSchema.safeParse(baseProfile()).success, true);
});

test("валидация: мусор отклоняется", () => {
  assert.equal(profileSchema.safeParse({ grade: 99 }).success, false);
  assert.equal(
    profileSchema.safeParse({ ...baseProfile(), grade: 7 }).success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({
      ...baseProfile(),
      academics: { ...baseProfile().academics, predictedIB: 99 },
    }).success,
    false,
  );
});

/* ——— Проверка реальности ————————————————————————————————————————— */

test("проверка реальности: согласованный профиль не даёт находок", () => {
  assert.deepEqual(detectRealityCheck(baseProfile()), []);
});

test("проверка реальности: направление расходится с сильными предметами", () => {
  const profile = baseProfile({
    academics: {
      gpaBand: "high",
      predictedIB: 36,
      strongSubjects: ["История", "Литература"],
    },
    preferences: { ...baseProfile().preferences, fields: ["cs"] },
  });

  const findings = detectRealityCheck(profile);
  const finding = findings.find((f) => f.id === "field-vs-subjects");

  assert.ok(finding, "расхождение направления и предметов должно быть найдено");
  assert.ok(finding.conflict.length > 40, "конфликт должен быть описан словами");
  assert.ok(
    finding.conflict.includes("История") || finding.conflict.includes("Литература"),
    "в описании конфликта должны быть предметы самого абитуриента",
  );
  assert.ok(
    finding.resolutions.length >= 2 && finding.resolutions.length <= 3,
    `вариантов должно быть 2–3, а не ${finding.resolutions.length}`,
  );
});

test("проверка реальности: бюджет не дотягивает до выбранного направления", () => {
  const profile = baseProfile({
    budget: { annualTuitionUSD: 4000, needsFunding: false, livingCoveredUSD: 3000 },
    preferences: { ...baseProfile().preferences, fields: ["design"] },
  });

  const finding = detectRealityCheck(profile).find((f) => f.id === "budget-vs-field");

  assert.ok(finding, "конфликт бюджета и направления должен быть найден");
  assert.ok(
    finding.conflict.includes("4"),
    "в описании должен быть собственный потолок абитуриента",
  );
  assert.ok(finding.resolutions.length >= 2);
});

test("проверка реальности: английское обучение при базовом английском без теста", () => {
  const profile = baseProfile({
    languages: { englishSelf: "basic", kazakh: "fluent", russian: "fluent" },
    preferences: {
      ...baseProfile().preferences,
      countries: ["GB"],
      instructionLanguages: ["en"],
    },
  });

  const finding = detectRealityCheck(profile).find((f) => f.id === "language-vs-plan");
  assert.ok(finding, "разрыв между языком обучения и уровнем должен быть найден");
});

test("проверка реальности: у каждой находки 2–3 варианта с уникальными id", () => {
  const profiles = [
    baseProfile(),
    baseProfile({
      academics: { gpaBand: "mid", strongSubjects: ["История", "Литература"] },
      preferences: { ...baseProfile().preferences, fields: ["cs"] },
    }),
    baseProfile({
      track: "national",
      academics: { gpaBand: "mid", strongSubjects: [] },
      languages: { englishSelf: "basic", kazakh: "fluent", russian: "fluent" },
      budget: { annualTuitionUSD: 3000, needsFunding: true, livingCoveredUSD: 1000 },
      preferences: {
        ...baseProfile().preferences,
        countries: ["GB", "NL"],
        fields: ["medicine", "design"],
        instructionLanguages: ["en"],
      },
    }),
  ];

  for (const profile of profiles) {
    const findings = detectRealityCheck(profile);
    assert.ok(findings.length <= 3, `находок слишком много: ${findings.length}`);
    for (const finding of findings) {
      assert.ok(finding.title.length > 5, `${finding.id}: пустой заголовок`);
      assert.ok(
        finding.resolutions.length >= 2 && finding.resolutions.length <= 3,
        `${finding.id}: ${finding.resolutions.length} вариантов`,
      );
      const ids = new Set(finding.resolutions.map((r) => r.id));
      assert.equal(ids.size, finding.resolutions.length, `${finding.id}: дубли id`);
      for (const resolution of finding.resolutions) {
        assert.ok(resolution.title.length > 3, `${finding.id}: вариант без заголовка`);
        assert.ok(resolution.detail.length > 20, `${finding.id}: вариант без сути`);
      }
    }
  }
});

test("проверка реальности: детерминирована и попадает в диагностику", () => {
  const profile = baseProfile({
    academics: { gpaBand: "high", strongSubjects: ["История", "Литература"] },
    preferences: { ...baseProfile().preferences, fields: ["cs"] },
  });

  assert.deepEqual(detectRealityCheck(profile), detectRealityCheck(profile));
  assert.deepEqual(buildDiagnosis(profile).realityChecks, detectRealityCheck(profile));
  assert.deepEqual(buildDiagnosis(baseProfile()).realityChecks, []);
});

/* ——— Границы LLM-переписывания ——————————————————————————————————— */

function findings(): RealityCheckFinding[] {
  return detectRealityCheck(
    baseProfile({
      academics: { gpaBand: "high", strongSubjects: ["История", "Литература"] },
      preferences: { ...baseProfile().preferences, fields: ["cs"] },
    }),
  );
}

test("переписывание: живой текст применяется, структура сохраняется", () => {
  const base = findings();
  const target = base[0];

  const applied = applyRealityCheckRewrite(base, [
    {
      id: target.id,
      conflict: "Переписанное описание конфликта живым языком для абитуриента.",
      resolutions: target.resolutions.map((r, i) => ({
        id: r.id,
        title: `Вариант ${i + 1}`,
        detail: `Переписанный вариант номер ${i + 1} обычным человеческим языком.`,
      })),
    },
  ]);

  assert.equal(applied.length, base.length);
  assert.equal(applied[0].conflict, "Переписанное описание конфликта живым языком для абитуриента.");
  assert.deepEqual(
    applied[0].resolutions.map((r) => r.id),
    target.resolutions.map((r) => r.id),
    "id и порядок вариантов трогать нельзя",
  );
  assert.equal(applied[0].resolutions[0].title, "Вариант 1");
});

test("переписывание: выдуманная находка игнорируется", () => {
  const base = findings();
  const applied = applyRealityCheckRewrite(base, [
    {
      id: "выдуманный-конфликт",
      conflict: "Модель придумала совершенно новый конфликт, которого не было.",
      resolutions: [
        { id: "a", title: "Выдумка", detail: "Придуманный вариант решения проблемы." },
      ],
    },
  ]);
  assert.deepEqual(applied, base);
});

test("переписывание: добавленный вариант отклоняет всю находку", () => {
  const base = findings();
  const target = base[0];

  const applied = applyRealityCheckRewrite(base, [
    {
      id: target.id,
      conflict: "Описание конфликта, переписанное моделью живым языком.",
      resolutions: [
        ...target.resolutions.map((r) => ({
          id: r.id,
          title: "Переписанный заголовок",
          detail: "Переписанное содержание варианта решения конфликта.",
        })),
        {
          id: "invented-option",
          title: "Новый вариант",
          detail: "Вариант, который модель добавила от себя и которого не было.",
        },
      ],
    },
  ]);

  assert.deepEqual(applied, base, "находка должна остаться детерминированной");
});

test("переписывание: потерянный вариант отклоняет всю находку", () => {
  const base = findings();
  const target = base[0];

  const applied = applyRealityCheckRewrite(base, [
    {
      id: target.id,
      conflict: "Описание конфликта, переписанное моделью живым языком.",
      resolutions: target.resolutions.slice(1).map((r) => ({
        id: r.id,
        title: "Переписанный заголовок",
        detail: "Переписанное содержание варианта решения конфликта.",
      })),
    },
  ]);

  assert.deepEqual(applied, base, "выброшенный моделью вариант должен вернуться");
});

test("переписывание: подменённый id варианта отклоняет находку", () => {
  const base = findings();
  const target = base[0];

  const applied = applyRealityCheckRewrite(base, [
    {
      id: target.id,
      conflict: "Описание конфликта, переписанное моделью живым языком.",
      resolutions: target.resolutions.map((r, i) => ({
        id: i === 0 ? "подменённый-id" : r.id,
        title: "Переписанный заголовок",
        detail: "Переписанное содержание варианта решения конфликта.",
      })),
    },
  ]);

  assert.deepEqual(applied, base);
});

/* ——— Грантовый трек (ЕНТ) ———————————————————————————————————————— */

/** Профиль с баллом ЕНТ: остальное берём из базового. */
function entProfile(entScore: number | undefined, overrides: Partial<Profile> = {}): Profile {
  const base = baseProfile();
  return baseProfile({
    academics: { ...base.academics, entScore },
    preferences: { ...base.preferences, countries: ["KZ"] },
    ...overrides,
  });
}

function budgetFactorFor(profile: Profile, programId: string) {
  const program = getProgramById(programId)!;
  return scoreProgram(profile, program).factors.find((f) => f.id === "budget")!;
}

test("грант: каталог знает порог для казахстанских программ вне автономных вузов", () => {
  const kz = PROGRAMS.filter((p) => p.country === "KZ");
  const withGrant = kz.filter((p) => p.costs.grant);

  assert.ok(withGrant.length >= 10, `порог задан только у ${withGrant.length} программ`);
  for (const program of withGrant) {
    const grant = program.costs.grant!;
    assert.ok(
      grant.entThreshold >= 50 && grant.entThreshold <= 140,
      `${program.id}: порог ${grant.entThreshold} вне шкалы ЕНТ`,
    );
    assert.ok(grant.note.length > 20, `${program.id}: порог без пояснения`);
  }
});

test("грант: поле опционально — у зарубежных программ его нет", () => {
  for (const program of PROGRAMS.filter((p) => p.country !== "KZ")) {
    assert.equal(
      program.costs.grant,
      undefined,
      `${program.id}: грантовый трек есть только у Казахстана`,
    );
  }
});

test("грант: балл выше порога с запасом — надёжный допуск", () => {
  const program = getProgramById("kz-amu-med")!;
  const threshold = program.costs.grant!.entThreshold;
  const factor = budgetFactorFor(entProfile(threshold + 25), "kz-amu-med");

  assert.ok(factor.grant, "разбор по гранту должен появиться");
  assert.equal(factor.grant.likelihood, "reliable");
  assert.equal(factor.grant.entThreshold, threshold);
  assert.equal(factor.grant.gap, 25);
  assert.ok(factor.detail.includes("надёжно"), `в тексте нет вывода: ${factor.detail}`);
});

test("грант: балл ровно на пороге — конкурентно, а не надёжно", () => {
  const program = getProgramById("kz-amu-med")!;
  const threshold = program.costs.grant!.entThreshold;
  const factor = budgetFactorFor(entProfile(threshold), "kz-amu-med");

  assert.equal(factor.grant?.likelihood, "competitive");
  assert.equal(factor.grant?.gap, 0);
  assert.ok(factor.detail.includes("конкурентно"));
});

test("грант: балл ниже порога — к конкурсу не допускают", () => {
  const program = getProgramById("kz-amu-med")!;
  const threshold = program.costs.grant!.entThreshold;
  const factor = budgetFactorFor(entProfile(threshold - 1), "kz-amu-med");

  assert.equal(factor.grant?.likelihood, "unlikely");
  assert.equal(factor.grant?.gap, -1);
  assert.ok(factor.detail.includes("маловероятно"));
});

test("грант: без балла ЕНТ вывода нет, но порог показывается", () => {
  const factor = budgetFactorFor(entProfile(undefined), "kz-amu-med");
  const threshold = getProgramById("kz-amu-med")!.costs.grant!.entThreshold;

  assert.equal(factor.grant, undefined, "без балла сравнивать нечего");
  assert.ok(
    factor.detail.includes(String(threshold)),
    `порог должен быть назван: ${factor.detail}`,
  );
});

test("грант: у программы без трека разбора по гранту нет", () => {
  const factor = budgetFactorFor(entProfile(120), "gb-manchester-cs");
  assert.equal(factor.grant, undefined);
});

test("грант: восьмой фактор не появился", () => {
  const match = scoreProgram(entProfile(120), getProgramById("kz-amu-med")!);
  assert.equal(match.factors.length, 7);
  const sum = match.factors.reduce((acc, f) => acc + f.weight, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test("грант: честность — вывод не обещает поступление", () => {
  const program = getProgramById("kz-aitu-cs")!;
  const factor = budgetFactorFor(entProfile(140), "kz-aitu-cs");
  const text = `${factor.detail} ${factor.grant?.note ?? ""} ${program.costs.grant!.note}`.toLowerCase();
  for (const forbidden of ["гарант", "точно поступ", "100%", "обязательно получ"]) {
    assert.ok(!text.includes(forbidden), `найдено обещание: ${forbidden}`);
  }
});

test("маршрут: грантовая заявка появляется раньше основной подачи", () => {
  const program = getProgramById("kz-satbayev-eng")!;
  assert.ok(program.costs.grant, "программа для теста должна иметь грантовый трек");

  const roadmap = buildRoadmap(entProfile(100), program);
  const grantTask = roadmap.tasks.find((t) => t.id.endsWith("grant-apply"));
  const submit = roadmap.tasks.find((t) => t.id.endsWith("application-submit"));

  assert.ok(grantTask, "задача по грантовому конкурсу должна появиться");
  assert.ok(submit, "основная подача должна остаться");
  assert.ok(
    (grantTask.dueDate ?? "") < (submit.dueDate ?? ""),
    "грантовый дедлайн обязан быть раньше основного",
  );
  assert.ok(grantTask.why.length > 20);
});

test("маршрут: без грантового трека задачи по конкурсу нет", () => {
  const roadmap = buildRoadmap(entProfile(100), getProgramById("gb-manchester-cs")!);
  assert.equal(
    roadmap.tasks.some((t) => t.id.endsWith("grant-apply")),
    false,
  );
});

test("валидация: costs с грантом и без гранта проходят схему", () => {
  const program = getProgramById("kz-amu-med")!;
  assert.equal(programSchema.safeParse(program).success, true);

  const withoutGrant = {
    ...program,
    costs: { ...program.costs, grant: undefined },
  };
  assert.equal(programSchema.safeParse(withoutGrant).success, true);
});

test("валидация: битый грантовый блок отклоняется", () => {
  const program = getProgramById("kz-amu-med")!;

  assert.equal(
    programSchema.safeParse({
      ...program,
      costs: { ...program.costs, grant: { entThreshold: 400, note: "порог вне шкалы" } },
    }).success,
    false,
  );
  assert.equal(
    programSchema.safeParse({
      ...program,
      costs: { ...program.costs, grant: { entThreshold: 70 } },
    }).success,
    false,
    "пояснение обязательно: порог без источника смысла не имеет",
  );
});

/* ——— Разрыв между двумя вариантами ——————————————————————————————— */

/**
 * Синтетический результат подбора: задаём оценки факторов напрямую, а итог
 * считаем из них же. Реальные программы тут не подходят — нужен контроль
 * над каждым фактором, чтобы проверить именно арифметику взвешивания.
 */
function fakeMatch(scores: Partial<Record<FactorId, number>>, tag = "A"): MatchResult {
  const factors: FactorScore[] = FACTOR_ORDER.map((id) => ({
    id,
    label: FACTOR_META[id].label,
    score: scores[id] ?? 0.5,
    weight: FACTOR_META[id].weight,
    status: "ok" as const,
    detail: `${tag}: объяснение фактора «${FACTOR_META[id].label}»`,
  }));
  const score = factors.reduce((sum, f) => sum + f.score * f.weight, 0) * 100;
  return {
    program: PROGRAMS[0],
    score,
    band: "target",
    factors,
    reasons: [],
    watchouts: [],
    blockers: [],
  };
}

test("разрыв: возвращается фактор с наибольшим вкладом в отрыв", () => {
  const leader = fakeMatch({ field: 1 }, "лидер");
  const trailer = fakeMatch({}, "отстающий");

  const gap = dominantFactorGap(leader, trailer);

  assert.ok(gap, "при явном отрыве фактор должен быть найден");
  assert.equal(gap.id, "field");
  assert.ok(
    gap.detail.startsWith("лидер:"),
    "объяснение берётся у лидера — именно он опережает",
  );
});

test("разрыв: у одинаковых результатов фактора нет", () => {
  assert.equal(dominantFactorGap(fakeMatch({}), fakeMatch({})), null);
});

test("разрыв: отрыв меньше порога считается ничьей", () => {
  // 0.04 по фактору с весом 0.06 — это 0.24 балла из 100.
  const a = fakeMatch({ lifestyle: 0.54 });
  const b = fakeMatch({});

  assert.ok(Math.abs(a.score - b.score) < 1, "проверяем именно околоничью");
  assert.equal(dominantFactorGap(a, b), null);
});

test("разрыв: при равной разнице решает вес фактора", () => {
  // Одинаковый отрыв по сырой оценке: направление (вес 0.22) против
  // условий (вес 0.06). Побеждает тот, чей вклад в итог больше.
  const leader = fakeMatch({ field: 0.8, lifestyle: 0.8 }, "лидер");
  const trailer = fakeMatch({ field: 0.5, lifestyle: 0.5 }, "отстающий");

  assert.equal(dominantFactorGap(leader, trailer)?.id, "field");
});

test("разрыв: большой вес перевешивает больший сырой отрыв", () => {
  // Условия: отрыв 0.4 × вес 0.06 = 0.024.
  // Направление: отрыв 0.2 × вес 0.22 = 0.044 — оно и главное.
  const leader = fakeMatch({ field: 0.7, lifestyle: 0.9 }, "лидер");
  const trailer = fakeMatch({ field: 0.5, lifestyle: 0.5 }, "отстающий");

  assert.equal(dominantFactorGap(leader, trailer)?.id, "field");
});

test("разрыв: порядок аргументов не меняет ответ", () => {
  const leader = fakeMatch({ academic: 1 }, "лидер");
  const trailer = fakeMatch({}, "отстающий");

  const forward = dominantFactorGap(leader, trailer);
  const backward = dominantFactorGap(trailer, leader);

  assert.equal(forward?.id, "academic");
  assert.deepEqual(backward, forward, "объяснение всегда у того, кто впереди");
});

test("разрыв: детерминирован на реальных программах", () => {
  const profile = baseProfile();
  const a = scoreProgram(profile, getProgramById("kz-aitu-cs")!);
  const b = scoreProgram(profile, getProgramById("kz-amu-med")!);

  const first = dominantFactorGap(a, b);
  const second = dominantFactorGap(a, b);

  assert.ok(first, "разные по смыслу программы должны иметь ведущий фактор");
  assert.deepEqual(first, second);
  assert.ok(first.detail.length > 10, "у фактора должно быть объяснение для UI");
});

/* ============================================================================
   Восстановление профиля из недоверенного источника (localStorage).

   Анкета, сохранённая прошлой версией приложения, переживает обновление кода:
   zustand/persist кладёт её поверх начального состояния целиком, поэтому
   отсутствующая секция превращалась в падение рендера, а значение вне
   диапазона — в 422 от сервера уже после того, как человек прошёл всю анкету.
   reviveProfile — единственное место, где эта починка живёт.
   ========================================================================= */

test("revive: профиль без секции academics достраивается, а не роняет экран", () => {
  const stored = { ...baseProfile() } as Record<string, unknown>;
  delete stored.academics;

  const revived = reviveProfile(stored);

  assert.equal(typeof revived.academics.gpaBand, "string");
  assert.ok(Array.isArray(revived.academics.strongSubjects));
  assert.equal(profileSchema.safeParse(revived).success, true);
});

test("revive: каждая отсутствующая секция восстанавливается по отдельности", () => {
  for (const section of ["academics", "languages", "budget", "preferences"]) {
    const stored = { ...baseProfile() } as Record<string, unknown>;
    delete stored[section];

    const revived = reviveProfile(stored);

    assert.equal(
      profileSchema.safeParse(revived).success,
      true,
      `профиль без ${section} должен восстанавливаться`,
    );
  }
});

test("revive: балл вне диапазона отбрасывается, а не уезжает на сервер", () => {
  const revived = reviveProfile({
    ...baseProfile(),
    academics: { gpaBand: "high", satScore: 7, predictedIB: 3, strongSubjects: [] },
  });

  assert.equal(revived.academics.satScore, undefined);
  assert.equal(revived.academics.predictedIB, undefined);
  assert.equal(profileSchema.safeParse(revived).success, true);
});

test("revive: неизвестное направление или страна не проходят дальше хранилища", () => {
  const revived = reviveProfile({
    ...baseProfile(),
    preferences: {
      countries: ["KZ", "ATLANTIS"],
      fields: ["cs", "underwater-basket-weaving"],
      instructionLanguages: ["en"],
      preferCloseToHome: false,
      needsDorm: true,
      campusPreference: "any",
    },
  });

  assert.deepEqual(revived.preferences.countries, ["KZ"]);
  assert.deepEqual(revived.preferences.fields, ["cs"]);
  assert.equal(profileSchema.safeParse(revived).success, true);
});

test("revive: мусор вместо профиля даёт пустую анкету, а не исключение", () => {
  for (const junk of [null, undefined, 42, "профиль", [], { grade: "одиннадцать" }]) {
    const revived = reviveProfile(junk);
    assert.equal(
      profileSchema.safeParse(revived).success,
      true,
      `${JSON.stringify(junk)} должен дать валидную анкету`,
    );
  }
});

test("revive: корректный профиль проходит без изменений", () => {
  const original = baseProfile({ note: "важна стипендия" });
  assert.deepEqual(reviveProfile(original), original);
});

test("clamp: число вне диапазона подтягивается к границе, а не уезжает как есть", () => {
  // Поле SAT объявляет min=400: «7» — это начало набора «700», а не ответ.
  assert.equal(clampToRange(7, 400, 1600), 400);
  assert.equal(clampToRange(9000, 400, 1600), 1600);
  assert.equal(clampToRange(1200, 400, 1600), 1200);
});

test("clamp: пустое поле остаётся пустым — это «не сдавал», а не ноль", () => {
  assert.equal(clampToRange(undefined, 400, 1600), undefined);
  assert.equal(clampToRange(Number.NaN, 400, 1600), undefined);
});

test("clamp: результат для любого поля анкеты проходит схему профиля", () => {
  const ranges = [
    ["satScore", 400, 1600],
    ["entScore", 0, 140],
    ["predictedIB", 24, 45],
  ] as const;

  for (const [field, min, max] of ranges) {
    for (const typed of [-5, 0, 7, 3, 999999]) {
      const profile = baseProfile({
        academics: {
          gpaBand: "high",
          strongSubjects: [],
          [field]: clampToRange(typed, min, max),
        } as Profile["academics"],
      });
      assert.equal(
        profileSchema.safeParse(profile).success,
        true,
        `${field}=${typed} после clamp должен проходить схему`,
      );
    }
  }
});

test("revive: отсутствующая секция берёт значения пустой анкеты, а не пустые списки", () => {
  // Пустая анкета приходит со страной по умолчанию — человек открывает шаг
  // «Направление» и видит Казахстан уже отмеченным. Потеря этого значения
  // превращает первый же переход в «выберите хотя бы одну страну».
  const empty = createEmptyProfile();
  const stored = { ...baseProfile() } as Record<string, unknown>;
  delete stored.preferences;

  const revived = reviveProfile(stored);

  assert.deepEqual(revived.preferences.countries, empty.preferences.countries);
  assert.deepEqual(
    revived.preferences.instructionLanguages,
    empty.preferences.instructionLanguages,
  );
});

test("revive: осознанно пустой список остаётся пустым", () => {
  // Отличие от предыдущего теста: здесь ключ есть и он пуст — это ответ
  // человека («снял все страны»), а не отсутствие данных.
  const revived = reviveProfile({
    ...baseProfile(),
    preferences: {
      countries: [],
      fields: [],
      instructionLanguages: [],
      preferCloseToHome: false,
      needsDorm: true,
      campusPreference: "any",
    },
  });

  assert.deepEqual(revived.preferences.countries, []);
});
