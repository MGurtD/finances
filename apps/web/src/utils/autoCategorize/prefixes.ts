/**
 * Prefix-based categorisation rules.
 *
 * Bank descriptions often start with a predictable token that strongly
 * indicates the category — much more reliably than fuzzy merchant matching.
 * Examples:
 *   "BAR CANARIAS ..."      → Restaurants i oci
 *   "RESTAURANT MONEL ..."  → Restaurants i oci
 *   "SUPERMERCAT ALIM..."   → Alimentacio
 *   "FARMACIA JENE ..."     → Salut
 *   "HOTEL MARESME ..."     → Viatges
 *
 * These rules fire BEFORE merchant-dictionary lookup so a long brand-name
 * ("AUDREY BOUTIQUE") doesn't pull a high-confidence match from a token
 * the user knows is wrong. Each rule specifies:
 *   - A regex pattern (matched against the normalised description)
 *   - The target category name
 *   - A confidence weight (0.5–0.85)
 *
 * Pattern matching is case-insensitive on the normalised text. Keep the
 * patterns specific — a rule like `^BAR\b` would over-match any description
 * starting with "BAR X".
 */

export interface PrefixRule {
  /** Regex source string (will be wrapped with /i flag). */
  pattern: string;
  /** Category name (must match a category from seed.go). */
  categoryName: string;
  /** Weight [0, 1]. Higher = stronger signal. */
  weight: number;
  /** Human-readable explanation. */
  detail: string;
}

export const PREFIX_RULES: readonly PrefixRule[] = [
  // ─── Restaurants i oci: bar / restaurant / café / oci ───
  {
    pattern: '^bar[\\-\\s]',
    categoryName: 'Restaurants i oci',
    weight: 0.78,
    detail: 'Comença amb "BAR" — probablement un bar',
  },
  {
    pattern: '^bar[-]',
    categoryName: 'Restaurants i oci',
    weight: 0.78,
    detail: 'Comença amb "BAR-" (bar/restaurant)',
  },
  {
    pattern: '^(restaurant|restaurante|rest\\.|rest )',
    categoryName: 'Restaurants i oci',
    weight: 0.85,
    detail: 'Comença amb "Restaurant"',
  },
  {
    pattern: '^cafe[\\-\\s]|^granja|^taberna|^cerveceria',
    categoryName: 'Restaurants i oci',
    weight: 0.7,
    detail: 'Café / granja / taberna',
  },
  {
    pattern: '^just eat|^glovo|^uber eats|^deliveroo',
    categoryName: 'Restaurants i oci',
    weight: 0.82,
    detail: 'Plataforma de delivery de menjar',
  },
  {
    pattern: '^kiyani|^mutick|^bk20250|^tecomo braseria|^es sardana|^viena|^degustast',
    categoryName: 'Restaurants i oci',
    weight: 0.7,
    detail: 'Restaurant local conegut',
  },
  {
    pattern: '^la gola del llop|^la puerta|^el raconet|^el cau de les|^el casal|^zona pradals|^zona blava|^fuertes gourmet|^bar[-]bodega',
    categoryName: 'Restaurants i oci',
    weight: 0.72,
    detail: 'Restaurant conegut per prefi compost',
  },
  {
    pattern: '^vivari|^trini|^caby|^konig ',
    categoryName: 'Restaurants i oci',
    weight: 0.7,
    detail: 'Restaurant local conegut',
  },
  {
    pattern: '^cial\\.|^cial ',
    categoryName: 'Restaurants i oci',
    weight: 0.6,
    detail: 'CIAL (centre d\'oci local)',
  },

  // ─── Alimentacio: supermercats / forns / fleques ───
  {
    pattern: '^supermercat|^alimentacion|^alimentaci',
    categoryName: 'Alimentacio',
    weight: 0.88,
    detail: 'Comença amb "Supermercat" o "Alimentacio"',
  },
  {
    pattern: '^ali super',
    categoryName: 'Alimentacio',
    weight: 0.85,
    detail: 'Alimentacio supermercat',
  },
  {
    pattern: '^alcampo',
    categoryName: 'Alimentacio',
    weight: 0.88,
    detail: 'Alcampo (supermercat)',
  },
  {
    pattern: '^lidl',
    categoryName: 'Alimentacio',
    weight: 0.88,
    detail: 'Lidl (supermercat)',
  },
  {
    pattern: '^euro maxi',
    categoryName: 'Alimentacio',
    weight: 0.85,
    detail: 'Euro Maxi (discount supermercat)',
  },
  {
    pattern: '^mercadona|^consum|^carrefour|^dia$|^dia ',
    categoryName: 'Alimentacio',
    weight: 0.85,
    detail: 'Supermercat conegut',
  },
  {
    pattern: '^garden ',
    categoryName: 'Alimentacio',
    weight: 0.7,
    detail: 'Garden (take-away / menjar preparat)',
  },
  {
    pattern: '^fleca|^forn |^panaderia|^panader |^pastisseria|^pasteleria',
    categoryName: 'Alimentacio',
    weight: 0.78,
    detail: 'Forn / fleca / panaderia',
  },

  // ─── Transport: gasolineres / vols / VTC ───
  {
    pattern: '^esclatoil|^repsol|^cepsa|^galp|^shell|^bp |^petroprix',
    categoryName: 'Transport',
    weight: 0.88,
    detail: 'Gasolinera',
  },
  {
    pattern: '^area dels pradals',
    categoryName: 'Compres',
    weight: 0.85,
    detail: 'Botiga "Area dels Pradals" (no es gasolinera)',
  },
  {
    pattern: '^area (de la |de les |dels |del |el )',
    categoryName: 'Transport',
    weight: 0.7,
    detail: 'Area (gasolinera de la C-25 o similar)',
  },
  {
    pattern: '^vueling|^iberia|^ryanair|^easyjet|^air europa',
    categoryName: 'Transport',
    weight: 0.85,
    detail: 'Aerolínia',
  },

  // ─── Subscripcions: streaming / cloud / SaaS ───
  {
    pattern: '^netflix|^spotify|^youtube$|^hbo|^disney|^apple\\.com|^icloud|^playstation|^xbox|^steam$',
    categoryName: 'Subscripcions',
    weight: 0.85,
    detail: 'Streaming / subscripció digital',
  },
  {
    pattern: '^github$|^openai|^claude$|^anthropic|^notion$|^figma$|^dropbox',
    categoryName: 'Subscripcions',
    weight: 0.85,
    detail: 'SaaS / cloud',
  },

  // ─── Salut: farmàcia / dentista / metge ───
  {
    pattern: '^farmacia|^farma |^dentista|^dentix|^clinica|^clínica|^hospital|^medico|^metge |^oculista|^optica|^fisioterapia|^fisio ',
    categoryName: 'Salut',
    weight: 0.85,
    detail: 'Salut (farmàcia, dentista, metge)',
  },

  // ───── Viatges: hotels / avions / lloguer cotxes ───
  {
    pattern: '^hotel|^hostal|^airbnb|^booking|^hertz|^avis|^europcar|^sixt|^enterprise',
    categoryName: 'Viatges',
    weight: 0.85,
    detail: 'Viatge / allotjament',
  },

  // ───── Família: escoles / guarderia ───
  {
    pattern: '^escola|^colegio|^col·legi|^collegi|^guarderia|^charter',
    categoryName: 'Familia',
    weight: 0.78,
    detail: 'Escola / guarderia',
  },

  // ───── Impostos i finances: amortitzacions, comissions, targetes ───
  {
    pattern: '^amortizacion|^amortitzacio|^comissio|^comision|^transferencia|^transfer |^swift|^sepa',
    categoryName: 'Impostos i finances',
    weight: 0.72,
    detail: 'Operació bancària / comissió / amortització',
  },

  // ───── Impostos i finances (cat Req 1 — loans/debts) ─────
  {
    pattern: '^banco cetelem\\b',
    categoryName: 'Impostos i finances',
    weight: 0.78,
    detail: 'Préstec Cetelem',
  },
  {
    // more-specific than the existing `^amortizacion` rule; both fire and
    // OR-aggregate so the score climbs without regressing single-token cases.
    pattern: '^amortizacion\\s+deuda\\b',
    categoryName: 'Impostos i finances',
    weight: 0.78,
    detail: 'Amortització de deute (més específic que ^amortizacion)',
  },

  // ───── Subscripcions (cat Req 3 — asterisk-bearing digital subs) ─────
  {
    pattern:
      '^google\\*youtube|^google\\*|^youtube\\*|^spotify\\*|^netflix\\*|^hbo\\*',
    categoryName: 'Subscripcions',
    weight: 0.85,
    detail: 'Subscripció digital amb asterisc bancari',
  },

  // ───── Salut (cat Req 7 — barbershop / hairdresser) ─────
  {
    // Anchored multi-alternation so `BAR MIRADOR` (existing Restaurants i
    // oci rule) doesn't over-match. Weight 0.9 beats the `breyker`
    // Compres merchant token (~0.87) for `BREYKER BARBER STUDIO`.
    pattern:
      '^breyker\\s+barber|^barbershop|^perruqueria|^peluqueria|^barberia',
    categoryName: 'Salut',
    weight: 0.9,
    detail: 'Peluqueria / barberia',
  },

  // ───── Compres: ecommerce, moda, bazars, kebabs ───
  {
    pattern: '^amazon|^amzn|^shein|^aliexpress|^temu|^ebay|^wallapop|^milanuncios',
    categoryName: 'Compres',
    weight: 0.88,
    detail: 'Marketplace online',
  },
  {
    pattern: '^zara$|^h&m$|^mango$|^bershka$|^pull&bear$|^pull |^primark$|^stradivarius$|^oysho$|^kiabi$',
    categoryName: 'Compres',
    weight: 0.85,
    detail: 'Marca de moda coneguda',
  },
  {
    pattern: '^ikea$|^leroy|^adeo|^mediamarkt$|^fnac$|^worten$|^coolmod$|^pccomponentes',
    categoryName: 'Compres',
    weight: 0.85,
    detail: 'Botiga d\'electrodomèstics / bricolage / electrònica',
  },
  {
    pattern:
      '^kaos urbano|^konig|^audrey|^kireta|^gran bazar|^bazar miami|^progeser|^progese|^beat mag',
    categoryName: 'Compres',
    weight: 0.7,
    detail: 'Botiga / marca local',
  },
  {
    // Very short / generic descriptions the user labeled as Compres.
    // These are weak signals — only fire when nothing else matches.
    pattern: '^coses$|^ft$|^rata$|^sin concepto$|^sin descripcion$|^sense concepte$|^cale?l?ts?$|^gopal ',
    categoryName: 'Compres',
    weight: 0.55,
    detail: 'Descripció genèrica — l\'usuari ho sol categoritzar com a compres',
  },
  {
    pattern: '^area dels pradals',
    categoryName: 'Compres',
    weight: 0.65,
    detail: 'Botiga "Area dels Pradals" (malgrat el prefix "area")',
  },
];
