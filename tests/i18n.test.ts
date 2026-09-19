import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_LOCALE, isLocale, LOCALES, SOURCE_LOCALE, type Locale } from "../src/lib/i18n/locale";
import { resolve, type Translations } from "../src/lib/i18n/translations";
import { landing } from "../src/lib/i18n/dictionaries/landing";
import * as taxonomy from "../src/lib/domain/taxonomy";
import { taxonomyFor } from "../src/lib/domain/taxonomy";

/* ============================================================================
   Тесты слоя локализации.

   Три обещания, которые они держат:
     1. русский путь не изменился — именованные экспорты taxonomy.ts это
        ровно taxonomyFor("ru");
     2. недоставленный перевод не ломает экран — откат на русский по ключам;
     3. структура (веса, токены, адреса) от языка не зависит.

   Гарантии полноты — на этапе компиляции; их проверяет `npm run typecheck`
   через @ts-expect-error ниже: если ограничение перестанет работать,
   директива станет «неиспользованной» и компиляция упадёт.
   ========================================================================= */

/* ——— Компиляция: что тип Translations запрещает ————————————————— */

test("типы: полнота и опечатки ловятся компилятором, а не глазами", () => {
  type Shape = { title: string; nested: { a: string; b: string }; list: string[] };
  const ru: Shape = { title: "т", nested: { a: "а", b: "б" }, list: ["1", "2"] };

  // Хорошо: частичный перевод и пустые заготовки.
  const ok: Translations<Shape> = { ru, kk: { nested: { a: "ә" } }, en: {} };
  assert.ok(ok);

  // @ts-expect-error — русский обязан быть полным
  const incompleteRu: Translations<Shape> = { ru: { title: "т" }, kk: {}, en: {} };
  // @ts-expect-error — у каждой локали должен быть ключ (пусть пустой)
  const missingLocale: Translations<Shape> = { ru, kk: {} };
  // @ts-expect-error — опечатка в ключе перевода не проходит
  const orphan: Translations<Shape> = { ru, kk: { titel: "x" }, en: {} };
  // @ts-expect-error — значение другого типа не проходит
  const wrongType: Translations<Shape> = { ru, kk: { title: 5 }, en: {} };

  void [incompleteRu, missingLocale, orphan, wrongType];
});

/* ——— resolve: наложение с откатом на русский ————————————————————— */

type Doc = { title: string; nested: { a: string; b: string }; list: string[] };

function doc(): Translations<Doc> {
  return {
    ru: { title: "заголовок", nested: { a: "а-ру", b: "б-ру" }, list: ["1-ру", "2-ру", "3-ру"] },
    kk: { title: "тақырып", nested: { a: "а-кк" } },
    en: {},
  };
}

test("resolve: русский — сам оригинал, без копии", () => {
  const t = doc();
  assert.equal(resolve(t, "ru"), t.ru);
});

test("resolve: переведённое берётся из локали, остальное — из русского", () => {
  const kk = resolve(doc(), "kk");
  assert.equal(kk.title, "тақырып");
  assert.equal(kk.nested.a, "а-кк");
  assert.equal(kk.nested.b, "б-ру", "не переведённое откатывается на русский");
});

test("resolve: пустая локаль целиком равна русскому", () => {
  assert.deepEqual(resolve(doc(), "en"), doc().ru);
});

test("resolve: массивы атомарны — берутся целиком или не берутся вовсе", () => {
  const t = doc();
  t.kk = { list: ["только один"] };
  assert.deepEqual(resolve(t, "kk").list, ["только один"]);
  assert.deepEqual(resolve(doc(), "kk").list, ["1-ру", "2-ру", "3-ру"]);
});

test("resolve: не портит русский оригинал и кэширует результат", () => {
  const t = doc();
  const before = structuredClone(t.ru);
  const first = resolve(t, "kk");
  first.nested.a = "испорчено потребителем";
  assert.deepEqual(t.ru, before, "оригинал не мутирует");
  assert.equal(resolve(t, "kk"), first, "тот же объект на тот же (таблица, локаль)");
});

test("resolve: порядок ключей у всех локалей — русский (по нему строятся списки)", () => {
  const t: Translations<Record<"x" | "y" | "z", string>> = {
    ru: { x: "1", y: "2", z: "3" },
    kk: { z: "з", x: "х" }, // порядок в переводе другой — на результат не влияет
    en: {},
  };
  assert.deepEqual(Object.keys(resolve(t, "kk")), ["x", "y", "z"]);
});

test("resolve: лишний ключ, которого нет в русском, не попадает в результат", () => {
  const t = doc();
  (t.kk as Record<string, unknown>).stray = "опечатка";
  assert.ok(!("stray" in resolve(t, "kk")));
});

/* ——— Локали ————————————————————————————————————————————————————— */

test("локали: ru | kk | en, источник и значение по умолчанию — русский", () => {
  assert.deepEqual([...LOCALES], ["ru", "kk", "en"]);
  assert.equal(SOURCE_LOCALE, "ru");
  assert.equal(DEFAULT_LOCALE, "ru");
  assert.ok(isLocale("kk"));
  for (const bad of ["", "RU", "de", null, undefined, 5, {}]) assert.ok(!isLocale(bad), String(bad));
});

/* ——— taxonomy: русский путь не изменился ———————————————————————— */

test("taxonomy: именованные экспорты — это taxonomyFor(DEFAULT_LOCALE)", () => {
  const ru = taxonomyFor(DEFAULT_LOCALE);
  assert.equal(taxonomy.FIELDS, ru.fields);
  assert.equal(taxonomy.COUNTRIES, ru.countries);
  assert.equal(taxonomy.LANGUAGES, ru.languages);
  assert.equal(taxonomy.TRACKS, ru.tracks);
  assert.equal(taxonomy.FACTOR_META, ru.factorMeta);
  assert.equal(taxonomy.BANDS, ru.bands);
  assert.equal(taxonomy.GRANT_LIKELIHOOD, ru.grantLikelihood);
  assert.equal(taxonomy.TASK_CATEGORIES, ru.taskCategories);
  assert.equal(taxonomy.PHASE_META, ru.phaseMeta);
  assert.equal(taxonomy.JOURNEY, ru.journey);
});

test("taxonomy: порядок списков в интерфейсе не изменился", () => {
  assert.deepEqual(taxonomy.FIELD_IDS.slice(0, 3), ["cs", "engineering", "business"]);
  assert.deepEqual(taxonomy.COUNTRY_IDS, ["KZ", "GB", "TR", "AE", "KR", "NL", "CZ", "PL", "HK", "MY"]);
  assert.deepEqual(taxonomy.JOURNEY.map((s) => s.id), [
    "intro", "profile", "diagnosis", "matches", "compare", "roadmap", "action",
  ]);
});

test("taxonomy: пока переводов нет, kk и en выглядят ровно как ru", () => {
  const ru = taxonomyFor("ru");
  for (const locale of ["kk", "en"] as Locale[]) {
    assert.deepEqual(taxonomyFor(locale), ru, locale);
  }
});

test("taxonomy: структура не зависит от языка — веса, токены, иконки, адреса", () => {
  const ru = taxonomyFor("ru");
  for (const locale of LOCALES) {
    const t = taxonomyFor(locale);
    for (const id of taxonomy.FACTOR_ORDER) {
      assert.equal(t.factorMeta[id].weight, ru.factorMeta[id].weight, `${locale}/${id}`);
    }
    for (const band of ["safe", "target", "reach"] as const) {
      assert.equal(t.bands[band].token, band);
    }
    assert.deepEqual(
      t.journey.map((s) => [s.id, s.index, s.href]),
      ru.journey.map((s) => [s.id, s.index, s.href]),
    );
    assert.deepEqual(
      Object.values(t.countries).map((c) => c.flag),
      Object.values(ru.countries).map((c) => c.flag),
    );
  }
});

test("taxonomy: веса факторов в сумме дают единицу", () => {
  const sum = taxonomy.FACTOR_ORDER.reduce((s, id) => s + taxonomy.FACTOR_META[id].weight, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `сумма весов ${sum}`);
});

test("taxonomy: результат кэшируется по локали", () => {
  assert.equal(taxonomyFor("kk"), taxonomyFor("kk"));
});

/* ——— Лендинг: образцовая таблица ————————————————————————————————— */

/** Листья дерева: путь → значение. Массивы — один лист (атомарны). */
function leaves(value: unknown, path = ""): [string, unknown][] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  }
  return [[path, value]];
}

/** Доля листьев русского, для которых есть собственный перевод. */
function coverage<T>(t: Translations<T>, locale: Locale): number {
  const all = leaves(t.ru).map(([p]) => p);
  const have = new Set(leaves(t[locale as Exclude<Locale, "ru">]).map(([p]) => p));
  return all.filter((p) => have.has(p)).length / all.length;
}

test("лендинг: русский полон — ни одной пустой строки", () => {
  const all = leaves(landing.ru);
  assert.ok(all.length > 20, `слишком мало ключей: ${all.length}`);
  for (const [path, value] of all) {
    if (Array.isArray(value)) {
      assert.ok(value.length > 0, path);
      for (const item of value) for (const [p, v] of leaves(item)) assert.ok(typeof v === "string" && v.trim(), `${path}.${p}`);
    } else {
      assert.ok(typeof value === "string" && value.trim().length > 0, path);
    }
  }
});

test("лендинг: пояснения есть для каждого шага пути (по id, а не по номеру)", () => {
  const ids = taxonomy.JOURNEY.map((s) => s.id).sort();
  assert.deepEqual(Object.keys(landing.ru.journey.blurbs).sort(), ids);
});

test("лендинг: у kk и en нет ключей, которых нет в русском (опечатки)", () => {
  const known = new Set(leaves(landing.ru).map(([p]) => p));
  for (const locale of ["kk", "en"] as const) {
    for (const [p] of leaves(landing[locale])) assert.ok(known.has(p), `${locale}: лишний ключ «${p}»`);
  }
});

test("лендинг: для любой локали каждая строка определена и непуста (откат работает)", () => {
  for (const locale of LOCALES) {
    for (const [path, value] of leaves(resolve(landing, locale))) {
      if (Array.isArray(value)) continue;
      assert.ok(typeof value === "string" && value.length > 0, `${locale}: ${path}`);
    }
  }
});

test("покрытие: сегодня переведён только русский; метрика растёт с переводом", () => {
  assert.equal(coverage(landing, "kk"), 0);
  assert.equal(coverage(landing, "en"), 0);

  const partial = doc();
  // kk: title + nested.a из 6 русских листьев (title, nested.a, nested.b, list — 1 атомарный)
  assert.equal(coverage(partial, "kk"), 2 / 4);
  assert.equal(coverage(partial, "en"), 0);
});
