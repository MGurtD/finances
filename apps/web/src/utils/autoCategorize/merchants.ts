/**
 * Merchant dictionary — multi-language, mapped to the canonical category
 * taxonomy (see seed.go).
 *
 * Each entry is a category id (or name) plus an array of tokens that
 * strongly identify it. A token match contributes high weight to the
 * scoring; we use *substring* matching so `mercadona centro` still hits
 * `mercadona`. The matcher prefers longer tokens to win over shorter ones
 * (`starbucks` beats `bar` when both appear).
 *
 * The tokens are normalised (lowercase, diacritics stripped) at match
 * time, so `Mercadona` and `MERCADONA` and `mer cadona` all work.
 *
 * Categories here use the *names* (not UUIDs) because this dictionary
 * travels with the seed. When seed names change, this must change too.
 *
 * ─── Metadata (Phase 3) ───
 * `weight` overrides the default length-based weight. Useful for short
 * tokens that are still very specific ("lidl", "dia") — set them to 0.85
 * so they don't get penalised.
 *
 * `language` is purely informational (for the upcoming settings UI / debug
 * view). The matcher doesn't filter by language.
 *
 * `aliases` are additional tokens that behave like the main tokens but are
 * typically less common. They count for the same weight.
 */

export interface MerchantEntry {
  /** Category name (must match one in seed.go / defaultCategories in types.ts). */
  categoryName: string;
  /** Tokens that strongly identify this merchant. */
  tokens: readonly string[];
  /** Optional subcategory (when this merchant should go to a specific child). */
  subcategoryName?: string;
  /** Optional explicit weight override. If absent, weight is derived from token length. */
  weight?: number;
  /** ISO 639-1 language code(s) the tokens belong to. Informational only. */
  language?: readonly ('es' | 'ca' | 'en' | 'fr' | 'de' | 'it' | 'pt')[];
  /** Less common tokens / brand misspellings. Same weight as main tokens. */
  aliases?: readonly string[];
  /** When this entry was last curated. Helps users see when their dict is stale. */
  updatedAt?: string;
}

/**
 * Tokens are chosen to be:
 *   - Distinctive (avoid generic words like "bar" alone — but "bar " with
 *     trailing space is intentional, to avoid matching "barcelona")
 *   - Stable across bank exports (merchants rarely rename)
 *   - Multi-language (Spanish, Catalan, English) where the merchant is
 *     international
 */
export const MERCHANT_DICTIONARY: readonly MerchantEntry[] = [
  // ───── Alimentació (supermercats + alimentació general) ─────
  {
    categoryName: 'Alimentació',
    language: ['es', 'ca', 'en'],
    updatedAt: '2026-06-27',
    tokens: [
      // Supermercats catalans
      'mercadona', 'carrefour', 'lidl', 'aldi', 'dia', 'consum', 'bonpreu',
      'caprabo', 'condis', 'alcampo', 'primaprix', 'euromaxi', 'maxi',
      'eroski', 'spar', 'ahorramas', 'alimerka', 'simply', 'veritas',
      'herbolario', 'ali super',
      // Forns / panaderies
      'forn', 'fleca', 'panaderia', 'panader', 'pastisseria', 'pasteleria',
      'bolleria', 'obrador',
      // Gasolineres (nota: "AREAS", "AREA" — are gasoline station brands,
      // but AREA is also a Catalan word. We're using the bank's brand here.)
      'gasolinera', 'estacion servei',
    ],
  },

  // ───── Restaurants i oci (bars, restaurants, oci general) ─────
  {
    categoryName: 'Restaurants i oci',
    tokens: [
      // Genèrics
      'restaurant', 'restaurante', 'pizzeria', 'pizzeria', 'pizza',
      'burger', 'hamburgueseria', 'cafeteria', 'cafe', 'cafes',
      'granja', 'cerveceria', 'cerveceria', 'tapas', 'taberna',
      'kfc', 'mcdonald', 'mcdonalds', 'subway', 'starbucks',
      // Locals específics habituals a Catalunya
      'bar mirador', 'bar canarias', 'bar canàries',
      'la puerta', 'la gola', 'zona pradals', 'el raconet',
      'trini', 'reketepizza', 'kiyani',
      'arbitrade', 'cial',
      // Food delivery
      'just eat', 'glovo', 'uber eats', 'deliveroo',
    ],
  },

  // ───── Subministraments (aigua, llum, gas, telèfon, internet) ─────
  {
    categoryName: 'Subministraments',
    tokens: [
      'endesa', 'iberdrola', 'naturgy', 'gas natural',
      'movistar', 'vodafone', 'orange', 'yoigo', 'jazztel',
      'telefonica', 'agbar', 'aigues', 'aigües',
    ],
  },

  // ───── Transport (gasolina, transport públic, taxi, vols) ─────
  {
    categoryName: 'Transport',
    tokens: [
      // Gasolineres
      'repsol', 'cepsa', 'bp ', 'shell', 'galp', 'esclatoil',
      'petroprix', 'petronor',
      // Transport públic
      'metro', 'tmb', 'renfe', 'fgc', 'tramvia',
      // VTC
      'taxi', 'uber', 'cabify', 'bolt', 'freenow',
      // Avions
      'vueling', 'iberia', 'ryanair', 'easyjet', 'air europa', 'air europa',
      // Pàrquings
      'aparcament', 'aparcamiento', 'parking', 'bicing',
    ],
  },

  // ───── Habitatge (lloguer, hipoteca, comunitat, assegurança llar) ─────
  {
    categoryName: 'Habitatge',
    tokens: [
      'hipoteca', 'lloguer', 'alquiler', 'rental', 'renta',
      'comunitat', 'comunidad', 'administracio finques',
      'seguro hogar', 'maphre', 'axa hogar', 'mutua hogar',
    ],
  },

  // ───── Subscripcions (SaaS, streaming, cloud, etc.) ─────
  {
    categoryName: 'Subscripcions',
    tokens: [
      // Streaming / oci digital
      'netflix', 'spotify', 'youtube', 'hbo', 'disney',
      'apple.com', 'icloud', 'apple tv',
      'playstation', 'xbox', 'steam', 'nintendo',
      // Productivitat / cloud
      'dropbox', 'github', 'openai', 'chatgpt', 'claude',
      'anthropic', 'notion', 'figma', 'adobe', 'microsoft 365',
      'office365', 'aws', 'azure', 'google cloud', 'google one',
      'google storage', 'github copilot', 'gitlab',
      'vercel', 'netlify', 'digitalocean', 'heroku',
      'linear', '1password', 'bitwarden',
      'nordvpn', 'expressvpn', 'protonvpn',
      'cursor', 'raycast',
      // Telecom / SaaS habituals
      'movistar+',
    ],
  },

  // ───── Restaurants i oci - restaurants / bars addicionals ─────
  {
    categoryName: 'Restaurants i oci',
    tokens: [
      // Bars i restaurants locals habituals a Catalunya
      'bar oasis', 'bar esport', 'bar-bodega luis', 'bar-bodega',
      'mutick', 'bk20250', 'el raconet', 'fuertes gourmet', 'tecomo braseria',
      'degustast deli', 'el casal', 'el cau', 'el cau de les',
      'rest.kingyo', 'es sardana', 'viena', 'viena vic', 'zona blava',
      'restaurante zhong hua', 'la gola del llop', 'la puerta',
      'konig', 'cial.esplugues', 'cial',
    ],
  },

  // ───── Salut (farmàcia, metge, dentista, assegurança) ─────
  {
    categoryName: 'Salut',
    tokens: [
      'farmacia', 'farmàcia', 'dentista', 'dentix',
      'medico', 'metge', 'hospital', 'clinica', 'clínica',
      'fisioterapia', 'fisio', 'psicologo', 'psicòleg',
      'oculista', 'optica', 'optometrista',
      'sanitas', 'adeslas', 'dkv', 'asisa', 'mutua',
      // cat Req 7 — barbershop tokens. The prefix rule
      // `^breyker\s+barber|^barbershop|^perruqueria|^peluqueria|^barberia`
      // covers the anchored cases; these merchant tokens provide a
      // noisy-OR second contribution when `barber` appears anywhere
      // (e.g. "BREYKER BARBER STUDIO" / "EL BARBER DE SANT JUST").
      'barber', 'barbershop', 'perruqueria', 'peluqueria', 'barberia',
    ],
  },

  // ───── Compres (Amazon, eBay, roba, electrònica, general) ─────
  {
    categoryName: 'Compres',
    tokens: [
      // Marketplace
      'amazon', 'amzn', 'shein', 'aliexpress', 'alibaba',
      'temu', 'ebay', 'wish', 'milanuncios', 'wallapop',
      // Roba / moda
      'zara', 'h&m', 'mango', 'bershka', 'pull', 'pull&bear',
      'lefties', 'primor', 'primark', 'c&a', 'massimo dutti',
      'stradivarius', 'oysho', 'kiabi',
      // Llar / bricolage
      'ikea', 'leroy merlin', 'leroymerlin', 'bricomart',
      'bricodepot', 'bricor', 'ferreteria',
      'garden', 'jardi', 'jardineria',
      // PROGESA is a shop (online but with a physical brand). The earlier
      // "prog/progese/progeser" tokens were mis-mapped to restaurants — removed.
      'progeser', 'progese',
      // Electrònica
      'mediamarkt', 'fnac', 'apple store', 'pc componentes',
      'pccomponentes', 'worten', 'coolmod',
      // Música / entreteniment
      'beat mag',
      // Roba local
      'kaos urbano', 'breyker', 'konig', 'audrey', 'kireta', 'gran bazar',
    ],
  },

  // ───── Viatges (hotels, avions, airbnb, booking) ─────
  {
    categoryName: 'Viatges',
    tokens: [
      'hotel', 'hostal', 'airbnb', 'booking', 'expedia',
      'kayak', 'trivago', 'hotels.com', 'edreams',
      'logitravel', 'destinia', 'vrbo', 'hostelworld',
      'openferry', 'ferry', 'enterticket',
      // Lloguer de cotxes
      'hertz', 'avis', 'europcar', 'sixt', 'enterprise',
    ],
  },

  // ───── Família (escola, guarderia) ─────
  {
    categoryName: 'Família',
    tokens: [
      'escola', 'colegio', 'col·legi', 'collegi',
      'guarderia', 'guarderia infantil', 'ludoteca',
      'menjar escolar', 'autobus escolar',
      // Charter schools (e.g. "CHARTER EDUARD TOLDRA" — a charter school in Esplugues)
      'charter',
    ],
  },

  // ───── Impostos i finances (banc, impostos, comissions, transferències) ─────
  {
    categoryName: 'Impostos i finances',
    tokens: [
      // Impostos
      'hisenda', 'agencia tributaria', 'aeat', 'irpf',
      'iva', 'societats', 'ibi', 'plusvalia', 'patrimonio',
      'seguridad social', 'cotitzacio',
      // Préstecs / deutes
      'cetelem', 'cofidis', 'amortizacion', 'amortitzacio',
      'deuda', 'préstec', 'prestec',
      // Comissions bancàries
      'comissio', 'comision', 'comissio targeta', 'comissio gestio',
      // Assegurances generals
      'mapfre', 'axa', 'mutua', 'assegurança', 'seguro', 'assegurances',
      // Transferències / operacions bancàries
      'transferencia', 'transfer', 'trf', 'trf.periodica', 'swift', 'sepa',
      'notaria', 'registre',
    ],
  },

  // ───── Treball (material oficina, eines, cursos professionals) ─────
  {
    categoryName: 'Treball',
    tokens: [
      'amazon business', 'amzn mktp', 'oficina',
      'slack', 'zoom', 'google workspace',
      'jetbrains', 'intellij', 'pycharm',
      'udemy', 'coursera', 'master', 'mba', 'curs', 'course',
      'edx', 'platzi', 'domestika',
    ],
  },

  // ───── Altres despeses (cashback, reintegrament, varis) ─────
  {
    categoryName: 'Altres despeses',
    tokens: [
      'cashback', 'reintegro', 'reinteg',
      'despeses varios', 'varis',
    ],
  },

  // ───── Targetes (comissions específiques de targeta) ─────
  {
    categoryName: 'Targetes',
    tokens: [
      'targeta credit', 'tarjeta credito',
      'comissio targeta', 'comision tarjeta',
    ],
  },

  // ───── Efectiu (reintegraments de caixer) ─────
  {
    categoryName: 'Efectiu',
    tokens: [
      'reinteg caixer', 'reintegro cajero',
      'bitllets', 'efectiu',
    ],
  },

  // ───── Ajustos (reconciliació, ajustos comptables) ─────
  {
    categoryName: 'Ajustos',
    tokens: [
      'ajust', 'ajuste', 'reconciliacio',
      'interes', 'interes compte',
    ],
  },

  // ───── Inversions ─────
  {
    categoryName: 'Inversions',
    tokens: [
      'inversio', 'inversion', 'estalvi', 'compra accions',
      'compra fons', 'broker', 'interactive brokers', 'degiro',
      'etoro', 'binance', 'coinbase',
      // ── new for Indexa fund families (auto-categorization-rules Req 6)
      'vanguard', 'ishares', 'amundi', 'eurizon', 'dws',
    ],
  },

  // ───── Devolucions ─────
  {
    categoryName: 'Devolucions',
    tokens: [
      'devolucio', 'devolucion', 'reembolso', 'reembossament',
      'retorn', 'retorno',
    ],
  },

  // ───── Negoci / freelance ─────
  {
    categoryName: 'Negoci / freelance',
    tokens: [
      'factura emesa', 'autonomo', 'autònoms',
      'freelancer', 'frelance', 'projecte client',
    ],
  },
];

/**
 * Flat sorted list (longest token first). Used by the strategy to pick the
 * most specific token match when multiple tokens hit the same description.
 *
 * NOTE: this is the BASE-only list (computed at module-load time). For the
 * user-augmented list (base + user additions + removals), use
 * `getMerchantTokensSorted()` instead, which re-evaluates every call so
 * user changes take effect without a reload.
 */
export const MERCHANT_TOKENS_SORTED: ReadonlyArray<{ token: string; entry: MerchantEntry }> =
  MERCHANT_DICTIONARY.flatMap((entry) =>
    entry.tokens.map((token) => ({ token, entry })),
  ).sort((a, b) => b.token.length - a.token.length);