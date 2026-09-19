import { ButtonLink } from "@/components/ui/Button";
import {
  BandBadge,
  Card,
  ConfidenceTag,
  Label,
  ScoreRing,
  SectionHeading,
} from "@/components/ui/Primitives";
import { BANDS, COUNTRIES } from "@/lib/domain/taxonomy";
import {
  FALLBACK_REASON_LINE,
  REASON_LINES,
  type ResolvedShareProgram,
} from "@/lib/share/summary";
import type { AdmissionBand } from "@/lib/domain/types";

/**
 * Пояснение полосы для читателя-родителя. Формулировки из BANDS адресованы
 * самому абитуриенту («ваши показатели»), а здесь читает другой человек.
 */
const BAND_FOR_FAMILY: Record<AdmissionBand, string> = {
  safe: "Показатели абитуриента заметно выше опубликованного минимума программы.",
  target: "Показатели абитуриента примерно на уровне опубликованных требований.",
  reach:
    "Потребуется заметный рост показателей или сильная внеучебная часть — подавать стоит, но не рассчитывая только на этот вариант.",
};

/* ============================================================================
   СВОДКА ТОЛЬКО ДЛЯ ЧТЕНИЯ

   Одна и та же для обоих путей: серверная страница /shared/[slug] и
   клиентская /shared?d=... отдают сюда уже разобранные и сверенные с каталогом
   программы. Ни хуков, ни записи в стор, ни кнопок «сохранить»: человек по
   ссылке смотрит, а не меняет чужой путь.

   Все тексты — из таблиц кода и каталога. Из самой сводки сюда попадают только
   оценка, полоса и ключи причин, поэтому подделанная ссылка не может показать
   произвольную строку.
   ========================================================================= */

export type SummarySource =
  /** Лежит на сервере, у ссылки есть срок. */
  | { kind: "stored"; expiresAt: string }
  /** Зашита в сам адрес; сервер её не хранил и не проверял. */
  | { kind: "link" };

const DATE_FORMAT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  // Один часовой пояс: дата не должна отличаться на сервере и у читателя.
  timeZone: "UTC",
});

export function SharedSummary({
  items,
  dropped,
  source,
}: {
  items: ResolvedShareProgram[];
  /** Сколько программ из сводки не нашлось в каталоге. */
  dropped: number;
  source: SummarySource;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <SectionHeading
        label="Подборка от абитуриента"
        title="Программы, которые рассматривает ваш близкий"
        description="Это краткая сводка: три программы, насколько они подходят и почему. Личные данные анкеты — баллы, бюджет, заметки — в ссылку не входят."
      />

      <ol className="mt-8 space-y-4">
        {items.map((item, index) => (
          <li key={item.programId}>
            <ProgramRow item={item} rank={index + 1} />
          </li>
        ))}
      </ol>

      {dropped > 0 && (
        <p className="mt-4 text-[13px] text-muted">
          {dropped === 1
            ? "Одной программы из сводки больше нет в каталоге, поэтому она не показана."
            : `${dropped} программ из сводки больше нет в каталоге, поэтому они не показаны.`}
        </p>
      )}

      <Card className="mt-8 bg-sunken/60 p-5">
        <Label className="mb-2">Как читать оценку</Label>
        <p className="t-body text-[13.5px] text-muted">
          Это соответствие опубликованным требованиям программы, а не прогноз
          решения приёмной комиссии. Каталог — демонстрационный срез: требования,
          стоимость и сроки подачи меняются каждый цикл, их нужно подтвердить на
          официальном сайте вуза.
        </p>
        <p className="t-body mt-3 text-[13.5px] text-muted">
          <SourceNote source={source} />
        </p>
      </Card>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="t-body text-[13.5px] text-muted">
          Хотите такой же разбор для себя? Он занимает несколько минут.
        </p>
        <ButtonLink href="/" variant="outline">
          Составить свой маршрут
        </ButtonLink>
      </div>
    </div>
  );
}

function ProgramRow({ item, rank }: { item: ResolvedShareProgram; rank: number }) {
  const { program } = item;
  const lines =
    item.reasons.length > 0
      ? item.reasons.map((id) => REASON_LINES[id])
      : [FALLBACK_REASON_LINE];

  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="t-label">№ {rank}</span>
            <BandBadge band={item.band} />
          </div>
          <h3 className="t-title mt-2.5 text-[18px] leading-tight">{program.program}</h3>
          <p className="mt-1 text-[13.5px] text-muted">
            {program.university} · {program.city}, {COUNTRIES[program.country].label}
          </p>
        </div>
        <ScoreRing score={item.score} />
      </div>

      <div className="mt-4">
        <Label className="mb-2">Почему подходит</Label>
        <ul className="space-y-1.5">
          {lines.map((line) => (
            <li key={line} className="flex gap-2 text-[13.5px] leading-snug">
              <span className="mt-[7px] size-1 shrink-0 rounded-full bg-f-strong" aria-hidden />
              <span className="text-muted">{line}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-4 text-[12.5px] text-muted">
        <span className="font-semibold text-ink">{BANDS[item.band].label}:</span>{" "}
        {BAND_FOR_FAMILY[item.band]}
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3.5">
        <p className="text-[12.5px] text-muted">{program.applicationDeadlineNote}</p>
        <ConfidenceTag confidence={program.dataConfidence} source={program.source} />
      </div>
    </Card>
  );
}

/** Честная пометка происхождения — как «источник данных» в каталоге. */
function SourceNote({ source }: { source: SummarySource }) {
  if (source.kind === "stored") {
    return (
      <>
        Ссылка действует до {DATE_FORMAT.format(new Date(source.expiresAt))}. Сводка
        хранится на сервере Bagyt без анкеты и без имени автора.
      </>
    );
  }
  return (
    <>
      Эта сводка зашита в саму ссылку: Bagyt её не хранит и не проверял, а оценки
      посчитаны на устройстве отправителя. Названия и условия программ подставлены
      из каталога.
    </>
  );
}
