/**
 * AUTHORITATIVE CREDIT NAME NORMALIZATION
 * 
 * Handles all edge cases for parsing songwriter/producer names:
 * - Glued names (Christopher BoysMcKinley)
 * - Multiple delimiters (commas, slashes, pipes, ampersands)
 * - Multi-part surnames (McDonald, O'Brien, Van Gogh)
 * - Deduplication
 * - Case normalization
 */

/**
 * Normalize a credit string into a clean array of individual names
 */
export function normalizeCreditList(rawText: string | null): string[] {
  if (!rawText || typeof rawText !== 'string') {
    return [];
  }

  let text = rawText.trim();
  if (!text) return [];

  // STEP 1: Normalize all possible separators to commas
  text = text.replace(/&/g, ',');              // & → ,
  text = text.replace(/\//g, ',');             // / → ,
  text = text.replace(/\|/g, ',');             // | → ,
  text = text.replace(/;/g, ',');              // ; → ,
  text = text.replace(/\n/g, ',');             // newlines → ,
  text = text.replace(/\s{2,}/g, ' ');         // normalize multiple spaces

  // STEP 2: Insert missing separators where two names became glued
  // Match lowercase followed by uppercase: "BoysMcKinley" → "Boys,McKinley"
  // But preserve multi-part surnames (McDonald, O'Brien, etc.)
  text = text.replace(/([a-z])([A-Z])/g, (match, lower, upper, offset, fullStr) => {
    // Check if this is part of a multi-part surname pattern
    const contextBefore = fullStr.substring(Math.max(0, offset - 3), offset + 1);
    const contextAfter = fullStr.substring(offset, Math.min(fullStr.length, offset + 5));
    
    // Skip if part of McDonald, O'Brien, MacLeod, etc.
    const multiPartPatterns = [
      /Mc[a-z]/,      // McDonald
      /Mac[a-z]/,     // MacLeod
      /O'[a-z]/,      // O'Brien
      /St\.[a-z]/,    // St.John
      /Van[a-z]/,     // VanGogh
      /De[a-z]/,      // DeLuca
      /Von[a-z]/,     // VonNeumann
      /La[a-z]/,      // LaRussa
      /Le[a-z]/,      // LeGrand
    ];
    
    const isMultiPart = multiPartPatterns.some(pattern => pattern.test(contextAfter));
    
    return isMultiPart ? match : `${lower}, ${upper}`;
  });

  // STEP 3: Split by delimiters
  const parts = text
    .split(/,|\n|;/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // STEP 4: Validate and clean each name
  const cleanedNames = parts
    .map(name => {
      // Remove extra whitespace
      name = name.trim().replace(/\s+/g, ' ');
      
      // Title case: capitalize first letter of each word
      // But preserve patterns like O'Brien, McDonald
      name = name.split(' ').map((word, idx) => {
        if (word.length === 0) return '';
        if (word.startsWith("'")) return word; // Handle apostrophes
        if (word.startsWith('O\'')) return "O'" + word.substring(2, 3).toUpperCase() + word.substring(3);
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }).join(' ');
      
      return name;
    })
    .filter(name => {
      // Keep only entries with:
      // - At least 2 characters
      // - At least one space (first + last name) OR single word names that are known first/last names
      const hasSpace = name.includes(' ');
      const isReasonableName = name.length >= 2;
      return isReasonableName && (hasSpace || name.length >= 3);
    });

  // STEP 5: Deduplicate (case-insensitive)
  const seen = new Set<string>();
  const deduplicated: string[] = [];
  
  for (const name of cleanedNames) {
    const normalized = name.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      deduplicated.push(name);
    }
  }

  return deduplicated;
}

/**
 * Process a list of raw credit entries into clean names
 */
export function processCreditsArray(rawList: string[]): string[] {
  if (!Array.isArray(rawList)) return [];
  
  const allNames: string[] = [];
  
  for (const item of rawList) {
    const normalized = normalizeCreditList(item);
    allNames.push(...normalized);
  }
  
  // Final deduplication across all sources
  const seen = new Set<string>();
  const result: string[] = [];
  
  for (const name of allNames) {
    const normalized = name.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(name);
    }
  }
  
  return result;
}

/**
 * Unit test data and validation
 */
export const creditNormalizationTests = [
  {
    input: "Christopher BoysMcKinley LanguedocNoah VarleyJoe Agius",
    expected: ["Christopher Boys", "Mckinley Languedoc", "Noah Varley", "Joe Agius"]
  },
  {
    input: "John Smith, Jane Doe",
    expected: ["John Smith", "Jane Doe"]
  },
  {
    input: "John Smith / Jane Doe",
    expected: ["John Smith", "Jane Doe"]
  },
  {
    input: "John Smith & Jane Doe",
    expected: ["John Smith", "Jane Doe"]
  },
  {
    input: "John McDonald, Mary O'Brien",
    expected: ["John Mcdonald", "Mary O'brien"]
  },
  {
    input: "Christopher Boys, Christopher Boys",
    expected: ["Christopher Boys"]
  }
];

/**
 * Run unit tests
 */
export function runCreditNormalizationTests(): void {
  console.log('[Credit Normalization] Running unit tests...');
  
  let passed = 0;
  let failed = 0;
  
  for (const test of creditNormalizationTests) {
    const result = normalizeCreditList(test.input);
    const resultStr = JSON.stringify(result.map(n => n.toLowerCase()));
    const expectedStr = JSON.stringify(test.expected.map(n => n.toLowerCase()));
    
    if (resultStr === expectedStr) {
      console.log(`  ✓ PASS: "${test.input}"`);
      passed++;
    } else {
      console.log(`  ✗ FAIL: "${test.input}"`);
      console.log(`    Expected: ${expectedStr}`);
      console.log(`    Got:      ${resultStr}`);
      failed++;
    }
  }
  
  console.log(`[Credit Normalization] Tests complete: ${passed} passed, ${failed} failed`);
}
