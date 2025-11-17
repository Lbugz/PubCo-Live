import { db } from "./db";
import { playlistSnapshots, trackedPlaylists, contacts } from "@shared/schema";
import { sql, eq, and, gte, desc } from "drizzle-orm";

interface MetricsCache {
  data: any;
  timestamp: number;
}

const cache = new Map<string, MetricsCache>();
const CACHE_TTL = 60000; // 60 seconds

function getCachedOrCompute<T>(key: string, computeFn: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  const now = Date.now();
  
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return Promise.resolve(cached.data as T);
  }
  
  return computeFn().then(data => {
    cache.set(key, { data, timestamp: now });
    return data;
  });
}

export function invalidateMetricsCache() {
  cache.clear();
}

async function getLatestWeek(): Promise<string | null> {
  const result = await db.select({ week: playlistSnapshots.week })
    .from(playlistSnapshots)
    .orderBy(desc(playlistSnapshots.week))
    .limit(1);
  
  return result[0]?.week?.toString() || null;
}

async function getPreviousWeek(currentWeek: string): Promise<string | null> {
  const result = await db.select({ week: playlistSnapshots.week })
    .from(playlistSnapshots)
    .where(sql`${playlistSnapshots.week} < ${currentWeek}`)
    .orderBy(desc(playlistSnapshots.week))
    .limit(1);
  
  return result[0]?.week?.toString() || null;
}

function calculatePercentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export async function getPlaylistMetrics() {
  return getCachedOrCompute('playlist-metrics', async () => {
    const latestWeek = await getLatestWeek();
    
    // Early return with zeroed metrics if no data exists
    if (!latestWeek) {
      return {
        totalPlaylists: 0,
        unsignedSongwriters: 0,
        highImpactPlaylists: 0,
        changeUnsigned: 0,
        changeHighImpact: 0,
      };
    }
    
    const previousWeek = await getPreviousWeek(latestWeek);
    
    // Total playlists tracked
    const totalPlaylistsResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(trackedPlaylists);
    const totalPlaylists = totalPlaylistsResult[0]?.count || 0;
    
    // Unsigned songwriters (distinct songwriters with no publisher, only successfully enriched) (current week)
    const unsignedSongwritersResult = await db.select({ 
      count: sql<number>`count(distinct ${playlistSnapshots.songwriter})::int` 
    })
      .from(playlistSnapshots)
      .where(
        and(
          eq(playlistSnapshots.week, latestWeek),
          sql`(${playlistSnapshots.creditsStatus} = 'success' OR ${playlistSnapshots.creditsStatus} IS NULL)`,
          sql`${playlistSnapshots.publisher} IS NULL OR ${playlistSnapshots.publisher} = ''`
        )
      );
    const unsignedSongwriters = unsignedSongwritersResult[0]?.count || 0;
    
    // Unsigned songwriters (previous week) for trend
    let changeUnsigned = 0;
    if (previousWeek) {
      const prevUnsignedResult = await db.select({ 
        count: sql<number>`count(distinct ${playlistSnapshots.songwriter})::int` 
      })
        .from(playlistSnapshots)
        .where(
          and(
            eq(playlistSnapshots.week, previousWeek),
            sql`(${playlistSnapshots.creditsStatus} = 'success' OR ${playlistSnapshots.creditsStatus} IS NULL)`,
            sql`${playlistSnapshots.publisher} IS NULL OR ${playlistSnapshots.publisher} = ''`
          )
        );
      const prevUnsigned = prevUnsignedResult[0]?.count || 0;
      changeUnsigned = calculatePercentChange(unsignedSongwriters, prevUnsigned);
    }
    
    // High-impact playlists (playlists with tracks missing publisher data)
    const highImpactResult = await db.select({
      playlistId: playlistSnapshots.playlistId,
    })
      .from(playlistSnapshots)
      .where(
        and(
          eq(playlistSnapshots.week, latestWeek),
          sql`(${playlistSnapshots.creditsStatus} = 'success' OR ${playlistSnapshots.creditsStatus} IS NULL)`,
          sql`${playlistSnapshots.publisher} IS NULL OR ${playlistSnapshots.publisher} = ''`
        )
      )
      .groupBy(playlistSnapshots.playlistId);
    
    const highImpactPlaylists = highImpactResult.length;
    
    // No trend tracking for high-impact playlists for now
    let changeHighImpact = 0;
    
    return {
      totalPlaylists,
      unsignedSongwriters,
      highImpactPlaylists,
      changeUnsigned,
      changeHighImpact,
    };
  });
}

export async function getTrackMetrics() {
  return getCachedOrCompute('track-metrics', async () => {
    const latestWeek = await getLatestWeek();
    
    // Early return with zeroed metrics if no data exists
    if (!latestWeek) {
      return {
        dealReady: 0,
        avgScore: 0,
        missingPublisher: 0,
        changeDealReady: 0,
        changeAvgScore: 0,
        changeMissingPublisher: 0,
      };
    }
    
    // NOTE: Track metrics now represent contact-level data since scores moved to contacts
    // "dealReady" = contacts with high scores (>= 7)
    // "avgScore" = average contact score
    // "missingPublisher" = tracks without publisher metadata (still track-level)
    
    // High-scoring contacts (score >= 7) - replaces deal-ready tracks
    const dealReadyResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(contacts)
      .where(gte(contacts.unsignedScore, 7));
    const dealReady = dealReadyResult[0]?.count || 0;
    
    // Average contact score
    const avgScoreResult = await db.select({ 
      avg: sql<number>`avg(${contacts.unsignedScore})::float` 
    })
      .from(contacts)
      .where(sql`${contacts.unsignedScore} IS NOT NULL`);
    const avgScore = avgScoreResult[0]?.avg || 0;
    
    // Missing publisher tracks (still track-level metric)
    const missingPublisherResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(playlistSnapshots)
      .where(
        and(
          eq(playlistSnapshots.week, latestWeek),
          sql`(${playlistSnapshots.creditsStatus} = 'success' OR ${playlistSnapshots.creditsStatus} IS NULL)`,
          sql`${playlistSnapshots.publisher} IS NULL OR ${playlistSnapshots.publisher} = ''`
        )
      );
    const missingPublisher = missingPublisherResult[0]?.count || 0;
    
    return {
      dealReady,
      avgScore: parseFloat(avgScore.toFixed(1)),
      missingPublisher,
      changeDealReady: 0, // No trend tracking for now
      changeAvgScore: 0,
      changeMissingPublisher: 0,
    };
  });
}

export async function getContactMetrics() {
  return getCachedOrCompute('contact-metrics', async () => {
    // Total contacts
    const totalContactsResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(contacts);
    const totalContacts = totalContactsResult[0]?.count || 0;

    // High-Confidence Unsigned
    // Criteria: mlcSearched=1 AND mlcFound=0 (verified unsigned) AND has high contact score (>= 7)
    // Using mlc_found=0 as authoritative unsigned signal from MLC API
    const highConfidenceUnsignedResult = await db.select({ 
      count: sql<number>`count(*)::int` 
    })
      .from(contacts)
      .where(
        and(
          eq(contacts.mlcSearched, 1),
          eq(contacts.mlcFound, 0),
          gte(contacts.unsignedScore, 7)
        )
      );
    const highConfidenceUnsigned = highConfidenceUnsignedResult[0]?.count || 0;

    // Publishing Opportunities (MLC Verified Unsigned)
    // Criteria: mlcSearched=1 AND mlcFound=0 (not found in MLC = unsigned)
    // This is the authoritative unsigned signal from MLC search
    const publishingOpportunitiesResult = await db.select({ 
      count: sql<number>`count(*)::int` 
    })
      .from(contacts)
      .where(
        and(
          eq(contacts.mlcSearched, 1),
          eq(contacts.mlcFound, 0)
        )
      );
    const publishingOpportunities = publishingOpportunitiesResult[0]?.count || 0;

    // Enrichment Backlog (never searched in MLC)
    const enrichmentBacklogResult = await db.select({ 
      count: sql<number>`count(*)::int` 
    })
      .from(contacts)
      .where(eq(contacts.mlcSearched, 0));
    const enrichmentBacklog = enrichmentBacklogResult[0]?.count || 0;

    // Solo Writers (no collaborations)
    const soloWritersResult = await db.select({ 
      count: sql<number>`count(*)::int` 
    })
      .from(contacts)
      .where(eq(contacts.collaborationCount, 0));
    const soloWriters = soloWritersResult[0]?.count || 0;

    // Active Collaborators (3+ co-writers)
    const activeCollaboratorsResult = await db.select({ 
      count: sql<number>`count(*)::int` 
    })
      .from(contacts)
      .where(gte(contacts.collaborationCount, 3));
    const activeCollaborators = activeCollaboratorsResult[0]?.count || 0;

    // Writers with Top Publisher (placeholder - requires songwriter_profiles table)
    const withTopPublisher = 0;

    return {
      totalContacts,
      highConfidenceUnsigned,
      publishingOpportunities,
      enrichmentBacklog,
      soloWriters,
      activeCollaborators,
      withTopPublisher,
    };
  });
}

// Unified Dashboard Metrics - returns all metrics for playlists, tracks, and contacts
export async function getDashboardMetrics() {
  return getCachedOrCompute('dashboard-metrics', async () => {
    const latestWeek = await getLatestWeek();
    
    // Playlist Metrics
    const totalPlaylistsResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(trackedPlaylists);
    const totalPlaylists = totalPlaylistsResult[0]?.count || 0;

    const editorialPlaylistsResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(trackedPlaylists)
      .where(eq(trackedPlaylists.isEditorial, 1));
    const editorialPlaylists = editorialPlaylistsResult[0]?.count || 0;

    const totalFollowersResult = await db.select({ 
      sum: sql<number>`sum(${trackedPlaylists.followers})::bigint` 
    })
      .from(trackedPlaylists);
    const totalPlaylistFollowers = Number(totalFollowersResult[0]?.sum || 0);

    const avgTracksResult = await db.select({ 
      avg: sql<number>`avg(${trackedPlaylists.totalTracks})::float` 
    })
      .from(trackedPlaylists);
    const avgTracksPerPlaylist = avgTracksResult[0]?.avg || 0;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentlyUpdatedResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(trackedPlaylists)
      .where(gte(trackedPlaylists.lastChecked, sevenDaysAgo));
    const recentlyUpdatedPlaylists = recentlyUpdatedResult[0]?.count || 0;

    const highValueResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(trackedPlaylists)
      .where(gte(trackedPlaylists.followers, 50000));
    const highValuePlaylists = highValueResult[0]?.count || 0;

    const largePlaylistsResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(trackedPlaylists)
      .where(gte(trackedPlaylists.totalTracks, 50));
    const largePlaylists = largePlaylistsResult[0]?.count || 0;

    const incompleteResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(trackedPlaylists)
      .where(
        and(
          eq(trackedPlaylists.isComplete, 0)
        )
      );
    const incompletePlaylists = incompleteResult[0]?.count || 0;

    const chartmetricLinkedResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(trackedPlaylists)
      .where(sql`${trackedPlaylists.chartmetricUrl} IS NOT NULL AND ${trackedPlaylists.chartmetricUrl} != ''`);
    const chartmetricLinkedPlaylists = chartmetricLinkedResult[0]?.count || 0;

    const avgFollowersResult = await db.select({ 
      avg: sql<number>`avg(${trackedPlaylists.followers})::float` 
    })
      .from(trackedPlaylists);
    const avgFollowersPerPlaylist = avgFollowersResult[0]?.avg || 0;

    // Track Metrics
    const dealReadyTracksResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(contacts)
      .where(gte(contacts.unsignedScore, 7));
    const dealReadyTracks = dealReadyTracksResult[0]?.count || 0;

    const avgUnsignedScoreResult = await db.select({ 
      avg: sql<number>`avg(${contacts.unsignedScore})::float` 
    })
      .from(contacts)
      .where(sql`${contacts.unsignedScore} IS NOT NULL`);
    const avgUnsignedScore = avgUnsignedScoreResult[0]?.avg || 0;

    const missingPublisherTracksResult = latestWeek ? await db.select({ count: sql<number>`count(*)::int` })
      .from(playlistSnapshots)
      .where(
        and(
          eq(playlistSnapshots.week, latestWeek),
          sql`(${playlistSnapshots.creditsStatus} = 'success' OR ${playlistSnapshots.creditsStatus} IS NULL)`,
          sql`${playlistSnapshots.publisher} IS NULL OR ${playlistSnapshots.publisher} = ''`
        )
      ) : [{ count: 0 }];
    const missingPublisherTracks = missingPublisherTracksResult[0]?.count || 0;

    // Self-written tracks (placeholder - requires calculation logic)
    const selfWrittenTracks = 0;

    // Placeholder for high velocity tracks (requires WoW stream calc)
    const highVelocityTracks = 0;

    const enrichedTracksResult = latestWeek ? await db.select({ count: sql<number>`count(*)::int` })
      .from(playlistSnapshots)
      .where(
        and(
          eq(playlistSnapshots.week, latestWeek),
          sql`${playlistSnapshots.creditsStatus} = 'success'`
        )
      ) : [{ count: 0 }];
    const enrichedTracks = enrichedTracksResult[0]?.count || 0;

    // Fresh Finds tracks (from playlists containing "Fresh Finds")
    const freshFindsTracksResult = latestWeek ? await db.execute<{ count: number }>(sql`
      SELECT COUNT(DISTINCT ps.id)::int as count
      FROM playlist_snapshots ps
      INNER JOIN tracked_playlists tp ON ps.playlist_id = tp.playlist_id
      WHERE ps.week = ${latestWeek}
        AND tp.name ILIKE '%Fresh Finds%'
    `) : { rows: [{ count: 0 }] };
    const freshFindsTracks = freshFindsTracksResult.rows[0]?.count || 0;

    // Indie label tracks
    const indieLabelTracksResult = latestWeek ? await db.select({ count: sql<number>`count(*)::int` })
      .from(playlistSnapshots)
      .where(
        and(
          eq(playlistSnapshots.week, latestWeek),
          sql`${playlistSnapshots.label} ~* '(indie|DIY|independent|DK)'`
        )
      ) : [{ count: 0 }];
    const indieLabelTracks = indieLabelTracksResult[0]?.count || 0;

    const totalStreamsResult = latestWeek ? await db.select({ 
      sum: sql<number>`sum(${playlistSnapshots.spotifyStreams})::bigint` 
    })
      .from(playlistSnapshots)
      .where(eq(playlistSnapshots.week, latestWeek)) : [{ sum: 0 }];
    const totalStreams = Number(totalStreamsResult[0]?.sum || 0);

    const enrichmentPendingTracksResult = latestWeek ? await db.select({ count: sql<number>`count(*)::int` })
      .from(playlistSnapshots)
      .where(
        and(
          eq(playlistSnapshots.week, latestWeek),
          sql`${playlistSnapshots.creditsStatus} IS NULL OR ${playlistSnapshots.creditsStatus} = 'pending'`
        )
      ) : [{ count: 0 }];
    const enrichmentPendingTracks = enrichmentPendingTracksResult[0]?.count || 0;

    // Contact Metrics
    const totalSongwritersResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(contacts);
    const totalSongwriters = totalSongwritersResult[0]?.count || 0;

    const highConfidenceUnsignedResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(contacts)
      .where(
        and(
          eq(contacts.mlcSearched, 1),
          eq(contacts.mlcFound, 0),
          gte(contacts.unsignedScore, 7)
        )
      );
    const highConfidenceUnsigned = highConfidenceUnsignedResult[0]?.count || 0;

    // Active Search contacts (placeholder - requires pipelineStage column)
    const activeSearchContacts = 0;

    const avgContactScoreResult = await db.select({ 
      avg: sql<number>`avg(${contacts.unsignedScore})::float` 
    })
      .from(contacts)
      .where(sql`${contacts.unsignedScore} IS NOT NULL`);
    const avgContactScore = avgContactScoreResult[0]?.avg || 0;

    const mlcVerifiedUnsignedResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(contacts)
      .where(
        and(
          eq(contacts.mlcSearched, 1),
          eq(contacts.mlcFound, 0)
        )
      );
    const mlcVerifiedUnsigned = mlcVerifiedUnsignedResult[0]?.count || 0;

    // Watch List contacts (placeholder - requires pipelineStage column)
    const watchListContacts = 0;

    // Discovery Pool contacts (placeholder - requires pipelineStage column)
    const discoveryPoolContacts = 0;

    // High stream velocity contacts (placeholder - requires join with tracks)
    const highStreamVelocityContacts = 0;

    const soloWritersResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(contacts)
      .where(eq(contacts.collaborationCount, 0));
    const soloWriters = soloWritersResult[0]?.count || 0;

    const enrichmentBacklogContactsResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(contacts)
      .where(eq(contacts.mlcSearched, 0));
    const enrichmentBacklogContacts = enrichmentBacklogContactsResult[0]?.count || 0;

    return {
      playlists: {
        totalPlaylists,
        editorialPlaylists,
        totalPlaylistFollowers,
        avgTracksPerPlaylist: parseFloat(avgTracksPerPlaylist.toFixed(1)),
        recentlyUpdatedPlaylists,
        highValuePlaylists,
        largePlaylists,
        incompletePlaylists,
        chartmetricLinkedPlaylists,
        avgFollowersPerPlaylist: parseFloat(avgFollowersPerPlaylist.toFixed(0)),
      },
      tracks: {
        dealReadyTracks,
        avgUnsignedScore: parseFloat(avgUnsignedScore.toFixed(1)),
        missingPublisherTracks,
        selfWrittenTracks,
        highVelocityTracks,
        enrichedTracks,
        freshFindsTracks,
        indieLabelTracks,
        totalStreams,
        enrichmentPendingTracks,
      },
      contacts: {
        highConfidenceUnsigned,
        totalSongwriters,
        activeSearchContacts,
        avgContactScore: parseFloat(avgContactScore.toFixed(1)),
        mlcVerifiedUnsigned,
        watchListContacts,
        discoveryPoolContacts,
        highStreamVelocityContacts,
        soloWriters,
        enrichmentBacklogContacts,
      },
    };
  });
}
