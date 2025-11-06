import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const playlistSnapshots = pgTable("playlist_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  week: date("week").notNull(),
  playlistName: text("playlist_name").notNull(),
  playlistId: text("playlist_id").notNull(),
  trackName: text("track_name").notNull(),
  artistName: text("artist_name").notNull(),
  spotifyUrl: text("spotify_url").notNull(),
  isrc: text("isrc"),
  label: text("label"),
  unsignedScore: integer("unsigned_score").notNull().default(0),
  addedAt: timestamp("added_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  publisher: text("publisher"),
  songwriter: text("songwriter"),
  enrichedAt: timestamp("enriched_at"),
  instagram: text("instagram"),
  twitter: text("twitter"),
  tiktok: text("tiktok"),
  email: text("email"),
  contactNotes: text("contact_notes"),
});

export const insertPlaylistSnapshotSchema = createInsertSchema(playlistSnapshots).omit({
  id: true,
  createdAt: true,
});

export type InsertPlaylistSnapshot = z.infer<typeof insertPlaylistSnapshotSchema>;
export type PlaylistSnapshot = typeof playlistSnapshots.$inferSelect;

export const tags = pgTable("tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("blue"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const trackTags = pgTable("track_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trackId: varchar("track_id").notNull().references(() => playlistSnapshots.id, { onDelete: "cascade" }),
  tagId: varchar("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueTrackTag: sql`UNIQUE (${table.trackId}, ${table.tagId})`,
}));

export const insertTagSchema = createInsertSchema(tags).omit({
  id: true,
  createdAt: true,
});

export type InsertTag = z.infer<typeof insertTagSchema>;
export type Tag = typeof tags.$inferSelect;
export type TrackTag = typeof trackTags.$inferSelect;

export const trackedPlaylists = pgTable("tracked_playlists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  playlistId: text("playlist_id").notNull().unique(),
  spotifyUrl: text("spotify_url").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTrackedPlaylistSchema = createInsertSchema(trackedPlaylists).omit({
  id: true,
  createdAt: true,
});

export type InsertTrackedPlaylist = z.infer<typeof insertTrackedPlaylistSchema>;
export type TrackedPlaylist = typeof trackedPlaylists.$inferSelect;

export const playlists = [
  {
    name: "Fresh Finds",
    id: "37i9dQZF1DWWjGdmeTyeJ6",
    spotify_url: "https://open.spotify.com/playlist/37i9dQZF1DWWjGdmeTyeJ6",
  },
  {
    name: "Fresh Finds Pop",
    id: "37i9dQZF1DX3u9TSHqpdJC",
    spotify_url: "https://open.spotify.com/playlist/37i9dQZF1DX3u9TSHqpdJC",
  },
  {
    name: "Fresh Finds Dance",
    id: "37i9dQZF1DX6bBjHfdRnza",
    spotify_url: "https://open.spotify.com/playlist/37i9dQZF1DX6bBjHfdRnza",
  },
  {
    name: "Fresh Finds Experimental",
    id: "37i9dQZF1DX8C585qnMYHP",
    spotify_url: "https://open.spotify.com/playlist/37i9dQZF1DX8C585qnMYHP",
  },
  {
    name: "Fresh Finds Hip-Hop",
    id: "37i9dQZF1DWW4igXXl2Qkp",
    spotify_url: "https://open.spotify.com/playlist/37i9dQZF1DWW4igXXl2Qkp",
  },
  {
    name: "Fresh Finds Rock",
    id: "37i9dQZF1DX78toxP7mOaJ",
    spotify_url: "https://open.spotify.com/playlist/37i9dQZF1DX78toxP7mOaJ",
  },
  {
    name: "Fresh Finds Latin",
    id: "37i9dQZF1DXagUeYbNSnOA",
    spotify_url: "https://open.spotify.com/playlist/37i9dQZF1DXagUeYbNSnOA",
  },
  {
    name: "Fresh Finds R&B",
    id: "37i9dQZF1DWUFAJPVM3HTX",
    spotify_url: "https://open.spotify.com/playlist/37i9dQZF1DWUFAJPVM3HTX",
  },
  {
    name: "Fresh Finds Indie",
    id: "37i9dQZF1DWT0upuUFtT7o",
    spotify_url: "https://open.spotify.com/playlist/37i9dQZF1DWT0upuUFtT7o",
  },
  {
    name: "Fresh Finds Jazz",
    id: "37i9dQZF1DXcWL5K0oNHcG",
    spotify_url: "https://open.spotify.com/playlist/37i9dQZF1DXcWL5K0oNHcG",
  },
] as const;
