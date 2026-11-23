// 점프 Live (클라우드판 방) — 학교 껍데기의 lite* 함수와 같은 일을 파이어베이스 실시간 데이터베이스로 함
// · 시트판은 학교 시트 스크립트의 캐시에 방을 두지만, 클라우드판은 껍데기가 기기마다 따로 돌아서 함께 볼 곳이 필요함
// · 연결을 붙잡지 않고 3초쯤마다 짧게 주고받음(REST) → 동시 접속 수를 쓰지 않음
// · 방에는 학년·반·번호와 횟수만 둠. 학생 방의 이름은 공간 열쇠로 잠가서 둠
// · 방 주인은 방을 연 기기의 로그인(uid)이고, 신호를 바꾸거나 방을 닫는 것은 규칙(database-rules.txt)이 주인에게만 허락함
import * as fb from './fb.js';
fb.init();

const TTL = 6 * 3600e3;
const ST = ['ready', 'away', 'hand', 'jump', 'stop', 'hidden', 'off'];
export const MODE = { all: 40, '1v1': 2, '2v2': 4 };
const base = (sid) => 'lite/' + sid;
const R = (sid, room) => base(sid) + '/rooms/' + room;
const js = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
const denied = (e) => String(e && e.code).includes('permission-denied');
function roomId(room) { const r = String(room || ''); if (!/^[A-Za-z0-9_-]{16,64}$/.test(r)) throw new Error('방 번호가 올바르지 않습니다.'); return r; }
function sidOk(sid) { if (!/^[A-Za-z0-9_-]{8,64}$/.test(String(sid || ''))) throw new Error('공간 주소가 올바르지 않습니다.'); return sid; }

async function me() {
  await fb.ready();
  if (!fb.user()) { await fb.signInAnon(); for (let i = 0; i < 20 && !fb.user(); i++) await new Promise((ok) => setTimeout(ok, 100)); }
  const u = fb.user(); if (!u) throw new Error('방에 들어가지 못했어요. 인터넷을 확인하고 다시 해 주세요.');
  return u.uid;
}

// 서버 시각과 이 기기 시각의 차이 (10분마다 다시 잼) — 모든 기기가 같은 시각에 시작하려고
let off = null, offAt = 0;
async function clock(sid) {
  if (off !== null && Date.now() - offAt < 600e3) return;
  const uid = await me(), p = base(sid) + '/clock/' + uid, t0 = Date.now();
  let v = await fb.rt('PUT', p, fb.SV_TIME); const t1 = Date.now();
  if (typeof v !== 'number') v = await fb.rt('GET', p);
  if (typeof v === 'number') { off = v - (t0 + t1) / 2; offAt = Date.now(); } else if (off === null) off = 0;
}
const now = () => Date.now() + (off || 0);
const mid = (t0) => Math.round((t0 + Date.now()) / 2 + (off || 0));   // 부른 쪽이 왕복 시간의 가운데로 시각을 맞춤
async function begin(sid) { sidOk(sid); const uid = await me(); await clock(sid); return uid; }

// 이 기기가 열었던 오래된 방 치우기
function mine(sid, room) {
  let o = {}; try { o = JSON.parse(localStorage.getItem('jumpus:literooms') || '{}') || {}; } catch (e) {}
  Object.keys(o).forEach((k) => { if (Date.now() - o[k] > TTL) { const [s, r] = k.split('|'); fb.rt('DELETE', R(s, r)).catch(() => {}); delete o[k]; } });
  if (room) o[sid + '|' + room] = Date.now();
  try { localStorage.setItem('jumpus:literooms', JSON.stringify(o)); } catch (e) {}
}

// ---- 선생님 화면 ----
export async function openRoom(sid, room, meta) {
  const t0 = Date.now(), uid = await begin(sid); room = roomId(room);
  const m = { at: now() };
  ['g', 'c', 'max'].forEach((k) => { m[k] = Math.max(0, Math.min(60, Math.round(Number(meta && meta[k]) || 0))); });
  if (meta && typeof meta.list === 'string' && /^[0-9,:\-]{0,200}$/.test(meta.list)) m.list = meta.list;
  try { await fb.rt('PATCH', R(sid, room), { own: uid, meta: JSON.stringify(m), ctl: '{"ph":"open"}' }); }
  catch (e) { if (denied(e)) throw new Error('방을 열지 못했어요. 다른 기기에서 연 방이에요.'); throw e; }
  mine(sid, room);
  return { owner: uid, t: mid(t0) };
}
export async function setControl(sid, room, owner, ctl) {
  const t0 = Date.now(); await begin(sid); room = roomId(room);
  if (!ctl || typeof ctl !== 'object' || !/^(open|go|end)$/.test(String(ctl.ph))) throw new Error('신호 형식이 올바르지 않습니다.');
  const s = JSON.stringify(ctl); if (s.length > 2000) throw new Error('신호가 너무 깁니다.');
  try { await fb.rt('PUT', R(sid, room) + '/ctl', s); }
  catch (e) { if (denied(e)) throw new Error('방이 닫혔거나 방 열쇠가 맞지 않습니다.'); throw e; }
  return { t: mid(t0) };
}
function devMap(o) { const out = {}; Object.keys(o || {}).forEach((k) => { const d = js(o[k], null); if (d) out[k] = d; }); return out; }
export async function pull(sid, room) {
  const t0 = Date.now(); await begin(sid); room = roomId(room);
  const devs = await fb.rt('GET', R(sid, room) + '/devs');
  return { t: mid(t0), devs: devMap(devs) };
}
export async function closeRoom(sid, room) {
  const t0 = Date.now(); await begin(sid); room = roomId(room);
  const meta = js(await fb.rt('GET', R(sid, room) + '/meta'), {});
  try { await fb.rt('DELETE', R(sid, room)); }
  catch (e) { if (denied(e)) throw new Error('방이 닫혔거나 방 열쇠가 맞지 않습니다.'); throw e; }
  if (meta && meta.code) await fb.rt('DELETE', base(sid) + '/codes/' + meta.code).catch(() => {});
  return { t: mid(t0) };
}

// ---- 학생 기기 ----
const sent = {};   // 방/기기 → 마지막으로 올린 상태와 시각
export async function info(sid, room) {
  const t0 = Date.now(); await begin(sid); room = roomId(room);
  const all = await fb.rt('GET', R(sid, room)), meta = all && js(all.meta, null);
  if (!meta) return { t: mid(t0), closed: true };
  const devs = devMap(all.devs), taken = [], n = now();
  Object.keys(devs).forEach((k) => { const d = devs[k]; if (d.st !== 'off' && n - (d.t || 0) < 30000) taken.push({ g: d.g, c: d.c, n: d.n }); });
  return { t: mid(t0), meta: pubMeta(meta), ctl: js(all.ctl, null), taken };
}
function pubMeta(m) { const o = Object.assign({}, m); delete o.hostBox; return o; }
export async function send(sid, room, dev, data, wantMeta) {
  const t0 = Date.now(); await begin(sid); room = roomId(room);
  dev = String(dev || ''); if (!/^[a-z0-9]{8,16}$/.test(dev)) throw new Error('기기 번호가 올바르지 않습니다.');
  const d = data || {}, num = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
  const rec = { g: num(d.g, 0, 6), c: num(d.c, 0, 30), n: num(d.n, 0, 99), cnt: num(d.cnt, 0, 5000), best: num(d.best, 0, 5000),
    st: ST.indexOf(String(d.st)) >= 0 ? String(d.st) : 'ready', run: d.run === true, ctl: String(d.ctl || '').slice(0, 32), v: String(d.v || '').slice(0, 16), t: now() };
  const p = R(sid, room);
  // 쉬는 동안(뛰지 않을 때) 상태가 그대로면 10초에 한 번만 올림 — 신호 받기(3초마다)는 그대로. 큰 화면은 25초 넘게 소식이 없어야 끊긴 것으로 봄
  const sig = JSON.stringify(Object.assign({}, rec, { t: 0 })), k = room + '/' + dev, last = sent[k];
  const skip = !rec.run && last && last.sig === sig && Date.now() - last.at < 10000;
  if (!skip) sent[k] = { sig, at: Date.now() };
  let got;
  try { got = await Promise.all([skip ? null : fb.rt('PUT', p + '/devs/' + dev, JSON.stringify(rec)), fb.rt('GET', p + '/ctl'), wantMeta ? fb.rt('GET', p + '/meta') : null]); }
  catch (e) { if (denied(e)) return { t: mid(t0), closed: true }; throw e; }   // 방이 없으면 규칙이 쓰기를 막음
  if (!got[1]) return { t: mid(t0), closed: true };
  const out = { t: mid(t0), ctl: js(got[1], null) };
  if (wantMeta) out.meta = pubMeta(js(got[2], null) || {});
  return out;
}

// ---- 학생 방 (친구들과 함께 뛰기) — who: {g,c,n,name}, box: {seal(이름)→글자, open(글자)→이름} (공간 열쇠로 잠금) ----
const names = new Map();   // 잠긴 이름 → 푼 이름 (3초마다 다시 풀지 않게)
async function nameOf(box, s) { if (!names.has(s)) { let v = ''; try { v = await box.open(s); } catch (e) { v = ''; } names.set(s, v); } return names.get(s); }
async function stuAdd(sid, room, who, box) {
  const p = R(sid, room), got = await Promise.all([fb.rt('GET', p + '/meta'), fb.rt('GET', p + '/ppl')]);
  const meta = js(got[0], {}), ppl = got[1] || {}, key = who.g + '-' + who.c + '-' + who.n, cap = MODE[meta.mode] || 40;
  if (!(key in ppl) && Object.keys(ppl).length >= cap) throw new Error(cap < 40 ? '방이 꽉 찼어요 (' + (meta.mode === '1v1' ? '1대1' : '2대2') + '는 ' + cap + '명까지). 다른 방에 들어가거나 방을 만들어요.' : '방이 꽉 찼어요 (40명까지).');
  await fb.rt('PUT', p + '/ppl/' + key, await box.seal(who.name));
}
export async function stuOpen(sid, who, opt, prev, box) {
  const t0 = Date.now(), uid = await begin(sid);
  const mode = opt && MODE[opt.mode] ? String(opt.mode) : 'all';
  if (prev && prev.room) {   // 이미 연 방 — 방식만 새로 고른 것으로
    const pm = js(await fb.rt('GET', R(sid, prev.room) + '/meta'), null);
    if (pm) {
      if (pm.mode !== mode) { pm.mode = mode; await fb.rt('PUT', R(sid, prev.room) + '/meta', JSON.stringify(pm)); }
      return { room: prev.room, owner: uid, code: prev.code, mode, t: mid(t0) };
    }
  }
  const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => (b < 16 ? '0' : '') + b.toString(16)).join('');
  const room = 'S' + hex(16);
  let code = '';
  for (let i = 0; i < 30 && !code; i++) {
    const k = String(1000 + Math.floor(Math.random() * 9000));
    try { await fb.rt('PUT', base(sid) + '/codes/' + k, { room, by: uid, at: fb.SV_TIME }); code = k; }
    catch (e) { if (!denied(e)) throw e; }   // 이미 쓰는 번호 → 다른 번호로
  }
  if (!code) throw new Error('지금은 열린 방이 너무 많아요. 잠시 뒤에 다시 해 주세요.');
  const meta = { at: now(), g: who.g, c: who.c, max: 60, stu: 1, code, hostBox: await box.seal(who.name), mode };
  await fb.rt('PATCH', R(sid, room), { own: uid, meta: JSON.stringify(meta), ctl: '{"ph":"open"}' });
  mine(sid, room);
  await stuAdd(sid, room, who, box);
  return { room, owner: uid, code, mode, t: mid(t0) };
}
export async function stuJoin(sid, who, code, box) {
  const t0 = Date.now(); await begin(sid);
  code = String(code || '').replace(/\D/g, '');
  const c = /^\d{4}$/.test(code) ? await fb.rt('GET', base(sid) + '/codes/' + code) : null, room = c && c.room;
  if (!room || !(await fb.rt('GET', R(sid, room) + '/meta'))) throw new Error('그 방 번호를 찾지 못했어요. 번호를 다시 확인해 주세요.');
  await stuAdd(sid, room, who, box);
  return { room, code, t: mid(t0) };
}
export async function stuBoard(sid, room, box) {
  const t0 = Date.now(); await begin(sid); room = roomId(room);
  const all = await fb.rt('GET', R(sid, room)), meta = all && js(all.meta, null);
  if (!meta) return { t: mid(t0), closed: true };
  if (!meta.stu) throw new Error('학생 방이 아닙니다.');
  const ppl = {}, raw = all.ppl || {};
  for (const k of Object.keys(raw)) ppl[k] = await nameOf(box, raw[k]);
  const devs = devMap(all.devs), n = now(), list = [];
  Object.keys(devs).forEach((k) => {
    const d = devs[k], key = d.g + '-' + d.c + '-' + d.n; if (!(key in ppl)) return;
    list.push({ k: key, name: ppl[key], cnt: d.cnt, best: d.best, run: d.run, ctl: d.ctl, st: n - (d.t || 0) > 30000 ? 'off' : d.st });
  });
  return { t: mid(t0), ppl, devs: list, ctl: js(all.ctl, null), host: meta.hostBox ? await nameOf(box, meta.hostBox) : '', code: meta.code, mode: meta.mode || 'all', cap: MODE[meta.mode] || 40 };
}
export async function stuLeave(sid, who, room) {
  const t0 = Date.now(); await begin(sid); room = roomId(room);
  await fb.rt('DELETE', R(sid, room) + '/ppl/' + who.g + '-' + who.c + '-' + who.n).catch(() => {});
  return { t: mid(t0) };
}
