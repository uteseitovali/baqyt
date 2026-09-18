import test from "node:test";
import assert from "node:assert/strict";

import { PROGRAMS, getProgramById } from "../src/lib/data/programs";
import { rankPrograms, scoreProgram, balancedShortlist } from "../src/lib/domain/scoring";
import { buildDiagnosis } from "../src/lib/domain/diagnosis";
import { buildRoadmap, nextAction, roadmapProgress } from "../src/lib/domain/roadmap";
import { profileSchema } from "../src/lib/domain/validation";
import type { Profile } from "../src/lib/domain/types";

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
