// iOS signing for the GitHub "iOS build" workflow, with no Apple sign-in and no prompts: everything goes through the
// App Store Connect API key (repository secrets ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8).
//   1. registers the bundle id sa.muntej.app (with push) if Apple doesn't have it yet
//   2. distribution certificate: reuses the one kept in signing/ios/dist.enc (encrypted with a key derived from the
//      .p8, so only this repository's secrets open it); creates a new one when it's missing or Apple revoked it
//   3. a fresh App Store provisioning profile for this build (the previous CI profile is deleted)
//   4. writes credentials.json for `eas build --local` (credentialsSource local) and prints the App Store Connect
//      app id (empty until the app is created in App Store Connect) to $GITHUB_OUTPUT
// Run on macOS (openssl). node scripts/ios-signing.mjs
import { createCipheriv, createDecipheriv, createHash, randomBytes, sign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// APP_VARIANT=test: the Muntej Test app (its own bundle id, provisioning profile and App Store Connect app), never the
// store one (reviewer, 10 Nov: a test build must never share the store app's identity)
const TEST = process.env.APP_VARIANT === 'test';
const BUNDLE = TEST ? 'sa.muntej.app.test' : JSON.parse(readFileSync('app.json', 'utf8')).expo.ios.bundleIdentifier;
const PROFILE_NAME = TEST ? 'Muntej Test App Store (CI)' : 'Muntej App Store (CI)';
const STORE = 'signing/ios/dist.enc';
const WORK = 'ios-signing';
const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 } = process.env;
if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_KEY_P8) throw new Error('Missing ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_P8 secrets');
const P8 = ASC_KEY_P8.includes('BEGIN') ? ASC_KEY_P8 : `-----BEGIN PRIVATE KEY-----\n${ASC_KEY_P8}\n-----END PRIVATE KEY-----`;
mkdirSync(WORK, { recursive: true });

// ---------- App Store Connect API ----------
const b64url = (b) => Buffer.from(b).toString('base64url');
function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss: ASC_ISSUER_ID, iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' }));
  const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key: P8, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64url(sig)}`;
}
async function api(method, path, data) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: data ? JSON.stringify({ data }) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 600)}`);
    err.status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : {};
}

// ---------- 1. bundle id ----------
const found = await api('GET', `/v1/bundleIds?filter[identifier]=${BUNDLE}&limit=200`);
let bundle = found.data.find((b) => b.attributes.identifier === BUNDLE);
if (!bundle) {
  bundle = (await api('POST', '/v1/bundleIds', { type: 'bundleIds', attributes: { identifier: BUNDLE, name: 'Muntej', platform: 'IOS' } })).data;
  console.log(`Registered bundle id ${BUNDLE}`);
}
// Apple answers 403 to an API key asking for a capability that's already on, so look first
const caps = await api('GET', `/v1/bundleIds/${bundle.id}/bundleIdCapabilities`);
if (!caps.data.some((c) => c.attributes.capabilityType === 'PUSH_NOTIFICATIONS')) {
  try {
    await api('POST', '/v1/bundleIdCapabilities', {
      type: 'bundleIdCapabilities',
      attributes: { capabilityType: 'PUSH_NOTIFICATIONS' },
      relationships: { bundleId: { data: { type: 'bundleIds', id: bundle.id } } },
    });
  } catch (e) {
    if (e.status !== 409) throw e; // already on
  }
}

// ---------- 2. distribution certificate ----------
const secret = createHash('sha256').update(`${P8}\nmuntej-ios-signing`).digest();
const seal = (obj) => {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', secret, iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj)), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
};
const open = (s) => {
  const raw = Buffer.from(s, 'base64');
  const d = createDecipheriv('aes-256-gcm', secret, raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString());
};
const ssl = (...args) => execFileSync('/usr/bin/openssl', args, { stdio: ['ignore', 'pipe', 'inherit'] });

let kept = null;
if (existsSync(STORE)) {
  try {
    kept = open(readFileSync(STORE, 'utf8').trim());
    await api('GET', `/v1/certificates/${kept.certId}`); // still valid on Apple's side?
  } catch (e) {
    console.log(`Kept certificate not usable (${e.message.split('\n')[0]}), making a new one`);
    kept = null;
  }
}
if (!kept) {
  ssl('genrsa', '-out', `${WORK}/key.pem`, '2048');
  ssl('req', '-new', '-key', `${WORK}/key.pem`, '-out', `${WORK}/csr.pem`, '-subj', '/CN=Muntej CI/O=Muntej/C=SA');
  const csr = readFileSync(`${WORK}/csr.pem`, 'utf8');
  const cert = (await api('POST', '/v1/certificates', { type: 'certificates', attributes: { certificateType: 'DISTRIBUTION', csrContent: csr } }))
    .data;
  kept = { certId: cert.id, key: readFileSync(`${WORK}/key.pem`, 'utf8'), cer: cert.attributes.certificateContent };
  mkdirSync('signing/ios', { recursive: true });
  writeFileSync(STORE, seal(kept) + '\n');
  console.log(`Created distribution certificate ${cert.id} (saved encrypted in ${STORE})`);
}
writeFileSync(`${WORK}/key.pem`, kept.key);
writeFileSync(`${WORK}/cert.cer`, Buffer.from(kept.cer, 'base64'));
ssl('x509', '-inform', 'DER', '-in', `${WORK}/cert.cer`, '-out', `${WORK}/cert.pem`);
const p12Password = randomBytes(18).toString('base64url');
ssl('pkcs12', '-export', '-inkey', `${WORK}/key.pem`, '-in', `${WORK}/cert.pem`, '-out', `${WORK}/dist.p12`, '-passout', `pass:${p12Password}`);

// ---------- 3. provisioning profile ----------
const profiles = await api('GET', `/v1/profiles?filter[name]=${encodeURIComponent(PROFILE_NAME)}&limit=200`);
for (const p of profiles.data) await api('DELETE', `/v1/profiles/${p.id}`).catch(() => {});
const profile = (
  await api('POST', '/v1/profiles', {
    type: 'profiles',
    attributes: { name: PROFILE_NAME, profileType: 'IOS_APP_STORE' },
    relationships: {
      bundleId: { data: { type: 'bundleIds', id: bundle.id } },
      certificates: { data: [{ type: 'certificates', id: kept.certId }] },
    },
  })
).data;
writeFileSync(`${WORK}/profile.mobileprovision`, Buffer.from(profile.attributes.profileContent, 'base64'));

// ---------- 4. outputs ----------
writeFileSync(
  'credentials.json',
  JSON.stringify(
    {
      ios: {
        provisioningProfilePath: `${WORK}/profile.mobileprovision`,
        distributionCertificate: { path: `${WORK}/dist.p12`, password: p12Password },
      },
    },
    null,
    2,
  ),
);
const apps = await api('GET', `/v1/apps?filter[bundleId]=${BUNDLE}`);
const appId = apps.data.find((a) => a.attributes.bundleId === BUNDLE)?.id ?? '';
console.log(appId ? `App Store Connect app: ${appId}` : 'No app in App Store Connect yet for this bundle id');
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `asc_app_id=${appId}\n`);
