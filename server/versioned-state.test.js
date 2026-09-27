const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  attachRevision,
  revisionOf,
  writeVersionedState,
} = require('./versioned-state');

function fakeSql(initial) {
  let row = {data: structuredClone(initial), revision: 0};
  return async function sql(strings, ...values) {
    const query = strings.join('?');
    if (/SELECT data, revision FROM goy_state/.test(query)) return [structuredClone(row)];
    if (/UPDATE goy_state/.test(query)) {
      const json = values[0];
      const expected = Number(values[1]);
      if (row.revision !== expected) return [];
      row = {data: JSON.parse(json), revision: row.revision + 1};
      return [{revision: row.revision}];
    }
    throw new Error('SQL no esperado en prueba: ' + query);
  };
}

test('una escritura obsoleta no puede borrar una actualización concurrente', async () => {
  const sql = fakeSql({requests:[{code:'GX-1',status:'Pendiente'}],users:[]});
  const normalize = value => value;

  const first = attachRevision({requests:[{code:'GX-1',status:'En camino'}],users:[]}, 0);
  const stale = attachRevision({requests:[{code:'GX-1',status:'Pendiente'}],users:[{id:'nuevo'}]}, 0);

  await writeVersionedState(sql, first, normalize);
  assert.equal(revisionOf(first), 1);

  await assert.rejects(
    () => writeVersionedState(sql, stale, normalize),
    error => error?.code === 'STATE_CONFLICT' && error?.status === 409
  );
});

test('los escritores conocidos de goy_state usan la capa versionada', () => {
  const root = path.join(__dirname, '..');
  const files = [
    'server/server-v5.js',
    'server/admin-clients.js',
    'server/admin-management.js',
    'server/courier-profile.js',
    'cloudflare-entry.js',
    'cloudflare-admin-client-create.js',
    'cloudflare-login-v2.js',
    'cloudflare-auth-proof.js',
  ];
  for (const relative of files) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.match(source, /writeVersionedState/, relative + ' debe usar writeVersionedState');
    assert.doesNotMatch(source, /UPDATE goy_state SET data\s*=/, relative + ' no debe escribir goy_state directamente');
  }
});
