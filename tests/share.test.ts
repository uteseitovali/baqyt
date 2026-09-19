import test from "node:test";
import assert from "node:assert/strict";

import { PROGRAMS } from "../src/lib/data/programs";
import { scoreProgram, rankPrograms } from "../src/lib/domain/scoring";
import {
  buildShareable,
  resolveShareable,
  REASON_LINES,
  SHARE_MAX_REASONS,
  SHARE_TOP_N,
} from "../src/lib/share/summary";
import { shareableSchema } from "../src/lib/share/schema";
import {
  generateSlug,
  hashCreator,
  hashSlug,
  isWellFormedSlug,
  SHARE_TTL_DAYS,
} from "../src/lib/share/slug";
import { decodeInline, encodeInline } from "../src/lib/share/inline";
import type { FactorId, Profile } from "../src/lib/domain/types";

/* ============================================================================
   Тесты «Показать семье».

   Главное обещание: наружу уходит СВОДКА, а не анкета. Поэтому тест
   редактирования проверяет не «нет такого-то поля», а белый список: в выходе
   допустимы только известные ключи и только значения из закрытого словаря.
   Всё, что в этот словарь не входит, — утечка, даже если мы о ней не знали.
   ========================================================================= */

/** Профиль с приметными значениями — их и ищем в выходе. */
function distinctiveProfile(): Profile {
  return {
    version: 1,
    grade: 11,
    track: "IB",
    intakeYear: new Date().getFullYear() + 1,
    academics: {
      gpaBand: "high",
      predictedIB: 41,
      entScore: 137,
      satScore: 1487,
      strongSubjects: ["Астрономия-СЕКРЕТ"],
    },
    languages: {
      ielts: 7.5,
      englishSelf: "advanced",
      kazakh: "fluent",
      russian: "fluent",
    },
    budget: {
      annualTuitionUSD: 23456,
      needsFunding: true,
      livingCoveredUSD: 7891,
    },
    preferences: {
      countries: ["KZ", "TR", "GB"],
      fields: ["cs", "engineering"],
      instructionLanguages: ["en"],
      preferCloseToHome: false,
      needsDorm: true,
      campusPreference: "compact",
    },
    note: "СЕКРЕТНАЯ-ЗАМЕТКА про семью Ивановых",
  };
}

const ALL_KEYS = new Set(["v", "programs", "programId", "score", "band", "reasons"]);
const FACTOR_IDS: FactorId[] = [
  "field",
  "academic",
  "budget",
  "language",
  "geography",
  "timeline",
  "lifestyle",
];
const CATALOG_IDS = new Set(PROGRAMS.map((p) => p.id));

/** Обходит выход и складывает все ключи и все строковые значения. */
function walk(value: unknown, keys: string[] = [], strings: string[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, keys, strings);
  } else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      keys.push(key);
      walk(inner, keys, strings);
    }
  } else if (typeof value === "string") {
    strings.push(value);
  }
  return { keys, strings };
}

/* ——— buildShareable: редактирование ——————————————————————————————— */

test("buildShareable: полная анкета в сводку не попадает", () => {
  const profile = distinctiveProfile();
  const matches = rankPrograms(profile, PROGRAMS, { limit: 14 });
  const summary = buildShareable(matches);

  const serialized = JSON.stringify(summary);

  // Ни один корневой раздел анкеты не просочился.
  for (const section of [
    "academics",
    "languages",
    "budget",
    "preferences",
    "intakeYear",
    "grade",
    "track",
    "note",
    "profile",
  ]) {
    assert.ok(!serialized.includes(`"${section}"`), `в сводке есть «${section}»`);
  }

  // И ни одно приметное значение из анкеты.
  for (const needle of [
    "СЕКРЕТ",
    "Иванов",
    "23456",
    "7891",
    "1487",
    "23 456",
    "7 891",
  ]) {
    assert.ok(!serialized.includes(needle), `в сводке просочилось «${needle}»`);
  }
});

test("buildShareable: белый список — только известные ключи и значения закрытого словаря", () => {
  const matches = rankPrograms(distinctiveProfile(), PROGRAMS, { limit: 14 });
  const summary = buildShareable(matches);
  const { keys, strings } = walk(summary);

  for (const key of keys) assert.ok(ALL_KEYS.has(key), `лишний ключ «${key}»`);

  const allowedStrings = new Set<string>([
    "safe",
    "target",
    "reach",
    ...FACTOR_IDS,
    ...CATALOG_IDS,
  ]);
  for (const s of strings) assert.ok(allowedStrings.has(s), `лишняя строка «${s}»`);
});

test("buildShareable: причины не копируют detail факторов с цифрами анкеты", () => {
  const profile = distinctiveProfile();
  const all = PROGRAMS.map((p) => scoreProgram(profile, p));

  // Предусловие: в исходных данных утечка ЕСТЬ — иначе тест ничего не доказывает.
  const sourceLeaks = all.some((m) =>
    m.factors.some((f) => f.detail.includes("137") || f.detail.includes("7.5")),
  );
  assert.ok(sourceLeaks, "в factor.detail должны встречаться баллы анкеты");

  const summary = buildShareable(all);
  const serialized = JSON.stringify(summary);
  assert.ok(!serialized.includes("ЕНТ"), "в сводке текст фактора с баллом ЕНТ");
  assert.ok(!serialized.includes("IELTS"), "в сводке текст фактора с баллом IELTS");
});

test("buildShareable: тексты причин из таблицы не содержат цифр", () => {
  for (const [id, line] of Object.entries(REASON_LINES)) {
    assert.ok(!/\d/.test(line), `${id}: цифра в формулировке «${line}»`);
  }
  assert.deepEqual(Object.keys(REASON_LINES).sort(), [...FACTOR_IDS].sort());
});

/* ——— buildShareable: поведение ——————————————————————————————————— */

test("buildShareable: берёт не больше трёх программ, порядок ранжирования сохраняется", () => {
  const matches = rankPrograms(distinctiveProfile(), PROGRAMS, {
    limit: 14,
    hideBlocked: true,
  });
  const summary = buildShareable(matches);

  assert.equal(summary.programs.length, SHARE_TOP_N);
  assert.deepEqual(
    summary.programs.map((p) => p.programId),
    matches.slice(0, SHARE_TOP_N).map((m) => m.program.id),
  );
});

test("buildShareable: программы с жёсткими несовпадениями не выдаются за лучшие", () => {
  // Скромный бюджет: дорогие программы без стипендий получают блокер.
  const tight: Profile = {
    ...distinctiveProfile(),
    budget: { annualTuitionUSD: 1000, needsFunding: false, livingCoveredUSD: 500 },
  };
  const matches = PROGRAMS.map((p) => scoreProgram(tight, p));
  const blocked = matches.filter((m) => m.blockers.length > 0);
  assert.ok(blocked.length > 0, "нужна хотя бы одна заблокированная программа");

  // Заблокированные — первыми: если фильтра нет, они займут все три места.
  const shuffled = [...blocked, ...matches.filter((m) => m.blockers.length === 0)];
  const summary = buildShareable(shuffled);

  const blockedIds = new Set(blocked.map((m) => m.program.id));
  for (const item of summary.programs) {
    assert.ok(!blockedIds.has(item.programId), `${item.programId} заблокирована`);
  }
});

test("buildShareable: пустой и короткий списки не ломают функцию", () => {
  assert.deepEqual(buildShareable([]), { v: 1, programs: [] });

  const one = buildShareable([scoreProgram(distinctiveProfile(), PROGRAMS[0])]);
  assert.ok(one.programs.length <= 1);
});

test("buildShareable: причины — не более двух и только из сильных факторов", () => {
  const matches = PROGRAMS.map((p) => scoreProgram(distinctiveProfile(), p));
  const byId = new Map(matches.map((m) => [m.program.id, m]));
  const summary = buildShareable(matches);

  for (const item of summary.programs) {
    assert.ok(item.reasons.length <= SHARE_MAX_REASONS);
    const match = byId.get(item.programId)!;
    for (const reason of item.reasons) {
      const factor = match.factors.find((f) => f.id === reason);
      assert.equal(factor?.status, "strong", `${reason} не сильный фактор`);
    }
  }
});

test("buildShareable: детерминирован и не мутирует вход", () => {
  const matches = rankPrograms(distinctiveProfile(), PROGRAMS, { limit: 14 });
  const before = structuredClone(matches);

  const first = buildShareable(matches);
  const second = buildShareable(matches);

  assert.deepEqual(first, second);
  assert.deepEqual(matches, before);
});

test("buildShareable: результат проходит схему, оценка в пределах 0–100", () => {
  const matches = rankPrograms(distinctiveProfile(), PROGRAMS, { limit: 14 });
  const summary = buildShareable(matches);

  assert.ok(shareableSchema.safeParse(summary).success);
  for (const item of summary.programs) {
    assert.ok(item.score >= 0 && item.score <= 100);
  }
});

/* ——— Схема: граница доверия ——————————————————————————————————————— */

function validSummary() {
  return buildShareable(rankPrograms(distinctiveProfile(), PROGRAMS, { limit: 14 }));
}

test("схема: лишний ключ отклоняется — анкету в сводку не дописать", () => {
  const withProfile = { ...validSummary(), profile: distinctiveProfile() };
  assert.ok(!shareableSchema.safeParse(withProfile).success);

  const summary = validSummary();
  const extra = {
    ...summary,
    programs: summary.programs.map((p) => ({ ...p, note: "любой текст" })),
  };
  assert.ok(!shareableSchema.safeParse(extra).success);
});

test("схема: причина вне словаря, четыре программы и дубли отклоняются", () => {
  const summary = validSummary();
  const [first] = summary.programs;

  const badReason = {
    ...summary,
    programs: [{ ...first, reasons: ["<script>alert(1)</script>"] }],
  };
  assert.ok(!shareableSchema.safeParse(badReason).success);

  const four = { ...summary, programs: [first, first, first, first] };
  assert.ok(!shareableSchema.safeParse(four).success);

  const duplicate = { ...summary, programs: [first, first] };
  assert.ok(!shareableSchema.safeParse(duplicate).success);

  const empty = { ...summary, programs: [] };
  assert.ok(!shareableSchema.safeParse(empty).success);

  const badScore = { ...summary, programs: [{ ...first, score: 250 }] };
  assert.ok(!shareableSchema.safeParse(badScore).success);
});

test("resolveShareable: неизвестная программа отбрасывается, а не выдумывается", () => {
  const summary = validSummary();
  const forged = {
    ...summary,
    programs: [
      { programId: "no-such-program", score: 99, band: "safe" as const, reasons: [] },
      ...summary.programs.slice(0, 2),
    ],
  };

  const { items, dropped } = resolveShareable(forged, PROGRAMS);
  assert.equal(dropped, 1);
  assert.equal(items.length, 2);
  for (const item of items) assert.ok(CATALOG_IDS.has(item.program.id));
});

/* ——— Ссылка без сервера: сжатие в query-параметр ——————————————————— */

test("inline: сводка переживает кодирование и декодирование", async () => {
  const summary = validSummary();
  const encoded = await encodeInline(summary);

  assert.match(encoded, /^[zj]\.[A-Za-z0-9_-]+$/, "параметр должен быть URL-безопасным");
  assert.ok(encoded.length < 800, `ссылка слишком длинная: ${encoded.length}`);
  assert.deepEqual(await decodeInline(encoded), summary);
});

test("inline: мусор, обрезанная и подделанная ссылки дают null, а не исключение", async () => {
  const encoded = await encodeInline(validSummary());

  for (const bad of [
    "",
    "z.",
    "z.!!!не-base64!!!",
    "q.AAAA",
    "AAAA",
    encoded.slice(0, encoded.length - 12),
    encoded.slice(0, 6) + "AAAA" + encoded.slice(10),
  ]) {
    assert.equal(await decodeInline(bad), null, `«${bad.slice(0, 20)}» принята`);
  }
});

test("inline: валидный JSON не по схеме отклоняется", async () => {
  const forged = "j." + Buffer.from(JSON.stringify({ v: 1, programs: [{ programId: "x" }] })).toString("base64url");
  assert.equal(await decodeInline(forged), null);

  const withProfile = "j." + Buffer.from(JSON.stringify({ ...validSummary(), profile: {} })).toString("base64url");
  assert.equal(await decodeInline(withProfile), null);
});

async function deflateRaw(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  return "z." + Buffer.from(compressed).toString("base64url");
}

test("inline: «бомба» распаковки отсекается именно лимитом на разжатый размер", async () => {
  // Валидная сводка + пробелы: JSON допускает хвостовые пробелы, поэтому без
  // лимита на разжатый размер такая строка РАЗОБРАЛАСЬ БЫ и вернула сводку.
  // Значит, отказ может дать только сам лимит — не длина параметра и не
  // ошибка разбора (прежняя версия теста упиралась в длину и лимит не касалась).
  const json = JSON.stringify(validSummary());
  const control = await deflateRaw(json + " ".repeat(100));
  assert.deepEqual(await decodeInline(control), validSummary(), "контроль: малый хвост читается");

  const bomb = await deflateRaw(json + " ".repeat(1024 * 1024));
  assert.ok(bomb.length < 2048, `предусловие: бомба проходит по длине (${bomb.length})`);
  assert.equal(await decodeInline(bomb), null);
});

/* ——— Слаг: неугадываемость и хранение ————————————————————————————— */

test("слаг: формат — 22 символа base64url, а не порядковый номер", () => {
  for (let i = 0; i < 50; i++) {
    const slug = generateSlug();
    assert.match(slug, /^[A-Za-z0-9_-]{22}$/);
    assert.ok(isWellFormedSlug(slug));
  }
});

test("слаг: 50 000 вызовов подряд — ни одного повтора", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 50_000; i++) seen.add(generateSlug());
  assert.equal(seen.size, 50_000);
});

test("слаг: хэши тоже не совпадают, а сам слаг в хэше не хранится", () => {
  const slugs = Array.from({ length: 5_000 }, () => generateSlug());
  const hashes = new Set(slugs.map(hashSlug));
  assert.equal(hashes.size, slugs.length);

  const slug = slugs[0];
  const hash = hashSlug(slug);
  assert.match(hash, /^[0-9a-f]{64}$/, "SHA-256 в hex, как в sessions.token_hash");
  assert.notEqual(hash, slug);
  assert.ok(!hash.includes(slug));
  assert.equal(hashSlug(slug), hash, "хэш детерминирован — иначе не найти запись");
});

test("слаг: разные символы порождают разные хэши (нет усечения)", () => {
  const slug = generateSlug();
  const tweaked = slug.slice(0, -1) + (slug.endsWith("A") ? "B" : "A");
  assert.notEqual(hashSlug(slug), hashSlug(tweaked));
});

test("слаг: чужой формат отсекается до обращения к базе", () => {
  for (const bad of [
    "",
    "short",
    "a".repeat(21),
    "a".repeat(23),
    "../../etc/passwd-aaaa",
    "a".repeat(21) + "/",
    "a".repeat(21) + "%",
    "a".repeat(21) + " ",
    "a".repeat(21) + "=",
    "a".repeat(21) + "\n",
  ]) {
    assert.ok(!isWellFormedSlug(bad), `«${bad}» принят`);
  }
});

test("хэш автора: детерминирован, различает адреса, адрес не хранит", () => {
  const a = hashCreator("203.0.113.7");
  assert.equal(hashCreator("203.0.113.7"), a);
  assert.notEqual(hashCreator("203.0.113.8"), a);
  assert.match(a, /^[0-9a-f]{64}$/);
  // Целый адрес, а не его цифры: в случайном hex «203» встречается сам по себе.
  assert.ok(!a.includes("203.0.113.7"));
});

test("хэш автора: без AUTH_SECRET перец случайный, а не пустой", () => {
  const saved = process.env.AUTH_SECRET;
  try {
    delete process.env.AUTH_SECRET;
    const withoutSecret = hashCreator("203.0.113.7");
    // Пустой перец дал бы sha256("share:<ip>:") — его перебирают по всем IPv4.
    const { createHash } = require("node:crypto") as typeof import("node:crypto");
    const emptyPepper = createHash("sha256").update("share:203.0.113.7:").digest("hex");
    assert.notEqual(withoutSecret, emptyPepper);
  } finally {
    if (saved !== undefined) process.env.AUTH_SECRET = saved;
  }
});

test("схема: словари берутся из домена — каждый фактор и полоса проходят", () => {
  for (const id of FACTOR_IDS) {
    const item = { programId: "x", score: 1, band: "safe" as const, reasons: [id] };
    assert.ok(shareableSchema.safeParse({ v: 1, programs: [item] }).success, id);
  }
  for (const band of ["safe", "target", "reach"] as const) {
    const item = { programId: "x", score: 1, band, reasons: [] };
    assert.ok(shareableSchema.safeParse({ v: 1, programs: [item] }).success, band);
  }
});

test("срок жизни ссылки — 30 дней", () => {
  assert.equal(SHARE_TTL_DAYS, 30);
});
