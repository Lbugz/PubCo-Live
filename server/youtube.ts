const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

interface YouTubeSearchResult {
  items: Array<{
    id: {
      videoId: string;
    };
    snippet: {
      channelId: string;
      channelTitle: string;
      publishedAt: string;
      title: string;
      description: string;
    };
  }>;
}

interface YouTubeVideoStatistics {
  items: Array<{
    id: string;
    snippet: {
      channelId: string;
      channelTitle: string;
      publishedAt: string;
      title: string;
      description: string;
      tags?: string[];
    };
    statistics: {
      viewCount: string;
      likeCount?: string;
      commentCount?: string;
      favoriteCount?: string;
    };
    contentDetails: {
      duration: string;
      licensedContent: boolean;
    };
  }>;
}

export interface YouTubeMetadata {
  videoId: string;
  channelId: string;
  channelTitle: string;
  views: number;
  likes: number | null;
  comments: number | null;
  publishedAt: Date;
  description: string;
  licensed: boolean;
}

class YouTubeRateLimiter {
  private lastRequestTime: number = 0;
  private readonly minInterval: number = 100; // 100ms between requests (conservative)

  async throttle(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }
}

const rateLimiter = new YouTubeRateLimiter();

/**
 * Search YouTube for a video by ISRC code
 * Cost: ~100 quota units
 */
export async function searchVideoByISRC(isrc: string): Promise<string | null> {
  if (!YOUTUBE_API_KEY) {
    throw new Error("YOUTUBE_API_KEY not configured. Please add it to Replit Secrets.");
  }

  if (!isrc) {
    return null;
  }

  await rateLimiter.throttle();

  const searchQuery = `ISRC:${isrc}`;
  const url = new URL(`${YOUTUBE_API_BASE}/search`);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('q', searchQuery);
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', '1');
  url.searchParams.set('key', YOUTUBE_API_KEY);

  try {
    const response = await fetch(url.toString());

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`YouTube search failed for ISRC ${isrc}: ${response.status} - ${errorText}`);
      return null;
    }

    const data: YouTubeSearchResult = await response.json();
    
    if (!data.items || data.items.length === 0) {
      console.log(`No YouTube video found for ISRC: ${isrc}`);
      return null;
    }

    const videoId = data.items[0].id.videoId;
    console.log(`✅ Found YouTube video for ISRC ${isrc}: ${videoId}`);
    return videoId;
  } catch (error) {
    console.error(`Error searching YouTube for ISRC ${isrc}:`, error);
    return null;
  }
}

/**
 * Get video statistics and metadata by video ID
 * Cost: ~1 quota unit
 */
export async function getVideoMetadata(videoId: string): Promise<YouTubeMetadata | null> {
  if (!YOUTUBE_API_KEY) {
    throw new Error("YOUTUBE_API_KEY not configured. Please add it to Replit Secrets.");
  }

  await rateLimiter.throttle();

  const url = new URL(`${YOUTUBE_API_BASE}/videos`);
  url.searchParams.set('part', 'snippet,statistics,contentDetails');
  url.searchParams.set('id', videoId);
  url.searchParams.set('key', YOUTUBE_API_KEY);

  try {
    const response = await fetch(url.toString());

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`YouTube video fetch failed for ID ${videoId}: ${response.status} - ${errorText}`);
      return null;
    }

    const data: YouTubeVideoStatistics = await response.json();
    
    if (!data.items || data.items.length === 0) {
      console.error(`No video found with ID: ${videoId}`);
      return null;
    }

    const video = data.items[0];
    
    return {
      videoId: video.id,
      channelId: video.snippet.channelId,
      channelTitle: video.snippet.channelTitle,
      views: parseInt(video.statistics.viewCount, 10) || 0,
      likes: video.statistics.likeCount ? parseInt(video.statistics.likeCount, 10) : null,
      comments: video.statistics.commentCount ? parseInt(video.statistics.commentCount, 10) : null,
      publishedAt: new Date(video.snippet.publishedAt),
      description: video.snippet.description || '',
      licensed: video.contentDetails.licensedContent,
    };
  } catch (error) {
    console.error(`Error fetching YouTube video metadata for ${videoId}:`, error);
    return null;
  }
}

/**
 * Search for a video by ISRC and return full metadata
 * This combines both search and metadata fetch
 * Total cost: ~101 quota units
 */
export async function enrichTrackWithYouTube(isrc: string): Promise<YouTubeMetadata | null> {
  const videoId = await searchVideoByISRC(isrc);
  
  if (!videoId) {
    return null;
  }

  return await getVideoMetadata(videoId);
}
