/**
 * Merchant dictionary — keyed by category name (in Catalan, matching the
 * app's UI). The matcher normalises both merchant keys and descriptions
 * (lowercase, strip diacritics) before lookup, so casing and accents in
 * the bank description don't matter.
 *
 * Each entry maps a stable merchant token (the substring we look for in
 * the description) to the category name we want to suggest. Tokens are
 * chosen to be short and distinctive so they survive the noise added by
 * CaixaBank/BBVA/Sabadell location suffixes and timestamps.
 *
 * To extend: add a token → category mapping here. Use the most distinctive
 * substring of the merchant name, not the full name — banks often truncate
 * or wrap merchant names (e.g. `GOOGLE*YOUTUBE IRELAND` → token `youtube`).
 */
export const MERCHANT_DICTIONARY: Record<string, string> = {
  // Supermercats
  'mercadona': 'Supermercat',
  'carrefour': 'Supermercat',
  'lidl': 'Supermercat',
  'aldi': 'Supermercat',
  'dia': 'Supermercat',
  'consum': 'Supermercat',
  'bonpreu': 'Supermercat',
  'caprabo': 'Supermercat',
  'condis': 'Supermercat',
  'alcampo': 'Supermercat',
  'primaprix': 'Supermercat',
  'euromaxi': 'Supermercat',
  'maxi': 'Supermercat',
  'eroski': 'Supermercat',

  // Restaurants / bars / cafeteries
  'restaurant': 'Restaurants',
  'restaurante': 'Restaurants',
  'pizzeria': 'Restaurants',
  'pizza': 'Restaurants',
  'burger': 'Restaurants',
  'bar ': 'Restaurants',
  'cafeteria': 'Restaurants',
  'cafe': 'Restaurants',
  'granja': 'Restaurants',
  'cerveceria': 'Restaurants',
  'tapas': 'Restaurants',
  'kfc': 'Restaurants',
  'mcdonald': 'Restaurants',
  'subway': 'Restaurants',
  'starbucks': 'Restaurants',

  // Gasolineres / transport
  'repsol': 'Transport',
  'cepsa': 'Transport',
  'bp ': 'Transport',
  'shell': 'Transport',
  'galp': 'Transport',
  'esclatoil': 'Transport',
  'petroprix': 'Transport',
  'tmb': 'Transport',
  'renfe': 'Transport',
  'taxi': 'Transport',
  'uber': 'Transport',
  'cabify': 'Transport',
  'freenow': 'Transport',
  'easypay': 'Transport',
  'aparcament': 'Transport',
  'parking': 'Transport',

  // Subministraments / factures
  'endesa': 'Subministraments',
  'iberdrola': 'Subministraments',
  'naturgy': 'Subministraments',
  'aigues': 'Subministraments',
  'aigües': 'Subministraments',
  'movistar': 'Subministraments',
  'vodafone': 'Subministraments',
  'orange': 'Subministraments',
  'yoigo': 'Subministraments',
  'jazztel': 'Subministraments',

  // Oci / subscripcions
  'youtube': 'Oci',
  'netflix': 'Oci',
  'spotify': 'Oci',
  'hbo': 'Oci',
  'disney': 'Oci',
  'hulu': 'Oci',
  'apple.com': 'Oci',
  'google storage': 'Oci',
  'playstation': 'Oci',
  'xbox': 'Oci',
  'steam': 'Oci',
  'cinema': 'Oci',
  'teatre': 'Oci',

  // Compres online
  'amazon': 'Compres online',
  'amzn': 'Compres online',
  'shein': 'Compres online',
  'aliexpress': 'Compres online',
  'temu': 'Compres online',
  'ebay': 'Compres online',
  'aliexp': 'Compres online',
  'wish': 'Compres online',
  'milanuncios': 'Compres online',
  'wallapop': 'Compres online',

  // Roba / moda
  'zara': 'Compres roba',
  'h&m': 'Compres roba',
  'pull': 'Compres roba',
  'mango': 'Compres roba',
  'bershka': 'Compres roba',
  'lefties': 'Compres roba',
  'primor': 'Compres roba',
  'decathlon': 'Esport',
  'sport': 'Esport',
  'nike': 'Esport',
  'adidas': 'Esport',

  // Salut / farmàcia
  'farmacia': 'Salut',
  'farmàcia': 'Salut',
  'clinica': 'Salut',
  'clínica': 'Salut',
  'hospital': 'Salut',
  'dentista': 'Salut',
  'dentix': 'Salut',

  // Educació / fills
  'escola': 'Educació',
  'col·legi': 'Educació',
  'collegi': 'Educació',
  'universitat': 'Educació',
  'udima': 'Educació',
  'la salle': 'Educació',
  'salesians': 'Educació',

  // Bancs / finances / assegurances
  'cetelem': 'Préstecs',
  'cofidis': 'Préstecs',
  'santander': 'Bancs',
  'bbva': 'Bancs',
  'caixabank': 'Bancs',
  'sabadell': 'Bancs',
  'ing': 'Bancs',
  'openbank': 'Bancs',
  'imagin': 'Bancs',
  'mutua': 'Assegurances',
  'assegurança': 'Assegurances',
  'seguro': 'Assegurances',
  'mapfre': 'Assegurances',
  'axa': 'Assegurances',
  'sanitas': 'Assegurances',
  'adeslas': 'Assegurances',
  'dkv': 'Assegurances',

  // Llar / bricolage
  'leroy merlin': 'Llar',
  'ikea': 'Llar',
  'bricomart': 'Llar',
  'bricodepot': 'Llar',
  'ferreteria': 'Llar',
  'fleca': 'Supermercat',
  'forn': 'Supermercat',
  'pa': 'Supermercat',
  'panaderia': 'Supermercat',
  'panader': 'Supermercat',
  'vivari': 'Llar',

  // Moda / retail local
  'kaos urbano': 'Compres roba',
  'breyker': 'Compres roba',
  'konig': 'Compres roba',
  'audrey': 'Compres online', // botiga local de roba però el logotip no és evident

  // Oci / cultura
  'beat mag': 'Oci',
  'openferry': 'Oci',
  'ferry': 'Oci',
  'enterticket': 'Oci',
  'cinemes': 'Oci',

  // Restaurants específics del fitxer Marc
  'kiyani royal': 'Restaurants',
  'la puerta': 'Restaurants',
  'la gola': 'Restaurants',
  'zona pradals': 'Restaurants',
  'bar mirador': 'Restaurants',
  'charter': 'Restaurants',
  'arbitrade': 'Restaurants',
  'bar canarias': 'Restaurants',
  'trini': 'Restaurants',
  'reketepizza': 'Restaurants',
  'prog': 'Restaurants',
  'progese': 'Restaurants',
  'progeser': 'Restaurants',

  // Compres locals (botigues no identificables per marca)
  'gran bazar': 'Compres online',
  'kireta': 'Compres online',

  // Quotes i inversions
  'amortizacion': 'Préstecs',
  'amortitzacio': 'Préstecs',
  'deuda': 'Préstecs',
  'inversio': 'Estalvis',
  'inversion': 'Estalvis',
  'estalvi': 'Estalvis',

  // Altres
  'cial': 'Restaurants', // 'CIAL.ESPLUGUES' = 'Centre d'Informació i Animació Local'? Bàr.
  'el raconet': 'Restaurants',
};

/**
 * Sorted list of tokens by length (longest first). The matcher uses this
 * to prefer more specific matches over generic ones — e.g. `starbucks`
 * (9 chars) should beat `bar ` (4 chars) when both are present.
 */
export const MERCHANT_TOKENS_SORTED: readonly string[] = Object.keys(
  MERCHANT_DICTIONARY,
).sort((a, b) => b.length - a.length);