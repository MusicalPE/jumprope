// 점퍼스 클라우드판 (Jump Us! 줄넘기 기록) — 선생님은 구글 로그인, 학생은 QR 하나
// 학생 이름·번호는 이 브라우저에서 공간 키로 잠가서 올림 → 운영자도 볼 수 없음
import * as fb from './fb.js';
import * as C from './crypto.js';

const VERSION = '0.1.0';
const KINDS_DEFAULT = [{ id: 'k1', name: '모아뛰기' }, { id: 'k2', name: '엇갈아뛰기' }, { id: 'k3', name: '이중뛰기' }, { id: 'k4', name: '십자뛰기' }];
const MAXN = 5000;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
const ym = (d) => String(d).slice(0, 7);
const ls = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
const BASE = location.origin + location.pathname;

const P = new URLSearchParams(location.search);
const S = { sid: P.get('s') || '', user: null, mode: '', key: null, wtok: '', space: null, pub: null, roster: [], month: null, inbox: [], tab: 'students' };

// 학생 QR 로 들어왔으면 열쇠를 이 기기에 기억하고 주소창에서는 지움
function takeHash() {
  if (!S.sid || !location.hash) return false;
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('k') && h.get('w')) { ls.set('jumpus:stu:' + S.sid, { k: h.get('k'), w: h.get('w') }); history.replaceState(null, '', location.pathname + location.search); return true; }
  return false;
}
takeHash();
window.addEventListener('hashchange', () => { if (takeHash()) location.reload(); });   // 열린 탭에서 새 QR 을 찍었을 때

function view(html) { $('#app').innerHTML = html; window.scrollTo(0, 0); }
function top(navHtml) {
  return '<div class="top"><a class="brand" href="' + esc(BASE) + '"><img src="../icons/icon-192.png" alt=""><span><b>Jump Us!</b> 줄넘기 기록</span></a><div class="nav">' + (navHtml || '') + '</div></div>';
}
function foot() { return '<div class="foot">점퍼스 클라우드판 ' + VERSION + ' · 학생 이름은 잠가서 저장해요 · Made by 음악적체육인</div>'; }
function msg(el, text, kind) { if (typeof el === 'string') el = $(el); if (el) el.innerHTML = text ? '<div class="msg ' + (kind || 'ok') + '">' + esc(text) + '</div>' : ''; }
function busy(btn, on) { if (!btn) return; btn.disabled = on; if (on) { btn.dataset.t = btn.textContent; btn.textContent = '잠시만요…'; } else if (btn.dataset.t) btn.textContent = btn.dataset.t; }
function isTeacher() { return S.mode === 'teacher'; }
function kinds() { return (S.pub && S.pub.kinds && S.pub.kinds.length) ? S.pub.kinds : KINDS_DEFAULT; }
function kindName(id) { const k = kinds().find((x) => x.id === id); return k ? k.name : '기타'; }
function stu(id) { return S.roster.find((s) => s.id === id); }
function label(s) { return s ? s.g + '-' + s.c + ' ' + s.no + '번 ' + s.name : '(지운 학생)'; }

// ================= 시작 =================
fb.init();
let routed = '';
fb.onUser((u) => { S.user = u; const sig = u ? u.uid + (u.anon ? 'a' : 'g') : '-'; if (sig !== routed) { routed = sig; route().catch(fatal); } });

function fatal(e) { console.error(e); view('<div class="container narrow">' + top() + '<div class="card"><h2>문제가 생겼어요</h2><div class="msg err">' + esc(fb.errText(e)) + '</div><button onclick="location.reload()">다시 불러오기</button></div></div>'); }

async function route() {
  const u = S.user;
  if (!S.sid) return u && !u.anon ? viewSpaces() : viewLogin();
  const stuCred = ls.get('jumpus:stu:' + S.sid);
  if (u && !u.anon) {
    let space = null;
    try { space = await fb.get('spaces/' + S.sid); } catch (e) { space = null; }
    if (space) { S.space = space; S.mode = 'teacher'; S.wtok = space.wtok; return teacherEnter(); }
    if (!stuCred) return viewNotMember();
  }
  if (stuCred) {
    if (!u) { await fb.signInAnon(); return; }   // 로그인되면 onUser 가 다시 부름
    S.mode = 'student'; S.wtok = stuCred.w;
    try { S.key = await C.importKeyUrl(stuCred.k); } catch (e) { ls.del('jumpus:stu:' + S.sid); return viewNeedQR('QR 정보가 올바르지 않아요. 선생님 QR을 다시 찍어 주세요.'); }
    await loadAll();
    return viewMain();
  }
  return viewNeedQR();
}

// ================= 로그인 · 내 공간 =================
function viewLogin() {
  view('<div class="container narrow">' + top() +
    '<div class="hero"><h1>Jump Us! 줄넘기 기록</h1><div class="sub">설치 없이, 구글 로그인만으로 우리 학교 줄넘기 기록을 시작해요.</div></div>' +
    '<div class="card"><h2>선생님 로그인</h2><p class="hint">학생은 로그인하지 않아요. 선생님이 띄운 QR을 찍으면 바로 들어와요.</p>' +
    '<button id="gbtn">구글로 로그인</button><div id="m"></div></div>' + foot() + '</div>');
  $('#gbtn').onclick = async () => { try { await fb.signInGoogle(); } catch (e) { msg('#m', fb.errText(e), 'err'); } };
}

async function viewSpaces() {
  view('<div class="container narrow">' + top('<button class="btn-outline btn-sm" id="out">로그아웃</button>') + '<div class="loading">내 공간을 불러오는 중…</div></div>');
  $('#out').onclick = () => fb.signOut();
  let my = null; try { my = await fb.get('users/' + S.user.uid); } catch (e) { my = null; }
  const sp = (my && my.spaces) || {};
  const ids = Object.keys(sp);
  view('<div class="container narrow">' + top('<button class="btn-outline btn-sm" id="out">로그아웃</button>') +
    '<div class="card"><h2>내 학교 공간</h2>' + (ids.length ? '<div class="spaces">' + ids.map((id) => '<a href="?s=' + esc(id) + '"><span>' + esc(sp[id]) + '</span><span class="hint">열기 →</span></a>').join('') + '</div>' : '<p class="hint">아직 공간이 없어요. 새로 만들거나, 함께 쓰는 선생님께 받은 초대 코드를 넣어 주세요.</p>') + '</div>' +
    '<div class="grid2"><div class="card"><h2>새 학교 공간 만들기</h2><p class="hint">학교(또는 학급)마다 하나씩 만들어요.</p><button id="newbtn">새로 만들기</button></div>' +
    '<div class="card"><h2>초대 코드로 함께하기</h2><label for="inv">초대 코드</label><input id="inv" maxlength="12" autocomplete="off"><div style="margin-top:10px"><button id="joinbtn">함께하기</button></div><div id="jm"></div></div></div>' +
    '<p class="hint center">' + esc(S.user.email || S.user.name) + ' 로 로그인했어요</p>' + foot() + '</div>');
  $('#out').onclick = () => fb.signOut();
  $('#newbtn').onclick = viewCreate;
  $('#joinbtn').onclick = async () => {
    const code = $('#inv').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 6) return msg('#jm', '초대 코드를 확인해 주세요.', 'err');
    const b = $('#joinbtn'); busy(b, true);
    try {
      const inv = await fb.get('invites/' + code);
      if (!inv || inv.exp < Date.now()) throw new Error('초대 코드가 없거나 기한이 지났어요. 새 코드를 받아 주세요.');
      await fb.set('spaces/' + inv.sid + '/members/' + S.user.uid, { role: 'teacher', code: code, name: S.user.name || '', joined: fb.NOW });
      const pub = await fb.get('spaces/' + inv.sid + '/meta/pub');
      await fb.set('users/' + S.user.uid, { spaces: { [inv.sid]: (pub && pub.name) || '학교 공간' } }, true);
      location.href = '?s=' + inv.sid;
    } catch (e) { busy(b, false); msg('#jm', fb.errText(e), 'err'); }
  };
}

function viewCreate() {
  view('<div class="container narrow">' + top('<a class="btn btn-outline btn-sm" href="' + esc(BASE) + '">← 내 공간</a>') +
    '<div class="card"><h2>새 학교 공간 만들기</h2>' +
    '<label for="nm">학교 이름 (전국 현황판에 보일 이름)</label><input id="nm" maxlength="30" placeholder="예: 햇살초등학교">' +
    '<label for="pw">공간 비밀번호 (8자 이상)</label><input id="pw" type="password" autocomplete="new-password">' +
    '<label for="pw2">한 번 더</label><input id="pw2" type="password" autocomplete="new-password">' +
    '<p class="hint">학생 이름은 이 비밀번호로 잠가서 저장해요. 운영자도 풀 수 없어요. 함께 쓰는 선생님께도 이 비밀번호를 알려 주세요.</p>' +
    '<button id="mk">만들기</button><div id="m"></div></div></div>');
  $('#mk').onclick = async () => {
    const name = $('#nm').value.trim(), pw = $('#pw').value, pw2 = $('#pw2').value;
    if (!name) return msg('#m', '학교 이름을 넣어 주세요.', 'err');
    if (pw.length < 8) return msg('#m', '비밀번호는 8자 이상으로 해 주세요.', 'err');
    if (pw !== pw2) return msg('#m', '두 비밀번호가 달라요.', 'err');
    const b = $('#mk'); busy(b, true);
    try {
      const sid = C.randId(24), wtok = C.randId(24), rc = C.newRecoveryCode();
      const key = await C.newTeamKey();
      const crypto = { wrap: await C.wrapKey(key, pw), recovery: await C.wrapKey(key, C.normRecovery(rc)), check: await C.seal(key, { ok: 1 }, sid + '/check') };
      const qbox = await C.seal(key, { k: await C.exportKeyUrl(key) }, sid + '/qbox');
      const uid = S.user.uid;
      await fb.set('spaces/' + sid, { owner: uid, name, created: fb.NOW, crypto, qbox, wtok });
      await fb.set('spaces/' + sid + '/members/' + uid, { role: 'owner', name: S.user.name || '', joined: fb.NOW });
      await fb.batch([
        ['set', 'spaces/' + sid + '/meta/pub', { name, approval: false, kinds: KINDS_DEFAULT }],
        ['set', 'spaces/' + sid + '/meta/roster', { list: {} }],
        ['set', 'spaces/' + sid + '/keys/' + wtok, { t: fb.NOW }],
        ['set', 'users/' + uid, { spaces: { [sid]: name } }, true]
      ]);
      await C.rememberKey(sid, key);
      viewRecovery(sid, rc);
    } catch (e) { busy(b, false); msg('#m', fb.errText(e), 'err'); }
  };
}

function viewRecovery(sid, rc) {
  view('<div class="container narrow">' + top() + '<div class="card"><h2>복구 코드를 적어 두세요</h2>' +
    '<p class="hint">공간 비밀번호를 잊으면 이 코드로만 학생 이름을 다시 열 수 있어요. 운영자도 대신 찾아 줄 수 없어요.</p>' +
    '<div class="recovery" id="rc">' + esc(rc) + '</div>' +
    '<div class="row" style="margin-top:12px"><button class="btn-outline" id="cp">복사</button><button class="btn-outline" onclick="window.print()">인쇄</button></div>' +
    '<label style="display:flex;gap:8px;align-items:center;margin-top:14px;color:var(--ink)"><input type="checkbox" id="ok" style="width:auto;min-height:0"> 안전한 곳에 적어 두었어요</label>' +
    '<button id="go" disabled style="margin-top:10px">계속</button></div></div>');
  $('#cp').onclick = () => navigator.clipboard && navigator.clipboard.writeText(rc);
  $('#ok').onchange = (e) => { $('#go').disabled = !e.target.checked; };
  $('#go').onclick = () => { location.href = '?s=' + sid; };
}

function viewNotMember() {
  view('<div class="container narrow">' + top('<a class="btn btn-outline btn-sm" href="' + esc(BASE) + '">← 내 공간</a>') + '<div class="card"><h2>이 공간의 선생님이 아니에요</h2><p class="hint">함께 쓰려면 이 공간의 선생님께 초대 코드를 받아 [내 공간]에서 넣어 주세요. 학생이라면 선생님 QR을 찍어 주세요.</p><button class="btn-outline" id="out">다른 계정으로 로그인</button></div></div>');
  $('#out').onclick = async () => { await fb.signOut(); await fb.signInGoogle(); };
}

function viewNeedQR(text) {
  view('<div class="container narrow">' + top() + '<div class="card"><h2>QR로 들어와 주세요</h2>' + (text ? '<div class="msg warn">' + esc(text) + '</div>' : '') + '<p class="hint">학생은 선생님이 띄운 QR을 찍으면 들어와요.</p><p class="hint">선생님이라면 구글로 로그인해 주세요.</p><button id="gbtn">선생님 구글 로그인</button><div id="m"></div></div></div>');
  $('#gbtn').onclick = async () => { try { await fb.signInGoogle(); } catch (e) { msg('#m', fb.errText(e), 'err'); } };
}

// ================= 선생님: 열쇠 열기 =================
async function teacherEnter() {
  S.key = await C.recallKey(S.sid);
  if (S.key) { try { await C.open(S.key, S.space.crypto.check, S.sid + '/check'); } catch (e) { S.key = null; await C.forgetKey(S.sid); } }
  if (!S.key) return viewUnlock();
  await loadAll();
  viewMain();
}
function viewUnlock() {
  view('<div class="container narrow">' + top('<a class="btn btn-outline btn-sm" href="' + esc(BASE) + '">← 내 공간</a>') + '<div class="card"><h2>' + esc(S.space.name) + ' 열기</h2>' +
    '<p class="hint">이 기기에서 처음 열 때 한 번만 공간 비밀번호를 넣어요. 비밀번호를 잊었으면 복구 코드를 넣어도 돼요.</p>' +
    '<label for="pw">공간 비밀번호 또는 복구 코드</label><input id="pw" type="password" autocomplete="current-password">' +
    '<div style="margin-top:10px"><button id="go">열기</button></div><div id="m"></div></div></div>');
  const go = async () => {
    const v = $('#pw').value; if (!v) return;
    const b = $('#go'); busy(b, true);
    try {
      const key = await unwrapAny(v);
      await C.rememberKey(S.sid, key); S.key = key;
      await loadAll(); viewMain();
    } catch (e) { busy(b, false); msg('#m', '비밀번호(또는 복구 코드)가 맞지 않아요.', 'err'); }
  };
  $('#go').onclick = go; $('#pw').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}
async function unwrapAny(v) {
  const cr = S.space.crypto;
  const key = C.looksLikeRecovery(v) ? await C.unwrapKey(cr.recovery, C.normRecovery(v), true) : await C.unwrapKey(cr.wrap, v, true);
  await C.open(key, cr.check, S.sid + '/check');
  return key;
}

// ================= 데이터 =================
async function loadAll() {
  const [pub, ros] = await Promise.all([fb.get('spaces/' + S.sid + '/meta/pub'), fb.get('spaces/' + S.sid + '/meta/roster')]);
  if (!pub) throw new Error('이 공간을 찾을 수 없어요. 주소나 QR을 확인해 주세요.');
  S.pub = pub;
  const list = (ros && ros.list) || {};
  const out = [];
  await Promise.all(Object.keys(list).map(async (id) => {
    const r = list[id];
    try { const o = await C.open(S.key, r.b, S.sid + '/roster/' + id); out.push({ id, g: r.g, c: r.c, no: o.no, name: o.name, h: o.h || '', raw: r }); }
    catch (e) { out.push({ id, g: r.g, c: r.c, no: 0, name: '(열 수 없음)', h: '', raw: r }); }
  }));
  out.sort((a, b) => a.g - b.g || a.c - b.c || a.no - b.no);
  S.roster = out;
  await loadRecords();
}
async function loadRecords() {
  const [m, inbox] = await Promise.all([fb.get('spaces/' + S.sid + '/months/' + ym(today())), fb.list('spaces/' + S.sid + '/inbox')]);
  S.month = m || { d: {} }; S.inbox = inbox;
  if (isTeacher() && inbox.some((x) => x.data.st === 'ok')) { try { await fold(); } catch (e) { console.warn('fold', e); } }
}
// 승인된 inbox 기록을 달 요약으로 접기 (선생님 화면에서만)
async function fold() {
  const ok = S.inbox.filter((x) => x.data.st === 'ok');
  if (!ok.length) return;
  const byMonth = {};
  ok.forEach((x) => {
    const e = x.data, m = ym(e.d), dd = e.d.slice(8, 10);
    const o = byMonth[m] = byMonth[m] || { d: {} };
    const day = o.d[dd] = o.d[dd] || {};
    const st = day[e.s] = day[e.s] || {};
    st[e.k] = (st[e.k] || 0) + e.n;
  });
  const ops = [];
  Object.keys(byMonth).forEach((m) => {
    const src = byMonth[m], inc = { d: {} };
    Object.keys(src.d).forEach((dd) => { inc.d[dd] = {}; Object.keys(src.d[dd]).forEach((s) => { inc.d[dd][s] = {}; Object.keys(src.d[dd][s]).forEach((k) => { inc.d[dd][s][k] = fb.INC(src.d[dd][s][k]); }); }); });
    ops.push(['set', 'spaces/' + S.sid + '/months/' + m, inc, true]);
  });
  ok.forEach((x) => ops.push(['del', 'spaces/' + S.sid + '/inbox/' + x.id]));
  await fb.batch(ops);
  const [m, inbox] = await Promise.all([fb.get('spaces/' + S.sid + '/months/' + ym(today())), fb.list('spaces/' + S.sid + '/inbox')]);
  S.month = m || { d: {} }; S.inbox = inbox;
}
// 이번 달 학생별·날짜별 합계 (달 요약 + 아직 안 접힌 승인 기록)
function monthData() {
  const cur = ym(today()), d = JSON.parse(JSON.stringify((S.month && S.month.d) || {}));
  S.inbox.forEach((x) => {
    const e = x.data; if (e.st !== 'ok' || ym(e.d) !== cur) return;
    const dd = e.d.slice(8, 10); d[dd] = d[dd] || {}; d[dd][e.s] = d[dd][e.s] || {}; d[dd][e.s][e.k] = (d[dd][e.s][e.k] || 0) + e.n;
  });
  const per = {}; let total = 0, todayTotal = 0; const tdd = today().slice(8, 10);
  Object.keys(d).forEach((dd) => Object.keys(d[dd]).forEach((s) => Object.keys(d[dd][s]).forEach((k) => {
    const n = d[dd][s][k] || 0; per[s] = (per[s] || 0) + n; total += n; if (dd === tdd) todayTotal += n;
  })));
  return { d, per, total, todayTotal };
}

// ================= 메인 =================
function viewMain() {
  const md = monthData();
  const people = S.roster.filter((s) => md.per[s.id] > 0);
  const nav = isTeacher()
    ? '<button class="btn-outline btn-sm" id="qrb">접속 QR</button><button class="btn-outline btn-sm" id="adm">관리</button><a class="btn btn-outline btn-sm" href="' + esc(BASE) + '">내 공간</a>'
    : '';
  const grades = [...new Set(S.roster.map((s) => s.g))];
  const ranked = S.roster.filter((s) => md.per[s.id] > 0).sort((a, b) => md.per[b.id] - md.per[a.id]);
  const max = ranked.length ? md.per[ranked[0].id] : 1;
  const waiting = S.inbox.filter((x) => x.data.st === 'wait').length;
  view('<div class="container">' + top(nav) +
    '<div class="hero"><h1>' + esc(S.pub.name) + ' 줄넘기 기록</h1><div class="sub">' + esc(today()) + (isTeacher() && waiting ? ' · 승인 기다리는 기록 ' + waiting + '개' : '') + '</div>' +
    '<div class="stats"><div class="stat"><div class="v">' + fmt(md.todayTotal) + '</div><div class="l">오늘 우리 학교</div></div><div class="stat"><div class="v">' + fmt(md.total) + '</div><div class="l">이번 달 전체</div></div><div class="stat"><div class="v">' + people.length + '</div><div class="l">이번 달 뛴 학생</div></div></div></div>' +
    '<div class="grid2"><div class="card"><h2>오늘 기록 입력</h2>' + (S.roster.length ? (
      '<div class="row"><div><label for="fg">학년</label><select id="fg"><option value="">선택</option>' + grades.map((g) => '<option>' + g + '</option>').join('') + '</select></div>' +
      '<div><label for="fc">반</label><select id="fc"><option value="">학년 먼저</option></select></div></div>' +
      '<label for="fs">이름</label><select id="fs"><option value="">반 먼저 선택</option></select>' +
      '<label for="fk">줄넘기 종류</label><select id="fk">' + kinds().map((k) => '<option value="' + esc(k.id) + '">' + esc(k.name) + '</option>').join('') + '</select>' +
      '<label for="fn">뛴 횟수</label><input id="fn" type="number" inputmode="numeric" min="1" max="' + MAXN + '">' +
      '<label style="display:flex;gap:8px;align-items:center;color:var(--ink-2);font-weight:600"><input type="checkbox" id="fme" style="width:auto;min-height:0"> 이 기기에 내 이름 기억하기</label>' +
      '<div style="margin-top:10px"><button id="save">저장</button></div><div id="fm"></div>'
    ) : '<p class="hint">' + (isTeacher() ? '아직 학생이 없어요. [관리] → [학생]에서 먼저 등록해 주세요.' : '아직 학생 명단이 없어요. 선생님께 알려 주세요.') + '</p>') + '</div>' +
    '<div class="card"><h2>이번 달 기록</h2>' + (ranked.length ? '<div class="bars">' + ranked.map((s) => '<div class="bar"><button class="nm" data-stu="' + esc(s.id) + '" title="' + esc(label(s)) + '">' + esc(s.name) + '</button><div class="track"><div class="fill" style="width:' + Math.max(3, Math.round(md.per[s.id] / max * 100)) + '%"></div></div><div class="n">' + fmt(md.per[s.id]) + '</div></div>').join('') + '</div><p class="hint">이름을 누르면 내 기록을 볼 수 있어요.</p>' : '<p class="hint">이번 달 기록이 아직 없어요.</p>') + '</div></div>' +
    foot() + '</div>');
  if (isTeacher()) { $('#qrb').onclick = showQrOverlay; $('#adm').onclick = () => viewAdmin(waiting ? 'approve' : S.tab); }
  $$('[data-stu]').forEach((b) => { b.onclick = () => viewStudent(b.dataset.stu); });
  if (!S.roster.length) return;
  const fg = $('#fg'), fc = $('#fc'), fs = $('#fs');
  const fillC = () => { const g = +fg.value; const cs = [...new Set(S.roster.filter((s) => s.g === g).map((s) => s.c))]; fc.innerHTML = '<option value="">' + (g ? '선택' : '학년 먼저') + '</option>' + cs.map((c) => '<option>' + c + '</option>').join(''); fillS(); };
  const fillS = () => { const g = +fg.value, c = +fc.value; const ss = S.roster.filter((s) => s.g === g && s.c === c); fs.innerHTML = '<option value="">' + (c ? '선택' : '반 먼저 선택') + '</option>' + ss.map((s) => '<option value="' + esc(s.id) + '">' + s.no + '번 ' + esc(s.name) + '</option>').join(''); };
  fg.onchange = fillC; fc.onchange = fillS;
  const me = ls.get('jumpus:me:' + S.sid); const meS = me && stu(me);
  if (meS) { fg.value = meS.g; fillC(); fc.value = meS.c; fillS(); fs.value = meS.id; $('#fme').checked = true; }
  $('#save').onclick = async () => {
    const sId = fs.value, k = $('#fk').value, n = Math.round(Number($('#fn').value));
    if (!sId) return msg('#fm', '이름을 골라 주세요.', 'err');
    if (!(n >= 1 && n <= MAXN)) return msg('#fm', '뛴 횟수는 1에서 ' + fmt(MAXN) + ' 사이로 넣어 주세요.', 'err');
    if ($('#fme').checked) ls.set('jumpus:me:' + S.sid, sId); else if (me === sId) ls.del('jumpus:me:' + S.sid);
    let wait = !!(S.pub.approval && !isTeacher());
    const b = $('#save'); busy(b, true);
    const send = () => fb.add('spaces/' + S.sid + '/inbox', { s: sId, d: today(), k, n, src: 'hand', st: wait ? 'wait' : 'ok', w: S.wtok, t: fb.NOW });
    try {
      try { await send(); }
      catch (e1) {   // 화면을 연 뒤에 선생님이 승인 절차를 켰을 수 있음 → 설정을 다시 읽고 승인 대기로 한 번 더
        if (isTeacher() || wait || !String(e1 && e1.code).includes('permission-denied')) throw e1;
        const pub = await fb.get('spaces/' + S.sid + '/meta/pub');
        if (!pub || !pub.approval) throw e1;
        S.pub = pub; wait = true; await send();
      }
      await loadRecords();
      viewMain();
      msg('#fm', wait ? '입력되었습니다! 선생님 승인 후 그래프에 반영됩니다.' : '입력되었습니다!', 'ok');
    } catch (e) { busy(b, false); msg('#fm', (!isTeacher() && String(e && e.code).includes('permission-denied')) ? 'QR이 바뀌었어요. 선생님이 새로 띄운 QR을 다시 찍어 주세요.' : fb.errText(e), 'err'); }
  };
}

// ================= 학생 기록 조회 =================
function viewStudent(id) {
  const s = stu(id); if (!s) return;
  view('<div class="container narrow">' + top('<button class="btn-outline btn-sm" id="back">← 메인으로</button>') + '<div class="card"><h2>' + esc(label(s)) + '</h2>' +
    (isTeacher() ? '' : '<label for="pw">비밀번호</label><input id="pw" type="password" inputmode="numeric" autocomplete="off"><p class="hint">처음 비밀번호는 1234예요. 바꾸고 싶으면 선생님께 말씀해 주세요.</p><button id="go">보기</button>') +
    '<div id="m"></div><div id="body"></div></div></div>');
  $('#back').onclick = viewMain;
  const show = () => {
    const md = monthData();
    const days = Object.keys(md.d).sort().filter((dd) => md.d[dd][id]);
    const pend = S.inbox.filter((x) => x.data.s === id && x.data.st === 'wait');
    $('#body').innerHTML = '<p><b>이번 달 ' + fmt(md.per[id] || 0) + '회</b></p>' +
      (days.length ? '<table><tr><th>날짜</th><th>종류</th><th style="text-align:right">횟수</th></tr>' + days.reverse().map((dd) => Object.keys(md.d[dd][id]).map((k) => '<tr><td>' + esc(ym(today()) + '-' + dd) + '</td><td>' + esc(kindName(k)) + '</td><td style="text-align:right">' + fmt(md.d[dd][id][k]) + '</td></tr>').join('')).join('') + '</table>' : '<p class="hint">이번 달 기록이 없어요.</p>') +
      (pend.length ? '<p class="hint" style="margin-top:12px">승인 기다리는 기록 ' + pend.length + '개: ' + pend.map((x) => esc(kindName(x.data.k)) + ' ' + fmt(x.data.n) + '회').join(', ') + '</p>' : '');
  };
  if (isTeacher()) return show();
  const go = async () => {
    const h = await C.pwHash(S.sid, id, $('#pw').value);
    const ok = s.h ? h === s.h : $('#pw').value === '1234';
    if (!ok) return msg('#m', '비밀번호가 맞지 않아요.', 'err');
    msg('#m', ''); $('#pw').closest('.card').querySelectorAll('label,#pw,.hint,#go').forEach((e) => e.remove()); show();
  };
  $('#go').onclick = go; $('#pw').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}

// ================= 접속 QR =================
async function studentLink() {
  const q = await C.open(S.key, S.space.qbox, S.sid + '/qbox');
  return BASE + '?s=' + S.sid + '#k=' + q.k + '&w=' + S.space.wtok;
}
function qrSvg(text) {
  if (typeof qrcode !== 'function') return '<p class="hint">QR을 만들 도구를 불러오지 못했어요. 새로고침해 주세요.</p>';
  const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}
async function showQrOverlay() {
  const link = await studentLink();
  const ov = document.createElement('div'); ov.className = 'overlay'; ov.id = 'qrOverlay';
  ov.innerHTML = '<div class="sheet"><h2 style="margin:0 0 6px">' + esc(S.pub.name) + '</h2><p class="hint">휴대폰 카메라로 찍으면 바로 기록하는 화면이 열려요</p><div class="qr">' + qrSvg(link) + '</div><button id="qx" style="margin-top:12px">닫기</button></div>';
  document.body.appendChild(ov);
  const close = () => { ov.remove(); document.removeEventListener('keydown', onEsc); };
  const onEsc = (e) => { if (e.key === 'Escape') close(); };
  $('#qx').onclick = close; ov.onclick = (e) => { if (e.target === ov) close(); }; document.addEventListener('keydown', onEsc);
}

// ================= 관리 =================
const TABS = [['students', '학생'], ['approve', '기록 승인'], ['settings', '설정'], ['qr', '접속 QR'], ['teachers', '선생님'], ['keys', '비밀번호 · 복구 코드']];
async function viewAdmin(tab) {
  S.tab = tab || 'students';
  if (S.tab === 'approve') { try { await loadRecords(); } catch (e) {} }   // 승인 탭은 열 때마다 새로 읽음
  const waiting = S.inbox.filter((x) => x.data.st === 'wait').length;
  view('<div class="container">' + top('<button class="btn-outline btn-sm" id="back">← 메인으로</button>') +
    '<h1 style="margin:0 0 12px;font-size:1.4em">관리 · ' + esc(S.pub.name) + '</h1>' +
    '<div class="tabs">' + TABS.map((t) => '<button data-tab="' + t[0] + '" class="' + (t[0] === S.tab ? 'on' : '') + '">' + t[1] + (t[0] === 'approve' && waiting ? ' (' + waiting + ')' : '') + '</button>').join('') + '</div>' +
    '<div id="pane"></div>' + foot() + '</div>');
  $('#back').onclick = async () => { await loadRecords(); viewMain(); };
  $$('[data-tab]').forEach((b) => { b.onclick = () => viewAdmin(b.dataset.tab); });
  const pane = $('#pane');
  ({ students: paneStudents, approve: paneApprove, settings: paneSettings, qr: paneQr, teachers: paneTeachers, keys: paneKeys })[S.tab](pane);
}

// ---- 학생 ----
async function saveRoster(changes) {
  // changes: { add: [{g,c,no,name}], del: [id], resetPw: [id] }
  const list = {}; S.roster.forEach((s) => { list[s.id] = s.raw; });
  for (const id of (changes.del || [])) delete list[id];
  for (const id of (changes.resetPw || [])) { const s = stu(id); if (s && list[id]) list[id] = { g: s.g, c: s.c, b: await C.seal(S.key, { no: s.no, name: s.name, h: '' }, S.sid + '/roster/' + id) }; }
  for (const a of (changes.add || [])) { const id = C.randId(8); list[id] = { g: a.g, c: a.c, b: await C.seal(S.key, { no: a.no, name: a.name, h: '' }, S.sid + '/roster/' + id) }; }
  await fb.set('spaces/' + S.sid + '/meta/roster', { list });
  await loadAll();
}
function paneStudents(p) {
  p.innerHTML = '<div class="grid2"><div class="card"><h2>학생 등록</h2><p class="hint">한 줄에 한 명씩 <b>학년 반 번호 이름</b> 순서로 적어요. 엑셀에서 네 칸을 복사해 붙여 넣어도 돼요.</p>' +
    '<textarea id="bulk" placeholder="4 1 1 김하늘&#10;4 1 2 박준우"></textarea><div style="margin-top:10px"><button id="add">등록</button></div><div id="am"></div></div>' +
    '<div class="card"><h2>학생 명단 (' + S.roster.length + '명)</h2>' + (S.roster.length ? '<table><tr><th>학년-반</th><th>번호</th><th>이름</th><th></th></tr>' + S.roster.map((s) => '<tr><td>' + s.g + '-' + s.c + '</td><td>' + s.no + '</td><td>' + esc(s.name) + '</td><td style="text-align:right;white-space:nowrap"><button class="btn-outline btn-sm" data-rp="' + esc(s.id) + '">비밀번호 초기화</button> <button class="btn-danger btn-sm" data-del="' + esc(s.id) + '">삭제</button></td></tr>').join('') + '</table>' : '<p class="hint">아직 학생이 없어요.</p>') + '<div id="lm"></div></div></div>';
  $('#add').onclick = async () => {
    const rows = $('#bulk').value.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const add = [], bad = [];
    rows.forEach((l) => { const m = l.split(/[\s,\t]+/); const g = parseInt(m[0], 10), c = parseInt(m[1], 10), no = parseInt(m[2], 10), name = m.slice(3).join(' ').trim(); if (g >= 1 && g <= 12 && c >= 1 && c <= 30 && no >= 1 && no <= 60 && name) add.push({ g, c, no, name: name.slice(0, 20) }); else bad.push(l); });
    if (!add.length) return msg('#am', '등록할 줄이 없어요. "4 1 3 김하늘" 처럼 적어 주세요.', 'err');
    const dup = add.filter((a) => S.roster.some((s) => s.g === a.g && s.c === a.c && s.no === a.no));
    const b = $('#add'); busy(b, true);
    try { await saveRoster({ add: add.filter((a) => !dup.includes(a)) }); viewAdmin('students'); msg('#am', (add.length - dup.length) + '명 등록했어요.' + (dup.length ? ' 같은 번호가 이미 있는 ' + dup.length + '명은 뺐어요.' : '') + (bad.length ? ' 알아보지 못한 줄 ' + bad.length + '개는 뺐어요.' : ''), 'ok'); }
    catch (e) { busy(b, false); msg('#am', fb.errText(e), 'err'); }
  };
  $$('[data-del]').forEach((b) => { b.onclick = async () => { const s = stu(b.dataset.del); if (!confirmBox(label(s) + ' 학생을 명단에서 지울까요? (지난 기록 숫자는 남지만 이름은 보이지 않게 돼요)')) return; busy(b, true); try { await saveRoster({ del: [s.id] }); viewAdmin('students'); } catch (e) { busy(b, false); msg('#lm', fb.errText(e), 'err'); } }; });
  $$('[data-rp]').forEach((b) => { b.onclick = async () => { busy(b, true); try { await saveRoster({ resetPw: [b.dataset.rp] }); viewAdmin('students'); msg('#lm', '비밀번호를 1234로 되돌렸어요.', 'ok'); } catch (e) { busy(b, false); msg('#lm', fb.errText(e), 'err'); } }; });
}
function confirmBox(t) { return window.confirm(t); }

// ---- 기록 승인 ----
function paneApprove(p) {
  const w = S.inbox.filter((x) => x.data.st === 'wait').sort((a, b) => (a.data.t || 0) - (b.data.t || 0));
  p.innerHTML = '<div class="card"><h2>기록 승인</h2><p class="hint">설정에서 승인 절차를 켜면 학생이 손으로 넣은 기록이 여기서 기다려요.</p>' +
    (w.length ? '<div style="margin-bottom:10px"><button id="all">모두 승인</button></div><table><tr><th>날짜</th><th>학생</th><th>종류</th><th style="text-align:right">횟수</th><th></th></tr>' + w.map((x) => '<tr><td>' + esc(x.data.d) + '</td><td>' + esc(label(stu(x.data.s))) + '</td><td>' + esc(kindName(x.data.k)) + '</td><td style="text-align:right">' + fmt(x.data.n) + '</td><td style="text-align:right;white-space:nowrap"><button class="btn-sm" data-ok="' + esc(x.id) + '">승인</button> <button class="btn-danger btn-sm" data-no="' + esc(x.id) + '">거절</button></td></tr>').join('') + '</table>' : '<p class="hint">기다리는 기록이 없어요.</p>') + '<div id="m"></div></div>';
  const act = async (ids, ok, btn) => {
    busy(btn, true);
    try { await fb.batch(ids.map((id) => ok ? ['update', 'spaces/' + S.sid + '/inbox/' + id, { st: 'ok' }] : ['del', 'spaces/' + S.sid + '/inbox/' + id])); await loadRecords(); viewAdmin('approve'); }
    catch (e) { busy(btn, false); msg('#m', fb.errText(e), 'err'); }
  };
  if ($('#all')) $('#all').onclick = (e) => act(w.map((x) => x.id), true, e.target);
  $$('[data-ok]').forEach((b) => { b.onclick = () => act([b.dataset.ok], true, b); });
  $$('[data-no]').forEach((b) => { b.onclick = () => act([b.dataset.no], false, b); });
}

// ---- 설정 ----
function paneSettings(p) {
  p.innerHTML = '<div class="card"><h2>설정</h2>' +
    '<label for="nm">학교 이름</label><input id="nm" maxlength="30" value="' + esc(S.pub.name) + '">' +
    '<label style="display:flex;gap:8px;align-items:center;color:var(--ink);margin-top:14px"><input type="checkbox" id="ap" style="width:auto;min-height:0"' + (S.pub.approval ? ' checked' : '') + '> 승인 절차 — 학생이 손으로 넣은 기록은 선생님이 승인한 뒤에 그래프에 반영</label>' +
    '<label for="kd">줄넘기 종류 (쉼표로 나눠요)</label><input id="kd" value="' + esc(kinds().map((k) => k.name).join(', ')) + '">' +
    '<p class="hint">이름만 바꾸면 지난 기록도 새 이름으로 보여요. 지운 종류의 지난 기록은 "기타"로 보여요.</p>' +
    '<div style="margin-top:10px"><button id="sv">저장</button></div><div id="m"></div></div>';
  $('#sv').onclick = async () => {
    const name = $('#nm').value.trim(); if (!name) return msg('#m', '학교 이름을 넣어 주세요.', 'err');
    const names = $('#kd').value.split(/[,，]/).map((x) => x.trim()).filter(Boolean).slice(0, 12);
    if (!names.length) return msg('#m', '줄넘기 종류를 하나 이상 넣어 주세요.', 'err');
    const old = kinds(); let next = 1; old.forEach((k) => { const n = parseInt(String(k.id).slice(1), 10); if (n >= next) next = n + 1; });
    const nk = names.map((nm, i) => { const same = old.find((k) => k.name === nm); return same ? same : (old[i] && !names.includes(old[i].name) ? { id: old[i].id, name: nm } : { id: 'k' + (next++), name: nm }); });
    const b = $('#sv'); busy(b, true);
    try {
      await fb.set('spaces/' + S.sid + '/meta/pub', { name, approval: $('#ap').checked, kinds: nk }, true);
      if (name !== S.space.name) { await fb.update('spaces/' + S.sid, { name }); await fb.set('users/' + S.user.uid, { spaces: { [S.sid]: name } }, true); S.space.name = name; }
      S.pub = Object.assign({}, S.pub, { name, approval: $('#ap').checked, kinds: nk });
      viewAdmin('settings'); msg('#m', '저장했어요.', 'ok');
    } catch (e) { busy(b, false); msg('#m', fb.errText(e), 'err'); }
  };
}

// ---- 접속 QR ----
async function paneQr(p) {
  const link = await studentLink();
  p.innerHTML = '<div class="card"><h2>학생 접속 QR</h2><div class="qrbox"><div class="qr">' + qrSvg(link) + '</div><div style="flex:1;min-width:240px">' +
    '<p class="hint">학생은 이 QR을 찍으면 로그인 없이 바로 기록 화면이 열려요. 주소 안에 학생 이름을 여는 열쇠가 들어 있어서, 학급 밖으로 퍼지지 않게 해 주세요.</p>' +
    '<div class="row"><button id="big">크게 보여주기</button><button class="btn-outline" id="cp">주소 복사</button></div>' +
    '<p class="hint" style="margin-top:16px">QR이 밖으로 퍼졌다면 새 QR을 만들어요. 예전 QR로는 더 이상 기록을 넣을 수 없어요.</p><button class="btn-danger" id="rot">새 QR 만들기</button><div id="m"></div></div></div></div>';
  $('#big').onclick = showQrOverlay;
  $('#cp').onclick = async () => { try { await navigator.clipboard.writeText(link); msg('#m', '주소를 복사했어요.', 'ok'); } catch (e) { msg('#m', link, 'warn'); } };
  $('#rot').onclick = async (e) => {
    if (!confirmBox('새 QR을 만들까요? 학생들은 새 QR을 다시 찍어야 기록을 넣을 수 있어요.')) return;
    busy(e.target, true);
    try {
      const w = C.randId(24), old = S.space.wtok;
      await fb.set('spaces/' + S.sid + '/keys/' + w, { t: fb.NOW });
      await fb.update('spaces/' + S.sid, { wtok: w });
      await fb.del('spaces/' + S.sid + '/keys/' + old);
      S.space.wtok = w; S.wtok = w; viewAdmin('qr');
    } catch (err) { busy(e.target, false); msg('#m', fb.errText(err), 'err'); }
  };
}

// ---- 선생님 ----
async function paneTeachers(p) {
  p.innerHTML = '<div class="card"><h2>함께 쓰는 선생님</h2><div id="ml" class="hint">불러오는 중…</div>' +
    '<h2 style="margin-top:18px">초대하기</h2><p class="hint">초대 코드를 만들어 함께 쓸 선생님께 알려 주세요(7일 동안 쓸 수 있어요). 학생 이름을 열려면 <b>공간 비밀번호</b>도 함께 알려 주셔야 해요.</p><button id="mk">초대 코드 만들기</button><div id="code"></div><div id="m"></div></div>';
  try {
    const ms = await fb.list('spaces/' + S.sid + '/members');
    $('#ml').innerHTML = '<table>' + ms.map((m) => '<tr><td>' + esc(m.data.name || '이름 없음') + (m.id === S.user.uid ? ' (나)' : '') + '</td><td>' + (m.data.role === 'owner' ? '만든 선생님' : '선생님') + '</td><td style="text-align:right">' + (S.space.owner === S.user.uid && m.id !== S.user.uid ? '<button class="btn-danger btn-sm" data-rm="' + esc(m.id) + '">빼기</button>' : '') + '</td></tr>').join('') + '</table>';
    $$('[data-rm]').forEach((b) => { b.onclick = async () => { if (!confirmBox('이 선생님을 공간에서 뺄까요?')) return; busy(b, true); try { await fb.del('spaces/' + S.sid + '/members/' + b.dataset.rm); viewAdmin('teachers'); } catch (e) { busy(b, false); msg('#m', fb.errText(e), 'err'); } }; });
  } catch (e) { $('#ml').textContent = fb.errText(e); }
  $('#mk').onclick = async (e) => {
    busy(e.target, true);
    try {
      const code = C.newRecoveryCode().replace(/-/g, '').slice(0, 8);
      await fb.set('invites/' + code, { sid: S.sid, by: S.user.uid, exp: Date.now() + 7 * 864e5 });
      busy(e.target, false); $('#code').innerHTML = '<p style="margin-top:12px">초대 코드</p><div class="code">' + esc(code) + '</div>';
    } catch (err) { busy(e.target, false); msg('#m', fb.errText(err), 'err'); }
  };
}

// ---- 비밀번호 · 복구 코드 ----
function paneKeys(p) {
  const owner = S.space.owner === S.user.uid;
  p.innerHTML = '<div class="card"><h2>공간 비밀번호 · 복구 코드</h2>' + (owner ? (
    '<label for="cur">지금 비밀번호 (또는 복구 코드)</label><input id="cur" type="password" autocomplete="current-password">' +
    '<label for="np">새 비밀번호 (8자 이상, 비워 두면 그대로)</label><input id="np" type="password" autocomplete="new-password">' +
    '<label style="display:flex;gap:8px;align-items:center;color:var(--ink);margin-top:12px"><input type="checkbox" id="nr" style="width:auto;min-height:0"> 복구 코드도 새로 만들기 (예전 코드는 못 쓰게 돼요)</label>' +
    '<div style="margin-top:10px"><button id="go">바꾸기</button></div><div id="m"></div>'
  ) : '<p class="hint">비밀번호와 복구 코드는 공간을 만든 선생님만 바꿀 수 있어요.</p>') +
    '<h2 style="margin-top:18px">이 기기</h2><p class="hint">이 기기는 공간 열쇠를 기억하고 있어요. 공용 컴퓨터라면 잊게 해 주세요.</p><button class="btn-outline" id="forget">이 기기에서 열쇠 잊기</button></div>';
  $('#forget').onclick = async () => { await C.forgetKey(S.sid); location.reload(); };
  if (!owner) return;
  $('#go').onclick = async (e) => {
    const cur = $('#cur').value, np = $('#np').value, nr = $('#nr').checked;
    if (!cur) return msg('#m', '지금 비밀번호를 넣어 주세요.', 'err');
    if (np && np.length < 8) return msg('#m', '새 비밀번호는 8자 이상으로 해 주세요.', 'err');
    if (!np && !nr) return msg('#m', '바꿀 것이 없어요.', 'err');
    busy(e.target, true);
    try {
      let key; try { key = await unwrapAny(cur); } catch (x) { throw new Error('지금 비밀번호(또는 복구 코드)가 맞지 않아요.'); }
      const cr = Object.assign({}, S.space.crypto); let rc = '';
      if (np) cr.wrap = await C.wrapKey(key, np);
      if (nr) { rc = C.newRecoveryCode(); cr.recovery = await C.wrapKey(key, C.normRecovery(rc)); }
      await fb.update('spaces/' + S.sid, { crypto: cr }); S.space.crypto = cr;
      if (rc) return viewRecovery(S.sid, rc);
      viewAdmin('keys'); msg('#m', '비밀번호를 바꿨어요. 함께 쓰는 선생님께도 알려 주세요.', 'ok');
    } catch (err) { busy(e.target, false); msg('#m', fb.errText(err), 'err'); }
  };
}
