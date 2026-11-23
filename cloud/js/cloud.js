// 점퍼스 클라우드판 — 지금 점퍼스 화면(index.html)을 그대로 쓰고, 저장하는 곳만 파이어베이스로 바꿈
// · 학교 껍데기(Shell.gs)를 미리보기(demo.js)처럼 이 브라우저 안에서 돌림. 구글 시트 대신 "가짜 표"를 쓰고,
//   그 표를 공간 키로 잠가서 Firestore 에 저장함 → 운영자도 학생 이름·기록을 볼 수 없음
// · 선생님: 구글 로그인 + 공간 비밀번호(이 기기에서 한 번). 표 전체를 읽고 씀
// · 학생: QR 하나(열쇠는 주소 # 뒤). 표를 읽기만 하고, 새 기록은 inbox 에 한 줄씩 쌓음 → 선생님 화면이 표에 합침
import * as fb from './fb.js';
import * as C from './crypto.js';
import { sha256Bytes, Sheet } from './gasfake.js';
import * as L from './lite.js';

const CLOUD_VERSION = '3.0.0';   // 점퍼스 3.0.0 — 화면에는 '클라우드판'이라 하지 않고 점퍼스 3 으로 부름 (시트로 쓰는 2.x 와 구분)
const APPV = window.APP, SID = APPV.shellUrl || '';
const BASE = location.origin + location.pathname;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
const never = () => new Promise(() => {});
const BRIDGE = !!APPV.bridge;      // 판정기 같은 다른 화면이 불러 쓸 때 (화면을 그리지 않고 오류로 알림)
function needUi(draw, text) { if (BRIDGE) throw new Error(text || '앱에서 다시 열어 주세요.'); draw(); return never(); }

// 학생 QR 로 들어왔으면 열쇠를 이 기기에 기억하고 주소창에서는 지움
function takeHash() {
  if (!SID || !location.hash) return false;
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('k') && h.get('w')) { ls.set('jumpus:stu:' + SID, { k: h.get('k'), w: h.get('w') }); history.replaceState(null, '', location.pathname + location.search); return true; }
  return false;
}
takeHash();
window.addEventListener('hashchange', () => { if (takeHash()) location.reload(); });

const style = document.createElement('style');
style.textContent = '.jc-msg{padding:10px 12px;border-radius:10px;margin:10px 0;font-weight:700;font-size:.9em}.jc-ok{background:#DCFCE7;color:#14532D}.jc-err{background:#FEE2E2;color:#7F1D1D}.jc-warn{background:#FEF3C7;color:#78350F}' +
  '.jc-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.jc-code{font-family:ui-monospace,Menlo,monospace;font-size:1.3em;letter-spacing:.08em;background:var(--bg);padding:10px 14px;border-radius:10px;display:inline-block;font-weight:800}' +
  '.jc-recovery{font-family:ui-monospace,Menlo,monospace;font-size:1.3em;font-weight:800;letter-spacing:.05em;background:#FEF3C7;padding:14px;border-radius:12px;text-align:center;word-break:break-all;color:#78350F}' +
  '.jc-spaces a{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border:1px solid var(--line);border-radius:12px;text-decoration:none;color:var(--ink);font-weight:800;margin-bottom:8px;background:#fff}.jc-spaces a:hover{border-color:var(--coral)}' +
  '.jc-chk{display:flex;gap:8px;align-items:center;color:var(--ink);font-size:.92em}.jc-qr{background:#fff;padding:12px;border:1px solid var(--line);border-radius:14px;width:220px}.jc-qr svg{width:100%;height:auto;display:block}' +
  '.admin-nav a.jc-space{display:block!important;white-space:nowrap;flex:0 0 auto}button.jc-danger{background:#fff;color:#DC2626;border:1px solid #FEE2E2;box-shadow:none}button.jc-danger:hover{background:#FEE2E2}';
document.head.appendChild(style);

function view(html) { const el = $('#app'); if (!el) return; el.innerHTML = html; window.scrollTo(0, 0); }
function shell(title, sub, body) { return '<div class="boot-wrap"><div class="card"><div class="boot-hero"><h1>' + esc(title) + '</h1><p>' + esc(sub || '') + '</p></div>' + body + '</div><p class="hint" style="text-align:center">점퍼스 ' + CLOUD_VERSION + ' · 학생 정보는 모두 암호화해서 저장합니다</p></div>'; }
function msg(sel, text, kind) { const el = typeof sel === 'string' ? $(sel) : sel; if (el) el.innerHTML = text ? '<div class="jc-msg jc-' + (kind || 'ok') + '">' + esc(text) + '</div>' : ''; }
function busy(b, on) { if (!b) return; b.disabled = on; if (on) { b.dataset.t = b.textContent; b.textContent = '잠시만요…'; } else if (b.dataset.t) b.textContent = b.dataset.t; }

// ================= 상태 =================
const S = { user: null, mode: '', key: null, wtok: '', space: null, pub: null };
let userReady;                       // 로그인 상태를 처음 한 번 알게 되면 풀림
fb.init();
let firstUser; userReady = new Promise((ok) => { firstUser = ok; });
let lastSig = null;
fb.onUser((u) => {
  S.user = u; const sig = u ? u.uid + (u.anon ? 'a' : 'g') : '-';
  if (lastSig === null) { lastSig = sig; firstUser(); return; }
  if (sig !== lastSig) { lastSig = sig; if (!BRIDGE) location.reload(); }   // 로그인·로그아웃하면 처음부터 다시
});

// ================= 들어가기 (공간 열기) =================
let opening = null;
function open() { if (!opening) opening = doOpen(); return opening; }
async function doOpen() {
  await userReady;
  const u = S.user, stuCred = ls.get('jumpus:stu:' + SID);
  if (u && !u.anon) {
    let space = null; try { space = await fb.get('spaces/' + SID); } catch (e) { space = null; }
    if (space) {
      S.space = space; S.mode = 'teacher'; S.wtok = space.wtok;
      S.key = await C.recallKey(SID);
      if (S.key) { try { await C.open(S.key, space.crypto.check, SID + '/check'); } catch (e) { S.key = null; await C.forgetKey(SID); } }
      if (!S.key) return needUi(viewUnlock, '이 기기에서 공간을 먼저 열어 주세요.');
      return afterOpen();
    }
    if (!stuCred) return needUi(viewNotMember, '이 공간의 선생님이 아니에요.');
  }
  if (stuCred) {
    if (!u) { if (BRIDGE) { await fb.signInAnon(); await new Promise((ok) => setTimeout(ok, 300)); if (!S.user) throw new Error('앱에서 다시 열어 주세요.'); } else { try { await fb.signInAnon(); } catch (e) { viewFail(e); } return never(); } }   // 로그인되면 onUser 가 새로 고침
    S.mode = 'student'; S.wtok = stuCred.w;
    try { S.key = await C.importKeyUrl(stuCred.k); } catch (e) { ls.del('jumpus:stu:' + SID); return needUi(() => viewNeedQR('QR 정보가 올바르지 않아요. 선생님 QR을 다시 찍어 주세요.'), 'QR을 다시 찍어 주세요.'); }
    APPV.stuLink = BASE + '?s=' + SID + '#k=' + stuCred.k + '&w=' + stuCred.w;
    return afterOpen();
  }
  return needUi(viewNeedQR, '선생님 QR을 찍고 들어온 뒤에 써 주세요.');
}
async function afterOpen() {
  S.pub = await fb.get('spaces/' + SID + '/meta/pub');
  if (!S.pub) throw new Error('이 공간을 찾을 수 없어요. 주소나 QR을 확인해 주세요.');
  try { S.flags = await fb.get('spaces/' + SID + '/meta/flags'); } catch (e) { S.flags = null; }   // 운영자가 콘솔에서만 켜는 표시 (live: 전용 점프 라이브)
  if (S.mode === 'teacher') { const q = await C.open(S.key, S.space.qbox, SID + '/qbox'); APPV.stuLink = BASE + '?s=' + SID + '#k=' + q.k + '&w=' + S.space.wtok; }
  await bootShell();
  await loadBook(true);
  return true;
}
const isTeacher = () => S.mode === 'teacher';

// ================= 껍데기(Shell.gs)를 이 브라우저에서 돌리기 =================
let SH = null;                       // 껍데기 함수들
const book = { sheets: {}, getName() { return (S.pub && S.pub.name) || '줄넘기 기록'; }, getId() { return SID; }, getUrl() { return ''; },
  getSheetByName(n) { return this.sheets[n] || null; }, insertSheet(n) { const s = new Sheet(n); this.sheets[n] = s; return s; },
  getSheets() { return Object.keys(this.sheets).map((k) => this.sheets[k]); }, deleteSheet(s) { delete this.sheets[s.name]; } };
let props = {};                      // 껍데기 '스크립트 속성'
let cache = ls.get('jumpus:cache:' + SID) || {};   // 판정기 통행증(CAM_)은 다른 탭(판정기)에서도 읽어야 해서 이 기기에 기억
function saveCache() { const o = {}; Object.keys(cache).forEach((k) => { if (/^CAM_|^JL_sv_|^JL_host_/.test(k) && cache[k].e > Date.now()) o[k] = cache[k]; }); ls.set('jumpus:cache:' + SID, o); }
const LOCAL_PROP = /^AT_/;           // 이 기기에만 두는 것 (관리자 통행증)
const SECRET_PROPS = ['GEMINI_KEY', 'ADMIN_HASH', 'EXTRA_SETTINGS'];   // 선생님만 읽는 문서에 둠 (EXTRA_SETTINGS 는 비밀 키를 뺀 사본을 공개 쪽에도 둠)
const Props = {
  getProperty(k) { return Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null; },
  setProperty(k, v) { props[k] = String(v); return Props; },
  setProperties(o) { Object.keys(o || {}).forEach((k) => { props[k] = String(o[k]); }); return Props; },
  deleteProperty(k) { delete props[k]; return Props; },
  getProperties() { return Object.assign({}, props); }, getKeys() { return Object.keys(props); }
};
const alive = (k) => { const x = cache[k]; if (!x) return null; if (x.e < Date.now()) { delete cache[k]; return null; } return x.v; };
const Cache = { get: alive, put(k, v, ttl) { cache[k] = { v: String(v), e: Date.now() + (ttl || 600) * 1000 }; }, remove(k) { delete cache[k]; },
  getAll(ks) { const o = {}; (ks || []).forEach((k) => { const v = alive(k); if (v !== null) o[k] = v; }); return o; },
  putAll(o, ttl) { Object.keys(o || {}).forEach((k) => Cache.put(k, o[k], ttl)); }, removeAll(ks) { (ks || []).forEach((k) => { delete cache[k]; }); } };
const lock = { waitLock() {}, tryLock() { return true; }, releaseLock() {}, hasLock() { return true; } };
const pad = (n) => (n < 10 ? '0' : '') + n;
function formatDate(d, tz, fmt) {    // 늘 한국 시각으로
  if (!(d instanceof Date)) d = new Date(d);
  const k = new Date(d.getTime() + 9 * 3600000);
  const y = k.getUTCFullYear(), M = k.getUTCMonth() + 1, D = k.getUTCDate(), h = k.getUTCHours(), mi = k.getUTCMinutes(), s = k.getUTCSeconds();
  return fmt.replace(/yyyy|MM|dd|HH|mm|ss|M|d|E/g, (t) => ({ yyyy: y, MM: pad(M), dd: pad(D), HH: pad(h), mm: pad(mi), ss: pad(s), M: M, d: D, E: '일월화수목금토'[k.getUTCDay()] }[t]));
}
function urlFetch(url, o) {          // 껍데기는 기다리지 않고 바로 답을 받아야 해서 동기 요청 (전국 현황판 보내기·AI 한마디 — 선생님 화면에서만)
  o = o || {};
  const x = new XMLHttpRequest(); x.open(String(o.method || 'get').toUpperCase(), url, false);
  const ct = /script\.google\.com/.test(url) ? 'text/plain;charset=utf-8' : (o.contentType || '');
  if (ct && o.payload != null) x.setRequestHeader('Content-Type', ct);
  x.send(o.payload != null ? o.payload : null);
  return { getContentText() { return x.responseText; }, getResponseCode() { return x.status; } };
}
const G = {
  SpreadsheetApp: { getActiveSpreadsheet() { return book; }, openById() { return book; } },
  PropertiesService: { getScriptProperties() { return Props; }, getDocumentProperties() { return Props; } },
  CacheService: { getScriptCache() { return Cache; }, getDocumentCache() { return Cache; } },
  LockService: { getScriptLock() { return lock; }, getDocumentLock() { return lock; } },
  Utilities: { getUuid() { try { return crypto.randomUUID(); } catch (e) { return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2); } },
    formatDate, computeDigest(alg, str) { return sha256Bytes(String(str)); }, DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' }, sleep() {} },
  Session: { getScriptTimeZone() { return 'Asia/Seoul'; } },
  UrlFetchApp: { fetch(url, o) { if (!isTeacher()) throw new Error('학생 화면에서는 바깥으로 보내지 않아요.'); return urlFetch(url, o); } },
  ScriptApp: { getService() { return { getUrl() { return 'cloud:' + SID; } }; } },
  ContentService: { createTextOutput(t) { return { setMimeType() { return t; } }; }, MimeType: { JSON: 'json' } },
  HtmlService: { createHtmlOutput() { return { setTitle() { return this; }, setXFrameOptionsMode() { return this; }, addMetaTag() { return this; } }; }, XFrameOptionsMode: {} },
  Logger: { log() {} }
};
async function bootShell() {
  const r = await fetch(new URL('../../Shell.gs', import.meta.url), { cache: 'no-cache' });
  if (!r.ok) throw new Error('프로그램 파일을 받지 못했어요. 새로 고쳐 주세요.');
  const src = await r.text();
  const names = []; const re = /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm; let m;
  while ((m = re.exec(src))) names.push(m[1]);
  const keys = Object.keys(G);
  const f = new Function(keys.join(','), src + '\n;return {' + names.map((n) => JSON.stringify(n) + ':' + n).join(',') + ', RPC_ALLOW_: RPC_ALLOW_, SHELL_VERSION: SHELL_VERSION, RECORDS_HEADER_: RECORDS_HEADER_};');
  SH = f.apply(null, keys.map((k) => G[k]));
}

// ================= 표 ↔ Firestore =================
const BOOK = 'spaces/' + SID + '/book', INBOX = 'spaces/' + SID + '/inbox', PRIV = 'spaces/' + SID + '/priv/secret';
const PART = 300;                    // 기록 표는 달마다, 300줄씩 나눠 저장 — 조각이 작을수록 학생 기기가 다시 받는 양이 줄어듦 (바뀌는 것은 거의 마지막 조각뿐)
const enc = (v) => (v instanceof Date ? { __d: v.getTime() } : v);
const dec = (v) => (v && typeof v === 'object' && '__d' in v ? new Date(v.__d) : v);
const rowsJson = (rows) => JSON.stringify(rows.map((r) => r.map(enc)));
const rowsParse = (j) => JSON.parse(j).map((r) => r.map(dec));
let synced = {};                     // 문서 이름 → 마지막으로 맞춘 내용(JSON)
let syncedPriv = '';
let inboxIds = [];                   // 이번에 읽은 inbox 문서들 (선생님 화면이 표에 합친 뒤 지움)
let recBase = 0;                     // 학생 화면: 읽어 온 기록 줄 수 (이 뒤로 붙은 줄이 새 기록)
let recSnap = [];                    // 학생 화면: 읽어 온 기록 줄의 [횟수, 상태] (판정기가 같은 날 줄에 더했을 때 늘어난 만큼만 올리려고)
let loadedAt = 0;
const seal = (name, text) => C.seal(S.key, { t: text }, SID + '/book/' + name);
const unseal = async (name, box) => (await C.open(S.key, box, SID + '/book/' + name)).t;

// ---- 읽기 수 아끼기 ----
// 받아 온 문서(암호문 그대로)를 이 기기에 두고, 다음부터는 "그 뒤로 바뀐 문서"만 물어봄. 한 달에 한 번은 전부 다시 읽어 맞춤
const FULL_MS = 30 * 864e5;
let CB = null;                       // { docs: {이름: {box, at}}, inbox: {id: {box, t}}, curAt, curT, fullAt }
function cdb() { return new Promise((ok, no) => { const r = indexedDB.open('jumpus-book', 1); r.onupgradeneeded = () => r.result.createObjectStore('book'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); }
async function cacheGet() { try { const db = await cdb(); return await new Promise((ok) => { const q = db.transaction('book', 'readonly').objectStore('book').get(SID); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }); } catch (e) { return null; } }
async function cachePut() { try { const db = await cdb(); await new Promise((ok) => { const t = db.transaction('book', 'readwrite'); t.objectStore('book').put(CB, SID); t.oncomplete = ok; t.onerror = ok; }); } catch (e) {} }
async function cacheDrop() { CB = null; try { const db = await cdb(); await new Promise((ok) => { const t = db.transaction('book', 'readwrite'); t.objectStore('book').delete(SID); t.oncomplete = ok; t.onerror = ok; }); } catch (e) {} }
let privDoc = null, privAt = 0;
const plainMemo = {};                // 문서 이름 → { iv, t } (같은 암호문을 다시 풀지 않게)
const sameBox = (a, b) => !!a && !!b && ((a.gone && b.gone) || (!!a.box && !!b.box && a.box.iv === b.box.iv));
async function fetchBook() {
  if (!CB) CB = (await cacheGet()) || {};
  if (!CB.docs) CB = { docs: {}, inbox: {}, curAt: '', curT: '', fullAt: 0 };
  const full = !CB.fullAt || !CB.curAt || Date.now() - CB.fullAt > FULL_MS || Date.now() < CB.fullAt;
  let changed = full;
  const r = await fb.listSince(BOOK, 'at', full ? '' : CB.curAt);
  if (full) { CB.docs = {}; CB.fullAt = Date.now(); }
  r.docs.forEach((d) => { if (!sameBox(CB.docs[d.id], d.data)) { CB.docs[d.id] = d.data; changed = true; } });
  CB.curAt = r.cursor;
  // inbox: 선생님은 늘 전부(표에 합치고 지워야 해서). 학생은 표가 그대로면 그 뒤로 들어온 것만
  if (isTeacher()) { const all = await fb.list(INBOX); CB.inbox = {}; all.forEach((x) => { CB.inbox[x.id] = x.data; }); changed = true; }
  else {
    const fullIn = changed || !CB.curT, q = await fb.listSince(INBOX, 't', fullIn ? '' : CB.curT);
    if (fullIn) CB.inbox = {};
    q.docs.forEach((x) => { if (!CB.inbox[x.id]) { CB.inbox[x.id] = x.data; changed = true; } });
    CB.curT = q.cursor;
  }
  if (changed) cachePut();
  return { docs: Object.keys(CB.docs).filter((n) => CB.docs[n].box).map((n) => ({ id: n, data: CB.docs[n] })), inbox: Object.keys(CB.inbox).map((id) => ({ id, data: CB.inbox[id] })) };
}
async function loadBook(first) {
  // 선생님만 읽는 설정은 5분에 한 번만 다시 읽음 (자주 안 바뀜)
  const needPriv = isTeacher() && (first || Date.now() - privAt > 300e3);
  const [fetched, pv] = await Promise.all([fetchBook(), needPriv ? fb.get(PRIV).catch(() => null) : null]);
  if (needPriv) { privDoc = pv; privAt = Date.now(); }
  const priv = isTeacher() ? privDoc : null;
  const docs = fetched.docs, inbox = fetched.inbox;
  const got = {};
  await Promise.all(docs.map(async (d) => {
    const m = plainMemo[d.id]; if (m && m.iv === d.data.box.iv) { got[d.id] = m.t; return; }
    try { got[d.id] = await unseal(d.id, d.data.box); plainMemo[d.id] = { iv: d.data.box.iv, t: got[d.id] }; } catch (e) { console.warn('열 수 없는 문서', d.id); }
  }));
  const sheets = {}; const recParts = [];
  Object.keys(got).sort().forEach((id) => {
    if (id === 'props') return;
    if (id.indexOf('Records_') === 0) { recParts.push(id); return; }
    sheets[id] = new Sheet(id, rowsParse(got[id]));
  });
  // 기록 표: 머리줄 + 달·조각 순서대로 + 아직 합치지 않은 inbox
  const rec = []; const seen = {};
  recParts.forEach((id) => rowsParse(got[id]).forEach((r) => { if (!seen[r[0]]) { seen[r[0]] = 1; rec.push(r); } }));
  const ib = [];
  await Promise.all(inbox.map(async (x) => { if (!x.data.box) return; try { const o = await C.open(S.key, x.data.box, SID + '/inbox'); ib.push({ id: x.id, t: x.data.t || 0, row: JSON.parse(o.t).map(dec) }); } catch (e) {} }));
  ib.sort((a, b) => a.t - b.t).forEach((x) => { if (!seen[x.row[0]]) { seen[x.row[0]] = 1; rec.push(x.row); } else if (!isTeacher() && CB) delete CB.inbox[x.id]; });   // 이미 표에 합쳐진 것은 기억에서 뺌
  if (rec.length || recParts.length || ib.length) sheets.Records = new Sheet('Records', [SH.RECORDS_HEADER_.slice()].concat(rec));
  book.sheets = sheets;
  // 속성: 공개 + (선생님) 비밀 + 이 기기
  const local = ls.get('jumpus:local:' + SID) || {};
  props = Object.assign({}, got.props ? JSON.parse(got.props) : {});
  let privText = '';
  if (priv && priv.box) { try { privText = (await C.open(S.key, priv.box, SID + '/priv')).t; Object.assign(props, JSON.parse(privText)); } catch (e) {} }
  Object.assign(props, local);
  synced = got; syncedPriv = privText; inboxIds = ib.map((x) => x.id);
  recBase = sheets.Records ? sheets.Records.rows.length : 0;
  recSnap = sheets.Records ? sheets.Records.rows.map((r) => [Number(r[4]) || 0, String(r[5] || 'approved')]) : [];
  loadedAt = Date.now();
  if (isTeacher() && ib.length) await persist();   // 학생이 넣은 기록을 표에 합쳐 둠
}
function publicProps() {
  const o = {};
  Object.keys(props).forEach((k) => { if (LOCAL_PROP.test(k) || SECRET_PROPS.indexOf(k) >= 0) return; o[k] = props[k]; });
  if (props.EXTRA_SETTINGS) { try { const x = JSON.parse(props.EXTRA_SETTINGS); if (x.nat && x.nat.key) { x.nat = Object.assign({}, x.nat, { pid: SH.natPid_(x.nat.key) }); delete x.nat.key; } o.EXTRA_SETTINGS = JSON.stringify(x); } catch (e) {} }
  return o;
}
function secretProps() { const o = {}; SECRET_PROPS.forEach((k) => { if (props[k] != null) o[k] = props[k]; }); return o; }
function saveLocalProps() { const o = {}; Object.keys(props).forEach((k) => { if (LOCAL_PROP.test(k) && +props[k] > Date.now()) o[k] = props[k]; }); ls.set('jumpus:local:' + SID, o); }
const monthOf = (r) => { const d = r[3] instanceof Date ? formatDate(r[3], '', 'yyyy-MM-dd') : String(r[3] || ''); return /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : '0000-00'; };

// 선생님 화면: 바뀐 표만 다시 잠가서 올림
async function persist() {
  saveLocalProps();
  if (!isTeacher()) return persistStudent();
  const want = {};
  Object.keys(book.sheets).forEach((n) => { if (n !== 'Records') want[n] = rowsJson(book.sheets[n].rows); });
  if (book.sheets.Records) {
    const by = {}; book.sheets.Records.rows.slice(1).forEach((r) => { const m = monthOf(r); (by[m] = by[m] || []).push(r); });
    Object.keys(by).forEach((m) => { for (let i = 0; i < by[m].length; i += PART) want['Records_' + m + '_' + String(i / PART).padStart(2, '0')] = rowsJson(by[m].slice(i, i + PART)); });
  }
  want.props = JSON.stringify(publicProps());
  const ops = [];
  for (const n of Object.keys(want)) if (want[n] !== synced[n]) ops.push(['set', BOOK + '/' + n, { box: await seal(n, want[n]), at: fb.NOW }]);
  Object.keys(synced).forEach((n) => { if (!(n in want)) ops.push(['set', BOOK + '/' + n, { gone: true, at: fb.NOW }]); });   // 지우지 않고 '없어짐' 표시 — 바뀐 것만 묻는 다른 기기도 알 수 있게
  const pv = JSON.stringify(secretProps());
  if (pv !== syncedPriv && (pv !== '{}' || syncedPriv)) ops.push(['set', PRIV, { box: await C.seal(S.key, { t: pv }, SID + '/priv'), at: fb.NOW }]);
  const approval = props.APPROVAL_ON !== '0';
  if (S.pub && S.pub.approval !== approval) { ops.push(['set', 'spaces/' + SID + '/meta/pub', { approval }, true]); S.pub.approval = approval; }
  inboxIds.forEach((id) => ops.push(['del', INBOX + '/' + id]));
  if (!ops.length) return;
  await fb.batch(ops);
  if (pv !== syncedPriv) privAt = 0;   // 방금 고친 설정은 다음에 바로 다시 읽음
  synced = want; syncedPriv = pv; inboxIds = [];
}
// 학생 화면: 새로 붙은 기록 줄만 inbox 로 (다른 표는 못 고침 — 규칙이 막음)
async function persistStudent() {
  const sh = book.sheets.Records; if (!sh) return;
  const fresh = sh.rows.slice(Math.max(1, recBase));
  // 이미 있던 줄에 더해진 횟수(판정기 '한 번 더 뛰기')는 학생 기기가 고칠 수 없으니, 늘어난 만큼을 새 줄로 올림
  for (let i = 1; i < Math.min(recBase, sh.rows.length); i++) {
    // (거절된 줄은 그대로면 건드리지 않음 — 거절된 줄을 판정기가 다시 살렸을 때만 그 줄 횟수를 통째로 올림)
    const r = sh.rows[i], was = recSnap[i] || [0, 'approved'], cur = Number(r[4]) || 0, st = String(r[5] || 'approved');
    const prev = was[1] === 'rejected' ? (st === 'rejected' ? cur : 0) : was[0];
    if (cur > prev) { const d = r.slice(); d[0] = G.Utilities.getUuid(); d[1] = new Date(); d[4] = cur - prev; fresh.push(d); }
  }
  recBase = sh.rows.length; recSnap = sh.rows.map((r) => [Number(r[4]) || 0, String(r[5] || 'approved')]);
  for (const r of fresh) {
    const src = r[8] === 'rope' ? 'rope' : r[8] === 'camera' ? 'cam' : 'hand';
    await fb.add(INBOX, { box: await C.seal(S.key, { t: JSON.stringify(r.map(enc)) }, SID + '/inbox'), n: Math.round(Number(r[4]) || 0), src, st: r[5] === 'pending' ? 'wait' : 'ok', w: S.wtok, t: fb.NOW });
  }
}

// ================= 화면이 부르는 곳 =================
const FRESH_MS = { teacher: 8000, student: 20000 };
// 점프 Live 방 (lite*): 껍데기는 기기마다 따로 돌아서 방을 함께 볼 수 없음 → 실시간 데이터베이스(lite.js)로 대신함
const nameBox = { seal: async (n) => JSON.stringify(await C.seal(S.key, { n: String(n || '') }, SID + '/lite')), open: async (s) => (await C.open(S.key, JSON.parse(s), SID + '/lite')).n };
function liteWho(t) { cache = Object.assign(ls.get('jumpus:cache:' + SID) || {}, cache); return SH.liteStu_(t); }   // 판정기 통행증으로 누구인지 (앱 탭에서 받은 통행증도 읽음)
const LITE = {
  liteOpenRoom(a) { if (!SH.checkAdminToken_(a[0])) throw new Error('권한이 없습니다. 관리자 메뉴로 다시 들어와 주세요.'); return L.openRoom(SID, a[1], a[2]); },
  liteSetControl: (a) => L.setControl(SID, a[0], a[1], a[2]),
  litePull: (a) => L.pull(SID, a[0]),
  liteCloseRoom: (a) => L.closeRoom(SID, a[0]),
  liteInfo: (a) => L.info(SID, a[0]),
  liteSend: (a) => L.send(SID, a[0], a[1], a[2], a[3]),
  async liteStuOpen(a) {
    const who = liteWho(a[0]), hk = 'JL_host_' + String(a[0]);
    const r = await L.stuOpen(SID, who, a[1], JSON.parse(Cache.get(hk) || 'null'), nameBox);
    Cache.put(hk, JSON.stringify({ room: r.room, code: r.code }), 6 * 3600); saveCache(); return r;
  },
  liteStuJoin: (a) => L.stuJoin(SID, liteWho(a[0]), a[1], nameBox),
  liteStuBoard: (a) => L.stuBoard(SID, a[0], nameBox),
  liteStuLeave: (a) => L.stuLeave(SID, liteWho(a[0]), a[1])
};
let chain = Promise.resolve();
function call(fn, args) {
  if (LITE[fn]) return open().then(() => LITE[fn](args || []));   // 방 주고받기는 표 저장 줄에 세우지 않음 (3초마다 오가서)
  const run = chain.then(() => callNow(fn, args || []));
  chain = run.catch(() => {});
  return run;
}
async function callNow(fn, args, retried) {
  await open();
  if (SH.RPC_ALLOW_.indexOf(fn) < 0) throw new Error('알 수 없는 요청: ' + fn);
  if (fn === 'changeAdminPassword') throw new Error('점퍼스 3은 구글 로그인이 관리자 비밀번호를 대신해요. 공간 비밀번호는 [공간 관리]에서 바꿔요.');
  if (fn === 'verifyAdminPassword') { if (!isTeacher()) return { ok: false, message: '선생님은 구글 로그인으로 들어와 주세요.' }; args = ['1234']; }
  if (fn === 'getSheetUrlAdmin') return '';
  if (fn === 'natReportToday' && !isTeacher()) return { skipped: 'student' };
  if (Date.now() - loadedAt > FRESH_MS[S.mode]) await loadBook();
  let out;
  try { out = SH[fn].apply(null, args); }
  catch (e) { if (!isTeacher()) await loadBook().catch(() => {}); throw e; }
  try { await persist(); }
  catch (e) {
    await loadBook().catch(() => {});
    if (!isTeacher() && String(e && e.code).includes('permission-denied')) {
      // 화면을 연 뒤에 선생님이 승인 절차를 켰을 수 있음 → 새로 읽은 설정으로 한 번 더 (승인 대기로 들어감)
      if (fn === 'addRecord' && !retried && props.APPROVAL_ON === '1') return callNow(fn, args, true);
      if (fn === 'addRecord') return { ok: false, message: 'QR이 바뀌었어요. 선생님이 새로 띄운 QR을 다시 찍어 주세요.' };
      throw new Error('QR이 바뀌었어요. 선생님이 새로 띄운 QR을 다시 찍어 주세요.');
    }
    if (fn === 'addRecord') return { ok: false, message: fb.errText(e) };   // 화면이 "저장 중…"에서 멈추지 않게
    throw new Error(fb.errText(e));
  }
  out = out === undefined ? null : JSON.parse(JSON.stringify(out));
  if (fn === 'ping') { out.lite = out.lite || 1; out.live = S.flags && S.flags.live === true ? 1 : 0; out.title = book.getName(); out.cloud = CLOUD_VERSION; }
  saveCache();
  return out;
}

// 카메라 판정기가 부르는 곳 (rope_x_who · rope_x_save) — 판정기 화면에서 dev: cloud/js/bridge.js 가 이 파일을 불러 씀
function cameraApi(q) {
  const run = chain.then(async () => {
    await open();
    if (Date.now() - loadedAt > 3000) await loadBook();
    cache = Object.assign(ls.get('jumpus:cache:' + SID) || {}, cache);   // 앱 탭에서 방금 받은 통행증
    const j = JSON.parse(SH.handleCameraApi_(q));
    if (j.ok) {
      try { await persist(); } catch (e) { await loadBook().catch(() => {}); return { ok: false, error: !isTeacher() && String(e && e.code).includes('permission-denied') ? 'QR이 바뀌었어요. 선생님이 새로 띄운 QR을 다시 찍어 주세요.' : fb.errText(e) }; }
    }
    saveCache();
    return j;
  });
  chain = run.catch(() => {});
  return run;
}

// 점프 Live 큰 화면(monitor.html)이 쓰는 관리자 통행증 — 선생님(구글 로그인)이면 비밀번호 없이
async function adminToken() { await open(); if (!isTeacher()) return null; const r = await call('verifyAdminPassword', ['']); return r && r.ok ? r.token : null; }

// 관리자 메뉴 들어가기: 선생님이면 비밀번호 없이 통과
async function adminLogin(nextPage) {
  const form = $('#loginForm'); if (form) form.style.display = 'none';
  const box = $('#msg'); if (box) box.textContent = '확인하는 중…';
  try {
    await open();
    if (isTeacher()) {
      const r = await call('verifyAdminPassword', ['']);
      try { localStorage.setItem('jumpropeCloud:' + SID, JSON.stringify({ token: r.token, ts: Date.now() })); } catch (e) {}
      location.replace(APPV.base + '&page=' + encodeURIComponent(nextPage || 'admin') + '&token=' + encodeURIComponent(r.token));
    } else if (box) {
      box.innerHTML = '<p class="hint">관리자 메뉴는 선생님만 쓸 수 있어요. 선생님이라면 구글로 로그인해 주세요.</p><button type="button" id="jcG">선생님 구글 로그인</button>';
      $('#jcG').onclick = () => fb.signInGoogle().catch((e) => { box.insertAdjacentHTML('beforeend', '<div class="jc-msg jc-err">' + esc(fb.errText(e)) + '</div>'); });
    }
  } catch (e) { if (box) box.textContent = fb.errText(e); }
}

function viewFail(e) { console.error(e); view(shell('문제가 생겼어요', '', '<div class="jc-msg jc-err">' + esc(fb.errText(e)) + '</div><button type="button" onclick="location.reload()">다시 불러오기</button>')); }

// ================= 입구: 로그인 · 내 공간 · 새로 만들기 =================
async function entry() {
  view('<div class="loading">불러오는 중…</div>');
  await userReady;
  if (S.user && !S.user.anon) return viewSpaces();
  view(shell('Jump Us! 점퍼스 · 줄넘기 기록', '설치 없이, 구글 로그인만으로 시작해요',
    '<p class="hint" style="margin-top:0">선생님은 구글로 로그인해 학교 공간을 만들어요. 학생은 로그인하지 않고, 선생님이 띄운 QR을 찍으면 바로 들어와요.</p><button type="button" id="jcG">구글로 로그인</button><div id="jcM"></div>'));
  $('#jcG').onclick = () => fb.signInGoogle().catch((e) => msg('#jcM', fb.errText(e), 'err'));
}
async function viewSpaces() {
  let my = null; try { my = await fb.get('users/' + S.user.uid); } catch (e) { my = null; }
  const sp = (my && my.spaces) || {}, ids = Object.keys(sp);
  view(shell('내 학교 공간', S.user.email || S.user.name,
    (ids.length ? '<div class="jc-spaces">' + ids.map((id) => '<a href="' + esc(BASE + '?s=' + id) + '"><span>' + esc(sp[id]) + '</span><span class="hint">열기 →</span></a>').join('') + '</div>' : '<p class="hint" style="margin-top:0">아직 공간이 없어요. 새로 만들거나, 함께 쓰는 선생님께 받은 초대 코드를 넣어 주세요.</p>') +
    '<div class="jc-row" style="margin:14px 0"><button type="button" id="jcNew">새 학교 공간 만들기</button></div>' +
    '<label>초대 코드로 함께하기 <input id="jcInv" maxlength="12" autocomplete="off" placeholder="초대 코드 8자"></label><div class="jc-row"><button type="button" class="btn-outline" id="jcJoin">함께하기</button><button type="button" class="btn-outline" id="jcOut">로그아웃</button></div><div id="jcM"></div>'));
  $('#jcOut').onclick = () => fb.signOut();
  $('#jcNew').onclick = viewCreate;
  $('#jcJoin').onclick = async () => {
    const code = $('#jcInv').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 6) return msg('#jcM', '초대 코드를 확인해 주세요.', 'err');
    const b = $('#jcJoin'); busy(b, true);
    try {
      const inv = await fb.get('invites/' + code);
      if (!inv || inv.exp < Date.now()) throw new Error('초대 코드가 없거나 기한이 지났어요. 새 코드를 받아 주세요.');
      await fb.set('spaces/' + inv.sid + '/members/' + S.user.uid, { role: 'teacher', code, name: S.user.name || '', joined: fb.NOW });
      const pub = await fb.get('spaces/' + inv.sid + '/meta/pub');
      await fb.set('users/' + S.user.uid, { spaces: { [inv.sid]: (pub && pub.name) || '학교 공간' } }, true);
      location.href = BASE + '?s=' + inv.sid;
    } catch (e) { busy(b, false); msg('#jcM', fb.errText(e), 'err'); }
  };
}
function viewCreate() {
  view(shell('새 학교 공간 만들기', '학교(또는 학급)마다 하나씩 만들어요',
    '<label>학교 이름 <input id="jcNm" maxlength="30" placeholder="예: 햇살초등학교"></label>' +
    '<label>공간 비밀번호 (8자 이상) <input id="jcPw" type="password" autocomplete="new-password"></label>' +
    '<label>한 번 더 <input id="jcPw2" type="password" autocomplete="new-password"></label>' +
    '<p class="hint">학생 이름과 기록은 이 비밀번호로 잠가서 저장해요. 운영자도 풀 수 없어요. 함께 쓰는 선생님께도 이 비밀번호를 알려 주세요.</p>' +
    '<div class="jc-row"><button type="button" id="jcMk">만들기</button><a class="btn-outline" href="' + esc(BASE) + '">← 내 공간</a></div><div id="jcM"></div>'));
  $('#jcMk').onclick = async () => {
    const name = $('#jcNm').value.trim(), pw = $('#jcPw').value, pw2 = $('#jcPw2').value;
    if (!name) return msg('#jcM', '학교 이름을 넣어 주세요.', 'err');
    if (pw.length < 8) return msg('#jcM', '비밀번호는 8자 이상으로 해 주세요.', 'err');
    if (pw !== pw2) return msg('#jcM', '두 비밀번호가 달라요.', 'err');
    const b = $('#jcMk'); busy(b, true);
    try {
      const sid = C.randId(24), wtok = C.randId(24), rc = C.newRecoveryCode();
      const key = await C.newTeamKey();
      const crypto = { wrap: await C.wrapKey(key, pw), recovery: await C.wrapKey(key, C.normRecovery(rc)), check: await C.seal(key, { ok: 1 }, sid + '/check') };
      const qbox = await C.seal(key, { k: await C.exportKeyUrl(key) }, sid + '/qbox');
      const uid = S.user.uid;
      await fb.set('spaces/' + sid, { owner: uid, name, created: fb.NOW, crypto, qbox, wtok, v: 2 });
      await fb.set('spaces/' + sid + '/members/' + uid, { role: 'owner', name: S.user.name || '', joined: fb.NOW });
      await fb.batch([
        ['set', 'spaces/' + sid + '/meta/pub', { name, approval: true }],
        ['set', 'spaces/' + sid + '/keys/' + wtok, { t: fb.NOW }],
        ['set', 'users/' + uid, { spaces: { [sid]: name } }, true]
      ]);
      await C.rememberKey(sid, key);
      window.__jcName = name;
      viewRecovery(sid, rc);
    } catch (e) { busy(b, false); msg('#jcM', fb.errText(e), 'err'); }
  };
}
function viewRecovery(sid, rc, back) {
  view(shell('복구 코드를 적어 두세요', '공간 비밀번호를 잊었을 때 쓰는 하나뿐인 열쇠',
    '<p class="hint" style="margin-top:0">공간 비밀번호를 잊으면 이 코드로만 학생 이름과 기록을 다시 열 수 있어요. 운영자도 대신 찾아 줄 수 없어요.</p>' +
    '<div class="jc-recovery" id="jcRc">' + esc(rc) + '</div>' +
    '<div class="jc-row" style="margin:12px 0"><a class="btn-outline" id="jcMail" target="_blank" rel="noopener">내 메일로 보내 두기</a><button type="button" class="btn-outline" id="jcCp">복사</button><button type="button" class="btn-outline" onclick="window.print()">인쇄</button></div>' +
    '<p class="hint">[내 메일로 보내 두기]를 누르면 로그인한 구글 메일(' + esc((S.user && S.user.email) || '') + ')로 보내는 편지가 열려요. [보내기]를 눌러야 보내져요. 저희 쪽 서버는 이 코드를 보지 않아요.</p>' +
    '<label class="jc-chk"><input type="checkbox" id="jcOk"> 안전한 곳에 적어 두었어요</label><button type="button" id="jcGo" disabled>계속</button>'));
  const em = (S.user && S.user.email) || '', nm = (S.pub && S.pub.name) || (S.space && S.space.name) || ($('#jcNm') ? $('#jcNm').value : '') || '';
  const body = '점퍼스 복구 코드입니다. 이 편지를 지우지 말고 보관해 주세요.\n\n학교 공간: ' + (window.__jcName || nm) + '\n복구 코드: ' + rc + '\n여는 주소: ' + BASE + '?s=' + sid + '\n\n공간 비밀번호를 잊었을 때, 비밀번호 칸에 이 복구 코드를 넣으면 열려요.';
  $('#jcMail').href = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(em) + '&su=' + encodeURIComponent('[점퍼스] 복구 코드 — ' + (window.__jcName || nm)) + '&body=' + encodeURIComponent(body);
  $('#jcCp').onclick = () => navigator.clipboard && navigator.clipboard.writeText(rc);
  $('#jcOk').onchange = (e) => { $('#jcGo').disabled = !e.target.checked; };
  $('#jcGo').onclick = () => { location.href = back || (BASE + '?s=' + sid); };
}
function viewNotMember() {
  view(shell('이 공간의 선생님이 아니에요', S.user.email || '', '<p class="hint" style="margin-top:0">함께 쓰려면 이 공간의 선생님께 초대 코드를 받아 [내 공간]에서 넣어 주세요. 학생이라면 선생님 QR을 찍어 주세요.</p><div class="jc-row"><a class="btn-outline" href="' + esc(BASE) + '">내 공간</a><button type="button" class="btn-outline" id="jcOut">다른 계정으로 로그인</button></div>'));
  $('#jcOut').onclick = async () => { await fb.signOut(); };
}
function viewNeedQR(text) {
  view(shell('QR로 들어와 주세요', '', (text ? '<div class="jc-msg jc-warn">' + esc(text) + '</div>' : '') + '<p class="hint" style="margin-top:0">학생은 선생님이 띄운 QR을 찍으면 들어와요. 선생님이라면 구글로 로그인해 주세요.</p><button type="button" id="jcG">선생님 구글 로그인</button><div id="jcM"></div>'));
  $('#jcG').onclick = () => fb.signInGoogle().catch((e) => msg('#jcM', fb.errText(e), 'err'));
}
async function unwrapAny(v) {
  const cr = S.space.crypto;
  const key = C.looksLikeRecovery(v) ? await C.unwrapKey(cr.recovery, C.normRecovery(v), true) : await C.unwrapKey(cr.wrap, v, true);
  await C.open(key, cr.check, SID + '/check');
  return key;
}
function viewUnlock() {
  view(shell(S.space.name + ' 열기', '이 기기에서 처음 열 때 한 번만',
    '<label>공간 비밀번호 또는 복구 코드 <input id="jcPw" type="password" autocomplete="current-password"></label><div class="jc-row"><button type="button" id="jcGo">열기</button><a class="btn-outline" href="' + esc(BASE) + '">← 내 공간</a></div><div id="jcM"></div>'));
  const go = async () => {
    const v = $('#jcPw').value; if (!v) return;
    const b = $('#jcGo'); busy(b, true);
    try { const key = await unwrapAny(v); await C.rememberKey(SID, key); location.reload(); }
    catch (e) { busy(b, false); msg('#jcM', '비밀번호(또는 복구 코드)가 맞지 않아요.', 'err'); }
  };
  $('#jcGo').onclick = go; $('#jcPw').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}

// ================= 공간 관리 (QR · 선생님 · 비밀번호) =================
function qrSvg(text) { if (typeof qrcode !== 'function') return '<p class="hint">QR 도구를 불러오지 못했어요.</p>'; const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); }
async function spacePage() {
  view('<div class="loading">불러오는 중…</div>');
  try { await open(); } catch (e) { return viewFail(e); }
  if (!isTeacher()) return view(shell('선생님만 쓸 수 있어요', '', '<a class="btn-outline" href="' + esc(APPV.base) + '">← 메인으로</a>'));
  const owner = S.space.owner === S.user.uid, link = APPV.stuLink;
  view('<div class="container"><a class="back-link" href="' + esc(APPV.base + '&page=adminLogin&next=admin') + '">← 관리자 메뉴</a><h1>공간 관리 · ' + esc(S.pub.name) + '</h1>' +
    '<div class="card"><h2>학생 접속 QR</h2><div class="jc-row" style="align-items:flex-start;gap:20px"><div class="jc-qr">' + qrSvg(link) + '</div><div style="flex:1;min-width:240px">' +
    '<p class="hint" style="margin-top:0">학생은 이 QR을 찍으면 로그인 없이 바로 기록 화면이 열려요. 주소 안에 학생 이름을 여는 열쇠가 들어 있으니, 학급 밖으로 퍼지지 않게 해 주세요. 메인 화면의 "접속 QR"도 같은 QR이에요.</p>' +
    '<div class="jc-row"><button type="button" class="btn-outline" id="jcCp">주소 복사</button><button type="button" class="jc-danger" id="jcRot">새 QR 만들기</button></div>' +
    '<p class="hint">QR이 밖으로 퍼졌다면 새 QR을 만들어요. 예전 QR로는 더 이상 기록을 넣을 수 없어요.</p><div id="jcQm"></div></div></div></div>' +
    '<div class="card"><h2>학교 이름</h2><label>현황판과 화면에 보이는 이름 <input id="jcNm" maxlength="30" value="' + esc(S.pub.name) + '"></label><button type="button" id="jcNmSave">저장</button><div id="jcNmM"></div></div>' +
    '<div class="card"><h2>함께 쓰는 선생님</h2><div id="jcMl" class="hint">불러오는 중…</div><p class="hint">초대 코드를 만들어 함께 쓸 선생님께 알려 주세요(7일 동안 쓸 수 있어요). 학생 이름을 열려면 <b>공간 비밀번호</b>도 함께 알려 주셔야 해요.</p><button type="button" id="jcInvMk">초대 코드 만들기</button><div id="jcCode"></div><div id="jcTm"></div></div>' +
    '<div class="card"><h2>기록 내려받기</h2><p class="hint" style="margin-top:0">학생 명단·모든 기록·급수 인증을 이 컴퓨터로 내려받아요. 파일 안의 이름은 암호화되지 않으니 잘 보관해 주세요.</p>' +
    '<div class="jc-row"><button type="button" id="jcXlsx">엑셀 파일로 받기</button><button type="button" class="btn-outline" id="jcBak">백업 파일로 받기</button></div><p class="hint">엑셀 파일은 보고 정리하는 용도, 백업 파일(.json)은 이 공간이나 새 공간에 다시 넣을 때 써요.</p><div id="jcExM"></div></div>' +
    '<div class="card"><h2>기록 옮겨 오기</h2>' +
    '<p class="hint" style="margin-top:0"><b>시트판 점퍼스에서 옮기기</b> — 쓰던 학교 시트의 학생·기록·급수·설정을 이 공간으로 가져와요. 시트판 기록은 지워지지 않고 그대로 남아요.</p>' +
    '<label>시트판 주소 (프로그램 주소나 …/exec 주소) <input id="jcMgUrl" placeholder="https://musicalpe.github.io/jumprope/?s=…" autocomplete="off"></label>' +
    '<label>시트판 관리자 비밀번호 <input id="jcMgPw" type="password" autocomplete="off"></label><button type="button" id="jcMgGo">시트판에서 옮겨 오기</button><div id="jcMgM"></div>' +
    '<p class="hint" style="margin-top:18px"><b>백업 파일에서 넣기</b> — 위에서 받은 백업 파일(.json)을 골라요. 이미 있는 학생·기록은 건너뛰어요.</p>' +
    '<input type="file" id="jcBakFile" accept=".json,application/json" style="display:none"><button type="button" class="btn-outline" id="jcBakPick">백업 파일 고르기</button><div id="jcBkM"></div></div>' +
    '<div class="card"><h2>공간 비밀번호 · 복구 코드</h2>' + (owner ?
      '<label>지금 비밀번호 (또는 복구 코드) <input id="jcCur" type="password" autocomplete="current-password"></label><label>새 비밀번호 (8자 이상, 비워 두면 그대로) <input id="jcNp" type="password" autocomplete="new-password"></label>' +
      '<label class="jc-chk"><input type="checkbox" id="jcNr"> 복구 코드도 새로 만들기 (예전 코드는 못 쓰게 돼요)</label><button type="button" id="jcKeyGo">바꾸기</button><div id="jcKm"></div>'
      : '<p class="hint">비밀번호와 복구 코드는 공간을 만든 선생님만 바꿀 수 있어요.</p>') +
    '<p class="hint" style="margin-top:16px">이 기기는 공간 열쇠를 기억하고 있어요. 공용 컴퓨터라면 잊게 해 주세요.</p><div class="jc-row"><button type="button" class="btn-outline" id="jcForget">이 기기에서 열쇠 잊기</button><button type="button" class="btn-outline" id="jcOut">로그아웃</button></div></div>' +
    '<div class="card"><h2>점프 Live</h2><p class="hint" style="margin-top:0">' + (S.flags && S.flags.live === true ? '이 공간은 <b>전용 점프 라이브</b>(실시간 · 스마트 줄넘기 허브)와 점프 Live (Lite)를 모두 쓸 수 있어요.' : '이 공간은 <b>점프 Live (Lite)</b>를 쓸 수 있어요. 학생 기기가 3초쯤마다 횟수를 보내는 방식이에요.') + ' 관리자 메뉴의 <b>점프 Live</b>에서 열어요.</p><p class="hint">공간 주소: <code>' + esc(SID) + '</code></p></div>' +
    (owner ? '<div class="card"><h2>공간 삭제</h2><p class="hint" style="margin-top:0">이 공간의 학생 명단·기록·급수·설정을 모두 지워요. <b>되돌릴 수 없어요.</b> 남길 기록이 있으면 먼저 위에서 백업 파일을 받아 두세요.</p>' +
      '<label>지우려면 학교 이름을 그대로 적어 주세요 <input id="jcDelNm" autocomplete="off" placeholder="' + esc(S.pub.name) + '"></label><button type="button" class="jc-danger" id="jcDelGo">이 공간 삭제</button><div id="jcDelM"></div></div>' : '') + '</div>');
  $('#jcCp').onclick = async () => { try { await navigator.clipboard.writeText(link); msg('#jcQm', '주소를 복사했어요.', 'ok'); } catch (e) { msg('#jcQm', link, 'warn'); } };
  $('#jcRot').onclick = async (e) => {
    if (!window.confirm('새 QR을 만들까요? 학생들은 새 QR을 다시 찍어야 기록을 넣을 수 있어요.')) return;
    busy(e.target, true);
    try { const w = C.randId(24), old = S.space.wtok; await fb.set('spaces/' + SID + '/keys/' + w, { t: fb.NOW }); await fb.update('spaces/' + SID, { wtok: w }); await fb.del('spaces/' + SID + '/keys/' + old); location.reload(); }
    catch (err) { busy(e.target, false); msg('#jcQm', fb.errText(err), 'err'); }
  };
  $('#jcNmSave').onclick = async (e) => {
    const name = $('#jcNm').value.trim(); if (!name) return msg('#jcNmM', '학교 이름을 넣어 주세요.', 'err');
    busy(e.target, true);
    try { await fb.set('spaces/' + SID + '/meta/pub', { name }, true); await fb.update('spaces/' + SID, { name }); await fb.set('users/' + S.user.uid, { spaces: { [SID]: name } }, true); S.pub.name = name; S.space.name = name; busy(e.target, false); msg('#jcNmM', '저장했어요.', 'ok'); }
    catch (err) { busy(e.target, false); msg('#jcNmM', fb.errText(err), 'err'); }
  };
  try {
    const ms = await fb.list('spaces/' + SID + '/members');
    $('#jcMl').innerHTML = '<table>' + ms.map((m) => '<tr><td>' + esc(m.data.name || '이름 없음') + (m.id === S.user.uid ? ' (나)' : '') + '</td><td>' + (m.data.role === 'owner' ? '만든 선생님' : '선생님') + '</td><td style="text-align:right">' + (owner && m.id !== S.user.uid ? '<button type="button" class="jc-danger" data-rm="' + esc(m.id) + '">빼기</button>' : '') + '</td></tr>').join('') + '</table>';
    $$('[data-rm]').forEach((b) => { b.onclick = async () => { if (!window.confirm('이 선생님을 공간에서 뺄까요?')) return; busy(b, true); try { await fb.del('spaces/' + SID + '/members/' + b.dataset.rm); spacePage(); } catch (e) { busy(b, false); msg('#jcTm', fb.errText(e), 'err'); } }; });
  } catch (e) { $('#jcMl').textContent = fb.errText(e); }
  $('#jcInvMk').onclick = async (e) => {
    busy(e.target, true);
    try { const code = C.newRecoveryCode().replace(/-/g, '').slice(0, 8); await fb.set('invites/' + code, { sid: SID, by: S.user.uid, exp: Date.now() + 7 * 864e5 }); busy(e.target, false); $('#jcCode').innerHTML = '<p>초대 코드</p><div class="jc-code">' + esc(code) + '</div>'; }
    catch (err) { busy(e.target, false); msg('#jcTm', fb.errText(err), 'err'); }
  };
  $('#jcXlsx').onclick = (e) => exportXlsx(e.target).catch((err) => { busy(e.target, false); msg('#jcExM', fb.errText(err), 'err'); });
  $('#jcBak').onclick = (e) => exportBackup(e.target).catch((err) => { busy(e.target, false); msg('#jcExM', fb.errText(err), 'err'); });
  $('#jcMgGo').onclick = (e) => migrateFromSheet(e.target).catch((err) => { busy(e.target, false); msg('#jcMgM', fb.errText(err), 'err'); });
  $('#jcBakPick').onclick = () => $('#jcBakFile').click();
  $('#jcBakFile').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importBackup(f).catch((err) => msg('#jcBkM', fb.errText(err), 'err')); };
  $('#jcForget').onclick = async () => { await C.forgetKey(SID); location.href = APPV.base; };
  $('#jcOut').onclick = async () => { await fb.signOut(); };
  if (!owner) return;
  $('#jcDelGo').onclick = async (e) => {
    if ($('#jcDelNm').value.trim() !== String(S.pub.name).trim()) return msg('#jcDelM', '학교 이름이 같지 않아요. "' + S.pub.name + '" 을(를) 그대로 적어 주세요.', 'err');
    if (!window.confirm('"' + S.pub.name + '" 공간을 지울까요? 학생 명단과 기록이 모두 사라지고 되돌릴 수 없어요.')) return;
    busy(e.target, true);
    try { await deleteSpace(); location.href = BASE; }
    catch (err) { busy(e.target, false); msg('#jcDelM', '지우다가 멈췄어요: ' + fb.errText(err) + ' — 다시 눌러 주세요.', 'err'); }
  };
  $('#jcKeyGo').onclick = async (e) => {
    const cur = $('#jcCur').value, np = $('#jcNp').value, nr = $('#jcNr').checked;
    if (!cur) return msg('#jcKm', '지금 비밀번호를 넣어 주세요.', 'err');
    if (np && np.length < 8) return msg('#jcKm', '새 비밀번호는 8자 이상으로 해 주세요.', 'err');
    if (!np && !nr) return msg('#jcKm', '바꿀 것이 없어요.', 'err');
    busy(e.target, true);
    try {
      let key; try { key = await unwrapAny(cur); } catch (x) { throw new Error('지금 비밀번호(또는 복구 코드)가 맞지 않아요.'); }
      const cr = Object.assign({}, S.space.crypto); let rc = '';
      if (np) cr.wrap = await C.wrapKey(key, np);
      if (nr) { rc = C.newRecoveryCode(); cr.recovery = await C.wrapKey(key, C.normRecovery(rc)); }
      await fb.update('spaces/' + SID, { crypto: cr }); S.space.crypto = cr;
      if (rc) return viewRecovery(SID, rc, APPV.base + '&page=space');
      busy(e.target, false); $('#jcCur').value = ''; $('#jcNp').value = ''; msg('#jcKm', '비밀번호를 바꿨어요. 함께 쓰는 선생님께도 알려 주세요.', 'ok');
    } catch (err) { busy(e.target, false); msg('#jcKm', fb.errText(err), 'err'); }
  };
}

// 공간 삭제 (만든 선생님만): 안쪽 문서부터 지우고 마지막에 공간 문서를 지움
async function deleteSpace() {
  const P = 'spaces/' + SID, ops = [];
  for (const col of ['book', 'inbox', 'priv']) (await fb.list(P + '/' + col)).forEach((d) => ops.push(['del', P + '/' + col + '/' + d.id]));
  ops.push(['del', P + '/meta/pub'], ['del', P + '/keys/' + S.space.wtok]);
  (await fb.list(P + '/members')).forEach((m) => { if (m.id !== S.user.uid) ops.push(['del', P + '/members/' + m.id]); });
  await fb.batch(ops);
  await fb.del(P + '/members/' + S.user.uid);
  await fb.del(P);
  await fb.set('users/' + S.user.uid, { spaces: { [SID]: fb.DEL } }, true);
  await C.forgetKey(SID); await cacheDrop(); ls.del('jumpus:local:' + SID); ls.del('jumpus:cache:' + SID); ls.del('jumpus:stu:' + SID); ls.del('jumpropeCloud:' + SID);
}

// ================= 내려받기 · 옮겨 오기 =================
// 표를 직접 만지는 일은 화면 요청과 섞이지 않게 같은 줄(chain)에 세움
function withBook(fn) { const run = chain.then(async () => { await open(); await loadBook(); const out = await fn(); await persist(); return out; }); chain = run.catch(() => {}); return run; }
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }
const dstr = (v) => (v instanceof Date ? formatDate(v, '', 'yyyy-MM-dd') : String(v == null ? '' : v));
const fileStamp = () => formatDate(new Date(), '', 'yyyy-MM-dd');
function tables() {
  const st = SH.getStudentsSheet_().getDataRange().getValues().slice(1), rc = SH.getRecordsSheet_().getDataRange().getValues().slice(1), lv = SH.getLevelsSheet_().getDataRange().getValues().slice(1);
  return { st, rc, lv };
}
function loadScript(src) { return new Promise((ok, fail) => { const sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = () => fail(new Error('엑셀 도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.')); document.head.appendChild(sc); }); }
async function exportXlsx(btn) {
  busy(btn, true);
  const t = await withBook(() => tables());
  if (typeof XLSX === 'undefined') await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
  const by = {}; t.st.forEach((r) => { by[String(r[0]).trim()] = r; });
  const STAT = { approved: '승인', pending: '승인 대기', rejected: '거절' }, SRC = { camera: '카메라 판정기', rope: '스마트 줄넘기', live: '점프 Live' };
  const a1 = [['학년', '반', '번호', '이름']].concat(t.st.map((r) => [r[1], r[2], r[3], r[4]]));
  const a2 = [['날짜', '시간', '학년', '반', '번호', '이름', '종류', '횟수', '상태', '방법', '한 번에 최고 연속']].concat(t.rc.map((r) => { const s = by[String(r[2]).trim()] || []; return [dstr(r[3]), dstr(r[6]), s[1] || '', s[2] || '', s[3] || '', s[4] || '(지운 학생)', r[7] || '', Number(r[4]) || 0, STAT[r[5] || 'approved'] || r[5], SRC[r[8]] || (r[8] ? r[8] : '직접 입력'), r[9] || '']; }));
  const sum = {}; t.rc.forEach((r) => { if ((r[5] || 'approved') !== 'approved') return; const k = String(r[2]).trim(); sum[k] = (sum[k] || 0) + (Number(r[4]) || 0); });
  const a3 = [['학년', '반', '번호', '이름', '승인된 누적 횟수']].concat(t.st.map((r) => [r[1], r[2], r[3], r[4], sum[String(r[0]).trim()] || 0]));
  const a4 = [['학년', '반', '번호', '이름', '급수(0부터)', '항목(0부터)', '통과한 날']].concat(t.lv.map((r) => { const s = by[String(r[0]).trim()] || []; return [s[1] || '', s[2] || '', s[3] || '', s[4] || '(지운 학생)', r[1], r[2], dstr(r[3])]; }));
  const wb = XLSX.utils.book_new();
  [['학생별 누적', a3], ['기록', a2], ['학생 명단', a1], ['급수 인증', a4]].forEach((x) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(x[1]), x[0]));
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  download('점퍼스_' + book.getName().replace(/[\\/:*?"<>|]/g, '') + '_' + fileStamp() + '.xlsx', new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  busy(btn, false); msg('#jcExM', '엑셀 파일을 내려받았어요. (학생 ' + t.st.length + '명 · 기록 ' + t.rc.length + '건)', 'ok');
}
async function exportBackup(btn) {
  busy(btn, true);
  const t = await withBook(() => tables());
  const data = { app: 'jumpus-backup', v: 1, name: book.getName(), at: new Date().toISOString(), students: t.st.map((r) => r.map(enc)), records: t.rc.map((r) => r.map(enc)), levels: t.lv.map((r) => r.map(enc)), props: publicProps() };
  download('점퍼스_백업_' + book.getName().replace(/[\\/:*?"<>|]/g, '') + '_' + fileStamp() + '.json', new Blob([JSON.stringify(data)], { type: 'application/json' }));
  busy(btn, false); msg('#jcExM', '백업 파일을 내려받았어요. (학생 ' + t.st.length + '명 · 기록 ' + t.rc.length + '건)', 'ok');
}
// 표에 합치기: 이미 있는 학생(같은 ID 또는 같은 학년·반·번호·이름)·기록(같은 번호)·급수는 건너뜀
function mergeIn(d) {
  const ss = SH.getStudentsSheet_(), rs = SH.getRecordsSheet_(), lvs = SH.getLevelsSheet_();
  const cur = tables(), idMap = {}, has = {}, sig = {};
  cur.st.forEach((r) => { has[String(r[0]).trim()] = 1; sig[[r[1], r[2], r[3], r[4]].map((v) => String(v).trim()).join('|')] = String(r[0]).trim(); });
  let order = cur.st.reduce((m, r) => Math.max(m, Number(r[6]) || 0), 0), nS = 0, nR = 0, nL = 0;
  d.students.forEach((r) => {
    const id = String(r[0]).trim(), k = [r[1], r[2], r[3], r[4]].map((v) => String(v).trim()).join('|');
    if (has[id]) { idMap[id] = id; return; }
    if (sig[k]) { idMap[id] = sig[k]; return; }
    const row = r.slice(0, 7); while (row.length < 7) row.push('');
    if (!row[5]) row[5] = SH.hashPw_('1234');
    row[6] = ++order; ss.appendRow(row); has[id] = 1; sig[k] = id; idMap[id] = id; nS++;
  });
  const rid = {}; cur.rc.forEach((r) => { rid[String(r[0])] = 1; });
  d.records.forEach((r) => {
    const sid = idMap[String(r[2]).trim()]; if (!sid || rid[String(r[0])]) return;
    const row = r.slice(); row[2] = sid; rs.appendRow(row); rid[String(r[0])] = 1; nR++;
  });
  const lk = {}; cur.lv.forEach((r) => { lk[String(r[0]).trim() + '|' + r[1] + '|' + r[2]] = 1; });
  (d.levels || []).forEach((r) => {
    const sid = idMap[String(r[0]).trim()], k = sid + '|' + r[1] + '|' + r[2]; if (!sid || lk[k]) return;
    const row = r.slice(); row[0] = sid; lvs.appendRow(row); lk[k] = 1; nL++;
  });
  return { nS, nR, nL };
}
async function importBackup(file) {
  let d; try { d = JSON.parse(await file.text()); } catch (e) { d = null; }
  if (!d || d.app !== 'jumpus-backup' || !Array.isArray(d.students) || !Array.isArray(d.records)) return msg('#jcBkM', '점퍼스 백업 파일이 아니에요. [백업 파일로 받기]로 받은 .json 파일을 골라 주세요.', 'err');
  if (!window.confirm('백업 파일(학생 ' + d.students.length + '명 · 기록 ' + d.records.length + '건)을 이 공간에 넣을까요? 이미 있는 학생과 기록은 건너뛰어요.')) return;
  msg('#jcBkM', '넣는 중…', 'warn');
  const dd = { students: d.students.map((r) => r.map(dec)), records: d.records.map((r) => r.map(dec)), levels: (d.levels || []).map((r) => r.map(dec)) };
  const r = await withBook(() => { const fresh = tables().st.length === 0; const out = mergeIn(dd); if (fresh && d.props) Object.keys(d.props).forEach((k) => { if (!(k in props) || k === 'APPROVAL_ON') props[k] = d.props[k]; }); return out; });
  msg('#jcBkM', '넣었어요: 학생 ' + r.nS + '명 · 기록 ' + r.nR + '건 · 급수 ' + r.nL + '건 (나머지는 이미 있어서 건너뜀)', 'ok');
}
// 시트판(학교 시트 + 껍데기)에서 옮겨 오기 — 시트판 껍데기에 관리자 비밀번호로 물어 학생·기록·급수·설정을 받아 옴
async function migrateFromSheet(btn) {
  let url = $('#jcMgUrl').value.trim(); const pw = $('#jcMgPw').value;
  try { const u = new URL(url); if (u.searchParams.get('s')) url = u.searchParams.get('s'); } catch (e) {}
  if (!/^https:\/\/script\.google\.com\/.+\/exec/.test(url) && !/^http:\/\/localhost/.test(url)) return msg('#jcMgM', '시트판 주소를 확인해 주세요. 시트판 점퍼스를 연 화면의 주소를 그대로 붙여 넣으면 돼요.', 'err');
  if (!pw) return msg('#jcMgM', '시트판 관리자 비밀번호를 넣어 주세요.', 'err');
  busy(btn, true); msg('#jcMgM', '시트판에서 읽어 오는 중… (기록이 많으면 조금 걸려요)', 'warn');
  const old = async (fn, args) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn, args: args || [] }), redirect: 'follow' });
    if (!r.ok) throw new Error('시트판 응답 오류 (' + r.status + ')'); const j = await r.json(); if (!j.ok) throw new Error(j.error || '시트판 요청 실패'); return j.result;
  };
  const v = await old('verifyAdminPassword', [pw]);
  if (!v || !v.ok) { busy(btn, false); return msg('#jcMgM', '시트판 관리자 비밀번호가 맞지 않아요.', 'err'); }
  const tk = v.token;
  const [all, levels, types, goal, theme, app, cam, extra] = await Promise.all([old('getAllDataAdmin', [tk]), old('getLevelsPublic').catch(() => ({})), old('getJumpTypes').catch(() => null), old('getDailyGoal').catch(() => null),
    old('getTheme').catch(() => null), old('getAppSettingsPublic').catch(() => null), old('getCameraSettingsAdmin', [tk]).catch(() => null), old('getExtraSettingsAdmin', [tk]).catch(() => null)]);
  const d = {
    students: all.students.map((s) => [String(s.id).trim(), s.grade, s.cls, s.number, s.name, '', s.order || '']),
    records: all.records.map((r) => [r.recordId || G.Utilities.getUuid(), new Date(r.date + 'T' + (/^\d\d:\d\d/.test(r.time || '') ? r.time.slice(0, 5) : '12:00') + ':00+09:00'), r.studentId, r.date, r.count, r.status || 'approved', r.time || '', r.type === '종류 미지정' ? '' : (r.type || ''), r.source || '', r.best > 0 ? r.best : '', '']),
    levels: Object.keys(levels || {}).reduce((a, id) => a.concat(levels[id].map((x) => [id, x[0], x[1], x[2], '시트판'])), [])
  };
  const r = await withBook(() => {
    const fresh = tables().st.length === 0; const out = mergeIn(d);
    if (fresh) {   // 빈 공간일 때만 설정도 가져옴 (이미 쓰던 공간의 설정은 건드리지 않음)
      if (types && types.length) props.JUMP_TYPES = JSON.stringify(types);
      if (goal) props.DAILY_GOAL = String(goal);
      if (theme && theme.accent) { props.THEME_ACCENT = theme.accent; if (theme.bg) props.THEME_BG = theme.bg; }
      if (app) props.APPROVAL_ON = app.approvalOn ? '1' : '0';
      if (cam) { props.CAMERA_ENABLED = cam.enabled ? '1' : '0'; props.CAMERA_AUTO_APPROVE = cam.autoApprove ? '1' : '0'; props.CAMERA_SENS = String(cam.sens || 10); }
      if (extra && typeof extra === 'object') { const x = JSON.parse(JSON.stringify(extra)); if (x.nat && x.nat.key) x.nat.shell = 'cloud:' + SID; props.EXTRA_SETTINGS = JSON.stringify(x); out.nat = !!(x.nat && x.nat.on && x.nat.key); }
      out.settings = true;
    }
    return out;
  });
  busy(btn, false); $('#jcMgPw').value = '';
  msg('#jcMgM', '옮겨 왔어요: 학생 ' + r.nS + '명 · 기록 ' + r.nR + '건 · 급수 ' + r.nL + '건' + (r.settings ? ' · 설정(종류·목표·색·승인 절차)' : ' (설정은 이 공간 것을 그대로 둠)') + '. 학생 비밀번호는 1234로 돌아가요.' +
    (r.nat ? ' 전국 현황판은 같은 학교로 이어져요 — 시트판 쪽의 전국 현황판 참여는 꺼 주세요(두 곳에서 보내면 숫자가 엇갈려요).' : ''), 'ok');
}

window.JRCLOUD = { call, cameraApi, entry: () => entry().catch(viewFail), adminLogin, spacePage, fail: viewFail, version: CLOUD_VERSION, adminToken };
