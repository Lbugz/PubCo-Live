import { db } from "../db";
import { sql, eq, and, desc } from "drizzle-orm";
import { contacts, songwriterProfiles, playlistSnapshots, trackPerformanceSnapshots } from "@shared/schema";
import { getTrackStreamingStats } from "../chartmetric";

interface WeeklyPerformance {
  songwriterId: string;
  week: Date;
  totalStreams: number;
  totalTracks: number;
  followers: number | null;
  wowStreams: number | null;
  wowPct: number | null;
}

export class PerformanceTrackingService {
  /**
   * Capture weekly performance snapshot for all tracks
   * Fetches fresh streaming data from Chartmetric API before creating snapshots
   */
  async captureWeeklySnapshots(): Promise<void> {
    const today = new Date();
    const weekStart = this.getWeekStart(today);

    console.log(`\n📊 Capturing performance snapshots for week: ${weekStart.toISOString()}`);
    console.log(`⚡ Fetching fresh streaming data from Chartmetric API...\n`);

    // Get all tracks with Chartmetric IDs (required for API calls)
    const tracks = await db
      .select({
        trackId: playlistSnapshots.id,
        trackName: playlistSnapshots.trackName,
        artistName: playlistSnapshots.artistName,
        chartmetricId: playlistSnapshots.chartmetricId,
        spotifyStreams: playlistSnapshots.spotifyStreams,
        youtubeViews: playlistSnapshots.youtubeViews,
        songwriter: playlistSnapshots.songwriter,
      })
      .from(playlistSnapshots)
      .where(sql`${playlistSnapshots.chartmetricId} IS NOT NULL`);

    console.log(`Found ${tracks.length} tracks with Chartmetric IDs to snapshot`);

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      
      if (i % 50 === 0) {
        console.log(`\n📈 Progress: ${i}/${tracks.length} tracks processed (Success: ${successCount}, Errors: ${errorCount}, Skipped: ${skippedCount})`);
      }

      try {
        // Fetch fresh streaming stats from Chartmetric API
        const freshStats = await getTrackStreamingStats(track.chartmetricId!);
        
        // Use fresh data if available, otherwise fall back to stored data
        const currentStreams = freshStats?.spotify?.current_streams || track.spotifyStreams || 0;
        const currentYoutubeViews = freshStats?.youtube?.views || track.youtubeViews || 0;
        
        // Update the track record with fresh data
        if (freshStats) {
          await db
            .update(playlistSnapshots)
            .set({
              spotifyStreams: currentStreams,
              youtubeViews: currentYoutubeViews,
              streamingVelocity: freshStats.spotify?.velocity?.toString() || null,
            })
            .where(eq(playlistSnapshots.id, track.trackId));
        }

        // Get contact for this track's songwriter
        const contactQuery = await db
          .select({ id: contacts.id })
          .from(contacts)
          .innerJoin(songwriterProfiles, eq(contacts.songwriterId, songwriterProfiles.id))
          .where(sql`${track.songwriter} LIKE '%' || ${songwriterProfiles.name} || '%'`)
          .limit(1);

        if (!contactQuery.length) {
          skippedCount++;
          continue;
        }

        const contactId = contactQuery[0].id;

        // Get previous week's snapshot for this track
        const previousSnapshot = await db
          .select()
          .from(trackPerformanceSnapshots)
          .where(eq(trackPerformanceSnapshots.trackId, track.trackId))
          .orderBy(desc(trackPerformanceSnapshots.week))
          .limit(1);

        // Calculate Spotify week-over-week
        const prevStreams = previousSnapshot[0]?.spotifyStreams || 0;
        const wowStreams = currentStreams - prevStreams;
        const wowPct = prevStreams > 0 
          ? Math.round((wowStreams / prevStreams) * 100)
          : 0;

        // Calculate YouTube week-over-week
        const prevYoutubeViews = previousSnapshot[0]?.youtubeViews || 0;
        const wowYoutubeViews = currentYoutubeViews - prevYoutubeViews;
        const wowYoutubePct = prevYoutubeViews > 0 
          ? Math.round((wowYoutubeViews / prevYoutubeViews) * 100)
          : 0;

        // Insert new snapshot with both Spotify and YouTube data
        await db.insert(trackPerformanceSnapshots).values({
          contactId,
          trackId: track.trackId,
          week: weekStart.toISOString().split('T')[0], // Convert to date string
          spotifyStreams: currentStreams,
          youtubeViews: currentYoutubeViews,
          followers: null,
          wowStreams,
          wowPct,
          wowYoutubeViews,
          wowYoutubePct,
        });

        successCount++;
      } catch (error: any) {
        errorCount++;
        console.error(`  ❌ Error processing track "${track.trackName}":`, error.message);
      }
    }

    console.log(`\n✅ Weekly snapshots captured successfully!`);
    console.log(`   Total processed: ${tracks.length}`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log(`   Skipped: ${skippedCount}\n`);
    
    // Now aggregate and update contacts
    await this.updateContactAggregates();
  }

  /**
   * Update contact aggregates from track snapshots
   */
  private async updateContactAggregates(): Promise<void> {
    const allContacts = await db.select().from(contacts);

    for (const contact of allContacts) {
      // Get all tracks for this contact
      const tracks = await db
        .select()
        .from(playlistSnapshots)
        .innerJoin(songwriterProfiles, eq(songwriterProfiles.id, contact.songwriterId))
        .where(sql`${playlistSnapshots.songwriter} LIKE '%' || ${songwriterProfiles.name} || '%'`);

      const totalStreams = tracks.reduce((sum, t) => sum + (t.playlist_snapshots.spotifyStreams || 0), 0);
      const totalYoutubeViews = tracks.reduce((sum, t) => sum + (t.playlist_snapshots.youtubeViews || 0), 0);
      const totalTracks = tracks.length;

      // Calculate average WoW growth across all tracks (Spotify + YouTube)
      const recentSnapshots = await db
        .select()
        .from(trackPerformanceSnapshots)
        .where(eq(trackPerformanceSnapshots.contactId, contact.id))
        .orderBy(desc(trackPerformanceSnapshots.week))
        .limit(totalTracks);

      const avgWowPct = recentSnapshots.length > 0
        ? Math.round(recentSnapshots.reduce((sum, s) => sum + (s.wowPct || 0), 0) / recentSnapshots.length)
        : 0;

      const avgWowYoutubePct = recentSnapshots.length > 0
        ? Math.round(recentSnapshots.reduce((sum, s) => sum + (s.wowYoutubePct || 0), 0) / recentSnapshots.length)
        : 0;

      await db
        .update(contacts)
        .set({
          totalStreams,
          totalYoutubeViews,
          totalTracks,
          wowGrowthPct: avgWowPct,
          wowYoutubeGrowthPct: avgWowYoutubePct,
          updatedAt: new Date(),
        })
        .where(eq(contacts.id, contact.id));
    }

    console.log('Contact aggregates updated');
  }

  /**
   * Run automated weekly maintenance: capture snapshots + auto-assign tiers
   */
  async runWeeklyMaintenance(): Promise<void> {
    console.log('Starting weekly maintenance...');
    await this.captureWeeklySnapshots();
    await this.autoAssignFunnelTiers();
    console.log('Weekly maintenance complete');
  }

  /**
   * Auto-assign funnel tiers based on stream velocity thresholds
   * - Discovery Pool (< 100K total streams)
   * - Watch List (100K - 1M streams OR WoW growth > 20%)
   * - Active Search (> 1M streams OR WoW growth > 50%)
   */
  async autoAssignFunnelTiers(): Promise<void> {
    const allContacts = await db
      .select()
      .from(contacts)
      .innerJoin(songwriterProfiles, eq(contacts.songwriterId, songwriterProfiles.id));

    let discoveryCount = 0;
    let watchCount = 0;
    let searchCount = 0;

    for (const row of allContacts) {
      const contact = row.contacts;
      const totalStreams = contact.totalStreams || 0;
      const wowGrowthPct = contact.wowGrowthPct || 0;
      
      let newStage: 'discovery' | 'watch' | 'search' = 'discovery';

      // Active Search: High volume OR explosive growth
      if (totalStreams > 1_000_000 || wowGrowthPct > 50) {
        newStage = 'search';
        searchCount++;
      }
      // Watch List: Medium volume OR strong growth
      else if (totalStreams > 100_000 || wowGrowthPct > 20) {
        newStage = 'watch';
        watchCount++;
      }
      // Discovery Pool: Everything else
      else {
        newStage = 'discovery';
        discoveryCount++;
      }

      // Only update if stage has changed
      if (contact.stage !== newStage) {
        await db
          .update(contacts)
          .set({
            stage: newStage,
            stageUpdatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(contacts.id, contact.id));
      }
    }

    console.log(`Funnel tier assignment complete: Discovery=${discoveryCount}, Watch=${watchCount}, Search=${searchCount}`);
  }

  /**
   * Get the start of the current week (Monday)
   */
  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  /**
   * Get performance history for a contact
   */
  async getContactPerformanceHistory(contactId: string): Promise<any[]> {
    const snapshots = await db
      .select()
      .from(trackPerformanceSnapshots)
      .where(eq(trackPerformanceSnapshots.contactId, contactId))
      .orderBy(desc(trackPerformanceSnapshots.week))
      .limit(12); // Last 12 weeks

    return snapshots.map(s => ({
      week: s.week,
      spotifyStreams: s.spotifyStreams,
      youtubeViews: s.youtubeViews,
      wowStreams: s.wowStreams,
      wowPct: s.wowPct,
      wowYoutubeViews: s.wowYoutubeViews,
      wowYoutubePct: s.wowYoutubePct,
      followers: s.followers,
    }));
  }
}

export const performanceTrackingService = new PerformanceTrackingService();
