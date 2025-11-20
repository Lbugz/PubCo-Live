import { db } from "../db";
import { contacts, songwriterProfiles, contactTracks } from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import fs from "fs";

/**
 * DUPLICATE CONTACT AUDIT
 * 
 * Identifies duplicate contacts based on:
 * 1. Exact name matches (case-insensitive)
 * 2. Multiple songwriter_profiles with same normalized name
 * 3. Contacts pointing to different songwriter_profiles but same person
 * 4. Orphaned contacts that should be merged
 */

interface DuplicateGroup {
  name: string;
  contactCount: number;
  contacts: Array<{
    contactId: string;
    songwriterId: string;
    chartmetricId: string;
    totalStreams: number | null;
    totalTracks: number;
    unsignedScore: number | null;
    stage: string;
    createdAt: Date;
  }>;
}

interface DuplicateSongwriter {
  name: string;
  profileCount: number;
  profiles: Array<{
    id: string;
    chartmetricId: string;
    name: string;
    normalizedName: string | null;
    hasContact: boolean;
    contactId: string | null;
    totalStreams: number | null;
    totalTracks: number;
  }>;
}

async function auditDuplicateContacts() {
  console.log("🔍 DUPLICATE CONTACT AUDIT");
  console.log("=" .repeat(80));
  console.log("");

  // 1. Find contacts with duplicate names (case-insensitive)
  console.log("📊 Finding duplicate contact names...");
  
  const duplicateNameQuery = await db.execute(sql`
    SELECT 
      LOWER(sp.name) as normalized_name,
      COUNT(DISTINCT c.id) as contact_count,
      JSON_AGG(
        JSON_BUILD_OBJECT(
          'contactId', c.id,
          'songwriterId', c.songwriter_id,
          'chartmetricId', sp.chartmetric_id,
          'name', sp.name,
          'totalStreams', c.total_streams,
          'totalTracks', c.total_tracks,
          'unsignedScore', c.unsigned_score,
          'stage', c.stage,
          'createdAt', c.created_at
        )
      ) as contacts
    FROM contacts c
    JOIN songwriter_profiles sp ON c.songwriter_id = sp.id
    GROUP BY LOWER(sp.name)
    HAVING COUNT(DISTINCT c.id) > 1
    ORDER BY COUNT(DISTINCT c.id) DESC, LOWER(sp.name)
  `);

  const duplicateGroups: DuplicateGroup[] = (duplicateNameQuery.rows as any[]).map((row: any) => ({
    name: row.normalized_name,
    contactCount: parseInt(row.contact_count),
    contacts: row.contacts,
  }));

  console.log(`Found ${duplicateGroups.length} duplicate contact name groups`);
  console.log("");

  // 2. Find songwriter_profiles with duplicate names
  console.log("📊 Finding duplicate songwriter profile names...");
  
  const duplicateProfileQuery = await db.execute(sql`
    SELECT 
      LOWER(sp.name) as normalized_name,
      COUNT(DISTINCT sp.id) as profile_count,
      JSON_AGG(
        JSON_BUILD_OBJECT(
          'id', sp.id,
          'chartmetricId', sp.chartmetric_id,
          'name', sp.name,
          'normalizedName', sp.normalized_name,
          'hasContact', CASE WHEN c.id IS NOT NULL THEN true ELSE false END,
          'contactId', c.id,
          'totalStreams', c.total_streams,
          'totalTracks', c.total_tracks
        )
      ) as profiles
    FROM songwriter_profiles sp
    LEFT JOIN contacts c ON c.songwriter_id = sp.id
    GROUP BY LOWER(sp.name)
    HAVING COUNT(DISTINCT sp.id) > 1
    ORDER BY COUNT(DISTINCT sp.id) DESC, LOWER(sp.name)
  `);

  const duplicateSongwriters: DuplicateSongwriter[] = (duplicateProfileQuery.rows as any[]).map((row: any) => ({
    name: row.normalized_name,
    profileCount: parseInt(row.profile_count),
    profiles: row.profiles,
  }));

  console.log(`Found ${duplicateSongwriters.length} duplicate songwriter profile name groups`);
  console.log("");

  // 3. Print detailed report
  console.log("=" .repeat(80));
  console.log("DUPLICATE CONTACT NAMES");
  console.log("=" .repeat(80));
  console.log("");

  if (duplicateGroups.length === 0) {
    console.log("✅ No duplicate contact names found");
  } else {
    duplicateGroups.forEach((group, idx) => {
      console.log(`${idx + 1}. ${group.name.toUpperCase()} (${group.contactCount} contacts)`);
      console.log("-" .repeat(80));
      
      group.contacts.forEach((contact, cIdx) => {
        console.log(`   Contact ${cIdx + 1}:`);
        console.log(`   ID:              ${contact.contactId}`);
        console.log(`   Songwriter ID:   ${contact.songwriterId}`);
        console.log(`   Chartmetric ID:  ${contact.chartmetricId}`);
        console.log(`   Total Streams:   ${contact.totalStreams?.toLocaleString() || 'N/A'}`);
        console.log(`   Total Tracks:    ${contact.totalTracks}`);
        console.log(`   Score:           ${contact.unsignedScore || 'N/A'}`);
        console.log(`   Stage:           ${contact.stage}`);
        console.log(`   Created:         ${new Date(contact.createdAt).toLocaleDateString()}`);
        console.log("");
      });
    });
  }

  console.log("");
  console.log("=" .repeat(80));
  console.log("DUPLICATE SONGWRITER PROFILES");
  console.log("=" .repeat(80));
  console.log("");

  if (duplicateSongwriters.length === 0) {
    console.log("✅ No duplicate songwriter profiles found");
  } else {
    duplicateSongwriters.forEach((songwriter, idx) => {
      console.log(`${idx + 1}. ${songwriter.name.toUpperCase()} (${songwriter.profileCount} profiles)`);
      console.log("-" .repeat(80));
      
      songwriter.profiles.forEach((profile, pIdx) => {
        console.log(`   Profile ${pIdx + 1}:`);
        console.log(`   ID:              ${profile.id}`);
        console.log(`   Chartmetric ID:  ${profile.chartmetricId}`);
        console.log(`   Name:            ${profile.name}`);
        console.log(`   Has Contact:     ${profile.hasContact ? 'YES' : 'NO'}`);
        if (profile.hasContact) {
          console.log(`   Contact ID:      ${profile.contactId}`);
          console.log(`   Total Streams:   ${profile.totalStreams?.toLocaleString() || 'N/A'}`);
          console.log(`   Total Tracks:    ${profile.totalTracks}`);
        }
        console.log("");
      });
    });
  }

  // 4. Generate JSON report
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      duplicateContactNames: duplicateGroups.length,
      totalDuplicateContacts: duplicateGroups.reduce((sum, g) => sum + g.contactCount, 0),
      duplicateSongwriterNames: duplicateSongwriters.length,
      totalDuplicateProfiles: duplicateSongwriters.reduce((sum, s) => sum + s.profileCount, 0),
    },
    duplicateContacts: duplicateGroups,
    duplicateSongwriters: duplicateSongwriters,
  };

  const reportPath = "duplicate-contacts-audit.json";
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log("");
  console.log("=" .repeat(80));
  console.log("SUMMARY");
  console.log("=" .repeat(80));
  console.log(`Duplicate Contact Name Groups:     ${report.summary.duplicateContactNames}`);
  console.log(`Total Duplicate Contacts:          ${report.summary.totalDuplicateContacts}`);
  console.log(`Duplicate Songwriter Name Groups:  ${report.summary.duplicateSongwriterNames}`);
  console.log(`Total Duplicate Profiles:          ${report.summary.totalDuplicateProfiles}`);
  console.log("");
  console.log(`📄 Full report saved to: ${reportPath}`);
  console.log("");

  // 5. Analyze the duplicates - suggest merges
  console.log("=" .repeat(80));
  console.log("MERGE RECOMMENDATIONS");
  console.log("=" .repeat(80));
  console.log("");

  if (duplicateGroups.length > 0) {
    console.log("⚠️  Duplicate contacts detected. Potential causes:");
    console.log("");
    console.log("1. Same person with multiple Chartmetric profiles");
    console.log("   → These should be merged into a single contact");
    console.log("");
    console.log("2. Different people with the same name");
    console.log("   → Keep separate (common names like 'John Smith')");
    console.log("");
    console.log("3. Data imported before unique constraint was added");
    console.log("   → Review and merge older duplicates");
    console.log("");
    
    duplicateGroups.forEach((group, idx) => {
      const chartmetricIds = Array.from(new Set(group.contacts.map(c => c.chartmetricId)));
      
      if (chartmetricIds.length === 1) {
        console.log(`${idx + 1}. ${group.name.toUpperCase()}`);
        console.log(`   ⚠️  CRITICAL: Same Chartmetric ID (${chartmetricIds[0]})`);
        console.log(`   → These ${group.contactCount} contacts are definitely duplicates`);
        console.log(`   → Recommend merging into oldest contact: ${group.contacts.sort((a, b) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )[0].contactId}`);
        console.log("");
      } else {
        console.log(`${idx + 1}. ${group.name.toUpperCase()}`);
        console.log(`   ℹ️  Different Chartmetric IDs: ${chartmetricIds.join(', ')}`);
        console.log(`   → May be different people or same person with multiple profiles`);
        console.log(`   → Manual review recommended`);
        console.log("");
      }
    });
  }
}

// Run the audit
auditDuplicateContacts()
  .then(() => {
    console.log("✅ Audit complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Audit failed:", error);
    process.exit(1);
  });
