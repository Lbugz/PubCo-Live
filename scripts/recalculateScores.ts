#!/usr/bin/env tsx
/**
 * Bulk Score Recalculation Script
 * 
 * Purpose: Recalculate unsigned scores for all contacts in the database
 * 
 * Use cases:
 * - After fixing scoring algorithm bugs (e.g., data completeness duplication)
 * - After updating signal weights
 * - After adding new scoring signals
 * 
 * Usage:
 *   npm run recalculate-scores
 */

import { db } from "../server/db.js";
import { contacts } from "../shared/schema.js";
import { updateContactScore } from "../server/scoring/contactScoring.js";

async function recalculateAllScores() {
  console.log("🔄 Starting bulk score recalculation...\n");
  
  try {
    // Fetch all contacts
    const allContacts = await db.select().from(contacts);
    
    console.log(`📊 Found ${allContacts.length} contacts to process\n`);
    
    let successCount = 0;
    let errorCount = 0;
    const errors: { contactId: string; name: string; error: string }[] = [];
    
    // Process each contact
    for (let i = 0; i < allContacts.length; i++) {
      const contact = allContacts[i];
      const progress = `[${i + 1}/${allContacts.length}]`;
      
      try {
        console.log(`${progress} Processing: ${contact.songwriterName || 'Unknown'} (${contact.id})`);
        
        // Recalculate and update score
        const scoreResult = await updateContactScore(contact.id);
        
        console.log(`  ✅ Score updated: ${scoreResult.finalScore}/10 (${scoreResult.confidence} confidence)`);
        console.log(`  📈 Top signals: ${scoreResult.topSignals.slice(0, 3).map(s => `${s.description} (${s.weight > 0 ? '+' : ''}${s.weight})`).join(', ')}`);
        
        successCount++;
      } catch (error: any) {
        console.error(`  ❌ Error: ${error.message}`);
        errorCount++;
        errors.push({
          contactId: contact.id,
          name: contact.songwriterName || 'Unknown',
          error: error.message
        });
      }
      
      // Add a small delay to avoid overwhelming the database
      if (i < allContacts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 RECALCULATION SUMMARY");
    console.log("=".repeat(60));
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${errorCount}`);
    console.log(`📝 Total: ${allContacts.length}`);
    
    if (errors.length > 0) {
      console.log("\n⚠️  ERRORS:");
      errors.forEach(err => {
        console.log(`  - ${err.name} (${err.contactId}): ${err.error}`);
      });
    }
    
    console.log("\n✨ Bulk recalculation complete!");
    
    process.exit(0);
  } catch (error: any) {
    console.error("\n❌ Fatal error during recalculation:", error);
    process.exit(1);
  }
}

// Run the script
recalculateAllScores();
