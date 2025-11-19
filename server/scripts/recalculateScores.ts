import { db } from "../db";
import { contacts } from "@shared/schema";
import { updateContactScore } from "../scoring/contactScoring";

async function recalculateAllScores() {
  console.log("📊 Starting contact score recalculation...\n");

  try {
    // Fetch all contacts
    const allContacts = await db.select().from(contacts);
    
    console.log(`Found ${allContacts.length} contacts to score\n`);

    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < allContacts.length; i++) {
      const contact = allContacts[i];
      const progress = ((i + 1) / allContacts.length * 100).toFixed(1);

      try {
        const result = await updateContactScore(contact.id);
        
        if (result.finalScore > 0) {
          console.log(
            `✅ [${i + 1}/${allContacts.length}] ${progress}% - Contact ${contact.id}: Score ${result.finalScore}/10 (${result.confidence} confidence)`
          );
          successCount++;
        } else {
          console.log(
            `⚪ [${i + 1}/${allContacts.length}] ${progress}% - Contact ${contact.id}: No score (no tracks or insufficient data)`
          );
          skippedCount++;
        }
      } catch (error) {
        console.error(
          `❌ [${i + 1}/${allContacts.length}] ${progress}% - Contact ${contact.id} failed:`,
          error instanceof Error ? error.message : String(error)
        );
        failureCount++;
      }

      // Add small delay to prevent overwhelming the database
      if (i % 50 === 0 && i > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("📈 RECALCULATION COMPLETE");
    console.log("=".repeat(60));
    console.log(`✅ Success: ${successCount} contacts scored`);
    console.log(`⚪ Skipped: ${skippedCount} contacts (no data)`);
    console.log(`❌ Failed: ${failureCount} contacts`);
    console.log(`📊 Total: ${allContacts.length} contacts processed`);
    console.log("=".repeat(60) + "\n");

  } catch (error) {
    console.error("💥 Fatal error during score recalculation:", error);
    process.exit(1);
  }

  process.exit(0);
}

// Run the recalculation
recalculateAllScores();
