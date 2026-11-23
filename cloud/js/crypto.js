// 점퍼스 클라우드판 암호화 도구 (더그아웃! 과 같은 방식)
// - 공간 키: 무작위 AES-GCM 256비트 키 (학생 정보는 모두 이 키로 잠근다)
// - 공간 키는 공간 비밀번호(또는 복구 코드)에서 만든 키로 한 번 더 잠가서 저장한다 (PBKDF2-SHA256)
// - 기록 하나를 잠글 때마다 새 무작위 IV를 써서, 같은 이름이라도 매번 다른 암호문이 된다
// - 길이를 256바이트 단위로 채워서 이름 길이로 짐작할 수 없게 한다
// - 문서 위치(팀·모음·문서 번호)를 함께 묶어(AAD) 다른 자리로 옮겨 붙이면 풀리지 않게 한다

const te = new TextEncoder();
const td = new TextDecoder();
export const ITER = 310000;
const BUCKET = 256;

export function rand(n) { return crypto.getRandomValues(new Uint8Array(n)); }
export function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); }
export function ub64(s) { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

async function deriveKek(secret, salt, iter) {
  const base = await crypto.subtle.importKey('raw', te.encode(secret.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function newTeamKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

// 공간 키를 비밀번호로 잠근다
export async function wrapKey(key, secret) {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  const salt = rand(16), iv = rand(12);
  const kek = await deriveKek(secret, salt, ITER);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, raw));
  raw.fill(0);
  return { v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct), iter: ITER };
}

// 비밀번호로 공간 키를 푼다 (틀리면 예외)
export async function unwrapKey(w, secret, extractable = true) {
  const kek = await deriveKek(secret, ub64(w.salt), w.iter || ITER);
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub64(w.iv) }, kek, ub64(w.ct));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, extractable, ['encrypt', 'decrypt']);
}

// 기기에 기억해 둘 때는 꺼낼 수 없는(non-extractable) 사본으로 만든다
export async function lockedCopy(key) {
  const raw = await crypto.subtle.exportKey('raw', key);
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

// 기록 하나 잠그기
export async function seal(key, obj, aad) {
  const data = te.encode(JSON.stringify(obj));
  const size = Math.ceil((data.length + 4) / BUCKET) * BUCKET;
  const buf = rand(size); // 남는 칸은 무작위 바이트로 채움
  new DataView(buf.buffer).setUint32(0, data.length);
  buf.set(data, 4);
  const iv = rand(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(aad) }, key, buf));
  return { v: 1, iv: b64(iv), ct: b64(ct) };
}

// 기록 하나 풀기
export async function open(key, box, aad) {
  const buf = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub64(box.iv), additionalData: te.encode(aad) }, key, ub64(box.ct)));
  const len = new DataView(buf.buffer).getUint32(0);
  return JSON.parse(td.decode(buf.slice(4, 4 + len)));
}

// 복구 코드: 헷갈리는 글자(0,O,1,I,L)를 뺀 20자, 4자씩 끊어 보여 줌
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newRecoveryCode() {
  const r = rand(20); let s = '';
  for (let i = 0; i < 20; i++) s += ALPHA[r[i] % ALPHA.length];
  return s.match(/.{4}/g).join('-');
}
export function normRecovery(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
export function looksLikeRecovery(s) { const n = normRecovery(s); return n.length === 20 && [...n].every(c => ALPHA.includes(c)); }

// 기기에 키 기억하기 (IndexedDB, 꺼낼 수 없는 키만 저장)
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('jumpus-keys', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('keys');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
export async function rememberKey(id, key) {
  try { const db = await idb(); const k = await lockedCopy(key); await new Promise((res, rej) => { const t = db.transaction('keys', 'readwrite'); t.objectStore('keys').put(k, id); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch (e) { /* 기억 못 해도 쓰는 데는 문제없음 */ }
}
export async function recallKey(id) {
  try { const db = await idb(); return await new Promise((res) => { const t = db.transaction('keys', 'readonly'); const q = t.objectStore('keys').get(id); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch (e) { return null; }
}
export async function forgetKey(id) {
  try { const db = await idb(); await new Promise((res) => { const t = db.transaction('keys', 'readwrite'); t.objectStore('keys').delete(id); t.oncomplete = res; t.onerror = res; }); } catch (e) { }
}

// ---- 점퍼스에서 더한 것 ----
// 학생 QR 에 넣을 공간 키 (주소 # 뒤 — 서버로 가지 않음)
export function b64url(u8) { return b64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export function ub64url(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return ub64(s); }
export async function exportKeyUrl(key) { return b64url(new Uint8Array(await crypto.subtle.exportKey('raw', key))); }
export async function importKeyUrl(s) { return crypto.subtle.importKey('raw', ub64url(s), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }
// 학생 비밀번호 확인용 (공간·학생 번호를 섞은 SHA-256)
export async function pwHash(sid, stu, pw) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode('jumpus|' + sid + '|' + stu + '|' + String(pw).normalize('NFC'))));
  return b64(h).slice(0, 24);
}
export function randId(n) { const A = 'abcdefghijkmnpqrstuvwxyz23456789'; const r = rand(n); let s = ''; for (let i = 0; i < n; i++) s += A[r[i] % A.length]; return s; }
