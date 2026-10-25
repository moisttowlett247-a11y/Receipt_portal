// Comprehensive E2E Test Suite for QuickBooks Integration
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

async function runTests() {
  console.log('================================================================');
  console.log('🚀 RUNNING COMPREHENSIVE QUICKBOOKS INTEGRATION TEST SUITE');
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
    // TEST 1: Check QBO Config endpoint
    console.log('[Phase 1: QuickBooks OAuth Broker Configuration]');
    const cfgRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/qbo/config',
      method: 'GET'
    });
    assert(cfgRes.status === 200 && cfgRes.data.success, 'GET /api/qbo/config returns 200 OK');

    // TEST 2: Connect / Mock Connect a synced company with client email
    console.log('\n[Phase 2: Connecting Synced Account & COA Population]');
    const targetRealm = '9341451241444';
    const clientEmail = 'moisttowlett247@gmail.com';
    const companyName = 'Towlett Agricultural Enterprises LLC';

    const connectRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/qbo/mock-connect',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      realmId: targetRealm,
      companyName,
      email: clientEmail,
      environment: 'sandbox'
    });
    assert(connectRes.status === 200 && connectRes.data.success, 'POST /api/qbo/mock-connect succeeds');

    // TEST 3: Populate all chart of accounts for the synced account
    const populateRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/qbo/company/populate-accounts',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      realmId: targetRealm
    });
    assert(populateRes.status === 200 && populateRes.data.success, 'POST /api/qbo/company/populate-accounts succeeds');
    assert(populateRes.data.totalAccounts >= 20, `Populated ${populateRes.data.totalAccounts} accounts for company`);

    // TEST 4: Query Chart of Accounts via /api/qbo/accounts
    console.log('\n[Phase 3: Chart of Accounts Classification & Isolation Verification]');
    const accsRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: `/api/qbo/accounts?realmId=${targetRealm}`,
      method: 'GET'
    });
    assert(accsRes.status === 200 && accsRes.data.success, 'GET /api/qbo/accounts returns 200 OK');
    assert(accsRes.data.totalStandard === 0, 'Zero preloaded/synthetic accounts injected (totalStandard: 0)');
    assert(Array.isArray(accsRes.data.creditCardAccounts) && accsRes.data.creditCardAccounts.length > 0, 'Credit Card accounts populated');
    assert(Array.isArray(accsRes.data.bankAccounts) && accsRes.data.bankAccounts.length > 0, 'Bank Checking accounts populated');
    assert(Array.isArray(accsRes.data.assetAccounts) && accsRes.data.assetAccounts.length > 0, 'Asset accounts populated');
    assert(Array.isArray(accsRes.data.liabilityAccounts) && accsRes.data.liabilityAccounts.length > 0, 'Liability accounts populated');
    assert(Array.isArray(accsRes.data.equityAccounts) && accsRes.data.equityAccounts.length > 0, 'Equity accounts populated');
    assert(Array.isArray(accsRes.data.expenseAccounts) && accsRes.data.expenseAccounts.length > 0, 'Expense accounts populated');
    assert(Array.isArray(accsRes.data.cogsAccounts) && accsRes.data.cogsAccounts.length > 0, 'COGS accounts populated');
    assert(Array.isArray(accsRes.data.farmAccounts) && accsRes.data.farmAccounts.length > 0, 'Schedule F Farm accounts populated');

    // TEST 5: Verify Company Record includes accountDetails and default selected account
    const compRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/qbo/companies',
      method: 'GET'
    });
    assert(compRes.status === 200 && compRes.data.success, 'GET /api/qbo/companies returns 200 OK');
    const matchedCompany = compRes.data.companies.find(c => c.realmId === targetRealm);
    assert(Boolean(matchedCompany), 'Company record found in GET /api/qbo/companies');
    assert(Array.isArray(matchedCompany.accountDetails) && matchedCompany.accountDetails.length > 0, 'Company record contains full accountDetails');

    // TEST 6: Upload Receipt to Default Selected Account #1 (Bank Checking)
    console.log('\n[Phase 4: Receipt Upload to Bank Checking Default Account]');
    const setBankDefaultRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/qbo/company/set-default-account',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      realmId: targetRealm,
      defaultPostingAccount: 'Operating Checking (Acct ****4120)',
      email: clientEmail
    });
    assert(setBankDefaultRes.status === 200, 'Set default posting account to Operating Checking');

    // Clear sync log to get isolated assertions
    await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/qbo/sync-log/clear',
      method: 'POST'
    });

    const clientReceipt1 = {
      id: `sub-test-check-${Date.now()}`,
      clientEmail: clientEmail,
      clientName: 'Moist Towlett',
      vendor: 'ADM Grain & Crop Co-op',
      fileName: 'ADM_Bulk_Fertilizer_Invoice_2026.pdf',
      extractedAmount: 1845.50,
      total: 1845.50,
      tax: 0,
      irsCategory: 'Chemicals, Fertilizer & Lime',
      irsLineTitle: 'Fertilizers and lime',
      irsLineNumber: 'Line 11',
      schedule: 'SCHEDULE_F',
      invoiceNumber: 'INV-ADM-99412',
      status: 'QUEUED'
    };

    const submitRes1 = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/client/submissions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      submission: clientReceipt1
    });
    assert(submitRes1.status === 200 && submitRes1.data.success, 'POST /api/client/submissions accepted receipt');
    assert(submitRes1.data.submission.status === 'SYNCED_QBO', 'Receipt auto-synced with status SYNCED_QBO');

    // Verify sync log entry for Receipt 1
    const logsRes1 = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/qbo/sync-log',
      method: 'GET'
    });
    assert(logsRes1.data.count > 0, 'QuickBooks sync log contains at least 1 entry');
    const logItem1 = logsRes1.data.logs[0];
    assert(logItem1.companyName === companyName, `Logged to correct target company (${logItem1.companyName})`);
    assert(logItem1.defaultPostingAccount.includes('Operating Checking'), `Posted against default account: ${logItem1.defaultPostingAccount}`);
    assert(logItem1.paymentType === 'Check', `PaymentType correctly resolved to 'Check' for bank account`);
    assert(logItem1.total === 1845.50, `Transaction amount correctly recorded as 1845.50`);
    assert(logItem1.docNumber.length <= 21, `DocNumber sanitized within Intuit 21 char limit: ${logItem1.docNumber}`);
    assert(logItem1.status === 'SUCCESS', 'Sync status is SUCCESS');

    // TEST 7: Upload Receipt to Default Selected Account #2 (Credit Card: Mastercard)
    console.log('\n[Phase 5: Receipt Upload to Credit Card Default Account]');
    const setCardDefaultRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/qbo/company/set-default-account',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      realmId: targetRealm,
      defaultPostingAccount: 'Mastercard (Acct ****5512)'
    });
    assert(setCardDefaultRes.status === 200, 'Set default posting account to Mastercard (Acct ****5512)');

    const clientReceipt2 = {
      id: `sub-test-card-${Date.now()}`,
      clientEmail: clientEmail,
      clientName: 'Moist Towlett',
      vendor: 'Cenex Bulk Diesel Station',
      fileName: 'Cenex_Fleet_Diesel_Fuel_Receipt_2026.pdf',
      extractedAmount: '$420.75',
      total: '$420.75',
      tax: '$24.50',
      irsCategory: 'Gasoline, Fuel, and Oil (Bulk Diesel & Def)',
      irsLineTitle: 'Gasoline, fuel, and oil',
      irsLineNumber: 'Line 17',
      schedule: 'SCHEDULE_F',
      invoiceNumber: 'CENEX-SUPER-LONG-INVOICE-NUMBER-EXCEEDING-21-CHARS-12345',
      status: 'QUEUED'
    };

    const submitRes2 = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/client/submissions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      submission: clientReceipt2
    });
    assert(submitRes2.status === 200 && submitRes2.data.success, 'POST /api/client/submissions accepted receipt with currency string');
    assert(submitRes2.data.submission.status === 'SYNCED_QBO', 'Receipt auto-synced with status SYNCED_QBO');

    const logsRes2 = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/qbo/sync-log',
      method: 'GET'
    });
    const logItem2 = logsRes2.data.logs[0];
    assert(logItem2.defaultPostingAccount.includes('Mastercard'), `Posted against default account: ${logItem2.defaultPostingAccount}`);
    assert(logItem2.paymentType === 'CreditCard', `PaymentType correctly resolved to 'CreditCard'`);
    assert(logItem2.total === 420.75, `Parsed amount correctly as numeric 420.75 from '$420.75'`);
    assert(logItem2.docNumber.length <= 21, `DocNumber sanitized strictly <= 21 chars: '${logItem2.docNumber}' (length: ${logItem2.docNumber.length})`);
    assert(logItem2.accountName !== logItem2.defaultPostingAccount, `Expense category '${logItem2.accountName}' segregated from payment account`);

    // TEST 8: Direct Manual Push to QuickBooks
    console.log('\n[Phase 6: Direct Manual Push to QuickBooks]');
    const manualPushRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/qbo/push',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      realmId: targetRealm,
      receipt: {
        vendor: 'John Deere Tractor Repair & Parts',
        date: '2026-10-24',
        total: 785.40,
        tax: 48.20,
        category: 'Repairs and Maintenance - Machinery & Tractors',
        schedule: 'SCHEDULE_F',
        invoiceNumber: 'JD-PARTS-4812',
        detectedEmail: clientEmail
      }
    });
    assert(manualPushRes.status === 200 && manualPushRes.data.success, 'POST /api/qbo/push succeeded');
    assert(manualPushRes.data.pushedCount === 1, 'Pushed 1 transaction directly');

    console.log('\n================================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test Suite encountered fatal error:', err);
    process.exit(1);
  }
}

runTests();
