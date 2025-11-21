import { db } from "../db";
import { playlistSnapshots, contacts, contactTracks, songwriterProfiles, trackedPlaylists } from "@shared/schema";
import { eq, inArray, sql } from "drizzle-orm";

/**
 * CATEGORY-BASED SCORING SYSTEM
 * 
 * This scoring system uses 6 weighted categories (total max = 10 points):
 * 
 * 1. Publishing Status (4 pts max) - No publisher across all tracks
 * 2. Release Pathway (3 pts max) - DIY > Indie > Major
 * 3. Early Career Signals (2 pts max) - Fresh Finds presence
 * 4. Metadata Quality (1 pt max) - Average completeness (lower = better)
 * 5. Catalog Patterns (0.5 pts max) - >50% DIY/indie releases
 * 6. Profile Verification (0.5 pts max) - MusicBrainz presence
 * 
 * Each category is evaluated independently and contributes its own score.
 * Final score = sum of all category scores, rounded to integer.
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

// Detect DIY distributors
function isDIYDistribution(label: string | null): boolean {
  if (!label) return false;
  const diyKeywords = ['distrokid', 'dk', 'ditto', 'amuse', 'cd baby', 'tunecore'];
  return diyKeywords.some(keyword => label.toLowerCase().includes(keyword));
}

// Detect major labels
function isMajorLabel(label: string | null): boolean {
  if (!label) return false;
  const majorKeywords = ['sony', 'warner', 'universal', 'atlantic', 'rca', 'columbia'];
  return majorKeywords.some(keyword => label.toLowerCase().includes(keyword));
}

// Detect independent label
function isIndependentLabel(label: string | null): boolean {
  if (!label) return false;
  return label.toLowerCase().includes('independent');
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
function calculateReleasePathwayScore(tracks: any[]): CategoryScore {
  const category = 'Release Pathway';
  const maxScore = 3;
  const signals: TrackSignal[] = [];
  
  // Check label distribution across all tracks
  const hasDIY = tracks.some(track => isDIYDistribution(track.label));
  const hasIndependent = tracks.some(track => isIndependentLabel(track.label));
  const hasMajor = tracks.some(track => isMajorLabel(track.label));
  
  // Priority: DIY > Independent > Major
  if (hasDIY) {
    signals.push({
      signal: 'DIY_DISTRIBUTION',
      weight: 3,
      description: 'DIY distributor detected'
    });
    return { category, score: 3, maxScore, signals };
  } else if (hasIndependent) {
    signals.push({
      signal: 'INDEPENDENT_LABEL',
      weight: 2,
      description: 'Independent label detected'
    });
    return { category, score: 2, maxScore, signals };
  } else if (hasMajor) {
    signals.push({
      signal: 'MAJOR_LABEL',
      weight: 0,
      description: 'Major label detected'
    });
    return { category, score: 0, maxScore, signals };
  }
  
  return { category, score: 0, maxScore, signals };
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
function calculateCatalogPatternsScore(tracks: any[]): CategoryScore {
  const category = 'Catalog Patterns';
  const maxScore = 0.5;
  const signals: TrackSignal[] = [];
  
  // Check if >50% of tracks are DIY/indie
  const diyOrIndieCount = tracks.filter(track => 
    isDIYDistribution(track.label) || isIndependentLabel(track.label) || !track.label
  ).length;
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
  
  // Calculate scores for all 6 categories
  const categories: CategoryScore[] = [
    calculatePublishingStatusScore(tracks),
    calculateReleasePathwayScore(tracks),
    calculateEarlyCareerScore(tracks),
    calculateMetadataQualityScore(tracks),
    calculateCatalogPatternsScore(tracks),
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
