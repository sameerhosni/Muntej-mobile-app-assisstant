// Uploads the built design documents (docs/design/out) to the private Storage bucket "design-docs" (super admins
// only, see supabase/migrations/20261024210000_design_docs_bucket.sql). The server key is fetched for this run from the
// Management API with SUPABASE_ACCESS_TOKEN (user env var) and never written anywhere.
//   node scripts/build-design-docs.js && node scripts/upload-design-docs.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REF = 'katwiedukkvssuxbjbqf';
const BUCKET = 'design-docs';
const FILES = [
  ['Muntej-System-Design.pdf', 'application/pdf'],
  ['Muntej-API-Integration.pdf', 'application/pdf'],
  ['Muntej-Architecture.png', 'image/png'],
];

function accessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  // Windows: the user environment variable set by scripts/set-supabase-secrets.ps1
  return execSync(`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN','User')"`).toString().trim();
}

(async () => {
  const token = accessToken();
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is not set');
  const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const service = (Array.isArray(keys) ? keys : []).find((k) => k.name === 'service_role' || k.type === 'secret')?.api_key;
  if (!service) throw new Error('Could not get the server key');
  const out = path.join(__dirname, '..', 'docs', 'design', 'out');
  for (const [name, type] of FILES) {
    const res = await fetch(`https://${REF}.supabase.co/storage/v1/object/${BUCKET}/${name}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${service}`, apikey: service, 'Content-Type': type, 'x-upsert': 'true', 'Cache-Control': 'no-cache' },
      body: fs.readFileSync(path.join(out, name)),
    });
    console.log(name, res.ok ? 'uploaded' : `failed ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
