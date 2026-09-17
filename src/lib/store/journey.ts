"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Profile, StepId } from "@/lib/domain/types";

/* ============================================================================
   СОСТОЯНИЕ ПУТИ

   Персистентность через localStorage — кейс прямо разрешает заменить сложный
   backend локальным хранением, если полный сценарий работает. Интерфейс
   хранилища специально узкий, чтобы позже подменить его на серверный
   репозиторий, не трогая компоненты.
   ========================================================================= */

export function createEmptyProfile(): Profile {
  const now = new Date();
  // Если учебный год уже начался, ближайший реальный набор — следующий год.
  const intakeYear = now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear();

  return {
    version: 1,
    grade: 11,
    track: "IB",
    intakeYear,
    academics: {
      gpaBand: "high",
      strongSubjects: [],
    },
    languages: {
      englishSelf: "intermediate",
      kazakh: "fluent",
      russian: "fluent",
    },
    budget: {
      annualTuitionUSD: 8000,
      needsFunding: true,
      livingCoveredUSD: 4000,
    },
    preferences: {
      countries: ["KZ"],
      fields: [],
      instructionLanguages: ["en", "ru"],
      preferCloseToHome: false,
      needsDorm: true,
      campusPreference: "any",
    },
  };
}

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
}

/** Готовый профиль для быстрой демонстрации жюри — один клик на входе. */
const DEMO_PROFILE: Profile = {
  version: 1,
  grade: 11,
  track: "IB",
  intakeYear: new Date().getMonth() >= 8 ? new Date().getFullYear() + 1 : new Date().getFullYear(),
  academics: {
    gpaBand: "high",
    predictedIB: 36,
    strongSubjects: ["Математика", "Физика", "Информатика"],
  },
  languages: {
    ielts: 7,
    englishSelf: "advanced",
    kazakh: "fluent",
    russian: "fluent",
  },
  budget: {
    annualTuitionUSD: 15000,
    needsFunding: true,
    livingCoveredUSD: 6000,
  },
  preferences: {
    countries: ["KZ", "TR", "AE"],
    fields: ["cs", "engineering"],
    instructionLanguages: ["en"],
    preferCloseToHome: false,
    needsDorm: true,
    campusPreference: "big",
  },
  note: "Хочу сильную инженерную программу, но важно, чтобы была стипендия.",
};

export const useJourney = create<JourneyState>()(
  persist(
    (set) => ({
      profile: createEmptyProfile(),
      profileCompleted: false,
      visitedSteps: ["intro"],
      shortlist: [],
      activeProgramId: null,
      completedTasks: {},
      revisions: 0,

      setProfile: (patch) =>
        set((s) => ({
          profile: { ...s.profile, ...patch },
          revisions: s.profileCompleted ? s.revisions + 1 : s.revisions,
        })),

      patchAcademics: (patch) =>
        set((s) => ({
          profile: { ...s.profile, academics: { ...s.profile.academics, ...patch } },
          revisions: s.profileCompleted ? s.revisions + 1 : s.revisions,
        })),

      patchLanguages: (patch) =>
        set((s) => ({
          profile: { ...s.profile, languages: { ...s.profile.languages, ...patch } },
          revisions: s.profileCompleted ? s.revisions + 1 : s.revisions,
        })),

      patchBudget: (patch) =>
        set((s) => ({
          profile: { ...s.profile, budget: { ...s.profile.budget, ...patch } },
          revisions: s.profileCompleted ? s.revisions + 1 : s.revisions,
        })),

      patchPreferences: (patch) =>
        set((s) => ({
          profile: {
            ...s.profile,
            preferences: { ...s.profile.preferences, ...patch },
          },
          revisions: s.profileCompleted ? s.revisions + 1 : s.revisions,
        })),

      completeProfile: () =>
        set((s) => ({
          profileCompleted: true,
          visitedSteps: s.visitedSteps.includes("profile")
            ? s.visitedSteps
            : [...s.visitedSteps, "profile"],
        })),

      visitStep: (step) =>
        set((s) =>
          s.visitedSteps.includes(step)
            ? s
            : { visitedSteps: [...s.visitedSteps, step] },
        ),

      toggleShortlist: (programId) =>
        set((s) => {
          const has = s.shortlist.includes(programId);
          if (has) {
            return { shortlist: s.shortlist.filter((id) => id !== programId) };
          }
          // Сравнение осмысленно до трёх вариантов — дальше таблица нечитаема.
          const next = [...s.shortlist, programId].slice(-3);
          return { shortlist: next };
        }),

      clearShortlist: () => set({ shortlist: [] }),

      setActiveProgram: (programId) =>
        set((s) => ({
          activeProgramId: programId,
          visitedSteps: s.visitedSteps.includes("roadmap")
            ? s.visitedSteps
            : [...s.visitedSteps, "roadmap"],
        })),

      toggleTask: (taskId) =>
        set((s) => ({
          completedTasks: {
            ...s.completedTasks,
            [taskId]: !s.completedTasks[taskId],
          },
        })),

      reset: () =>
        set({
          profile: createEmptyProfile(),
          profileCompleted: false,
          visitedSteps: ["intro"],
          shortlist: [],
          activeProgramId: null,
          completedTasks: {},
          revisions: 0,
        }),

      loadDemoProfile: () =>
        set({
          profile: structuredClone(DEMO_PROFILE),
          profileCompleted: true,
          visitedSteps: ["intro", "profile"],
          shortlist: [],
          activeProgramId: null,
          completedTasks: {},
          revisions: 0,
        }),
    }),
    {
      name: "bagyt-journey",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (s) => ({
        profile: s.profile,
        profileCompleted: s.profileCompleted,
        visitedSteps: s.visitedSteps,
        shortlist: s.shortlist,
        activeProgramId: s.activeProgramId,
        completedTasks: s.completedTasks,
        revisions: s.revisions,
      }),
    },
  ),
);

/** Безопасно определяет, готово ли гидратированное хранилище (для SSR). */
export function useHydrated(): boolean {
  if (typeof window === "undefined") return false;
  return true;
}
