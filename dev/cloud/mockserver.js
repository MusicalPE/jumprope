// 점퍼스 클라우드판 시험용 가짜 파이어베이스 (Firestore + 로그인 흉내, 보안 규칙도 firestore-rules.txt 와 같게 흉내)
// node mockserver.js  → http://localhost:8891  (cloud/ 정적 파일도 /jumprope/cloud/ 로 내줌)
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = +(process.env.PORT || 8891);
const ROOT = path.resolve(__dirname, '../..');
let store = new Map();   // 'a/b/c/d' → data
const denies = [];

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));
function resolve(nv, ov) {           // 표시(INC/DEL/NOW) 풀기
  if (isObj(nv)) {
    if ('__inc' in nv) return (typeof ov === 'number' ? ov : 0) + nv.__inc;
    if ('__now' in nv) return Date.now();
    const o = {}; for (const k in nv) { if (isObj(nv[k]) && '__del' in nv[k]) continue; o[k] = resolve(nv[k], isObj(ov) ? ov[k] : undefined); } return o;
  }
  return nv;
}
function mergeDeep(old, nv) {
  const o = isObj(old) ? clone(old) : {};
  for (const k in nv) {
    const v = nv[k];
    if (isObj(v) && '__del' in v) { delete o[k]; continue; }
    if (isObj(v) && !('__inc' in v) && !('__now' in v)) o[k] = mergeDeep(o[k], v);
    else o[k] = resolve(v, o[k]);
  }
  return o;
}
function applyUpdate(old, nv) {      // 'a.b.c' 점 경로
  const o = clone(old);
  for (const key in nv) {
    const segs = key.split('.'); let cur = o;
    for (let i = 0; i < segs.length - 1; i++) { if (!isObj(cur[segs[i]])) cur[segs[i]] = {}; cur = cur[segs[i]]; }
    const last = segs[segs.length - 1], v = nv[key];
    if (isObj(v) && '__del' in v) delete cur[last]; else cur[last] = isObj(v) && !('__inc' in v) && !('__now' in v) ? resolve(v, undefined) : resolve(v, cur[last]);
  }
  return o;
}

// ---- 규칙 흉내 (firestore-rules.txt 와 같은 뜻) ----
function rules(op, p, auth, raw, after, before, st) {
  const signed = !!auth, google = !!auth && !auth.anon, uid = auth && auth.uid;
  const seg = p.split('/');
  const g = (q) => st.get(q);
  const isMember = (s) => google && !!g('spaces/' + s + '/members/' + uid);
  const isOwner = (s) => google && !!g('spaces/' + s) && g('spaces/' + s).owner === uid;
  const keysOnly = (o, ks) => Object.keys(o || {}).every((k) => ks.includes(k));
  if (seg[0] === 'users' && seg.length === 2) return google && uid === seg[1];
  if (seg[0] === 'invites' && seg.length === 2) {
    if (op === 'get') return google;
    if (op === 'list') return false;
    if (op === 'create') return isMember(after.sid) && keysOnly(after, ['sid', 'by', 'exp']);
    if (op === 'delete') return google && before && isMember(before.sid);
    return false;
  }
  if (seg[0] !== 'spaces') return false;
  const s = seg[1];
  if (seg.length === 2) {
    if (op === 'create') return google && after.owner === uid;
    if (op === 'get') return isMember(s);
    if (op === 'update') {
      if (!isMember(s) || after.owner !== before.owner) return false;
      if (isOwner(s)) return true;
      return JSON.stringify(after.crypto) === JSON.stringify(before.crypto);
    }
    if (op === 'delete') return isOwner(s);
    return false;
  }
  const col = seg[2];
  if (col === 'members') {
    if (op === 'get' || op === 'list') return isMember(s);
    if (op === 'create') {
      if (!google || uid !== seg[3]) return false;
      const sp = g('spaces/' + s);
      if (sp && sp.owner === uid && after.role === 'owner') return true;
      if (after.role === 'teacher' && typeof after.code === 'string') { const inv = g('invites/' + after.code); return !!inv && inv.sid === s && inv.exp > Date.now(); }
      return false;
    }
    if (op === 'update') return isOwner(s);
    if (op === 'delete') return google && (uid === seg[3] || isOwner(s));
  }
  if (col === 'meta') { if (op === 'get') return signed; if (op === 'list') return false; return isMember(s) && seg[3] !== 'flags'; }
  if (col === 'book') { if (op === 'get' || op === 'list') return signed; return isMember(s); }
  if (col === 'priv') return isMember(s);
  if (col === 'keys') { if (op === 'get' || op === 'list') return false; return isMember(s); }
  if (col === 'inbox') {
    if (op === 'get' || op === 'list') return signed;
    if (op === 'update' || op === 'delete') return isMember(s);
    if (op === 'create') {
      const d = raw;
      const ok = signed && keysOnly(d, ['box', 'n', 'src', 'st', 'w', 't'])
        && isObj(d.box) && typeof d.box.ct === 'string' && d.box.ct.length <= 6000
        && Number.isInteger(d.n) && d.n >= 1 && d.n <= 5000
        && ['hand', 'cam', 'rope', 'live'].includes(d.src) && ['ok', 'wait'].includes(d.st)
        && isObj(d.t) && d.t.__now === 1 && typeof d.w === 'string' && d.w.length <= 40 && !!g('spaces/' + s + '/keys/' + d.w);
      if (!ok) return false;
      const pub = g('spaces/' + s + '/meta/pub');
      return d.st === 'wait' || d.src !== 'hand' || isMember(s) || !(pub && pub.approval === true);
    }
  }
  return false;
}

function doWrite(o, auth, st, next) {   // o = [kind, path, data, merge]
  const [kind, p, data, merge] = o;
  const before = st.get(p) || null;
  if (kind === 'del') { if (!rules('delete', p, auth, null, null, before, st)) throw deny('delete', p); next.delete(p); return; }
  let after;
  if (kind === 'set') after = merge ? mergeDeep(before, data) : mergeDeep(null, data);
  else if (kind === 'update') { if (!before) throw Object.assign(new Error('없는 문서: ' + p), { code: 'not-found' }); after = applyUpdate(before, data); }
  const op = before ? 'update' : 'create';
  if (!rules(op, p, auth, data, after, before, st)) throw deny(op, p);
  next.set(p, after);
}
function deny(op, p) { denies.push(op + ' ' + p); return Object.assign(new Error('Missing or insufficient permissions. (' + op + ' ' + p + ')'), { code: 'permission-denied' }); }
let seq = 0;
function handle(b) {
  const auth = b.auth || null;
  if (b.op === 'get') { if (!rules('get', b.path, auth, null, null, store.get(b.path), store)) throw deny('get', b.path); return store.has(b.path) ? clone(store.get(b.path)) : null; }
  if (b.op === 'list') {
    const pre = b.path + '/'; const depth = b.path.split('/').length + 1;
    if (!rules('list', b.path + '/x', auth, null, null, null, store)) throw deny('list', b.path);
    return [...store.keys()].filter((k) => k.startsWith(pre) && k.split('/').length === depth).map((k) => ({ id: k.split('/').pop(), data: clone(store.get(k)) }));
  }
  if (b.op === 'add') { const id = 'a' + (++seq).toString(36) + Math.random().toString(36).slice(2, 8); const next = new Map(store); doWrite(['set', b.path + '/' + id, b.data], auth, store, next); store = next; return id; }
  if (b.op === 'write') { const next = new Map(store); b.ops.forEach((o) => doWrite(o, auth, store, next)); store = next; return true; }   // 묶음: 규칙은 묶기 전 상태로 판단
  if (b.op === 'reset') { store = new Map(); rtdb = {}; denies.length = 0; return true; }
  if (b.op === 'console_set') { store.set(b.path, b.data); return true; }   // 운영자가 파이어베이스 콘솔에서 직접 넣는 것 흉내 (규칙을 거치지 않음)
  if (b.op === 'dump') return { docs: Object.fromEntries(store), denies, rt: rtdb };
  throw new Error('모르는 op ' + b.op);
}
// ---- 실시간 데이터베이스 흉내 (cloud/database-rules.txt 와 같은 뜻) ----
let rtdb = {};
const rtGet = (segs) => segs.reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), rtdb);
function rtSet(segs, v) {
  if (v === null || v === undefined) { const par = rtGet(segs.slice(0, -1)); if (par && typeof par === 'object') { delete par[segs[segs.length - 1]]; if (!Object.keys(par).length && segs.length > 1) rtSet(segs.slice(0, -1), null); } return; }
  let o = rtdb; segs.slice(0, -1).forEach((k) => { if (!isObj(o[k])) o[k] = {}; o = o[k]; }); o[segs[segs.length - 1]] = v;
}
function sv(v, now) { if (isObj(v)) { if (v['.sv'] === 'timestamp') return now; const o = {}; for (const k in v) o[k] = sv(v[k], now); return o; } return v; }
const ROOM_RE = /^[A-Za-z0-9_-]{16,64}$/;
function rtWriteOk(segs, nv, auth, now, newRoom) {   // segs: lite/$sid/…
  const uid = auth && auth.uid; if (!uid || segs[0] !== 'lite' || segs.length < 4) return false;
  const old = rtGet(segs), kind = segs[2];
  if (kind === 'clock') return segs.length === 4 && segs[3] === uid && (nv == null || nv === now);
  if (kind === 'codes') {
    if (segs.length !== 4) return false;
    if (!(old == null || old.by === uid || old.at < now - 21600000)) return false;
    if (nv == null) return true;
    return /^[0-9]{4}$/.test(segs[3]) && isObj(nv) && Object.keys(nv).sort().join() === 'at,by,room' && nv.by === uid && nv.at === now && typeof nv.room === 'string' && ROOM_RE.test(nv.room);
  }
  if (kind !== 'rooms' || !ROOM_RE.test(segs[3])) return false;
  const room = rtGet(segs.slice(0, 4)) || {};
  if (segs.length === 4) return nv == null && (room.own === uid || room.own == null);
  const k = segs[4], after = newRoom || Object.assign({}, room, segs.length === 5 ? { [k]: nv } : {});
  if (k === 'own') return segs.length === 5 && (old == null || old === uid) && nv === uid;
  if (k === 'meta' || k === 'ctl') return segs.length === 5 && after.own === uid && (nv == null || (typeof nv === 'string' && nv.length <= (k === 'meta' ? 1500 : 2000)));
  if (k === 'devs') return segs.length === 6 && room.own != null && (nv == null || (/^[a-z0-9]{8,16}$/.test(segs[5]) && typeof nv === 'string' && nv.length <= 400));
  if (k === 'ppl') return segs.length === 6 && room.own != null && (nv == null || (/^[0-9]{1,2}-[0-9]{1,2}-[0-9]{1,2}$/.test(segs[5]) && typeof nv === 'string' && nv.length <= 1500));
  return false;
}
function rtReadOk(segs, auth) {
  const uid = auth && auth.uid; if (!uid || segs[0] !== 'lite' || segs.length < 4) return false;
  if (segs[2] === 'clock') return segs[3] === uid;
  return segs[2] === 'codes' || segs[2] === 'rooms';
}
function rtHandle(b) {
  const segs = b.path.split('/').filter(Boolean), now = Date.now(), auth = b.auth || null;
  const no = () => { denies.push('rt ' + b.method + ' ' + b.path); return Object.assign(new Error('permission-denied'), { code: 'permission-denied' }); };
  if (b.method === 'GET') { if (!rtReadOk(segs, auth)) throw no(); const v = rtGet(segs); return v === undefined ? null : clone(v); }
  if (b.method === 'DELETE') { if (!rtWriteOk(segs, null, auth, now)) throw no(); rtSet(segs, null); return null; }
  const body = sv(b.body, now);
  if (b.method === 'PUT') { if (!rtWriteOk(segs, body, auth, now)) throw no(); rtSet(segs, body); return clone(body); }
  if (b.method === 'PATCH') {
    const after = Object.assign({}, rtGet(segs) || {}, body);
    for (const k in body) if (!rtWriteOk(segs.concat(k), body[k], auth, now, after)) throw no();
    for (const k in body) rtSet(segs.concat(k), body[k]);
    return clone(body);
  }
  throw new Error('모르는 method');
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/__fb') {
    let body = ''; req.on('data', (c) => body += c); req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      try { res.end(JSON.stringify({ ok: true, result: handle(JSON.parse(body)) })); }
      catch (e) { res.end(JSON.stringify({ ok: false, code: e.code || 'error', message: e.message })); }
    }); return;
  }
  if (req.method === 'POST' && req.url === '/__rt') {
    let body = ''; req.on('data', (c) => body += c); req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      try { res.end(JSON.stringify({ ok: true, result: rtHandle(JSON.parse(body)) })); }
      catch (e) { res.end(JSON.stringify({ ok: false, code: e.code || 'error', message: e.message })); }
    }); return;
  }
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u.startsWith('/jumprope/')) u = u.slice('/jumprope'.length);
  if (u === '/cloud/js/fb.js') { res.setHeader('Content-Type', TYPES['.js']); return res.end(fs.readFileSync(path.join(__dirname, 'fb-mock.js'))); }
  let f = path.join(ROOT, u); if (f.endsWith('/')) f += 'index.html';
  if (u.startsWith('/jump-rope-checker/') || u.startsWith('/jumpropelive/')) { f = path.join(ROOT, '..', u); if (f.endsWith('/')) f += 'index.html'; }   // 판정기·점프 라이브 저장소(옆 폴더)
  if (!(f.startsWith(ROOT) || f.startsWith(path.join(ROOT, '..', 'jump-rope-checker')) || f.startsWith(path.join(ROOT, '..', 'jumpropelive'))) || !fs.existsSync(f)) { res.statusCode = 404; return res.end('404'); }
  res.setHeader('Content-Type', TYPES[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f));
}).listen(PORT, () => console.log('mock on ' + PORT));
