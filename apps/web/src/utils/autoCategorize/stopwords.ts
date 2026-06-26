/**
 * Tokens we ignore when falling back to substring matching against the
 * user's own category names. These show up in nearly every CaixaBank /
 * BBVA / Sabadell row but carry no semantic meaning about the merchant.
 *
 * - Spanish cities + common suburb suffixes: a `LIDL ESPLUGUES DE` row
 *   should match `LIDL`, not be confused by the city name.
 * - Autonomous communities and country codes.
 * - Common bank transaction suffixes: timestamps, terminal IDs,
 *   province codes (ES + 4 digits), operation codes.
 *
 * Matching is case-insensitive and diacritic-stripped. Tokens shorter
 * than 3 characters are dropped by the matcher even if they're not in
 * this list — we still list them for clarity.
 */
export const STOPWORDS: readonly string[] = [
  // Ubicacions — ciutats i barris habituals a Catalunya
  'esplugues',
  'barcelona',
  'hospitalet',
  'cornella',
  'sant',
  'santa',
  'sant joan',
  'sant just',
  'sant feliu',
  'vall',
  'vic',
  'girona',
  'tarragona',
  'lleida',
  'reus',
  'sabadell',
  'terrassa',
  'badalona',
  'mataro',
  'rubi',
  'sant cugat',
  'cervello',
  'molins',
  'palleja',
  'corbera',
  'begues',
  'gava',
  'castelldefels',
  'sitges',
  'vilanova',
  'igualada',
  'manresa',
  'berga',
  'olot',
  'figueres',
  'blanes',
  'lloret',
  'santa coloma',
  'sant andreu',
  'sant marti',

  // Grans ciutats espanyoles
  'madrid',
  'valencia',
  'sevilla',
  'zaragoza',
  'malaga',
  'bilbao',
  'granada',
  'murcia',
  'alicante',
  'cordoba',
  'valladolid',
  'vigo',
  'gijon',
  'palma',
  'a coruna',
  'coruna',

  // Províncies i països
  'espana',
  'spain',
  'esp',
  'es',
  'cataluña',
  'catalunya',
  'andalucia',
  'galicia',
  'france',
  'italy',
  'ireland',
  'germany',
  'portugal',
  'uk',
  'united kingdom',

  // Codi de país + operació (CaixaBank)
  '0100', '0101', '0102', '0103', '0104', '0105', '0106', '0107', '0108', '0109',
  '0723', '0724', '0725', '0726', '0727', '0728', '0729',
  '0800', '0801', '0802', '0803', '0804', '0805',

  // Suffixos bancaris comuns
  'sa',
  'sau',
  'sl',
  'slu',
  's.a.',
  's.l.',
  's.a.u',
  's.l.u',
  'sdad',
  'sociedad',
  'limitada',
  'anonima',

  // Codis operatius comuns
  'caixer',
  'cajero',
  'transferencia',
  'transfer',
  'transf',
  'compra',
  'compte',
  'tarjeta',
  'targeta',
  'efectivo',
  'efectiu',
  'operacion',
  'operacio',
  'domiciliacio',
  'domiciliacion',
  'recibo',
  'factura',
  'fra', // 'factura' sovint surt tallat
  'autonoma',
  'autonomo',
  'iva',
  'comision',
  'comissio',
  'gestio',
  'gestión',

  // Mesos i dates habituals (per si apareixen)
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
  'gener',
  'febrer',
  'marc',
  'abril',
  'maig',
  'juny',
  'juliol',
  'agost',
  'setembre',
  'octubre',
  'novembre',
  'desembre',

  // Partícules i verbs comuns
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'y',
  'i',
  'a',
  'en',
  'per',
  'para',
  'amb',
  'sin',
  'sense',
];

/**
 * Build a Set for O(1) lookup at runtime. We use a Set rather than
 * array.includes because we hit it once per token per row in the
 * import preview, and on a 50-row import that adds up.
 */
export const STOPWORD_SET: ReadonlySet<string> = new Set(STOPWORDS);