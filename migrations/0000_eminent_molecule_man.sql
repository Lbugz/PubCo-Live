CREATE TYPE "public"."alert_status" AS ENUM('pending', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."alert_type" AS ENUM('stream_threshold', 'velocity_spike', 'inactivity', 'manual');--> statement-breakpoint
CREATE TYPE "public"."confidence_source" AS ENUM('musicbrainz_id', 'chartmetric_id', 'exact_name_match', 'normalized_match', 'manual_override');--> statement-breakpoint
CREATE TYPE "public"."contact_stage" AS ENUM('discovery', 'watch', 'search');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('track', 'playlist');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('enrich-playlist', 'enrich-tracks');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('automation_complete', 'enrichment_complete', 'enrichment_failed', 'playlist_error', 'system_alert');--> statement-breakpoint
CREATE TYPE "public"."outreach_activity_type" AS ENUM('dm', 'email', 'call', 'meeting', 'social_touch', 'other');--> statement-breakpoint
CREATE TABLE "activity_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "entity_type" DEFAULT 'track' NOT NULL,
	"track_id" varchar,
	"playlist_id" varchar,
	"event_type" text NOT NULL,
	"event_description" text NOT NULL,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_quota_usage" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service" text NOT NULL,
	"quota_date" date NOT NULL,
	"used_units" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artist_songwriters" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artist_id" varchar NOT NULL,
	"track_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artists" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"musicbrainz_id" text,
	"name" text NOT NULL,
	"instagram" text,
	"twitter" text,
	"facebook" text,
	"bandcamp" text,
	"linkedin" text,
	"youtube" text,
	"discogs" text,
	"website" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "artists_musicbrainz_id_unique" UNIQUE("musicbrainz_id")
);
--> statement-breakpoint
CREATE TABLE "contact_alerts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" varchar NOT NULL,
	"alert_type" "alert_type" NOT NULL,
	"related_track_id" varchar,
	"threshold_value" integer,
	"actual_value" integer,
	"message" text NOT NULL,
	"status" "alert_status" DEFAULT 'pending' NOT NULL,
	"triggered_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "contact_notes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" varchar NOT NULL,
	"author_user_id" varchar,
	"content" text NOT NULL,
	"is_pinned" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_stage_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" varchar NOT NULL,
	"previous_stage" "contact_stage",
	"new_stage" "contact_stage" NOT NULL,
	"reason" text,
	"changed_by_user_id" varchar,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_tags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" varchar NOT NULL,
	"tag_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_tracks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" varchar NOT NULL,
	"track_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"songwriter_id" varchar NOT NULL,
	"stage" "contact_stage" DEFAULT 'discovery' NOT NULL,
	"stage_updated_at" timestamp DEFAULT now() NOT NULL,
	"wow_growth_pct" integer,
	"wow_youtube_growth_pct" integer,
	"hot_lead" integer DEFAULT 0 NOT NULL,
	"assigned_user_id" varchar,
	"total_streams" integer,
	"total_youtube_views" integer,
	"total_tracks" integer DEFAULT 0 NOT NULL,
	"collaboration_count" integer DEFAULT 0 NOT NULL,
	"unsigned_score" integer,
	"unsigned_score_updated_at" timestamp,
	"score_confidence" text,
	"track_score_data" text,
	"mlc_searched" integer DEFAULT 0 NOT NULL,
	"mlc_found" integer DEFAULT 0 NOT NULL,
	"musicbrainz_searched" integer DEFAULT 0 NOT NULL,
	"musicbrainz_found" integer DEFAULT 0 NOT NULL,
	"chartmetric_searched" integer DEFAULT 0 NOT NULL,
	"chartmetric_found" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_songwriter_id_unique" UNIQUE("songwriter_id")
);
--> statement-breakpoint
CREATE TABLE "enrichment_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "job_type" NOT NULL,
	"playlist_id" varchar,
	"track_ids" text[] NOT NULL,
	"target_phase" integer,
	"capture_snapshot_after" integer DEFAULT 0 NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"total_tracks" integer DEFAULT 0 NOT NULL,
	"enriched_tracks" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"logs" text[] DEFAULT ARRAY[]::text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "outreach_activities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" varchar NOT NULL,
	"performed_by_user_id" varchar,
	"activity_type" "outreach_activity_type" NOT NULL,
	"channel" text,
	"subject" text,
	"body" text,
	"outcome" text,
	"metadata" text,
	"related_track_id" varchar,
	"performed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playlist_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week" date NOT NULL,
	"playlist_name" text NOT NULL,
	"playlist_id" varchar NOT NULL,
	"track_name" text NOT NULL,
	"artist_name" text NOT NULL,
	"spotify_url" text NOT NULL,
	"spotify_track_id" text,
	"album_art" text,
	"album_images" text,
	"isrc" text,
	"label" text,
	"release_date" varchar,
	"popularity" integer,
	"duration" integer,
	"explicit" integer,
	"added_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"publisher" text,
	"publisher_status" text,
	"collection_share" text,
	"ipi_number" text,
	"iswc" text,
	"administrators" text,
	"mlc_song_code" text,
	"songwriter" text,
	"producer" text,
	"enriched_at" timestamp,
	"enrichment_status" text DEFAULT 'pending',
	"enrichment_tier" text,
	"credits_status" text DEFAULT 'pending',
	"last_enrichment_attempt" timestamp,
	"instagram" text,
	"twitter" text,
	"tiktok" text,
	"email" text,
	"contact_notes" text,
	"data_source" text DEFAULT 'api' NOT NULL,
	"chartmetric_id" text,
	"chartmetric_status" text DEFAULT 'pending',
	"spotify_streams" integer,
	"streaming_velocity" text,
	"track_stage" text,
	"playlist_followers" integer,
	"youtube_views" integer,
	"youtube_video_id" text,
	"youtube_channel_id" text,
	"youtube_likes" integer,
	"youtube_comments" integer,
	"youtube_published_at" timestamp,
	"youtube_description" text,
	"youtube_licensed" integer,
	"chartmetric_enriched_at" timestamp,
	"songwriter_ids" text[],
	"composer_name" text,
	"moods" text[],
	"activities" text[],
	"audio_features" text,
	"artist_genres" text[],
	"artist_followers" integer
);
--> statement-breakpoint
CREATE TABLE "songwriter_aliases" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"songwriter_id" varchar NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"source" "confidence_source" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "songwriter_collaborations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"songwriter_id" varchar NOT NULL,
	"collaborator_chartmetric_id" text NOT NULL,
	"collaborator_name" text NOT NULL,
	"work_count" integer DEFAULT 0 NOT NULL,
	"frequency" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "songwriter_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chartmetric_id" text NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text,
	"total_tracks" integer,
	"playlist_followers" integer,
	"youtube_views" integer,
	"top_publisher" text,
	"top_publisher_works" integer,
	"genres" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "songwriter_profiles_chartmetric_id_unique" UNIQUE("chartmetric_id"),
	CONSTRAINT "songwriter_profiles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "spotify_tokens" (
	"id" varchar PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"encrypted_access_token" text NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"metadata" text,
	"playlist_id" varchar,
	"read" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'blue' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "track_performance_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" varchar NOT NULL,
	"track_id" varchar NOT NULL,
	"week" date NOT NULL,
	"spotify_streams" integer,
	"youtube_views" integer,
	"followers" integer,
	"wow_streams" integer,
	"wow_pct" integer,
	"wow_youtube_views" integer,
	"wow_youtube_pct" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_songwriters" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" varchar NOT NULL,
	"songwriter_id" varchar NOT NULL,
	"confidence_source" "confidence_source" NOT NULL,
	"source_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_tags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" varchar NOT NULL,
	"tag_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracked_playlists" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"playlist_id" text NOT NULL,
	"spotify_url" text NOT NULL,
	"image_url" text,
	"chartmetric_url" text,
	"status" text,
	"is_editorial" integer DEFAULT 0 NOT NULL,
	"total_tracks" integer,
	"last_fetch_count" integer DEFAULT 0,
	"is_complete" integer DEFAULT 0 NOT NULL,
	"fetch_method" text DEFAULT 'api',
	"last_checked" timestamp,
	"curator" text,
	"source" text DEFAULT 'spotify',
	"genre" text,
	"region" text,
	"followers" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tracked_playlists_playlist_id_unique" UNIQUE("playlist_id")
);
--> statement-breakpoint
ALTER TABLE "activity_history" ADD CONSTRAINT "activity_history_track_id_playlist_snapshots_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."playlist_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_history" ADD CONSTRAINT "activity_history_playlist_id_tracked_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."tracked_playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_songwriters" ADD CONSTRAINT "artist_songwriters_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_songwriters" ADD CONSTRAINT "artist_songwriters_track_id_playlist_snapshots_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."playlist_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_alerts" ADD CONSTRAINT "contact_alerts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_alerts" ADD CONSTRAINT "contact_alerts_related_track_id_playlist_snapshots_id_fk" FOREIGN KEY ("related_track_id") REFERENCES "public"."playlist_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_notes" ADD CONSTRAINT "contact_notes_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_stage_history" ADD CONSTRAINT "contact_stage_history_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_tracks" ADD CONSTRAINT "contact_tracks_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_tracks" ADD CONSTRAINT "contact_tracks_track_id_playlist_snapshots_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."playlist_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_songwriter_id_songwriter_profiles_id_fk" FOREIGN KEY ("songwriter_id") REFERENCES "public"."songwriter_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichment_jobs" ADD CONSTRAINT "enrichment_jobs_playlist_id_tracked_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."tracked_playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_activities" ADD CONSTRAINT "outreach_activities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_activities" ADD CONSTRAINT "outreach_activities_related_track_id_playlist_snapshots_id_fk" FOREIGN KEY ("related_track_id") REFERENCES "public"."playlist_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_snapshots" ADD CONSTRAINT "playlist_snapshots_playlist_id_tracked_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."tracked_playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songwriter_aliases" ADD CONSTRAINT "songwriter_aliases_songwriter_id_songwriter_profiles_id_fk" FOREIGN KEY ("songwriter_id") REFERENCES "public"."songwriter_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songwriter_collaborations" ADD CONSTRAINT "songwriter_collaborations_songwriter_id_songwriter_profiles_id_fk" FOREIGN KEY ("songwriter_id") REFERENCES "public"."songwriter_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_notifications" ADD CONSTRAINT "system_notifications_playlist_id_tracked_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."tracked_playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_performance_snapshots" ADD CONSTRAINT "track_performance_snapshots_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_performance_snapshots" ADD CONSTRAINT "track_performance_snapshots_track_id_playlist_snapshots_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."playlist_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_songwriters" ADD CONSTRAINT "track_songwriters_track_id_playlist_snapshots_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."playlist_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_songwriters" ADD CONSTRAINT "track_songwriters_songwriter_id_songwriter_profiles_id_fk" FOREIGN KEY ("songwriter_id") REFERENCES "public"."songwriter_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_tags" ADD CONSTRAINT "track_tags_track_id_playlist_snapshots_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."playlist_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_tags" ADD CONSTRAINT "track_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_service_date_idx" ON "api_quota_usage" USING btree ("service","quota_date");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_track_per_week_idx" ON "playlist_snapshots" USING btree ("week","playlist_id","spotify_url");--> statement-breakpoint
CREATE INDEX "idx_songwriter_profiles_normalized_name" ON "songwriter_profiles" USING btree ("normalized_name");