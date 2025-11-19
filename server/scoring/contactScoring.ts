import { db } from "../db";
import { playlistSnapshots, contacts, contactTracks, songwriterProfiles, trackedPlaylists } from "@shared/schema";
import { eq, inArray, sql } from "drizzle-orm";

// Track-level signal weights (Phase 1 - without MLC)
const SIGNAL_WEIGHTS = {
  // Discovery Signals
  FRESH_FINDS: 3,
  
  // Label & Distribution
  DIY_DISTRIBUTION: 2,
  INDEPENDENT_LABEL: 1,
  MAJOR_LABEL: -3,
  
  // Track Metadata
  SINGLE_SONGWRITER: 1,
  MISSING_WRITER_METADATA: 1,
  HIGH_STREAMING_VELOCITY: 1,
  
  // Data Quality (completeness %)
  COMPLETENESS_UNDER_25: 4,
  COMPLETENESS_25_50: 3,
  COMPLETENESS_50_75: 2,
  COMPLETENESS_75_PLUS: 1,
  
  // Portfolio Signals (contact-level)
  UNSIGNED_DISTRIBUTION_PATTERN: 2,
  UNSIGNED_PEER_PATTERN: 2,
  ACCELERATING_COLLABORATOR: 1,
  MUSICBRAINZ_PRESENT: 1,
  
  // Phase 2 - MLC Signals (not yet implemented)
  // NO_MLC_PUBLISHER: 3,
  // NOT_FOUND_IN_MLC: 2,
  // INCOMPLETE_PUBLISHER_SHARES: 1,
  // FULL_PUBLISHER_COVERAGE: -2,
};

// Recency multipliers based on release year
function getRecencyMultiplier(releaseDate: string | null): number {
  if (!releaseDate) return 0.5; // Unknown release = lower weight
  
  const year = parseInt(releaseDate.substring(0, 4));
  const currentYear = new Date().getFullYear();
  const age = currentYear - year;
  
  if (age <= 1) return 1.5;  // Last year
  if (age <= 2) return 1.3;  // 2 years ago
  if (age <= 3) return 1.0;  // 3 years ago
  if (age <= 5) return 0.8;  // 3-5 years
  return 0.5;                // Older tracks
}

// Prominence multiplier based on stream count
function getProminenceMultiplier(streams: number | null): number {
  if (!streams) return 0.7; // No stream data = lower weight
  
  if (streams >= 1000000) return 1.5;  // 1M+ streams
  if (streams >= 500000) return 1.3;   // 500k+ streams
  if (streams >= 100000) return 1.0;   // 100k+ streams
  if (streams >= 10000) return 0.8;    // 10k+ streams
  return 0.6;                          // <10k streams
}

export interface TrackSignal {
  signal: string;
  weight: number;
  description: string;
  multiplier: number;
  finalWeight: number;
}

export interface TrackScore {
  trackId: string;
  trackName: string;
  signals: TrackSignal[];
  rawScore: number;
  weightedScore: number;
}

export interface ContactScoreResult {
  contactId: string;
  songwriterId: string;
  finalScore: number;
  confidence: 'high' | 'medium' | 'low';
  trackScores: TrackScore[];
  portfolioSignals: TrackSignal[];
  topSignals: TrackSignal[];
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

// Calculate track-level signals
export function calculateTrackSignals(track: any): TrackSignal[] {
  const signals: TrackSignal[] = [];
  const completeness = calculateDataCompleteness(track);
  const recencyMult = getRecencyMultiplier(track.releaseDate);
  const prominenceMult = getProminenceMultiplier(track.spotifyStreams);
  const combinedMult = (recencyMult + prominenceMult) / 2;
  
  // Discovery Signals
  if (isFreshFindsTrack(track.playlistName)) {
    signals.push({
      signal: 'FRESH_FINDS',
      weight: SIGNAL_WEIGHTS.FRESH_FINDS,
      description: 'Appears on Fresh Finds playlist',
      multiplier: combinedMult,
      finalWeight: SIGNAL_WEIGHTS.FRESH_FINDS * combinedMult
    });
  }
  
  // Label & Distribution Signals
  if (isDIYDistribution(track.label)) {
    signals.push({
      signal: 'DIY_DISTRIBUTION',
      weight: SIGNAL_WEIGHTS.DIY_DISTRIBUTION,
      description: `DIY distributor: ${track.label}`,
      multiplier: combinedMult,
      finalWeight: SIGNAL_WEIGHTS.DIY_DISTRIBUTION * combinedMult
    });
  } else if (isMajorLabel(track.label)) {
    signals.push({
      signal: 'MAJOR_LABEL',
      weight: SIGNAL_WEIGHTS.MAJOR_LABEL,
      description: `Major label: ${track.label}`,
      multiplier: combinedMult,
      finalWeight: SIGNAL_WEIGHTS.MAJOR_LABEL * combinedMult
    });
  } else if (isIndependentLabel(track.label)) {
    signals.push({
      signal: 'INDEPENDENT_LABEL',
      weight: SIGNAL_WEIGHTS.INDEPENDENT_LABEL,
      description: 'Independent label',
      multiplier: combinedMult,
      finalWeight: SIGNAL_WEIGHTS.INDEPENDENT_LABEL * combinedMult
    });
  }
  
  // Track Metadata Signals
  if (!track.songwriter || track.songwriter === '') {
    signals.push({
      signal: 'MISSING_WRITER_METADATA',
      weight: SIGNAL_WEIGHTS.MISSING_WRITER_METADATA,
      description: 'No songwriter metadata',
      multiplier: combinedMult,
      finalWeight: SIGNAL_WEIGHTS.MISSING_WRITER_METADATA * combinedMult
    });
  }
  
  // Data Quality Signals
  if (completeness < 25) {
    signals.push({
      signal: 'COMPLETENESS_UNDER_25',
      weight: SIGNAL_WEIGHTS.COMPLETENESS_UNDER_25,
      description: `Data ${completeness.toFixed(0)}% complete`,
      multiplier: combinedMult,
      finalWeight: SIGNAL_WEIGHTS.COMPLETENESS_UNDER_25 * combinedMult
    });
  } else if (completeness < 50) {
    signals.push({
      signal: 'COMPLETENESS_25_50',
      weight: SIGNAL_WEIGHTS.COMPLETENESS_25_50,
      description: `Data ${completeness.toFixed(0)}% complete`,
      multiplier: combinedMult,
      finalWeight: SIGNAL_WEIGHTS.COMPLETENESS_25_50 * combinedMult
    });
  } else if (completeness < 75) {
    signals.push({
      signal: 'COMPLETENESS_50_75',
      weight: SIGNAL_WEIGHTS.COMPLETENESS_50_75,
      description: `Data ${completeness.toFixed(0)}% complete`,
      multiplier: combinedMult,
      finalWeight: SIGNAL_WEIGHTS.COMPLETENESS_50_75 * combinedMult
    });
  } else {
    signals.push({
      signal: 'COMPLETENESS_75_PLUS',
      weight: SIGNAL_WEIGHTS.COMPLETENESS_75_PLUS,
      description: `Data ${completeness.toFixed(0)}% complete`,
      multiplier: combinedMult,
      finalWeight: SIGNAL_WEIGHTS.COMPLETENESS_75_PLUS * combinedMult
    });
  }
  
  return signals;
}

// Calculate portfolio-level signals for a contact
export function calculatePortfolioSignals(tracks: any[], contactData: any): TrackSignal[] {
  const signals: TrackSignal[] = [];
  
  // Unsigned Distribution Pattern: >50% DIY/indie tracks
  const diyOrIndieCount = tracks.filter((t: any) => 
    isDIYDistribution(t.label) || isIndependentLabel(t.label) || !t.label
  ).length;
  const diyIndiePercent = (diyOrIndieCount / tracks.length) * 100;
  
  if (diyIndiePercent > 50) {
    signals.push({
      signal: 'UNSIGNED_DISTRIBUTION_PATTERN',
      weight: SIGNAL_WEIGHTS.UNSIGNED_DISTRIBUTION_PATTERN,
      description: `${diyIndiePercent.toFixed(0)}% DIY/indie releases`,
      multiplier: 1.0,
      finalWeight: SIGNAL_WEIGHTS.UNSIGNED_DISTRIBUTION_PATTERN
    });
  }
  
  // Unsigned Peer Pattern: >3 tracks
  if (tracks.length > 3) {
    signals.push({
      signal: 'UNSIGNED_PEER_PATTERN',
      weight: SIGNAL_WEIGHTS.UNSIGNED_PEER_PATTERN,
      description: `${tracks.length} tracks in dataset`,
      multiplier: 1.0,
      finalWeight: SIGNAL_WEIGHTS.UNSIGNED_PEER_PATTERN
    });
  }
  
  // MusicBrainz presence (positive signal for verification)
  if (contactData.musicbrainzFound === 1) {
    signals.push({
      signal: 'MUSICBRAINZ_PRESENT',
      weight: SIGNAL_WEIGHTS.MUSICBRAINZ_PRESENT,
      description: 'Verified via MusicBrainz',
      multiplier: 1.0,
      finalWeight: SIGNAL_WEIGHTS.MUSICBRAINZ_PRESENT
    });
  }
  
  return signals;
}

// Calculate final contact score
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
    // No tracks = score 0
    return {
      contactId,
      songwriterId: contact.songwriterId,
      finalScore: 0,
      confidence: 'low',
      trackScores: [],
      portfolioSignals: [],
      topSignals: [],
      updatedAt: new Date()
    };
  }
  
  const trackIds = trackRelations.map((tr: any) => tr.trackId);
  
  const tracks = await db
    .select()
    .from(playlistSnapshots)
    .where(inArray(playlistSnapshots.id, trackIds));
  
  // Calculate track scores
  const trackScores: TrackScore[] = tracks.map((track: any) => {
    const signals = calculateTrackSignals(track);
    const rawScore = signals.reduce((sum, s) => sum + s.weight, 0);
    const weightedScore = signals.reduce((sum, s) => sum + s.finalWeight, 0);
    
    return {
      trackId: track.id,
      trackName: track.trackName,
      signals,
      rawScore,
      weightedScore
    };
  });
  
  // Calculate portfolio signals
  const portfolioSignals = calculatePortfolioSignals(tracks, contact);
  
  // Combine all signals
  const allSignals: TrackSignal[] = [
    ...trackScores.flatMap(ts => ts.signals),
    ...portfolioSignals
  ];
  
  // Sort by final weight and take top 5 positive + all negative
  const positiveSignals = allSignals.filter(s => s.finalWeight > 0).sort((a, b) => b.finalWeight - a.finalWeight);
  const negativeSignals = allSignals.filter(s => s.finalWeight < 0);
  
  const topSignals = [
    ...positiveSignals.slice(0, 5),
    ...negativeSignals
  ];
  
  // Calculate final score
  const totalScore = topSignals.reduce((sum, s) => sum + s.finalWeight, 0);
  const finalScore = Math.max(0, Math.min(10, Math.round(totalScore)));
  
  // Determine confidence
  let confidence: 'high' | 'medium' | 'low';
  const enrichedPercent = tracks.filter(t => t.enrichedAt).length / tracks.length;
  
  if (enrichedPercent > 0.7 && tracks.length >= 3) {
    confidence = 'high';
  } else if (enrichedPercent > 0.4 || tracks.length >= 2) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  
  return {
    contactId,
    songwriterId: contact.songwriterId,
    finalScore,
    confidence,
    trackScores,
    portfolioSignals,
    topSignals,
    updatedAt: new Date()
  };
}

// Update contact with new score
export async function updateContactScore(contactId: string): Promise<ContactScoreResult> {
  const scoreResult = await calculateContactScore(contactId);
  
  // Store track score data as JSON
  const trackScoreData = JSON.stringify({
    trackScores: scoreResult.trackScores.map(ts => ({
      trackId: ts.trackId,
      trackName: ts.trackName,
      weightedScore: ts.weightedScore,
      signalCount: ts.signals.length
    })),
    portfolioSignals: scoreResult.portfolioSignals.map(ps => ({
      signal: ps.signal,
      description: ps.description,
      weight: ps.finalWeight
    })),
    topSignals: scoreResult.topSignals.map(ts => ({
      signal: ts.signal,
      description: ts.description,
      weight: ts.finalWeight
    }))
  });
  
  await db
    .update(contacts)
    .set({
      unsignedScore: scoreResult.finalScore,
      unsignedScoreUpdatedAt: scoreResult.updatedAt,
      scoreConfidence: scoreResult.confidence,
      trackScoreData: trackScoreData,
      updatedAt: new Date()
    })
    .where(eq(contacts.id, contactId));
  
  return scoreResult;
}
