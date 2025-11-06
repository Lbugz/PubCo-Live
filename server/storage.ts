import { playlistSnapshots, tags, trackTags, trackedPlaylists, type PlaylistSnapshot, type InsertPlaylistSnapshot, type Tag, type InsertTag, type TrackedPlaylist, type InsertTrackedPlaylist } from "@shared/schema";
import { db } from "./db";
import { eq, sql, desc, inArray } from "drizzle-orm";

export interface IStorage {
  getTracksByWeek(week: string): Promise<PlaylistSnapshot[]>;
  getTrackById(id: string): Promise<PlaylistSnapshot | null>;
  getLatestWeek(): Promise<string | null>;
  getAllWeeks(): Promise<string[]>;
  getAllPlaylists(): Promise<string[]>;
  insertTracks(tracks: InsertPlaylistSnapshot[]): Promise<void>;
  deleteTracksByWeek(week: string): Promise<void>;
  updateTrackMetadata(id: string, metadata: { publisher?: string; songwriter?: string; enrichedAt: Date }): Promise<void>;
  getUnenrichedTracks(limit?: number): Promise<PlaylistSnapshot[]>;
  getAllTags(): Promise<Tag[]>;
  createTag(tag: InsertTag): Promise<Tag>;
  deleteTag(id: string): Promise<void>;
  addTagToTrack(trackId: string, tagId: string): Promise<void>;
  removeTagFromTrack(trackId: string, tagId: string): Promise<void>;
  getTrackTags(trackId: string): Promise<Tag[]>;
  getTracksByTag(tagId: string): Promise<PlaylistSnapshot[]>;
  getTrackedPlaylists(): Promise<TrackedPlaylist[]>;
  addTrackedPlaylist(playlist: InsertTrackedPlaylist): Promise<TrackedPlaylist>;
  deleteTrackedPlaylist(id: string): Promise<void>;
  updateTrackContact(id: string, contact: { instagram?: string; twitter?: string; tiktok?: string; email?: string; contactNotes?: string }): Promise<void>;
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

  async updateTrackMetadata(id: string, metadata: { publisher?: string; songwriter?: string; enrichedAt: Date }): Promise<void> {
    await db.update(playlistSnapshots)
      .set(metadata)
      .where(eq(playlistSnapshots.id, id));
  }

  async getUnenrichedTracks(limit: number = 50): Promise<PlaylistSnapshot[]> {
    return db.select()
      .from(playlistSnapshots)
      .where(sql`${playlistSnapshots.enrichedAt} IS NULL AND ${playlistSnapshots.isrc} IS NOT NULL`)
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
    return db.select().from(trackedPlaylists).orderBy(trackedPlaylists.name);
  }

  async addTrackedPlaylist(playlist: InsertTrackedPlaylist): Promise<TrackedPlaylist> {
    const [inserted] = await db.insert(trackedPlaylists).values(playlist).returning();
    return inserted;
  }

  async deleteTrackedPlaylist(id: string): Promise<void> {
    await db.delete(trackedPlaylists).where(eq(trackedPlaylists.id, id));
  }

  async updateTrackContact(id: string, contact: { instagram?: string; twitter?: string; tiktok?: string; email?: string; contactNotes?: string }): Promise<void> {
    await db.update(playlistSnapshots)
      .set(contact)
      .where(eq(playlistSnapshots.id, id));
  }
}

export const storage = new DatabaseStorage();
