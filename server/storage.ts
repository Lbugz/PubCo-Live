import { playlistSnapshots, tags, trackTags, trackedPlaylists, activityHistory, artists, artistSongwriters, type PlaylistSnapshot, type InsertPlaylistSnapshot, type Tag, type InsertTag, type TrackedPlaylist, type InsertTrackedPlaylist, type ActivityHistory, type InsertActivityHistory, type Artist, type InsertArtist } from "@shared/schema";
import { db } from "./db";
import { eq, sql, desc, inArray, and } from "drizzle-orm";

export interface IStorage {
  getTracksByWeek(week: string): Promise<PlaylistSnapshot[]>;
  getTracksByPlaylist(playlistId: string, week?: string): Promise<PlaylistSnapshot[]>;
  getTrackById(id: string): Promise<PlaylistSnapshot | null>;
  getLatestWeek(): Promise<string | null>;
  getAllWeeks(): Promise<string[]>;
  getAllPlaylists(): Promise<string[]>;
  insertTracks(tracks: InsertPlaylistSnapshot[]): Promise<void>;
  deleteTracksByWeek(week: string): Promise<void>;
  updateTrackMetadata(id: string, metadata: { isrc?: string; label?: string; spotifyUrl?: string; publisher?: string; songwriter?: string; producer?: string; spotifyStreams?: number; enrichedAt?: Date }): Promise<void>;
  getUnenrichedTracks(limit?: number): Promise<PlaylistSnapshot[]>;
  getAllTags(): Promise<Tag[]>;
  createTag(tag: InsertTag): Promise<Tag>;
  deleteTag(id: string): Promise<void>;
  addTagToTrack(trackId: string, tagId: string): Promise<void>;
  removeTagFromTrack(trackId: string, tagId: string): Promise<void>;
  getTrackTags(trackId: string): Promise<Tag[]>;
  getTracksByTag(tagId: string): Promise<PlaylistSnapshot[]>;
  getTrackedPlaylists(): Promise<TrackedPlaylist[]>;
  getTrackedPlaylistBySpotifyId(playlistId: string): Promise<TrackedPlaylist | null>;
  getPlaylistById(id: string): Promise<TrackedPlaylist | null>;
  addTrackedPlaylist(playlist: InsertTrackedPlaylist): Promise<TrackedPlaylist>;
  updatePlaylistCompleteness(playlistId: string, fetchCount: number, totalTracks: number | null, lastChecked: Date): Promise<void>;
  updatePlaylistMetadata(id: string, metadata: { totalTracks?: number | null; isEditorial?: number; fetchMethod?: string | null }): Promise<void>;
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
}

export class DatabaseStorage implements IStorage {
  async getTracksByWeek(week: string): Promise<PlaylistSnapshot[]> {
    if (week === "all") {
      return db.select()
        .from(playlistSnapshots)
        .orderBy(desc(playlistSnapshots.addedAt), desc(playlistSnapshots.unsignedScore));
    }
    
    if (week === "latest") {
      const latestWeek = await this.getLatestWeek();
      if (!latestWeek) return [];
      return db.select()
        .from(playlistSnapshots)
        .where(eq(playlistSnapshots.week, latestWeek))
        .orderBy(desc(playlistSnapshots.addedAt), desc(playlistSnapshots.unsignedScore));
    }
    
    return db.select()
      .from(playlistSnapshots)
      .where(eq(playlistSnapshots.week, week))
      .orderBy(desc(playlistSnapshots.addedAt), desc(playlistSnapshots.unsignedScore));
  }

  async getTracksByPlaylist(playlistId: string, week?: string): Promise<PlaylistSnapshot[]> {
    const conditions = [eq(playlistSnapshots.playlistId, playlistId)];
    
    if (week && week !== "all") {
      conditions.push(eq(playlistSnapshots.week, week));
    }
    
    return db.select()
      .from(playlistSnapshots)
      .where(and(...conditions))
      .orderBy(desc(playlistSnapshots.addedAt), desc(playlistSnapshots.unsignedScore));
  }

  async getTrackById(id: string): Promise<PlaylistSnapshot | null> {
    const [track] = await db.select()
      .from(playlistSnapshots)
      .where(eq(playlistSnapshots.id, id))
      .limit(1);
    
    return track || null;
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

  async insertTracks(tracks: InsertPlaylistSnapshot[]): Promise<void> {
    if (tracks.length === 0) return;
    
    console.log(`[insertTracks] Attempting to insert ${tracks.length} tracks`);
    console.log(`[insertTracks] Sample track:`, {
      week: tracks[0].week,
      playlistId: tracks[0].playlistId,
      trackName: tracks[0].trackName,
      spotifyUrl: tracks[0].spotifyUrl,
    });
    
    try {
      await db.insert(playlistSnapshots)
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
        });
      
      console.log(`[insertTracks] ✅ Successfully inserted/updated ${tracks.length} tracks`);
    } catch (error: any) {
      console.error(`[insertTracks] ❌ ERROR inserting tracks:`, error);
      console.error(`[insertTracks] Error details:`, error.message, error.stack);
      throw error; // Re-throw to bubble up
    }
  }

  async deleteTracksByWeek(week: string): Promise<void> {
    await db.delete(playlistSnapshots).where(eq(playlistSnapshots.week, week));
  }

  async updateTrackMetadata(id: string, metadata: { isrc?: string; label?: string; spotifyUrl?: string; publisher?: string; songwriter?: string; producer?: string; spotifyStreams?: number; enrichedAt?: Date; enrichmentStatus?: string; enrichmentTier?: string }): Promise<void> {
    await db.update(playlistSnapshots)
      .set(metadata)
      .where(eq(playlistSnapshots.id, id));
  }

  async getUnenrichedTracks(limit: number = 50): Promise<PlaylistSnapshot[]> {
    return db.select()
      .from(playlistSnapshots)
      .where(sql`${playlistSnapshots.enrichedAt} IS NULL`)
      .limit(limit);
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

  async getTracksByTag(tagId: string): Promise<PlaylistSnapshot[]> {
    const result = await db
      .select({ track: playlistSnapshots })
      .from(trackTags)
      .innerJoin(playlistSnapshots, eq(trackTags.trackId, playlistSnapshots.id))
      .where(eq(trackTags.tagId, tagId))
      .orderBy(desc(playlistSnapshots.addedAt), desc(playlistSnapshots.unsignedScore));
    
    return result.map(r => r.track);
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

  async updatePlaylistMetadata(id: string, metadata: { totalTracks?: number | null; isEditorial?: number; fetchMethod?: string | null }): Promise<void> {
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
    // First get the Spotify playlist ID from trackedPlaylists
    const playlist = await this.getPlaylistById(playlistId);
    if (!playlist) {
      return { totalTracks: 0, enrichedCount: 0, isrcCount: 0, avgUnsignedScore: 0 };
    }

    // Query playlistSnapshots using the Spotify playlist ID
    const [result] = await db.select({
      totalTracks: sql<number>`CAST(COUNT(*) AS INTEGER)`,
      enrichedCount: sql<number>`CAST(SUM(CASE WHEN ${playlistSnapshots.enrichedAt} IS NOT NULL THEN 1 ELSE 0 END) AS INTEGER)`,
      isrcCount: sql<number>`CAST(SUM(CASE WHEN ${playlistSnapshots.isrc} IS NOT NULL THEN 1 ELSE 0 END) AS INTEGER)`,
      avgUnsignedScore: sql<number>`CAST(COALESCE(AVG(${playlistSnapshots.unsignedScore}), 0) AS FLOAT)`,
    })
      .from(playlistSnapshots)
      .where(eq(playlistSnapshots.playlistId, playlist.playlistId));

    return {
      totalTracks: result?.totalTracks || 0,
      enrichedCount: result?.enrichedCount || 0,
      isrcCount: result?.isrcCount || 0,
      avgUnsignedScore: Math.round((result?.avgUnsignedScore || 0) * 10) / 10, // Round to 1 decimal
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
}

export const storage = new DatabaseStorage();
