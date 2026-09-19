"use client";

import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, Chip, Label } from "@/components/ui/Primitives";
import { RouteMap } from "@/components/home/RouteMap";
import { useJourney } from "@/lib/store/journey";
import { CATALOG_META } from "@/lib/data/programs";
import { taxonomyFor } from "@/lib/domain/taxonomy";
import { landing } from "@/lib/i18n/dictionaries/landing";
import { useLocale, useTranslations } from "@/lib/i18n/react";

/* ============================================================================
   ЭТАП 1 — ВХОД
   Задача экрана: за 15 секунд объяснить ценность и ожидаемый результат,
   и дать два входа — полный путь и мгновенное демо для жюри.

   Весь текст экрана — в i18n/dictionaries/landing.ts. Это образец для
   остальных экранов: компонент не содержит ни одной русской строки.
   ========================================================================= */

export default function IntroPage() {
  const router = useRouter();
  const loadDemoProfile = useJourney((s) => s.loadDemoProfile);
  const profileCompleted = useJourney((s) => s.profileCompleted);
  const locale = useLocale();
  const t = useTranslations(landing);
  const { journey } = taxonomyFor(locale);

  function runDemo() {
    loadDemoProfile();
    router.push("/diagnosis");
  }

  return (
    <div className="mx-auto w-full max-w-[var(--page-max)] px-4 sm:px-6">
      {/* ——— Герой ——————————————————————————————————————————————— */}
      <section className="relative grain overflow-hidden pt-14 pb-16 sm:pt-20 sm:pb-20">
        <div className="relative z-10 max-w-3xl">
          <Chip tone="accent" className="mb-6">
            <span className="size-1.5 rounded-full bg-current" aria-hidden />
            {t.intakeChip}
          </Chip>

          <h1 className="t-display text-[40px] sm:text-[58px] lg:text-[66px]">
            {t.headline.lead}
            <br />
            <span className="text-accent">{t.headline.accent}</span>
          </h1>

          <p className="t-body mt-6 max-w-xl text-[16px] text-muted sm:text-[17.5px]">
            {t.lead}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <ButtonLink href="/profile" size="lg">
              {profileCompleted ? t.cta.continue : t.cta.start}
              <svg viewBox="0 0 16 16" className="size-4 fill-none stroke-current" strokeWidth={2}>
                <path d="M2 8h11M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </ButtonLink>

            <Button variant="outline" size="lg" onClick={runDemo}>
              {t.cta.demo}
            </Button>
          </div>

          <p className="mt-4 text-[12.5px] text-faint">{t.cta.demoHint}</p>
        </div>

        {/* Сигнатурная маршрутная линия: семь вех — семь шагов пути */}
        <RouteMap className="pointer-events-none absolute right-0 top-8 hidden h-[190px] w-[360px] opacity-[0.8] lg:block xl:h-[235px] xl:w-[460px]" />
      </section>

      {/* ——— Что получите ————————————————————————————————————————— */}
      <section className="border-t border-line pt-12">
        <Label className="mb-6">{t.deliverables.heading}</Label>
        <div className="grid gap-4 md:grid-cols-3">
          {t.deliverables.items.map((item, index) => (
            <Card key={item.title} className="p-5">
              <span className="t-num text-[13px] font-bold text-accent">
                0{index + 1}
              </span>
              <h3 className="t-title mt-3 text-[17px]">{item.title}</h3>
              <p className="t-body mt-2 text-[14px] text-muted">{item.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ——— Маршрут ——————————————————————————————————————————————— */}
      <section className="pt-14">
        <Label className="mb-6">{t.journey.heading}</Label>
        <Card className="overflow-hidden p-0">
          <ol className="divide-y divide-line sm:grid sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
            {journey.map((step, index) => (
              <li
                key={step.id}
                className="flex items-start gap-3.5 border-line p-5 sm:border-b lg:border-r"
              >
                <span className="t-num mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-accent-border bg-accent-soft text-[11px] font-bold text-accent">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[14.5px] font-semibold leading-tight">
                    {step.title}
                  </p>
                  <p className="mt-1 text-[12.5px] leading-snug text-muted">
                    {t.journey.blurbs[step.id]}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      {/* ——— Честность данных ————————————————————————————————————— */}
      <section className="pt-14">
        <Card className="bg-sunken/60 p-6 sm:p-8">
          <div className="grid gap-6 sm:grid-cols-[1.4fr_1fr] sm:items-center">
            <div>
              <Label className="mb-3">{t.honesty.heading}</Label>
              <p className="t-body text-[14.5px] text-muted">{t.honesty.body}</p>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-1">
              <Stat value={String(CATALOG_META.total)} label={t.honesty.stats.programs} />
              <Stat value={String(CATALOG_META.countries)} label={t.honesty.stats.countries} />
              <Stat value="7" label={t.honesty.stats.factors} />
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[var(--r-sm)] border border-line bg-surface px-4 py-3">
      <p className="t-num text-[24px] font-extrabold leading-none">{value}</p>
      <p className="t-label mt-1.5">{label}</p>
    </div>
  );
}
