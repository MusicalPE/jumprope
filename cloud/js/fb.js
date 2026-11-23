// 파이어베이스와 이야기하는 곳은 이 파일 하나 (시험 때는 dev/cloud/fb-mock.js 로 바꿔 끼움)
// 값 안의 특별한 표시: INC(n) 더하기 · DEL 지우기 · NOW 서버 시각
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signInAnonymously, signOut as fbSignOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeFirestore, doc, collection, getDoc as fsGet, setDoc as fsSet, updateDoc as fsUpdate, addDoc as fsAdd, deleteDoc as fsDelete, getDocs, writeBatch, increment, deleteField, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from '../firebase-config.js';

export const INC = (n) => ({ __inc: n });
export const DEL = { __del: 1 };
export const NOW = { __now: 1 };

let app, auth, db;
export function init() {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  getRedirectResult(auth).catch(() => {});
}

// ---- 로그인 ----
function wrapUser(u) { return u ? { uid: u.uid, anon: u.isAnonymous, name: u.displayName || '', email: u.email || '' } : null; }
export function onUser(cb) { return onAuthStateChanged(auth, (u) => cb(wrapUser(u))); }
export function user() { return wrapUser(auth.currentUser); }
export async function signInGoogle() {
  const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
  try { await signInWithPopup(auth, p); }
  catch (e) {
    if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) return signInWithRedirect(auth, p);
    if (e && (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request')) return;
    throw e;
  }
}
export async function signInAnon() { if (auth.currentUser) return; await signInAnonymously(auth); }
export function signOut() { return fbSignOut(auth); }

// ---- 문서 ----
function conv(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    if ('__inc' in v) return increment(v.__inc);
    if ('__del' in v) return deleteField();
    if ('__now' in v) return serverTimestamp();
    const o = {}; for (const k in v) o[k] = conv(v[k]); return o;
  }
  return v;
}
function plain(v) {
  if (v instanceof Timestamp) return v.toMillis();
  if (v && typeof v === 'object' && !Array.isArray(v)) { const o = {}; for (const k in v) o[k] = plain(v[k]); return o; }
  if (Array.isArray(v)) return v.map(plain);
  return v;
}
const ref = (p) => doc(db, p);
export async function get(path) { const s = await fsGet(ref(path)); return s.exists() ? plain(s.data()) : null; }
export function set(path, data, merge) { return fsSet(ref(path), conv(data), merge ? { merge: true } : {}); }
export function update(path, data) { return fsUpdate(ref(path), conv(data)); }   // data 키에 'a.b.c' 점 경로 가능
export async function add(colPath, data) { const r = await fsAdd(collection(db, colPath), conv(data)); return r.id; }
export function del(path) { return fsDelete(ref(path)); }
export async function list(colPath) { const q = await getDocs(collection(db, colPath)); return q.docs.map((d) => ({ id: d.id, data: plain(d.data()) })); }
// ops: [['set', path, data, merge?], ['update', path, data], ['del', path]]  — 450개씩 끊어서
export async function batch(ops) {
  for (let i = 0; i < ops.length; i += 450) {
    const b = writeBatch(db);
    ops.slice(i, i + 450).forEach((o) => {
      if (o[0] === 'set') b.set(ref(o[1]), conv(o[2]), o[3] ? { merge: true } : {});
      else if (o[0] === 'update') b.update(ref(o[1]), conv(o[2]));
      else if (o[0] === 'del') b.delete(ref(o[1]));
    });
    await b.commit();
  }
}
export function errText(e) {
  const c = (e && e.code) || '';
  if (c.includes('permission-denied')) return '권한이 없어요. 로그인했는지, 이 공간의 선생님인지 확인해 주세요.';
  if (c.includes('unavailable') || c.includes('network')) return '인터넷 연결을 확인해 주세요.';
  if (c.includes('admin-restricted-operation') || c.includes('operation-not-allowed')) return '학생 입장(익명 로그인)이 아직 켜져 있지 않아요. (운영자: 파이어베이스 Authentication → 로그인 방법 → 익명 사용 설정)';
  if (c.includes('unauthorized-domain')) return '이 주소에서는 구글 로그인을 쓸 수 없어요. (운영자: 파이어베이스 승인된 도메인 확인)';
  return (e && e.message) || String(e);
}
