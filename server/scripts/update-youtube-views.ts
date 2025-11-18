import { db } from "../db";
import { playlistSnapshots } from "@shared/schema";
import { sql, isNotNull, isNull, and } from "drizzle-orm";
import pLimit from "p-limit";

const CHARTMETRIC_API_KEY = process.env.CHARTMETRIC_API_KEY;
const CHARTMETRIC_BASE_URL = "https://api.chartmetric.com/api";

interface ChartmetricAuthResponse {
  token: string;
}

let authToken: string | null = null;
let tokenExpiry: number = 0;

async function getAuthToken(): Promise<string> {
  if (authToken && Date.now() < tokenExpiry) {
    return authToken;
  }

  console.log("🔑 Authenticating with Chartmetric API...");
  const response = await fetch(`${CHARTMETRIC_BASE_URL}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      refreshtoken: CHARTMETRIC_API_KEY,
    }),
  });

  if (!response.ok) {
    throw new Error(`Chartmetric auth failed: ${response.status}`);
  }

  const data: ChartmetricAuthResponse = await response.json();
  authToken = data.token;
  tokenExpiry = Date.now() + 3500000; // ~58 minutes
  console.log("✅ Chartmetric authentication successful");
  return authToken;
}

async function makeChartmetricRequest<T>(endpoint: string): Promise<T> {
  const token = await getAuthToken();
  const response = await fetch(`${CHARTMETRIC_BASE_URL}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Chartmetric request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.obj || data;
}

async function fetchYouTubeViews(chartmetricId: string): Promise<number | null> {
  try {
    const youtubeData = await makeChartmetricRequest<any>(`/track/${chartmetricId}/youtube/stats`);
    if (youtubeData && Array.isArray(youtubeData) && youtubeData.length > 0) {
      const views = youtubeData[youtubeData.length - 1]?.value;
      return typeof views === 'number' ? views : null;
    }
    return null;
  } catch (err) {
    // YouTube data might not be available for all tracks
    return null;
  }
}

async function updateYouTubeViews() {
  console.log("\n🎬 YouTube Views Update Script");
  console.log("================================\n");

  // Find tracks with Chartmetric ID but no YouTube views
  const tracksToUpdate = await db
    .select({
      id: playlistSnapshots.id,
      trackName: playlistSnapshots.trackName,
      artistName: playlistSnapshots.artistName,
      chartmetricId: playlistSnapshots.chartmetricId,
    })
    .from(playlistSnapshots)
    .where(
      and(
        isNotNull(playlistSnapshots.chartmetricId),
        isNull(playlistSnapshots.youtubeViews)
      )
    );

  console.log(`📊 Found ${tracksToUpdate.length} tracks ready for YouTube views update`);
  
  if (tracksToUpdate.length === 0) {
    console.log("✨ All tracks already have YouTube views data!");
    return;
  }

  console.log(`\n⚙️  Starting update process with rate limiting (5 concurrent requests)...\n`);

  const limit = pLimit(5); // 5 concurrent requests
  let completed = 0;
  let updated = 0;
  let failed = 0;
  let noData = 0;

  const startTime = Date.now();

  const tasks = tracksToUpdate.map((track) =>
    limit(async () => {
      try {
        const views = await fetchYouTubeViews(track.chartmetricId!);
        
        if (views !== null) {
          await db
            .update(playlistSnapshots)
            .set({ youtubeViews: views })
            .where(sql`${playlistSnapshots.id} = ${track.id}`);
          
          updated++;
          console.log(`✅ [${completed + 1}/${tracksToUpdate.length}] Updated: ${track.trackName} - ${track.artistName} → ${views.toLocaleString()} views`);
        } else {
          noData++;
          console.log(`⚠️  [${completed + 1}/${tracksToUpdate.length}] No YouTube data: ${track.trackName} - ${track.artistName}`);
        }
      } catch (error) {
        failed++;
        console.error(`❌ [${completed + 1}/${tracksToUpdate.length}] Failed: ${track.trackName} - ${track.artistName}`, error instanceof Error ? error.message : error);
      } finally {
        completed++;
        
        // Progress update every 50 tracks
        if (completed % 50 === 0) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const rate = (completed / (Date.now() - startTime) * 1000).toFixed(1);
          console.log(`\n📈 Progress: ${completed}/${tracksToUpdate.length} (${((completed / tracksToUpdate.length) * 100).toFixed(1)}%)`);
          console.log(`⏱️  Elapsed: ${elapsed}s | Rate: ${rate} tracks/sec\n`);
        }
      }
    })
  );

  await Promise.all(tasks);

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n================================");
  console.log("✨ YouTube Views Update Complete!");
  console.log("================================\n");
  console.log(`📊 Results:`);
  console.log(`   Total processed: ${completed}`);
  console.log(`   ✅ Successfully updated: ${updated}`);
  console.log(`   ⚠️  No YouTube data: ${noData}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   ⏱️  Total time: ${totalTime}s`);
  console.log(`   📈 Average rate: ${(completed / parseFloat(totalTime)).toFixed(1)} tracks/sec\n`);
}

// Run the script
updateYouTubeViews()
  .then(() => {
    console.log("🎉 Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Script failed:", error);
    process.exit(1);
  });
