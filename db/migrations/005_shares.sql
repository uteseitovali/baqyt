-- ============================================================================
-- 005 — ссылки «Показать семье»
--
-- В базе лежит только обезличенная сводка (до трёх программ, оценка, полоса,
-- ключи причин — см. src/lib/share/summary.ts). Анкета сюда не попадает ни в
-- каком виде: у таблицы нет ни user_id, ни колонки под профиль.
--
-- Слаг из ссылки, как и токен сессии, не хранится: только его SHA-256.
-- Утечка дампа не даёт открыть ни одну ссылку.
--
-- Таблица не связана с users намеренно: ссылку можно создать и гостем, а
-- удаление аккаунта не должно молча гасить ссылки, которые уже разосланы.
-- ============================================================================

create table if not exists shares (
  id         uuid primary key default gen_random_uuid(),
  -- SHA-256 слага. UNIQUE — заодно индекс, по которому ссылку и находят.
  slug_hash  text not null unique,
  summary    jsonb not null check (jsonb_typeof(summary) = 'object'),
  -- Обезличенный ключ автора (SHA-256 адреса с «перцем») — только чтобы
  -- посчитать «сколько ссылок за час». Живёт не дольше самой строки.
  creator_hash text,
  created_at timestamptz not null default now(),
  -- 30 дней. Истёкшая строка не читается (условие в запросе) и удаляется
  -- при ближайшей записи новой ссылки.
  expires_at timestamptz not null default (now() + interval '30 days')
);

create index if not exists shares_expires_idx on shares (expires_at);
create index if not exists shares_creator_idx on shares (creator_hash, created_at desc);
