/**
 * Backfill Script: Normalized Names
 * 
 * Populates the normalized_name column for all existing songwriter_profiles
 */

import { db } from "./db";
import { songwriterProfiles } from "@shared/schema";
import { normalizeSongwriterName } from "./utils/songwriterNormalization";

async function backfillNormalizedNames() {
  console.log("\n=======================================================");
  console.log("BACKFILL: Normalized Names for Songwriter Profiles");
  console.log("=======================================================\n");

  // Get all profiles without normalized_name
  const profiles = await db.select({
    id: songwriterProfiles.id,
    name: songwriterProfiles.name,
  })
    .from(songwriterProfiles)
    .where(sql`${songwriterProfiles.normalizedName} IS NULL`);

  console.log(`📊 Found ${profiles.length} profiles needing normalized names\n`);

  if (profiles.length === 0) {
    console.log("✅ All profiles already have normalized names!\n");
    process.exit(0);
  }

  console.log("🔄 Backfilling normalized names...\n");

  let updated = 0;
  for (const profile of profiles) {
    const normalized = normalizeSongwriterName(profile.name);
    
    await db.update(songwriterProfiles)
      .set({ normalizedName: normalized })
      .where(eq(songwriterProfiles.id, profile.id));
    
    updated++;
    
    if (updated % 100 === 0) {
      console.log(`  Updated ${updated}/${profiles.length} profiles...`);
    }
  }

  console.log(`\n✅ Backfilled ${updated} normalized names successfully!\n`);
  
  // Verify backfill
  const remaining = await db.select({ count: sql<number>`count(*)::int` })
    .from(songwriterProfiles)
    .where(sql`${songwriterProfiles.normalizedName} IS NULL`);

  console.log(`📈 Verification: ${remaining[0]?.count || 0} profiles remaining without normalized names\n`);

  console.log("=======================================================");
  console.log("✅ BACKFILL COMPLETE");
  console.log("=======================================================\n");

  process.exit(0);
}

// Import missing dependencies
import { sql, eq } from "drizzle-orm";

backfillNormalizedNames().catch((error) => {
  console.error("❌ Backfill failed:", error);
  process.exit(1);
});
