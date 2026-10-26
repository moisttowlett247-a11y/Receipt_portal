import http from 'http';

function makeRequest(options, postData) {
  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ status: 500, error: err.message });
    });

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function run() {
  console.log('========================================================================');
  console.log('🌐 RUNNING COMPREHENSIVE FULL-WEBSITE FUNCTIONALITY AUDIT');
  console.log('========================================================================');

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

  // ---------------------------------------------------------------------------
  // 1. Web Pages, Assets & SPA Routing
  // ---------------------------------------------------------------------------
  console.log('\n[Phase 1: Web Pages, SPA Routing & Static Downloads]');
  
  const rootRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/',
    method: 'GET'
  });
  assert(rootRes.status === 200, 'Root HTML endpoint / loads with 200 OK');
  assert(typeof rootRes.raw === 'string' && rootRes.raw.includes('Receipt Processor & Subscription Manager'), 'Page title and meta tags correctly populated');
  assert(rootRes.raw.includes('id="root"'), 'React mount container present');

  const adminPageRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/admin',
    method: 'GET'
  });
  assert(adminPageRes.status === 200, 'Admin route /admin serves SPA HTML (200 OK)');

  const pyDownloadRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/receipt_processor.py',
    method: 'GET'
  });
  assert(pyDownloadRes.status === 200, 'Desktop receipt_processor.py installer is downloadable (200 OK)');
  assert(typeof pyDownloadRes.raw === 'string' && pyDownloadRes.raw.includes('ReceiptProcessor'), 'Python script contains valid desktop client engine code');

  const batDownloadRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/run_receipt_processor.bat',
    method: 'GET'
  });
  assert(batDownloadRes.status === 200, 'Windows batch launcher run_receipt_processor.bat is downloadable (200 OK)');

  const shDownloadRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/run_receipt_processor.sh',
    method: 'GET'
  });
  assert(shDownloadRes.status === 200, 'macOS/Linux launcher run_receipt_processor.sh is downloadable (200 OK)');

  // ---------------------------------------------------------------------------
  // 2. Client Portal Auth, Account Registration & Company Name Validation
  // ---------------------------------------------------------------------------
  console.log('\n[Phase 2: Client Registration, Validation & Company Checks]');

  const testCompName = `Heritage Valley Agriculture ${Date.now()}`;
  const checkCompRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/client/check-company-name?name=${encodeURIComponent(testCompName)}`,
    method: 'GET'
  });
  assert(checkCompRes.status === 200 && checkCompRes.data.available === true, 'Real-time company availability endpoint returns available');

  const testUser = `farmer_${Date.now()}`;
  const registerRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/client/register',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    username: testUser,
    password: 'SecureFarmPassword2026!',
    email: `${testUser}@farmcoop.example`,
    displayName: 'Heritage Valley Farm Manager',
    companyName: testCompName,
    initialPlan: 'Annual Commercial',
    initialPlanTier: 'ANNUAL'
  });
  assert(registerRes.status === 200 && registerRes.data.success, 'Client account registered successfully');
  assert(registerRes.data.account.companyName === testCompName, 'Account company name correctly stored');
  assert(!registerRes.data.account.passwordHash, 'Sensitive passwordHash not leaked in response');

  // Verify company collision detection
  const duplicateCompRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/client/check-company-name?name=${encodeURIComponent(testCompName)}`,
    method: 'GET'
  });
  assert(duplicateCompRes.status === 200 && duplicateCompRes.data.available === false, 'Company name is now recognized as registered (Collision Blocked)');

  // ---------------------------------------------------------------------------
  // 3. Client Receipt Upload, Math Reconciliation & Deductions
  // ---------------------------------------------------------------------------
  console.log('\n[Phase 3: Receipt Intake, Deduction Mapping & Queue]');

  const userId = registerRes.data.account.id;
  const clientEmail = `${testUser}@farmcoop.example`;

  const intakeRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/client/submissions',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    submission: {
      id: `rcpt_seed_${Date.now()}`,
      userId,
      clientName: 'Heritage Valley Farm Manager',
      clientEmail,
      companyName: testCompName,
      fileName: 'Pioneer_Hybrid_Corn_Seed_Invoice_2026.pdf',
      vendor: 'Pioneer Hi-Bred Seed International',
      total: 4850.00,
      extractedAmount: 4850.00,
      tax: 0,
      irsCategory: 'Seeds and Plants Purchased',
      irsLineTitle: 'Seeds and plants purchased',
      irsLineNumber: 'Line 23',
      schedule: 'SCHEDULE_F',
      invoiceNumber: `INV-SEED-${Date.now().toString().slice(-6)}`,
      status: 'QUEUED'
    }
  });
  assert(intakeRes.status === 200 && intakeRes.data.success, 'Receipt submission accepted into client intake queue');

  // Verify client querying their submissions
  const clientSubsRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/client/submissions?userId=${userId}`,
    method: 'GET'
  });
  assert(clientSubsRes.status === 200 && clientSubsRes.data.submissions.length >= 1, 'Client submissions retrieved successfully');
  assert(clientSubsRes.data.submissions[0].companyName === testCompName, 'Submission tied accurately to client company');

  // ---------------------------------------------------------------------------
  // 4. QuickBooks Connection Broker & Live Chart of Accounts
  // ---------------------------------------------------------------------------
  console.log('\n[Phase 4: QuickBooks Online Connection & COA]');

  const realmId = `934145${Math.floor(1000000 + Math.random() * 9000000)}`;
  const qboConnectRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/qbo/mock-connect',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    realmId,
    companyName: testCompName,
    userId,
    email: clientEmail,
    environment: 'production'
  });
  assert(qboConnectRes.status === 200 && qboConnectRes.data.success, 'QuickBooks company connected and linked to client');

  // Populate COA
  const coaRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/qbo/company/populate-accounts',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    realmId,
    userId
  });
  assert(coaRes.status === 200 && coaRes.data.success, 'Chart of accounts populated for company');
  assert(coaRes.data.totalAccounts >= 25, `Full accounting ledger loaded (${coaRes.data.totalAccounts} accounts)`);

  // Set Default Posting Account to Mastercard
  const defaultAccRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/qbo/company/set-default-account',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    realmId,
    userId,
    defaultPostingAccount: 'Mastercard (Acct ****5512)'
  });
  assert(defaultAccRes.status === 200 && defaultAccRes.data.success, 'Default posting account set to Mastercard');

  // Verify accounts categorization
  const qboAccountsRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/qbo/accounts?realmId=${realmId}`,
    method: 'GET'
  });
  assert(qboAccountsRes.status === 200 && qboAccountsRes.data.success, 'GET /api/qbo/accounts returns 200 OK');
  assert(qboAccountsRes.data.creditCardAccounts.length > 0, 'Credit Card accounts categorized');
  assert(qboAccountsRes.data.bankAccounts.length > 0, 'Bank Checking accounts categorized');
  assert(qboAccountsRes.data.expenseAccounts.length > 0, 'Expense deduction accounts categorized');

  // ---------------------------------------------------------------------------
  // 5. Inquiries & Prospective Client Intake
  // ---------------------------------------------------------------------------
  console.log('\n[Phase 5: Prospect Inquiries & Contact Forms]');

  const newInquiryRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/inquiries',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    name: 'Sarah Jenkins',
    email: 'sarah.jenkins@agricoop.example',
    company: 'Jenkins Cattle & Grain LLC',
    receiptVolume: '500-1,000 receipts/month',
    interestedPlan: 'Annual Enterprise',
    notes: 'Interested in automatic syncing to our QuickBooks Desktop / Online farm ledger'
  });
  assert(newInquiryRes.status === 200 && newInquiryRes.data.success, 'Inquiry submitted and saved to inquiries ledger');

  // ---------------------------------------------------------------------------
  // 6. Active Devices Telemetry & Presence Tracking
  // ---------------------------------------------------------------------------
  console.log('\n[Phase 6: Web Presence & Active Devices Monitor]');

  const pingRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/licenses/heartbeat',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    portal: 'CLIENT',
    userId,
    username: testUser,
    displayName: 'Heritage Valley Farm Manager',
    companyName: testCompName,
    plan: 'Annual Commercial'
  });
  assert(pingRes.status === 200 && pingRes.data.success, 'Heartbeat telemetry ping accepted');

  const sessionsRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/licenses/sessions',
    method: 'GET'
  });
  assert(sessionsRes.status === 200 && sessionsRes.data.sessions.length > 0, 'Active devices monitor returns live connected sessions');

  // ---------------------------------------------------------------------------
  // 7. Cleanup & Isolation Verification
  // ---------------------------------------------------------------------------
  console.log('\n[Phase 7: Cleanup & Multi-Tenant State Isolation]');

  // Disconnect QuickBooks company safely
  const disconnectRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/qbo/disconnect',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    realmId,
    userId,
    purge: true
  });
  assert(disconnectRes.status === 200 && disconnectRes.data.success, 'QuickBooks company purged and disconnected cleanly');

  // Delete test account
  const deleteAccountRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/admin/accounts/${userId}?userId=${userId}`,
    method: 'DELETE'
  });
  assert(deleteAccountRes.status === 200 && deleteAccountRes.data.success, 'Test user account removed');

  console.log('\n========================================================================');
  console.log(`FULL-WEBSITE FUNCTIONALITY AUDIT RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

run();
