/**
 * Splits concatenated songwriter names using capital letter transitions
 * with safeguards against over-splitting legitimate names.
 * 
 * @param name - The name string to potentially split
 * @returns Array of individual names
 * 
 * Heuristic:
 * - Splits on lowercase→uppercase transitions (e.g., "MerweKayleigh")
 * - Only splits if: 
 *   a) 2+ transitions detected, OR
 *   b) 1 transition + at least one resulting segment has whitespace (multi-word name)
 * - Guards against splitting surnames with Mc/Mac prefixes
 */
export function splitConcatenatedNames(name: string): string[] {
  if (!name || typeof name !== 'string') {
    return [];
  }

  const capitalTransitions = (name.match(/[a-z][A-Z]/g) || []).length;

  // No transitions = single name
  if (capitalTransitions === 0) {
    return [name];
  }

  // Perform the split
  const splitNames: string[] = [];
  let currentName = '';

  for (let i = 0; i < name.length; i++) {
    const char = name[i];
    const prevChar = i > 0 ? name[i - 1] : '';

    // Split on lowercase→uppercase transition
    if (i > 0 && /[a-z]/.test(prevChar) && /[A-Z]/.test(char)) {
      if (currentName.trim().length > 0) {
        splitNames.push(currentName.trim());
      }
      currentName = char;
    } else {
      currentName += char;
    }
  }

  if (currentName.trim().length > 0) {
    splitNames.push(currentName.trim());
  }

  // Filter out segments that are too short (likely invalid)
  const validSegments = splitNames.filter((seg) => seg.length > 1);

  // Decide whether to accept the split
  const shouldSplit = decideShouldSplit(capitalTransitions, validSegments, name);

  return shouldSplit ? validSegments : [name];
}

/**
 * Decides whether to accept a name split based on heuristics
 */
function decideShouldSplit(transitions: number, segments: string[], original: string): boolean {
  // No valid segments = don't split
  if (segments.length === 0) {
    return false;
  }

  // 2+ transitions = likely concatenated
  if (transitions >= 2) {
    return true;
  }

  // 1 transition - need additional evidence
  if (transitions === 1) {
    // Check for Mc/Mac prefix exception
    if (hasMcMacPrefix(original)) {
      return false;
    }

    // At least one segment has whitespace = merged multi-word names
    const hasMultiWordSegment = segments.some((seg) => seg.includes(' '));
    if (hasMultiWordSegment) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a name contains Mc/Mac prefix patterns that shouldn't be split
 */
function hasMcMacPrefix(name: string): boolean {
  // Pattern: Mc or Mac followed by capital letter (e.g., "McDonald", "MacGregor")
  return /Mc[A-Z]/.test(name) || /Mac[A-Z]/.test(name);
}
