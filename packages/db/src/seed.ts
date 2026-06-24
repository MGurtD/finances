import { db } from './client.js';
import { accounts, categories } from './schema.js';

interface DefaultCategory {
  name: string;
  kind: 'income' | 'expense';
  color: string;
}

const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: 'Habitatge', kind: 'expense', color: '#e85d2c' },
  { name: 'Supermercat', kind: 'expense', color: '#2e7d32' },
  { name: 'Oci', kind: 'expense', color: '#1976d2' },
  { name: 'Subscripcions', kind: 'expense', color: '#7b1fa2' },
  { name: 'Sou', kind: 'income', color: '#2e7d32' },
];

const DEFAULT_ACCOUNT = {
  name: 'Compte corrent',
  type: 'checking' as const,
  color: '#E85D2C',
  icon: 'wallet',
  initialBalance: 0,
};

/**
 * Seeds defaults only when both tables are empty. Idempotent.
 * Call once at server startup, after migrate().
 */
export function seed(): void {
  const existingAccount = db.select({ id: accounts.id }).from(accounts).limit(1).all();
  if (existingAccount.length > 0) return;

  const now = new Date().toISOString();

  db.insert(accounts)
    .values({
      ...DEFAULT_ACCOUNT,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  for (const cat of DEFAULT_CATEGORIES) {
    db.insert(categories)
      .values({
        name: cat.name,
        kind: cat.kind,
        color: cat.color,
        createdAt: now,
      })
      .run();
  }
}