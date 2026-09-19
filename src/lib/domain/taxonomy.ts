import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";
import { resolve, type Translations } from "@/lib/i18n/translations";
import type {
  AdmissionBand,
  CountryId,
  FactorId,
  FieldId,
  GrantLikelihood,
  JourneyStep,
  LanguageId,
  RoadmapPhase,
  StepId,
  TaskCategory,
  TrackId,
} from "./types";

/* ============================================================================
   СПРАВОЧНИКИ

   Каждый справочник разложен на две части, и граница между ними — главное
   решение этого файла:

     СТРУКТУРА — то, что не язык: веса факторов, токены цветов, иконки, коды
                 флагов, ссылки шагов, порядок. Одна на все локали, лежит
                 в *_STRUCTURE. Переводчик до неё не дотягивается — и не
                 сможет «случайно» поменять вес фактора при правке подписи.
     ТЕКСТ     — подписи и пояснения. Лежит в *_TEXT типом Translations<…>:
                 русский полный, остальные локали частичные (см. i18n/).

   taxonomyFor(locale) склеивает обе части. Именованные экспорты ниже
   (FIELDS, COUNTRIES, …) — это taxonomyFor(DEFAULT_LOCALE): все существующие
   потребители продолжают читать русский вариант, ни один импорт не менялся.
   Новый код, которому нужен язык, зовёт taxonomyFor(locale).

   Порядок ключей у всех локалей одинаков и задан русской таблицей: по нему
   строятся списки в интерфейсе (FIELD_IDS, COUNTRY_IDS).
   ========================================================================= */

/* ——— Направления ————————————————————————————————————————————————— */

const FIELD_TEXT: Translations<Record<FieldId, { label: string; hint: string }>> = {
  ru: {
    cs: { label: "Computer Science и данные", hint: "разработка, AI, аналитика" },
    engineering: {
      label: "Инженерия",
      hint: "робототехника, энергетика, строительство",
    },
    business: { label: "Бизнес и менеджмент", hint: "управление, маркетинг" },
    economics: { label: "Экономика и финансы", hint: "финансы, эконометрика" },
    law: { label: "Право", hint: "юриспруденция, международное право" },
    medicine: { label: "Медицина и здоровье", hint: "лечебное дело, биомед" },
    "natural-sciences": {
      label: "Естественные науки",
      hint: "физика, химия, биология",
    },
    "social-sciences": {
      label: "Социальные науки",
      hint: "политология, психология, IR",
    },
    design: { label: "Дизайн и архитектура", hint: "визуальный дизайн, urban" },
    education: { label: "Образование", hint: "педагогика, методика" },
    media: { label: "Медиа и коммуникации", hint: "журналистика, PR" },
  },
  kk: {},
  en: {},
};

/* ——— Страны ——————————————————————————————————————————————————————— */

const COUNTRY_STRUCTURE: Record<CountryId, { flag: string }> = {
  KZ: { flag: "KZ" },
  GB: { flag: "GB" },
  TR: { flag: "TR" },
  AE: { flag: "AE" },
  KR: { flag: "KR" },
  NL: { flag: "NL" },
  CZ: { flag: "CZ" },
  PL: { flag: "PL" },
  HK: { flag: "HK" },
  MY: { flag: "MY" },
};

const COUNTRY_TEXT: Translations<Record<CountryId, { label: string; note: string }>> = {
  ru: {
    KZ: { label: "Казахстан", note: "дом, гранты, ЕНТ" },
    GB: { label: "Великобритания", note: "UCAS, высокая стоимость" },
    TR: { label: "Турция", note: "доступно, много англоязычных" },
    AE: { label: "ОАЭ", note: "щедрые стипендии, близко" },
    KR: { label: "Южная Корея", note: "сильный инженерный трек" },
    NL: { label: "Нидерланды", note: "англоязычные бакалавриаты" },
    CZ: { label: "Чехия", note: "низкая стоимость жизни" },
    PL: { label: "Польша", note: "доступный вход в ЕС" },
    HK: { label: "Гонконг", note: "сильные азиатские вузы" },
    MY: { label: "Малайзия", note: "недорого, англоязычно" },
  },
  kk: {},
  en: {},
};

/* ——— Языки обучения —————————————————————————————————————————————— */

const LANGUAGE_TEXT: Translations<Record<LanguageId, string>> = {
  ru: {
    kk: "Казахский",
    ru: "Русский",
    en: "Английский",
    tr: "Турецкий",
  },
  kk: {},
  en: {},
};

/* ——— Учебные треки ——————————————————————————————————————————————— */

const TRACK_TEXT: Translations<Record<TrackId, { label: string; hint: string }>> = {
  ru: {
    IB: { label: "IB Diploma", hint: "предсказанные баллы 24–45" },
    NIS: { label: "НИШ / профильная школа", hint: "внутренняя система оценок" },
    national: { label: "Общеобразовательная школа", hint: "аттестат и ЕНТ" },
    AP: { label: "AP / американская программа", hint: "AP-экзамены и GPA" },
    other: { label: "Другое", hint: "опишем через средний балл" },
  },
  kk: {},
  en: {},
};

/* ——— Факторы скоринга ———————————————————————————————————————————— */

/** Веса — часть алгоритма, а не текста: сумма обязана быть равна единице. */
const FACTOR_STRUCTURE: Record<FactorId, { weight: number }> = {
  field: { weight: 0.22 },
  academic: { weight: 0.2 },
  budget: { weight: 0.18 },
  language: { weight: 0.14 },
  geography: { weight: 0.12 },
  timeline: { weight: 0.08 },
  lifestyle: { weight: 0.06 },
};

const FACTOR_TEXT: Translations<Record<FactorId, { label: string; about: string }>> = {
  ru: {
    field: {
      label: "Направление",
      about: "Насколько программа отвечает выбранным интересам",
    },
    academic: {
      label: "Академика",
      about: "Ваши баллы против опубликованных требований",
    },
    budget: {
      label: "Бюджет",
      about: "Стоимость года против вашего потолка с учётом стипендий",
    },
    language: {
      label: "Язык",
      about: "Языковые требования против текущего уровня и тестов",
    },
    geography: {
      label: "География",
      about: "Страна и близость к дому",
    },
    timeline: {
      label: "Сроки",
      about: "Успеваете ли подготовиться к дедлайну подачи",
    },
    lifestyle: {
      label: "Условия",
      about: "Общежитие, размер кампуса, формат жизни",
    },
  },
  kk: {},
  en: {},
};

export const FACTOR_ORDER: FactorId[] = [
  "field",
  "academic",
  "budget",
  "language",
  "geography",
  "timeline",
  "lifestyle",
];

/* ——— Полосы поступления —————————————————————————————————————————— */

const BAND_STRUCTURE: Record<AdmissionBand, { token: AdmissionBand }> = {
  safe: { token: "safe" },
  target: { token: "target" },
  reach: { token: "reach" },
};

const BAND_TEXT: Translations<Record<AdmissionBand, { label: string; description: string }>> = {
  ru: {
    safe: {
      label: "Надёжный",
      description:
        "Ваши показатели заметно выше опубликованного минимума программы.",
    },
    target: {
      label: "Целевой",
      description: "Показатели примерно на уровне опубликованных требований.",
    },
    reach: {
      label: "Амбициозный",
      description:
        "Потребуется заметный рост показателей или сильная внеучебная часть.",
    },
  },
  kk: {},
  en: {},
};

/* ——— Допуск к грантовому конкурсу ———————————————————————————————— */

const GRANT_STRUCTURE: Record<GrantLikelihood, { token: "safe" | "target" | "reach" }> = {
  reliable: { token: "safe" },
  competitive: { token: "target" },
  unlikely: { token: "reach" },
};

/**
 * Формулировки намеренно про ДОПУСК, а не про получение гранта: порог даёт
 * право участвовать в конкурсе, исход конкурса им не определяется. Перевод
 * обязан сохранить это различие.
 */
const GRANT_TEXT: Translations<Record<GrantLikelihood, { label: string; description: string }>> = {
  ru: {
    reliable: {
      label: "надёжно",
      description:
        "Балл заметно выше порога: допуск к конкурсу не под вопросом. Сам грант разыгрывается между всеми допущенными.",
    },
    competitive: {
      label: "конкурентно",
      description:
        "Балл у самого порога: к конкурсу допускают, но запаса нет — каждый дополнительный балл меняет позицию.",
    },
    unlikely: {
      label: "маловероятно",
      description:
        "Балл ниже порога: к конкурсу на грант по этому направлению не допускают.",
    },
  },
  kk: {},
  en: {},
};

/* ——— Категории задач roadmap ————————————————————————————————————— */

const TASK_STRUCTURE: Record<TaskCategory, { icon: string }> = {
  exam: { icon: "exam" },
  document: { icon: "document" },
  essay: { icon: "essay" },
  activity: { icon: "activity" },
  admin: { icon: "admin" },
  research: { icon: "research" },
};

const TASK_TEXT: Translations<Record<TaskCategory, { label: string }>> = {
  ru: {
    exam: { label: "Экзамен" },
    document: { label: "Документы" },
    essay: { label: "Эссе" },
    activity: { label: "Активности" },
    admin: { label: "Подача" },
    research: { label: "Исследование" },
  },
  kk: {},
  en: {},
};

const PHASE_TEXT: Translations<Record<RoadmapPhase, { label: string; hint: string }>> = {
  ru: {
    now: { label: "Сейчас", hint: "ближайшие 30 дней" },
    soon: { label: "Скоро", hint: "1–4 месяца" },
    later: { label: "Дальше", hint: "больше 4 месяцев" },
  },
  kk: {},
  en: {},
};

/* ——— Шаги пути ——————————————————————————————————————————————————— */

/** Порядок, номера и адреса — структура: язык интерфейса не меняет маршрут. */
const JOURNEY_STRUCTURE: readonly { id: StepId; index: number; href: string }[] = [
  { id: "intro", index: 1, href: "/" },
  { id: "profile", index: 2, href: "/profile" },
  { id: "diagnosis", index: 3, href: "/diagnosis" },
  { id: "matches", index: 4, href: "/matches" },
  { id: "compare", index: 5, href: "/compare" },
  { id: "roadmap", index: 6, href: "/roadmap" },
  { id: "action", index: 7, href: "/roadmap#next" },
];

const JOURNEY_TEXT: Translations<Record<StepId, { title: string; short: string }>> = {
  ru: {
    intro: { title: "Знакомство", short: "Старт" },
    profile: { title: "Профиль", short: "Анкета" },
    diagnosis: { title: "Диагностика", short: "Разбор" },
    matches: { title: "Рекомендации", short: "Подбор" },
    compare: { title: "Сравнение", short: "Сравнить" },
    roadmap: { title: "Маршрут", short: "План" },
    action: { title: "Следующий шаг", short: "Действие" },
  },
  kk: {},
  en: {},
};

/* ——— Сборка по локали ———————————————————————————————————————————— */

/** Склеивает структуру с текстом. Порядок ключей задаёт структура. */
function join<K extends string, S extends object, T extends object>(
  structure: Record<K, S>,
  text: Record<K, T>,
): Record<K, S & T> {
  const out = {} as Record<K, S & T>;
  for (const key of Object.keys(structure) as K[]) {
    out[key] = { ...structure[key], ...text[key] };
  }
  return out;
}

export interface Taxonomy {
  fields: Record<FieldId, { label: string; hint: string }>;
  countries: Record<CountryId, { label: string; flag: string; note: string }>;
  languages: Record<LanguageId, string>;
  tracks: Record<TrackId, { label: string; hint: string }>;
  factorMeta: Record<FactorId, { label: string; weight: number; about: string }>;
  bands: Record<AdmissionBand, { label: string; description: string; token: AdmissionBand }>;
  grantLikelihood: Record<
    GrantLikelihood,
    { label: string; description: string; token: "safe" | "target" | "reach" }
  >;
  taskCategories: Record<TaskCategory, { label: string; icon: string }>;
  phaseMeta: Record<RoadmapPhase, { label: string; hint: string }>;
  journey: JourneyStep[];
}

const taxonomyCache = new Map<Locale, Taxonomy>();

/**
 * Все справочники для одной локали. Русский — полный; для остальных то, что
 * ещё не переведено, берётся из русского (см. Translations). Результат
 * кэшируется, вызывать можно на каждом рендере.
 */
export function taxonomyFor(locale: Locale): Taxonomy {
  const cached = taxonomyCache.get(locale);
  if (cached) return cached;

  const journeyText = resolve(JOURNEY_TEXT, locale);
  const taxonomy: Taxonomy = {
    fields: resolve(FIELD_TEXT, locale),
    countries: join(COUNTRY_STRUCTURE, resolve(COUNTRY_TEXT, locale)),
    languages: resolve(LANGUAGE_TEXT, locale),
    tracks: resolve(TRACK_TEXT, locale),
    factorMeta: join(FACTOR_STRUCTURE, resolve(FACTOR_TEXT, locale)),
    bands: join(BAND_STRUCTURE, resolve(BAND_TEXT, locale)),
    grantLikelihood: join(GRANT_STRUCTURE, resolve(GRANT_TEXT, locale)),
    taskCategories: join(TASK_STRUCTURE, resolve(TASK_TEXT, locale)),
    phaseMeta: resolve(PHASE_TEXT, locale),
    journey: JOURNEY_STRUCTURE.map((step) => ({ ...step, ...journeyText[step.id] })),
  };

  taxonomyCache.set(locale, taxonomy);
  return taxonomy;
}

/* ——— Именованные экспорты: русский вариант ——————————————————————— */

const DEFAULT = taxonomyFor(DEFAULT_LOCALE);

export const FIELDS = DEFAULT.fields;
export const FIELD_IDS = Object.keys(FIELDS) as FieldId[];

export const COUNTRIES = DEFAULT.countries;
export const COUNTRY_IDS = Object.keys(COUNTRIES) as CountryId[];

export const LANGUAGES = DEFAULT.languages;
export const TRACKS = DEFAULT.tracks;
export const FACTOR_META = DEFAULT.factorMeta;
export const BANDS = DEFAULT.bands;
export const GRANT_LIKELIHOOD = DEFAULT.grantLikelihood;
export const TASK_CATEGORIES = DEFAULT.taskCategories;
export const PHASE_META = DEFAULT.phaseMeta;
export const JOURNEY = DEFAULT.journey;
