/* Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) на чистом WebCrypto — работает в Cloudflare Workers и Node 20+. */
const te = new TextEncoder();
export const b64u = {
  enc: buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: s => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : ''; const bin = atob(s + pad); return new Uint8Array([...bin].map(c => c.charCodeAt(0))); },
};
const concat = (...arrs) => { const out = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0)); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; };
const u32 = n => new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}
export async function encrypt(payload, p256dh, auth) {
  const uaPub = b64u.dec(p256dh), authSecret = b64u.dec(auth);
  const asKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(te.encode('WebPush: info\0'), uaPub, asPubRaw), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const plain = concat(te.encode(payload), new Uint8Array([2]));
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plain));
  return concat(salt, u32(4096), new Uint8Array([asPubRaw.length]), asPubRaw, ct);
}
export async function vapidAuth(endpoint, subject, pubB64u, privPkcs8B64u) {
  const { origin } = new URL(endpoint);
  const head = b64u.enc(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u.enc(te.encode(JSON.stringify({ aud: origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const unsigned = head + '.' + body;
  const key = await crypto.subtle.importKey('pkcs8', b64u.dec(privPkcs8B64u), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(unsigned)));
  return `vapid t=${unsigned}.${b64u.enc(sig)}, k=${pubB64u}`;
}
export async function sendPush(sub, payload, vapid) {
  const body = await encrypt(payload, sub.keys.p256dh, sub.keys.auth);
  const auth = await vapidAuth(sub.endpoint, vapid.subject, vapid.publicKey, vapid.privateKey);
  return fetch(sub.endpoint, { method: 'POST', headers: { TTL: '10800', Urgency: 'normal', 'Content-Encoding': 'aes128gcm', Authorization: auth }, body });
}
