/**
 * Text formatting utilities for cleaning up ALL CAPS text from Excel imports
 */

// Words that should remain lowercase (unless at start of string)
const LOWERCASE_WORDS = new Set([
  'and', 'or', 'of', 'the', 'for', 'in', 'at', 'to', 'by', 'with', 'a', 'an',
  'on', 'as', 'but', 'nor', 'yet', 'so', 'from', 'into', 'onto', 'upon', 'per'
]);

// Acronyms and abbreviations that should stay uppercase
const PRESERVE_UPPERCASE = new Set([
  'GPL', 'GWI', 'CJIA', 'HECI', 'MARAD', 'GCAA', 'EPC', 'LOT', 'NO', 'SCADA', 'DBIS',
  'GUYSUCO', 'NCN', 'GBC', 'GNIC', 'GNBS', 'GRDB', 'GSA', 'GPHC', 'GPOC', 'GGMC',
  'CBD', 'HQ', 'MOU', 'NIS', 'GRA', 'GPC', 'GEC', 'CDC', 'PNC', 'PPP', 'AFC',
  'USA', 'UK', 'EU', 'UN', 'UNDP', 'IDB', 'IADB', 'CDB', 'IMF', 'CARICOM',
  'KV', 'MW', 'KW', 'KVA', 'MVA', 'HP', 'PSI', 'AC', 'DC', 'LED', 'CCTV', 'IT', 'ICT',
  'ID', 'GPS', 'GIS', 'CAD', 'PDF', 'USD', 'GYD', 'HV', 'LV', 'MV',
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'HVAC', 'UPS', 'PVC', 'HDPE', 'DI', 'CI', 'GI', 'MS', 'SS', 'RCC', 'RC',
  'TS', 'PS', 'WTP', 'WWTP', 'STP', 'EIA', 'ESIA', 'EMP', 'TOR', 'RFP', 'RFQ', 'EOI',
  'NTC', 'ATC', 'VOR', 'ILS', 'DME', 'PAPI', 'RESA', 'TWY', 'RWY', 'AGL',
  'PMU', 'PIU', 'PCU', 'PSIP', 'PMC', 'FIDIC', 'BOQ', 'BOM', 'WBS',
  'QA', 'QC', 'HSE', 'HSSE', 'PPE', 'SOP', 'OEM', 'O&M', 'M&E',
  'BOOT', 'BOT', 'EPC', 'EPCM', 'DBB', 'DB'
]);

// Guyana-specific proper nouns
const PROPER_NOUNS: Record<string, string> = {
  'demerara': 'Demerara',
  'berbice': 'Berbice',
  'essequibo': 'Essequibo',
  'georgetown': 'Georgetown',
  'linden': 'Linden',
  'bartica': 'Bartica',
  'lethem': 'Lethem',
  'mabaruma': 'Mabaruma',
  'mahdia': 'Mahdia',
  'parika': 'Parika',
  'vreed-en-hoop': 'Vreed-en-Hoop',
  'corriverton': 'Corriverton',
  'new amsterdam': 'New Amsterdam',
  'anna regina': 'Anna Regina',
  'rose hall': 'Rose Hall',
  'skeldon': 'Skeldon',
  'tuschen': 'Tuschen',
  'uitvlugt': 'Uitvlugt',
  'wales': 'Wales',
  'enmore': 'Enmore',
  'guyana': 'Guyana',
  'guyanese': 'Guyanese',
  'atlantic': 'Atlantic',
  'caribbean': 'Caribbean',
  'amerindian': 'Amerindian',
  'amazon': 'Amazon',
  'rupununi': 'Rupununi',
  'pomeroon': 'Pomeroon',
  'cuyuni': 'Cuyuni',
  'mazaruni': 'Mazaruni',
  'potaro': 'Potaro',
  'kaieteur': 'Kaieteur',
  'timehri': 'Timehri',
  'ogle': 'Ogle'
};

/**
 * Check if a string is all uppercase (ignoring numbers and special chars)
 */
function isAllCaps(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length === 0) return false;
  return letters === letters.toUpperCase();
}

/**
 * Capitalize the first letter of a word
 */
function capitalizeFirst(word: string): string {
  if (word.length === 0) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Convert ALL CAPS text to Title Case with intelligent handling
 *
 * Rules:
 * - Converts all caps words to title case
 * - Keeps articles/prepositions lowercase (except at start)
 * - Preserves known acronyms in uppercase
 * - Handles Guyana-specific proper nouns
 * - Preserves "Region X" formatting
 * - Handles hyphenated words
 */
export function toTitleCase(text: string | null | undefined): string {
  if (!text) return '';

  // If not all caps, return as-is (assume already formatted)
  if (!isAllCaps(text)) return text;

  // Split by spaces while preserving multiple spaces
  const words = text.split(/(\s+)/);
  let isFirstWord = true;

  const result = words.map((segment, index) => {
    // Preserve whitespace segments
    if (/^\s+$/.test(segment)) return segment;

    const word = segment;
    const upperWord = word.toUpperCase();
    const lowerWord = word.toLowerCase();

    // Check if it's a known acronym
    if (PRESERVE_UPPERCASE.has(upperWord)) {
      isFirstWord = false;
      return upperWord;
    }

    // Check for proper nouns (case-insensitive lookup)
    if (PROPER_NOUNS[lowerWord]) {
      isFirstWord = false;
      return PROPER_NOUNS[lowerWord];
    }

    // Handle "Region X" pattern
    if (lowerWord === 'region') {
      isFirstWord = false;
      return 'Region';
    }

    // Handle hyphenated words
    if (word.includes('-')) {
      const parts = word.split('-');
      const formatted = parts.map((part, partIndex) => {
        const upperPart = part.toUpperCase();
        const lowerPart = part.toLowerCase();

        if (PRESERVE_UPPERCASE.has(upperPart)) return upperPart;
        if (PROPER_NOUNS[lowerPart]) return PROPER_NOUNS[lowerPart];

        // For hyphenated words, capitalize each part
        return capitalizeFirst(part);
      }).join('-');
      isFirstWord = false;
      return formatted;
    }

    // Handle words with numbers (like "Phase1" or "Lot2")
    if (/\d/.test(word)) {
      // Preserve the structure, just format the letters
      const formatted = word.replace(/[a-zA-Z]+/g, (match) => {
        const upper = match.toUpperCase();
        if (PRESERVE_UPPERCASE.has(upper)) return upper;
        return capitalizeFirst(match);
      });
      isFirstWord = false;
      return formatted;
    }

    // Check if it should be lowercase (articles, prepositions)
    if (LOWERCASE_WORDS.has(lowerWord) && !isFirstWord) {
      return lowerWord;
    }

    // Default: capitalize first letter
    isFirstWord = false;
    return capitalizeFirst(word);
  });

  return result.join('');
}

/**
 * Clean up contractor names
 * Handles common patterns in contractor data
 */
export function formatContractorName(name: string | null | undefined): string {
  if (!name) return '';

  let formatted = toTitleCase(name);

  // Fix common patterns
  formatted = formatted
    // Fix "Ltd" variations
    .replace(/\bLtd\b/gi, 'Ltd.')
    .replace(/\bLtd\.\./g, 'Ltd.')
    // Fix "Inc" variations
    .replace(/\bInc\b/gi, 'Inc.')
    .replace(/\bInc\.\./g, 'Inc.')
    // Fix "Co" variations
    .replace(/\bCo\b/gi, 'Co.')
    .replace(/\bCo\.\./g, 'Co.')
    // Fix "&" spacing
    .replace(/\s*&\s*/g, ' & ')
    // Fix multiple spaces
    .replace(/\s+/g, ' ')
    .trim();

  return formatted;
}

/**
 * Format region names consistently
 */
export function formatRegion(region: string | null | undefined): string {
  if (!region) return '';

  let formatted = toTitleCase(region);

  // Standardize "Region X" format
  formatted = formatted.replace(/region\s*(\d+)/gi, 'Region $1');

  return formatted.trim();
}

/**
 * Format project status
 */
export function formatStatus(status: string | null | undefined): string {
  if (!status) return '';

  const lower = status.toLowerCase().trim();

  // Standardize common statuses
  const statusMap: Record<string, string> = {
    'in progress': 'In Progress',
    'inprogress': 'In Progress',
    'in-progress': 'In Progress',
    'completed': 'Completed',
    'complete': 'Completed',
    'not started': 'Not Started',
    'notstarted': 'Not Started',
    'not-started': 'Not Started',
    'pending': 'Pending',
    'on hold': 'On Hold',
    'onhold': 'On Hold',
    'on-hold': 'On Hold',
    'cancelled': 'Cancelled',
    'canceled': 'Cancelled',
    'delayed': 'Delayed',
    'behind schedule': 'Behind Schedule',
    'ahead of schedule': 'Ahead of Schedule',
    'on schedule': 'On Schedule',
    'at risk': 'At Risk'
  };

  return statusMap[lower] || toTitleCase(status);
}
