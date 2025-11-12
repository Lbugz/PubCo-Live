import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, date, uniqueIndex } from "drizzle-orm/pg-core";
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
  albumArt: text("album_art"),
  isrc: text("isrc"),
  label: text("label"),
  unsignedScore: integer("unsigned_score").notNull().default(0),
  addedAt: timestamp("added_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  publisher: text("publisher"),
  publisherStatus: text("publisher_status"),
  collectionShare: text("collection_share"),
  ipiNumber: text("ipi_number"),
  iswc: text("iswc"),
  mlcSongCode: text("mlc_song_code"),
  songwriter: text("songwriter"),
  enrichedAt: timestamp("enriched_at"),
  enrichmentStatus: text("enrichment_status").default("pending"),
  enrichmentTier: text("enrichment_tier"),
  instagram: text("instagram"),
  twitter: text("twitter"),
  tiktok: text("tiktok"),
  email: text("email"),
  contactNotes: text("contact_notes"),
  dataSource: text("data_source").notNull().default("api"),
  chartmetricId: text("chartmetric_id"),
  chartmetricStatus: text("chartmetric_status").default("pending"),
  spotifyStreams: integer("spotify_streams"),
  streamingVelocity: text("streaming_velocity"),
  trackStage: text("track_stage"),
  playlistFollowers: integer("playlist_followers"),
  youtubeViews: integer("youtube_views"),
  chartmetricEnrichedAt: timestamp("chartmetric_enriched_at"),
  songwriterIds: text("songwriter_ids").array(),
  composerName: text("composer_name"),
  moods: text("moods").array(),
  activities: text("activities").array(),
}, (table) => ({
  uniqueTrackIdx: uniqueIndex("unique_track_per_week_idx").on(table.week, table.playlistId, table.spotifyUrl),
}));

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
  imageUrl: text("image_url"),
  chartmetricUrl: text("chartmetric_url"),
  status: text("status"),
  isEditorial: integer("is_editorial").notNull().default(0),
  totalTracks: integer("total_tracks"),
  lastFetchCount: integer("last_fetch_count").default(0),
  isComplete: integer("is_complete").notNull().default(0),
  fetchMethod: text("fetch_method").default("api"),
  lastChecked: timestamp("last_checked"),
  curator: text("curator"),
  source: text("source").default("spotify"),
  genre: text("genre"),
  region: text("region"),
  followers: integer("followers"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTrackedPlaylistSchema = createInsertSchema(trackedPlaylists).omit({
  id: true,
  createdAt: true,
});

export type InsertTrackedPlaylist = z.infer<typeof insertTrackedPlaylistSchema>;
export type TrackedPlaylist = typeof trackedPlaylists.$inferSelect;

export const activityHistory = pgTable("activity_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trackId: varchar("track_id").notNull().references(() => playlistSnapshots.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  eventDescription: text("event_description").notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertActivityHistorySchema = createInsertSchema(activityHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertActivityHistory = z.infer<typeof insertActivityHistorySchema>;
export type ActivityHistory = typeof activityHistory.$inferSelect;

export const artists = pgTable("artists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  musicbrainzId: text("musicbrainz_id").unique(),
  name: text("name").notNull(),
  instagram: text("instagram"),
  twitter: text("twitter"),
  facebook: text("facebook"),
  bandcamp: text("bandcamp"),
  linkedin: text("linkedin"),
  youtube: text("youtube"),
  discogs: text("discogs"),
  website: text("website"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const artistSongwriters = pgTable("artist_songwriters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artistId: varchar("artist_id").notNull().references(() => artists.id, { onDelete: "cascade" }),
  trackId: varchar("track_id").notNull().references(() => playlistSnapshots.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueArtistTrack: sql`UNIQUE (${table.artistId}, ${table.trackId})`,
}));

export const insertArtistSchema = createInsertSchema(artists).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertArtist = z.infer<typeof insertArtistSchema>;
export type Artist = typeof artists.$inferSelect;
export type ArtistSongwriter = typeof artistSongwriters.$inferSelect;

export const songwriterProfiles = pgTable("songwriter_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chartmetricId: text("chartmetric_id").unique().notNull(),
  name: text("name").notNull(),
  totalTracks: integer("total_tracks"),
  playlistFollowers: integer("playlist_followers"),
  youtubeViews: integer("youtube_views"),
  topPublisher: text("top_publisher"),
  topPublisherWorks: integer("top_publisher_works"),
  genres: text("genres").array(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const songwriterCollaborations = pgTable("songwriter_collaborations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  songwriterId: varchar("songwriter_id").notNull().references(() => songwriterProfiles.id, { onDelete: "cascade" }),
  collaboratorChartmetricId: text("collaborator_chartmetric_id").notNull(),
  collaboratorName: text("collaborator_name").notNull(),
  workCount: integer("work_count").notNull().default(0),
  frequency: text("frequency"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueCollaboration: sql`UNIQUE (${table.songwriterId}, ${table.collaboratorChartmetricId})`,
}));

export const insertSongwriterProfileSchema = createInsertSchema(songwriterProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSongwriterCollaborationSchema = createInsertSchema(songwriterCollaborations).omit({
  id: true,
  createdAt: true,
});

export type InsertSongwriterProfile = z.infer<typeof insertSongwriterProfileSchema>;
export type SongwriterProfile = typeof songwriterProfiles.$inferSelect;
export type InsertSongwriterCollaboration = z.infer<typeof insertSongwriterCollaborationSchema>;
export type SongwriterCollaboration = typeof songwriterCollaborations.$inferSelect;

export const spotifyTokens = pgTable("spotify_tokens", {
  id: varchar("id").primaryKey().default("singleton"),
  encryptedAccessToken: text("encrypted_access_token").notNull(),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSpotifyTokenSchema = createInsertSchema(spotifyTokens).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSpotifyToken = z.infer<typeof insertSpotifyTokenSchema>;
export type SpotifyToken = typeof spotifyTokens.$inferSelect;

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
