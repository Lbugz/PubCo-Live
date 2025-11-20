/**
 * Audit Contact Names - Identify incorrectly parsed concatenated names
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

interface ConcatenatedNameIssue {
  contactId: string;
  songwriterId: string;
  name: string;
  issue: string;
  suggestedFix: string[];
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Improved name splitting logic that detects concatenated names
 */
function detectAndSplitConcatenatedNames(fullName: string): string[] {
  if (!fullName || typeof fullName !== 'string') return [];
  
  const trimmed = fullName.trim();
  
  // Pattern 1: Detect lowercase-to-uppercase transitions (e.g., "GloverLudwig")
  // But be careful about names like "McDonald", "McGuinness", "MacRae", "O'Brien", "St.Clair", etc.
  const transitions: number[] = [];
  for (let i = 1; i < trimmed.length; i++) {
    const prevChar = trimmed[i - 1];
    const currChar = trimmed[i];
    
    // Detect transition from lowercase to uppercase
    if (/[a-z]/.test(prevChar) && /[A-Z]/.test(currChar)) {
      // Look back to find the start of the current word to check for surname patterns
      let wordStart = i;
      while (wordStart > 0 && /[a-zA-Z']/.test(trimmed[wordStart - 1])) {
        wordStart--;
      }
      
      const currentWord = trimmed.substring(wordStart, i + 1);
      
      // Common surname patterns to preserve (checking the full word context):
      // - Mc + Name (McGuinness, McDonald, McRae)
      // - Mac + Name (MacRae, MacLeod, MacDonald) 
      // - O' + Name (O'Brien, O'Connor)
      // - St. + Name (St.Clair, St.John)
      const isMcPattern = /^Mc[A-Z][a-z]+$/.test(currentWord);
      const isMacPattern = /^Mac[A-Z][a-z]+$/.test(currentWord);
      const isOPattern = /^O'[A-Z][a-z]+$/.test(currentWord);
      const isStPattern = /^St\.[A-Z][a-z]+$/.test(currentWord);
      const isVanPattern = /^Van[A-Z][a-z]+$/.test(currentWord);
      const isDePattern = /^De[A-Z][a-z]+$/.test(currentWord) || /^De [A-Z][a-z]+$/.test(currentWord);
      const isVonPattern = /^Von[A-Z][a-z]+$/.test(currentWord);
      const isLaPattern = /^La[A-Z][a-z]+$/.test(currentWord);
      const isLePattern = /^Le[A-Z][a-z]+$/.test(currentWord);
      
      const isMultiPartSurname = isMcPattern || isMacPattern || isOPattern || isStPattern ||
                                  isVanPattern || isDePattern || isVonPattern || isLaPattern || isLePattern;
      
      if (!isMultiPartSurname) {
        transitions.push(i);
      }
    }
  }
  
  // If we have 2+ transitions, likely concatenated names
  if (transitions.length >= 2) {
    const names: string[] = [];
    let startIdx = 0;
    
    for (const transitionIdx of transitions) {
      const segment = trimmed.substring(startIdx, transitionIdx).trim();
      if (segment.length > 2) {  // Minimum name length
        names.push(segment);
      }
      startIdx = transitionIdx;
    }
    
    // Add the last segment
    const lastSegment = trimmed.substring(startIdx).trim();
    if (lastSegment.length > 2) {
      names.push(lastSegment);
    }
    
    // Validate: each name should have at least one space or be a single word
    const allValid = names.every(name => 
      name.includes(' ') || /^[A-Z][a-z]+$/.test(name)
    );
    
    if (allValid && names.length >= 2) {
      return names;
    }
  }
  
  // Pattern 2: Detect multiple capital-case words without spaces
  // (e.g., "AlexJones" -> "Alex Jones" is actually one name, but "AlexJonesKendall" is multiple)
  const wordPattern = /[A-Z][a-z]+/g;
  const words = trimmed.match(wordPattern) || [];
  
  // If we have 4+ capital-case words with no spaces, likely concatenated
  if (words.length >= 4 && !trimmed.includes(' ')) {
    // Group words into names (heuristic: 2-3 words per name)
    const names: string[] = [];
    let currentName: string[] = [];
    
    for (let i = 0; i < words.length; i++) {
      currentName.push(words[i]);
      
      // Split after 2-3 words, or at the end
      if (currentName.length >= 2 && (i === words.length - 1 || currentName.length === 3)) {
        names.push(currentName.join(' '));
        currentName = [];
      }
    }
    
    // Add any remaining words
    if (currentName.length > 0) {
      names.push(currentName.join(' '));
    }
    
    if (names.length >= 2) {
      return names;
    }
  }
  
  // Pattern 3: Look for Roman numerals (II, III, IV) followed by capital letter
  // (e.g., "Glover IILudwig")
  const romanPattern = /\s+(II|III|IV|V|VI)\s*([A-Z])/g;
  const romanMatches = Array.from(trimmed.matchAll(romanPattern));
  
  if (romanMatches.length > 0) {
    const names: string[] = [];
    let lastIdx = 0;
    
    for (const match of romanMatches) {
      const matchIdx = match.index!;
      const romanNumeral = match[1];
      
      // Split at the position after the roman numeral
      const splitIdx = matchIdx + romanNumeral.length + (match[0].includes(' ') ? match[0].lastIndexOf(' ') + 1 : romanNumeral.length);
      
      const name1 = trimmed.substring(lastIdx, splitIdx).trim();
      if (name1.length > 2) {
        names.push(name1);
      }
      
      lastIdx = splitIdx;
    }
    
    // Add remaining text
    const lastPart = trimmed.substring(lastIdx).trim();
    if (lastPart.length > 2) {
      names.push(lastPart);
    }
    
    if (names.length >= 2) {
      return names;
    }
  }
  
  // No concatenation detected
  return [trimmed];
}

/**
 * Check if a name is likely concatenated
 */
function isConcatenated(name: string): { concatenated: boolean; confidence: 'high' | 'medium' | 'low'; reason: string } {
  const trimmed = name.trim();
  
  // Skip if it has commas or semicolons (already separated)
  if (/[,;]/.test(trimmed)) {
    return { concatenated: false, confidence: 'high', reason: 'Contains separators' };
  }
  
  // Count lowercase-to-uppercase transitions (excluding Mc/Mac patterns)
  let transitions = 0;
  for (let i = 1; i < trimmed.length; i++) {
    if (/[a-z]/.test(trimmed[i - 1]) && /[A-Z]/.test(trimmed[i])) {
      // Check if this might be a "Mc" or "Mac" pattern
      const twoCharsBefore = i >= 2 ? trimmed.substring(i - 2, i) : '';
      const isMcPattern = /Mc|Ma/.test(twoCharsBefore) && twoCharsBefore[0] === 'M';
      
      if (!isMcPattern) {
        transitions++;
      }
    }
  }
  
  // High confidence: 4+ transitions (e.g., "AlexJonesKendallQuarles...")
  if (transitions >= 4) {
    return { concatenated: true, confidence: 'high', reason: `${transitions} lowercase-to-uppercase transitions (likely multiple names)` };
  }
  
  // High confidence: 3+ transitions and long enough (>30 chars)
  if (transitions >= 3 && trimmed.length > 30) {
    return { concatenated: true, confidence: 'high', reason: `${transitions} transitions, length ${trimmed.length} chars` };
  }
  
  // High confidence: 2+ transitions and very long (>50 chars)
  if (transitions >= 2 && trimmed.length > 50) {
    return { concatenated: true, confidence: 'high', reason: `${transitions} transitions, length ${trimmed.length} chars (very long)` };
  }
  
  // Medium confidence: Roman numeral followed by capital letter (e.g., "Glover IILudwig")
  if (/\s+(II|III|IV|V)\s*[A-Z]/.test(trimmed)) {
    return { concatenated: true, confidence: 'medium', reason: 'Roman numeral followed by capital letter (missing space)' };
  }
  
  // Medium confidence: 6+ capital-case words without enough spaces
  const capitalWords = (trimmed.match(/[A-Z][a-z]+/g) || []).length;
  const spaces = (trimmed.match(/ /g) || []).length;
  if (capitalWords >= 6 && spaces < capitalWords - 3) {
    return { concatenated: true, confidence: 'high', reason: `${capitalWords} capital words with only ${spaces} spaces` };
  }
  
  // Medium confidence: 5 capital words with suspiciously few spaces
  if (capitalWords >= 5 && spaces < 2) {
    return { concatenated: true, confidence: 'medium', reason: `${capitalWords} capital words with only ${spaces} spaces` };
  }
  
  return { concatenated: false, confidence: 'high', reason: 'No concatenation detected' };
}

async function auditContactNames() {
  console.log("🔍 Starting contact name audit...\n");
  
  try {
    // Query all contacts with their songwriter profile names
    const contactsResult = await db.execute(sql`
      SELECT 
        c.id as contact_id,
        c.songwriter_id,
        sp.name as songwriter_name
      FROM contacts c
      JOIN songwriter_profiles sp ON sp.id = c.songwriter_id
      ORDER BY sp.name
    `);
    
    const contacts = contactsResult.rows as Array<{
      contact_id: string;
      songwriter_id: string;
      songwriter_name: string;
    }>;
    
    console.log(`📊 Analyzing ${contacts.length} contacts...\n`);
    
    const issues: ConcatenatedNameIssue[] = [];
    
    for (const contact of contacts) {
      const { concatenated, confidence, reason } = isConcatenated(contact.songwriter_name);
      
      if (concatenated) {
        const suggestedFix = detectAndSplitConcatenatedNames(contact.songwriter_name);
        
        issues.push({
          contactId: contact.contact_id,
          songwriterId: contact.songwriter_id,
          name: contact.songwriter_name,
          issue: reason,
          suggestedFix,
          confidence,
        });
      }
    }
    
    // Sort by confidence level
    const sorted = issues.sort((a, b) => {
      const confidenceOrder = { high: 0, medium: 1, low: 2 };
      return confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
    });
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🚨 AUDIT RESULTS: Found ${issues.length} contacts with concatenated names`);
    console.log(`${'='.repeat(80)}\n`);
    
    // Group by confidence
    const highConfidence = sorted.filter(i => i.confidence === 'high');
    const mediumConfidence = sorted.filter(i => i.confidence === 'medium');
    const lowConfidence = sorted.filter(i => i.confidence === 'low');
    
    if (highConfidence.length > 0) {
      console.log(`\n⚠️  HIGH CONFIDENCE (${highConfidence.length} issues)\n`);
      highConfidence.slice(0, 20).forEach((issue, idx) => {
        console.log(`${idx + 1}. "${issue.name}"`);
        console.log(`   Issue: ${issue.issue}`);
        console.log(`   Suggested fix: ${issue.suggestedFix.join(' | ')}`);
        console.log(`   Contact ID: ${issue.contactId}\n`);
      });
      
      if (highConfidence.length > 20) {
        console.log(`   ... and ${highConfidence.length - 20} more\n`);
      }
    }
    
    if (mediumConfidence.length > 0) {
      console.log(`\n⚠️  MEDIUM CONFIDENCE (${mediumConfidence.length} issues)\n`);
      mediumConfidence.slice(0, 10).forEach((issue, idx) => {
        console.log(`${idx + 1}. "${issue.name}"`);
        console.log(`   Issue: ${issue.issue}`);
        console.log(`   Suggested fix: ${issue.suggestedFix.join(' | ')}`);
        console.log(`   Contact ID: ${issue.contactId}\n`);
      });
      
      if (mediumConfidence.length > 10) {
        console.log(`   ... and ${mediumConfidence.length - 10} more\n`);
      }
    }
    
    // Write detailed report to file
    const report = {
      timestamp: new Date().toISOString(),
      totalContacts: contacts.length,
      issuesFound: issues.length,
      byConfidence: {
        high: highConfidence.length,
        medium: mediumConfidence.length,
        low: lowConfidence.length,
      },
      issues: sorted,
    };
    
    const fs = await import('fs/promises');
    await fs.writeFile(
      'contact-name-audit-report.json',
      JSON.stringify(report, null, 2)
    );
    
    console.log(`\n📝 Detailed report saved to: contact-name-audit-report.json\n`);
    console.log(`${'='.repeat(80)}\n`);
    
  } catch (error) {
    console.error("❌ Audit failed:", error);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  auditContactNames()
    .then(() => {
      console.log("✅ Audit complete!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Audit failed:", error);
      process.exit(1);
    });
}

export { auditContactNames, detectAndSplitConcatenatedNames, isConcatenated };
