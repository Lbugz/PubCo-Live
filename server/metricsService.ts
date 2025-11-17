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

    // Writers with Top Publisher (has topPublisher field populated)
    const withTopPublisherResult = await db.execute<{ count: number }>(sql`
      SELECT COUNT(DISTINCT c.id)::int as count
      FROM contacts c
      INNER JOIN songwriter_profiles sp ON sp.id = c.songwriter_id
      WHERE sp.top_publisher IS NOT NULL 
        AND sp.top_publisher != ''
    `);
    const withTopPublisher = withTopPublisherResult.rows[0]?.count || 0;

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
