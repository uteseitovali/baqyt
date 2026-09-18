import { monthsUntilDeadline } from "./scoring";
import type {
  Profile,
  Program,
  Roadmap,
  RoadmapPhase,
  RoadmapTask,
  TaskCategory,
} from "./types";

/* ============================================================================
   ГЕНЕРАТОР МАРШРУТА

   План строится обратным ходом от опубликованного окна подачи программы:
   каждая задача получает ориентировочный срок «дедлайн минус N месяцев».
   Сроки помечаются как ориентиры, а не как официальные даты вуза — кейс прямо
   запрещает показывать неподтверждённые дедлайны как факт.
   ========================================================================= */

interface TaskSeed {
  key: string;
  title: string;
  why: string;
  category: TaskCategory;
  /** За сколько месяцев до дедлайна подачи задача должна быть закрыта. */
  leadMonths: number;
  effortHours: number;
  /** Условие включения задачи в план. */
  when: (p: Profile, pr: Program) => boolean;
}

const always = () => true;

const SEEDS: TaskSeed[] = [
  /* ——— Исследование ——————————————————————————————————————————— */
  {
    key: "verify-requirements",
    title: "Сверить требования на официальном сайте программы",
    why: "Каталог Bagyt — ориентир. Перед подачей требования и суммы нужно подтвердить первоисточником.",
    category: "research",
    leadMonths: 0.5,
    effortHours: 1,
    when: always,
  },
  {
    key: "contact-admissions",
    title: "Написать в приёмную комиссию уточняющий вопрос",
    why: "Живой ответ приёмной комиссии снимает неопределённость по документам и признанию вашего аттестата.",
    category: "research",
    leadMonths: 4,
    effortHours: 1,
    when: (_p, pr) => pr.country !== "KZ",
  },

  /* ——— Экзамены ——————————————————————————————————————————————— */
  {
    key: "ielts-register",
    title: "Зарегистрироваться на IELTS",
    why: "Программа требует официальный языковой результат, а слоты на удобные даты разбирают заранее.",
    category: "exam",
    leadMonths: 5,
    effortHours: 1,
    when: (p, pr) =>
      Boolean(pr.requirements.ielts) && !p.languages.ielts && !p.languages.toefl,
  },
  {
    key: "ielts-prep",
    title: "Пройти интенсивную подготовку к IELTS",
    why: "Разрыв между текущим уровнем и требуемым баллом закрывается регулярной практикой, а не разовой подготовкой.",
    category: "exam",
    leadMonths: 4,
    effortHours: 60,
    when: (p, pr) =>
      Boolean(pr.requirements.ielts) && !p.languages.ielts && !p.languages.toefl,
  },
  {
    key: "ielts-take",
    title: "Сдать IELTS и получить результат",
    why: "Без официального сертификата зарубежная заявка не принимается к рассмотрению.",
    category: "exam",
    leadMonths: 3,
    effortHours: 4,
    when: (p, pr) =>
      Boolean(pr.requirements.ielts) && !p.languages.ielts && !p.languages.toefl,
  },
  {
    key: "ielts-retake",
    title: "Пересдать IELTS для повышения балла",
    why: "Текущий результат ниже требования программы — пересдача открывает этот и соседние варианты.",
    category: "exam",
    leadMonths: 4,
    effortHours: 40,
    when: (p, pr) =>
      Boolean(pr.requirements.ielts) &&
      Boolean(p.languages.ielts) &&
      (p.languages.ielts ?? 0) < (pr.requirements.ielts ?? 0),
  },
  {
    key: "sat-take",
    title: "Сдать SAT",
    why: "Программа учитывает SAT при отборе, а результат идёт к вузу несколько недель.",
    category: "exam",
    leadMonths: 4,
    effortHours: 70,
    when: (p, pr) => Boolean(pr.requirements.satScore) && !p.academics.satScore,
  },
  {
    key: "ent-register",
    title: "Подать заявление на ЕНТ",
    why: "Для казахстанских вузов и грантового конкурса ЕНТ обязателен, регистрация идёт по расписанию НЦТ.",
    category: "exam",
    leadMonths: 4,
    effortHours: 2,
    when: (p, pr) => pr.country === "KZ" && !p.academics.entScore,
  },
  {
    key: "ent-prep",
    title: "Готовиться к ЕНТ по профильным предметам",
    why: "Балл ЕНТ напрямую определяет и поступление, и шанс на грант.",
    category: "exam",
    leadMonths: 3,
    effortHours: 80,
    when: (p, pr) => pr.country === "KZ" && !p.academics.entScore,
  },

  /* ——— Документы ——————————————————————————————————————————————— */
  {
    key: "transcript",
    title: "Запросить транскрипт и справку об обучении",
    why: "Школьные документы готовятся не мгновенно, а без них заявка неполная.",
    category: "document",
    leadMonths: 2.5,
    effortHours: 2,
    when: always,
  },
  {
    key: "translate-docs",
    title: "Перевести и нотариально заверить документы",
    why: "Зарубежные вузы принимают документы на английском с заверением перевода.",
    category: "document",
    leadMonths: 2,
    effortHours: 4,
    when: (_p, pr) => pr.country !== "KZ",
  },
  {
    key: "passport",
    title: "Проверить срок действия загранпаспорта",
    why: "Паспорт должен действовать на всю продолжительность обучения — продление занимает недели.",
    category: "document",
    leadMonths: 5,
    effortHours: 2,
    when: (_p, pr) => pr.country !== "KZ",
  },
  {
    key: "recommendations",
    title: "Договориться о двух рекомендательных письмах",
    why: "Учителям нужно время на содержательное письмо; за неделю до дедлайна качественного письма не получить.",
    category: "document",
    leadMonths: 3,
    effortHours: 3,
    when: (_p, pr) => pr.country !== "KZ" || pr.reputationBand !== "regional",
  },

  /* ——— Эссе ————————————————————————————————————————————————————— */
  {
    key: "essay-draft",
    title: "Написать первый черновик мотивационного эссе",
    why: "Эссе — единственная часть заявки, где ваши профильные предметы и проекты становятся связной историей.",
    category: "essay",
    leadMonths: 3,
    effortHours: 12,
    when: always,
  },
  {
    key: "essay-final",
    title: "Довести эссе до финальной версии с внешней вычиткой",
    why: "Сильное эссе проходит минимум три итерации и чужой взгляд.",
    category: "essay",
    leadMonths: 1.5,
    effortHours: 8,
    when: always,
  },

  /* ——— Активности ——————————————————————————————————————————————— */
  {
    key: "activity-project",
    title: "Довести до результата один профильный проект",
    why: "Конкурс, исследование или собственный проект по направлению весит больше, чем длинный список кружков.",
    category: "activity",
    leadMonths: 5,
    effortHours: 40,
    when: (p) => p.grade <= 11,
  },
  {
    key: "activity-cv",
    title: "Собрать список достижений и активностей",
    why: "Структурированный перечень понадобится и для заявки, и для стипендиальных конкурсов.",
    category: "activity",
    leadMonths: 2.5,
    effortHours: 3,
    when: always,
  },

  /* ——— Подача ——————————————————————————————————————————————————— */
  {
    key: "scholarship-apply",
    title: "Подать заявку на стипендию или грант",
    why: "Вы отметили, что без финансирования вариант нереален, а стипендиальные дедлайны обычно раньше основных.",
    category: "admin",
    leadMonths: 1.5,
    effortHours: 8,
    when: (p, pr) => p.budget.needsFunding && pr.costs.fundingAvailable,
  },
  {
    key: "application-submit",
    title: "Подать основную заявку",
    why: "Финальный шаг цикла: после дедлайна изменить заявку уже нельзя.",
    category: "admin",
    leadMonths: 0,
    effortHours: 4,
    when: always,
  },
];

/* ——— Вспомогательное ———————————————————————————————————————————— */

function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  const whole = Math.trunc(months);
  const frac = months - whole;
  d.setMonth(d.getMonth() + whole);
  if (frac) d.setDate(d.getDate() + Math.round(frac * 30));
  return d;
}

function deadlineDate(program: Program, intakeYear: number): Date {
  const deadlineYear =
    program.applicationDeadlineMonth > program.intakeMonth
      ? intakeYear - 1
      : intakeYear;
  return new Date(deadlineYear, program.applicationDeadlineMonth - 1, 15);
}

function phaseOf(due: Date, now: Date): RoadmapPhase {
  const days = (due.getTime() - now.getTime()) / 86_400_000;
  if (days <= 30) return "now";
  if (days <= 120) return "soon";
  return "later";
}

/** Родительный падеж — для формы «до 15 марта». */
const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

/** Именительный падеж — для формы «март 2027». */
const MONTHS_NOMINATIVE = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

function labelFor(due: Date, now: Date): string {
  const days = Math.round((due.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return "срок прошёл";
  if (days <= 14) return `до ${due.getDate()} ${MONTHS_GENITIVE[due.getMonth()]}`;
  return `${MONTHS_NOMINATIVE[due.getMonth()]} ${due.getFullYear()}`;
}

/* ——— Генерация ——————————————————————————————————————————————————— */

/** Строит персональный план под конкретную программу. */
export function buildRoadmap(
  profile: Profile,
  program: Program,
  now = new Date(),
): Roadmap {
  const deadline = deadlineDate(program, profile.intakeYear);

  const tasks: RoadmapTask[] = SEEDS.filter((seed) => seed.when(profile, program))
    .map((seed) => {
      const due = addMonths(deadline, -seed.leadMonths);
      return {
        id: `${program.id}--${seed.key}`,
        title: seed.title,
        why: seed.why,
        category: seed.category,
        phase: phaseOf(due, now),
        dueDate: due.toISOString(),
        dueLabel: labelFor(due, now),
        effortHours: seed.effortHours,
        source: seed.category === "admin" ? program.source : undefined,
        dataConfidence: program.dataConfidence,
      } satisfies RoadmapTask;
    })
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

  return {
    programId: program.id,
    programTitle: `${program.universityShort} — ${program.program}`,
    generatedAt: now.toISOString(),
    tasks,
    generatedBy: "rules",
  };
}

/**
 * Следующее действие — первая незакрытая задача по сроку.
 * Отдельная функция, потому что это центральный элемент седьмого экрана.
 */
export function nextAction(
  roadmap: Roadmap,
  completed: Record<string, boolean>,
): RoadmapTask | null {
  return roadmap.tasks.find((t) => !completed[t.id]) ?? null;
}

export function roadmapProgress(
  roadmap: Roadmap,
  completed: Record<string, boolean>,
): { done: number; total: number; percent: number } {
  const total = roadmap.tasks.length;
  const done = roadmap.tasks.filter((t) => completed[t.id]).length;
  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

/** Часы усилий, оставшиеся до конца плана — полезная метрика на дашборде. */
export function remainingEffort(
  roadmap: Roadmap,
  completed: Record<string, boolean>,
): number {
  return roadmap.tasks
    .filter((t) => !completed[t.id])
    .reduce((sum, t) => sum + t.effortHours, 0);
}

export { deadlineDate, monthsUntilDeadline };
