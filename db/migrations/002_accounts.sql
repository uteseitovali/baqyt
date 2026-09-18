-- ============================================================================
-- 002 — аккаунты и состояние пути
--
-- Одна строка journeys на пользователя. Форма повторяет то, что сегодня лежит
-- в localStorage (src/lib/store/journey.ts), поэтому перенос — это перенос,
-- а не переосмысление: гость и вошедший пользователь работают с одинаковым
-- состоянием, отличается только место хранения.
--
-- profile хранится jsonb целиком, а не разложенным по колонкам. Причина:
-- профиль — вход доменной функции, его читают и пишут только целиком, а
-- версионирование (Profile.version) уже встроено в сам объект. Раскладка по
-- тридцати nullable-колонкам добавила бы миграцию на каждое поле анкеты и
-- ничего не дала бы взамен: по профилю не ищут и не агрегируют.
-- ============================================================================

create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  -- Регистр и пробелы нормализуются в приложении до вставки.
  email         text not null unique check (position('@' in email) > 1),
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists journeys (
  user_id           uuid primary key references users(id) on delete cascade,

  profile           jsonb   not null check (jsonb_typeof(profile) = 'object'),
  profile_completed boolean not null default false,
  visited_steps     text[]  not null default '{intro}',
  shortlist         text[]  not null default '{}' check (array_length(shortlist, 1) is null
                                                         or array_length(shortlist, 1) <= 3),
  active_program_id text,
  completed_tasks   jsonb   not null default '{}'::jsonb
                              check (jsonb_typeof(completed_tasks) = 'object'),
  revisions         integer not null default 0 check (revisions >= 0),

  -- Опорная точка мерджа: чей профиль свежее при входе с двух устройств.
  updated_at        timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

-- Намеренно БЕЗ внешнего ключа на programs. Каталог живёт своей жизнью:
-- программу могут снять с витрины или переименовать её источник, и это не
-- повод удалять сохранённый маршрут человека. Несуществующий id
-- отфильтровывается на чтении (getProgramsByIds), пустой экран объяснён в UI.

drop trigger if exists journeys_set_updated_at on journeys;
create trigger journeys_set_updated_at
  before update on journeys
  for each row execute function set_updated_at();
