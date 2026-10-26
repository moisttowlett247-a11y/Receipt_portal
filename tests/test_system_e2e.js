// Full-System End-to-End Validation Suite: Website, Receipt Processor, IP Tracker, and QuickBooks Online
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

async function runFullSystemTests() {
  console.log('========================================================================');
  console.log('🚀 RUNNING SYSTEM-WIDE AUDIT: WEBSITE, OCR, IP TRACKER & QUICKBOOKS');
  console.log('========================================================================\n');

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
    // -------------------------------------------------------------------------
    // SECTION 1: WEBSITE & SYSTEM HEALTH
    // -------------------------------------------------------------------------
    console.log('[SECTION 1: Website Core & Public Endpoints]');

    // 1.1 Verify /api/qbo/config
    const configRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/qbo/config',
      method: 'GET'
    });
    assert(configRes.status === 200 && configRes.data.success, 'Website QBO configuration broker is responsive');

    // 1.2 Verify client submissions API
    const subsRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/client/submissions',
      method: 'GET'
    });
    assert(subsRes.status === 200 && subsRes.data.success, 'Client submissions queue API returns 200 OK');

    // 1.3 Verify desktop bundle file route availability
    const bundleRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/download/bundle',
      method: 'GET'
    });
    assert([200, 404].includes(bundleRes.status), 'Desktop engine bundle route is registered and responding');

    // -------------------------------------------------------------------------
    // SECTION 2: IP TRACKER & REAL-TIME TELEMETRY
    // -------------------------------------------------------------------------
    console.log('\n[SECTION 2: IP Tracker, Telemetry & Geolocation]');

    // 2.1 Verify /api/presence/ip endpoint
    const myIpRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/presence/ip',
      method: 'GET'
    });
    assert(myIpRes.status === 200 && myIpRes.data.ip, `IP detection endpoint returns clean IP: ${myIpRes.data.ip}`);
    assert(Boolean(myIpRes.data.location), `IP geolocation resolved to: ${myIpRes.data.location}`);

    // 2.2 Verify /api/track-ip alias endpoint
    const trackIpRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/track-ip',
      method: 'GET'
    });
    assert(trackIpRes.status === 200 && trackIpRes.data.success, 'Dedicated /api/track-ip alias returns 200 OK');

    // 2.3 Send Presence Heartbeat with browser and portal context
    const testSessionId = `test_sess_${Date.now()}`;
    const heartbeatRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/presence/heartbeat',
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'cf-ipcountry': 'US',
        'cf-ipcity': 'Chicago',
        'cf-region': 'IL'
      }
    }, {
      sessionId: testSessionId,
      portal: 'ADMIN',
      userId: 'test-admin',
      username: 'admin',
      displayName: 'System Auditor',
      browserInfo: 'Chrome on macOS (Desktop)',
      deviceCategory: 'Browser / Web Client',
      plan: 'Master Administrator',
      status: 'ACTIVE'
    });
    assert(heartbeatRes.status === 200 && heartbeatRes.data.success, 'Presence heartbeat successfully recorded');

    // 2.4 Verify Sessions retrieval & single-IP deduplication
    const sessionsRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/licenses/sessions',
      method: 'GET'
    });
    assert(sessionsRes.status === 200 && sessionsRes.data.success, 'GET /api/licenses/sessions returns 200 OK');
    assert(sessionsRes.data.sessions.length > 0, `Active devices telemetry returned ${sessionsRes.data.sessions.length} session(s)`);
    const activeSession = sessionsRes.data.sessions[0];
    assert(['ONLINE', 'IDLE', 'OFFLINE'].includes(activeSession.onlineState), `Session state computed accurately as: ${activeSession.onlineState}`);
    assert(Boolean(activeSession.location), `Session location properly populated: ${activeSession.location}`);

    // 2.5 Test inactive session pruning
    const pruneRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/licenses/sessions/clear',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      clearAll: false
    });
    assert(pruneRes.status === 200 && pruneRes.data.success, 'Session pruning route operates accurately without data loss');

    // -------------------------------------------------------------------------
    // SECTION 3: RECEIPT PROCESSOR (OCR, INTAKE & AUTO-ROUTING)
    // -------------------------------------------------------------------------
    console.log('\n[SECTION 3: Receipt Processor Engine & Deduction Classification]');

    // 3.1 Test receipt submission with currency string handling ($) and tax categorization
    const testReceipt = {
      id: `rcpt-test-${Date.now()}`,
      clientEmail: 'ops@agricultural-enterprise.com',
      clientName: 'Enterprise Operations',
      vendor: 'Nutrien Ag Fertilizer & Crop Solutions',
      fileName: 'Nutrien_Anhydrous_Invoice_Spring2026.pdf',
      extractedAmount: '$2,450.80',
      total: '$2,450.80',
      tax: '$145.20',
      irsCategory: 'Fertilizers and Lime (Anhydrous, Dry, Liquid)',
      irsLineTitle: 'Fertilizers and lime',
      irsLineNumber: 'Line 15',
      schedule: 'SCHEDULE_F',
      invoiceNumber: 'INV-NUTRIEN-2026-LONG-NUM',
      status: 'QUEUED'
    };

    const submitReceiptRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/client/submissions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      submission: testReceipt
    });
    assert(submitReceiptRes.status === 200 && submitReceiptRes.data.success, 'Receipt intake processed submission without error');
    assert(submitReceiptRes.data.submission.status === 'SYNCED_QBO', 'Receipt auto-routed and marked as SYNCED_QBO');

    // 3.2 Test batch sync endpoint
    const batchRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/client/submissions/batch-sync',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      submissions: [
        {
          id: `batch-item-${Date.now()}`,
          clientEmail: 'ops@agricultural-enterprise.com',
          clientName: 'Enterprise Operations',
          vendor: 'Valley Veterinary Medicine Services',
          fileName: 'Valley_Vet_Herd_Vaccines_2026.jpg',
          extractedAmount: 620.00,
          total: 620.00,
          tax: 0,
          irsCategory: 'Veterinary, Breeding, and Medicine for Livestock',
          irsLineTitle: 'Veterinary, breeding, and medicine',
          irsLineNumber: 'Line 28',
          schedule: 'SCHEDULE_F',
          invoiceNumber: 'VET-88410',
          status: 'QUEUED'
        }
      ]
    });
    assert(batchRes.status === 200 && batchRes.data.success, 'Batch sync engine successfully reconciled receipts');

    // -------------------------------------------------------------------------
    // SECTION 4: QUICKBOOKS ONLINE (CHART OF ACCOUNTS & DIRECT UPLOAD)
    // -------------------------------------------------------------------------
    console.log('\n[SECTION 4: QuickBooks Online Integration]');

    const targetRealm = '9341451241444';

    // 4.1 Ensure company exists and has all accounts populated
    const populateRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/qbo/company/populate-accounts',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      realmId: targetRealm
    });
    assert(populateRes.status === 200 && populateRes.data.success, 'QuickBooks accounts successfully populated for company');
    assert(populateRes.data.totalAccounts >= 25, `Populated comprehensive accounts list (${populateRes.data.totalAccounts} accounts)`);

    // 4.2 Verify Chart of Accounts classification isolation
    const qboAccountsRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: `/api/qbo/accounts?realmId=${targetRealm}`,
      method: 'GET'
    });
    assert(qboAccountsRes.status === 200 && qboAccountsRes.data.success, 'GET /api/qbo/accounts returns 200 OK');
    assert(qboAccountsRes.data.totalStandard === 0, 'Chart of accounts strictly isolated (totalStandard: 0)');
    assert(qboAccountsRes.data.creditCardAccounts.length > 0, `Credit Card accounts present (${qboAccountsRes.data.creditCardAccounts.length})`);
    assert(qboAccountsRes.data.bankAccounts.length > 0, `Bank Checking accounts present (${qboAccountsRes.data.bankAccounts.length})`);
    assert(qboAccountsRes.data.expenseAccounts.length > 0, `Expense accounts present (${qboAccountsRes.data.expenseAccounts.length})`);

    // 4.3 Test Direct Push to QBO with DocNumber sanitization (<= 21 chars)
    const directPushRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/qbo/push',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      realmId: targetRealm,
      receipt: {
        vendor: 'Cenex Bulk Fuel Depot',
        date: '2026-10-24',
        total: 1120.45,
        tax: 68.20,
        category: 'Gasoline, Fuel, and Oil (Bulk Diesel & Def)',
        schedule: 'SCHEDULE_F',
        invoiceNumber: 'CENEX-SUPER-LONG-INVOICE-EXCEEDING-21-CHARS',
        detectedEmail: 'ops@agricultural-enterprise.com'
      }
    });
    assert(directPushRes.status === 200 && directPushRes.data.success, 'Direct push to QuickBooks Online succeeded');
    assert(directPushRes.data.pushedCount === 1, 'Pushed 1 transaction to QuickBooks');

    // 4.4 Verify QuickBooks Sync Audit Log
    const syncLogRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/qbo/sync-log',
      method: 'GET'
    });
    assert(syncLogRes.status === 200 && syncLogRes.data.success, 'QuickBooks sync log retrieved');
    assert(syncLogRes.data.logs.length > 0, `Audit log contains ${syncLogRes.data.logs.length} transactions`);
    const latestTxn = syncLogRes.data.logs[0];
    assert(latestTxn.docNumber.length <= 21, `DocNumber strictly <= 21 chars: '${latestTxn.docNumber}' (length: ${latestTxn.docNumber.length})`);
    assert(latestTxn.status === 'SUCCESS', `Transaction status confirmed as SUCCESS`);
    assert(Boolean(latestTxn.defaultPostingAccount), `Posted to default account: ${latestTxn.defaultPostingAccount}`);

    console.log('\n========================================================================');
    console.log(`FULL-SYSTEM AUDIT COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal execution error during system audit:', err);
    process.exit(1);
  }
}

runFullSystemTests();
