import { db } from "../db";
import { contacts } from "@shared/schema";
import { isNull, isNotNull, and } from "drizzle-orm";
import { updateContactScore } from "../scoring/contactScoring";

/**
 * Recalculates scores for contacts with stale data
 * (contacts that have unsigned_score but NULL track_score_data)
 */
async function recalculateStaleScores() {
  console.log("🔍 Finding contacts with stale scores...");
  
  // Find contacts with unsigned_score but no track_score_data
  // IMPORTANT: Use and() to combine both conditions properly
  const staleContacts = await db
    .select({
      id: contacts.id,
      unsignedScore: contacts.unsignedScore
    })
    .from(contacts)
    .where(and(
      isNull(contacts.trackScoreData),
      isNotNull(contacts.unsignedScore)
    ));
  
  console.log(`📊 Found ${staleContacts.length} contacts with stale scores`);
  
  if (staleContacts.length === 0) {
    console.log("✅ No stale scores found!");
    return;
  }
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const contact of staleContacts) {
    try {
      const result = await updateContactScore(contact.id);
      console.log(`✅ Recalculated score for contact ${contact.id}: ${result.finalScore}/10 (was ${contact.unsignedScore})`);
      successCount++;
    } catch (error) {
      console.error(`❌ Failed to recalculate score for contact ${contact.id}:`, error);
      errorCount++;
    }
  }
  
  console.log("\n" + "=".repeat(70));
  console.log(`📈 RECALCULATION COMPLETE`);
  console.log("=".repeat(70));
  console.log(`✅ Successfully recalculated: ${successCount} contacts`);
  console.log(`❌ Failed: ${errorCount} contacts`);
  console.log(`📊 Total processed: ${staleContacts.length} contacts`);
  console.log("=".repeat(70));
}

// Run the script
recalculateStaleScores()
  .then(() => {
    console.log("\n✨ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Script failed:", error);
    process.exit(1);
  });
