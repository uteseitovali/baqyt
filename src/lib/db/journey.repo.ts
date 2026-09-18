import { queryOne } from "./client";
import { journeySnapshotSchema, asJourneySnapshot } from "@/lib/sync/schema";
import type { JourneySnapshot } from "@/lib/sync/merge";

/* ============================================================================
   РЕПОЗИТОРИЙ СОСТОЯНИЯ ПУТИ

   Одна строка на пользователя. Читаем и пишем целиком: состояние маленькое,
   а частичные апдейты потребовали бы разрешать конфликты на уровне полей —
   ровно то, для чего есть mergeJourneys.

   Только серверный модуль: импортирует драйвер.
   ========================================================================= */

interface JourneyRow {
  profile: unknown;
  profile_completed: boolean;
  visited_steps: string[];
  shortlist: string[];
  active_program_id: string | null;
  completed_tasks: Record<string, boolean>;
  revisions: number;
  updated_at: Date;
}

function rowToSnapshot(row: JourneyRow): JourneySnapshot | null {
  const parsed = journeySnapshotSchema.safeParse({
    profile: row.profile,
    profileCompleted: row.profile_completed,
    visitedSteps: row.visited_steps,
    shortlist: row.shortlist,
    activeProgramId: row.active_program_id,
    completedTasks: row.completed_tasks,
    revisions: row.revisions,
    updatedAt: row.updated_at.toISOString(),
  });

  if (!parsed.success) {
    // Состояние старой версии анкеты или ручная правка в базе. Лучше отдать
    // «ничего нет» и дать локальному прогрессу выиграть слияние, чем уронить
    // вход в аккаунт.
    console.warn(
      `[bagyt/journey] сохранённое состояние не прошло схему: ${parsed.error.issues[0]?.message}`,
    );
    return null;
  }

  return asJourneySnapshot(parsed.data);
}

export async function getJourney(userId: string): Promise<JourneySnapshot | null> {
  const row = await queryOne<JourneyRow>(
    `select profile, profile_completed, visited_steps, shortlist,
            active_program_id, completed_tasks, revisions, updated_at
       from journeys where user_id = $1`,
    [userId],
  );
  return row ? rowToSnapshot(row) : null;
}

/** Полная перезапись состояния пользователя. */
export async function saveJourney(
  userId: string,
  snapshot: JourneySnapshot,
): Promise<void> {
  await queryOne(
    `insert into journeys (
       user_id, profile, profile_completed, visited_steps, shortlist,
       active_program_id, completed_tasks, revisions, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (user_id) do update set
       profile = excluded.profile,
       profile_completed = excluded.profile_completed,
       visited_steps = excluded.visited_steps,
       shortlist = excluded.shortlist,
       active_program_id = excluded.active_program_id,
       completed_tasks = excluded.completed_tasks,
       revisions = excluded.revisions,
       updated_at = excluded.updated_at
     returning user_id`,
    [
      userId,
      JSON.stringify(snapshot.profile),
      snapshot.profileCompleted,
      snapshot.visitedSteps,
      snapshot.shortlist,
      snapshot.activeProgramId,
      JSON.stringify(snapshot.completedTasks),
      snapshot.revisions,
      snapshot.updatedAt,
    ],
  );
}

export async function deleteJourney(userId: string): Promise<void> {
  await queryOne("delete from journeys where user_id = $1 returning user_id", [userId]);
}
