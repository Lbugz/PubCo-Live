/**
 * EXHAUSTIVE LABEL CLASSIFICATION ENGINE
 * 
 * Classifies music labels/distributors into 4 tiers with intelligent fallback logic:
 * 
 * Tier 1: DIY Distribution (3 pts) - DistroKid, TuneCore, CD Baby, etc.
 * Tier 2: Indie Distributors/Labels (2 pts) - EMPIRE, AWAL, The Orchard, etc.
 * Tier 3: Major Distribution (1 pt) - ADA, Ingrooves, etc.
 * Tier 4: Major Labels (0 pts) - Sony, Warner, Universal, etc.
 * 
 * Fallback Logic (for unknown labels):
 * 1. Check if label contains artist name → DIY (3 pts)
 * 2. Check for generic vanity patterns → DIY (3 pts)
 * 3. Check for multi-word "real label" structure → Indie (2 pts)
 * 4. Default to DIY (3 pts) - statistically most likely
 */

import labelData from './labelClassification.json';

export type LabelTier = 'diy' | 'indie' | 'majorDistribution' | 'major' | 'unknown';

export interface ClassificationResult {
  tier: LabelTier;
  score: number;
  matchedKeyword?: string;
  matchedPattern?: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

/**
 * Normalize label string for matching
 */
function normalizeLabel(label: string): string {
  return label.toLowerCase().trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' ').replace(/\s+/g, ' ');
}

/**
 * Check if label contains artist name (vanity label detection)
 */
function isArtistVanityLabel(label: string, artistName?: string): boolean {
  if (!artistName || artistName.length < 3) return false;
  
  const normalizedLabel = normalizeLabel(label);
  const normalizedArtist = normalizeLabel(artistName);
  
  // Check if artist name appears in label
  return normalizedLabel.includes(normalizedArtist);
}

/**
 * Check if label matches generic vanity imprint patterns
 */
function matchesVanityPattern(label: string): string | null {
  const normalized = normalizeLabel(label);
  const patterns = labelData.patterns.vanityImprint.patterns;
  
  for (const pattern of patterns) {
    if (normalized.includes(pattern)) {
      return pattern;
    }
  }
  
  return null;
}

/**
 * Check if label matches self-release indicators
 */
function matchesSelfReleasePattern(label: string): string | null {
  const normalized = normalizeLabel(label);
  const patterns = labelData.patterns.selfRelease.patterns;
  
  for (const pattern of patterns) {
    if (normalized.includes(pattern)) {
      return pattern;
    }
  }
  
  return null;
}

/**
 * Check if label looks like a "real" indie label (multi-word, capitalized)
 */
function looksLikeRealLabel(label: string): boolean {
  // Check if label has multiple words (excluding common suffixes)
  const words = label.trim().split(/\s+/);
  
  // Must have 2+ words to be considered a "real" label name
  if (words.length < 2) return false;
  
  // Check if first word is capitalized (suggests proper name, not generic)
  const firstWord = words[0];
  if (firstWord.length > 0 && firstWord[0] === firstWord[0].toUpperCase()) {
    return true;
  }
  
  return false;
}

/**
 * Check DIY distribution keywords
 */
function checkDIYDistribution(label: string): string | null {
  const normalized = normalizeLabel(label);
  
  for (const keyword of labelData.diy.keywords) {
    if (normalized.includes(keyword)) {
      return keyword;
    }
  }
  
  return null;
}

/**
 * Check indie distributors and labels
 */
function checkIndieDistribution(label: string): string | null {
  const normalized = normalizeLabel(label);
  
  // Check indie distributors
  for (const keyword of labelData.indie.distributors) {
    if (normalized.includes(keyword)) {
      return keyword;
    }
  }
  
  // Check indie labels
  for (const keyword of labelData.indie.labels) {
    if (normalized.includes(keyword)) {
      return keyword;
    }
  }
  
  return null;
}

/**
 * Check major distribution keywords
 */
function checkMajorDistribution(label: string): string | null {
  const normalized = normalizeLabel(label);
  
  for (const keyword of labelData.majorDistribution.keywords) {
    if (normalized.includes(keyword)) {
      return keyword;
    }
  }
  
  return null;
}

/**
 * Check major label keywords
 */
function checkMajorLabel(label: string): string | null {
  const normalized = normalizeLabel(label);
  
  // Check all major label families
  const allMajorKeywords = [
    ...labelData.major.sony,
    ...labelData.major.warner,
    ...labelData.major.universal
  ];
  
  for (const keyword of allMajorKeywords) {
    if (normalized.includes(keyword)) {
      return keyword;
    }
  }
  
  return null;
}

/**
 * Classify a label into one of 4 tiers with intelligent fallback logic
 */
export function classifyLabel(label: string | null, artistName?: string): ClassificationResult {
  // Handle null/empty labels
  if (!label || label.trim() === '') {
    return {
      tier: 'unknown',
      score: 3, // Default unknown to DIY (3 pts) - statistically most likely
      confidence: 'low',
      reasoning: 'No label metadata - defaulting to DIY (statistically most common)'
    };
  }
  
  // STEP 1: Check known label lists (highest confidence)
  
  // Check DIY distribution
  const diyMatch = checkDIYDistribution(label);
  if (diyMatch) {
    return {
      tier: 'diy',
      score: 3,
      matchedKeyword: diyMatch,
      confidence: 'high',
      reasoning: `Matched DIY distributor: ${diyMatch}`
    };
  }
  
  // Check major labels (check this before indie to avoid false positives)
  const majorMatch = checkMajorLabel(label);
  if (majorMatch) {
    return {
      tier: 'major',
      score: 0,
      matchedKeyword: majorMatch,
      confidence: 'high',
      reasoning: `Matched major label: ${majorMatch}`
    };
  }
  
  // Check major distribution
  const majorDistMatch = checkMajorDistribution(label);
  if (majorDistMatch) {
    return {
      tier: 'majorDistribution',
      score: 1,
      matchedKeyword: majorDistMatch,
      confidence: 'high',
      reasoning: `Matched major distribution: ${majorDistMatch}`
    };
  }
  
  // Check indie distributors/labels
  const indieMatch = checkIndieDistribution(label);
  if (indieMatch) {
    return {
      tier: 'indie',
      score: 2,
      matchedKeyword: indieMatch,
      confidence: 'high',
      reasoning: `Matched indie distributor/label: ${indieMatch}`
    };
  }
  
  // STEP 2: Pattern-based fallback logic (medium confidence)
  
  // Check if label is artist's vanity imprint
  if (artistName && isArtistVanityLabel(label, artistName)) {
    return {
      tier: 'diy',
      score: 3,
      matchedPattern: 'artist_vanity_label',
      confidence: 'medium',
      reasoning: `Label contains artist name - likely vanity imprint`
    };
  }
  
  // Check for explicit self-release indicators
  const selfReleaseMatch = matchesSelfReleasePattern(label);
  if (selfReleaseMatch) {
    return {
      tier: 'diy',
      score: 3,
      matchedPattern: selfReleaseMatch,
      confidence: 'high',
      reasoning: `Explicit self-release indicator: ${selfReleaseMatch}`
    };
  }
  
  // Check for generic vanity imprint patterns
  const vanityMatch = matchesVanityPattern(label);
  if (vanityMatch) {
    return {
      tier: 'diy',
      score: 3,
      matchedPattern: vanityMatch,
      confidence: 'medium',
      reasoning: `Generic vanity label pattern: ${vanityMatch}`
    };
  }
  
  // Check if it looks like a real indie label (multi-word, proper capitalization)
  if (looksLikeRealLabel(label)) {
    return {
      tier: 'indie',
      score: 2,
      matchedPattern: 'multi_word_label',
      confidence: 'medium',
      reasoning: 'Multi-word label name suggests independent label'
    };
  }
  
  // STEP 3: Final fallback - default to DIY (statistically most likely)
  return {
    tier: 'diy',
    score: 3,
    confidence: 'low',
    reasoning: 'Unknown label - defaulting to DIY (70%+ of unknown labels are self-released)'
  };
}

/**
 * Classify multiple labels and return the most representative tier
 * (Used when an artist has multiple releases across different labels)
 * 
 * Priority logic:
 * 1. If ANY label is Major → return Major (0 pts) - signed artists take precedence
 * 2. If ANY label is Major Distribution → return Major Dist (1 pt)
 * 3. Otherwise, return the highest-scoring tier from explicit matches
 * 4. If no explicit matches, default to DIY (3 pts) only if all labels are unknown
 */
export function classifyMultipleLabels(labels: Array<string | null>, artistName?: string): ClassificationResult {
  if (labels.length === 0) {
    return {
      tier: 'unknown',
      score: 0,
      confidence: 'low',
      reasoning: 'No labels provided - cannot determine distribution'
    };
  }
  
  // Filter out null/empty labels
  const validLabels = labels.filter(label => label && label.trim() !== '');
  
  if (validLabels.length === 0) {
    return {
      tier: 'unknown',
      score: 0,
      confidence: 'low',
      reasoning: 'No valid labels - cannot determine distribution'
    };
  }
  
  // Classify each label
  const results = validLabels.map(label => classifyLabel(label, artistName));
  
  // CRITICAL: Check for major label first (takes precedence over everything)
  const majorLabelMatch = results.find(r => r.tier === 'major');
  if (majorLabelMatch) {
    return majorLabelMatch;
  }
  
  // Check for major distribution (takes precedence over indie/DIY)
  const majorDistMatch = results.find(r => r.tier === 'majorDistribution');
  if (majorDistMatch) {
    return majorDistMatch;
  }
  
  // Separate explicit matches from pattern-based defaults
  const explicitMatches = results.filter(r => r.confidence === 'high');
  const patternMatches = results.filter(r => r.confidence === 'medium');
  const unknownDefaults = results.filter(r => r.confidence === 'low' && r.tier === 'diy');
  
  // If we have explicit matches, return the highest scoring one
  if (explicitMatches.length > 0) {
    explicitMatches.sort((a, b) => b.score - a.score);
    return explicitMatches[0];
  }
  
  // If we have pattern matches (vanity labels, etc), return highest scoring
  if (patternMatches.length > 0) {
    patternMatches.sort((a, b) => b.score - a.score);
    return patternMatches[0];
  }
  
  // Only default to DIY if ALL labels are unknown (no explicit or pattern matches)
  if (unknownDefaults.length === results.length) {
    return {
      tier: 'diy',
      score: 3,
      confidence: 'low',
      reasoning: 'All labels unknown - defaulting to DIY (statistically most likely)'
    };
  }
  
  // Fallback: return highest confidence result
  results.sort((a, b) => {
    // Sort by confidence first (high > medium > low)
    const confidenceOrder: Record<string, number> = { 'high': 3, 'medium': 2, 'low': 1 };
    const confDiff = confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
    if (confDiff !== 0) return confDiff;
    
    // Then by score
    return b.score - a.score;
  });
  
  return results[0];
}
