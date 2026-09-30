/**
 * IP Tracker Diagnostic Probe
 * Run this script to manually verify your IP is being tracked by the system.
 * 
 * Usage: 
 *   node ip_tracker_probe.js [license_key]
 */

const CLOUDFLARE_WORKER_URL = 'https://receipt-license-api.moisttowlett247.workers.dev';

async function runProbe() {
  const key = process.argv[2] || 'DIAGNOSTIC-PROBE';
  console.log(`Starting IP tracker probe for key: ${key}...`);

  try {
    const payload = {
      portal: 'ADMIN',
      userId: 'diagnostic_tool',
      username: 'probe_runner',
      displayName: 'Diagnostic Probe Runner',
      licenseKey: key,
      browserInfo: 'Node.js Diagnostic Script',
      status: 'ACTIVE',
      timestamp: new Date().toISOString()
    };

    console.log('Sending heartbeat to Cloudflare Worker...');
    const cfResp = await fetch(`${CLOUDFLARE_WORKER_URL}/api/presence/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (cfResp.ok) {
      const data = await cfResp.json();
      console.log('✅ Cloudflare Heartbeat Success!');
      console.log(`   Your tracked IP: ${data.clientIp}`);
      console.log(`   Your location: ${data.location}`);
      console.log('\nCheck your Admin Portal "Live IP Tracker" tab. You should see a new "Node.js Diagnostic Script" entry.');
    } else {
      const err = await cfResp.text();
      console.error('❌ Cloudflare Heartbeat Failed:', cfResp.status, err);
    }
  } catch (err) {
    console.error('❌ Probe execution error:', err.message);
  }
}

runProbe();
