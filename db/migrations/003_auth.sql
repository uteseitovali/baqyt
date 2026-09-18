-- ============================================================================
-- 003 — вход по одноразовому коду
--
-- Ни код, ни токен сессии не лежат в базе в открытом виде: хранятся только
-- SHA-256 хэши. Утечка дампа не даёт войти ни в один аккаунт.
--
-- Почему свой OTP, а не OAuth-провайдер: продукт обязан запускаться без
-- единой переменной окружения (README §5). Google OAuth сделал бы вход
-- неработающим без выданных секретов, то есть сломал бы главное свойство
-- демо. Одноразовый код не требует ничего внешнего — без почтового
-- провайдера он просто печатается в серверный лог.
-- ============================================================================

create table if not exists login_codes (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  code_hash   text not null,
  expires_at  timestamptz not null,
  -- Счётчик неудачных попыток: код сгорает, а не перебирается.
  attempts    smallint not null default 0,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists login_codes_email_idx on login_codes (email, created_at desc);

create table if not exists sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  -- Хэш непрозрачного токена из cookie. UNIQUE — заодно индекс для поиска.
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz
);

create index if not exists sessions_user_idx on sessions (user_id);
