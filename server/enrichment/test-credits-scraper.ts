/**
 * Integration test for Spotify Credits Scraper
 * Tests the scraper against known tracks with visible credits
 * 
 * Usage: tsx server/enrichment/test-credits-scraper.ts
 */

import { scrapeTrackCredits } from './spotifyCreditsScaper';

interface TestCase {
  name: string;
  trackId: string;
  spotifyUrl: string;
  expectedCredits: {
    writers?: string[];
    producers?: string[];
    label?: string;
  };
}

const testCases: TestCase[] = [
  {
    name: 'Dijon - coogie',
    trackId: '0lYBOzRzafcbqnPyPSvNTW',
    spotifyUrl: 'https://open.spotify.com/track/0lYBOzRzafcbqnPyPSvNTW',
    expectedCredits: {
      writers: ['Andrew Sarlo', 'Dijon Duenas', 'Michael Gordon'],
      producers: ['Andrew Sarlo'],
    },
  },
];

async function runTest(testCase: TestCase): Promise<boolean> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${testCase.name}`);
  console.log(`Track ID: ${testCase.trackId}`);
  console.log(`URL: ${testCase.spotifyUrl}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    const result = await scrapeTrackCredits(testCase.trackId, testCase.spotifyUrl);

    console.log('\n📊 Scraper Results:');
    console.log('  Songwriter:', result.songwriter || '(none)');
    console.log('  Producer:', result.producer || '(none)');
    console.log('  Publisher:', result.publisher || '(none)');
    console.log('  Label:', result.label || '(none)');
    console.log('  Spotify Streams:', result.spotifyStreams?.toLocaleString() || '(none)');

    // Validate results
    let passed = true;
    const issues: string[] = [];

    if (testCase.expectedCredits.writers) {
      const actualWriters = result.songwriter?.split(', ') || [];
      const missingWriters = testCase.expectedCredits.writers.filter(
        (w) => !actualWriters.some((aw) => aw.toLowerCase().includes(w.toLowerCase()))
      );
      
      if (missingWriters.length > 0) {
        passed = false;
        issues.push(`Missing writers: ${missingWriters.join(', ')}`);
      }
    }

    if (testCase.expectedCredits.producers) {
      const actualProducers = result.producer?.split(', ') || [];
      const missingProducers = testCase.expectedCredits.producers.filter(
        (p) => !actualProducers.some((ap) => ap.toLowerCase().includes(p.toLowerCase()))
      );
      
      if (missingProducers.length > 0) {
        passed = false;
        issues.push(`Missing producers: ${missingProducers.join(', ')}`);
      }
    }

    if (testCase.expectedCredits.label) {
      if (!result.label || !result.label.toLowerCase().includes(testCase.expectedCredits.label.toLowerCase())) {
        passed = false;
        issues.push(`Expected label containing "${testCase.expectedCredits.label}", got "${result.label}"`);
      }
    }

    console.log(`\n${passed ? '✅ PASSED' : '❌ FAILED'}`);
    if (issues.length > 0) {
      console.log('\nIssues:');
      issues.forEach((issue) => console.log(`  - ${issue}`));
    }

    return passed;
  } catch (error: any) {
    console.error('\n❌ Test failed with error:');
    console.error(error.message);
    console.error(error.stack);
    return false;
  }
}

async function main() {
  console.log('🧪 Spotify Credits Scraper Integration Tests');
  console.log('Testing against tracks with known credits\n');

  const results = await Promise.all(testCases.map(runTest));
  
  const totalTests = results.length;
  const passedTests = results.filter(Boolean).length;
  const failedTests = totalTests - passedTests;

  console.log(`\n${'='.repeat(60)}`);
  console.log('📈 Test Summary');
  console.log(`${'='.repeat(60)}`);
  console.log(`Total: ${totalTests}`);
  console.log(`Passed: ${passedTests} ✅`);
  console.log(`Failed: ${failedTests} ${failedTests > 0 ? '❌' : ''}`);
  console.log(`${'='.repeat(60)}\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
