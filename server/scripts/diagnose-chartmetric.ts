/**
 * Chartmetric API Diagnostic Tool
 * 
 * Comprehensive testing of all Chartmetric endpoints to identify
 * exactly which endpoints work and which return errors.
 * 
 * Run: tsx server/scripts/diagnose-chartmetric.ts
 */

const BASE_URL = "https://api.chartmetric.com/api";
const API_KEY = process.env.CHARTMETRIC_API_KEY;

interface TestResult {
  phase: string;
  endpoint: string;
  method: string;
  status: number;
  statusText: string;
  success: boolean;
  responseBody?: any;
  responseHeaders?: Record<string, string>;
  error?: string;
  notes?: string;
}

interface DiagnosticReport {
  timestamp: string;
  results: TestResult[];
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    authWorking: boolean;
    publicEndpointsWorking: boolean;
    analyticsEndpointsWorking: boolean;
  };
  recommendations: string[];
}

const results: TestResult[] = [];

// Helper to delay between requests
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to make requests and capture full details
async function testEndpoint(
  phase: string,
  endpoint: string,
  method: string,
  headers: Record<string, string>,
  body?: any
): Promise<TestResult> {
  try {
    const url = `${BASE_URL}${endpoint}`;
    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    console.log(`\n[${phase}] Testing: ${method} ${endpoint}`);
    
    const response = await fetch(url, options);
    const responseText = await response.text();
    
    let responseBody: any;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = responseText;
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const result: TestResult = {
      phase,
      endpoint,
      method,
      status: response.status,
      statusText: response.statusText,
      success: response.ok,
      responseBody,
      responseHeaders,
    };

    if (!response.ok) {
      result.error = typeof responseBody === 'object' ? responseBody.error : responseText;
    }

    console.log(`  Status: ${response.status} ${response.statusText}`);
    if (!response.ok) {
      console.log(`  Error: ${result.error}`);
    }

    return result;
  } catch (error: any) {
    console.log(`  Exception: ${error.message}`);
    return {
      phase,
      endpoint,
      method,
      status: 0,
      statusText: 'Exception',
      success: false,
      error: error.message,
    };
  }
}

async function runDiagnostics(): Promise<DiagnosticReport> {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║   CHARTMETRIC API COMPREHENSIVE DIAGNOSTIC REPORT             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  if (!API_KEY) {
    console.error('❌ CHARTMETRIC_API_KEY not found in environment variables');
    process.exit(1);
  }

  console.log(`API Key Present: YES`);
  console.log(`API Key Length: ${API_KEY.length} characters`);
  console.log(`Base URL: ${BASE_URL}`);

  // =================================================================
  // PHASE 1: Validate Authentication
  // =================================================================
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 1: AUTHENTICATION VALIDATION');
  console.log('='.repeat(70));

  const authResult = await testEndpoint(
    'Phase 1: Auth',
    '/token',
    'POST',
    { 'Content-Type': 'application/json' },
    { refreshtoken: API_KEY }
  );

  results.push(authResult);

  if (!authResult.success || !authResult.responseBody?.token) {
    console.error('\n❌ Authentication failed - cannot continue diagnostics');
    return generateReport();
  }

  const token = authResult.responseBody.token;
  const expiresIn = authResult.responseBody.expires_in;
  
  console.log(`\n✅ Authentication successful`);
  console.log(`   Token: ${token.substring(0, 50)}...`);
  console.log(`   Expires in: ${expiresIn} seconds (${Math.floor(expiresIn / 60)} minutes)`);

  // Check if response contains any secondary tokens
  console.log('\n🔍 Checking for secondary tokens in response...');
  const tokenKeys = Object.keys(authResult.responseBody);
  console.log(`   Keys in auth response: ${tokenKeys.join(', ')}`);
  
  if (authResult.responseBody.refresh_token) {
    console.log(`   ⚠️  Found refresh_token field`);
  }

  await delay(2000);

  // =================================================================
  // PHASE 2: Test Public Endpoints (Should Work)
  // =================================================================
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 2: PUBLIC ENDPOINTS VALIDATION');
  console.log('='.repeat(70));

  const publicEndpoints = [
    { endpoint: '/track/17461916', name: 'Track Metadata' },
    { endpoint: '/track/isrc/USUG12400054/get-ids', name: 'ISRC Lookup' },
    { endpoint: '/search?q=drake&type=playlists&limit=5', name: 'Playlist Search' },
  ];

  for (const test of publicEndpoints) {
    await delay(2000);
    const result = await testEndpoint(
      'Phase 2: Public',
      test.endpoint,
      'GET',
      { 'Authorization': `Bearer ${token}` }
    );
    result.notes = test.name;
    results.push(result);
  }

  // =================================================================
  // PHASE 3: Test Analytics Endpoints (Failing)
  // =================================================================
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 3: ANALYTICS ENDPOINTS (KNOWN FAILURES)');
  console.log('='.repeat(70));

  const analyticsEndpoints = [
    { endpoint: '/track/17461916/spotify/stats', name: 'Track Spotify Stats' },
    { endpoint: '/track/17461916/youtube/stats', name: 'Track YouTube Stats' },
    { endpoint: '/playlist/spotify/37i9dQZF1DXcBWIGoYBM5M/tracks', name: 'Playlist Tracks' },
    { endpoint: '/playlist/4585566', name: 'Playlist Metadata by ID' },
  ];

  for (const test of analyticsEndpoints) {
    await delay(2000);
    const result = await testEndpoint(
      'Phase 3: Analytics',
      test.endpoint,
      'GET',
      { 'Authorization': `Bearer ${token}` }
    );
    result.notes = test.name;
    results.push(result);
  }

  // =================================================================
  // PHASE 4: Test POST Endpoints
  // =================================================================
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 4: POST ENDPOINTS');
  console.log('='.repeat(70));

  await delay(2000);
  const urlConvertResult = await testEndpoint(
    'Phase 4: POST',
    '/playlist/spotify/url',
    'POST',
    {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    { url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M' }
  );
  urlConvertResult.notes = 'Playlist URL Conversion';
  results.push(urlConvertResult);

  // =================================================================
  // PHASE 5: Test Alternative Headers
  // =================================================================
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 5: ALTERNATIVE HEADER COMBINATIONS');
  console.log('='.repeat(70));

  const testEndpointForHeaders = '/track/17461916/spotify/stats';
  
  const headerVariations = [
    {
      name: 'With x-chartmetric-client',
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-chartmetric-client': 'web'
      }
    },
    {
      name: 'With x-client-version',
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-client-version': '1.0.0'
      }
    },
    {
      name: 'With User-Agent',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Mozilla/5.0 (compatible; ChartmetricClient/1.0)'
      }
    },
    {
      name: 'Authorization only (no Content-Type)',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    },
  ];

  for (const variation of headerVariations) {
    await delay(2000);
    const result = await testEndpoint(
      'Phase 5: Headers',
      testEndpointForHeaders,
      'GET',
      variation.headers
    );
    result.notes = variation.name;
    results.push(result);
  }

  // =================================================================
  // PHASE 6: Check Token Structure
  // =================================================================
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 6: TOKEN STRUCTURE ANALYSIS');
  console.log('='.repeat(70));

  console.log('\nAnalyzing JWT token structure...');
  const tokenParts = token.split('.');
  console.log(`  Token has ${tokenParts.length} parts (JWT standard: 3)`);
  
  if (tokenParts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
      console.log('\n  Token Payload:');
      console.log(JSON.stringify(payload, null, 2));
      
      if (payload.scope) {
        console.log(`\n  ⚠️  Token has 'scope' field: ${payload.scope}`);
      }
      if (payload.permissions) {
        console.log(`\n  ⚠️  Token has 'permissions' field: ${JSON.stringify(payload.permissions)}`);
      }
    } catch (e) {
      console.log('  Could not decode token payload');
    }
  }

  // =================================================================
  // Generate Final Report
  // =================================================================
  return generateReport();
}

async function generateReport(): Promise<DiagnosticReport> {
  const summary = {
    totalTests: results.length,
    passed: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    authWorking: results.find(r => r.endpoint === '/token')?.success || false,
    publicEndpointsWorking: results.filter(r => r.phase.includes('Public') && r.success).length > 0,
    analyticsEndpointsWorking: results.filter(r => r.phase.includes('Analytics') && r.success).length > 0,
  };

  const recommendations: string[] = [];

  // Analyze results and generate recommendations
  if (!summary.authWorking) {
    recommendations.push('❌ CRITICAL: Authentication is failing. Verify API key is correct.');
  } else if (summary.publicEndpointsWorking && !summary.analyticsEndpointsWorking) {
    recommendations.push('⚠️  Authentication works, but analytics endpoints return 401');
    recommendations.push('⚠️  Error message indicates "internal API endpoint" restriction');
    recommendations.push('📧 Contact Chartmetric support with this diagnostic report');
    recommendations.push('📧 Ask: "Which endpoints are available to our API tier?"');
  }

  // Check if any header variation worked
  const headerTests = results.filter(r => r.phase.includes('Phase 5'));
  const anyHeaderWorked = headerTests.some(r => r.success);
  
  if (anyHeaderWorked) {
    const workingHeader = headerTests.find(r => r.success);
    recommendations.push(`✅ SOLUTION FOUND: ${workingHeader?.notes} unlocked the endpoint!`);
  } else if (headerTests.length > 0) {
    recommendations.push('⚠️  No alternative header combinations unlocked analytics endpoints');
  }

  // Check for 401s with specific error message
  const has401WithInternalMsg = results.some(r => 
    r.status === 401 && 
    r.error?.includes('internal API endpoint')
  );

  if (has401WithInternalMsg) {
    recommendations.push('🔍 Root Cause: Endpoints are marked as "Chartmetric internal API"');
    recommendations.push('🔍 This suggests tier/permission restrictions, not authentication issues');
  }

  const report: DiagnosticReport = {
    timestamp: new Date().toISOString(),
    results,
    summary,
    recommendations,
  };

  // Print Final Report
  console.log('\n\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    DIAGNOSTIC SUMMARY                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Total Tests Run: ${summary.totalTests}`);
  console.log(`✅ Passed: ${summary.passed}`);
  console.log(`❌ Failed: ${summary.failed}`);
  console.log('');
  console.log(`Authentication: ${summary.authWorking ? '✅ WORKING' : '❌ FAILED'}`);
  console.log(`Public Endpoints: ${summary.publicEndpointsWorking ? '✅ WORKING' : '❌ FAILED'}`);
  console.log(`Analytics Endpoints: ${summary.analyticsEndpointsWorking ? '✅ WORKING' : '❌ FAILED'}`);

  console.log('\n' + '='.repeat(70));
  console.log('RECOMMENDATIONS');
  console.log('='.repeat(70) + '\n');

  recommendations.forEach(rec => console.log(rec));

  console.log('\n' + '='.repeat(70));
  console.log('DETAILED RESULTS BY ENDPOINT');
  console.log('='.repeat(70) + '\n');

  results.forEach((result, index) => {
    console.log(`${index + 1}. [${result.phase}] ${result.method} ${result.endpoint}`);
    console.log(`   ${result.notes || ''}`);
    console.log(`   Status: ${result.status} ${result.statusText}`);
    console.log(`   Result: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    console.log('');
  });

  console.log('\n' + '='.repeat(70));
  console.log('SUPPORT TICKET PACKAGE');
  console.log('='.repeat(70) + '\n');

  console.log('Include this in your Chartmetric support ticket:\n');
  console.log('Subject: API Access Question - 401 Errors on Analytics Endpoints\n');
  console.log('Body:');
  console.log('---');
  console.log('We are experiencing 401 errors on specific Chartmetric API endpoints.');
  console.log('');
  console.log('Working Endpoints (200 OK):');
  results.filter(r => r.success).forEach(r => {
    console.log(`  • ${r.method} ${r.endpoint} - ${r.notes || ''}`);
  });
  console.log('');
  console.log('Failing Endpoints (401 Unauthorized):');
  results.filter(r => r.status === 401).forEach(r => {
    console.log(`  • ${r.method} ${r.endpoint} - ${r.notes || ''}`);
    console.log(`    Error: "${r.error}"`);
  });
  console.log('');
  console.log('Our API key authenticates successfully (/api/token returns 200).');
  console.log('The error message states: "Session token not found or was expired. User is not authorized to access this Chartmetric internal API endpoint."');
  console.log('');
  console.log('Questions:');
  console.log('1. Are these endpoints available to our API tier?');
  console.log('2. If yes, what additional authentication/headers are required?');
  console.log('3. If no, which endpoints should we use for streaming stats and playlist data?');
  console.log('---\n');

  // Save report to file
  const reportPath = 'chartmetric-diagnostic-report.json';
  const fs = await import('fs');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📄 Full diagnostic report saved to: ${reportPath}\n`);

  return report;
}

// Run diagnostics
runDiagnostics().catch(console.error);
