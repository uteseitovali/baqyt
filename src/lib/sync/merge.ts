import type { Profile, StepId } from "@/lib/domain/types";

/* ============================================================================
   МЕРДЖ СОСТОЯНИЯ ПУТИ

   Сценарий: человек прошёл анкету гостем, отметил пару шагов маршрута, потом
   вошёл в аккаунт, где уже что-то было с телефона. Ни одну из двух версий
   стирать нельзя.

   Главное правило: НИ ОДНО правило ниже не удаляет данные. Списки
   объединяются, флаги складываются по «или», счётчики берут максимум.
   Выбор «кто победил» делается только там, где объединение невозможно
   по смыслу — у профиля, который является цельным объектом: половина ответов
   с телефона и половина с ноутбука дали бы анкету, которую человек никогда
   не заполнял.

   Функция чистая и лежит вне src/lib/domain: домен описывает предметную
   область поступления, а это — механика синхронизации. Тесты — tests/sync.test.ts.
   ========================================================================= */

/** Столько вариантов помещается в сравнение — то же ограничение, что в сторе. */
export const SHORTLIST_LIMIT = 3;

export interface JourneySnapshot {
  profile: Profile;
  profileCompleted: boolean;
  visitedSteps: StepId[];
  shortlist: string[];
  activeProgramId: string | null;
  completedTasks: Record<string, boolean>;
  revisions: number;
  /** ISO-время последнего изменения на этой стороне. */
  updatedAt: string;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function isNewer(a: string, b: string): boolean {
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (Number.isNaN(left)) return false;
  if (Number.isNaN(right)) return true;
  return left > right;
}

/**
 * Какой профиль считать актуальным.
 *
 * Заполненная анкета всегда важнее незаполненной, даже если незаполненную
 * трогали позже: пустая форма, открытая на другом устройстве, не должна
 * затирать реально пройденный путь. Если заполнены обе — побеждает свежая.
 */
function pickProfile(
  local: JourneySnapshot,
  remote: JourneySnapshot,
): { profile: Profile; from: "local" | "remote" } {
  if (local.profileCompleted && !remote.profileCompleted) {
    return { profile: local.profile, from: "local" };
  }
  if (remote.profileCompleted && !local.profileCompleted) {
    return { profile: remote.profile, from: "remote" };
  }
  return isNewer(local.updatedAt, remote.updatedAt)
    ? { profile: local.profile, from: "local" }
    : { profile: remote.profile, from: "remote" };
}

export interface MergeResult {
  merged: JourneySnapshot;
  /** Что произошло — показываем пользователю, а не молча подменяем состояние. */
  summary: {
    profileFrom: "local" | "remote";
    shortlistAdded: number;
    tasksAdded: number;
  };
}

/**
 * Сводит локальное (гостевое) и серверное состояние в одно.
 * Порядок аргументов важен только для профиля при равном времени: там
 * выигрывает серверная версия как более «официальная».
 */
export function mergeJourneys(
  local: JourneySnapshot,
  remote: JourneySnapshot,
): MergeResult {
  const { profile, from } = pickProfile(local, remote);

  // Локальные варианты идут первыми: человек только что их отбирал, и при
  // упоре в лимит логично оставить то, с чем он работает прямо сейчас.
  const shortlist = unique([...local.shortlist, ...remote.shortlist]).slice(
    0,
    SHORTLIST_LIMIT,
  );

  // Отметка «сделано» не снимается никогда: экзамен, сданный на одном
  // устройстве, не может «разсдаться» при входе с другого.
  const completedTasks: Record<string, boolean> = { ...remote.completedTasks };
  let tasksAdded = 0;
  for (const [taskId, done] of Object.entries(local.completedTasks)) {
    if (done && !completedTasks[taskId]) {
      completedTasks[taskId] = true;
      tasksAdded += 1;
    }
  }

  const merged: JourneySnapshot = {
    profile,
    profileCompleted: local.profileCompleted || remote.profileCompleted,
    visitedSteps: unique([...remote.visitedSteps, ...local.visitedSteps]),
    shortlist,
    activeProgramId: local.activeProgramId ?? remote.activeProgramId,
    completedTasks,
    revisions: Math.max(local.revisions, remote.revisions),
    // Слияние — это и есть последнее изменение состояния.
    updatedAt: new Date().toISOString(),
  };

  return {
    merged,
    summary: {
      profileFrom: from,
      shortlistAdded: shortlist.filter((id) => !remote.shortlist.includes(id)).length,
      tasksAdded,
    },
  };
}
