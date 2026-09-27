const REVISION = Symbol.for('goy.state.revision');

export function attachRevision(state, revision) {
  if (!state || typeof state !== 'object') return state;
  Object.defineProperty(state, REVISION, {
    value: Number(revision || 0),
    writable: true,
    configurable: true,
    enumerable: false,
  });
  return state;
}

export function revisionOf(state) {
  return Number(state && state[REVISION] || 0);
}

export function stateConflict() {
  const error = new Error('Los datos cambiaron mientras se procesaba la operación. Intenta nuevamente.');
  error.status = 409;
  error.code = 'STATE_CONFLICT';
  return error;
}

export async function ensureStateTable(sql, emptyState) {
  await sql`CREATE TABLE IF NOT EXISTS goy_state (
    id INTEGER PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`ALTER TABLE goy_state ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0`;
  await sql`INSERT INTO goy_state (id, data, revision)
    VALUES (1, ${JSON.stringify(emptyState)}::jsonb, 0)
    ON CONFLICT (id) DO NOTHING`;
}

export async function readVersionedState(sql, normalize) {
  const rows = await sql`SELECT data, revision FROM goy_state WHERE id = 1 LIMIT 1`;
  return attachRevision(normalize(rows[0]?.data || {}), rows[0]?.revision || 0);
}

export async function writeVersionedState(sql, state, normalize) {
  const normalized = normalize(state);
  const expected = revisionOf(state);
  const rows = await sql`UPDATE goy_state
    SET data = ${JSON.stringify(normalized)}::jsonb,
        revision = revision + 1,
        updated_at = NOW()
    WHERE id = 1 AND revision = ${expected}
    RETURNING revision`;
  if (!rows.length) throw stateConflict();
  attachRevision(state, rows[0].revision);
  return Number(rows[0].revision);
}
