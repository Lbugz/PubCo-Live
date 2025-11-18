import { playlistSnapshots, tags, trackTags, trackedPlaylists, activityHistory, artists, artistSongwriters, enrichmentJobs, contacts, contactTracks, songwriterProfiles, type PlaylistSnapshot, type InsertPlaylistSnapshot, type Tag, type InsertTag, type TrackedPlaylist, type InsertTrackedPlaylist, type ActivityHistory, type InsertActivityHistory, type Artist, type InsertArtist, type EnrichmentJob, type InsertEnrichmentJob, type Contact, type ContactWithSongwriter } from "@shared/schema";
import { db } from "./db";
import { eq, sql, desc, inArray, and, count } from "drizzle-orm";

export interface IStorage {
  getTracksByWeek(week: string, options?: { limit?: number; offset?: number }): Promise<PlaylistSnapshot[]>;
  getTracksByWeekCount(week: string): Promise<number>;
  getTracksByPlaylist(playlistId: string, week?: string, options?: { limit?: number; offset?: number }): Promise<PlaylistSnapshot[]>;
  getTracksByPlaylistCount(playlistId: string, week?: string): Promise<number>;
  getTrackById(id: string): Promise<PlaylistSnapshot | null>;
  getTracksByIds(ids: string[]): Promise<PlaylistSnapshot[]>;
  getLatestWeek(): Promise<string | null>;
  getAllWeeks(): Promise<string[]>;
  getAllPlaylists(): Promise<string[]>;
  insertTracks(tracks: InsertPlaylistSnapshot[]): Promise<string[]>;
  deleteTracksByWeek(week: string): Promise<void>;
  updateTrackMetadata(id: string, metadata: { isrc?: string | null; label?: string | null; spotifyUrl?: string; publisher?: string | null; publisherStatus?: string | null; mlcSongCode?: string | null; songwriter?: string | null; producer?: string | null; spotifyStreams?: number | null; enrichedAt?: Date | null; enrichmentStatus?: string | null; enrichmentTier?: string | null; creditsStatus?: string | null; lastEnrichmentAttempt?: Date | null }): Promise<void>;
  updateBatchLastEnrichmentAttempt(trackIds: string[]): Promise<void>;
  getUnenrichedTracks(limit?: number): Promise<PlaylistSnapshot[]>;
  getTracksNeedingRetry(beforeDate: Date): Promise<PlaylistSnapshot[]>;
  getAllTags(): Promise<Tag[]>;
  createTag(tag: InsertTag): Promise<Tag>;
  deleteTag(id: string): Promise<void>;
  addTagToTrack(trackId: string, tagId: string): Promise<void>;
  removeTagFromTrack(trackId: string, tagId: string): Promise<void>;
  getTrackTags(trackId: string): Promise<Tag[]>;
  getTracksByTag(tagId: string, options?: { limit?: number; offset?: number }): Promise<PlaylistSnapshot[]>;
  getTracksByTagCount(tagId: string): Promise<number>;
  getTrackedPlaylists(): Promise<TrackedPlaylist[]>;
  getTrackedPlaylistBySpotifyId(playlistId: string): Promise<TrackedPlaylist | null>;
  getPlaylistById(id: string): Promise<TrackedPlaylist | null>;
  addTrackedPlaylist(playlist: InsertTrackedPlaylist): Promise<TrackedPlaylist>;
  updatePlaylistCompleteness(playlistId: string, fetchCount: number, totalTracks: number | null, lastChecked: Date): Promise<void>;
  updatePlaylistMetadata(id: string, metadata: { totalTracks?: number | null; isEditorial?: number; fetchMethod?: string | null; lastChecked?: Date; isComplete?: number; lastFetchCount?: number }): Promise<void>;
  updateTrackedPlaylistMetadata(id: string, metadata: { name?: string; curator?: string | null; followers?: number | null; totalTracks?: number | null; imageUrl?: string | null }): Promise<void>;
  deleteTrackedPlaylist(id: string): Promise<void>;
  updateTrackContact(id: string, contact: { instagram?: string; twitter?: string; tiktok?: string; email?: string; contactNotes?: string }): Promise<void>;
  logActivity(activity: InsertActivityHistory): Promise<void>;
  getTrackActivity(trackId: string): Promise<ActivityHistory[]>;
  getPlaylistActivity(playlistId: string): Promise<ActivityHistory[]>;
  getPlaylistQualityMetrics(playlistId: string): Promise<{ totalTracks: number; enrichedCount: number; isrcCount: number; avgUnsignedScore: number }>;
  createOrUpdateArtist(artist: InsertArtist & { musicbrainzId?: string }): Promise<Artist>;
  linkArtistToTrack(artistId: string, trackId: string): Promise<void>;
  getArtistsByTrackId(trackId: string): Promise<Artist[]>;
  getTracksNeedingArtistEnrichment(limit?: number): Promise<PlaylistSnapshot[]>;
  updateArtistLinks(artistId: string, links: { instagram?: string; twitter?: string; facebook?: string; bandcamp?: string; linkedin?: string; youtube?: string; discogs?: string; website?: string }): Promise<void>;
  getTracksNeedingChartmetricEnrichment(limit?: number): Promise<PlaylistSnapshot[]>;
  updateTrackChartmetric(id: string, data: { chartmetricId?: string; chartmetricStatus?: string; spotifyStreams?: number; streamingVelocity?: string; trackStage?: string; playlistFollowers?: number; youtubeViews?: number; chartmetricEnrichedAt?: Date; songwriterIds?: string[]; composerName?: string; moods?: string[]; activities?: string[] }): Promise<void>;
  updateTrackChartmetricIdByIsrc(updates: Array<{ isrc: string; chartmetricId: string }>): Promise<{ updated: number; skipped: number; errors: string[] }>;
  getStaleChartmetricTracks(daysOld: number, limit?: number): Promise<PlaylistSnapshot[]>;
  getDataCounts(): Promise<{ playlists: number; tracks: number; songwriters: number; tags: number; activities: number }>;
  deleteAllData(): Promise<void>;
  deletePlaylistCascade(playlistId: string, options: { deleteSongwriters?: boolean }): Promise<{ tracksDeleted: number; songwritersDeleted: number }>;
  createEnrichmentJob(job: InsertEnrichmentJob): Promise<EnrichmentJob>;
  getEnrichmentJobById(id: string): Promise<EnrichmentJob | null>;
  getEnrichmentJobsByStatus(statuses: Array<'queued' | 'running' | 'completed' | 'failed'>): Promise<EnrichmentJob[]>;
  updateEnrichmentJob(id: string, updates: Partial<Omit<EnrichmentJob, 'id' | 'createdAt'>>): Promise<void>;
  claimNextEnrichmentJob(): Promise<EnrichmentJob | null>;
  
  // Contact management methods
  getContacts(options?: { stage?: string; search?: string; hotLeads?: boolean; chartmetricLinked?: boolean; positiveWow?: boolean; limit?: number; offset?: number }): Promise<ContactWithSongwriter[]>;
  getContactsCount(options?: { stage?: string; search?: string; hotLeads?: boolean; chartmetricLinked?: boolean; positiveWow?: boolean }): Promise<number>;
  getContactsCountWithHotLead(): Promise<number>;
  getContactStats(): Promise<{ total: number; hotLeads: number; discovery: number; watch: number; search: number; unsignedPct: number }>;
  getContactById(id: string): Promise<ContactWithSongwriter | null>;
  updateContact(id: string, updates: Partial<Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void>;
  getContactTracks(contactId: string): Promise<PlaylistSnapshot[]>;
}

export class DatabaseStorage implements IStorage {
  async getTracksByWeek(week: string, options?: { limit?: number; offset?: number }): Promise<PlaylistSnapshot[]> {
    const { limit, offset } = options || {};
    
    // Deduplicate tracks by ISRC (or spotify_url if ISRC is null)
    if (week === "all") {
      let query = db.select()
        .from(playlistSnapshots)
        .orderBy(desc(playlistSnapshots.addedAt))
        .$dynamic();
      
      if (limit !== undefined) {
        query = query.limit(limit);
      }
      if (offset !== undefined && offset > 0) {
        query = query.offset(offset);
      }
      
      return query;
    }
    
    if (week === "latest") {
      const latestWeek = await this.getLatestWeek();
      if (!latestWeek) return [];
      
      let query = db.select()
        .from(playlistSnapshots)
        .where(eq(playlistSnapshots.week, latestWeek))
        .orderBy(desc(playlistSnapshots.addedAt))
        .$dynamic();
      
      if (limit !== undefined) {
        query = query.limit(limit);
      }
      if (offset !== undefined && offset > 0) {
        query = query.offset(offset);
      }
      
      return query;
    }
    
    let query = db.select()
      .from(playlistSnapshots)
      .where(eq(playlistSnapshots.week, week))
      .orderBy(desc(playlistSnapshots.addedAt))
      .$dynamic();
    
    if (limit !== undefined) {
      query = query.limit(limit);
    }
    if (offset !== undefined && offset > 0) {
      query = query.offset(offset);
    }
    
    return query;
  }

  async getTracksByWeekCount(week: string): Promise<number> {
    // Count unique tracks by ISRC (or spotify_url if ISRC is null)
    if (week === "all") {
      const result = await db.execute(sql`
        SELECT COUNT(DISTINCT COALESCE(isrc, spotify_url)) as count
        FROM playlist_snapshots
      `);
      const raw = result.rows[0]?.count ?? 0;
      return typeof raw === "bigint" ? Number(raw) : Number(raw);
    }
    
    if (week === "latest") {
      const latestWeek = await this.getLatestWeek();
      if (!latestWeek) return 0;
      
      const result = await db.execute(sql`
        SELECT COUNT(DISTINCT COALESCE(isrc, spotify_url)) as count
        FROM playlist_snapshots
        WHERE week = ${latestWeek}
      `);
      const raw = result.rows[0]?.count ?? 0;
      return typeof raw === "bigint" ? Number(raw) : Number(raw);
    }
    
    const result = await db.execute(sql`
      SELECT COUNT(DISTINCT COALESCE(isrc, spotify_url)) as count
      FROM playlist_snapshots
      WHERE week = ${week}
    `);
    const raw = result.rows[0]?.count ?? 0;
    return typeof raw === "bigint" ? Number(raw) : Number(raw);
  }

  async getTracksByPlaylist(playlistId: string, week?: string, options?: { limit?: number; offset?: number }): Promise<PlaylistSnapshot[]> {
    const { limit, offset } = options || {};
    
    // First, get the database UUID from the Spotify playlist ID
    const [playlist] = await db.select({ id: trackedPlaylists.id })
      .from(trackedPlaylists)
      .where(eq(trackedPlaylists.playlistId, playlistId))
      .limit(1);
    
    if (!playlist) {
      // Playlist not found - return empty array
      return [];
    }
    
    // Resolve "latest" to actual week date
    let resolvedWeek = week;
    if (week === "latest") {
      resolvedWeek = await this.getLatestWeek() || undefined;
      if (!resolvedWeek) {
        return []; // No tracks exist yet
      }
    }
    
    // Now query using the database UUID (after Nov 14 FK fix, playlist_snapshots.playlistId stores UUIDs)
    const conditions = [eq(playlistSnapshots.playlistId, playlist.id)];
    
    if (resolvedWeek && resolvedWeek !== "all") {
      conditions.push(eq(playlistSnapshots.week, resolvedWeek));
    }
    
    let query = db.select()
      .from(playlistSnapshots)
      .where(and(...conditions))
      .orderBy(desc(playlistSnapshots.addedAt))
      .$dynamic();
    
    if (limit !== undefined) {
      query = query.limit(limit);
    }
    if (offset !== undefined && offset > 0) {
      query = query.offset(offset);
    }
    
    return query;
  }

  async getTracksByPlaylistCount(playlistId: string, week?: string): Promise<number> {
    // First, get the database UUID from the Spotify playlist ID
    const [playlist] = await db.select({ id: trackedPlaylists.id })
      .from(trackedPlaylists)
      .where(eq(trackedPlaylists.playlistId, playlistId))
      .limit(1);
    
    if (!playlist) {
      // Playlist not found - return 0
      return 0;
    }
    
    // Resolve "latest" to actual week date
    let resolvedWeek = week;
    if (week === "latest") {
      resolvedWeek = await this.getLatestWeek() || undefined;
      if (!resolvedWeek) {
        return 0; // No tracks exist yet
      }
    }
    
    // Now query using the database UUID (after Nov 14 FK fix, playlist_snapshots.playlistId stores UUIDs)
    const conditions = [eq(playlistSnapshots.playlistId, playlist.id)];
    
    if (resolvedWeek && resolvedWeek !== "all") {
      conditions.push(eq(playlistSnapshots.week, resolvedWeek));
    }
    
    const result = await db.select({ count: count() })
      .from(playlistSnapshots)
      .where(and(...conditions));
    
    const raw = result[0]?.count ?? 0;
    return typeof raw === "bigint" ? Number(raw) : Number(raw);
  }

  async getTrackById(id: string): Promise<PlaylistSnapshot | null> {
    const [track] = await db.select()
      .from(playlistSnapshots)
      .where(eq(playlistSnapshots.id, id))
      .limit(1);
    
    return track || null;
  }

  async getTracksByIds(ids: string[]): Promise<PlaylistSnapshot[]> {
    if (ids.length === 0) return [];
    
    return db.select()
      .from(playlistSnapshots)
      .where(inArray(playlistSnapshots.id, ids));
  }

  async getLatestWeek(): Promise<string | null> {
    const result = await db.select({ week: playlistSnapshots.week })
      .from(playlistSnapshots)
      .orderBy(desc(playlistSnapshots.week))
      .limit(1);
    
    if (!result[0]?.week) return null;
    
    const weekDate = result[0].week;
    if (typeof weekDate === 'string') {
      return weekDate.split('T')[0];
    }
    return (weekDate as Date).toISOString().split('T')[0];
  }

  async getAllWeeks(): Promise<string[]> {
    const result = await db.selectDistinct({ week: playlistSnapshots.week })
      .from(playlistSnapshots)
      .orderBy(desc(playlistSnapshots.week));
    
    return result.map(r => {
      if (typeof r.week === 'string') {
        return r.week.split('T')[0];
      }
      return (r.week as Date).toISOString().split('T')[0];
    });
  }

  async getAllPlaylists(): Promise<string[]> {
    const result = await db.selectDistinct({ playlist: playlistSnapshots.playlistName })
      .from(playlistSnapshots)
      .orderBy(playlistSnapshots.playlistName);
    
    return result.map(r => r.playlist);
  }

  async insertTracks(tracks: InsertPlaylistSnapshot[]): Promise<string[]> {
    if (tracks.length === 0) return [];
    
    console.log(`[insertTracks] Attempting to insert ${tracks.length} tracks`);
    console.log(`[insertTracks] Sample track:`, {
      week: tracks[0].week,
      playlistId: tracks[0].playlistId,
      trackName: tracks[0].trackName,
      spotifyUrl: tracks[0].spotifyUrl,
    });
    
    try {
      const inserted = await db.insert(playlistSnapshots)
        .values(tracks)
        .onConflictDoUpdate({
          target: [playlistSnapshots.week, playlistSnapshots.playlistId, playlistSnapshots.spotifyUrl],
          set: {
            trackName: sql`EXCLUDED.track_name`,
            artistName: sql`EXCLUDED.artist_name`,
            albumArt: sql`EXCLUDED.album_art`,
            addedAt: sql`EXCLUDED.added_at`,
            dataSource: sql`EXCLUDED.data_source`,
          },
        })
        .returning({ id: playlistSnapshots.id });
      
      const trackIds = inserted.map(t => t.id);
      console.log(`[insertTracks] ✅ Successfully inserted/updated ${tracks.length} tracks, got ${trackIds.length} IDs`);
      return trackIds;
    } catch (error: any) {
      console.error(`[insertTracks] ❌ ERROR inserting tracks:`, error);
      console.error(`[insertTracks] Error details:`, error.message, error.stack);
      throw error; // Re-throw to ensure caller handles failure
    }
  }

  async deleteTracksByWeek(week: string): Promise<void> {
    await db.delete(playlistSnapshots).where(eq(playlistSnapshots.week, week));
  }

  async updateTrackMetadata(id: string, metadata: { isrc?: string | null; label?: string | null; spotifyUrl?: string; publisher?: string | null; publisherStatus?: string | null; mlcSongCode?: string | null; songwriter?: string | null; producer?: string | null; spotifyStreams?: number | null; enrichedAt?: Date | null; enrichmentStatus?: string | null; enrichmentTier?: string | null; creditsStatus?: string | null; lastEnrichmentAttempt?: Date | null }): Promise<void> {
    await db.update(playlistSnapshots)
      .set(metadata)
      .where(eq(playlistSnapshots.id, id));
  }

  async updateBatchLastEnrichmentAttempt(trackIds: string[]): Promise<void> {
    if (trackIds.length === 0) return;
    await db.update(playlistSnapshots)
      .set({ lastEnrichmentAttempt: new Date() })
      .where(inArray(playlistSnapshots.id, trackIds));
  }

  async getUnenrichedTracks(limit: number = 50): Promise<PlaylistSnapshot[]> {
    return db.select()
      .from(playlistSnapshots)
      .where(
        sql`(${playlistSnapshots.enrichedAt} IS NULL AND ${playlistSnapshots.creditsStatus} IS NULL) OR (${playlistSnapshots.creditsStatus} != 'success' AND (${playlistSnapshots.lastEnrichmentAttempt} IS NULL OR ${playlistSnapshots.lastEnrichmentAttempt} < NOW() - INTERVAL '7 days'))`
      )
      .limit(limit);
  }

  async getTracksNeedingRetry(beforeDate: Date): Promise<PlaylistSnapshot[]> {
    return db.select()
      .from(playlistSnapshots)
      .where(
        and(
          sql`${playlistSnapshots.creditsStatus} IN ('no_data', 'failed')`,
          sql`${playlistSnapshots.lastEnrichmentAttempt} < ${beforeDate.toISOString()}`
        )
      );
  }

  async getUnenrichedTracksByPlaylist(playlistId: string, limit: number = 50): Promise<PlaylistSnapshot[]> {
    return db.select()
      .from(playlistSnapshots)
      .where(
        sql`${playlistSnapshots.playlistId} = ${playlistId} AND (${playlistSnapshots.enrichmentStatus} = 'pending' OR ${playlistSnapshots.enrichmentStatus} IS NULL)`
      )
      .limit(limit);
  }

  async updateEnrichmentStatus(trackIds: string[], status: string): Promise<void> {
    if (trackIds.length === 0) return;
    await db.update(playlistSnapshots)
      .set({ enrichmentStatus: status })
      .where(sql`${playlistSnapshots.id} IN (${sql.join(trackIds.map(id => sql`${id}`), sql`, `)})`);
  }

  async getAllTags(): Promise<Tag[]> {
    return db.select().from(tags).orderBy(tags.name);
  }

  async createTag(insertTag: InsertTag): Promise<Tag> {
    const [tag] = await db.insert(tags).values(insertTag).returning();
    return tag;
  }

  async deleteTag(id: string): Promise<void> {
    await db.delete(tags).where(eq(tags.id, id));
  }

  async addTagToTrack(trackId: string, tagId: string): Promise<void> {
    await db.insert(trackTags).values({ trackId, tagId });
  }

  async removeTagFromTrack(trackId: string, tagId: string): Promise<void> {
    await db.delete(trackTags)
      .where(sql`${trackTags.trackId} = ${trackId} AND ${trackTags.tagId} = ${tagId}`);
  }

  async getTrackTags(trackId: string): Promise<Tag[]> {
    const result = await db
      .select({ tag: tags })
      .from(trackTags)
      .innerJoin(tags, eq(trackTags.tagId, tags.id))
      .where(eq(trackTags.trackId, trackId));
    
    return result.map(r => r.tag);
  }

  async getTracksByTag(tagId: string, options?: { limit?: number; offset?: number }): Promise<PlaylistSnapshot[]> {
    const { limit, offset } = options || {};
    
    let query = db
      .select({ track: playlistSnapshots })
      .from(trackTags)
      .innerJoin(playlistSnapshots, eq(trackTags.trackId, playlistSnapshots.id))
      .where(eq(trackTags.tagId, tagId))
      .orderBy(desc(playlistSnapshots.addedAt))
      .$dynamic();
    
    if (limit !== undefined) {
      query = query.limit(limit);
    }
    if (offset !== undefined && offset > 0) {
      query = query.offset(offset);
    }
    
    const result = await query;
    return result.map(r => r.track);
  }

  async getTracksByTagCount(tagId: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(trackTags)
      .innerJoin(playlistSnapshots, eq(trackTags.trackId, playlistSnapshots.id))
      .where(eq(trackTags.tagId, tagId));
    
    const raw = result[0]?.count ?? 0;
    return typeof raw === "bigint" ? Number(raw) : Number(raw);
  }

  async getTrackedPlaylists(): Promise<TrackedPlaylist[]> {
    const result = await db
      .select({
        id: trackedPlaylists.id,
        name: trackedPlaylists.name,
        playlistId: trackedPlaylists.playlistId,
        spotifyUrl: trackedPlaylists.spotifyUrl,
        imageUrl: trackedPlaylists.imageUrl,
        chartmetricUrl: trackedPlaylists.chartmetricUrl,
        status: trackedPlaylists.status,
        isEditorial: trackedPlaylists.isEditorial,
        totalTracks: trackedPlaylists.totalTracks,
        lastFetchCount: trackedPlaylists.lastFetchCount,
        isComplete: trackedPlaylists.isComplete,
        fetchMethod: trackedPlaylists.fetchMethod,
        lastChecked: trackedPlaylists.lastChecked,
        curator: trackedPlaylists.curator,
        source: trackedPlaylists.source,
        genre: trackedPlaylists.genre,
        region: trackedPlaylists.region,
        followers: trackedPlaylists.followers,
        createdAt: trackedPlaylists.createdAt,
        tracksInDb: sql<number>`CAST(COUNT(DISTINCT ${playlistSnapshots.id}) AS INTEGER)`,
      })
      .from(trackedPlaylists)
      .leftJoin(playlistSnapshots, eq(trackedPlaylists.playlistId, playlistSnapshots.playlistId))
      .groupBy(trackedPlaylists.id)
      .orderBy(trackedPlaylists.name);
    
    return result as any;
  }

  async getTrackedPlaylistBySpotifyId(playlistId: string): Promise<TrackedPlaylist | null> {
    const [playlist] = await db.select()
      .from(trackedPlaylists)
      .where(eq(trackedPlaylists.playlistId, playlistId))
      .limit(1);
    
    return playlist || null;
  }

  async getPlaylistById(id: string): Promise<TrackedPlaylist | null> {
    const [playlist] = await db.select()
      .from(trackedPlaylists)
      .where(eq(trackedPlaylists.id, id))
      .limit(1);
    
    return playlist || null;
  }

  async addTrackedPlaylist(playlist: InsertTrackedPlaylist): Promise<TrackedPlaylist> {
    const [inserted] = await db.insert(trackedPlaylists).values(playlist).returning();
    return inserted;
  }

  async updatePlaylistCompleteness(playlistId: string, fetchCount: number, totalTracks: number | null, lastChecked: Date): Promise<void> {
    const isComplete = totalTracks !== null && fetchCount >= totalTracks ? 1 : 0;
    await db.update(trackedPlaylists)
      .set({ 
        lastFetchCount: fetchCount,
        totalTracks: totalTracks || undefined,
        isComplete,
        lastChecked 
      })
      .where(eq(trackedPlaylists.playlistId, playlistId));
  }

  async updatePlaylistMetadata(id: string, metadata: { totalTracks?: number | null; isEditorial?: number; fetchMethod?: string | null; lastChecked?: Date; isComplete?: number; lastFetchCount?: number }): Promise<void> {
    await db.update(trackedPlaylists)
      .set(metadata)
      .where(eq(trackedPlaylists.id, id));
  }

  async updateTrackedPlaylistMetadata(id: string, metadata: { name?: string; curator?: string | null; followers?: number | null; totalTracks?: number | null; imageUrl?: string | null }): Promise<void> {
    console.log(`[updateTrackedPlaylistMetadata] Updating playlist ${id} with:`, metadata);
    const result = await db.update(trackedPlaylists)
      .set(metadata)
      .where(eq(trackedPlaylists.id, id))
      .returning();
    console.log(`[updateTrackedPlaylistMetadata] Update result:`, result.length > 0 ? 'Success' : 'No rows updated');
    
    // If playlist name was updated, sync it to all playlist_snapshots records
    if (metadata.name && result.length > 0) {
      await this.syncPlaylistSnapshotsName(id, metadata.name);
    }
  }

  async syncPlaylistSnapshotsName(playlistId: string, newName: string): Promise<void> {
    console.log(`[syncPlaylistSnapshotsName] Syncing playlist_name to "${newName}" for all tracks in playlist ${playlistId}`);
    const result = await db.update(playlistSnapshots)
      .set({ playlistName: newName })
      .where(eq(playlistSnapshots.playlistId, playlistId))
      .returning({ id: playlistSnapshots.id });
    console.log(`[syncPlaylistSnapshotsName] Updated ${result.length} track records with new playlist name`);
  }

  async deleteTrackedPlaylist(id: string): Promise<void> {
    // First get the playlist to find its playlistId
    const [playlist] = await db.select()
      .from(trackedPlaylists)
      .where(eq(trackedPlaylists.id, id))
      .limit(1);
    
    if (playlist) {
      // Delete all tracks associated with this playlist
      await db.delete(playlistSnapshots)
        .where(eq(playlistSnapshots.playlistId, playlist.playlistId));
      
      console.log(`Deleted all tracks for playlist: ${playlist.name}`);
    }
    
    // Delete the playlist itself
    await db.delete(trackedPlaylists).where(eq(trackedPlaylists.id, id));
  }

  async updateTrackContact(id: string, contact: { instagram?: string; twitter?: string; tiktok?: string; email?: string; contactNotes?: string }): Promise<void> {
    await db.update(playlistSnapshots)
      .set(contact)
      .where(eq(playlistSnapshots.id, id));
  }

  async logActivity(activity: InsertActivityHistory): Promise<void> {
    await db.insert(activityHistory).values(activity);
  }

  async getTrackActivity(trackId: string): Promise<ActivityHistory[]> {
    return db.select()
      .from(activityHistory)
      .where(eq(activityHistory.trackId, trackId))
      .orderBy(desc(activityHistory.createdAt));
  }

  async getPlaylistActivity(playlistId: string): Promise<ActivityHistory[]> {
    return db.select()
      .from(activityHistory)
      .where(eq(activityHistory.playlistId, playlistId))
      .orderBy(desc(activityHistory.createdAt));
  }

  async getPlaylistQualityMetrics(playlistId: string): Promise<{ totalTracks: number; enrichedCount: number; isrcCount: number; avgUnsignedScore: number }> {
    // playlistId is the database UUID from tracked_playlists
    // We need to query playlist_snapshots where playlist_id matches this UUID
    console.log(`[getPlaylistQualityMetrics] Fetching metrics for playlist UUID: ${playlistId}`);
    
    const [result] = await db.select({
      totalTracks: sql<number>`CAST(COUNT(*) AS INTEGER)`,
      enrichedCount: sql<number>`CAST(SUM(CASE WHEN ${playlistSnapshots.enrichedAt} IS NOT NULL THEN 1 ELSE 0 END) AS INTEGER)`,
      isrcCount: sql<number>`CAST(SUM(CASE WHEN ${playlistSnapshots.isrc} IS NOT NULL THEN 1 ELSE 0 END) AS INTEGER)`,
    })
      .from(playlistSnapshots)
      .where(eq(playlistSnapshots.playlistId, playlistId));

    console.log(`[getPlaylistQualityMetrics] Results:`, {
      totalTracks: result?.totalTracks || 0,
      enrichedCount: result?.enrichedCount || 0,
      isrcCount: result?.isrcCount || 0,
    });

    return {
      totalTracks: result?.totalTracks || 0,
      enrichedCount: result?.enrichedCount || 0,
      isrcCount: result?.isrcCount || 0,
      avgUnsignedScore: 0, // Removed - scores now at contact level, not track level
    };
  }

  async createOrUpdateArtist(artist: InsertArtist & { musicbrainzId?: string }): Promise<Artist> {
    if (artist.musicbrainzId) {
      const [existing] = await db.select()
        .from(artists)
        .where(eq(artists.musicbrainzId, artist.musicbrainzId))
        .limit(1);
      
      if (existing) {
        const [updated] = await db.update(artists)
          .set({ ...artist, updatedAt: new Date() })
          .where(eq(artists.id, existing.id))
          .returning();
        return updated;
      }
    }
    
    const [newArtist] = await db.insert(artists).values(artist).returning();
    return newArtist;
  }

  async linkArtistToTrack(artistId: string, trackId: string): Promise<void> {
    try {
      await db.insert(artistSongwriters).values({ artistId, trackId });
    } catch (error) {
      console.log(`Artist ${artistId} already linked to track ${trackId}`);
    }
  }

  async getArtistsByTrackId(trackId: string): Promise<Artist[]> {
    const result = await db
      .select({ artist: artists })
      .from(artistSongwriters)
      .innerJoin(artists, eq(artistSongwriters.artistId, artists.id))
      .where(eq(artistSongwriters.trackId, trackId));
    
    return result.map(r => r.artist);
  }

  async getTracksNeedingArtistEnrichment(limit: number = 50): Promise<PlaylistSnapshot[]> {
    const tracksWithSongwriters = await db.select()
      .from(playlistSnapshots)
      .where(sql`${playlistSnapshots.songwriter} IS NOT NULL AND ${playlistSnapshots.songwriter} != ''`)
      .limit(limit);
    
    const tracksNeedingEnrichment: PlaylistSnapshot[] = [];
    
    for (const track of tracksWithSongwriters) {
      const linkedArtists = await this.getArtistsByTrackId(track.id);
      if (linkedArtists.length === 0) {
        tracksNeedingEnrichment.push(track);
      }
    }
    
    return tracksNeedingEnrichment.slice(0, limit);
  }

  async updateArtistLinks(artistId: string, links: { instagram?: string; twitter?: string; facebook?: string; bandcamp?: string; linkedin?: string; youtube?: string; discogs?: string; website?: string }): Promise<void> {
    await db.update(artists)
      .set({ ...links, updatedAt: new Date() })
      .where(eq(artists.id, artistId));
  }

  async getTracksNeedingChartmetricEnrichment(limit: number = 50): Promise<PlaylistSnapshot[]> {
    return db.select()
      .from(playlistSnapshots)
      .where(
        sql`${playlistSnapshots.isrc} IS NOT NULL 
        AND ${playlistSnapshots.isrc} != '' 
        AND (${playlistSnapshots.chartmetricStatus} IS NULL 
             OR ${playlistSnapshots.chartmetricStatus} = 'pending')`
      )
      .orderBy(desc(playlistSnapshots.addedAt))
      .limit(limit);
  }

  async updateTrackChartmetric(id: string, data: { chartmetricId?: string; chartmetricStatus?: string; spotifyStreams?: number; streamingVelocity?: string; trackStage?: string; playlistFollowers?: number; youtubeViews?: number; chartmetricEnrichedAt?: Date; songwriterIds?: string[]; composerName?: string; moods?: string[]; activities?: string[] }): Promise<void> {
    await db.update(playlistSnapshots)
      .set(data)
      .where(eq(playlistSnapshots.id, id));
  }

  async updateTrackChartmetricIdByIsrc(updates: Array<{ isrc: string; chartmetricId: string }>): Promise<{ updated: number; skipped: number; errors: string[] }> {
    if (updates.length === 0) {
      return { updated: 0, skipped: 0, errors: [] };
    }
    
    const errors: string[] = [];
    
    try {
      // Use parameterized CTE for safe bulk update (prevents SQL injection)
      // WITH mapping AS (VALUES ('ISRC1', 'CM_ID1'), ('ISRC2', 'CM_ID2'))
      // UPDATE playlist_snapshots SET chartmetric_id = mapping.cm_id_val
      // FROM mapping WHERE isrc = mapping.isrc_val AND chartmetric_id IS NULL
      
      const tableName = playlistSnapshots._.name;
      const valuesList = updates.map(({ isrc, chartmetricId }) => 
        sql`(${isrc}, ${chartmetricId})`
      );
      
      const result = await db.execute(sql`
        WITH mapping (isrc_val, cm_id_val) AS (VALUES ${sql.join(valuesList, sql`, `)})
        UPDATE ${sql.raw(tableName)}
        SET chartmetric_id = mapping.cm_id_val
        FROM mapping
        WHERE ${sql.raw(tableName)}.isrc = mapping.isrc_val
          AND ${sql.raw(tableName)}.chartmetric_id IS NULL
      `);
      
      const updatedCount = result.rowCount || 0;
      const skippedCount = updates.length - updatedCount;
      
      console.log(`📊 Chartmetric ID bulk update: ${updatedCount} tracks updated, ${skippedCount} skipped`);
      return { updated: updatedCount, skipped: skippedCount, errors };
    } catch (error: any) {
      errors.push(`Bulk update failed: ${error.message}`);
      console.error(`❌ Chartmetric ID bulk update failed:`, error.message);
      return { updated: 0, skipped: updates.length, errors };
    }
  }

  async getStaleChartmetricTracks(daysOld: number = 7, limit: number = 50): Promise<PlaylistSnapshot[]> {
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - daysOld);
    
    return db.select()
      .from(playlistSnapshots)
      .where(
        sql`${playlistSnapshots.chartmetricStatus} = 'success' 
        AND ${playlistSnapshots.chartmetricEnrichedAt} < ${staleDate}`
      )
      .orderBy(playlistSnapshots.chartmetricEnrichedAt)
      .limit(limit);
  }

  async getDataCounts(): Promise<{ playlists: number; tracks: number; songwriters: number; tags: number; activities: number }> {
    const [playlistsCount] = await db.select({ count: sql<number>`count(*)::int` })
      .from(trackedPlaylists);
    
    const [tracksCount] = await db.select({ count: sql<number>`count(*)::int` })
      .from(playlistSnapshots);
    
    const [songwritersCount] = await db.select({ count: sql<number>`count(*)::int` })
      .from(artists);
    
    const [tagsCount] = await db.select({ count: sql<number>`count(*)::int` })
      .from(tags);
    
    const [activitiesCount] = await db.select({ count: sql<number>`count(*)::int` })
      .from(activityHistory);
    
    return {
      playlists: playlistsCount.count,
      tracks: tracksCount.count,
      songwriters: songwritersCount.count,
      tags: tagsCount.count,
      activities: activitiesCount.count,
    };
  }

  async deleteAllData(): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(playlistSnapshots);
      await tx.delete(trackedPlaylists);
      await tx.delete(tags);
      await tx.delete(artists);
      
      const songwriterProfilesTable = await import("@shared/schema").then(m => m.songwriterProfiles);
      await tx.delete(songwriterProfilesTable);
      
      console.log("All data deleted successfully");
    });
  }

  async deletePlaylistCascade(playlistId: string, options: { deleteSongwriters?: boolean } = {}): Promise<{ tracksDeleted: number; songwritersDeleted: number }> {
    return await db.transaction(async (tx) => {
      const trackedPlaylist = await this.getTrackedPlaylistBySpotifyId(playlistId);
      
      const tracksToDelete = await tx.select()
        .from(playlistSnapshots)
        .where(eq(playlistSnapshots.playlistId, playlistId));
      
      const tracksDeleted = tracksToDelete.length;
      let songwritersDeleted = 0;
      
      if (options.deleteSongwriters && tracksDeleted > 0) {
        const trackIds = tracksToDelete.map(t => t.id);
        
        const artistLinks = await tx.select({ artistId: artistSongwriters.artistId })
          .from(artistSongwriters)
          .where(inArray(artistSongwriters.trackId, trackIds));
        
        const uniqueArtistIds = new Set(artistLinks.map(link => link.artistId));
        const affectedArtistIds = Array.from(uniqueArtistIds);
        
        await tx.delete(playlistSnapshots)
          .where(eq(playlistSnapshots.playlistId, playlistId));
        
        for (const artistId of affectedArtistIds) {
          const [remainingLinks] = await tx.select({ count: sql<number>`count(*)::int` })
            .from(artistSongwriters)
            .where(eq(artistSongwriters.artistId, artistId));
          
          if (remainingLinks.count === 0) {
            await tx.delete(artists)
              .where(eq(artists.id, artistId));
            songwritersDeleted++;
          }
        }
      } else {
        await tx.delete(playlistSnapshots)
          .where(eq(playlistSnapshots.playlistId, playlistId));
      }
      
      if (trackedPlaylist) {
        await tx.delete(trackedPlaylists)
          .where(eq(trackedPlaylists.id, trackedPlaylist.id));
      }
      
      console.log(`Deleted playlist ${playlistId}: ${tracksDeleted} tracks, ${songwritersDeleted} songwriters`);
      
      return { tracksDeleted, songwritersDeleted };
    });
  }

  async createEnrichmentJob(job: InsertEnrichmentJob): Promise<EnrichmentJob> {
    const [created] = await db.insert(enrichmentJobs)
      .values(job)
      .returning();
    return created;
  }

  async getEnrichmentJobById(id: string): Promise<EnrichmentJob | null> {
    const [job] = await db.select()
      .from(enrichmentJobs)
      .where(eq(enrichmentJobs.id, id))
      .limit(1);
    return job || null;
  }

  async getEnrichmentJobsByStatus(statuses: Array<'queued' | 'running' | 'completed' | 'failed'>): Promise<EnrichmentJob[]> {
    return db.select()
      .from(enrichmentJobs)
      .where(inArray(enrichmentJobs.status, statuses))
      .orderBy(enrichmentJobs.createdAt);
  }

  async updateEnrichmentJob(id: string, updates: Partial<Omit<EnrichmentJob, 'id' | 'createdAt'>>): Promise<void> {
    await db.update(enrichmentJobs)
      .set(updates)
      .where(eq(enrichmentJobs.id, id));
  }

  async claimNextEnrichmentJob(): Promise<EnrichmentJob | null> {
    const result = await db.execute(sql`
      WITH claimed AS (
        SELECT id
        FROM enrichment_jobs
        WHERE status = 'queued'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE enrichment_jobs
      SET status = 'running', updated_at = NOW()
      FROM claimed
      WHERE enrichment_jobs.id = claimed.id
      RETURNING enrichment_jobs.*
    `);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as any;
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      playlistId: row.playlist_id,
      trackIds: row.track_ids || [],
      progress: row.progress,
      totalTracks: row.total_tracks,
      enrichedTracks: row.enriched_tracks,
      errorCount: row.error_count,
      logs: row.logs || [],
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
    };
  }

  // Contact management methods
  async getContacts(options?: { stage?: string; search?: string; hotLeads?: boolean; chartmetricLinked?: boolean; positiveWow?: boolean; hasEmail?: boolean; minScore?: number; maxScore?: number; hasSocialLinks?: boolean; limit?: number; offset?: number }): Promise<ContactWithSongwriter[]> {
    const { stage, search, hotLeads, chartmetricLinked, positiveWow, hasEmail, minScore, maxScore, hasSocialLinks, limit, offset } = options || {};
    
    let query = db.select({
      id: contacts.id,
      songwriterId: contacts.songwriterId,
      songwriterName: songwriterProfiles.name,
      songwriterChartmetricId: songwriterProfiles.chartmetricId,
      stage: contacts.stage,
      stageUpdatedAt: contacts.stageUpdatedAt,
      wowGrowthPct: contacts.wowGrowthPct,
      hotLead: contacts.hotLead,
      assignedUserId: contacts.assignedUserId,
      totalStreams: contacts.totalStreams,
      totalTracks: contacts.totalTracks,
      collaborationCount: contacts.collaborationCount,
      unsignedScore: contacts.unsignedScore,
      mlcSearched: contacts.mlcSearched,
      mlcFound: contacts.mlcFound,
      musicbrainzSearched: contacts.musicbrainzSearched,
      musicbrainzFound: contacts.musicbrainzFound,
      createdAt: contacts.createdAt,
      updatedAt: contacts.updatedAt,
    })
      .from(contacts)
      .innerJoin(songwriterProfiles, eq(contacts.songwriterId, songwriterProfiles.id))
      .$dynamic();
    
    const conditions = [];
    if (stage) {
      conditions.push(eq(contacts.stage, stage as any));
    }
    
    if (search && search.trim().length > 0) {
      const searchPattern = `%${search.trim()}%`;
      conditions.push(
        sql`LOWER(${songwriterProfiles.name}) LIKE LOWER(${searchPattern})`
      );
    }
    
    // Quick filters
    if (hotLeads) {
      conditions.push(sql`${contacts.hotLead} > 0`);
    }
    
    if (chartmetricLinked) {
      conditions.push(sql`${songwriterProfiles.chartmetricId} IS NOT NULL`);
    }
    
    if (positiveWow) {
      conditions.push(sql`${contacts.wowGrowthPct} > 0`);
    }
    
    // Advanced filters
    if (hasEmail !== undefined) {
      if (hasEmail) {
        // Has email - check if any track has email
        conditions.push(sql`EXISTS (
          SELECT 1 FROM ${contactTracks}
          INNER JOIN ${playlistSnapshots} ON ${contactTracks.trackId} = ${playlistSnapshots.id}
          WHERE ${contactTracks.contactId} = ${contacts.id}
          AND ${playlistSnapshots.email} IS NOT NULL
          AND ${playlistSnapshots.email} != ''
        )`);
      } else {
        // No email - all tracks have no email
        conditions.push(sql`NOT EXISTS (
          SELECT 1 FROM ${contactTracks}
          INNER JOIN ${playlistSnapshots} ON ${contactTracks.trackId} = ${playlistSnapshots.id}
          WHERE ${contactTracks.contactId} = ${contacts.id}
          AND ${playlistSnapshots.email} IS NOT NULL
          AND ${playlistSnapshots.email} != ''
        )`);
      }
    }
    
    if (minScore !== undefined || maxScore !== undefined) {
      const min = minScore !== undefined ? minScore : 0;
      const max = maxScore !== undefined ? maxScore : 10;
      // Filter by contact unsigned score range
      conditions.push(sql`${contacts.unsignedScore} >= ${min} AND ${contacts.unsignedScore} <= ${max}`);
    }
    
    if (hasSocialLinks !== undefined) {
      if (hasSocialLinks) {
        // Has social links - check if any artist has social media
        conditions.push(sql`EXISTS (
          SELECT 1 FROM ${contactTracks}
          INNER JOIN ${artistSongwriters} ON ${contactTracks.trackId} = ${artistSongwriters.trackId}
          INNER JOIN ${artists} ON ${artistSongwriters.artistId} = ${artists.id}
          WHERE ${contactTracks.contactId} = ${contacts.id}
          AND (
            ${artists.instagram} IS NOT NULL OR
            ${artists.twitter} IS NOT NULL OR
            ${artists.facebook} IS NOT NULL OR
            ${artists.youtube} IS NOT NULL
          )
        )`);
      } else {
        // No social links
        conditions.push(sql`NOT EXISTS (
          SELECT 1 FROM ${contactTracks}
          INNER JOIN ${artistSongwriters} ON ${contactTracks.trackId} = ${artistSongwriters.trackId}
          INNER JOIN ${artists} ON ${artistSongwriters.artistId} = ${artists.id}
          WHERE ${contactTracks.contactId} = ${contacts.id}
          AND (
            ${artists.instagram} IS NOT NULL OR
            ${artists.twitter} IS NOT NULL OR
            ${artists.facebook} IS NOT NULL OR
            ${artists.youtube} IS NOT NULL
          )
        )`);
      }
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    query = query.orderBy(
      desc(contacts.hotLead),
      desc(contacts.stageUpdatedAt),
      desc(contacts.id)
    );
    
    if (limit !== undefined) {
      query = query.limit(limit);
    }
    if (offset !== undefined && offset > 0) {
      query = query.offset(offset);
    }
    
    return query;
  }

  async getContactsCountWithHotLead(): Promise<number> {
    const result = await db.select({ count: count() })
      .from(contacts)
      .where(sql`${contacts.hotLead} > 0`);
    
    const raw = result[0]?.count ?? 0;
    return typeof raw === "bigint" ? Number(raw) : Number(raw);
  }

  async getContactStats(): Promise<{
    total: number;
    hotLeads: number;
    discovery: number;
    watch: number;
    search: number;
    unsignedPct: number;
  }> {
    // Get counts by stage
    const stageCounts = await db.select({
      stage: contacts.stage,
      count: count(),
    })
      .from(contacts)
      .groupBy(contacts.stage);
    
    // Get hot leads count
    const hotLeadsResult = await db.select({ count: count() })
      .from(contacts)
      .where(sql`${contacts.hotLead} > 0`);
    
    // Get unsigned contacts percentage (contacts with at least one track with missing publisher)
    const unsignedContactsResult = await db.select({
      count: sql<number>`COUNT(DISTINCT ${contacts.id})::int`
    })
      .from(contacts)
      .innerJoin(contactTracks, eq(contacts.id, contactTracks.contactId))
      .innerJoin(playlistSnapshots, eq(contactTracks.trackId, playlistSnapshots.id))
      .where(sql`${playlistSnapshots.publisher} IS NULL OR ${playlistSnapshots.publisher} = ''`);
    
    // Calculate totals
    let total = 0;
    let discovery = 0;
    let watch = 0;
    let search = 0;
    
    for (const row of stageCounts) {
      const countValue = typeof row.count === "bigint" ? Number(row.count) : Number(row.count);
      total += countValue;
      
      if (row.stage === 'discovery') discovery = countValue;
      else if (row.stage === 'watch') watch = countValue;
      else if (row.stage === 'search') search = countValue;
    }
    
    const hotLeads = typeof hotLeadsResult[0]?.count === "bigint" 
      ? Number(hotLeadsResult[0].count) 
      : Number(hotLeadsResult[0]?.count ?? 0);
    
    const unsignedContacts = unsignedContactsResult[0]?.count || 0;
    const unsignedPct = total > 0 ? parseFloat(((unsignedContacts / total) * 100).toFixed(1)) : 0;
    
    return {
      total,
      hotLeads,
      discovery,
      watch,
      search,
      unsignedPct,
    };
  }

  async getContactsCount(options?: { stage?: string; search?: string; hotLeads?: boolean; chartmetricLinked?: boolean; positiveWow?: boolean; hasEmail?: boolean; minScore?: number; maxScore?: number; hasSocialLinks?: boolean }): Promise<number> {
    const { stage, search, hotLeads, chartmetricLinked, positiveWow, hasEmail, minScore, maxScore, hasSocialLinks } = options || {};
    
    const conditions = [];
    if (stage) {
      conditions.push(eq(contacts.stage, stage as any));
    }
    
    if (search && search.trim().length > 0) {
      const searchPattern = `%${search.trim()}%`;
      conditions.push(
        sql`LOWER(${songwriterProfiles.name}) LIKE LOWER(${searchPattern})`
      );
    }
    
    // Quick filters
    if (hotLeads) {
      conditions.push(sql`${contacts.hotLead} > 0`);
    }
    
    if (chartmetricLinked) {
      conditions.push(sql`${songwriterProfiles.chartmetricId} IS NOT NULL`);
    }
    
    if (positiveWow) {
      conditions.push(sql`${contacts.wowGrowthPct} > 0`);
    }
    
    // Advanced filters (same as getContacts)
    if (hasEmail !== undefined) {
      if (hasEmail) {
        conditions.push(sql`EXISTS (
          SELECT 1 FROM ${contactTracks}
          INNER JOIN ${playlistSnapshots} ON ${contactTracks.trackId} = ${playlistSnapshots.id}
          WHERE ${contactTracks.contactId} = ${contacts.id}
          AND ${playlistSnapshots.email} IS NOT NULL
          AND ${playlistSnapshots.email} != ''
        )`);
      } else {
        conditions.push(sql`NOT EXISTS (
          SELECT 1 FROM ${contactTracks}
          INNER JOIN ${playlistSnapshots} ON ${contactTracks.trackId} = ${playlistSnapshots.id}
          WHERE ${contactTracks.contactId} = ${contacts.id}
          AND ${playlistSnapshots.email} IS NOT NULL
          AND ${playlistSnapshots.email} != ''
        )`);
      }
    }
    
    if (minScore !== undefined || maxScore !== undefined) {
      const min = minScore !== undefined ? minScore : 0;
      const max = maxScore !== undefined ? maxScore : 10;
      // Filter by contact unsigned score range
      conditions.push(sql`${contacts.unsignedScore} >= ${min} AND ${contacts.unsignedScore} <= ${max}`);
    }
    
    if (hasSocialLinks !== undefined) {
      if (hasSocialLinks) {
        conditions.push(sql`EXISTS (
          SELECT 1 FROM ${contactTracks}
          INNER JOIN ${artistSongwriters} ON ${contactTracks.trackId} = ${artistSongwriters.trackId}
          INNER JOIN ${artists} ON ${artistSongwriters.artistId} = ${artists.id}
          WHERE ${contactTracks.contactId} = ${contacts.id}
          AND (
            ${artists.instagram} IS NOT NULL OR
            ${artists.twitter} IS NOT NULL OR
            ${artists.facebook} IS NOT NULL OR
            ${artists.youtube} IS NOT NULL
          )
        )`);
      } else {
        conditions.push(sql`NOT EXISTS (
          SELECT 1 FROM ${contactTracks}
          INNER JOIN ${artistSongwriters} ON ${contactTracks.trackId} = ${artistSongwriters.trackId}
          INNER JOIN ${artists} ON ${artistSongwriters.artistId} = ${artists.id}
          WHERE ${contactTracks.contactId} = ${contacts.id}
          AND (
            ${artists.instagram} IS NOT NULL OR
            ${artists.twitter} IS NOT NULL OR
            ${artists.facebook} IS NOT NULL OR
            ${artists.youtube} IS NOT NULL
          )
        )`);
      }
    }
    
    let query = db.select({ count: count() })
      .from(contacts)
      .innerJoin(songwriterProfiles, eq(contacts.songwriterId, songwriterProfiles.id))
      .$dynamic();
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    const result = await query;
    const raw = result[0]?.count ?? 0;
    return typeof raw === "bigint" ? Number(raw) : Number(raw);
  }

  async getContactById(id: string): Promise<ContactWithSongwriter | null> {
    const result = await db.select({
      id: contacts.id,
      songwriterId: contacts.songwriterId,
      songwriterName: songwriterProfiles.name,
      songwriterChartmetricId: songwriterProfiles.chartmetricId,
      stage: contacts.stage,
      stageUpdatedAt: contacts.stageUpdatedAt,
      wowGrowthPct: contacts.wowGrowthPct,
      hotLead: contacts.hotLead,
      assignedUserId: contacts.assignedUserId,
      totalStreams: contacts.totalStreams,
      totalTracks: contacts.totalTracks,
      createdAt: contacts.createdAt,
      updatedAt: contacts.updatedAt,
    })
      .from(contacts)
      .innerJoin(songwriterProfiles, eq(contacts.songwriterId, songwriterProfiles.id))
      .where(eq(contacts.id, id))
      .limit(1);
    
    return result[0] || null;
  }

  async updateContact(id: string, updates: Partial<Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    // Whitelist mutable columns only
    const mutableUpdates: any = {};
    
    if (updates.stage !== undefined) mutableUpdates.stage = updates.stage;
    if (updates.hotLead !== undefined) mutableUpdates.hotLead = updates.hotLead;
    if (updates.wowGrowthPct !== undefined) mutableUpdates.wowGrowthPct = updates.wowGrowthPct;
    if (updates.assignedUserId !== undefined) mutableUpdates.assignedUserId = updates.assignedUserId;
    
    // If stage changed, update stageUpdatedAt
    if (updates.stage !== undefined) {
      mutableUpdates.stageUpdatedAt = new Date();
    }
    
    // Always update updatedAt timestamp
    mutableUpdates.updatedAt = new Date();
    
    await db.update(contacts)
      .set(mutableUpdates)
      .where(eq(contacts.id, id));
  }

  async getContactTracks(contactId: string): Promise<PlaylistSnapshot[]> {
    const result = await db.select({
      track: playlistSnapshots,
    })
      .from(contactTracks)
      .innerJoin(playlistSnapshots, eq(contactTracks.trackId, playlistSnapshots.id))
      .where(eq(contactTracks.contactId, contactId))
      .orderBy(desc(playlistSnapshots.spotifyStreams));
    
    return result.map(r => r.track);
  }
}

export const storage = new DatabaseStorage();
