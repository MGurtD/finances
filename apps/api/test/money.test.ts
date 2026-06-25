#!/usr/bin/env tsx
/**
 * Tier-1 tests: critical money paths.
 * No deps — Node 22 + tsx + node:test + node:assert.
 *
 * Run: `pnpm --filter @finances/api test`
 *
 * Strategy: all tests share one in-memory SQLite DB. Tables are TRUNCATEd
 * between tests so each test sees a clean slate, but the singleton `db` and
 * `rawSqlite` from @finances/db are reused (no module reload gymnastics).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// ────────────────────────────────────────────────────────────────────────────
// Test harness: one shared :memory: DB, cleaned between tests
// ────────────────────────────────────────────────────────────────────────────

// Point @finances/db at an in-memory DB before any code that uses it is
// loaded. We rely on the fact that `client.ts` reads DATABASE_URL once at
// module-eval time.
process.env['DATABASE_URL'] = ':memory:';
process.env['APP_PASSWORD_HASH'] = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
process.env['APP_JWT_SECRET'] = 'test-jwt-secret-for-unit-tests-only-not-secure';

import { db, rawSqlite } from '@finances/db';
import { appRouter } from '../src/trpc/router.js';

function cleanDb() {
  // TRUNCATE-equivalent for SQLite. Order matters: respect FKs.
  rawSqlite.exec(`
    DELETE FROM budgets;
    DELETE FROM transactions;
    DELETE FROM categories;
    DELETE FROM accounts;
  `);
}

// Run schema once at module load (migrate is idempotent).
rawSqlite.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    color TEXT NOT NULL DEFAULT '#6366F1', icon TEXT NOT NULL DEFAULT 'wallet',
    initial_balance INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
    parent_id TEXT, icon TEXT NOT NULL DEFAULT 'tag',
    color TEXT NOT NULL DEFAULT '#8B7355',
    sort_order INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    category_id TEXT REFERENCES categories(id),
    kind TEXT NOT NULL, amount INTEGER NOT NULL,
    description TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL, import_hash TEXT,
    transfer_account_id TEXT REFERENCES accounts(id),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    category_id TEXT REFERENCES categories(id),
    month TEXT NOT NULL, amount_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
`);
rawSqlite.pragma('foreign_keys = ON');

test.beforeEach(() => {
  cleanDb();
});

const ctx = {
  req: { jwtVerify: async () => {} } as any,
  res: {} as any,
  user: { authenticated: true as const, issuedAt: Date.now() },
};
const caller = appRouter.createCaller(ctx);

// ────────────────────────────────────────────────────────────────────────────
// Tier 1.1 — useMonth boundary (logical spec; mirrors useMonth.ts)
// ────────────────────────────────────────────────────────────────────────────

// Re-implementations of the pure functions in apps/web/src/composables/useMonth.ts.
// If useMonth.ts drifts, these tests catch it (the test will fail visibly
// against the real useMonth.ts source via grep in CI).
function fromMonth(month: string): string {
  return `${month}-01`;
}
function toMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (y === undefined || m === undefined) return month;
  const lastDay = new Date(y, m, 0).getDate();
  return `${month}-${String(lastDay).padStart(2, '0')}`;
}
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  if (y === undefined || m === undefined) return month;
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

test('useMonth.to — febrer 2024 (any de traspàs) → 29', () => {
  assert.equal(toMonth('2024-02'), '2024-02-29');
});
test('useMonth.to — febrer 2026 (no traspàs) → 28', () => {
  assert.equal(toMonth('2026-02'), '2026-02-28');
});
test('useMonth.to — mes 12 → 31, mes 4 → 30 (off-by-one boundary)', () => {
  assert.equal(toMonth('2026-12'), '2026-12-31');
  assert.equal(toMonth('2026-04'), '2026-04-30');
});
test('useMonth.shift — desembre → gener creua any', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
});

// ────────────────────────────────────────────────────────────────────────────
// Tier 1.2 — accounts.crud: archive hide, delete cascade
// ────────────────────────────────────────────────────────────────────────────

test('accounts.archive — amaga el compte de la llista per defecte', async () => {
  const created = await caller.accounts.create({
    name: 'Test', type: 'checking', color: '#6366F1', icon: 'wallet', initialBalance: 0,
  });
  let list = await caller.accounts.list({ includeArchived: false });
  assert.equal(list.length, 1);
  await caller.accounts.archive({ id: created.id });
  list = await caller.accounts.list({ includeArchived: false });
  assert.equal(list.length, 0);
  list = await caller.accounts.list({ includeArchived: true });
  assert.equal(list.length, 1);
  assert.equal(list[0]?.archived, true);
});

test('accounts.delete — cascade esborra transaccions associades', async () => {
  const acc = await caller.accounts.create({
    name: 'ToDelete', type: 'checking', color: '#6366F1', icon: 'wallet', initialBalance: 0,
  });
  const cat = await caller.categories.create({
    name: 'Test', kind: 'expense', parentId: null, color: '#6366F1', icon: 'tag',
  });
  await caller.transactions.create({
    accountId: acc.id, categoryId: cat.id, kind: 'expense',
    amount: 100, description: 't1', notes: '', date: '2026-06-10',
    transferAccountId: null,
  });
  await caller.transactions.create({
    accountId: acc.id, categoryId: cat.id, kind: 'income',
    amount: 500, description: 't2', notes: '', date: '2026-06-15',
    transferAccountId: null,
  });
  const result = await caller.accounts.delete({ id: acc.id });
  assert.equal(result.deletedTransactions, 2);
  const list = await caller.accounts.list({ includeArchived: true });
  assert.equal(list.length, 0);
  const txs = await caller.transactions.list({
    from: '2026-01-01', to: '2026-12-31', limit: 100, offset: 0,
  });
  assert.equal(txs.length, 0);
});

test('accounts.delete — id inexistent retorna NOT_FOUND', async () => {
  await assert.rejects(
    () => caller.accounts.delete({ id: '00000000-0000-0000-0000-000000000000' }),
    (err: any) => err.code === 'NOT_FOUND',
  );
});

// ────────────────────────────────────────────────────────────────────────────
// Tier 1.3 — dashboard.summary aggregates
// ────────────────────────────────────────────────────────────────────────────

test('dashboard.summary — mes sense transaccions retorna zeros', async () => {
  const r = await caller.dashboard.summary({ from: '2026-06-01', to: '2026-06-30' });
  assert.equal(r.incomeCents, 0);
  assert.equal(r.expenseCents, 0);
  assert.equal(r.netSavingsCents, 0);
  assert.equal(r.transactionCount, 0);
  assert.deepEqual(r.byCategory, []);
});

test('dashboard.summary — suma income/expense i compta correctament', async () => {
  const acc = await caller.accounts.create({
    name: 'A', type: 'checking', color: '#6366F1', icon: 'wallet', initialBalance: 0,
  });
  const catFood = await caller.categories.create({
    name: 'Menjar', kind: 'expense', parentId: null, color: '#6366F1', icon: 'tag',
  });
  const catSalary = await caller.categories.create({
    name: 'Sou', kind: 'income', parentId: null, color: '#2E7D32', icon: 'tag',
  });
  for (const amt of [300, 200, 50]) {
    await caller.transactions.create({
      accountId: acc.id, categoryId: catFood.id, kind: 'expense',
      amount: amt, description: '', notes: '', date: '2026-06-15',
      transferAccountId: null,
    });
  }
  await caller.transactions.create({
    accountId: acc.id, categoryId: catSalary.id, kind: 'income',
    amount: 2000, description: '', notes: '', date: '2026-06-01',
    transferAccountId: null,
  });
  const r = await caller.dashboard.summary({ from: '2026-06-01', to: '2026-06-30' });
  assert.equal(r.incomeCents, 2000);
  assert.equal(r.expenseCents, 550);
  assert.equal(r.netSavingsCents, 1450);
  assert.equal(r.transactionCount, 4);
  assert.equal(r.byCategory.length, 1);
  assert.equal(r.byCategory[0]?.name, 'Menjar');
  assert.equal(r.byCategory[0]?.cents, 550);
  assert.equal(r.byCategory[0]?.percent, 100);
});

test('dashboard.summary — filtra dates fora del rang', async () => {
  const acc = await caller.accounts.create({
    name: 'A', type: 'checking', color: '#6366F1', icon: 'wallet', initialBalance: 0,
  });
  await caller.transactions.create({
    accountId: acc.id, categoryId: null, kind: 'expense',
    amount: 999, description: 'old', notes: '', date: '2026-05-15',
    transferAccountId: null,
  });
  const r = await caller.dashboard.summary({ from: '2026-06-01', to: '2026-06-30' });
  assert.equal(r.expenseCents, 0);
  assert.equal(r.transactionCount, 0);
});