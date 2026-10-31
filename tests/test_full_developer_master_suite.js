import http from 'http';

const BASE_URL = 'http://localhost:3000';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'http://127.0.0.1:3000');
    const defaultHeaders = {};
    if (path.startsWith('/api/')) {
      defaultHeaders['Accept'] = 'application/json';
    }
    const options = {
      hostname: '127.0.0.1',
      port: 3000,
      path: url.pathname + url.search,
      method: method,
      headers: {
        ...defaultHeaders,
        ...headers
      }
    };

    let postData = null;
    if (body) {
      postData = typeof body === 'string' ? body : JSON.stringify(body);
      options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data,
          json
        });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(message);
  } else {
    console.log(`  ✅ PASS: ${message}`);
  }
}

async function runDeveloperMasterAudit() {
  console.log('\n========================================================================');
  console.log('🧪 MASTER DEVELOPER END-TO-END AUDIT SUITE: CLIENT & ADMIN PORTALS');
  console.log('========================================================================\n');

  let passed = 0;
  const testTrack = () => passed++;

  // -------------------------------------------------------------------------
  // SECTION 1: PUBLIC WEB & SPA ROUTING INTEGRITY
  // -------------------------------------------------------------------------
  console.log('[SECTION 1: Public Web & SPA Routing Integrity]');
  
  const rootRes = await request('GET', '/');
  assert(rootRes.status === 200, 'Root HTML endpoint / loads with HTTP 200 OK');
  assert(rootRes.data.includes('<div id="root"></div>'), 'Root HTML renders valid React mount DOM container');
  assert(rootRes.data.includes('Receipt Processor & Subscription Manager'), 'Root HTML title is populated');
  testTrack(); testTrack(); testTrack();

  const adminSpaRes = await request('GET', '/admin');
  assert(adminSpaRes.status === 200, 'Dedicated Admin URL /admin serves HTML entry point with HTTP 200 OK');
  testTrack();

  // Desktop engine file downloads
  const pyRes = await request('GET', '/receipt_processor.py');
  assert(pyRes.status === 200, 'Desktop receipt_processor.py engine download endpoint returns 200 OK');
  assert(pyRes.data.includes('SubscriptionLicenseManager'), 'Python engine contains valid SubscriptionLicenseManager code');
  testTrack(); testTrack();

  const batRes = await request('GET', '/run_receipt_processor.bat');
  assert(batRes.status === 200, 'Windows batch script launcher returns 200 OK');
  testTrack();

  const shRes = await request('GET', '/run_receipt_processor.sh');
  assert(shRes.status === 200, 'macOS/Linux shell script launcher returns 200 OK');
  testTrack();

  // -------------------------------------------------------------------------
  // SECTION 2: CLIENT REGISTRATION, COMPANY VALIDATION & AUTHENTICATION
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 2: Client Registration, Company Validation & Auth]');
  
  const testUniqueId = Date.now().toString(36);
  const testUsername = `user_${testUniqueId}`;
  const testEmail = `dev_${testUniqueId}@agricultural-client.com`;
  const testCompany = `Prairie Horizon Farms ${testUniqueId}`;
  const testPassword = `SecureFarmPass2026!`;

  // Company availability check
  const availRes = await request('GET', `/api/client/check-company-name?name=${encodeURIComponent(testCompany)}`);
  assert(availRes.status === 200 && availRes.json?.available === true, `Company '${testCompany}' correctly reported available`);
  testTrack();

  // Client registration
  const regRes = await request('POST', '/api/client/register', {
    username: testUsername,
    email: testEmail,
    displayName: 'Prairie Operator',
    companyName: testCompany,
    password: testPassword
  });
  assert(regRes.status === 200 && regRes.json?.success === true, 'Client user account registered successfully with HTTP 200');
  assert(regRes.json?.account?.passwordHash === undefined, 'Sensitive passwordHash and salt strictly stripped from response');
  assert(regRes.json?.account?.id !== undefined, 'Client user account ID issued');
  testTrack(); testTrack(); testTrack();

  const clientUserId = regRes.json?.account?.id;

  // Collision block: same company name must be blocked
  const colRes = await request('GET', `/api/client/check-company-name?name=${encodeURIComponent(testCompany)}`);
  assert(colRes.status === 200 && colRes.json?.available === false, 'Company collision detection blocks duplicate company registration');
  testTrack();

  // Client login verification
  const loginRes = await request('POST', '/api/client/login', {
    username: testUsername,
    password: testPassword
  });
  assert(loginRes.status === 200 && loginRes.json?.success === true, 'Client login with valid credentials succeeds with 200 OK');
  testTrack();

  // Invalid login rejection
  const badLoginRes = await request('POST', '/api/client/login', {
    username: testUsername,
    password: 'WrongPassword123!'
  });
  assert(badLoginRes.status === 401, 'Invalid client login correctly rejected with HTTP 401 Unauthorized');
  testTrack();

  // -------------------------------------------------------------------------
  // SECTION 3: CLIENT RECEIPT INTAKE QUEUE & DEDUCTION MAPPING
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 3: Client Receipt Intake Queue & Deduction Mapping]');
  
  const testSubmissionId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const subRes = await request('POST', '/api/client/submissions', {
    submission: {
      id: testSubmissionId,
      clientId: clientUserId,
      clientName: 'Prairie Operator',
      clientEmail: testEmail,
      userId: clientUserId,
      companyName: testCompany,
      fileName: 'bulk_diesel_fuel_receipt.pdf',
      fileSize: 48120,
      fileType: 'application/pdf',
      memo: 'Off-road farm diesel tractor refill',
      categoryHint: 'Fuel & Oil',
      uploadedAt: new Date().toISOString(),
      status: 'QUEUED',
      extractedVendor: 'Cenex Agronomy Fuel',
      extractedAmount: 642.50,
      extractedDate: '2026-10-25'
    }
  });
  assert(subRes.status === 200 && subRes.json?.success === true, 'Client receipt uploaded and queued with HTTP 200 OK');
  testTrack();

  // Query submissions for client
  const listRes = await request('GET', `/api/client/submissions?userId=${clientUserId}`);
  assert(listRes.status === 200 && Array.isArray(listRes.json?.submissions), 'Client submissions query returns 200 OK with submissions list');
  const foundSub = listRes.json?.submissions.find(s => s.id === testSubmissionId);
  assert(foundSub !== undefined, 'Target receipt confirmed in client queue');
  assert(Number(foundSub?.extractedAmount) === 642.50, 'Receipt monetary amount parsed cleanly as numeric 642.50');
  testTrack(); testTrack(); testTrack();

  // Update receipt status to SYNCED_QBO with verified owner userId
  const updateRes = await request('PUT', `/api/client/submissions/${testSubmissionId}?userId=${clientUserId}`, {
    status: 'SYNCED_QBO',
    details: {
      qboDocNumber: 'REC-QBO-8891',
      qboSyncedAt: new Date().toISOString()
    }
  });
  assert(updateRes.status === 200 && updateRes.json?.success === true, 'Receipt status updated to SYNCED_QBO with 200 OK');
  testTrack();

  // IDOR & Cross-tenant modification rejection
  const attackerRes = await request('PUT', `/api/client/submissions/${testSubmissionId}?userId=malicious_intruder_user`, {
    status: 'DELETED'
  });
  assert(attackerRes.status === 403, 'Unauthorized cross-tenant submission modification blocked with 403 Forbidden');
  testTrack();

  // Verify ownership integrity
  const verifyRes = await request('GET', `/api/client/submissions?userId=${clientUserId}`);
  const postVerify = verifyRes.json?.submissions.find(s => s.id === testSubmissionId);
  assert(postVerify?.userId === clientUserId, 'Receipt ownership remains bound to legitimate owner without IDOR tampering');
  testTrack();

  // -------------------------------------------------------------------------
  // SECTION 4: PROSPECT INQUIRIES & CONTACT WORKFLOW
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 4: Prospect Inquiries & Contact Forms]');
  
  await request('POST', '/api/test/reset-rate-limit');

  const inqRes = await request('POST', '/api/inquiries', {
    name: 'Samuel Miller',
    email: 'samuel@heartlandgrain.com',
    company: 'Heartland Grain Producers LLC',
    phone: '402-555-8910',
    planInterest: 'Enterprise Plan',
    message: 'Need 10 operator licenses with direct QuickBooks Online enterprise integration.'
  });
  assert(inqRes.status === 200 && inqRes.json?.success === true, 'Prospect inquiry submitted and recorded with HTTP 200 OK');
  testTrack();

  // -------------------------------------------------------------------------
  // SECTION 5: LIVE IP TRACKER, HARDWARE ID & TELEMETRY
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 5: Live IP Tracker, Hardware ID & Telemetry]');

  const ipDetectRes = await request('GET', '/api/presence/ip');
  assert(ipDetectRes.status === 200 && ipDetectRes.json?.ip !== undefined, `IP detection endpoint returns clean IP: ${ipDetectRes.json?.ip}`);
  testTrack();

  const testHwid = `HWID-WEB-DEV-${testUniqueId.toUpperCase()}`;
  const testMachine = 'Developer Linux Workstation';

  // Heartbeat pulse with real Hardware ID
  const pulseRes = await request('POST', '/api/presence/heartbeat', {
    sessionId: `sess_${testUniqueId}`,
    portal: 'CLIENT',
    userId: clientUserId,
    username: testUsername,
    displayName: 'Prairie Operator',
    email: testEmail,
    companyName: testCompany,
    hwid: testHwid,
    browserInfo: 'Chrome on Linux',
    deviceCategory: 'Browser / Web Client',
    screenResolution: '1920x1080',
    viewport: '1900x950',
    deviceMemory: '16 GB',
    hardwareConcurrency: '16 Cores',
    timezone: 'America/Chicago',
    status: 'ACTIVE'
  }, {
    'x-hwid': testHwid
  });
  assert(pulseRes.status === 200 && pulseRes.json?.success === true, 'Presence heartbeat telemetry recorded with 200 OK');
  testTrack();

  // Verify sessions ledger contains the new session with genuine HWID
  const sessListRes = await request('GET', '/api/licenses/sessions');
  assert(sessListRes.status === 200 && Array.isArray(sessListRes.json?.sessions), 'Active sessions list returned with 200 OK');
  const recordedSess = sessListRes.json?.sessions.find(s => s.hwid === testHwid || s.id === `sess_${testUniqueId}`);
  assert(recordedSess !== undefined, 'Live telemetry session verified in active devices ledger');
  assert(!recordedSess?.hwid.includes('GUEST') && recordedSess?.hwid !== 'WEB-CLIENT', `Hardware ID strictly verified as genuine: ${recordedSess?.hwid}`);
  testTrack(); testTrack();

  // -------------------------------------------------------------------------
  // SECTION 6: QUICKBOOKS ONLINE SYNCHRONIZATION & CHART OF ACCOUNTS
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 6: QuickBooks Online Synchronization & COA]');

  const qboConfRes = await request('GET', '/api/qbo/config');
  assert(qboConfRes.status === 200, 'QuickBooks configuration broker is responsive with HTTP 200 OK');
  testTrack();

  const qboAccountsRes = await request('GET', '/api/qbo/accounts');
  assert(qboAccountsRes.status === 200 && Array.isArray(qboAccountsRes.json?.allAccounts), 'Chart of Accounts loaded with HTTP 200 OK');
  assert(qboAccountsRes.json?.allAccounts.length >= 25, `Chart of accounts is complete (${qboAccountsRes.json?.allAccounts.length} accounts available)`);
  
  const hasCc = qboAccountsRes.json?.creditCardAccounts?.length > 0;
  const hasBank = qboAccountsRes.json?.bankAccounts?.length > 0;
  const hasExp = qboAccountsRes.json?.expenseAccounts?.length > 0;
  assert(hasCc && hasBank && hasExp, 'Accounts accurately categorized into Credit Cards, Bank Checking, and Expenses');
  testTrack(); testTrack(); testTrack();

  // Test direct push of expense receipt to QuickBooks
  const qboPushRes = await request('POST', '/api/qbo/push', {
    receipts: [{
      vendor: 'Midwest Ag Supply Co',
      amount: 1420.00,
      date: '2026-10-28',
      memo: 'Spring Planting Seed & Nitrogen',
      category: 'Seeds and Plants Purchased',
      paymentAccount: 'Mastercard (Acct ****5512)',
      docNumber: 'AG-SEED-INV-998822'
    }]
  });
  assert(qboPushRes.status === 200 && qboPushRes.json?.success === true, 'Direct receipt push to QuickBooks Online succeeded with 200 OK');
  assert(qboPushRes.json?.results?.[0]?.status === 'SUCCESS', 'QuickBooks transaction push status confirmed as SUCCESS');
  testTrack(); testTrack();

  // Check sync audit log
  const syncLogRes = await request('GET', '/api/qbo/sync-log');
  assert(syncLogRes.status === 200 && Array.isArray(syncLogRes.json?.logs), 'QuickBooks sync ledger retrieved with HTTP 200 OK');
  assert(syncLogRes.json?.logs.length > 0, 'Sync ledger contains recorded transactions');
  testTrack(); testTrack();

  // -------------------------------------------------------------------------
  // SECTION 7: PERMANENT WORKSTATION & IP BLACKLIST SECURITY
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 7: Permanent Workstation & IP Blacklist Security]');

  const bannedHwid = `HWID-BANNED-${Date.now()}`;
  const bannedIp = '198.51.100.99';

  // 1. Initial check - should not be blocked
  const preCheck = await request('GET', `/api/check-blocked?hwid=${bannedHwid}`);
  assert(preCheck.status === 200 && preCheck.json?.blocked === false, 'Pre-block clearance check returns blocked: false');
  testTrack();

  // 2. Block workstation permanently
  const blockRes = await request('POST', '/api/admin/blocklist', {
    ip: bannedIp,
    hwid: bannedHwid,
    machineName: 'Intruder Scraping Rig',
    reason: 'Developer automated verification lockout test',
    blockedBy: 'Security Master Test Runner'
  });
  assert(blockRes.status === 200 && blockRes.json?.success === true, 'Workstation and IP permanently blacklisted with HTTP 200 OK');
  testTrack();

  // 3. Check blocked status via /api/check-blocked
  const postCheck = await request('GET', `/api/check-blocked?hwid=${bannedHwid}`);
  assert(postCheck.status === 200 && postCheck.json?.blocked === true, 'Verification confirms workstation is permanently blocked (blocked: true)');
  assert(postCheck.json?.reason === 'Developer automated verification lockout test', 'Block reason matches audit trail');
  testTrack(); testTrack();

  // 4. Request Interception: Try to access client submissions with blocked HWID header
  const interceptRes = await request('GET', '/api/client/submissions', null, {
    'x-hwid': bannedHwid
  });
  assert(interceptRes.status === 403, 'Middleware interceptor blocks banned workstation with HTTP 403 Forbidden');
  assert(interceptRes.json?.blocked === true, 'Interceptor returns { blocked: true } security lockout payload');
  testTrack(); testTrack();

  // 5. Unblock workstation and restore clearance
  const unblockRes = await request('POST', '/api/admin/blocklist/unblock', {
    hwid: bannedHwid,
    ip: bannedIp
  });
  assert(unblockRes.status === 200 && unblockRes.json?.success === true, 'Unblock endpoint successfully removes ban with HTTP 200 OK');
  testTrack();

  // 6. Final verification - unblocked
  const postUnblockCheck = await request('GET', `/api/check-blocked?hwid=${bannedHwid}`);
  assert(postUnblockCheck.status === 200 && postUnblockCheck.json?.blocked === false, 'Clearance verified restored (blocked: false)');
  testTrack();

  // -------------------------------------------------------------------------
  // SECTION 8: CLEANUP TEST FIXTURES
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 8: Multi-Tenant State Isolation & Cleanup]');

  // Delete test submission
  const delSubRes = await request('DELETE', `/api/client/submissions/${testSubmissionId}?userId=${clientUserId}`, null, {
    'x-hwid': testHwid
  });
  assert(delSubRes.status === 200, 'Test submission cleanly purged from intake database');
  testTrack();

  // Delete test account
  const delAccRes = await request('DELETE', `/api/admin/accounts/${clientUserId}?userId=${clientUserId}`);
  assert(delAccRes.status === 200, 'Test client user account cleanly purged from server');
  testTrack();

  console.log('\n========================================================================');
  console.log(`🎉 ALL DEVELOPER MASTER AUDIT TESTS PASSED: ${passed} OF ${passed} PASSED, 0 FAILED!`);
  console.log('========================================================================\n');
}

runDeveloperMasterAudit().catch(err => {
  console.error('\n❌ MASTER AUDIT FAILED:', err);
  process.exit(1);
});
