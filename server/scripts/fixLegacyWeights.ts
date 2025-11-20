import { db } from "../db";
import { contacts, songwriterProfiles } from "@shared/schema";
import { eq, sql, isNotNull } from "drizzle-orm";
import { updateContactScore } from "../scoring/contactScoring";

/**
 * Finds and recalculates contacts using legacy weighted scoring values
 * 
 * Legacy system used weighted multipliers (e.g., FRESH_FINDS: 3 * 1.5 = 4.5)
 * Current system uses simplified base weights (e.g., FRESH_FINDS: 3)
 * 
 * This script identifies contacts with weights >= 4 (impossible in current system)
 * and recalculates them using the current scoring engine.
 */

interface ContactWithLegacyWeights {
  id: string;
  songwriterName: string;
  unsignedScore: number;
  hasLegacyWeights: boolean;
}

async function findLegacyWeightContacts(): Promise<ContactWithLegacyWeights[]> {
  console.log("🔍 Searching for contacts with legacy weighted values...\n");
  
  // Query contacts with trackScoreData containing weights >= 4
  // These are impossible with current simplified scoring (max individual weight is 3)
  const results = await db
    .select({
      id: contacts.id,
      songwriterId: contacts.songwriterId,
      unsignedScore: contacts.unsignedScore,
      trackScoreData: contacts.trackScoreData,
    })
    .from(contacts)
    .where(isNotNull(contacts.trackScoreData))
    .limit(1000); // Safety limit

  const legacyContacts: ContactWithLegacyWeights[] = [];

  for (const contact of results) {
    try {
      const scoreData = JSON.parse(contact.trackScoreData!);
      
      // Check if any topSignals have weight >= 4 (legacy weighted system indicator)
      const hasLegacyWeights = scoreData.topSignals?.some((signal: any) => 
        signal.weight >= 4
      ) || false;

      if (hasLegacyWeights) {
        // Get songwriter name
        const songwriter = await db
          .select({ name: songwriterProfiles.name })
          .from(songwriterProfiles)
          .where(eq(songwriterProfiles.id, contact.songwriterId))
          .limit(1);

        legacyContacts.push({
          id: contact.id,
          songwriterName: songwriter[0]?.name || 'Unknown',
          unsignedScore: contact.unsignedScore || 0,
          hasLegacyWeights: true,
        });
      }
    } catch (error) {
      // Skip invalid JSON
      continue;
    }
  }

  return legacyContacts;
}

async function recalculateLegacyContacts() {
  console.log("=" .repeat(70));
  console.log("LEGACY WEIGHTED SCORING MIGRATION");
  console.log("=" .repeat(70) + "\n");
  
  const legacyContacts = await findLegacyWeightContacts();
  
  console.log(`📊 Found ${legacyContacts.length} contacts with legacy weighted values\n`);
  
  if (legacyContacts.length === 0) {
    console.log("✅ No legacy weighted contacts found. All contacts using current simplified scoring!");
    return;
  }

  // Show sample contacts
  console.log("Sample contacts with legacy weights:");
  console.log("-".repeat(70));
  legacyContacts.slice(0, 5).forEach((contact, idx) => {
    console.log(`${idx + 1}. ${contact.songwriterName} (Score: ${contact.unsignedScore}/10)`);
  });
  console.log("-".repeat(70) + "\n");

  console.log("🔄 Starting recalculation using current simplified scoring...\n");

  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ contact: string; error: string }> = [];

  for (const contact of legacyContacts) {
    try {
      const result = await updateContactScore(contact.id);
      const scoreDiff = result.finalScore - contact.unsignedScore;
      const arrow = scoreDiff > 0 ? '↑' : scoreDiff < 0 ? '↓' : '→';
      
      console.log(
        `✅ ${contact.songwriterName.padEnd(30)} ` +
        `${contact.unsignedScore}/10 ${arrow} ${result.finalScore}/10`
      );
      successCount++;
    } catch (error: any) {
      console.error(`❌ ${contact.songwriterName}: ${error.message}`);
      errors.push({
        contact: contact.songwriterName,
        error: error.message
      });
      errorCount++;
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("MIGRATION COMPLETE");
  console.log("=".repeat(70));
  console.log(`✅ Successfully recalculated: ${successCount} contacts`);
  console.log(`❌ Failed: ${errorCount} contacts`);
  console.log(`📊 Total processed: ${legacyContacts.length} contacts`);
  
  if (errors.length > 0) {
    console.log("\n⚠️  Errors:");
    errors.forEach(e => console.log(`   - ${e.contact}: ${e.error}`));
  }
  
  console.log("=".repeat(70));
}

// Run the migration
recalculateLegacyContacts()
  .then(() => {
    console.log("\n✨ Migration completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Migration failed:", error);
    process.exit(1);
  });
