"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, Label } from "@/components/ui/Primitives";
import {
  FieldBlock,
  NumberField,
  OptionCard,
  RangeField,
  Segmented,
  TagInput,
  TextareaField,
  ToggleField,
} from "@/components/ui/Field";
import {
  COUNTRIES,
  COUNTRY_IDS,
  FIELDS,
  FIELD_IDS,
  TRACKS,
} from "@/lib/domain/taxonomy";
import { useJourney } from "@/lib/store/journey";
import { cn, formatUSD } from "@/lib/utils/cn";
import type { CountryId, FieldId, TrackId } from "@/lib/domain/types";

/* ============================================================================
   ЭТАП 2 — АНКЕТА

   Пять коротких шагов вместо одной длинной формы: на мобильном каждый шаг
   помещается на экран без прокрутки-марафона. Поля адаптируются под учебный
   трек — у IB спрашиваем predicted grades, у национальной программы ЕНТ.
   ========================================================================= */

const SUBJECT_SUGGESTIONS = [
  "Математика",
  "Физика",
  "Информатика",
  "Химия",
  "Биология",
  "Экономика",
  "История",
  "Английский",
  "География",
  "Литература",
];

const STEPS = [
  { id: "basics", title: "О вас", hint: "Класс и учебная программа" },
  { id: "academics", title: "Академика", hint: "Баллы и сильные предметы" },
  { id: "languages", title: "Языки", hint: "Тесты и уровень владения" },
  { id: "direction", title: "Направление", hint: "Что и где хотите изучать" },
  { id: "constraints", title: "Условия", hint: "Бюджет и ограничения" },
] as const;

export default function ProfilePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const profile = useJourney((s) => s.profile);
  const setProfile = useJourney((s) => s.setProfile);
  const patchAcademics = useJourney((s) => s.patchAcademics);
  const patchLanguages = useJourney((s) => s.patchLanguages);
  const patchBudget = useJourney((s) => s.patchBudget);
  const patchPreferences = useJourney((s) => s.patchPreferences);
  const completeProfile = useJourney((s) => s.completeProfile);

  const currentYear = new Date().getFullYear();

  /** Валидация текущего шага — кнопка «Далее» отключается осмысленно. */
  const stepError = useMemo(() => {
    if (step === 3 && profile.preferences.fields.length === 0) {
      return "Выберите хотя бы одно направление — без этого подбор будет случайным.";
    }
    if (step === 3 && profile.preferences.countries.length === 0) {
      return "Выберите хотя бы одну страну.";
    }
    return null;
  }, [step, profile.preferences.fields.length, profile.preferences.countries.length]);

  function toggleField(id: FieldId) {
    const has = profile.preferences.fields.includes(id);
    patchPreferences({
      fields: has
        ? profile.preferences.fields.filter((f) => f !== id)
        : [...profile.preferences.fields, id].slice(0, 4),
    });
  }

  function toggleCountry(id: CountryId) {
    const has = profile.preferences.countries.includes(id);
    patchPreferences({
      countries: has
        ? profile.preferences.countries.filter((c) => c !== id)
        : [...profile.preferences.countries, id],
    });
  }

  function next() {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    completeProfile();
    router.push("/diagnosis");
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Прогресс анкеты */}
      <div className="mb-8">
        <div className="flex items-baseline justify-between">
          <Label>
            Шаг {step + 1} из {STEPS.length}
          </Label>
          <span className="t-label">{STEPS[step].hint}</span>
        </div>
        <div className="mt-3 flex gap-1.5">
          {STEPS.map((s, index) => (
            <button
              key={s.id}
              onClick={() => index <= step && setStep(index)}
              disabled={index > step}
              aria-label={`Шаг ${index + 1}: ${s.title}`}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors duration-300",
                index <= step ? "bg-accent" : "bg-f-track",
                index < step && "cursor-pointer hover:opacity-80",
              )}
            />
          ))}
        </div>
        <h1 className="t-title mt-5 text-[26px] sm:text-[30px]">{STEPS[step].title}</h1>
      </div>

      <Card className="space-y-8 p-5 sm:p-7">
        {/* ——— Шаг 1: базовое ——————————————————————————————————— */}
        {step === 0 && (
          <>
            <FieldBlock title="В каком вы классе?" hint="От этого зависит, сколько времени остаётся до подачи.">
              <Segmented
                ariaLabel="Класс"
                value={profile.grade}
                onChange={(grade) => setProfile({ grade })}
                options={[
                  { value: 9, label: "9" },
                  { value: 10, label: "10" },
                  { value: 11, label: "11" },
                  { value: 12, label: "12" },
                ]}
              />
            </FieldBlock>

            <FieldBlock
              title="По какой программе учитесь?"
              hint="Мы спросим именно те баллы, которые есть в вашей системе."
            >
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(TRACKS) as TrackId[]).map((id) => (
                  <OptionCard
                    key={id}
                    single
                    selected={profile.track === id}
                    onSelect={() => setProfile({ track: id })}
                    title={TRACKS[id].label}
                    hint={TRACKS[id].hint}
                  />
                ))}
              </div>
            </FieldBlock>

            <FieldBlock title="Год поступления" hint="Год, когда планируете начать обучение.">
              <Segmented
                ariaLabel="Год поступления"
                value={profile.intakeYear}
                onChange={(intakeYear) => setProfile({ intakeYear })}
                options={[currentYear, currentYear + 1, currentYear + 2].map((y) => ({
                  value: y,
                  label: String(y),
                }))}
              />
            </FieldBlock>
          </>
        )}

        {/* ——— Шаг 2: академика ————————————————————————————————— */}
        {step === 1 && (
          <>
            <FieldBlock
              title="Как в целом с успеваемостью?"
              hint="Честная самооценка — она влияет только на точность подбора."
            >
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    { id: "top", label: "Один из лучших в классе", hint: "стабильно высшие оценки" },
                    { id: "high", label: "Выше среднего", hint: "хорошо, с редкими провалами" },
                    { id: "mid", label: "Средне", hint: "по-разному от предмета к предмету" },
                    { id: "developing", label: "Есть куда расти", hint: "сейчас подтягиваюсь" },
                  ] as const
                ).map((option) => (
                  <OptionCard
                    key={option.id}
                    single
                    selected={profile.academics.gpaBand === option.id}
                    onSelect={() => patchAcademics({ gpaBand: option.id })}
                    title={option.label}
                    hint={option.hint}
                  />
                ))}
              </div>
            </FieldBlock>

            {profile.track === "IB" && (
              <FieldBlock
                title="Предсказанные баллы IB"
                hint="Если ещё нет — оставьте пустым, подбор посчитается по успеваемости."
              >
                <NumberField
                  ariaLabel="Предсказанные баллы IB"
                  value={profile.academics.predictedIB}
                  onChange={(predictedIB) => patchAcademics({ predictedIB })}
                  placeholder="например, 36"
                  suffix="из 45"
                  min={24}
                  max={45}
                />
              </FieldBlock>
            )}

            <FieldBlock
              title="Балл ЕНТ"
              hint="Нужен для казахстанских вузов и грантового конкурса."
            >
              <NumberField
                ariaLabel="Балл ЕНТ"
                value={profile.academics.entScore}
                onChange={(entScore) => patchAcademics({ entScore })}
                placeholder="если сдавали или знаете пробный"
                suffix="из 140"
                min={0}
                max={140}
              />
            </FieldBlock>

            <FieldBlock title="Балл SAT" hint="Требуется частью зарубежных программ.">
              <NumberField
                ariaLabel="Балл SAT"
                value={profile.academics.satScore}
                onChange={(satScore) => patchAcademics({ satScore })}
                placeholder="если сдавали"
                suffix="из 1600"
                min={400}
                max={1600}
                step={10}
              />
            </FieldBlock>

            <FieldBlock
              title="Сильные предметы"
              hint="До шести. На них будет опираться мотивационное эссе."
            >
              <TagInput
                values={profile.academics.strongSubjects}
                onChange={(strongSubjects) => patchAcademics({ strongSubjects })}
                suggestions={SUBJECT_SUGGESTIONS}
                placeholder="Введите предмет и нажмите Enter"
              />
            </FieldBlock>
          </>
        )}

        {/* ——— Шаг 3: языки ——————————————————————————————————— */}
        {step === 2 && (
          <>
            <FieldBlock
              title="Есть ли официальный результат IELTS?"
              hint="Оставьте пустым, если теста ещё нет — он попадёт в план как задача."
            >
              <NumberField
                ariaLabel="Балл IELTS"
                value={profile.languages.ielts}
                onChange={(ielts) => patchLanguages({ ielts })}
                placeholder="например, 7.0"
                suffix="из 9"
                min={1}
                max={9}
                step={0.5}
              />
            </FieldBlock>

            <FieldBlock title="Или TOEFL iBT" hint="Если сдавали TOEFL вместо IELTS.">
              <NumberField
                ariaLabel="Балл TOEFL"
                value={profile.languages.toefl}
                onChange={(toefl) => patchLanguages({ toefl })}
                placeholder="например, 95"
                suffix="из 120"
                min={0}
                max={120}
              />
            </FieldBlock>

            {!profile.languages.ielts && !profile.languages.toefl && (
              <FieldBlock
                title="Как оцениваете свой английский?"
                hint="Пока нет теста, это единственный ориентир по языку."
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      { id: "advanced", label: "Свободно", hint: "учусь или общаюсь на английском" },
                      { id: "intermediate", label: "Средний", hint: "понимаю, но нужна практика" },
                      { id: "basic", label: "Базовый", hint: "простые тексты и фразы" },
                      { id: "none", label: "Почти нет", hint: "начинаю с нуля" },
                    ] as const
                  ).map((option) => (
                    <OptionCard
                      key={option.id}
                      single
                      selected={profile.languages.englishSelf === option.id}
                      onSelect={() => patchLanguages({ englishSelf: option.id })}
                      title={option.label}
                      hint={option.hint}
                    />
                  ))}
                </div>
              </FieldBlock>
            )}

            <FieldBlock title="Казахский и русский" hint="Открывает программы на местных языках.">
              <div className="space-y-2">
                <Segmented
                  ariaLabel="Уровень казахского"
                  value={profile.languages.kazakh}
                  onChange={(kazakh) => patchLanguages({ kazakh })}
                  options={[
                    { value: "fluent", label: "Қазақша: свободно" },
                    { value: "basic", label: "Базовый" },
                    { value: "none", label: "Нет" },
                  ]}
                />
                <Segmented
                  ariaLabel="Уровень русского"
                  value={profile.languages.russian}
                  onChange={(russian) => patchLanguages({ russian })}
                  options={[
                    { value: "fluent", label: "Русский: свободно" },
                    { value: "basic", label: "Базовый" },
                    { value: "none", label: "Нет" },
                  ]}
                />
              </div>
            </FieldBlock>
          </>
        )}

        {/* ——— Шаг 4: направление ————————————————————————————— */}
        {step === 3 && (
          <>
            <FieldBlock
              title="Что хотите изучать?"
              hint="До четырёх направлений. Чем уже выбор, тем точнее подбор."
              error={
                profile.preferences.fields.length === 0
                  ? "Выберите хотя бы одно направление"
                  : undefined
              }
            >
              <div className="grid gap-2 sm:grid-cols-2">
                {FIELD_IDS.map((id) => (
                  <OptionCard
                    key={id}
                    compact
                    selected={profile.preferences.fields.includes(id)}
                    onSelect={() => toggleField(id)}
                    title={FIELDS[id].label}
                    hint={FIELDS[id].hint}
                    disabled={
                      !profile.preferences.fields.includes(id) &&
                      profile.preferences.fields.length >= 4
                    }
                  />
                ))}
              </div>
            </FieldBlock>

            <FieldBlock
              title="Где рассматриваете обучение?"
              hint="Можно выбрать несколько стран."
              error={
                profile.preferences.countries.length === 0
                  ? "Выберите хотя бы одну страну"
                  : undefined
              }
            >
              <div className="grid gap-2 sm:grid-cols-2">
                {COUNTRY_IDS.map((id) => (
                  <OptionCard
                    key={id}
                    compact
                    selected={profile.preferences.countries.includes(id)}
                    onSelect={() => toggleCountry(id)}
                    title={COUNTRIES[id].label}
                    hint={COUNTRIES[id].note}
                  />
                ))}
              </div>
            </FieldBlock>
          </>
        )}

        {/* ——— Шаг 5: условия ————————————————————————————————— */}
        {step === 4 && (
          <>
            <FieldBlock
              title="Сколько готовы платить за обучение в год?"
              hint="Только обучение, без проживания."
            >
              <RangeField
                ariaLabel="Бюджет на обучение в год"
                value={profile.budget.annualTuitionUSD}
                onChange={(annualTuitionUSD) => patchBudget({ annualTuitionUSD })}
                min={0}
                max={60000}
                step={500}
                format={(v) => (v === 0 ? "только грант" : formatUSD(v))}
              />
            </FieldBlock>

            <FieldBlock
              title="Бюджет на проживание в год"
              hint="Жильё, еда, транспорт — считается вместе с обучением."
            >
              <RangeField
                ariaLabel="Бюджет на проживание в год"
                value={profile.budget.livingCoveredUSD}
                onChange={(livingCoveredUSD) => patchBudget({ livingCoveredUSD })}
                min={0}
                max={30000}
                step={500}
                format={formatUSD}
              />
            </FieldBlock>

            <FieldBlock title="Ограничения" hint="Это заметно меняет выдачу.">
              <div className="space-y-2">
                <ToggleField
                  checked={profile.budget.needsFunding}
                  onChange={(needsFunding) => patchBudget({ needsFunding })}
                  title="Без стипендии вариант нереален"
                  hint="Программы без заявленного финансирования опустятся ниже."
                />
                <ToggleField
                  checked={profile.preferences.preferCloseToHome}
                  onChange={(preferCloseToHome) => patchPreferences({ preferCloseToHome })}
                  title="Хочу остаться ближе к дому"
                  hint="Казахстанские программы получат приоритет."
                />
                <ToggleField
                  checked={profile.preferences.needsDorm}
                  onChange={(needsDorm) => patchPreferences({ needsDorm })}
                  title="Нужно общежитие"
                  hint="Учитывается, гарантирует ли вуз место первокурсникам."
                />
              </div>
            </FieldBlock>

            <FieldBlock title="Формат кампуса" hint="Необязательно, но уточняет подбор.">
              <Segmented
                ariaLabel="Предпочтение по кампусу"
                value={profile.preferences.campusPreference}
                onChange={(campusPreference) => patchPreferences({ campusPreference })}
                options={[
                  { value: "any", label: "Неважно" },
                  { value: "big", label: "Большой кампус" },
                  { value: "compact", label: "Компактный" },
                ]}
              />
            </FieldBlock>

            <FieldBlock
              title="Что для вас важно?"
              hint="Своими словами. Попадёт в разбор профиля."
            >
              <TextareaField
                ariaLabel="Комментарий к профилю"
                value={profile.note ?? ""}
                onChange={(note) => setProfile({ note })}
                placeholder="Например: хочу сильную инженерную программу, но обязательно со стипендией"
              />
            </FieldBlock>
          </>
        )}
      </Card>

      {stepError && (
        <p className="mt-4 text-[13px] font-medium text-danger">{stepError}</p>
      )}

      {/* ——— Навигация ————————————————————————————————————————— */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => {
            if (step === 0) {
              router.push("/");
              return;
            }
            setStep(step - 1);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          Назад
        </Button>

        <Button onClick={next} disabled={Boolean(stepError)} size="lg">
          {step === STEPS.length - 1 ? "Получить разбор" : "Далее"}
          <svg viewBox="0 0 16 16" className="size-4 fill-none stroke-current" strokeWidth={2}>
            <path d="M2 8h11M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Button>
      </div>
    </div>
  );
}
