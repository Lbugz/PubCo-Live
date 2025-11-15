import { db } from "./db";
import { playlistSnapshots, trackedPlaylists } from "@shared/schema";
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
    
    // High-impact playlists (avg unsigned score >= 7)
    const highImpactResult = await db.select({
      playlistId: playlistSnapshots.playlistId,
      avgScore: sql<number>`avg(${playlistSnapshots.unsignedScore})::float`
    })
      .from(playlistSnapshots)
      .where(eq(playlistSnapshots.week, latestWeek))
      .groupBy(playlistSnapshots.playlistId);
    
    const highImpactPlaylists = highImpactResult.filter(p => (p.avgScore || 0) >= 7).length;
    
    // High-impact playlists (previous week) for trend
    let changeHighImpact = 0;
    if (previousWeek) {
      const prevHighImpactResult = await db.select({
        playlistId: playlistSnapshots.playlistId,
        avgScore: sql<number>`avg(${playlistSnapshots.unsignedScore})::float`
      })
        .from(playlistSnapshots)
        .where(eq(playlistSnapshots.week, previousWeek))
        .groupBy(playlistSnapshots.playlistId);
      
      const prevHighImpact = prevHighImpactResult.filter(p => (p.avgScore || 0) >= 7).length;
      changeHighImpact = calculatePercentChange(highImpactPlaylists, prevHighImpact);
    }
    
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
    
    const previousWeek = await getPreviousWeek(latestWeek);
    
    // Deal-ready tracks (contactEmail != null AND unsignedScore >= 7)
    const dealReadyResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(playlistSnapshots)
      .where(
        and(
          eq(playlistSnapshots.week, latestWeek),
          sql`${playlistSnapshots.email} IS NOT NULL`,
          gte(playlistSnapshots.unsignedScore, 7)
        )
      );
    const dealReady = dealReadyResult[0]?.count || 0;
    
    // Deal-ready tracks (previous week) for trend
    let changeDealReady = 0;
    if (previousWeek) {
      const prevDealReadyResult = await db.select({ count: sql<number>`count(*)::int` })
        .from(playlistSnapshots)
        .where(
          and(
            eq(playlistSnapshots.week, previousWeek),
            sql`${playlistSnapshots.email} IS NOT NULL`,
            gte(playlistSnapshots.unsignedScore, 7)
          )
        );
      const prevDealReady = prevDealReadyResult[0]?.count || 0;
      changeDealReady = calculatePercentChange(dealReady, prevDealReady);
    }
    
    // Average unsigned score
    const avgScoreResult = await db.select({ 
      avg: sql<number>`avg(${playlistSnapshots.unsignedScore})::float` 
    })
      .from(playlistSnapshots)
      .where(eq(playlistSnapshots.week, latestWeek));
    const avgScore = avgScoreResult[0]?.avg || 0;
    
    // Average unsigned score (previous week) for trend
    let changeAvgScore = 0;
    if (previousWeek) {
      const prevAvgScoreResult = await db.select({ 
        avg: sql<number>`avg(${playlistSnapshots.unsignedScore})::float` 
      })
        .from(playlistSnapshots)
        .where(eq(playlistSnapshots.week, previousWeek));
      const prevAvgScore = prevAvgScoreResult[0]?.avg || 0;
      changeAvgScore = calculatePercentChange(avgScore, prevAvgScore);
    }
    
    // Missing publisher tracks (tracks with no publisher data, only successfully enriched)
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
    
    // Missing publisher tracks (previous week) for trend
    let changeMissingPublisher = 0;
    if (previousWeek) {
      const prevMissingPublisherResult = await db.select({ count: sql<number>`count(*)::int` })
        .from(playlistSnapshots)
        .where(
          and(
            eq(playlistSnapshots.week, previousWeek),
            sql`(${playlistSnapshots.creditsStatus} = 'success' OR ${playlistSnapshots.creditsStatus} IS NULL)`,
            sql`${playlistSnapshots.publisher} IS NULL OR ${playlistSnapshots.publisher} = ''`
          )
        );
      const prevMissingPublisher = prevMissingPublisherResult[0]?.count || 0;
      changeMissingPublisher = calculatePercentChange(missingPublisher, prevMissingPublisher);
    }
    
    return {
      dealReady,
      avgScore: parseFloat(avgScore.toFixed(1)),
      missingPublisher,
      changeDealReady,
      changeAvgScore,
      changeMissingPublisher,
    };
  });
}
