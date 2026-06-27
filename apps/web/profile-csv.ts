import { autoCategorize } from './src/utils/autoCategorize';
import { readFileSync } from 'node:fs';
import { startProfiling, stopProfiling, getProfileReport } from './src/utils/autoCategorize/profile';

const csv = readFileSync(process.argv[2] ?? 'C:\\Users\\mgurt\\Downloads\\Export_25-06-2026-22-47-05.csv', 'utf-8');
const cats = [
  { id: 'cat-203', name: 'Alimentacio', kind: 'expense', color: '', icon: '', sortOrder: 0, archived: false, createdAt: '', parentId: null },
  { id: 'cat-204', name: 'Restaurants i oci', kind: 'expense', color: '', icon: '', sortOrder: 0, archived: false, createdAt: '', parentId: null },
  { id: 'cat-205', name: 'Transport', kind: 'expense', color: '', icon: '', sortOrder: 0, archived: false, createdAt: '', parentId: null },
  { id: 'cat-206', name: 'Salut', kind: 'expense', color: '', icon: '', sortOrder: 0, archived: false, createdAt: '', parentId: null },
  { id: 'cat-207', name: 'Compres', kind: 'expense', color: '', icon: '', sortOrder: 0, archived: false, createdAt: '', parentId: null },
  { id: 'cat-208', name: 'Subscripcions', kind: 'expense', color: '', icon: '', sortOrder: 0, archived: false, createdAt: '', parentId: null },
  { id: 'cat-209', name: 'Viatges', kind: 'expense', color: '', icon: '', sortOrder: 0, archived: false, createdAt: '', parentId: null },
  { id: 'cat-211', name: 'Impostos i finances', kind: 'expense', color: '', icon: '', sortOrder: 0, archived: false, createdAt: '', parentId: null },
  { id: 'cat-212', name: 'Treball', kind: 'expense', color: '', icon: '', sortOrder: 0, archived: false, createdAt: '', parentId: null },
  { id: 'cat-213', name: 'Altres despeses', kind: 'expense', color: '', icon: '', sortOrder: 0, archived: false, createdAt: '', parentId: null },
  { id: 'cat-214', name: 'Transferencies internes', kind: 'expense', color: '', icon: '', sortOrder: 0, archived: false, createdAt: '', parentId: null },
];

// Quick-and-dirty CSV parse — only the description column.
const lines = csv.split('\n').filter((l) => l.trim().length > 0);
const descIdx = lines[0].split(';').findIndex((c) => c.toLowerCase().includes('descripcio') || c.toLowerCase().includes('concepte') || c.toLowerCase().includes('description'));
const amountIdx = lines[0].split(';').findIndex((c) => c.toLowerCase().includes('import') || c.toLowerCase().includes('amount') || c.toLowerCase().includes('quantitat'));
console.log('descIdx=', descIdx, 'amountIdx=', amountIdx);
console.log('header:', lines[0]);

const rows = lines.slice(1).map((l) => {
  const cols = l.split(';');
  const desc = (cols[descIdx] ?? '').replace(/^"|"$/g, '').trim();
  const amountStr = (cols[amountIdx] ?? '0').replace(/[^\d,.\-]/g, '').replace(',', '.');
  const amount = Math.round(parseFloat(amountStr) * 100);
  return { desc, amount };
});

startProfiling();
for (const r of rows) {
  autoCategorize({
    description: r.desc,
    amountCents: r.amount,
    kind: r.amount < 0 ? 'income' : 'expense',
    categories: cats,
  });
}
stopProfiling();
console.log('Rows profiled:', rows.length);
console.log(getProfileReport());