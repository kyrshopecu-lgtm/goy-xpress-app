const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/202608250001_secure_access.sql'),
  'utf8',
);

test('la base impide registrar un segundo administrador', () => {
  assert.match(migration, /admin_accounts_single_admin[\s\S]*on public\.admin_accounts \(\(true\)\)/);
  assert.match(migration, /role public\.app_role not null check \(role in \('client', 'courier'\)\)/);
});

test('todas las tablas privadas tienen RLS', () => {
  for (const table of [
    'profiles',
    'admin_accounts',
    'invitations',
    'service_requests',
    'inventory_items',
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
});

test('clientes y mensajeros solo consultan solicitudes autorizadas', () => {
  assert.match(migration, /client_id = auth\.uid\(\)/);
  assert.match(migration, /courier_id = auth\.uid\(\)/);
  assert.match(migration, /or public\.is_admin\(\)/);
});

test('los tokens de invitación se almacenan como hash', () => {
  assert.match(migration, /digest\(v_token, 'sha256'\)/);
  assert.doesNotMatch(migration, /create table[\s\S]*\btoken text not null/);
});

test('el repositorio no incluye credenciales privadas', () => {
  const sourceFiles = [
    'App.js',
    'src/SecureRoot.js',
    'src/backend.js',
    'src/supabaseClient.js',
    '.env.example',
  ];
  const source = sourceFiles
    .map(file => fs.readFileSync(path.join(root, file), 'utf8'))
    .join('\n');
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY\s*=/);
  assert.doesNotMatch(source, /TWILIO_AUTH_TOKEN\s*=/);
});
