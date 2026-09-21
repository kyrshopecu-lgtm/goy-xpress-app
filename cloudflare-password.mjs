export const DEFAULT_PASSWORD_ITERATIONS = 180000;

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(value) {
  const hex = String(value || '').trim();
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return new Uint8Array();
  const output = new Uint8Array(hex.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

export async function derivePasswordHashHex(
  password,
  salt,
  iterations = DEFAULT_PASSWORD_ITERATIONS,
) {
  const count = Number(iterations);
  if (!Number.isInteger(count) || count < 1 || count > 1000000) {
    throw new Error('La configuración de seguridad de la contraseña no es válida.');
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(String(password || '')),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-512',
      salt: encoder.encode(String(salt || '')),
      iterations: count,
    },
    key,
    512,
  );
  return bytesToHex(new Uint8Array(bits));
}

export function secureHexEqual(left, right) {
  const first = hexToBytes(left);
  const second = hexToBytes(right);
  if (!first.length || first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) difference |= first[index] ^ second[index];
  return difference === 0;
}
