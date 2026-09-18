import type {
  CountryId,
  FactorId,
  FieldId,
  GrantLikelihood,
  JourneyStep,
  LanguageId,
  TaskCategory,
  TrackId,
} from "./types";

/* ——— Направления ————————————————————————————————————————————————— */

export const FIELDS: Record<FieldId, { label: string; hint: string }> = {
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
};

export const FIELD_IDS = Object.keys(FIELDS) as FieldId[];

/* ——— Страны ——————————————————————————————————————————————————————— */

export const COUNTRIES: Record<
  CountryId,
  { label: string; flag: string; note: string }
> = {
  KZ: { label: "Казахстан", flag: "KZ", note: "дом, гранты, ЕНТ" },
  GB: { label: "Великобритания", flag: "GB", note: "UCAS, высокая стоимость" },
  TR: { label: "Турция", flag: "TR", note: "доступно, много англоязычных" },
  AE: { label: "ОАЭ", flag: "AE", note: "щедрые стипендии, близко" },
  KR: { label: "Южная Корея", flag: "KR", note: "сильный инженерный трек" },
  NL: { label: "Нидерланды", flag: "NL", note: "англоязычные бакалавриаты" },
  CZ: { label: "Чехия", flag: "CZ", note: "низкая стоимость жизни" },
  PL: { label: "Польша", flag: "PL", note: "доступный вход в ЕС" },
  HK: { label: "Гонконг", flag: "HK", note: "сильные азиатские вузы" },
  MY: { label: "Малайзия", flag: "MY", note: "недорого, англоязычно" },
};

export const COUNTRY_IDS = Object.keys(COUNTRIES) as CountryId[];

/* ——— Языки обучения —————————————————————————————————————————————— */

export const LANGUAGES: Record<LanguageId, string> = {
  kk: "Казахский",
  ru: "Русский",
  en: "Английский",
  tr: "Турецкий",
};

/* ——— Учебные треки ——————————————————————————————————————————————— */

export const TRACKS: Record<TrackId, { label: string; hint: string }> = {
  IB: { label: "IB Diploma", hint: "предсказанные баллы 24–45" },
  NIS: { label: "НИШ / профильная школа", hint: "внутренняя система оценок" },
  national: { label: "Общеобразовательная школа", hint: "аттестат и ЕНТ" },
  AP: { label: "AP / американская программа", hint: "AP-экзамены и GPA" },
  other: { label: "Другое", hint: "опишем через средний балл" },
};

/* ——— Факторы скоринга ———————————————————————————————————————————— */

export const FACTOR_META: Record<
  FactorId,
  { label: string; weight: number; about: string }
> = {
  field: {
    label: "Направление",
    weight: 0.22,
    about: "Насколько программа отвечает выбранным интересам",
  },
  academic: {
    label: "Академика",
    weight: 0.2,
    about: "Ваши баллы против опубликованных требований",
  },
  budget: {
    label: "Бюджет",
    weight: 0.18,
    about: "Стоимость года против вашего потолка с учётом стипендий",
  },
  language: {
    label: "Язык",
    weight: 0.14,
    about: "Языковые требования против текущего уровня и тестов",
  },
  geography: {
    label: "География",
    weight: 0.12,
    about: "Страна и близость к дому",
  },
  timeline: {
    label: "Сроки",
    weight: 0.08,
    about: "Успеваете ли подготовиться к дедлайну подачи",
  },
  lifestyle: {
    label: "Условия",
    weight: 0.06,
    about: "Общежитие, размер кампуса, формат жизни",
  },
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

export const BANDS = {
  safe: {
    label: "Надёжный",
    description:
      "Ваши показатели заметно выше опубликованного минимума программы.",
    token: "safe",
  },
  target: {
    label: "Целевой",
    description: "Показатели примерно на уровне опубликованных требований.",
    token: "target",
  },
  reach: {
    label: "Амбициозный",
    description:
      "Потребуется заметный рост показателей или сильная внеучебная часть.",
    token: "reach",
  },
} as const;

/* ——— Допуск к грантовому конкурсу ———————————————————————————————— */

/**
 * Формулировки намеренно про ДОПУСК, а не про получение гранта: порог даёт
 * право участвовать в конкурсе, исход конкурса им не определяется.
 */
export const GRANT_LIKELIHOOD: Record<
  GrantLikelihood,
  { label: string; description: string; token: "safe" | "target" | "reach" }
> = {
  reliable: {
    label: "надёжно",
    description:
      "Балл заметно выше порога: допуск к конкурсу не под вопросом. Сам грант разыгрывается между всеми допущенными.",
    token: "safe",
  },
  competitive: {
    label: "конкурентно",
    description:
      "Балл у самого порога: к конкурсу допускают, но запаса нет — каждый дополнительный балл меняет позицию.",
    token: "target",
  },
  unlikely: {
    label: "маловероятно",
    description:
      "Балл ниже порога: к конкурсу на грант по этому направлению не допускают.",
    token: "reach",
  },
};

/* ——— Категории задач roadmap ————————————————————————————————————— */

export const TASK_CATEGORIES: Record<
  TaskCategory,
  { label: string; icon: string }
> = {
  exam: { label: "Экзамен", icon: "exam" },
  document: { label: "Документы", icon: "document" },
  essay: { label: "Эссе", icon: "essay" },
  activity: { label: "Активности", icon: "activity" },
  admin: { label: "Подача", icon: "admin" },
  research: { label: "Исследование", icon: "research" },
};

export const PHASE_META = {
  now: { label: "Сейчас", hint: "ближайшие 30 дней" },
  soon: { label: "Скоро", hint: "1–4 месяца" },
  later: { label: "Дальше", hint: "больше 4 месяцев" },
} as const;

/* ——— Шаги пути ——————————————————————————————————————————————————— */

export const JOURNEY: JourneyStep[] = [
  { id: "intro", index: 1, title: "Знакомство", short: "Старт", href: "/" },
  { id: "profile", index: 2, title: "Профиль", short: "Анкета", href: "/profile" },
  {
    id: "diagnosis",
    index: 3,
    title: "Диагностика",
    short: "Разбор",
    href: "/diagnosis",
  },
  {
    id: "matches",
    index: 4,
    title: "Рекомендации",
    short: "Подбор",
    href: "/matches",
  },
  {
    id: "compare",
    index: 5,
    title: "Сравнение",
    short: "Сравнить",
    href: "/compare",
  },
  { id: "roadmap", index: 6, title: "Маршрут", short: "План", href: "/roadmap" },
  {
    id: "action",
    index: 7,
    title: "Следующий шаг",
    short: "Действие",
    href: "/roadmap#next",
  },
];
