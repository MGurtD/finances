import { rawSqlite } from './client.js';

/**
 * Idempotent schema bootstrap. Run on API startup.
 * drizzle-kit migrations are still supported via drizzle.config.ts for
 * future schema evolution — this covers first-run / clean installs.
 *
 * Additive columns are guarded with try/catch so existing installs upgrade
 * in place without a separate migration script.
 */
export function migrate(): void {
  rawSqlite.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      color TEXT NOT NULL DEFAULT '#E85D2C',
      icon TEXT NOT NULL DEFAULT 'wallet',
      initial_balance INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      parent_id TEXT,
      icon TEXT NOT NULL DEFAULT 'tag',
      color TEXT NOT NULL DEFAULT '#8B7355',
      sort_order INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      category_id TEXT REFERENCES categories(id),
      kind TEXT NOT NULL,
      amount INTEGER NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      import_hash TEXT,
      transfer_account_id TEXT REFERENCES accounts(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions(date);
    CREATE INDEX IF NOT EXISTS transactions_account_idx ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS transactions_category_idx ON transactions(category_id);
    CREATE INDEX IF NOT EXISTS transactions_account_date_idx ON transactions(account_id, date);
    CREATE INDEX IF NOT EXISTS transactions_import_hash_idx ON transactions(import_hash);
  `);

  for (const ddl of ADDITIVE_COLUMNS) {
    try {
      rawSqlite.exec(ddl);
    } catch {
      // column/index already exists or other non-fatal issue — safe to ignore on idempotent runs
    }
  }
}

const ADDITIVE_COLUMNS = [
  'ALTER TABLE accounts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE categories ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE transactions ADD COLUMN import_hash TEXT',
  'CREATE INDEX IF NOT EXISTS transactions_account_date_idx ON transactions(account_id, date)',
  'CREATE INDEX IF NOT EXISTS transactions_import_hash_idx ON transactions(import_hash)',
];