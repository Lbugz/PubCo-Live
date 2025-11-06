import { playlistSnapshots, type PlaylistSnapshot, type InsertPlaylistSnapshot } from "@shared/schema";
import { db } from "./db";
import { eq, sql, desc } from "drizzle-orm";

export interface IStorage {
  getTracksByWeek(week: string): Promise<PlaylistSnapshot[]>;
  getLatestWeek(): Promise<string | null>;
  getAllWeeks(): Promise<string[]>;
  getAllPlaylists(): Promise<string[]>;
  insertTracks(tracks: InsertPlaylistSnapshot[]): Promise<void>;
  deleteTracksByWeek(week: string): Promise<void>;
  updateTrackMetadata(id: string, metadata: { publisher?: string; songwriter?: string; enrichedAt: Date }): Promise<void>;
  getUnenrichedTracks(limit?: number): Promise<PlaylistSnapshot[]>;
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
}

export const storage = new DatabaseStorage();
