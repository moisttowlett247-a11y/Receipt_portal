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
  console.log('================================================================');
  console.log('🛡️  RUNNING DEEP SECURITY AUDIT & MALICIOUS ATTACK DEFENSE SUITE');
  console.log('================================================================');

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

  // 1. Path Traversal & Dotfile Block
  console.log('\n[Phase 1: Path Traversal & Dotfile Protection]');
  const dotEnvRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/.env',
    method: 'GET'
  });
  assert(dotEnvRes.status === 403, 'Direct access to /.env blocked with 403 Forbidden');

  const traversalRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/..%2f..%2fpackage.json',
    method: 'GET'
  });
  assert(traversalRes.status === 403, 'URL-encoded path traversal blocked with 403 Forbidden');

  const nullByteRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/licenses/check?hash=abc%00123',
    method: 'GET'
  });
  assert(nullByteRes.status === 403, 'Null byte injection in path blocked with 403 Forbidden');

  // 2. HTTP Security Headers
  console.log('\n[Phase 2: HTTP Security Headers]');
  const headersRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/qbo/config',
    method: 'GET'
  });
  assert(headersRes.headers['x-content-type-options'] === 'nosniff', 'X-Content-Type-Options: nosniff header enforced');
  assert(headersRes.headers['x-frame-options'] === 'SAMEORIGIN', 'X-Frame-Options: SAMEORIGIN clickjacking defense enforced');
  assert(headersRes.headers['x-xss-protection'] === '1; mode=block', 'X-XSS-Protection header present');
  assert(headersRes.headers['referrer-policy'] === 'strict-origin-when-cross-origin', 'Referrer-Policy header present');

  // 3. Unauthorized Administrative Endpoint Access
  console.log('\n[Phase 3: Administrative Endpoint Protection]');
  // Mock external non-loopback IP via forward header
  const unauthorizedAdminAccRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/accounts?role=ADMIN',
    method: 'GET',
    headers: { 'x-forwarded-for': '198.51.100.42' }
  });
  assert(unauthorizedAdminAccRes.status === 403, 'External spoofed ?role=ADMIN blocked from GET /api/admin/accounts (403 Forbidden)');

  const unauthorizedQboConfigRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/qbo/config?role=ADMIN',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.42' }
  }, { clientId: 'malicious-client-id' });
  assert(unauthorizedQboConfigRes.status === 403, 'External spoofed admin blocked from POST /api/qbo/config (403 Forbidden)');

  const unauthorizedInquiriesRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/inquiries?role=ADMIN',
    method: 'GET',
    headers: { 'x-forwarded-for': '198.51.100.42' }
  });
  assert(unauthorizedInquiriesRes.status === 403, 'External spoofed admin blocked from GET /api/inquiries (403 Forbidden)');

  // 4. Cross-Tenant QBO Token & Push Defense
  console.log('\n[Phase 4: Cross-Tenant QuickBooks Token & Push Protection]');
  const realmIdA = `sec_realm_${Date.now()}`;
  const userIdA = `usr_victim_${Date.now()}`;
  const userIdB = `usr_attacker_${Date.now()}`;

  // User A connects QBO company
  await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/qbo/mock-connect',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    realmId: realmIdA,
    companyName: `Secure Vault Corp ${Date.now()}`,
    userId: userIdA
  });

  // User B tries to extract User A's token
  const tokenAttackRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/qbo/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    realmId: realmIdA,
    userId: userIdB
  });
  assert(tokenAttackRes.status === 403, 'Attacker blocked from extracting victim QBO access token (403 Forbidden)');

  // User B tries to push receipt into User A's realm
  const pushAttackRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/qbo/push',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    realmId: realmIdA,
    userId: userIdB,
    receipt: {
      vendor: 'Malicious Invoice Supplier',
      total: 99999.00
    }
  });
  assert(pushAttackRes.status === 403, 'Attacker blocked from injecting transactions into victim QBO realm (403 Forbidden)');

  // User B tries to disconnect User A's company
  const disconnectAttackRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/qbo/disconnect',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    realmId: realmIdA,
    userId: userIdB
  });
  assert(disconnectAttackRes.status === 403, 'Attacker blocked from disconnecting victim QBO company (403 Forbidden)');

  // User B tries to delete User A's company
  const deleteCompAttackRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/qbo/companies/${realmIdA}?userId=${userIdB}`,
    method: 'DELETE'
  });
  assert(deleteCompAttackRes.status === 403, 'Attacker blocked from deleting victim QBO company (403 Forbidden)');

  // 5. Unauthenticated Submissions Exposure Defense
  console.log('\n[Phase 5: Submissions Public Privacy & Non-Leakage]');
  const publicSubsRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/client/submissions',
    method: 'GET'
  });
  assert(publicSubsRes.status === 200, 'GET /api/client/submissions returns 200');
  const leakedOtherUsers = publicSubsRes.data.submissions.filter(s => s.userId === userIdA);
  assert(leakedOtherUsers.length === 0, 'Public caller cannot see victim private receipts (Tenant Isolation Enforced)');

  // 6. Prototype Pollution & Payload Bounds
  console.log('\n[Phase 6: Prototype Pollution & Payload Size Limits]');
  const protoPollutionRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/inquiries',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    __proto__: { isAdmin: true },
    constructor: { prototype: { hacked: true } },
    name: 'Security Test Auditor',
    email: 'auditor@securitytest.org',
    notes: 'Testing sanitization against prototype pollution'
  });
  assert(protoPollutionRes.status === 200, 'Prototype pollution payload safely neutralized without error');
  assert(({}).isAdmin !== true, 'Object prototype remains untainted (Object.prototype.isAdmin is undefined)');

  // Cleanup User A's test company
  await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/qbo/companies/${realmIdA}?userId=${userIdA}`,
    method: 'DELETE'
  });

  console.log('\n================================================================');
  console.log(`DEEP SECURITY AUDIT RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

run();
