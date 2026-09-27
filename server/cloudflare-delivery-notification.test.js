const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Cloudflare notifica al cliente solo después de una entrega exitosa', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'cloudflare-entry.js'), 'utf8');

  assert.match(source, /async function notifyClientDelivery\(env, code\)/);
  assert.match(source, /const deliveryMatch = path\.match\(\/\^\\\/api\\\/requests\\\/\(\[\^\/\]\+\)\\\/delivery\$\/\)/);
  assert.match(source, /const response = await worker\.fetch\(request, env, ctx\)/);
  assert.match(source, /if \(response\.ok\) \{/);
  assert.match(source, /notifyClientDelivery\(env, decodeURIComponent\(deliveryMatch\[1\]\)\)/);

  const deliveryRoute = source.slice(source.indexOf('const deliveryMatch'), source.indexOf("if (path === '/admin'"));
  assert.ok(
    deliveryRoute.indexOf('response.ok') < deliveryRoute.indexOf('notifyClientDelivery'),
    'La notificación debe ejecutarse únicamente después de confirmar que la entrega fue aceptada.'
  );
});

test('la notificación de entrega usa el cliente vinculado y el evento correcto', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'cloudflare-entry.js'), 'utf8');
  const start = source.indexOf('async function notifyClientDelivery');
  const end = source.indexOf('async function readAdminStateLight', start);
  const fn = source.slice(start, end);

  assert.match(fn, /request\.clientId/);
  assert.match(fn, /user\.role === 'client'/);
  assert.match(fn, /title:'Entrega realizada'/);
  assert.match(fn, /type:'client_delivery_complete'/);
  assert.match(fn, /sendExpoPush\(client/);
});
