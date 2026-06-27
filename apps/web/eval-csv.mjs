import { autoCategorize } from './src/utils/autoCategorize.ts';

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
  { id: 'cat-218', name: 'Entre comptes propis', kind: 'expense', color: '', icon: '', sortOrder: 0, archived: false, createdAt: '', parentId: 'cat-214' },
];

import { readFileSync } from 'node:fs';

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
    const kind = amount > 0 ? 'income' : 'expense';
    rows.push({ description, amountCents: amount, kind });
  }
  return rows;
}

const allRows = [
  ...parseCSV('C:/Users/mgurt/Downloads/Export_25-06-2026-22-47-05.csv'),
  ...parseCSV('C:/Users/mgurt/Downloads/Export_24-06-2026-17-03-54.csv'),
];

console.log('Total rows:', allRows.length);

const expected = {
  'CHARTER EDUARD TOLDRA': 'cat-204',
  'ARBITRADE BARCELONA': 'cat-204',
  'AMORTIZACION DEUDA': 'cat-211',
  'INVERSIO': 'cat-103',
  'BAR MIRADOR': 'cat-204',
  'PRIMAPRIX': 'cat-203',
  'EURO MAXI': 'cat-203',
  'shein': 'cat-207',
  'PROGESA': 'cat-207',
  'AUDREY': 'cat-207',
  'GOOGLE*YOUTUBE': 'cat-208',
  'RESTAURANTE ZHONG HUA': 'cat-204',
  'GARDEN CIUTAT DIAGONAL': 'cat-203',
  'ESCLATOIL': 'cat-205',
  'LA PUERTA DE BARCELONA': 'cat-204',
  'LA GOLA DEL LLOP': 'cat-204',
  'BANCO CETELEM': 'cat-211',
  'ENTERTICKET': 'cat-209',
  'ZONA PRADALS': 'cat-204',
  'coses': 'cat-207',
  'WWW.AMAZON': 'cat-207',
  'VIVARI': 'cat-204',
  'Sin concepto': 'cat-204',
  'TRINI': 'cat-204',
  'caby': 'cat-204',
  'KAOS URBANO': 'cat-207',
  'Breyker': 'cat-207',
  'BAR CANARIAS': 'cat-204',
  'KIYANI ROYAL': 'cat-204',
  'REKETEPIZZA': 'cat-204',
  'Kireta': 'cat-207',
  'GOPAL SHRESTHA': 'cat-207',
  'BEAT MAG MUSIC': 'cat-207',
  'FLECA SOSTENIB': 'cat-203',
  'GRAN BAZAR ORI': 'cat-207',
  'calolts': 'cat-204',
  'ALCAMPO': 'cat-203',
  'CIAL': 'cat-204',
  'KONIG VIC': 'cat-204',
  'Openferry': 'cat-209',
  'EL RACONET': 'cat-204',
  'MUTICK': 'cat-204',
  'BAR ESPORT': 'cat-204',
  'BAZAR MIAMI': 'cat-207',
  'LIDL': 'cat-203',
  'ft': 'cat-207',
  'BK20250': 'cat-204',
  'ALI SUPER PREU': 'cat-203',
  'BAR-BODEGA LUIS': 'cat-204',
  'RESTAURANT MONEL': 'cat-204',
  'AREA DELS PRADALS': 'cat-207',
  'Just Eat': 'cat-204',
  'rata': 'cat-207',
  'BAR OASIS': 'cat-204',
  'FUERTES GOURMET': 'cat-204',
  'TECOMO BRASERIA': 'cat-204',
  'AREA EL DESCAN': 'cat-205',
  'ES SARDANA': 'cat-204',
  'VIENA VIC': 'cat-204',
  'ZONA BLAVA': 'cat-204',
  'ADEO LEROY MERLI': 'cat-207',
  'LEROY MERLIN': 'cat-207',
  'DEGUSTAST DELI': 'cat-204',
  'EL CASAL': 'cat-204',
  'SUPERMERCAT ALIMENTACION': 'cat-203',
  'Marc Gurt Dot': 'cat-214',
  'REST.KINGYO': 'cat-204',
  'EL CAU DE LES': 'cat-204',
};

let matched = 0;
let wrong = 0;
let noExpected = 0;
const wrongSamples = [];
const noMatchSamples = [];

for (const row of allRows) {
  const r = autoCategorize({
    description: row.description,
    amountCents: row.amountCents,
    kind: row.kind,
    categories: cats,
  });
  const expectedEntry = Object.entries(expected).find(([k]) =>
    row.description.toUpperCase().includes(k.toUpperCase()),
  );
  if (!expectedEntry) {
    noExpected++;
    if (noMatchSamples.length < 15) {
      noMatchSamples.push(row.description + ' -> ' + (r.categoryId ?? 'null') + ' (' + r.confidence + ' ' + r.score.toFixed(2) + ')');
    }
    continue;
  }
  const expId = expectedEntry[1];
  if (r.categoryId === expId) {
    matched++;
  } else {
    wrong++;
    if (wrongSamples.length < 60) {
      const got = cats.find((c) => c.id === r.categoryId);
      wrongSamples.push('"' + row.description + '" -> got=' + (got?.name ?? 'null') + ' expected=' + cats.find((c) => c.id === expId)?.name);
    }
  }
}

const total = matched + wrong;
console.log('');
console.log('Accuracy on rows with expected:', matched + '/' + total + ' = ' + (100 * matched / total).toFixed(0) + '%');
console.log('Wrong:', wrong, 'No expected mapping:', noExpected);

console.log('');
console.log('=== WRONG MATCHES (first 40) ===');
for (const w of wrongSamples.slice(0, 40)) console.log('  ' + w);

console.log('');
console.log('=== NO EXPECTED (first 15) ===');
for (const n of noMatchSamples) console.log('  ' + n);

const conf = { high: 0, medium: 0, low: 0, none: 0 };
for (const row of allRows) {
  const r = autoCategorize({
    description: row.description,
    amountCents: row.amountCents,
    kind: row.kind,
    categories: cats,
  });
  conf[r.confidence] = (conf[r.confidence] ?? 0) + 1;
}
console.log('');
console.log('Confidence distribution:');
console.log('  high: ' + conf.high + ' (' + (100 * conf.high / allRows.length).toFixed(0) + '%)');
console.log('  medium: ' + conf.medium);
console.log('  low: ' + conf.low);
console.log('  none: ' + conf.none + ' (' + (100 * conf.none / allRows.length).toFixed(0) + '%)');
