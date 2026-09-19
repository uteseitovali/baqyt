"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Profile, StepId } from "@/lib/domain/types";
import { createEmptyProfile, DEMO_PROFILE } from "./journey.state";
import { reviveProfile } from "@/lib/domain/validation";
import { SHORTLIST_LIMIT, type JourneySnapshot } from "@/lib/sync/merge";

export { createEmptyProfile };

/* ============================================================================
   СОСТОЯНИЕ ПУТИ

   Персистентность через localStorage — кейс прямо разрешает заменить сложный
   backend локальным хранением, если полный сценарий работает. Интерфейс
   хранилища специально узкий, чтобы позже подменить его на серверный
   репозиторий, не трогая компоненты.
   ========================================================================= */

interface JourneyState {
  profile: Profile;
  profileCompleted: boolean;
  visitedSteps: StepId[];
  /** Программы, отобранные для сравнения. */
  shortlist: string[];
  /** Программа, под которую построен активный маршрут. */
  activeProgramId: string | null;
  /** Отметки выполнения задач маршрута. */
  completedTasks: Record<string, boolean>;
  /** Сколько раз пользователь менял анкету после первого подбора. */
  revisions: number;
  /** ISO-время последнего изменения. Опора для слияния с серверной версией. */
  updatedAt: string;

  setProfile: (patch: Partial<Profile>) => void;
  patchAcademics: (patch: Partial<Profile["academics"]>) => void;
  patchLanguages: (patch: Partial<Profile["languages"]>) => void;
  patchBudget: (patch: Partial<Profile["budget"]>) => void;
  patchPreferences: (patch: Partial<Profile["preferences"]>) => void;

  completeProfile: () => void;
  visitStep: (step: StepId) => void;

  toggleShortlist: (programId: string) => void;
  clearShortlist: () => void;
  setActiveProgram: (programId: string) => void;
  toggleTask: (taskId: string) => void;

  reset: () => void;
  loadDemoProfile: () => void;

  /* ——— Синхронизация с аккаунтом ——————————————————————————————————— */

  /** Текущее состояние в форме, которую понимают мердж и серверный API. */
  snapshot: () => JourneySnapshot;
  /** Ставит состояние целиком — результат слияния при входе в аккаунт. */
  applySnapshot: (snapshot: JourneySnapshot) => void;
}

export const useJourney = create<JourneyState>()(
  persist(
    (set, get) => {
      /* Каждое изменение отмечается временем: без него слияние при входе в
         аккаунт не смогло бы решить, какая из двух анкет свежее. Обёртка
         вместо ручного updatedAt в каждом действии — чтобы отметку нельзя
         было забыть, добавляя новое действие. */
      const change = (
        updater: (s: JourneyState) => Partial<JourneyState> | null,
      ) =>
        set((s) => {
          const patch = updater(s);
          if (!patch) return s;
          return { ...patch, updatedAt: new Date().toISOString() };
        });

      return {
        profile: createEmptyProfile(),
        profileCompleted: false,
        visitedSteps: ["intro"],
        shortlist: [],
        activeProgramId: null,
        completedTasks: {},
        revisions: 0,
        updatedAt: new Date().toISOString(),

        setProfile: (patch) =>
          change((s) => ({
            profile: { ...s.profile, ...patch },
            revisions: s.profileCompleted ? s.revisions + 1 : s.revisions,
          })),

        patchAcademics: (patch) =>
          change((s) => ({
            profile: { ...s.profile, academics: { ...s.profile.academics, ...patch } },
            revisions: s.profileCompleted ? s.revisions + 1 : s.revisions,
          })),

        patchLanguages: (patch) =>
          change((s) => ({
            profile: { ...s.profile, languages: { ...s.profile.languages, ...patch } },
            revisions: s.profileCompleted ? s.revisions + 1 : s.revisions,
          })),

        patchBudget: (patch) =>
          change((s) => ({
            profile: { ...s.profile, budget: { ...s.profile.budget, ...patch } },
            revisions: s.profileCompleted ? s.revisions + 1 : s.revisions,
          })),

        patchPreferences: (patch) =>
          change((s) => ({
            profile: {
              ...s.profile,
              preferences: { ...s.profile.preferences, ...patch },
            },
            revisions: s.profileCompleted ? s.revisions + 1 : s.revisions,
          })),

        completeProfile: () =>
          change((s) => ({
            profileCompleted: true,
            visitedSteps: s.visitedSteps.includes("profile")
              ? s.visitedSteps
              : [...s.visitedSteps, "profile"],
          })),

        visitStep: (step) =>
          change((s) =>
            s.visitedSteps.includes(step)
              ? null
              : { visitedSteps: [...s.visitedSteps, step] },
          ),

        toggleShortlist: (programId) =>
          change((s) => {
            const has = s.shortlist.includes(programId);
            if (has) {
              return { shortlist: s.shortlist.filter((id) => id !== programId) };
            }
            // Сравнение осмысленно до трёх вариантов — дальше таблица нечитаема.
            const next = [...s.shortlist, programId].slice(-SHORTLIST_LIMIT);
            return { shortlist: next };
          }),

        clearShortlist: () => change(() => ({ shortlist: [] })),

        setActiveProgram: (programId) =>
          change((s) => ({
            activeProgramId: programId,
            visitedSteps: s.visitedSteps.includes("roadmap")
              ? s.visitedSteps
              : [...s.visitedSteps, "roadmap"],
          })),

        toggleTask: (taskId) =>
          change((s) => ({
            completedTasks: {
              ...s.completedTasks,
              [taskId]: !s.completedTasks[taskId],
            },
          })),

        reset: () =>
          change(() => ({
            profile: createEmptyProfile(),
            profileCompleted: false,
            visitedSteps: ["intro"],
            shortlist: [],
            activeProgramId: null,
            completedTasks: {},
            revisions: 0,
          })),

        loadDemoProfile: () =>
          change(() => ({
            profile: structuredClone(DEMO_PROFILE),
            profileCompleted: true,
            visitedSteps: ["intro", "profile"],
            shortlist: [],
            activeProgramId: null,
            completedTasks: {},
            revisions: 0,
          })),

        snapshot: () => {
          const s = get();
          return {
            profile: s.profile,
            profileCompleted: s.profileCompleted,
            visitedSteps: s.visitedSteps,
            shortlist: s.shortlist,
            activeProgramId: s.activeProgramId,
            completedTasks: s.completedTasks,
            revisions: s.revisions,
            updatedAt: s.updatedAt,
          };
        },

        /* Состояние ставится целиком и с чужим updatedAt — это не
           пользовательская правка, а результат слияния, у которого своё
           время. Поэтому здесь set, а не change. */
        applySnapshot: (snapshot) => set({ ...snapshot }),
      };
    },
    {
      name: "bagyt-journey",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      /* v1 не хранил updatedAt. Такое состояние было единственным хранилищем
         этого человека, поэтому считаем его актуальным на момент обновления,
         а не устаревшим: иначе при первом же входе в аккаунт серверная версия
         молча победила бы реально пройденный в браузере путь. */
      migrate: (persisted, version) => {
        if (version >= 2) return persisted as JourneyState;
        return {
          ...(persisted as object),
          updatedAt: new Date().toISOString(),
        } as JourneyState;
      },
      /* persist кладёт сохранённое состояние поверх начального целиком, а не
         по полям: анкета, записанная прошлой версией приложения, доезжает до
         компонентов как есть. Недостающая секция роняла рендер, а значение
         вне диапазона возвращалось с сервера как 422 уже после всех пяти
         шагов. Профиль — единственная часть состояния, приходящая из
         localStorage со своей формой, поэтому чиним ровно её. */
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<JourneyState>;
        return {
          ...current,
          ...stored,
          profile: reviveProfile(stored.profile),
        };
      },
      partialize: (s) => ({
        profile: s.profile,
        profileCompleted: s.profileCompleted,
        visitedSteps: s.visitedSteps,
        shortlist: s.shortlist,
        activeProgramId: s.activeProgramId,
        completedTasks: s.completedTasks,
        revisions: s.revisions,
        updatedAt: s.updatedAt,
      }),
    },
  ),
);

/** Безопасно определяет, готово ли гидратированное хранилище (для SSR). */
export function useHydrated(): boolean {
  if (typeof window === "undefined") return false;
  return true;
}
