import { db } from "../db";
import { playlistSnapshots, contacts, contactTracks, songwriterProfiles, trackedPlaylists } from "@shared/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { classifyLabel, classifyMultipleLabels } from "./labelClassifier";

/**
 * CATEGORY-BASED SCORING SYSTEM
 * 
 * This scoring system uses 6 weighted categories (total max = 10 points):
 * 
 * 1. Publishing Status (4 pts max) - No publisher across all tracks
 * 2. Release Pathway (3 pts max) - DIY (3pts) > Indie Distributor (2pts) > Indie Label (1pt) > Major/Unknown (0pts)
 * 3. Early Career Signals (2 pts max) - Fresh Finds presence
 * 4. Metadata Quality (1 pt max) - Average completeness (lower = better)
 * 5. Catalog Patterns (0.5 pts max) - >50% DIY/indie releases
 * 6. Profile Verification (0.5 pts max) - MusicBrainz presence
 * 
 * Each category is evaluated independently and contributes its own score.
 * Final score = sum of all category scores, rounded to integer.
 * 
 * RELEASE PATHWAY TIERS (EXHAUSTIVE CLASSIFICATION):
 * - DIY Distribution (3pts): 100+ aggregators including DistroKid, TuneCore, CD Baby, Ditto, Amuse, etc.
 * - Independent Distributor (2pts): EMPIRE, AWAL, The Orchard, Believe, Stem, United Masters, indie labels, etc.
 * - Major Distribution (1pt): ADA, Ingrooves, Virgin Music Group, etc.
 * - Major Label (0pts): Sony, Warner, Universal families + all subsidiaries
 * - Unknown (3pts): Defaults to DIY via pattern matching (artist vanity labels, generic imprints)
 * 
 * Uses intelligent fallback logic with artist name matching and vanity label pattern detection.
 */

export interface TrackSignal {
  signal: string;
  weight: number;
  description: string;
}

export interface CategoryScore {
  category: string;
  score: number;
  maxScore: number;
  signals: TrackSignal[];
}

export interface ContactScoreResult {
  contactId: string;
  songwriterId: string;
  finalScore: number;
  rawScore: number;
  confidence: 'high' | 'medium' | 'low';
  categories: CategoryScore[];
  updatedAt: Date;
}

// Calculate data completeness percentage for a track
function calculateDataCompleteness(track: any): number {
  const fields = [
    track.isrc,
    track.label,
    track.songwriter,
    track.publisher,
    track.administrators,
    track.ipiNumber,
    track.iswc,
    track.spotifyStreams,
    track.releaseDate
  ];
  
  const filledFields = fields.filter(field => field && field !== '' && field !== '[]').length;
  return (filledFields / fields.length) * 100;
}

// Check if track is on Fresh Finds playlist
function isFreshFindsTrack(playlistName: string | null): boolean {
  if (!playlistName) return false;
  return playlistName.toLowerCase().includes('fresh finds');
}

// Category 1: Publishing Status (4 points max)
function calculatePublishingStatusScore(tracks: any[]): CategoryScore {
  const category = 'Publishing Status';
  const maxScore = 4;
  const signals: TrackSignal[] = [];
  
  // Check if ALL tracks have no publisher
  const tracksWithoutPublisher = tracks.filter(track => 
    !track.publisher || track.publisher === '' || track.publisher === '[]'
  );
  
  if (tracksWithoutPublisher.length === tracks.length) {
    signals.push({
      signal: 'NO_PUBLISHER',
      weight: maxScore,
      description: 'No publisher metadata across all tracks'
    });
    return { category, score: maxScore, maxScore, signals };
  }
  
  return { category, score: 0, maxScore, signals };
}

// Category 2: Release Pathway (3 points max)
function calculateReleasePathwayScore(tracks: any[], artistName?: string): CategoryScore {
  const category = 'Release Pathway';
  const maxScore = 3;
  const signals: TrackSignal[] = [];
  
  if (tracks.length === 0) {
    return { category, score: 0, maxScore, signals };
  }
  
  // Collect all unique labels from tracks
  const labels = tracks.map(track => track.label).filter(Boolean);
  
  // Use the exhaustive classification engine
  const classification = classifyMultipleLabels(labels, artistName);
  
  // Map tier to signal name
  const signalMap: Record<string, string> = {
    'diy': 'DIY_DISTRIBUTION',
    'indie': 'INDEPENDENT_DISTRIBUTOR',
    'majorDistribution': 'MAJOR_DISTRIBUTION',
    'major': 'MAJOR_LABEL',
    'unknown': 'UNKNOWN_LABEL'
  };
  
  const signal = signalMap[classification.tier] || 'UNKNOWN_LABEL';
  
  signals.push({
    signal,
    weight: classification.score,
    description: classification.reasoning
  });
  
  return { category, score: classification.score, maxScore, signals };
}

// Category 3: Early Career Signals (2 points max)
function calculateEarlyCareerScore(tracks: any[]): CategoryScore {
  const category = 'Early Career Signals';
  const maxScore = 2;
  const signals: TrackSignal[] = [];
  
  // Check if ANY track appears on Fresh Finds
  const hasFreshFinds = tracks.some(track => isFreshFindsTrack(track.playlistName));
  
  if (hasFreshFinds) {
    signals.push({
      signal: 'FRESH_FINDS',
      weight: maxScore,
      description: 'Appears on Fresh Finds playlist'
    });
    return { category, score: maxScore, maxScore, signals };
  }
  
  return { category, score: 0, maxScore, signals };
}

// Category 4: Metadata Quality (1 point max)
function calculateMetadataQualityScore(tracks: any[]): CategoryScore {
  const category = 'Metadata Quality';
  const maxScore = 1;
  const signals: TrackSignal[] = [];
  
  // Calculate average completeness across all tracks
  const completenessPercentages = tracks.map(track => calculateDataCompleteness(track));
  const averageCompleteness = completenessPercentages.reduce((sum, pct) => sum + pct, 0) / completenessPercentages.length;
  
  let score = 0;
  let signal = '';
  
  if (averageCompleteness < 25) {
    score = 1;
    signal = 'COMPLETENESS_UNDER_25';
  } else if (averageCompleteness < 50) {
    score = 0.7;
    signal = 'COMPLETENESS_25_50';
  } else if (averageCompleteness < 75) {
    score = 0.5;
    signal = 'COMPLETENESS_50_75';
  } else {
    score = 0;
    signal = 'COMPLETENESS_75_PLUS';
  }
  
  signals.push({
    signal,
    weight: score,
    description: `Average data completeness: ${averageCompleteness.toFixed(0)}%`
  });
  
  return { category, score, maxScore, signals };
}

// Category 5: Catalog Patterns (0.5 points max)
function calculateCatalogPatternsScore(tracks: any[], artistName?: string): CategoryScore {
  const category = 'Catalog Patterns';
  const maxScore = 0.5;
  const signals: TrackSignal[] = [];
  
  // Check if >50% of tracks are DIY/indie using exhaustive classifier
  // IMPORTANT: Only count explicit DIY/indie matches, not unknown defaults
  const diyOrIndieCount = tracks.filter(track => {
    const classification = classifyLabel(track.label, artistName);
    // Only count if we have a positive signal (not unknown/default)
    // DIY (3pts) or Indie (2pts) with medium/high confidence
    return classification.score >= 2 && classification.confidence !== 'low';
  }).length;
  
  const diyIndiePercent = (diyOrIndieCount / tracks.length) * 100;
  
  if (diyIndiePercent > 50) {
    signals.push({
      signal: 'UNSIGNED_DISTRIBUTION_PATTERN',
      weight: maxScore,
      description: `${diyIndiePercent.toFixed(0)}% DIY/indie releases`
    });
    return { category, score: maxScore, maxScore, signals };
  }
  
  return { category, score: 0, maxScore, signals };
}

// Category 6: Profile Verification (0.5 points max)
function calculateProfileVerificationScore(contactData: any): CategoryScore {
  const category = 'Profile Verification';
  const maxScore = 0.5;
  const signals: TrackSignal[] = [];
  
  if (contactData.musicbrainzFound === 1) {
    signals.push({
      signal: 'MUSICBRAINZ_PRESENT',
      weight: maxScore,
      description: 'Verified via MusicBrainz'
    });
    return { category, score: maxScore, maxScore, signals };
  }
  
  return { category, score: 0, maxScore, signals };
}

// Calculate final contact score using category-based system
export async function calculateContactScore(contactId: string): Promise<ContactScoreResult> {
  // Fetch contact with songwriter profile
  const contactResult = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  
  if (contactResult.length === 0) {
    throw new Error(`Contact not found: ${contactId}`);
  }
  
  const contact = contactResult[0];
  
  // Fetch all tracks for this contact
  const trackRelations = await db
    .select({
      trackId: contactTracks.trackId
    })
    .from(contactTracks)
    .where(eq(contactTracks.contactId, contactId));
  
  if (trackRelations.length === 0) {
    // No tracks = score 0 with empty categories
    const emptyCategories: CategoryScore[] = [
      { category: 'Publishing Status', score: 0, maxScore: 4, signals: [] },
      { category: 'Release Pathway', score: 0, maxScore: 3, signals: [] },
      { category: 'Early Career Signals', score: 0, maxScore: 2, signals: [] },
      { category: 'Metadata Quality', score: 0, maxScore: 1, signals: [] },
      { category: 'Catalog Patterns', score: 0, maxScore: 0.5, signals: [] },
      { category: 'Profile Verification', score: 0, maxScore: 0.5, signals: [] }
    ];
    
    return {
      contactId,
      songwriterId: contact.songwriterId,
      finalScore: 0,
      rawScore: 0,
      confidence: 'low',
      categories: emptyCategories,
      updatedAt: new Date()
    };
  }
  
  const trackIds = trackRelations.map((tr: any) => tr.trackId);
  
  const tracks = await db
    .select()
    .from(playlistSnapshots)
    .where(inArray(playlistSnapshots.id, trackIds));
  
  // Fetch songwriter profile to get artist name for vanity label detection
  let artistName: string | undefined;
  if (contact.songwriterId) {
    const songwriterResult = await db
      .select({ name: songwriterProfiles.name })
      .from(songwriterProfiles)
      .where(eq(songwriterProfiles.id, contact.songwriterId))
      .limit(1);
    
    if (songwriterResult.length > 0) {
      artistName = songwriterResult[0].name;
    }
  }
  
  // Calculate scores for all 6 categories
  const categories: CategoryScore[] = [
    calculatePublishingStatusScore(tracks),
    calculateReleasePathwayScore(tracks, artistName),
    calculateEarlyCareerScore(tracks),
    calculateMetadataQualityScore(tracks),
    calculateCatalogPatternsScore(tracks, artistName),
    calculateProfileVerificationScore(contact)
  ];
  
  // Calculate raw score (sum of all category scores)
  const rawScore = categories.reduce((sum, cat) => sum + cat.score, 0);
  
  // Round to integer for final score
  const finalScore = Math.round(rawScore);
  
  // Determine confidence based on number of categories with signals detected
  const categoriesWithSignals = categories.filter(cat => cat.signals.length > 0).length;
  let confidence: 'high' | 'medium' | 'low';
  
  if (categoriesWithSignals >= 4) {
    confidence = 'high';
  } else if (categoriesWithSignals >= 2) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  
  return {
    contactId,
    songwriterId: contact.songwriterId,
    finalScore,
    rawScore,
    confidence,
    categories,
    updatedAt: new Date()
  };
}

// Update contact with new score
export async function updateContactScore(contactId: string): Promise<ContactScoreResult> {
  const scoreResult = await calculateContactScore(contactId);
  
  // Store category score data as JSON
  const categoryScoreData = JSON.stringify({
    categories: scoreResult.categories.map(cat => ({
      category: cat.category,
      score: cat.score,
      maxScore: cat.maxScore,
      signals: cat.signals.map(sig => ({
        signal: sig.signal,
        weight: sig.weight,
        description: sig.description
      }))
    })),
    rawScore: scoreResult.rawScore,
    finalScore: scoreResult.finalScore,
    confidence: scoreResult.confidence
  });
  
  await db
    .update(contacts)
    .set({
      unsignedScore: scoreResult.finalScore,
      unsignedScoreUpdatedAt: scoreResult.updatedAt,
      scoreConfidence: scoreResult.confidence,
      trackScoreData: categoryScoreData,
      updatedAt: new Date()
    })
    .where(eq(contacts.id, contactId));
  
  return scoreResult;
}
