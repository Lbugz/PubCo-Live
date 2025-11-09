import { playlistSnapshots, tags, trackTags, trackedPlaylists, activityHistory, type PlaylistSnapshot, type InsertPlaylistSnapshot, type Tag, type InsertTag, type TrackedPlaylist, type InsertTrackedPlaylist, type ActivityHistory, type InsertActivityHistory } from "@shared/schema";
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
  updateTrackMetadata(id: string, metadata: { isrc?: string; label?: string; spotifyUrl?: string; publisher?: string; songwriter?: string; enrichedAt?: Date }): Promise<void>;
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
  addTrackedPlaylist(playlist: InsertTrackedPlaylist): Promise<TrackedPlaylist>;
  updatePlaylistCompleteness(playlistId: string, fetchCount: number, totalTracks: number | null, lastChecked: Date): Promise<void>;
  updatePlaylistMetadata(id: string, metadata: { totalTracks?: number | null; isEditorial?: number; fetchMethod?: string | null }): Promise<void>;
  updateTrackedPlaylistMetadata(id: string, metadata: { curator?: string | null; followers?: number | null; totalTracks?: number | null }): Promise<void>;
  deleteTrackedPlaylist(id: string): Promise<void>;
  updateTrackContact(id: string, contact: { instagram?: string; twitter?: string; tiktok?: string; email?: string; contactNotes?: string }): Promise<void>;
  logActivity(activity: InsertActivityHistory): Promise<void>;
  getTrackActivity(trackId: string): Promise<ActivityHistory[]>;
}

export class DatabaseStorage implements IStorage {
  async getTracksByWeek(week: string): Promise<PlaylistSnapshot[]> {
    if (week === "latest") {
      const latestWeek = await this.getLatestWeek();
      if (!latestWeek) return [];
      return db.select()
        .from(playlistSnapshots)
        .where(eq(playlistSnapshots.week, latestWeek))
        .orderBy(desc(playlistSnapshots.unsignedScore));
    }
    
    return db.select()
      .from(playlistSnapshots)
      .where(eq(playlistSnapshots.week, week))
      .orderBy(desc(playlistSnapshots.unsignedScore));
  }

  async getTracksByPlaylist(playlistId: string, week?: string): Promise<PlaylistSnapshot[]> {
    const conditions = [eq(playlistSnapshots.playlistId, playlistId)];
    
    if (week && week !== "all") {
      conditions.push(eq(playlistSnapshots.week, week));
    }
    
    return db.select()
      .from(playlistSnapshots)
      .where(and(...conditions))
      .orderBy(desc(playlistSnapshots.week), desc(playlistSnapshots.unsignedScore));
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
    
    await db.insert(playlistSnapshots).values(tracks);
  }

  async deleteTracksByWeek(week: string): Promise<void> {
    await db.delete(playlistSnapshots).where(eq(playlistSnapshots.week, week));
  }

  async updateTrackMetadata(id: string, metadata: { isrc?: string; label?: string; spotifyUrl?: string; publisher?: string; songwriter?: string; enrichedAt?: Date }): Promise<void> {
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
      .where(eq(trackTags.tagId, tagId));
    
    return result.map(r => r.track);
  }

  async getTrackedPlaylists(): Promise<TrackedPlaylist[]> {
    const result = await db
      .select({
        id: trackedPlaylists.id,
        name: trackedPlaylists.name,
        playlistId: trackedPlaylists.playlistId,
        spotifyUrl: trackedPlaylists.spotifyUrl,
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

  async updateTrackedPlaylistMetadata(id: string, metadata: { curator?: string | null; followers?: number | null; totalTracks?: number | null }): Promise<void> {
    await db.update(trackedPlaylists)
      .set(metadata)
      .where(eq(trackedPlaylists.id, id));
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
}

export const storage = new DatabaseStorage();
