import test from "node:test";
import assert from "node:assert/strict";

import { mergeJourneys, SHORTLIST_LIMIT } from "../src/lib/sync/merge";
import type { JourneySnapshot } from "../src/lib/sync/merge";
import { createEmptyProfile } from "../src/lib/store/journey.state";
import type { Profile } from "../src/lib/domain/types";

/* ============================================================================
   Тесты слияния состояния при входе в аккаунт.

   Проверяем главное обещание: вход в аккаунт НЕ ТЕРЯЕТ прогресс — ни
   гостевой, ни серверный. Всё остальное — детали.
   ========================================================================= */

function snapshot(patch: Partial<JourneySnapshot> = {}): JourneySnapshot {
  return {
    profile: createEmptyProfile(),
    profileCompleted: false,
    visitedSteps: ["intro"],
    shortlist: [],
    activeProgramId: null,
    completedTasks: {},
    revisions: 0,
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...patch,
  };
}

function profileWith(patch: Partial<Profile>): Profile {
  return { ...createEmptyProfile(), ...patch };
}

test("мердж: гостевой прогресс не затирается серверным", () => {
  const local = snapshot({
    profileCompleted: true,
    shortlist: ["kz-nu-cs"],
    completedTasks: { "task-a": true },
    visitedSteps: ["intro", "profile", "matches"],
  });
  const remote = snapshot({ updatedAt: "2026-09-10T10:00:00.000Z" });

  const { merged } = mergeJourneys(local, remote);

  assert.equal(merged.profileCompleted, true);
  assert.deepEqual(merged.shortlist, ["kz-nu-cs"]);
  assert.equal(merged.completedTasks["task-a"], true);
  assert.ok(merged.visitedSteps.includes("matches"));
});

test("мердж: серверный прогресс не затирается пустым гостевым", () => {
  const local = snapshot();
  const remote = snapshot({
    profileCompleted: true,
    shortlist: ["gb-ucl-cs", "tr-metu-cs"],
    completedTasks: { "task-b": true },
    revisions: 4,
  });

  const { merged } = mergeJourneys(local, remote);

  assert.equal(merged.profileCompleted, true);
  assert.deepEqual(merged.shortlist, ["gb-ucl-cs", "tr-metu-cs"]);
  assert.equal(merged.completedTasks["task-b"], true);
  assert.equal(merged.revisions, 4);
});

test("мердж: заполненная анкета важнее пустой, даже если пустую трогали позже", () => {
  const local = snapshot({
    profile: profileWith({ intakeYear: 2027 }),
    profileCompleted: true,
    updatedAt: "2026-09-01T10:00:00.000Z",
  });
  const remote = snapshot({
    profile: profileWith({ intakeYear: 2030 }),
    profileCompleted: false,
    updatedAt: "2026-09-18T10:00:00.000Z",
  });

  const { merged, summary } = mergeJourneys(local, remote);

  assert.equal(merged.profile.intakeYear, 2027);
  assert.equal(summary.profileFrom, "local");
});

test("мердж: при двух заполненных анкетах побеждает свежая", () => {
  const local = snapshot({
    profile: profileWith({ intakeYear: 2027 }),
    profileCompleted: true,
    updatedAt: "2026-09-01T10:00:00.000Z",
  });
  const remote = snapshot({
    profile: profileWith({ intakeYear: 2029 }),
    profileCompleted: true,
    updatedAt: "2026-09-18T10:00:00.000Z",
  });

  const { merged, summary } = mergeJourneys(local, remote);

  assert.equal(merged.profile.intakeYear, 2029);
  assert.equal(summary.profileFrom, "remote");
});

test("мердж: профиль берётся целиком, а не по полям", () => {
  const local = snapshot({
    profile: profileWith({ grade: 11, intakeYear: 2027 }),
    profileCompleted: true,
    updatedAt: "2026-09-18T10:00:00.000Z",
  });
  const remote = snapshot({
    profile: profileWith({ grade: 9, intakeYear: 2031 }),
    profileCompleted: true,
    updatedAt: "2026-09-01T10:00:00.000Z",
  });

  const { merged } = mergeJourneys(local, remote);

  // Никакой мозаики из двух анкет: оба поля пришли из одной версии.
  assert.equal(merged.profile.grade, 11);
  assert.equal(merged.profile.intakeYear, 2027);
});

test("мердж: отметки выполнения складываются и не снимаются", () => {
  const local = snapshot({ completedTasks: { a: true, b: false } });
  const remote = snapshot({ completedTasks: { b: true, c: true } });

  const { merged } = mergeJourneys(local, remote);

  assert.equal(merged.completedTasks.a, true);
  assert.equal(merged.completedTasks.b, true, "снятая локально отметка не отменяет серверную");
  assert.equal(merged.completedTasks.c, true);
});

test("мердж: shortlist объединяется без дублей и в пределах лимита", () => {
  const local = snapshot({ shortlist: ["a", "b"] });
  const remote = snapshot({ shortlist: ["b", "c", "d"] });

  const { merged } = mergeJourneys(local, remote);

  assert.equal(merged.shortlist.length, SHORTLIST_LIMIT);
  assert.equal(new Set(merged.shortlist).size, merged.shortlist.length);
  assert.deepEqual(merged.shortlist, ["a", "b", "c"]);
});

test("мердж: активная программа локального устройства в приоритете", () => {
  const withLocal = mergeJourneys(
    snapshot({ activeProgramId: "kz-nu-cs" }),
    snapshot({ activeProgramId: "gb-ucl-cs" }),
  );
  assert.equal(withLocal.merged.activeProgramId, "kz-nu-cs");

  const withoutLocal = mergeJourneys(
    snapshot({ activeProgramId: null }),
    snapshot({ activeProgramId: "gb-ucl-cs" }),
  );
  assert.equal(withoutLocal.merged.activeProgramId, "gb-ucl-cs");
});

test("мердж: идемпотентен — повторное слияние ничего не меняет", () => {
  const local = snapshot({
    profileCompleted: true,
    shortlist: ["a"],
    completedTasks: { x: true },
  });
  const remote = snapshot({ shortlist: ["b"], completedTasks: { y: true } });

  const once = mergeJourneys(local, remote).merged;
  const twice = mergeJourneys(once, once).merged;

  assert.deepEqual(
    { ...twice, updatedAt: null },
    { ...once, updatedAt: null },
  );
});

test("мердж: некорректная дата не ломает выбор профиля", () => {
  const local = snapshot({ profileCompleted: true, updatedAt: "не дата" });
  const remote = snapshot({ profileCompleted: true, updatedAt: "2026-09-18T10:00:00.000Z" });

  const { merged, summary } = mergeJourneys(local, remote);

  assert.equal(summary.profileFrom, "remote");
  assert.ok(merged.profile);
});
