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

export const playlists = [
  {
    name: "Fresh Finds",
    id: "37i9dQZF1DWWjGdmeTyeJ6",
    spotify_url: "https://open.spotify.com/playlist/37i9dQZF1DWWjGdmeTyeJ6",
  },
  {
    name: "Fresh Finds Pop",
    id: "37i9dQZF1DX3b9kAldT2fR",
    spotify_url: "https://open.spotify.com/playlist/37i9dQZF1DX3b9kAldT2fR",
  },
  {
    name: "Fresh Finds Dance",
    id: "37i9dQZF1DX6bBjHfdRnza",
    spotify_url: "https://open.spotify.com/playlist/37i9dQZF1DX6bBjHfdRnza",
  },
  {
    name: "Fresh Finds Experimental",
    id: "37i9dQZF1DX8FwnYE6PRvL",
    spotify_url: "https://open.spotify.com/playlist/37i9dQZF1DX8FwnYE6PRvL",
  },
  {
    name: "Fresh Finds Hip-Hop",
    id: "37i9dQZF1DWWC7UGk7jUwo",
    spotify_url: "https://open.spotify.com/playlist/37i9dQZF1DWWC7UGk7jUwo",
  },
  {
    name: "Fresh Finds Rock",
    id: "37i9dQZF1DX7qK8ma5wgG1",
    spotify_url: "https://open.spotify.com/playlist/37i9dQZF1DX7qK8ma5wgG1",
  },
  {
    name: "Fresh Finds Latin",
    id: "37i9dQZF1DXaRycgyh6kXP",
    spotify_url: "https://open.spotify.com/playlist/37i9dQZF1DXaRycgyh6kXP",
  },
  {
    name: "Fresh Finds R&B",
    id: "37i9dQZF1DWUZ5bk6qqDSy",
    spotify_url: "https://open.spotify.com/playlist/37i9dQZF1DWUZ5bk6qqDSy",
  },
  {
    name: "Fresh Finds Indie",
    id: "37i9dQZF1DWTEbYB1hM5Vg",
    spotify_url: "https://open.spotify.com/playlist/37i9dQZF1DWTEbYB1hM5Vg",
  },
  {
    name: "Fresh Finds Jazz",
    id: "37i9dQZF1DXcBPJrmTCPlv",
    spotify_url: "https://open.spotify.com/playlist/37i9dQZF1DXcBPJrmTCPlv",
  },
] as const;
