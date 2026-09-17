/* ============================================================================
   Доменные типы Bagyt.
   Единственный источник правды по форме данных: и API-роуты, и UI, и движок
   скоринга импортируют типы отсюда.
   ========================================================================= */

/* ——— Справочники ————————————————————————————————————————————————— */

export type FieldId =
  | "cs"
  | "engineering"
  | "business"
  | "economics"
  | "law"
  | "medicine"
  | "natural-sciences"
  | "social-sciences"
  | "design"
  | "education"
  | "media";

export type CountryId =
  | "KZ"
  | "GB"
  | "TR"
  | "AE"
  | "KR"
  | "NL"
  | "CZ"
  | "PL"
  | "HK"
  | "MY";

export type LanguageId = "kk" | "ru" | "en" | "tr";

export type TrackId = "IB" | "NIS" | "national" | "AP" | "other";

/** Учебный трек влияет на то, какие поля анкеты вообще показываем. */
export type ExamId = "IELTS" | "TOEFL" | "SAT" | "ENT" | "IB" | "SCHOOL_GPA";

/* ——— Профиль пользователя ————————————————————————————————————————— */

export interface AcademicSnapshot {
  /** Средний балл по школе в 5-балльной или 100-балльной шкале (нормализуем). */
  gpaBand: "top" | "high" | "mid" | "developing" | "unknown";
  /** Предсказанные баллы IB (24–45). */
  predictedIB?: number;
  /** Балл ЕНТ (0–140). */
  entScore?: number;
  /** Балл SAT (400–1600). */
  satScore?: number;
  strongSubjects: string[];
}

export interface LanguageSnapshot {
  ielts?: number;
  toefl?: number;
  /** Самооценка английского, если теста ещё нет. */
  englishSelf: "none" | "basic" | "intermediate" | "advanced";
  kazakh: "none" | "basic" | "fluent";
  russian: "none" | "basic" | "fluent";
}

export interface BudgetSnapshot {
  /** Потолок на обучение в год, USD. */
  annualTuitionUSD: number;
  /** Нужна ли стипендия/грант, чтобы вариант был реальным. */
  needsFunding: boolean;
  /** Готовность платить за проживание отдельно. */
  livingCoveredUSD: number;
}

export interface PreferenceSnapshot {
  countries: CountryId[];
  fields: FieldId[];
  instructionLanguages: LanguageId[];
  /** Хочет остаться ближе к дому. */
  preferCloseToHome: boolean;
  needsDorm: boolean;
  campusPreference: "big" | "compact" | "any";
}

export interface Profile {
  /** Служебное: версия схемы, чтобы persisted-стейт не ломался. */
  version: 1;
  grade: 9 | 10 | 11 | 12;
  track: TrackId;
  intakeYear: number;
  academics: AcademicSnapshot;
  languages: LanguageSnapshot;
  budget: BudgetSnapshot;
  preferences: PreferenceSnapshot;
  /** Свободный текст: «что для меня важно» — идёт в LLM-нарратив. */
  note?: string;
}

/* ——— Каталог программ ————————————————————————————————————————————— */

/** Честность данных — требование кейса: показываем происхождение каждого факта. */
export type DataConfidence = "verified" | "demo";

export interface SourceRef {
  label: string;
  url: string;
  /** Когда значение было зафиксировано составителем каталога. */
  checkedOn: string;
}

export interface ProgramRequirements {
  /** Минимальные баллы IB, если программа их публикует. */
  ibPoints?: number;
  satScore?: number;
  entScore?: number;
  ielts?: number;
  toefl?: number;
  /** Предметы, которые обычно ожидают на высоком уровне. */
  expectedSubjects?: string[];
}

export interface ProgramCosts {
  tuitionUSDPerYear: number;
  livingUSDPerYear: number;
  /** Есть ли стипендии, покрывающие существенную часть. */
  fundingAvailable: boolean;
  fundingNote?: string;
}

export interface Program {
  id: string;
  university: string;
  universityShort: string;
  country: CountryId;
  city: string;
  program: string;
  field: FieldId;
  /** Дополнительные направления, которым программа тоже отвечает. */
  secondaryFields: FieldId[];
  degree: "bachelor";
  instructionLanguage: LanguageId[];
  durationYears: number;
  requirements: ProgramRequirements;
  costs: ProgramCosts;
  /** Месяц подачи (1–12) — из него выводим дедлайны roadmap. */
  applicationDeadlineMonth: number;
  applicationDeadlineNote: string;
  intakeMonth: number;
  campusSize: "big" | "compact";
  dormGuaranteed: boolean;
  /** Грубая полоса известности, не точный рейтинг: избегаем ложной точности. */
  reputationBand: "global-top" | "strong" | "regional";
  highlights: string[];
  source: SourceRef;
  dataConfidence: DataConfidence;
}

/* ——— Результат скоринга ——————————————————————————————————————————— */

export type FactorId =
  | "field"
  | "academic"
  | "budget"
  | "language"
  | "geography"
  | "timeline"
  | "lifestyle";

export type FactorStatus = "strong" | "ok" | "weak";

export interface FactorScore {
  id: FactorId;
  label: string;
  /** 0..1 — нормализованная оценка фактора. */
  score: number;
  weight: number;
  status: FactorStatus;
  /** Человеческое объяснение, которое показываем прямо в карточке. */
  detail: string;
}

/**
 * Полоса поступления. Сознательно категориальная, а не вероятность в процентах:
 * кейс запрещает показывать вымышленную точность и гарантии.
 */
export type AdmissionBand = "safe" | "target" | "reach";

export interface MatchResult {
  program: Program;
  /** 0..100, сумма взвешенных факторов. */
  score: number;
  band: AdmissionBand;
  factors: FactorScore[];
  /** Короткая выжимка «почему подходит» — 2–3 сильнейших фактора. */
  reasons: string[];
  /** Что мешает / на что обратить внимание. */
  watchouts: string[];
  /** Жёсткие несовпадения — программа показывается, но помечается. */
  blockers: string[];
}

/* ——— Диагностика профиля —————————————————————————————————————————— */

export interface DiagnosisItem {
  title: string;
  detail: string;
}

export interface Diagnosis {
  /** Одно предложение: кто этот абитуриент и куда он идёт. */
  headline: string;
  summary: string;
  strengths: DiagnosisItem[];
  gaps: DiagnosisItem[];
  /** Наиболее вероятная образовательная цель по ответам. */
  goal: string;
  /** Чем сгенерировано: важно показывать честно. */
  generatedBy: "llm" | "rules";
}

/* ——— Roadmap ————————————————————————————————————————————————————— */

export type TaskCategory =
  | "exam"
  | "document"
  | "essay"
  | "activity"
  | "admin"
  | "research";

export type RoadmapPhase = "now" | "soon" | "later";

export interface RoadmapTask {
  id: string;
  title: string;
  /** Почему этот шаг вообще в плане — привязка к профилю. */
  why: string;
  category: TaskCategory;
  phase: RoadmapPhase;
  /** ISO-дата ориентира или null, если шаг без жёсткого срока. */
  dueDate: string | null;
  dueLabel: string;
  /** Оценка усилий в часах — грубая, помечается как ориентир. */
  effortHours: number;
  source?: SourceRef;
  dataConfidence: DataConfidence;
}

export interface Roadmap {
  programId: string;
  programTitle: string;
  generatedAt: string;
  tasks: RoadmapTask[];
  generatedBy: "llm" | "rules";
}

/* ——— Состояние прохождения пути ——————————————————————————————————— */

export type StepId =
  | "intro"
  | "profile"
  | "diagnosis"
  | "matches"
  | "compare"
  | "roadmap"
  | "action";

export interface JourneyStep {
  id: StepId;
  index: number;
  title: string;
  short: string;
  href: string;
}
