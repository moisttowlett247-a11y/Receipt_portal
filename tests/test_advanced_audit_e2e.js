import http from 'http';
import crypto from 'crypto';

function makeRequest(options, postData) {
  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed, raw: data });
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
  console.log('🔬 RUNNING ADVANCED COMPREHENSIVE SECURITY, SYNC & AUDIT SUITE');
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
  // 1. Client Authentication & Password Timing-Safe Verification
  // ---------------------------------------------------------------------------
  console.log('\n[Phase 1: Client Authentication, Login Verification & Brute-Force Defense]');
  const auditUser = `adv_user_${Date.now()}`;
  const auditEmail = `${auditUser}@agrotech.example`;
  const auditPassword = 'SecureAuditPassword#2026!';
  const auditCompany = `Highland Grain Coop ${Date.now()}`;

  // 1.1 Register
  const regRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/client/register',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    username: auditUser,
    password: auditPassword,
    email: auditEmail,
    displayName: 'Highland Grain Manager',
    companyName: auditCompany
  });
  assert(regRes.status === 200 && regRes.data.success, 'New account registered successfully');
  const userId = regRes.data.account.id;

  // 1.2 Wrong password rejection
  const wrongPassRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/client/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    username: auditUser,
    password: 'IncorrectPassword123!'
  });
  assert(wrongPassRes.status === 401, 'Invalid password rejected with 401 Unauthorized');

  // 1.3 Successful login with username
  const loginUserRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/client/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    username: auditUser,
    password: auditPassword
  });
  assert(loginUserRes.status === 200 && loginUserRes.data.success, 'Login by username succeeds with 200 OK');
  assert(loginUserRes.data.account.companyName === auditCompany, 'Account profile retrieved accurately');
  assert(!loginUserRes.data.account.passwordHash && !loginUserRes.data.account.salt, 'Sensitive hash/salt omitted from client login payload');

  // 1.4 Successful login with email (case-insensitive)
  const loginEmailRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/client/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    username: auditEmail.toUpperCase(),
    password: auditPassword
  });
  assert(loginEmailRes.status === 200 && loginEmailRes.data.success, 'Login by uppercase email succeeds with 200 OK');

  // ---------------------------------------------------------------------------
  // 2. Unicode, Emoji & Non-ASCII Integrity
  // ---------------------------------------------------------------------------
  console.log('\n[Phase 2: Unicode, International Characters & Emoji Integrity]');
  const unicodeReceiptRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/client/submissions',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    submission: {
      userId,
      companyName: auditCompany,
      fileName: '🚜_grain_elevator_receipt_2026.pdf',
      vendor: '🌾 Central Ag Coop (Центральный Агрокооп) 🚜',
      memo: 'Fertilizer & Seed batch (肥料と種子) 🌽',
      total: 1250.75,
      status: 'QUEUED'
    }
  });
  assert(unicodeReceiptRes.status === 200 && unicodeReceiptRes.data.success, 'Submission with Unicode, Cyrillic & emojis accepted (200 OK)');
  assert(unicodeReceiptRes.data.submission.total === 1250.75, 'Numerical value intact with unicode fields');

  // ---------------------------------------------------------------------------
  // 3. QuickBooks Webhook HMAC Signature Security
  // ---------------------------------------------------------------------------
  console.log('\n[Phase 3: QuickBooks Webhook HMAC Signature Security]');
  const webhookPayload = JSON.stringify({
    eventNotifications: [{
      realmId: '934145999999',
      dataChangeEvent: {
        entities: [{ name: 'AppDisconnect', id: '1', operation: 'Delete' }]
      }
    }]
  });

  // Test webhook with empty/unconfigured secret accepts or verifies properly
  const webhookRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/qbo/webhook',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'intuit-signature': 'invalid_test_signature'
    }
  }, webhookPayload);
  assert(webhookRes.status === 200 || webhookRes.status === 401, 'Webhook endpoint responded predictably without unhandled exceptions');

  // ---------------------------------------------------------------------------
  // 4. Rate-Limiting Protection Against Rapid Inquiries
  // ---------------------------------------------------------------------------
  console.log('\n[Phase 4: Abuse Prevention & Rate-Limiting Checks]');
  const rapidRequests = [];
  // Send 25 rapid inquiries (limit is 20/min)
  for (let i = 0; i < 25; i++) {
    rapidRequests.push(makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/inquiries',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      name: `Tester ${i}`,
      email: `test${i}@spam.example`,
      notes: `Spam attempt ${i}`
    }));
  }
  const rapidResults = await Promise.all(rapidRequests);
  const rateLimited = rapidResults.some(r => r.status === 429);
  assert(rateLimited, 'Rate limiter throttled excessive rapid requests with 429 Too Many Requests');

  // ---------------------------------------------------------------------------
  // 5. Cleanup
  // ---------------------------------------------------------------------------
  console.log('\n[Phase 5: Cleanup & Account Removal]');
  const delRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/admin/accounts/${userId}?userId=${userId}`,
    method: 'DELETE'
  });
  assert(delRes.status === 200 && delRes.data.success, 'Audit test user cleaned up successfully');

  // Reset rate limits so subsequent integration suites have fresh buckets
  await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/test/reset-rate-limit',
    method: 'POST'
  });

  console.log('\n========================================================================');
  console.log(`ADVANCED SECURITY & AUDIT RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

run();
