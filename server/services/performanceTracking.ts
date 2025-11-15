import { db } from "../db";
import { sql, eq, and, desc } from "drizzle-orm";
import { contacts, songwriterProfiles, playlistSnapshots, trackPerformanceSnapshots } from "@shared/schema";

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
   */
  async captureWeeklySnapshots(): Promise<void> {
    const today = new Date();
    const weekStart = this.getWeekStart(today);

    console.log(`Capturing performance snapshots for week: ${weekStart.toISOString()}`);

    // Get all tracks with their current stream counts
    const tracks = await db
      .select({
        trackId: playlistSnapshots.id,
        spotifyStreams: playlistSnapshots.spotifyStreams,
        songwriter: playlistSnapshots.songwriter,
      })
      .from(playlistSnapshots)
      .where(sql`${playlistSnapshots.spotifyStreams} IS NOT NULL`);

    console.log(`Found ${tracks.length} tracks to snapshot`);

    for (const track of tracks) {
      // Get contact for this track's songwriter
      const contactQuery = await db
        .select({ id: contacts.id })
        .from(contacts)
        .innerJoin(songwriterProfiles, eq(contacts.songwriterId, songwriterProfiles.id))
        .where(sql`${track.songwriter} LIKE '%' || ${songwriterProfiles.name} || '%'`)
        .limit(1);

      if (!contactQuery.length) continue;

      const contactId = contactQuery[0].id;

      // Get previous week's snapshot for this track
      const previousSnapshot = await db
        .select()
        .from(trackPerformanceSnapshots)
        .where(eq(trackPerformanceSnapshots.trackId, track.trackId))
        .orderBy(desc(trackPerformanceSnapshots.week))
        .limit(1);

      const prevStreams = previousSnapshot[0]?.spotifyStreams || 0;
      const currentStreams = track.spotifyStreams || 0;
      const wowStreams = currentStreams - prevStreams;
      const wowPct = prevStreams > 0 
        ? Math.round((wowStreams / prevStreams) * 100)
        : 0;

      // Insert new snapshot  
      await db.insert(trackPerformanceSnapshots).values({
        contactId,
        trackId: track.trackId,
        week: weekStart.toISOString().split('T')[0], // Convert to date string
        spotifyStreams: currentStreams,
        followers: null,
        wowStreams,
        wowPct,
      });
    }

    console.log('Weekly snapshots captured successfully');
    
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
      const totalTracks = tracks.length;

      // Calculate average WoW growth across all tracks
      const recentSnapshots = await db
        .select()
        .from(trackPerformanceSnapshots)
        .where(eq(trackPerformanceSnapshots.contactId, contact.id))
        .orderBy(desc(trackPerformanceSnapshots.week))
        .limit(totalTracks);

      const avgWowPct = recentSnapshots.length > 0
        ? Math.round(recentSnapshots.reduce((sum, s) => sum + (s.wowPct || 0), 0) / recentSnapshots.length)
        : 0;

      await db
        .update(contacts)
        .set({
          totalStreams,
          totalTracks,
          wowGrowthPct: avgWowPct,
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
      wowStreams: s.wowStreams,
      wowPct: s.wowPct,
      followers: s.followers,
    }));
  }
}

export const performanceTrackingService = new PerformanceTrackingService();
