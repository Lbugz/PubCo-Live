/**
 * Test script for name splitting logic
 */

// Improved approach: Split first, then merge known patterns
function detectAndSplitConcatenatedNames(fullName: string): string[] {
  if (!fullName || typeof fullName !== 'string') return [];
  
  const trimmed = fullName.trim();
  
  // Step 1: Split at ALL lowercase-to-uppercase transitions (but NOT across existing spaces)
  const rawSegments: string[] = [];
  let currentSegment = '';
  
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    const prevChar = i > 0 ? trimmed[i - 1] : '';
    
    // Handle spaces - they are word boundaries
    if (char === ' ') {
      if (currentSegment.trim().length > 0) {
        rawSegments.push(currentSegment.trim());
      }
      currentSegment = '';
      continue;
    }
    
    // Split at lowercase-to-uppercase transition (but only if previous char isn't a space)
    if (i > 0 && /[a-z]/.test(prevChar) && /[A-Z]/.test(char) && prevChar !== ' ') {
      if (currentSegment.trim().length > 0) {
        rawSegments.push(currentSegment.trim());
      }
      currentSegment = char;
    } else {
      currentSegment += char;
    }
  }
  
  // Don't forget the last segment
  if (currentSegment.trim().length > 0) {
    rawSegments.push(currentSegment.trim());
  }
  
  // If we got only one segment, return as-is (no concatenation detected)
  if (rawSegments.length <= 1) {
    return [trimmed];
  }
  
  // Step 2: Merge back segments that form known multi-part surname patterns
  const mergedSegments: string[] = [];
  let i = 0;
  
  while (i < rawSegments.length) {
    const current = rawSegments[i];
    const next = i + 1 < rawSegments.length ? rawSegments[i + 1] : null;
    
    // Check if current + next form a known surname pattern
    if (next) {
      const combined = current + next;
      
      // Known surname patterns:
      // Mc + Name (McDonald, McGuinness, McRae)
      const isMcPattern = /^Mc[A-Z][a-z]+$/.test(combined);
      // Mac + Name (MacRae, MacLeod, MacDonald)  
      const isMacPattern = /^Mac[A-Z][a-z]+$/.test(combined);
      // O' + Name (O'Brien, O'Connor)
      const isOPattern = /^O'[A-Z][a-z]+$/.test(combined);
      // St. + Name (St.Clair, St.John)
      const isStPattern = /^St\.[A-Z][a-z]+$/.test(combined);
      // Van + Name (VanHalen, VanDyke)
      const isVanPattern = /^Van[A-Z][a-z]+$/.test(combined);
      // De + Name (DeLuca, DeMarco)
      const isDePattern = /^De[A-Z][a-z]+$/.test(combined);
      // La + Name (LaRue, LaSalle)
      const isLaPattern = /^La[A-Z][a-z]+$/.test(combined);
      // Le + Name (LeBlanc, LeRoy)
      const isLePattern = /^Le[A-Z][a-z]+$/.test(combined);
      
      if (isMcPattern || isMacPattern || isOPattern || isStPattern || 
          isVanPattern || isDePattern || isLaPattern || isLePattern) {
        // Merge these two segments
        mergedSegments.push(combined);
        i += 2; // Skip both segments
        continue;
      }
    }
    
    // No pattern match, keep as-is
    mergedSegments.push(current);
    i++;
  }
  
  // Step 3: Determine if this is actually a concatenated name or just a regular name
  // If the input had proper spacing (e.g., "Lewis MacRae"), the mergedSegments will match 
  // the space-separated words, so it's NOT concatenated
  const wordsFromSpaces = trimmed.split(/\s+/);
  
  // If mergedSegments match the space-separated words, this is NOT concatenated
  if (mergedSegments.length === wordsFromSpaces.length) {
    // Join back with spaces to preserve the original formatting
    return [trimmed];
  }
  
  // Step 4: Group segments into full names (heuristic: names are 1-4 words each)
  // This is the tricky part - we need to figure out where one person's name ends
  // and another begins
  
  // Simple heuristic: If we have 4+ segments, group them into pairs/triples
  if (mergedSegments.length >= 4 && mergedSegments.length % 2 === 0) {
    const finalNames: string[] = [];
    for (let j = 0; j < mergedSegments.length; j += 2) {
      if (j + 1 < mergedSegments.length) {
        finalNames.push(mergedSegments[j] + ' ' + mergedSegments[j + 1]);
      } else {
        finalNames.push(mergedSegments[j]);
      }
    }
    return finalNames;
  }
  
  // Fallback: just join with spaces (might not be perfect but better than nothing)
  if (mergedSegments.length >= 2) {
    return mergedSegments.map(s => s.trim()).filter(s => s.length > 1);
  }
  
  return [trimmed];
}

// Test cases
const tests = [
  { input: 'Lewis MacRaeMatthew Dix', expected: ['Lewis MacRae', 'Matthew Dix'] },
  { input: 'Daniel McDonaldJohn Smith', expected: ['Daniel McDonald', 'John Smith'] },
  { input: 'Alex JonesKendall Quarles', expected: ['Alex Jones', 'Kendall Quarles'] },
  { input: "Patrick O'BrienMike Johnson", expected: ["Patrick O'Brien", "Mike Johnson"] },
  { input: 'Lewis MacRae', expected: ['Lewis MacRae'] },
  { input: 'Daniel McDonald', expected: ['Daniel McDonald'] },
  { input: "Patrick O'Brien", expected: ["Patrick O'Brien"] },
  { input: 'Alex JonesKendall QuarlesMiles McCollumNdabenhle TshabalalaPatryk PietrzakTrhaemheon Mitchell', expected: ['Alex Jones', 'Kendall Quarles', 'Miles McCollum', 'Ndabenhle Tshabalala', 'Patryk Pietrzak', 'Trhaemheon Mitchell'] },
];

console.log('Name Splitting Tests\n' + '='.repeat(80));

let passed = 0;
let failed = 0;

tests.forEach((test, idx) => {
  const result = detectAndSplitConcatenatedNames(test.input);
  const resultStr = result.map(n => `"${n}"`).join(', ');
  const expectedStr = test.expected.map(n => `"${n}"`).join(', ');
  const isCorrect = JSON.stringify(result) === JSON.stringify(test.expected);
  
  if (isCorrect) {
    console.log(`✓ Test ${idx + 1}: PASS`);
    console.log(`  Input:    ${test.input}`);
    console.log(`  Result:   [${resultStr}]\n`);
    passed++;
  } else {
    console.log(`✗ Test ${idx + 1}: FAIL`);
    console.log(`  Input:    ${test.input}`);
    console.log(`  Expected: [${expectedStr}]`);
    console.log(`  Got:      [${resultStr}]\n`);
    failed++;
  }
});

console.log('='.repeat(80));
console.log(`Results: ${passed} passed, ${failed} failed out of ${tests.length} tests`);

if (failed === 0) {
  console.log('\n✅ All tests passed!');
  process.exit(0);
} else {
  console.log(`\n❌ ${failed} test(s) failed`);
  process.exit(1);
}
