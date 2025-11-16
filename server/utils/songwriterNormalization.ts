/**
 * Songwriter Name Normalization Utilities
 * 
 * Provides text normalization and matching logic for songwriter identity resolution.
 * Used by the identity enrichment service to map Spotify credits to songwriter_profiles.
 */

export function normalizeSongwriterName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\bjr\b|\bsr\b|\bi+\b|\biv\b/g, '')
    .trim();
}

export function tokenizeName(name: string): string[] {
  return normalizeSongwriterName(name)
    .split(' ')
    .filter(token => token.length > 1);
}

export function isStrongNameMatch(name1: string, name2: string): boolean {
  const norm1 = normalizeSongwriterName(name1);
  const norm2 = normalizeSongwriterName(name2);
  
  if (norm1 === norm2) {
    return true;
  }
  
  const tokens1 = new Set(tokenizeName(name1));
  const tokens2 = new Set(tokenizeName(name2));
  
  const tokens1Array = Array.from(tokens1);
  const intersection = new Set(tokens1Array.filter(x => tokens2.has(x)));
  const union = new Set(Array.from(tokens1).concat(Array.from(tokens2)));
  
  const similarity = intersection.size / union.size;
  return similarity >= 0.75;
}

export function extractIndividualSongwriters(spotifyCredits: string): string[] {
  if (!spotifyCredits || spotifyCredits === '-') {
    return [];
  }
  
  const separators = /,(?![^(]*\))|;|\s+and\s+|\s+&\s+/i;
  
  return spotifyCredits
    .split(separators)
    .map(name => name.trim())
    .filter(name => name && name !== '-')
    .map(name => name.replace(/^["']|["']$/g, ''))
    .filter(name => name.length > 0);
}

export function scoreNameMatch(spotifyName: string, profileName: string): {
  score: number;
  matchType: 'exact' | 'normalized' | 'partial' | 'none';
} {
  if (spotifyName.toLowerCase() === profileName.toLowerCase()) {
    return { score: 1.0, matchType: 'exact' };
  }
  
  const normSpotify = normalizeSongwriterName(spotifyName);
  const normProfile = normalizeSongwriterName(profileName);
  
  if (normSpotify === normProfile) {
    return { score: 0.9, matchType: 'normalized' };
  }
  
  const tokensSpotify = new Set(tokenizeName(spotifyName));
  const tokensProfile = new Set(tokenizeName(profileName));
  
  const tokensSpotifyArray = Array.from(tokensSpotify);
  const intersection = new Set(tokensSpotifyArray.filter(x => tokensProfile.has(x)));
  const union = new Set(Array.from(tokensSpotify).concat(Array.from(tokensProfile)));
  
  if (union.size === 0) {
    return { score: 0, matchType: 'none' };
  }
  
  const jaccardSimilarity = intersection.size / union.size;
  
  if (jaccardSimilarity >= 0.75) {
    return { score: jaccardSimilarity * 0.8, matchType: 'partial' };
  }
  
  return { score: jaccardSimilarity, matchType: 'none' };
}
