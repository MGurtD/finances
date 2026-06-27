import { autoCategorize } from './src/utils/autoCategorize.ts';
import { readFileSync } from 'node:fs';

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
  { id: 'cat-213', name: 'Altres despeses', kind: 'expense', color: '', icon: '', icon: '', sortOrder: 0, archived: false, createdAt: '', parentId: null },
  { id: 'cat-214', name: 'Transferencies internes', kind: 'expense', color: '', icon: '', sortOrder: 0, archived: false, createdAt: '', parentId: null },
];

function parseCSV(path) {
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n').slice(1).filter((l) => l.trim().length > 0);
  const rows = [];
  for (const line of lines) {
    const cols = line.split(';');
    if (cols.length < 4) continue;
    const description = cols[1]?.trim() ?? '';
    const amountStr = cols[3]?.trim() ?? '';
    if (!description || !amountStr) continue;
    const amtMatch = amountStr.match(/(-?\d+[.,]\d+)/);
    if (!amtMatch) continue;
    const amount = Math.round(Number(amtMatch[1].replace(',', '.')) * 100);
    rows.push({ description, amountCents: amount, kind: amount > 0 ? 'income' : 'expense' });
  }
  return rows;
}

const allRows = [
  ...parseCSV('C:/Users/mgurt/Downloads/Export_25-06-2026-22-47-05.csv'),
  ...parseCSV('C:/Users/mgurt/Downloads/Export_24-06-2026-17-03-54.csv'),
];

console.log('=== PATTERN ANALYSIS ===');
const prefixCount = new Map();
for (const row of allRows) {
  const firstToken = row.description.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
  if (firstToken) prefixCount.set(firstToken, (prefixCount.get(firstToken) ?? 0) + 1);
}
console.log('First-token frequency:');
for (const [p, n] of [...prefixCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  console.log('  ' + p + ': ' + n);
}

console.log('');
console.log('=== UNIQUE MERCHANT-LIKE STARTERS ===');
const uniqueStarters = new Set();
for (const row of allRows) {
  // Strip noise: bank codes, locations, dates
  const cleaned = row.description
    .replace(/\\?[A-Z]{2}\d{8,12}/g, '')
    .replace(/\\\w+\\?/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = cleaned.split(' ');
  // Take first 2 meaningful words
  const first2 = parts.slice(0, 2).join(' ').toLowerCase();
  uniqueStarters.add(first2);
}
console.log('Unique 2-word starters: ' + uniqueStarters.size);
[...uniqueStarters].sort().slice(0, 40).forEach((s) => console.log('  ' + s));

console.log('');
console.log('=== AMOUNTS DISTRIBUTION ===');
const amounts = allRows.map((r) => Math.abs(r.amountCents) / 100);
amounts.sort((a, b) => a - b);
console.log('Min:', amounts[0], 'Max:', amounts[amounts.length - 1]);
console.log('Median:', amounts[Math.floor(amounts.length / 2)]);
console.log('Mean:', (amounts.reduce((a, b) => a + b, 0) / amounts.length).toFixed(2));
console.log('Quartiles: 25%=' + amounts[Math.floor(amounts.length * 0.25)].toFixed(2) + ', 50%=' + amounts[Math.floor(amounts.length * 0.5)].toFixed(2) + ', 75%=' + amounts[Math.floor(amounts.length * 0.75)].toFixed(2));

console.log('');
console.log('=== NONE-CONFIDENCE SAMPLES (first 30) ===');
let count = 0;
for (const row of allRows) {
  const r = autoCategorize({
    description: row.description,
    amountCents: row.amountCents,
    kind: row.kind,
    categories: cats,
  });
  if (r.confidence === 'none' && count < 30) {
    console.log('  ' + row.description + ' (amt=' + (row.amountCents/100).toFixed(2) + ')');
    count++;
  }
}
