/**
 * Fix Contact Names - Split concatenated names and create separate contacts
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { detectAndSplitConcatenatedNames, isConcatenated } from "./auditContactNames";

interface FixResult {
  totalProcessed: number;
  totalFixed: number;
  totalSkipped: number;
  errors: Array<{ contactId: string; error: string }>;
  details: Array<{
    originalName: string;
    newNames: string[];
    contactId: string;
    songwriterId: string;
  }>;
}

async function fixContactNames(dryRun: boolean = true): Promise<FixResult> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔧 Contact Name Fix Script - ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`${'='.repeat(80)}\n`);
  
  const result: FixResult = {
    totalProcessed: 0,
    totalFixed: 0,
    totalSkipped: 0,
    errors: [],
    details: [],
  };
  
  try {
    // Query all contacts with their songwriter profile names
    const contactsResult = await db.execute(sql`
      SELECT 
        c.id as contact_id,
        c.songwriter_id,
        c.stage,
        c.unsigned_score,
        c.total_streams,
        c.total_tracks,
        c.collaboration_count,
        c.hot_lead,
        c.wow_growth_pct,
        sp.name as songwriter_name
      FROM contacts c
      JOIN songwriter_profiles sp ON sp.id = c.songwriter_id
      ORDER BY sp.name
    `);
    
    const contacts = contactsResult.rows as Array<{
      contact_id: string;
      songwriter_id: string;
      stage: string;
      unsigned_score: number | null;
      total_streams: number | null;
      total_tracks: number;
      collaboration_count: number;
      hot_lead: number;
      wow_growth_pct: number | null;
      songwriter_name: string;
    }>;
    
    console.log(`📊 Analyzing ${contacts.length} contacts...\n`);
    
    for (const contact of contacts) {
      result.totalProcessed++;
      
      const { concatenated, confidence } = isConcatenated(contact.songwriter_name);
      
      if (!concatenated) {
        result.totalSkipped++;
        continue;
      }
      
      const suggestedNames = detectAndSplitConcatenatedNames(contact.songwriter_name);
      
      // Skip if splitting didn't produce multiple names
      if (suggestedNames.length < 2) {
        console.log(`⚠️  Skipping "${contact.songwriter_name}" - couldn't split into multiple names\n`);
        result.totalSkipped++;
        continue;
      }
      
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`🔍 Found concatenated name (${confidence} confidence):`);
      console.log(`   Original: "${contact.songwriter_name}"`);
      console.log(`   Split into: ${suggestedNames.map(n => `"${n}"`).join(', ')}`);
      console.log(`   Contact ID: ${contact.contact_id}`);
      console.log(`   Songwriter Profile ID: ${contact.songwriter_id}`);
      
      if (dryRun) {
        console.log(`   [DRY RUN] Would create ${suggestedNames.length} new contacts`);
        result.details.push({
          originalName: contact.songwriter_name,
          newNames: suggestedNames,
          contactId: contact.contact_id,
          songwriterId: contact.songwriter_id,
        });
        result.totalFixed++;
        continue;
      }
      
      try {
        // Get all related contact_tracks for this contact
        const tracksResult = await db.execute(sql`
          SELECT track_id FROM contact_tracks WHERE contact_id = ${contact.contact_id}
        `);
        const trackIds = tracksResult.rows.map((r: any) => r.track_id);
        
        console.log(`   Related tracks: ${trackIds.length}`);
        
        // Create new songwriter profiles and contacts for each split name
        const newContactIds: string[] = [];
        
        for (const newName of suggestedNames) {
          // Generate a chartmetric_id placeholder (normalized name as ID)
          const normalizedName = newName.toLowerCase().replace(/[^a-z0-9]/g, '-');
          const chartmetricIdPlaceholder = `cm-${normalizedName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          
          // Create new songwriter_profile
          const profileResult = await db.execute(sql`
            INSERT INTO songwriter_profiles (name, chartmetric_id, normalized_name)
            VALUES (${newName}, ${chartmetricIdPlaceholder}, ${normalizedName})
            RETURNING id
          `);
          
          const newSongwriterId = (profileResult.rows[0] as any).id;
          console.log(`   ✓ Created songwriter_profile for "${newName}" (ID: ${newSongwriterId})`);
          
          // Create new contact
          const contactResult = await db.execute(sql`
            INSERT INTO contacts (
              songwriter_id,
              stage,
              unsigned_score,
              total_streams,
              total_tracks,
              collaboration_count,
              hot_lead,
              wow_growth_pct
            )
            VALUES (
              ${newSongwriterId},
              ${contact.stage},
              ${contact.unsigned_score},
              ${contact.total_streams},
              ${contact.total_tracks},
              ${contact.collaboration_count},
              ${contact.hot_lead},
              ${contact.wow_growth_pct}
            )
            RETURNING id
          `);
          
          const newContactId = (contactResult.rows[0] as any).id;
          newContactIds.push(newContactId);
          console.log(`   ✓ Created contact for "${newName}" (ID: ${newContactId})`);
          
          // Link all tracks to the new contact
          if (trackIds.length > 0) {
            for (const trackId of trackIds) {
              // Check if the link already exists
              const existingLink = await db.execute(sql`
                SELECT id FROM contact_tracks 
                WHERE contact_id = ${newContactId} AND track_id = ${trackId}
              `);
              
              if (existingLink.rows.length === 0) {
                await db.execute(sql`
                  INSERT INTO contact_tracks (contact_id, track_id)
                  VALUES (${newContactId}, ${trackId})
                `);
              }
            }
            console.log(`   ✓ Linked ${trackIds.length} tracks to "${newName}"`);
          }
        }
        
        // Delete the old contact_tracks entries
        if (trackIds.length > 0) {
          await db.execute(sql`
            DELETE FROM contact_tracks WHERE contact_id = ${contact.contact_id}
          `);
          console.log(`   ✓ Removed old contact_tracks entries`);
        }
        
        // Delete the old contact
        await db.execute(sql`
          DELETE FROM contacts WHERE id = ${contact.contact_id}
        `);
        console.log(`   ✓ Deleted old contact (ID: ${contact.contact_id})`);
        
        // Delete the old songwriter_profile
        await db.execute(sql`
          DELETE FROM songwriter_profiles WHERE id = ${contact.songwriter_id}
        `);
        console.log(`   ✓ Deleted old songwriter_profile (ID: ${contact.songwriter_id})`);
        
        result.details.push({
          originalName: contact.songwriter_name,
          newNames: suggestedNames,
          contactId: contact.contact_id,
          songwriterId: contact.songwriter_id,
        });
        
        result.totalFixed++;
        console.log(`   ✅ Successfully split into ${suggestedNames.length} contacts`);
        
      } catch (error: any) {
        console.error(`   ❌ Failed to fix: ${error.message}`);
        result.errors.push({
          contactId: contact.contact_id,
          error: error.message,
        });
      }
    }
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 SUMMARY`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Total processed: ${result.totalProcessed}`);
    console.log(`Fixed: ${result.totalFixed}`);
    console.log(`Skipped: ${result.totalSkipped}`);
    console.log(`Errors: ${result.errors.length}`);
    console.log(`${'='.repeat(80)}\n`);
    
    if (result.errors.length > 0) {
      console.log(`❌ Errors encountered:`);
      result.errors.forEach((err, idx) => {
        console.log(`${idx + 1}. Contact ${err.contactId}: ${err.error}`);
      });
      console.log();
    }
    
    if (dryRun) {
      console.log(`\n💡 This was a DRY RUN. No changes were made.`);
      console.log(`   Run with --live flag to apply changes.\n`);
    }
    
  } catch (error) {
    console.error("❌ Fix script failed:", error);
    throw error;
  }
  
  return result;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const isLive = args.includes('--live');
  
  if (isLive) {
    console.log("\n⚠️  WARNING: Running in LIVE mode. Changes will be permanent.\n");
  }
  
  fixContactNames(!isLive)
    .then((result) => {
      console.log("✅ Fix script complete!");
      if (!isLive) {
        console.log("\n💡 Run with --live flag to apply these changes.");
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Fix script failed:", error);
      process.exit(1);
    });
}

export { fixContactNames };
