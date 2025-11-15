
export interface TrackData {
  playlistName: string;
  label: string | null;
  publisher?: string | null;
  writer?: string | null;
  artistName?: string;
  songwriter?: string;
  wowGrowthPct?: number | null;
}

const RUBRIC = {
  missingPublisher: 5,           // Highest priority - unsigned publishing opportunity
  missingWriter: 3,              // Metadata gap - potential self-written/DIY artist
  artistIsWriter_FreshFinds: 3,  // Artist wrote their own song + editorial validation
  artistIsWriter_Indie: 2,       // Self-released + self-written = strong unsigned signal
  streamVelocity_High: 2,        // >50% WoW growth = urgent opportunity
  streamVelocity_Medium: 1,      // >20% WoW growth = watch closely
};

/**
 * Check if the artist is also the songwriter
 * Handles common name variations and formatting
 */
function isArtistTheSongwriter(artistName: string | undefined, songwriter: string | null | undefined): boolean {
  if (!artistName || !songwriter) return false;
  
  // Normalize both strings for comparison
  const normalizedArtist = artistName.toLowerCase().trim();
  const normalizedSongwriter = songwriter.toLowerCase().trim();
  
  // Check if songwriter field contains the artist name
  // (handles cases like "Artist Name, Other Writer")
  return normalizedSongwriter.includes(normalizedArtist) || 
         normalizedArtist.includes(normalizedSongwriter);
}

export function calculateUnsignedScore(track: TrackData): number {
  let score = 0;

  // Highest priority: Missing publisher = unsigned publishing opportunity
  if (!track.publisher) {
    score += RUBRIC.missingPublisher;
  }

  // Missing writer metadata = potential unsigned/DIY artist
  if (!track.writer) {
    score += RUBRIC.missingWriter;
  }

  // Check if artist is the songwriter for self-written bonuses
  const isSelfWritten = isArtistTheSongwriter(track.artistName, track.songwriter);

  // Fresh Finds bonus ONLY if artist wrote the song themselves
  if (isSelfWritten && track.playlistName.toLowerCase().includes("fresh finds")) {
    score += RUBRIC.artistIsWriter_FreshFinds;
  }

  // Independent label bonus ONLY if artist is the songwriter
  // (self-released + self-written = strong unsigned signal)
  if (isSelfWritten && track.label && /\b(DK|DIY|indie|independent)\b/i.test(track.label)) {
    score += RUBRIC.artistIsWriter_Indie;
  }

  // Stream velocity bonus (from performanceTracking.ts)
  if (track.wowGrowthPct !== undefined && track.wowGrowthPct !== null) {
    if (track.wowGrowthPct > 50) {
      score += RUBRIC.streamVelocity_High;
    } else if (track.wowGrowthPct > 20) {
      score += RUBRIC.streamVelocity_Medium;
    }
  }

  // No major label penalty - hired songwriters can write for major artists
  // and still be unsigned publishers

  return Math.max(0, Math.min(10, score));
}
