"use client";

import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, Chip, Label } from "@/components/ui/Primitives";
import { useJourney } from "@/lib/store/journey";
import { CATALOG_META } from "@/lib/data/programs";
import { JOURNEY } from "@/lib/domain/taxonomy";

/* ============================================================================
   ЭТАП 1 — ВХОД
   Задача экрана: за 15 секунд объяснить ценность и ожидаемый результат,
   и дать два входа — полный путь и мгновенное демо для жюри.
   ========================================================================= */

const DELIVERABLES = [
  {
    title: "Разбор профиля",
    body: "Сильные стороны, пробелы и образовательная цель — сформулированные, а не в виде анкеты обратно.",
  },
  {
    title: "Объяснённые рекомендации",
    body: "Каждая программа приходит с разбором по семи факторам: видно, что именно её подняло в списке.",
  },
  {
    title: "План до дедлайна",
    body: "Экзамены, документы, эссе и подача с ориентировочными сроками, посчитанными от окна подачи вуза.",
  },
];

export default function IntroPage() {
  const router = useRouter();
  const loadDemoProfile = useJourney((s) => s.loadDemoProfile);
  const profileCompleted = useJourney((s) => s.profileCompleted);

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
            Поступление 2026–2027
          </Chip>

          <h1 className="t-display text-[40px] sm:text-[58px] lg:text-[66px]">
            Не список университетов,
            <br />
            <span className="text-accent">а маршрут до подачи.</span>
          </h1>

          <p className="t-body mt-6 max-w-xl text-[16px] text-muted sm:text-[17.5px]">
            Короткая анкета — и вы получаете разбор своего профиля, программы,
            подобранные под ваши баллы и бюджет с объяснением каждого совпадения,
            и пошаговый план с ближайшим действием на сегодня.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <ButtonLink href="/profile" size="lg">
              {profileCompleted ? "Продолжить анкету" : "Начать за 5 минут"}
              <svg viewBox="0 0 16 16" className="size-4 fill-none stroke-current" strokeWidth={2}>
                <path d="M2 8h11M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </ButtonLink>

            <Button variant="outline" size="lg" onClick={runDemo}>
              Посмотреть на демо-профиле
            </Button>
          </div>

          <p className="mt-4 text-[12.5px] text-faint">
            Демо-профиль заполняет анкету за вас и сразу открывает результат — удобно,
            чтобы оценить продукт целиком.
          </p>
        </div>

        {/* Декоративная маршрутная линия */}
        <svg
          viewBox="0 0 400 200"
          className="pointer-events-none absolute -right-10 top-10 hidden h-[300px] w-[420px] opacity-[0.55] lg:block"
          aria-hidden
        >
          <path
            d="M20 170 L110 120 L200 140 L290 60 L380 30"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeDasharray="4 6"
            opacity="0.5"
          />
          {[
            [20, 170],
            [110, 120],
            [200, 140],
            [290, 60],
            [380, 30],
          ].map(([cx, cy], i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={i === 4 ? 7 : 4}
              fill={i === 4 ? "var(--accent)" : "var(--canvas)"}
              stroke="var(--accent)"
              strokeWidth="2"
            />
          ))}
        </svg>
      </section>

      {/* ——— Что получите ————————————————————————————————————————— */}
      <section className="border-t border-line pt-12">
        <Label className="mb-6">Что будет на выходе</Label>
        <div className="grid gap-4 md:grid-cols-3">
          {DELIVERABLES.map((item, index) => (
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
        <Label className="mb-6">Путь целиком — семь шагов</Label>
        <Card className="overflow-hidden p-0">
          <ol className="divide-y divide-line sm:grid sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
            {JOURNEY.map((step, index) => (
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
                    {STEP_BLURBS[index]}
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
              <Label className="mb-3">Честно о данных</Label>
              <p className="t-body text-[14.5px] text-muted">
                Bagyt не обещает поступление и не показывает шансы в процентах.
                Вместо этого каждая программа получает полосу «надёжный / целевой /
                амбициозный», построенную на сравнении ваших баллов с
                опубликованными требованиями, а рядом с каждой цифрой стоит ссылка
                на первоисточник и пометка о происхождении данных.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-1">
              <Stat value={String(CATALOG_META.total)} label="программ" />
              <Stat value={String(CATALOG_META.countries)} label="стран" />
              <Stat value="7" label="факторов подбора" />
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}

const STEP_BLURBS = [
  "Зачем это и что вы получите в конце.",
  "Класс, баллы, языки, бюджет и ограничения.",
  "Резюме профиля: сильные стороны и пробелы.",
  "Программы с разбором «почему подходит».",
  "Два-три варианта бок о бок по вашим параметрам.",
  "Экзамены, документы и дедлайны по датам.",
  "Один ближайший шаг и отметка прогресса.",
];

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[var(--r-sm)] border border-line bg-surface px-4 py-3">
      <p className="t-num text-[24px] font-extrabold leading-none">{value}</p>
      <p className="t-label mt-1.5">{label}</p>
    </div>
  );
}
