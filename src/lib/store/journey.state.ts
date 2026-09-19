import type { Profile } from "@/lib/domain/types";

/* ============================================================================
   ЧИСТАЯ ЧАСТЬ СОСТОЯНИЯ ПУТИ

   Здесь то, что не зависит ни от React, ни от zustand, ни от браузера:
   начальный профиль и демо-профиль. Вынесено из journey.ts, потому что после
   появления аккаунтов это нужно в трёх местах сразу — в браузерном сторе, на
   сервере (создание пустого journeys при регистрации) и в тестах слияния.

   journey.ts помечен "use client" и тянет zustand; сервер и node:test не
   должны платить за это ради одной функции.
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

/** Готовый профиль для быстрой демонстрации жюри — один клик на входе. */
export const DEMO_PROFILE: Profile = {
  version: 1,
  grade: 11,
  track: "IB",
  intakeYear: new Date().getMonth() >= 8 ? new Date().getFullYear() + 1 : new Date().getFullYear(),
  academics: {
    gpaBand: "high",
    predictedIB: 36,
    // Балл ЕНТ нужен демонстрации по существу: без него грантовый трек
    // казахстанских программ нечем сравнивать, и самая сильная часть
    // продукта остаётся невидимой для того, кто открыл демо-профиль.
    // 95 выбрано не произвольно: балл проходит все пороги конкурса с
    // запасом (максимальный — 75), но держится вровень с требованиями
    // сильных программ, поэтому выдача сохраняет все три полосы, а не
    // схлопывается в сплошной «надёжный».
    entScore: 95,
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
