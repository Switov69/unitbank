-- Схема базы данных UnitBank.
-- Выполняется автоматически при старте бота (CREATE TABLE IF NOT EXISTS),
-- поэтому вручную запускать этот файл не обязательно.

CREATE TABLE IF NOT EXISTS users (
    user_id               BIGINT PRIMARY KEY,
    nickname               TEXT NOT NULL,
    region                 TEXT NOT NULL,
    active_account_id      INTEGER,
    last_nickname_change    TIMESTAMPTZ,
    last_region_change      TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Уникальность никнейма (без учёта регистра) обеспечивается на уровне БД —
-- это страхует от гонок при регистрации двух пользователей одновременно.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname_lower ON users (lower(nickname));

CREATE TABLE IF NOT EXISTS accounts (
    account_id       SERIAL PRIMARY KEY,
    account_number    CHAR(4) UNIQUE NOT NULL,
    user_id            BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    account_name       TEXT NOT NULL,
    balance             NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_number ON accounts(account_number);
-- Названия счетов уникальны глобально (без учёта регистра) — это также
-- гарантирует, что поиск получателя перевода по названию счёта никогда не
-- будет неоднозначным.
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_name_lower ON accounts (lower(account_name));

CREATE TABLE IF NOT EXISTS transactions (
    tx_id         SERIAL PRIMARY KEY,
    from_account   INTEGER REFERENCES accounts(account_id) ON DELETE SET NULL,
    to_account      INTEGER REFERENCES accounts(account_id) ON DELETE SET NULL,
    -- Снимок данных на момент операции (чтобы история не ломалась после
    -- переименования/удаления счёта):
    from_number      CHAR(4),
    from_name          TEXT,
    to_number           CHAR(4),
    to_name              TEXT,
    amount                NUMERIC(18, 2) NOT NULL,
    tx_type                TEXT NOT NULL,  -- transfer / deposit / withdraw / admin_credit
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tx_from_account ON transactions(from_account);
CREATE INDEX IF NOT EXISTS idx_tx_to_account ON transactions(to_account);

CREATE TABLE IF NOT EXISTS payment_links (
    link_id           SERIAL PRIMARY KEY,
    token              TEXT UNIQUE NOT NULL,
    account_id          INTEGER NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    creator_user_id      BIGINT NOT NULL,
    amount                 NUMERIC(18, 2) NOT NULL,
    is_used                  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at                   TIMESTAMPTZ NOT NULL
);
-- ALTER на случай, если таблица уже была создана прошлой версией схемы
-- (до того, как ссылки стали одноразовыми):
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS is_used BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS withdraw_requests (
    request_id       SERIAL PRIMARY KEY,
    user_id            BIGINT NOT NULL,
    account_id          INTEGER REFERENCES accounts(account_id) ON DELETE SET NULL,
    account_number       CHAR(4),
    nickname               TEXT,
    region                   TEXT,
    amount                     NUMERIC(18, 2) NOT NULL,
    status                       TEXT NOT NULL DEFAULT 'pending', -- pending / approved
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at                    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS deposit_requests (
    request_id       SERIAL PRIMARY KEY,
    user_id            BIGINT NOT NULL,
    account_id          INTEGER REFERENCES accounts(account_id) ON DELETE SET NULL,
    account_number       CHAR(4),
    nickname               TEXT,
    amount                   NUMERIC(18, 2) NOT NULL,
    status                     TEXT NOT NULL DEFAULT 'pending', -- pending / approved / rejected
    reject_reason                TEXT,
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at                    TIMESTAMPTZ
);
