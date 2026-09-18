import type { PoolClient } from "pg";
import { query, queryOne } from "./client";
import { parseProgram, type ProgramPatch } from "@/lib/data/schema";
import type { Program } from "@/lib/domain/types";

/* ============================================================================
   РЕПОЗИТОРИЙ КАТАЛОГА

   Единственное место, где snake_case строки Postgres превращаются в доменный
   Program и обратно. Всё, что выходит отсюда наружу, уже прошло Zod: движок
   подбора получает либо корректную запись, либо не получает её вовсе.

   Только серверный модуль: импортирует драйвер.
   ========================================================================= */

interface ProgramRow {
  id: string;
  university: string;
  university_short: string;
  country: string;
  city: string;
  program: string;
  field: string;
  secondary_fields: string[];
  degree: string;
  instruction_language: string[];
  duration_years: string;
  requirements: Record<string, unknown>;
  costs: Record<string, unknown>;
  application_deadline_month: number;
  application_deadline_note: string;
  intake_month: number;
  campus_size: string;
  dorm_guaranteed: boolean;
  reputation_band: string;
  highlights: string[];
  source_label: string;
  source_url: string;
  source_checked_on: string;
  data_confidence: string;
}

/* numeric приезжает из pg строкой, date — объектом Date; поэтому duration
   приводим руками, а дату форматируем прямо в запросе, чтобы не ловить
   сдвиг часового пояса на границе суток. */
const SELECT_COLUMNS = `
  id, university, university_short, country, city, program,
  field, secondary_fields, degree, instruction_language, duration_years,
  requirements, costs,
  application_deadline_month, application_deadline_note, intake_month,
  campus_size, dorm_guaranteed, reputation_band, highlights,
  source_label, source_url,
  to_char(source_checked_on, 'YYYY-MM-DD') as source_checked_on,
  data_confidence
`;

function rowToProgram(row: ProgramRow): Program | null {
  return parseProgram({
    id: row.id,
    university: row.university,
    universityShort: row.university_short,
    country: row.country,
    city: row.city,
    program: row.program,
    field: row.field,
    secondaryFields: row.secondary_fields,
    degree: row.degree,
    instructionLanguage: row.instruction_language,
    durationYears: Number(row.duration_years),
    requirements: row.requirements,
    costs: row.costs,
    applicationDeadlineMonth: row.application_deadline_month,
    applicationDeadlineNote: row.application_deadline_note,
    intakeMonth: row.intake_month,
    campusSize: row.campus_size,
    dormGuaranteed: row.dorm_guaranteed,
    reputationBand: row.reputation_band,
    highlights: row.highlights,
    source: {
      label: row.source_label,
      url: row.source_url,
      checkedOn: row.source_checked_on,
    },
    dataConfidence: row.data_confidence,
  });
}

export interface ListFilters {
  country?: string;
  field?: string;
  /** По умолчанию отдаём только опубликованные — витрина, а не админка. */
  includeUnpublished?: boolean;
}

export async function listPrograms(filters: ListFilters = {}): Promise<Program[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (!filters.includeUnpublished) where.push("published = true");
  if (filters.country) {
    params.push(filters.country);
    where.push(`country = $${params.length}`);
  }
  if (filters.field) {
    params.push(filters.field);
    // Направление совпадает и как основное, и как дополнительное — так же,
    // как это трактует движок подбора.
    where.push(`(field = $${params.length} or $${params.length} = any(secondary_fields))`);
  }

  const rows = await query<ProgramRow>(
    `select ${SELECT_COLUMNS} from programs
     ${where.length ? `where ${where.join(" and ")}` : ""}
     order by id`,
    params,
  );

  return rows.map(rowToProgram).filter((p): p is Program => p !== null);
}

export async function getProgram(id: string): Promise<Program | null> {
  const row = await queryOne<ProgramRow>(
    `select ${SELECT_COLUMNS} from programs where id = $1`,
    [id],
  );
  return row ? rowToProgram(row) : null;
}

/** Значения в порядке колонок INSERT/UPSERT. */
function programToValues(p: Program): unknown[] {
  return [
    p.id,
    p.university,
    p.universityShort,
    p.country,
    p.city,
    p.program,
    p.field,
    p.secondaryFields,
    p.degree,
    p.instructionLanguage,
    p.durationYears,
    JSON.stringify(p.requirements),
    JSON.stringify(p.costs),
    p.applicationDeadlineMonth,
    p.applicationDeadlineNote,
    p.intakeMonth,
    p.campusSize,
    p.dormGuaranteed,
    p.reputationBand,
    p.highlights,
    p.source.label,
    p.source.url,
    p.source.checkedOn,
    p.dataConfidence,
  ];
}

const UPSERT_SQL = `
  insert into programs (
    id, university, university_short, country, city, program,
    field, secondary_fields, degree, instruction_language, duration_years,
    requirements, costs,
    application_deadline_month, application_deadline_note, intake_month,
    campus_size, dorm_guaranteed, reputation_band, highlights,
    source_label, source_url, source_checked_on, data_confidence
  ) values (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
  )
`;

/** Создание. Конфликт по id — ошибка: перезапись делается через PATCH. */
export async function insertProgram(program: Program): Promise<void> {
  await query(UPSERT_SQL, programToValues(program));
}

/** Идемпотентная запись — нужна сиду, который гоняют сколько угодно раз. */
export async function upsertProgram(
  program: Program,
  client?: PoolClient,
): Promise<void> {
  const sql = `${UPSERT_SQL}
    on conflict (id) do update set
      university = excluded.university,
      university_short = excluded.university_short,
      country = excluded.country,
      city = excluded.city,
      program = excluded.program,
      field = excluded.field,
      secondary_fields = excluded.secondary_fields,
      degree = excluded.degree,
      instruction_language = excluded.instruction_language,
      duration_years = excluded.duration_years,
      requirements = excluded.requirements,
      costs = excluded.costs,
      application_deadline_month = excluded.application_deadline_month,
      application_deadline_note = excluded.application_deadline_note,
      intake_month = excluded.intake_month,
      campus_size = excluded.campus_size,
      dorm_guaranteed = excluded.dorm_guaranteed,
      reputation_band = excluded.reputation_band,
      highlights = excluded.highlights,
      source_label = excluded.source_label,
      source_url = excluded.source_url,
      source_checked_on = excluded.source_checked_on,
      data_confidence = excluded.data_confidence`;

  const values = programToValues(program);
  if (client) {
    await client.query(sql, values);
    return;
  }
  await query(sql, values);
}

/** Соответствие полей домена колонкам — для частичного обновления. */
const PATCH_COLUMNS: Record<string, { column: string; toParam: (v: unknown) => unknown }> = {
  university: { column: "university", toParam: (v) => v },
  universityShort: { column: "university_short", toParam: (v) => v },
  country: { column: "country", toParam: (v) => v },
  city: { column: "city", toParam: (v) => v },
  program: { column: "program", toParam: (v) => v },
  field: { column: "field", toParam: (v) => v },
  secondaryFields: { column: "secondary_fields", toParam: (v) => v },
  degree: { column: "degree", toParam: (v) => v },
  instructionLanguage: { column: "instruction_language", toParam: (v) => v },
  durationYears: { column: "duration_years", toParam: (v) => v },
  requirements: { column: "requirements", toParam: (v) => JSON.stringify(v) },
  costs: { column: "costs", toParam: (v) => JSON.stringify(v) },
  applicationDeadlineMonth: { column: "application_deadline_month", toParam: (v) => v },
  applicationDeadlineNote: { column: "application_deadline_note", toParam: (v) => v },
  intakeMonth: { column: "intake_month", toParam: (v) => v },
  campusSize: { column: "campus_size", toParam: (v) => v },
  dormGuaranteed: { column: "dorm_guaranteed", toParam: (v) => v },
  reputationBand: { column: "reputation_band", toParam: (v) => v },
  highlights: { column: "highlights", toParam: (v) => v },
  dataConfidence: { column: "data_confidence", toParam: (v) => v },
};

export async function updateProgram(
  id: string,
  patch: ProgramPatch,
): Promise<Program | null> {
  const sets: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;

    // source приходит одним объектом, а лежит в трёх колонках.
    if (key === "source") {
      const source = value as Program["source"];
      params.push(source.label, source.url, source.checkedOn);
      sets.push(
        `source_label = $${params.length - 2}`,
        `source_url = $${params.length - 1}`,
        `source_checked_on = $${params.length}`,
      );
      continue;
    }

    const mapping = PATCH_COLUMNS[key];
    if (!mapping) continue;
    params.push(mapping.toParam(value));
    sets.push(`${mapping.column} = $${params.length}`);
  }

  if (sets.length === 0) return getProgram(id);

  params.push(id);
  const row = await queryOne<ProgramRow>(
    `update programs set ${sets.join(", ")} where id = $${params.length}
     returning ${SELECT_COLUMNS}`,
    params,
  );
  return row ? rowToProgram(row) : null;
}

export async function deleteProgram(id: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    "delete from programs where id = $1 returning id",
    [id],
  );
  return Boolean(row);
}

export async function countPrograms(): Promise<number> {
  const row = await queryOne<{ count: string }>(
    "select count(*)::text as count from programs where published = true",
  );
  return Number(row?.count ?? 0);
}
