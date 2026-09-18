import { COUNTRIES, FIELDS, TRACKS } from "./taxonomy";
import { detectRealityCheck } from "./realityCheck";
import type { Diagnosis, DiagnosisItem, Profile } from "./types";

/* ============================================================================
   ДИАГНОСТИКА ПРОФИЛЯ (детерминированная база)

   Этот модуль всегда даёт полный корректный разбор без обращения к LLM.
   AI-слой поверх только переписывает формулировки живым языком — состав
   сильных сторон, пробелов и находок проверки реальности остаётся
   проверяемым и воспроизводимым.
   ========================================================================= */

const GPA_WORDS: Record<Profile["academics"]["gpaBand"], string> = {
  top: "очень высокая успеваемость",
  high: "стабильно высокая успеваемость",
  mid: "средняя успеваемость",
  developing: "успеваемость в процессе роста",
  unknown: "успеваемость не указана",
};

function listFields(profile: Profile): string {
  const names = profile.preferences.fields.map((f) => FIELDS[f].label);
  if (names.length === 0) return "направление ещё не выбрано";
  if (names.length === 1) return names[0].toLowerCase();
  return names.slice(0, -1).join(", ").toLowerCase() + " и " + names.at(-1)!.toLowerCase();
}

function listCountries(profile: Profile): string {
  const names = profile.preferences.countries.map((c) => COUNTRIES[c].label);
  if (names.length === 0) return "страны не выбраны";
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} и ещё ${names.length - 3}`;
}

function buildStrengths(profile: Profile): DiagnosisItem[] {
  const out: DiagnosisItem[] = [];
  const { academics, languages, budget, preferences, track, grade } = profile;

  if (academics.gpaBand === "top" || academics.gpaBand === "high") {
    out.push({
      title: "Академическая база",
      detail: `${GPA_WORDS[academics.gpaBand]} — это расширяет список программ, где вы попадаете в целевую полосу.`,
    });
  }

  if (academics.predictedIB && academics.predictedIB >= 36) {
    out.push({
      title: `Предсказанные ${academics.predictedIB} IB`,
      detail:
        "Этого хватает для конкурентной подачи в большинство сильных программ из каталога.",
    });
  }

  if (academics.entScore && academics.entScore >= 110) {
    out.push({
      title: `ЕНТ ${academics.entScore}`,
      detail: "Балл в грантовой зоне ведущих казахстанских университетов.",
    });
  }

  if (languages.ielts && languages.ielts >= 6.5) {
    out.push({
      title: `IELTS ${languages.ielts}`,
      detail:
        "Языковой порог большинства англоязычных бакалавриатов уже закрыт — один блок плана снимается.",
    });
  }

  if (academics.strongSubjects.length >= 2) {
    out.push({
      title: "Профильные предметы",
      detail: `${academics.strongSubjects.slice(0, 3).join(", ")} — на них можно строить мотивационное эссе.`,
    });
  }

  if (track === "IB" || track === "AP") {
    out.push({
      title: `Программа ${TRACKS[track].label}`,
      detail:
        "Международно признанный трек: зарубежные вузы понимают вашу систему оценок без дополнительной конвертации.",
    });
  }

  if (!budget.needsFunding && budget.annualTuitionUSD >= 12000) {
    out.push({
      title: "Свобода по бюджету",
      detail:
        "Вы не привязаны к наличию стипендии, поэтому выбор можно вести по содержанию программы, а не по цене.",
    });
  }

  if (grade <= 10) {
    out.push({
      title: "Запас времени",
      detail:
        "До подачи остаётся несколько циклов — успеваете и поднять баллы, и собрать внеучебную часть.",
    });
  }

  if (preferences.fields.length > 0 && preferences.countries.length > 0) {
    out.push({
      title: "Понятные рамки поиска",
      detail: `Направление и география заданы (${listCountries(profile)}), значит подбор идёт точечно, а не вслепую.`,
    });
  }

  return out.slice(0, 4);
}

function buildGaps(profile: Profile): DiagnosisItem[] {
  const out: DiagnosisItem[] = [];
  const { academics, languages, budget, preferences, grade } = profile;

  const hasEnglishTest = Boolean(languages.ielts || languages.toefl);
  const wantsAbroad = preferences.countries.some((c) => c !== "KZ");

  if (!hasEnglishTest && wantsAbroad) {
    out.push({
      title: "Нет официального языкового теста",
      detail:
        "Без IELTS или TOEFL зарубежная подача невозможна. Это первая блокирующая задача маршрута.",
    });
  }

  if (hasEnglishTest && languages.ielts && languages.ielts < 6.5 && wantsAbroad) {
    out.push({
      title: "Языковой балл ниже типичного порога",
      detail: `IELTS ${languages.ielts} закрывает не все программы — пересдача поднимет доступный список.`,
    });
  }

  if (!academics.entScore && preferences.countries.includes("KZ")) {
    out.push({
      title: "Нет балла ЕНТ",
      detail:
        "Для казахстанских вузов и гранта ЕНТ обязателен — без него оценка по местным программам приблизительная.",
    });
  }

  if (!academics.predictedIB && profile.track === "IB") {
    out.push({
      title: "Не указаны предсказанные баллы IB",
      detail:
        "Как только появятся predicted grades, точность подбора по академике заметно вырастет.",
    });
  }

  if (budget.needsFunding) {
    out.push({
      title: "Поступление завязано на стипендию",
      detail:
        "Нужен отдельный трек подготовки: сроки стипендиальных заявок обычно раньше обычных дедлайнов.",
    });
  }

  if (academics.strongSubjects.length === 0) {
    out.push({
      title: "Не определены профильные предметы",
      detail:
        "Приёмные комиссии смотрят на профильные дисциплины — стоит зафиксировать 2–3 сильных.",
    });
  }

  if (preferences.fields.length > 2) {
    out.push({
      title: "Слишком широкий разброс направлений",
      detail: `Выбрано ${preferences.fields.length} направления. Сузив до одного-двух, вы усилите мотивационное письмо.`,
    });
  }

  if (grade >= 12) {
    out.push({
      title: "Сжатые сроки",
      detail:
        "Выпускной год: часть дедлайнов уже близко, план стоит вести по неделям, а не по месяцам.",
    });
  }

  if (budget.annualTuitionUSD < 6000 && wantsAbroad && !budget.needsFunding) {
    out.push({
      title: "Бюджет ограничивает зарубежный список",
      detail:
        "При таком потолке реалистичны страны с низкой стоимостью обучения или программы со стипендиями.",
    });
  }

  return out.slice(0, 4);
}

function buildGoal(profile: Profile): string {
  const fields = listFields(profile);
  const countries = listCountries(profile);
  const funding = profile.budget.needsFunding ? " со стипендиальной поддержкой" : "";
  return `Поступление на бакалавриат ${profile.intakeYear} года по направлению ${fields}${funding}; рассматриваемая география — ${countries}.`;
}

function buildHeadline(profile: Profile): string {
  const trackLabel = TRACKS[profile.track].label;
  const fields = listFields(profile);
  return `${profile.grade} класс, ${trackLabel}, цель — ${fields}.`;
}

function buildSummary(profile: Profile): string {
  const { academics, languages, budget } = profile;
  const parts: string[] = [];

  parts.push(
    `У вас ${GPA_WORDS[academics.gpaBand]}${
      academics.predictedIB ? ` и предсказанные ${academics.predictedIB} баллов IB` : ""
    }.`,
  );

  if (languages.ielts) {
    parts.push(`Языковой результат IELTS ${languages.ielts} уже есть.`);
  } else if (languages.toefl) {
    parts.push(`Языковой результат TOEFL ${languages.toefl} уже есть.`);
  } else {
    parts.push("Официального языкового теста пока нет — это ближайшая задача.");
  }

  parts.push(
    `Бюджет на обучение — до ${budget.annualTuitionUSD.toLocaleString("ru-RU")} $ в год${
      budget.needsFunding ? ", при этом стипендия критична" : ""
    }.`,
  );

  parts.push(
    `Исходя из этих вводных подбор идёт по ${listCountries(profile)} с приоритетом на ${listFields(profile)}.`,
  );

  return parts.join(" ");
}

/** Полная детерминированная диагностика — работает всегда, без сети. */
export function buildDiagnosis(profile: Profile): Diagnosis {
  return {
    headline: buildHeadline(profile),
    summary: buildSummary(profile),
    strengths: buildStrengths(profile),
    gaps: buildGaps(profile),
    realityChecks: detectRealityCheck(profile),
    goal: buildGoal(profile),
    generatedBy: "rules",
  };
}
