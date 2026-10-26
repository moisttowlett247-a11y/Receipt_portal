// Comprehensive Security & Multi-Tenant E2E Test Suite
// Verifies:
// 1. Company Name Collision Prevention across registration & QBO connections
// 2. Normalization resilience (punctuation, spaces, casing)
// 3. Tenant Isolation on receipt queries, modifications, and deletions
// 4. QuickBooks owner permission validation

import http from 'http';

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runSecurityTests() {
  console.log('================================================================');
  console.log('🔒 RUNNING QUICKBOOKS & COMPANY MULTI-TENANT SECURITY TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} - ${details}`);
      failed++;
    }
  }

  try {
    const timestamp = Date.now();
    const companyA = `Apex Agronomy Holdings ${timestamp}`;
    const userA = `user_a_${timestamp}`;
    const emailA = `usera_${timestamp}@testenterprise.com`;

    const userB = `user_b_${timestamp}`;
    const emailB = `userb_${timestamp}@testenterprise.com`;

    // Phase 1: Real-time company availability endpoint
    console.log('[Phase 1: Real-Time Company Name Availability Check]');
    const checkFree = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: `/api/client/check-company-name?name=${encodeURIComponent(companyA)}`,
      method: 'GET'
    });
    assert(checkFree.status === 200 && checkFree.data.available === true, 'Untaken company name is available');

    // Phase 2: Register User A with companyA
    console.log('\n[Phase 2: Account Registration & Company Name Claiming]');
    const regResA = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/client/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      username: userA,
      password: 'SecurePassword123!',
      email: emailA,
      displayName: 'Alice Agronomist',
      companyName: companyA
    });
    assert(regResA.status === 200 && regResA.data.success, 'User A registered successfully with company');
    const userAId = regResA.data.account?.id;
    assert(Boolean(userAId), 'User A received account ID');

    // Phase 3: Collision Prevention for User B (Case, Punctuation, Whitespace normalized)
    console.log('\n[Phase 3: Company Name Collision Prevention on Account Registration]');
    const spoofVariation = `  apex agronomy holdings, ${timestamp}  `;
    const checkSpoof = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: `/api/client/check-company-name?name=${encodeURIComponent(spoofVariation)}`,
      method: 'GET'
    });
    assert(checkSpoof.status === 200 && checkSpoof.data.available === false, 'Normalized variation detected as already taken');

    const regResB = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/client/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      username: userB,
      password: 'SecurePassword123!',
      email: emailB,
      displayName: 'Bob BadActor',
      companyName: spoofVariation
    });
    assert(regResB.status === 409 && regResB.data.success === false, 'User B rejected with 409 Conflict when attempting to use taken company name');
    assert(regResB.data.error.includes('already registered'), 'Error message states company name is already registered');

    // Register User B with a legitimate unique company
    const companyB = `Beacon Ranching Co ${timestamp}`;
    const regResBLegit = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/client/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      username: userB,
      password: 'SecurePassword123!',
      email: emailB,
      displayName: 'Bob Rancher',
      companyName: companyB
    });
    assert(regResBLegit.status === 200 && regResBLegit.data.success, 'User B successfully registers with unique company');
    const userBId = regResBLegit.data.account?.id;

    // Phase 4: QuickBooks Connection Security & Collision Prevention
    console.log('\n[Phase 4: QuickBooks Connection Security & Cross-Tenant Protection]');
    const realmB = `9876543${Math.floor(1000 + Math.random() * 9000)}`;

    // Bad actor User B tries to connect a QBO company under User A's company name
    const qboSpoofConnect = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/qbo/mock-connect',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      realmId: realmB,
      companyName: companyA,
      userId: userBId,
      email: emailB
    });
    assert(qboSpoofConnect.status === 409 && qboSpoofConnect.data.success === false, 'QBO connection blocked with 409 Conflict when trying to hijack User A company name');

    // User A connects their QBO company legitimately
    const realmA = `9123456${Math.floor(1000 + Math.random() * 9000)}`;
    const qboLegitConnectA = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/qbo/mock-connect',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      realmId: realmA,
      companyName: companyA,
      userId: userAId,
      email: emailA
    });
    assert(qboLegitConnectA.status === 200 && qboLegitConnectA.data.success, 'User A connects QBO company successfully');

    // Bad actor User B tries to modify User A's QBO company default account
    const qboUnauthorizedModify = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/qbo/company/set-default-account',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      realmId: realmA,
      defaultPostingAccount: 'Mastercard',
      userId: userBId
    });
    assert(qboUnauthorizedModify.status === 403, 'Unauthorized user blocked with 403 Forbidden when trying to modify User A QBO company');

    // Phase 5: Tenant Isolation for Receipt Submissions
    console.log('\n[Phase 5: Receipt Submission Tenant Isolation & Protection]');
    const subAId = `sub-a-${timestamp}`;
    const subResA = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/client/submissions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      id: subAId,
      fileName: 'Seed_Corn_Invoice_Spring_2026.pdf',
      vendor: 'Pioneer Hi-Bred Seed',
      total: 3450.00,
      userId: userAId,
      companyName: companyA,
      clientEmail: emailA
    });
    assert(subResA.status === 200 && subResA.data.success, 'User A submits receipt successfully');

    // Bad Actor User B attempts to inject receipt pretending to be User A's company
    const spoofSubmission = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/client/submissions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      id: `sub-spoof-${timestamp}`,
      fileName: 'Malicious_Receipt.pdf',
      vendor: 'Bogus Hardware',
      total: 999.00,
      userId: userBId,
      companyName: companyA // Belongs to User A!
    });
    assert(spoofSubmission.status === 409, 'Blocked receipt submission attempting to spoof another user company name (409 Conflict)');

    // Bad Actor User B attempts to inject receipt directly into User A's QBO realm
    const realmInjectionSubmission = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/client/submissions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      id: `sub-inj-${timestamp}`,
      fileName: 'Sneak_Expense.pdf',
      vendor: 'Sneaky Vendor',
      total: 150.00,
      userId: userBId,
      realmId: realmA // User A's realm!
    });
    assert(realmInjectionSubmission.status === 403, 'Blocked cross-tenant receipt submission into another user QBO realm (403 Forbidden)');

    // Query Submissions: User B should NOT see User A's submissions
    const listResB = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: `/api/client/submissions?userId=${userBId}`,
      method: 'GET'
    });
    assert(listResB.status === 200, 'User B queried submissions');
    const bFoundA = listResB.data.submissions.some(s => s.id === subAId || s.userId === userAId);
    assert(!bFoundA, "User B's submission query correctly does NOT contain User A's receipts (Tenant Isolation Verified)");

    // Query Submissions: User A sees their own submission
    const listResA = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: `/api/client/submissions?userId=${userAId}`,
      method: 'GET'
    });
    assert(listResA.status === 200, 'User A queried submissions');
    const aFoundA = listResA.data.submissions.some(s => s.id === subAId);
    assert(aFoundA, "User A successfully views their own submitted receipts");

    // Cross-tenant Tampering: User B tries to update User A's submission
    const tamperUpdate = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: `/api/client/submissions/${subAId}?userId=${userBId}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    }, {
      status: 'ARCHIVED',
      details: { vendor: 'Hacked Vendor' }
    });
    assert(tamperUpdate.status === 403, 'User B blocked with 403 Forbidden from tampering with User A submission');

    // Cross-tenant Tampering: User B tries to delete User A's submission
    const tamperDelete = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: `/api/client/submissions/${subAId}?userId=${userBId}`,
      method: 'DELETE'
    });
    assert(tamperDelete.status === 403, 'User B blocked with 403 Forbidden from deleting User A submission');

    // Legitimate owner User A updates their submission
    const legitUpdate = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: `/api/client/submissions/${subAId}?userId=${userAId}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    }, {
      status: 'PROCESSING'
    });
    assert(legitUpdate.status === 200 && legitUpdate.data.submission?.status === 'PROCESSING', 'User A successfully updates their own submission');

    // Clean up User A's submission
    const legitDelete = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: `/api/client/submissions/${subAId}?userId=${userAId}`,
      method: 'DELETE'
    });
    assert(legitDelete.status === 200, 'User A successfully deletes their own submission');

  } catch (err) {
    console.error('Unexpected test error:', err);
    failed++;
  }

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityTests();
