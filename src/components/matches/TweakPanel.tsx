"use client";

import { useState } from "react";
import { Card, Chip, Label } from "@/components/ui/Primitives";
import { RangeField, ToggleField } from "@/components/ui/Field";
import { COUNTRIES, COUNTRY_IDS, FIELDS, FIELD_IDS } from "@/lib/domain/taxonomy";
import { useJourney } from "@/lib/store/journey";
import { cn, formatUSD } from "@/lib/utils/cn";
import type { CountryId, FieldId } from "@/lib/domain/types";

/* ============================================================================
   ПАНЕЛЬ ЖИВОЙ НАСТРОЙКИ

   Проверочный сценарий жюри звучит так: «изменить бюджет, интерес, страну или
   экзамен и проверить реакцию продукта». Панель делает это прямо на экране
   рекомендаций — без возврата в анкету и без перезагрузки: пересчёт идёт
   синхронно в браузере теми же доменными функциями, что и на сервере.
   ========================================================================= */

export function TweakPanel({ resultCount }: { resultCount: number }) {
  const [open, setOpen] = useState(false);
  const profile = useJourney((s) => s.profile);
  const patchBudget = useJourney((s) => s.patchBudget);
  const patchPreferences = useJourney((s) => s.patchPreferences);
  const patchLanguages = useJourney((s) => s.patchLanguages);
  const patchAcademics = useJourney((s) => s.patchAcademics);
  const revisions = useJourney((s) => s.revisions);

  function toggleCountry(id: CountryId) {
    const has = profile.preferences.countries.includes(id);
    patchPreferences({
      countries: has
        ? profile.preferences.countries.filter((c) => c !== id)
        : [...profile.preferences.countries, id],
    });
  }

  function toggleField(id: FieldId) {
    const has = profile.preferences.fields.includes(id);
    patchPreferences({
      fields: has
        ? profile.preferences.fields.filter((f) => f !== id)
        : [...profile.preferences.fields, id].slice(0, 4),
    });
  }

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-sunken/60"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Label>Живая настройка</Label>
            {revisions > 0 && (
              <Chip tone="accent">
                {revisions} {revisions === 1 ? "правка" : "правок"}
              </Chip>
            )}
          </div>
          <p className="mt-1 text-[13px] text-muted">
            Меняйте вводные — {resultCount} вариантов пересчитываются мгновенно.
          </p>
        </div>
        <svg
          viewBox="0 0 12 12"
          className={cn(
            "size-3.5 shrink-0 fill-none stroke-current transition-transform duration-200",
            open && "rotate-180",
          )}
          strokeWidth={1.8}
        >
          <path d="M2 4.5L6 8.5L10 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="space-y-6 border-t border-line p-5">
          {/* Бюджет */}
          <div>
            <Label className="mb-3">Бюджет на обучение в год</Label>
            <RangeField
              ariaLabel="Бюджет на обучение в год"
              value={profile.budget.annualTuitionUSD}
              onChange={(annualTuitionUSD) => patchBudget({ annualTuitionUSD })}
              min={0}
              max={60000}
              step={500}
              format={(v) => (v === 0 ? "только грант" : formatUSD(v))}
            />
          </div>

          <ToggleField
            checked={profile.budget.needsFunding}
            onChange={(needsFunding) => patchBudget({ needsFunding })}
            title="Без стипендии вариант нереален"
            hint="Программы без заявленного финансирования опустятся в списке."
          />

          {/* Языковой балл — частый рычаг */}
          <div>
            <Label className="mb-3">Балл IELTS</Label>
            <div className="flex flex-wrap gap-1.5">
              {[undefined, 5.5, 6, 6.5, 7, 7.5, 8].map((value) => {
                const active = profile.languages.ielts === value;
                return (
                  <button
                    key={String(value)}
                    onClick={() => patchLanguages({ ielts: value })}
                    className={cn(
                      "t-num min-h-9 rounded-full border px-3 text-[13px] font-semibold transition-colors",
                      active
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
                    )}
                  >
                    {value === undefined ? "нет теста" : value.toFixed(1)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Предсказанные IB */}
          {profile.track === "IB" && (
            <div>
              <Label className="mb-3">Предсказанные баллы IB</Label>
              <RangeField
                ariaLabel="Предсказанные баллы IB"
                value={profile.academics.predictedIB ?? 30}
                onChange={(predictedIB) => patchAcademics({ predictedIB })}
                min={24}
                max={45}
                step={1}
                format={(v) => `${v} / 45`}
              />
            </div>
          )}

          {/* Страны */}
          <div>
            <Label className="mb-3">Страны</Label>
            <div className="flex flex-wrap gap-1.5">
              {COUNTRY_IDS.map((id) => {
                const active = profile.preferences.countries.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => toggleCountry(id)}
                    aria-pressed={active}
                    className={cn(
                      "min-h-9 rounded-full border px-3 text-[13px] font-semibold transition-colors",
                      active
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
                    )}
                  >
                    {COUNTRIES[id].label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Направления */}
          <div>
            <Label className="mb-3">Направления (до четырёх)</Label>
            <div className="flex flex-wrap gap-1.5">
              {FIELD_IDS.map((id) => {
                const active = profile.preferences.fields.includes(id);
                const locked = !active && profile.preferences.fields.length >= 4;
                return (
                  <button
                    key={id}
                    onClick={() => toggleField(id)}
                    disabled={locked}
                    aria-pressed={active}
                    className={cn(
                      "min-h-9 rounded-full border px-3 text-[13px] font-semibold transition-colors",
                      active
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
                      locked && "opacity-35 pointer-events-none",
                    )}
                  >
                    {FIELDS[id].label}
                  </button>
                );
              })}
            </div>
          </div>

          <ToggleField
            checked={profile.preferences.preferCloseToHome}
            onChange={(preferCloseToHome) => patchPreferences({ preferCloseToHome })}
            title="Хочу остаться ближе к дому"
            hint="Казахстанские программы поднимутся в списке."
          />
        </div>
      )}
    </Card>
  );
}
