import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, date, uniqueIndex, index, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const playlistSnapshots = pgTable("playlist_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  week: date("week").notNull(),
  playlistName: text("playlist_name").notNull(),
  playlistId: varchar("playlist_id").notNull().references(() => trackedPlaylists.id, { onDelete: "cascade" }),
  trackName: text("track_name").notNull(),
  artistName: text("artist_name").notNull(),
  spotifyUrl: text("spotify_url").notNull(),
  spotifyTrackId: text("spotify_track_id"),
  albumArt: text("album_art"),
  albumImages: text("album_images"),
  isrc: text("isrc"),
  label: text("label"),
  releaseDate: varchar("release_date"),
  popularity: integer("popularity"),
  duration: integer("duration"),
  explicit: integer("explicit"),
  addedAt: timestamp("added_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  publisher: text("publisher"),
  publisherStatus: text("publisher_status"),
  collectionShare: text("collection_share"),
  ipiNumber: text("ipi_number"),
  iswc: text("iswc"),
  administrators: text("administrators"),
  mlcSongCode: text("mlc_song_code"),
  songwriter: text("songwriter"),
  producer: text("producer"),
  enrichedAt: timestamp("enriched_at"),
  enrichmentStatus: text("enrichment_status").default("pending"),
  enrichmentTier: text("enrichment_tier"),
  creditsStatus: text("credits_status").default("pending"),
  lastEnrichmentAttempt: timestamp("last_enrichment_attempt"),
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
  youtubeVideoId: text("youtube_video_id"),
  youtubeChannelId: text("youtube_channel_id"),
  youtubeLikes: integer("youtube_likes"),
  youtubeComments: integer("youtube_comments"),
  youtubePublishedAt: timestamp("youtube_published_at"),
  youtubeDescription: text("youtube_description"),
  youtubeLicensed: integer("youtube_licensed"),
  chartmetricEnrichedAt: timestamp("chartmetric_enriched_at"),
  songwriterIds: text("songwriter_ids").array(),
  composerName: text("composer_name"),
  moods: text("moods").array(),
  activities: text("activities").array(),
  audioFeatures: text("audio_features"),
  artistGenres: text("artist_genres").array(),
  artistFollowers: integer("artist_followers"),
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

// Playlist search types
export const playlistSearchResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.object({
    displayName: z.string(),
    id: z.string(),
  }),
  totalTracks: z.number(),
  images: z.array(z.object({
    url: z.string(),
    width: z.number().nullable(),
    height: z.number().nullable(),
  })),
  description: z.string().optional(),
});

export const playlistSearchResponseSchema = z.object({
  results: z.array(playlistSearchResultSchema),
});

export type PlaylistSearchResult = z.infer<typeof playlistSearchResultSchema>;
export type PlaylistSearchResponse = z.infer<typeof playlistSearchResponseSchema>;

export const entityTypeEnum = pgEnum('entity_type', ['track', 'playlist']);

export const activityHistory = pgTable("activity_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: entityTypeEnum("entity_type").notNull().default('track'),
  trackId: varchar("track_id").references(() => playlistSnapshots.id, { onDelete: "cascade" }),
  playlistId: varchar("playlist_id").references(() => trackedPlaylists.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  eventDescription: text("event_description").notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  // Ensure exactly one of trackId or playlistId is set
  checkOneEntity: sql`CHECK (
    (CASE WHEN ${table.trackId} IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN ${table.playlistId} IS NOT NULL THEN 1 ELSE 0 END) = 1
  )`,
}));

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
  normalizedName: text("normalized_name"),
  totalTracks: integer("total_tracks"),
  playlistFollowers: integer("playlist_followers"),
  youtubeViews: integer("youtube_views"),
  topPublisher: text("top_publisher"),
  topPublisherWorks: integer("top_publisher_works"),
  genres: text("genres").array(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  normalizedNameIdx: index("idx_songwriter_profiles_normalized_name").on(table.normalizedName),
}));

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

export const confidenceSourceEnum = pgEnum('confidence_source', [
  'musicbrainz_id',      // Matched via MusicBrainz artist.id (highest confidence)
  'chartmetric_id',      // Matched via Chartmetric songwriter_profile.id (high confidence)
  'exact_name_match',    // Exact case-insensitive name match (medium confidence)
  'normalized_match',    // Normalized text match with tokenization (low confidence)
  'manual_override'      // Manually curated mapping (highest confidence)
]);

export const trackSongwriters = pgTable("track_songwriters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trackId: varchar("track_id").notNull().references(() => playlistSnapshots.id, { onDelete: "cascade" }),
  songwriterId: varchar("songwriter_id").notNull().references(() => songwriterProfiles.id, { onDelete: "cascade" }),
  confidenceSource: confidenceSourceEnum("confidence_source").notNull(),
  sourceText: text("source_text"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueTrackSongwriter: sql`UNIQUE (${table.trackId}, ${table.songwriterId})`,
}));

export const songwriterAliases = pgTable("songwriter_aliases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  songwriterId: varchar("songwriter_id").notNull().references(() => songwriterProfiles.id, { onDelete: "cascade" }),
  alias: text("alias").notNull(),
  normalizedAlias: text("normalized_alias").notNull(),
  source: confidenceSourceEnum("source").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueAliasPerSongwriter: sql`UNIQUE (${table.songwriterId}, ${table.normalizedAlias})`,
  uniqueAlias: sql`UNIQUE (${table.alias})`,
}));

export const insertTrackSongwriterSchema = createInsertSchema(trackSongwriters).omit({
  id: true,
  createdAt: true,
});

export const insertSongwriterAliasSchema = createInsertSchema(songwriterAliases).omit({
  id: true,
  createdAt: true,
});

export type InsertTrackSongwriter = z.infer<typeof insertTrackSongwriterSchema>;
export type TrackSongwriter = typeof trackSongwriters.$inferSelect;
export type InsertSongwriterAlias = z.infer<typeof insertSongwriterAliasSchema>;
export type SongwriterAlias = typeof songwriterAliases.$inferSelect;

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

export const jobTypeEnum = pgEnum('job_type', ['enrich-playlist', 'enrich-tracks']);
export const jobStatusEnum = pgEnum('job_status', ['queued', 'running', 'completed', 'failed']);

// CRM Enums
export const contactStageEnum = pgEnum('contact_stage', ['discovery', 'watch', 'search']);
export const outreachActivityTypeEnum = pgEnum('outreach_activity_type', ['dm', 'email', 'call', 'meeting', 'social_touch', 'other']);
export const alertTypeEnum = pgEnum('alert_type', ['stream_threshold', 'velocity_spike', 'inactivity', 'manual']);
export const alertStatusEnum = pgEnum('alert_status', ['pending', 'resolved', 'dismissed']);

export const enrichmentJobs = pgTable("enrichment_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: jobTypeEnum("type").notNull(),
  playlistId: varchar("playlist_id").references(() => trackedPlaylists.id, { onDelete: "cascade" }),
  trackIds: text("track_ids").array().notNull(),
  status: jobStatusEnum("status").notNull().default('queued'),
  progress: integer("progress").notNull().default(0),
  totalTracks: integer("total_tracks").notNull().default(0),
  enrichedTracks: integer("enriched_tracks").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  logs: text("logs").array().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertEnrichmentJobSchema = createInsertSchema(enrichmentJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEnrichmentJob = z.infer<typeof insertEnrichmentJobSchema>;
export type EnrichmentJob = typeof enrichmentJobs.$inferSelect;

// CRM System Tables
export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  songwriterId: varchar("songwriter_id").notNull().references(() => songwriterProfiles.id, { onDelete: "cascade" }).unique(),
  stage: contactStageEnum("stage").notNull().default('discovery'),
  stageUpdatedAt: timestamp("stage_updated_at").notNull().defaultNow(),
  wowGrowthPct: integer("wow_growth_pct"),
  hotLead: integer("hot_lead").notNull().default(0),
  assignedUserId: varchar("assigned_user_id"),
  totalStreams: integer("total_streams"),
  totalTracks: integer("total_tracks").notNull().default(0),
  collaborationCount: integer("collaboration_count").notNull().default(0),
  unsignedScore: integer("unsigned_score"),
  mlcSearched: integer("mlc_searched").notNull().default(0),
  mlcFound: integer("mlc_found").notNull().default(0),
  musicbrainzSearched: integer("musicbrainz_searched").notNull().default(0),
  musicbrainzFound: integer("musicbrainz_found").notNull().default(0),
  chartmetricSearched: integer("chartmetric_searched").notNull().default(0),
  chartmetricFound: integer("chartmetric_found").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const contactTracks = pgTable("contact_tracks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  trackId: varchar("track_id").notNull().references(() => playlistSnapshots.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueContactTrack: sql`UNIQUE (${table.contactId}, ${table.trackId})`,
}));

export const contactStageHistory = pgTable("contact_stage_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  previousStage: contactStageEnum("previous_stage"),
  newStage: contactStageEnum("new_stage").notNull(),
  reason: text("reason"),
  changedByUserId: varchar("changed_by_user_id"),
  changedAt: timestamp("changed_at").notNull().defaultNow(),
});

export const outreachActivities = pgTable("outreach_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  performedByUserId: varchar("performed_by_user_id"),
  activityType: outreachActivityTypeEnum("activity_type").notNull(),
  channel: text("channel"),
  subject: text("subject"),
  body: text("body"),
  outcome: text("outcome"),
  metadata: text("metadata"),
  relatedTrackId: varchar("related_track_id").references(() => playlistSnapshots.id, { onDelete: "set null" }),
  performedAt: timestamp("performed_at").notNull().defaultNow(),
});

export const contactNotes = pgTable("contact_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  authorUserId: varchar("author_user_id"),
  content: text("content").notNull(),
  isPinned: integer("is_pinned").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const trackPerformanceSnapshots = pgTable("track_performance_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  trackId: varchar("track_id").notNull().references(() => playlistSnapshots.id, { onDelete: "cascade" }),
  week: date("week").notNull(),
  spotifyStreams: integer("spotify_streams"),
  followers: integer("followers"),
  wowStreams: integer("wow_streams"),
  wowPct: integer("wow_pct"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueSnapshot: sql`UNIQUE (${table.contactId}, ${table.trackId}, ${table.week})`,
}));

export const contactAlerts = pgTable("contact_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  alertType: alertTypeEnum("alert_type").notNull(),
  relatedTrackId: varchar("related_track_id").references(() => playlistSnapshots.id, { onDelete: "set null" }),
  thresholdValue: integer("threshold_value"),
  actualValue: integer("actual_value"),
  message: text("message").notNull(),
  status: alertStatusEnum("status").notNull().default('pending'),
  triggeredAt: timestamp("triggered_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const contactTags = pgTable("contact_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: varchar("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  tagId: varchar("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueContactTag: sql`UNIQUE (${table.contactId}, ${table.tagId})`,
}));

// Insert schemas for CRM tables
export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContactTrackSchema = createInsertSchema(contactTracks).omit({
  id: true,
  createdAt: true,
});

export const insertContactStageHistorySchema = createInsertSchema(contactStageHistory).omit({
  id: true,
  changedAt: true,
});

export const insertOutreachActivitySchema = createInsertSchema(outreachActivities).omit({
  id: true,
  performedAt: true,
});

export const insertContactNoteSchema = createInsertSchema(contactNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTrackPerformanceSnapshotSchema = createInsertSchema(trackPerformanceSnapshots).omit({
  id: true,
  createdAt: true,
});

export const insertContactAlertSchema = createInsertSchema(contactAlerts).omit({
  id: true,
  triggeredAt: true,
});

export const insertContactTagSchema = createInsertSchema(contactTags).omit({
  id: true,
  createdAt: true,
});

// Types for CRM tables
export type Contact = typeof contacts.$inferSelect;
export type ContactWithSongwriter = Contact & {
  songwriterName: string;
  songwriterChartmetricId?: string;
};
export type InsertContact = z.infer<typeof insertContactSchema>;
export type ContactTrack = typeof contactTracks.$inferSelect;
export type InsertContactTrack = z.infer<typeof insertContactTrackSchema>;
export type ContactStageHistory = typeof contactStageHistory.$inferSelect;
export type InsertContactStageHistory = z.infer<typeof insertContactStageHistorySchema>;
export type OutreachActivity = typeof outreachActivities.$inferSelect;
export type InsertOutreachActivity = z.infer<typeof insertOutreachActivitySchema>;
export type ContactNote = typeof contactNotes.$inferSelect;
export type InsertContactNote = z.infer<typeof insertContactNoteSchema>;
export type TrackPerformanceSnapshot = typeof trackPerformanceSnapshots.$inferSelect;
export type InsertTrackPerformanceSnapshot = z.infer<typeof insertTrackPerformanceSnapshotSchema>;
export type ContactAlert = typeof contactAlerts.$inferSelect;
export type InsertContactAlert = z.infer<typeof insertContactAlertSchema>;
export type ContactTag = typeof contactTags.$inferSelect;
export type InsertContactTag = z.infer<typeof insertContactTagSchema>;

// System Notifications
export const notificationTypeEnum = pgEnum('notification_type', [
  'automation_complete',
  'enrichment_complete',
  'enrichment_failed',
  'playlist_error',
  'system_alert'
]);

export const systemNotifications = pgTable("system_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  metadata: text("metadata"),
  playlistId: varchar("playlist_id").references(() => trackedPlaylists.id, { onDelete: "cascade" }),
  read: integer("read").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSystemNotificationSchema = createInsertSchema(systemNotifications).omit({
  id: true,
  createdAt: true,
});

export type SystemNotification = typeof systemNotifications.$inferSelect;
export type InsertSystemNotification = z.infer<typeof insertSystemNotificationSchema>;

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
