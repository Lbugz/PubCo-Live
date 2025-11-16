/**
 * Songwriter Identity Enrichment Service
 * 
 * Implements tiered songwriter identity resolution to populate track_songwriters table.
 * Uses multiple data sources with confidence scoring:
 * 1. MusicBrainz artist IDs (highest confidence)
 * 2. Chartmetric profile exact matches (high confidence) 
 * 3. Normalized text matching (medium-low confidence)
 */

import { db } from "../db";
import { 
  playlistSnapshots, 
  songwriterProfiles, 
  trackSongwriters, 
  songwriterAliases,
  artists,
  artistSongwriters,
  type InsertTrackSongwriter,
  type InsertSongwriterAlias
} from "@shared/schema";
import { eq, sql, and, isNull, or, not } from "drizzle-orm";
import { 
  extractIndividualSongwriters, 
  scoreNameMatch, 
  normalizeSongwriterName 
} from "../utils/songwriterNormalization";

export async function enrichTrackSongwriterIdentities(trackId: string): Promise<{
  matched: number;
  totalCredits: number;
}> {
  const track = await db
    .select()
    .from(playlistSnapshots)
    .where(eq(playlistSnapshots.id, trackId))
    .limit(1);

  if (track.length === 0 || !track[0].songwriter || track[0].songwriter === '-') {
    return { matched: 0, totalCredits: 0 };
  }

  const spotifyCredits = track[0].songwriter;
  const individualSongwriters = extractIndividualSongwriters(spotifyCredits);

  let matchedCount = 0;

  for (const songwriterName of individualSongwriters) {
    const matched = await resolveSongwriterIdentity(trackId, songwriterName, spotifyCredits);
    if (matched) {
      matchedCount++;
    }
  }

  return {
    matched: matchedCount,
    totalCredits: individualSongwriters.length
  };
}

async function resolveSongwriterIdentity(
  trackId: string,
  songwriterName: string,
  fullCredits: string
): Promise<boolean> {
  const matchResult = await findBestSongwriterMatch(trackId, songwriterName);
  
  if (!matchResult) {
    return false;
  }

  try {
    await db.insert(trackSongwriters).values({
      trackId,
      songwriterId: matchResult.songwriterId,
      confidenceSource: matchResult.confidenceSource,
      sourceText: songwriterName
    }).onConflictDoNothing();

    if (matchResult.shouldCreateAlias) {
      await db.insert(songwriterAliases).values({
        songwriterId: matchResult.songwriterId,
        alias: songwriterName,
        normalizedAlias: normalizeSongwriterName(songwriterName),
        source: matchResult.confidenceSource
      }).onConflictDoNothing();
    }

    return true;
  } catch (error) {
    console.error(`[IdentityEnrichment] Error inserting track_songwriter for ${songwriterName}:`, error);
    return false;
  }
}

async function findBestSongwriterMatch(
  trackId: string,
  songwriterName: string
): Promise<{
  songwriterId: string;
  confidenceSource: 'musicbrainz_id' | 'chartmetric_id' | 'exact_name_match' | 'normalized_match';
  shouldCreateAlias: boolean;
} | null> {
  const musicbrainzMatch = await matchViaMusicBrainzArtist(trackId, songwriterName);
  if (musicbrainzMatch) {
    return musicbrainzMatch;
  }

  const exactMatch = await matchViaExactName(songwriterName);
  if (exactMatch) {
    return exactMatch;
  }

  const normalizedMatch = await matchViaNormalizedName(songwriterName);
  if (normalizedMatch) {
    return normalizedMatch;
  }

  const aliasMatch = await matchViaAlias(songwriterName);
  if (aliasMatch) {
    return aliasMatch;
  }

  return null;
}

async function matchViaMusicBrainzArtist(
  trackId: string,
  songwriterName: string
): Promise<{
  songwriterId: string;
  confidenceSource: 'musicbrainz_id';
  shouldCreateAlias: boolean;
} | null> {
  const artistLinks = await db.execute<{
    artist_id: string;
    artist_name: string;
    songwriter_id: string | null;
    songwriter_name: string | null;
  }>(sql`
    SELECT 
      a.id as artist_id,
      a.name as artist_name,
      sp.id as songwriter_id,
      sp.name as songwriter_name
    FROM artist_songwriters asw
    JOIN artists a ON a.id = asw.artist_id
    LEFT JOIN songwriter_profiles sp ON LOWER(sp.name) = LOWER(a.name)
    WHERE asw.track_id = ${trackId}
      AND (
        LOWER(a.name) = LOWER(${songwriterName})
        OR a.name LIKE '%' || ${songwriterName} || '%'
        OR ${songwriterName} LIKE '%' || a.name || '%'
      )
    LIMIT 1
  `);

  if (artistLinks.rows.length > 0 && artistLinks.rows[0].songwriter_id) {
    const row = artistLinks.rows[0];
    return {
      songwriterId: row.songwriter_id,
      confidenceSource: 'musicbrainz_id',
      shouldCreateAlias: row.songwriter_name?.toLowerCase() !== songwriterName.toLowerCase()
    };
  }

  return null;
}

async function matchViaExactName(
  songwriterName: string
): Promise<{
  songwriterId: string;
  confidenceSource: 'exact_name_match';
  shouldCreateAlias: boolean;
} | null> {
  const profiles = await db
    .select()
    .from(songwriterProfiles)
    .where(sql`LOWER(${songwriterProfiles.name}) = LOWER(${songwriterName})`)
    .limit(1);

  if (profiles.length > 0) {
    return {
      songwriterId: profiles[0].id,
      confidenceSource: 'exact_name_match',
      shouldCreateAlias: false
    };
  }

  return null;
}

async function matchViaNormalizedName(
  songwriterName: string
): Promise<{
  songwriterId: string;
  confidenceSource: 'normalized_match';
  shouldCreateAlias: boolean;
} | null> {
  const allProfiles = await db
    .select()
    .from(songwriterProfiles);

  let bestMatch: { profile: any; score: number } | null = null;

  for (const profile of allProfiles) {
    const matchResult = scoreNameMatch(songwriterName, profile.name);
    
    if (matchResult.matchType === 'normalized' && matchResult.score >= 0.9) {
      if (!bestMatch || matchResult.score > bestMatch.score) {
        bestMatch = { profile, score: matchResult.score };
      }
    }
  }

  if (bestMatch && bestMatch.score >= 0.9) {
    return {
      songwriterId: bestMatch.profile.id,
      confidenceSource: 'normalized_match',
      shouldCreateAlias: true
    };
  }

  return null;
}

async function matchViaAlias(
  songwriterName: string
): Promise<{
  songwriterId: string;
  confidenceSource: 'exact_name_match';
  shouldCreateAlias: boolean;
} | null> {
  const aliases = await db
    .select()
    .from(songwriterAliases)
    .where(
      or(
        sql`LOWER(${songwriterAliases.alias}) = LOWER(${songwriterName})`,
        sql`${songwriterAliases.normalizedAlias} = ${normalizeSongwriterName(songwriterName)}`
      )
    )
    .limit(1);

  if (aliases.length > 0) {
    return {
      songwriterId: aliases[0].songwriterId,
      confidenceSource: 'exact_name_match',
      shouldCreateAlias: false
    };
  }

  return null;
}

export async function enrichAllTrackSongwriters(batchSize: number = 100): Promise<{
  totalTracks: number;
  enrichedTracks: number;
  totalMatched: number;
  totalCredits: number;
}> {
  console.log("[IdentityEnrichment] Starting full track-songwriter identity enrichment...");

  const tracksToEnrich = await db.execute<{ id: string }>(sql`
    SELECT ps.id
    FROM playlist_snapshots ps
    LEFT JOIN track_songwriters ts ON ts.track_id = ps.id
    WHERE ps.songwriter IS NOT NULL 
      AND ps.songwriter != '-'
      AND ts.id IS NULL
    LIMIT ${batchSize}
  `);

  let enrichedTracks = 0;
  let totalMatched = 0;
  let totalCredits = 0;

  for (const track of tracksToEnrich.rows) {
    const result = await enrichTrackSongwriterIdentities(track.id);
    if (result.matched > 0) {
      enrichedTracks++;
      totalMatched += result.matched;
    }
    totalCredits += result.totalCredits;
  }

  console.log(`[IdentityEnrichment] ✅ Enriched ${enrichedTracks} tracks, matched ${totalMatched}/${totalCredits} songwriter credits`);

  return {
    totalTracks: tracksToEnrich.rows.length,
    enrichedTracks,
    totalMatched,
    totalCredits
  };
}
