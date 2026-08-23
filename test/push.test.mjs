import assert from 'node:assert/strict';
const { encrypt, vapidAuth, b64u } = await import('../push-server/webpush.js');
const wc = globalThis.crypto;
const te = new TextEncoder(), td = new TextDecoder();
async function hkdf(salt, ikm, info, len) {
  const key = await wc.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await wc.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}
const concat = (...arrs) => { const out = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0)); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; };
let pass = 0;
{
  const ua = await wc.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaPub = new Uint8Array(await wc.subtle.exportKey('raw', ua.publicKey));
  const auth = wc.getRandomValues(new Uint8Array(16));
  const payload = JSON.stringify({ title: 'Лун', body: 'проверка 400' });
  const box = await encrypt(payload, b64u.enc(uaPub), b64u.enc(auth));
  const salt = box.slice(0, 16), idlen = box[20], asPub = box.slice(21, 21 + idlen), ct = box.slice(21 + idlen);
  assert.equal(idlen, 65);
  const asKey = await wc.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await wc.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
  const ikm = await hkdf(auth, ecdh, concat(te.encode('WebPush: info\0'), uaPub, asPub), 32);
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await wc.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await wc.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ct));
  assert.equal(plain[plain.length - 1], 2, 'delimiter');
  assert.equal(td.decode(plain.slice(0, -1)), payload);
  pass++;
}
{
  const kp = await wc.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = new Uint8Array(await wc.subtle.exportKey('raw', kp.publicKey));
  const priv = new Uint8Array(await wc.subtle.exportKey('pkcs8', kp.privateKey));
  const hdr = await vapidAuth('https://web.push.apple.com/ABC', 'mailto:t@e.st', b64u.enc(pub), b64u.enc(priv));
  const m = hdr.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.ok(m, 'header shape');
  const [h, b, sig] = m[1].split('.');
  const claims = JSON.parse(td.decode(b64u.dec(b)));
  assert.equal(claims.aud, 'https://web.push.apple.com');
  assert.ok(claims.exp > Date.now() / 1000 + 3600);
  const vkey = await wc.subtle.importKey('raw', b64u.dec(m[2]), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const okSig = await wc.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vkey, b64u.dec(sig), te.encode(h + '.' + b));
  assert.ok(okSig, 'signature verifies');
  pass++;
}
console.log('push tests passed:', pass);
