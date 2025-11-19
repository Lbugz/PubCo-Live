
-- Add YouTube engagement metadata columns
ALTER TABLE playlist_snapshots
ADD COLUMN IF NOT EXISTS youtube_video_id TEXT,
ADD COLUMN IF NOT EXISTS youtube_channel_id TEXT,
ADD COLUMN IF NOT EXISTS youtube_likes INTEGER,
ADD COLUMN IF NOT EXISTS youtube_comments INTEGER,
ADD COLUMN IF NOT EXISTS youtube_published_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS youtube_description TEXT,
ADD COLUMN IF NOT EXISTS youtube_licensed INTEGER DEFAULT 0;

-- Create index on youtube_video_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_playlist_snapshots_youtube_video_id ON playlist_snapshots(youtube_video_id);
