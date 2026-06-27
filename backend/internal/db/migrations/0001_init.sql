-- Migration 0001: Initial schema
-- Reproduces packages/db/src/schema.ts exactly

CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('checking', 'savings', 'credit_card', 'cash', 'investment')),
    currency TEXT NOT NULL DEFAULT 'EUR',
    color TEXT NOT NULL DEFAULT '#6366F1',
    icon TEXT NOT NULL DEFAULT 'wallet',
    initial_balance INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS accounts_archived_idx ON accounts (archived);
CREATE INDEX IF NOT EXISTS accounts_sort_order_idx ON accounts (sort_order);

CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
    parent_id TEXT,
    icon TEXT NOT NULL DEFAULT 'tag',
    color TEXT NOT NULL DEFAULT '#8B7355',
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS categories_archived_idx ON categories (archived);
CREATE INDEX IF NOT EXISTS categories_kind_idx ON categories (kind);
CREATE INDEX IF NOT EXISTS categories_sort_order_idx ON categories (sort_order);

CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    category_id TEXT REFERENCES categories(id),
    kind TEXT NOT NULL CHECK (kind IN ('income', 'expense', 'transfer')),
    amount INTEGER NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL,
    import_hash TEXT,
    transfer_account_id TEXT REFERENCES accounts(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions (date);
CREATE INDEX IF NOT EXISTS transactions_account_idx ON transactions (account_id);
CREATE INDEX IF NOT EXISTS transactions_category_idx ON transactions (category_id);
CREATE INDEX IF NOT EXISTS transactions_account_date_idx ON transactions (account_id, date);
CREATE INDEX IF NOT EXISTS transactions_import_hash_idx ON transactions (import_hash);

CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    category_id TEXT REFERENCES categories(id),
    month TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS budgets_month_idx ON budgets (month);
-- SQLite treats NULL as distinct in unique indexes: multiple NULL categoryId rows
-- for different months are allowed (global budget per month).
CREATE UNIQUE INDEX IF NOT EXISTS budgets_category_month_unique ON budgets (category_id, month);