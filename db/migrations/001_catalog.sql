-- ============================================================================
-- 001 — каталог программ
--
-- Схема повторяет доменный тип Program (src/lib/domain/types.ts) один в один:
-- меняется источник данных, а не форма. Раскладка осознанная:
--   • то, по чему фильтруют и группируют, — отдельные колонки с CHECK
--     под доменные объединения: невалидное направление или страна в базу
--     просто не лягут;
--   • вложенные объекты (requirements, costs) — jsonb: они читаются целиком,
--     разворачивать их в два десятка nullable-колонок смысла нет;
--   • source разворачивается в три NOT NULL колонки.
--
-- Последнее — главное решение этой миграции. Честность происхождения данных
-- (README §7) перестаёт быть договорённостью команды и становится
-- ограничением схемы: программу без ссылки на первоисточник и даты фиксации
-- физически нельзя записать, ни через API, ни руками через psql.
-- ============================================================================

create table if not exists programs (
  id                        text primary key,

  university                text not null check (length(trim(university)) > 0),
  university_short          text not null check (length(trim(university_short)) > 0),
  country                   text not null check (country in (
                              'KZ','GB','TR','AE','KR','NL','CZ','PL','HK','MY')),
  city                      text not null,
  program                   text not null check (length(trim(program)) > 0),

  field                     text not null check (field in (
                              'cs','engineering','business','economics','law','medicine',
                              'natural-sciences','social-sciences','design','education','media')),
  secondary_fields          text[] not null default '{}' check (secondary_fields <@ array[
                              'cs','engineering','business','economics','law','medicine',
                              'natural-sciences','social-sciences','design','education','media']::text[]),

  degree                    text not null default 'bachelor' check (degree = 'bachelor'),
  instruction_language      text[] not null check (
                              array_length(instruction_language, 1) >= 1
                              and instruction_language <@ array['kk','ru','en','tr']::text[]),
  duration_years            numeric(3,1) not null check (duration_years > 0 and duration_years <= 10),

  -- Вложенные объекты домена. Форма гарантируется Zod-схемой на чтении
  -- (src/lib/data/schema.ts), здесь — только базовая защита от мусора.
  requirements              jsonb not null default '{}'::jsonb
                              check (jsonb_typeof(requirements) = 'object'),
  costs                     jsonb not null
                              check (jsonb_typeof(costs) = 'object'
                                     and costs ? 'tuitionUSDPerYear'
                                     and costs ? 'livingUSDPerYear'
                                     and costs ? 'fundingAvailable'),

  application_deadline_month smallint not null check (application_deadline_month between 1 and 12),
  application_deadline_note  text not null,
  intake_month               smallint not null check (intake_month between 1 and 12),

  campus_size               text not null check (campus_size in ('big','compact')),
  dorm_guaranteed           boolean not null,
  reputation_band           text not null check (reputation_band in ('global-top','strong','regional')),
  highlights                text[] not null default '{}',

  -- ——— Честность данных ———————————————————————————————————————————————
  source_label              text not null check (length(trim(source_label)) > 0),
  source_url                text not null check (source_url ~* '^https?://'),
  source_checked_on         date not null,
  data_confidence           text not null default 'demo'
                              check (data_confidence in ('verified','demo')),

  -- Запись можно снять с витрины, не теряя историю и ссылку на источник.
  published                 boolean not null default true,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- Витрина всегда читается целиком по published; остальные индексы — под
-- фильтры API (?country=, ?field=).
create index if not exists programs_published_idx on programs (published);
create index if not exists programs_country_idx   on programs (country);
create index if not exists programs_field_idx     on programs (field);

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists programs_set_updated_at on programs;
create trigger programs_set_updated_at
  before update on programs
  for each row execute function set_updated_at();
