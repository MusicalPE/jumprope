/*************************************************************
 * 줄넘기 기록 관리 v2.1 — 전국 현황판 중앙 수집기 (Collector.gs)
 * ------------------------------------------------------------
 * 운영자(선생님) 한 명만 설치합니다. 학교들은 설치할 필요가 없어요.
 *  1) 새 스프레드시트 → 확장 프로그램 → Apps Script → 이 파일 내용 붙여넣기
 *  2) 배포 → 새 배포 → 웹 앱 (실행: 나 / 액세스: 모든 사용자)
 *  3) 나온 …/exec 주소를 저장소의 national.json 의 "collector" 에 넣기
 *
 * 각 학교 화면이 하루 집계(학생별 합계, 이름은 가린 채)를 보내면 여기 쌓이고,
 * 현황판(board.html)·기록실(hall.html)은 여기서 한 달 단위로 묶은 결과를 받아 갑니다.
 *
 * 시트
 *  기록실(hall)은 최근 HALL_MONTHS(12)개 달을 고를 수 있음. Hidden 을 바꾼 뒤 바로 반영하려면 refreshCache 실행
 *
 *  - Schools : PublicId, Name, ShowName, Registered, FirstSeen, LastSeen, Hidden, SchoolName, Teacher, Contact
 *              (Hidden 칸에 1 을 넣으면 그 학교는 현황판·기록실에서 빠집니다)
 *              Name 은 현황판에 보이는 이름(공개한 학교만), SchoolName·Teacher·Contact 는 운영자만 보는 칸
 *              (현황판·기록실 응답에는 절대 나가지 않음. 담당 교사·연락처는 관리자 화면에서 보낼 때만 옴)
 *  - Daily   : PublicId, Date, Total, Participants, Camera, Students(JSON), UpdatedAt
 *              Students = [[학생키, 가린이름, 학년, 횟수, 카메라횟수, 최고연속], ...]  (최고연속: 껍데기 5판부터, 스마트 줄넘기·카메라 판정기로 잰 한 번에 이어 뛴 가장 많은 수)
 *  - Duels   : Code, Created, Kind, Dur, Deadline, HostPid, GuestPid, HostRes(JSON), GuestRes(JSON), HostAt, GuestAt  ← 학교 대결(도전장)
 *  - MatDaily: PublicId, Date, Rows(JSON), UpdatedAt   ← 색깔 매트 놀이터(카메라 판정·교사 승인 기록만)
 *              Rows = [[학생키, 가린이름, 학년, 게임, 난이도, 정답착지, 시도, 플레이초, 완주판수, 완주정답, 완주시도], ...]
 *************************************************************/

const COLLECTOR_VERSION = 15;  // 15: 학교 대결(도전장) — Duels 시트, 대결 코드로 두 학교가 같은 종목(점프 Live N분 한 판 / 하루 카메라 기록)을 1인당 평균으로 겨룸  // 14: 학교 이름(운영자 칸 SchoolName)이 같은 시트들(반마다 따로 설치)은 한 학교로 합쳐 집계 — 이름은 "지역 두 글자+학교 이름"(예: 서울햇살초등학교)  // 13: 한 번에 최고 연속 — 학생 줄 6번째 칸(best), 현황판 ropeBest 50등·학교 nb 전국 등수  // 12: 학교 하나 받을 때 학생마다 전국 등수 — 줄넘기 ?api=school (nr 횟수·rr 연속), 색동 ?api=matSchool (nrC 정답 착지·nrT 플레이 시간·nrA 정확도). 50등 밖이어도 전국 몇 등인지  11: 색동 한마당도 같은 순위 방식 — 학교 순위 10등까지(+우리 학교는 ?api=matSchool), 학생 순위 50등까지  10: 현황판 학교 순위는 10등까지만(+우리 학교는 따로), 학교 안 전체 순위는 ?api=school 로 그 학교만  9: 며칠 연속 뛰었나 순위(현황판 streaks, 기록실 streaks3·streaks50)  8: 전국 순위 50등까지(현황판 학생 50명, 기록실 students50·schools50)  7: 매트 '다 함께 하늘까지'(정답 착지 1번 = 1m, 학년도별 누적 climb)  6: 색깔 매트 놀이터 기록(matReport, ?api=matBoard)   4: 학년별 순위(?grade=), 지구 한 바퀴(allTime), 기록실 학생 키(상장용)  5: 지구 한 바퀴 학년도별(3월 1일 시작)
const TZ_ = 'Asia/Seoul';
const SH_SCHOOLS = 'Schools';
const SH_DAILY = 'Daily';
const MAX_STUDENTS_PER_DAY = 1200;
const MAX_COUNT_PER_STUDENT_DAY = 30000;
const MIN_REGISTERED_FOR_RATIO = 5;  // 1인당 평균·참여율 순위는 등록 학생 5명 이상 학교만
const BOARD_CACHE_SEC = 300;
const HALL_MONTHS = 12;          // 기록실에 고를 수 있는 지난 달 수 (시트 자료는 지우지 않음)
const HALL_CACHE_SEC = 21600;    // 끝난 달 기록실 저장 시간(6시간, 최대값). 지난 달은 늦은 입력이 있어 1시간

/************ 입구 ************/
function doGet(e) {
  const q = (e && e.parameter) || {};
  let out;
  try {
    if (q.api === 'board') out = getBoard_(q.month, q.grade);
    else if (q.api === 'school') out = getSchool_(q.pid, q.month, q.grade);
    else if (q.api === 'hall') out = getHall_(q.month);
    else if (q.api === 'matBoard') out = getMatBoard_(q.month, q.game, q.diff, q.band);
    else if (q.api === 'matSchool') out = getMatSchool_(q.pid, q.month, q.game, q.diff, q.band);
    else if (q.api === 'duel') out = duelView_(q.code);
    else if (q.api === 'duels') out = duelList_();
    else out = { collector: COLLECTOR_VERSION, today: today_() };
    out = { ok: true, result: out };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return json_(out);
}

// 학교 화면에서 오는 보고: {"fn":"report"|"leave","args":[payload]}
function doPost(e) {
  let out;
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const p = (body.args && body.args[0]) || {};
    if (body.fn === 'report') out = report_(p);
    else if (body.fn === 'leave') out = leave_(p);
    else if (body.fn === 'matReport') out = matReport_(p);
    else if (body.fn === 'duelCreate') out = duelCreate_(p);
    else if (body.fn === 'duelJoin') out = duelJoin_(p);
    else if (body.fn === 'duelSubmit') out = duelSubmit_(p);
    else if (body.fn === 'duelMine') out = duelMine_(p);
    else if (body.fn === 'duelCancel') out = duelCancel_(p);
    else throw new Error('알 수 없는 요청');
    out = { ok: true, result: out };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return json_(out);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/************ 공통 ************/
function today_() { return Utilities.formatDate(new Date(), TZ_, 'yyyy-MM-dd'); }
function month_(d) { return String(d).slice(0, 7); }
function prevMonth_(m) {
  let y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7)) - 1;
  if (mo === 0) { y--; mo = 12; }
  return y + '-' + (mo < 10 ? '0' : '') + mo;
}
function hex_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)
    .map(function (b) { const v = (b + 256) % 256; return (v < 16 ? '0' : '') + v.toString(16); }).join('');
}
// 학교 비밀키 → 공개 번호 (화면의 natPublicId 와 같은 계산)
function publicId_(key) { return hex_('jr-school|' + key).slice(0, 10); }
// 김하늘 → 김*늘, 이준 → 이*, 남궁민수 → 남**수 (이미 가린 이름이 와도 같은 결과)
function maskName_(n) {
  const c = Array.from(String(n || '').trim());
  if (c.length <= 1) return c.join('');
  if (c.length === 2) return c[0] + '*';
  return c[0] + new Array(c.length - 1).join('*') + c[c.length - 1];
}
function int_(v, max) { const n = Math.round(Number(v)); return (isFinite(n) && n > 0) ? Math.min(n, max) : 0; }
function cleanText_(s, max) { return String(s == null ? '' : s).replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max); }

function sheet_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(header); }
  return sh;
}
const SCHOOLS_HEADER_ = ['PublicId', 'Name', 'ShowName', 'Registered', 'FirstSeen', 'LastSeen', 'Hidden', 'SchoolName', 'Teacher', 'Contact', 'RegByGrade'];
function schoolsSheet_() {
  const sh = sheet_(SH_SCHOOLS, SCHOOLS_HEADER_);
  // 예전(7칸) 시트면 머리줄에 새 칸 이름을 붙인다
  if (sh.getLastColumn() < SCHOOLS_HEADER_.length) sh.getRange(1, 1, 1, SCHOOLS_HEADER_.length).setValues([SCHOOLS_HEADER_]);
  return sh;
}
function dailySheet_() { return sheet_(SH_DAILY, ['PublicId', 'Date', 'Total', 'Participants', 'Camera', 'Students', 'UpdatedAt']); }

/************ 보고 받기 ************/
// p = { key, name, showName, schoolName, teacher?, contact?, registered, registeredByGrade?: {학년: 수}, camPartial, days: [{ date, students: [[sk, name, grade, count, cam], ...] }] }
function report_(p) {
  const key = cleanText_(p.key, 80);
  if (key.length < 16) throw new Error('학교 키가 올바르지 않습니다.');
  const pid = publicId_(key);
  const today = today_();
  const curM = month_(today), prevM = prevMonth_(curM);
  const days = (Array.isArray(p.days) ? p.days : []).slice(0, 70).filter(function (d) {
    const ds = String(d && d.date || '');
    return /^\d{4}-\d{2}-\d{2}$/.test(ds) && ds <= today && (month_(ds) === curM || month_(ds) === prevM);
  });

  let contactSet = false;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // 학교 정보
    const ssh = schoolsSheet_();
    const sv = ssh.getDataRange().getValues();
    let srow = -1;
    for (let i = 1; i < sv.length; i++) if (String(sv[i][0]) === pid) { srow = i + 1; break; }
    const showName = !!p.showName;
    const name = showName ? cleanText_(p.name, 40) : '';
    const reg = int_(p.registered, 5000);
    // 학년별 등록 학생 수 (학년별 순위의 1인당 평균·참여율용) — 없으면 비워 둠
    let rbg = '';
    if (p.registeredByGrade && typeof p.registeredByGrade === 'object') {
      const o = {};
      Object.keys(p.registeredByGrade).slice(0, 12).forEach(function (g) { const k = cleanText_(g, 4), n = int_(p.registeredByGrade[g], 5000); if (k && n) o[k] = n; });
      if (Object.keys(o).length) rbg = JSON.stringify(o);
    }
    const schoolName = cleanText_(p.schoolName, 40);
    // 담당 교사·연락처는 관리자 화면에서 보낼 때만 들어온다 (teacher 가 있을 때만 바꿈)
    const teacher = cleanText_(p.teacher, 30);
    const contact = cleanText_(p.contact, 80);
    const now = new Date();
    if (srow === -1) {
      ssh.appendRow([pid, name, showName ? 1 : 0, reg, now, now, '', schoolName, teacher, teacher ? contact : '', rbg]);
      srow = ssh.getLastRow();
    } else {
      ssh.getRange(srow, 2, 1, 3).setValues([[name, showName ? 1 : 0, reg]]);
      ssh.getRange(srow, 6).setValue(now);
      if (schoolName) ssh.getRange(srow, 8).setValue(schoolName);
      if (teacher) ssh.getRange(srow, 9, 1, 2).setValues([[teacher, contact]]);
      if (rbg) ssh.getRange(srow, 11).setValue(rbg);
    }
    contactSet = !!(teacher || (sv[srow - 1] && String(sv[srow - 1][8] || '').trim()));

    // 날짜별 집계 (같은 학교·같은 날은 새 값으로 덮어씀)
    const dsh = dailySheet_();
    const dv = dsh.getDataRange().getValues();
    const rowOf = {};
    for (let i = 1; i < dv.length; i++) if (String(dv[i][0]) === pid) rowOf[fmtDate_(dv[i][1])] = i + 1;
    days.forEach(function (d) {
      const prevCam = {}, prevBest = {};
      if (p.camPartial && rowOf[d.date]) {   // 일부만 보내는 예전 보고: 카메라 횟수·최고 연속은 앞서 받은 값을 지킴
        try { JSON.parse(dv[rowOf[d.date] - 1][5] || '[]').forEach(function (s) { prevCam[s[0]] = s[4] || 0; prevBest[s[0]] = s[5] || 0; }); } catch (e) {}
      }
      const seen = {};
      const list = [];
      (Array.isArray(d.students) ? d.students : []).forEach(function (s) {
        if (!Array.isArray(s) || list.length >= MAX_STUDENTS_PER_DAY) return;
        const sk = cleanText_(s[0], 16);
        const c = int_(s[3], MAX_COUNT_PER_STUDENT_DAY);
        if (!sk || !c || seen[sk]) return;
        seen[sk] = 1;
        let cam = Math.min(int_(s[4], MAX_COUNT_PER_STUDENT_DAY), c);
        if (p.camPartial) cam = Math.min(Math.max(cam, prevCam[sk] || 0), c);
        const best = Math.min(Math.max(int_(s[5], MAX_COUNT_PER_STUDENT_DAY), Number(prevBest[sk]) || 0), c);
        list.push(best ? [sk, maskName_(cleanText_(s[1], 20)), cleanText_(s[2], 4), c, cam, best] : [sk, maskName_(cleanText_(s[1], 20)), cleanText_(s[2], 4), c, cam]);
      });
      const total = list.reduce(function (a, s) { return a + s[3]; }, 0);
      const cam = list.reduce(function (a, s) { return a + s[4]; }, 0);
      const row = [pid, d.date, total, list.length, cam, JSON.stringify(list), now];
      if (rowOf[d.date]) dsh.getRange(rowOf[d.date], 1, 1, 7).setValues([row]);
      else if (list.length) { dsh.appendRow(row); rowOf[d.date] = dsh.getLastRow(); }
    });
  } finally {
    lock.releaseLock();
  }
  clearCache_();
  return { publicId: pid, days: days.length, contactSet: contactSet };
}

// 참여를 끄면 그 학교 자료를 지운다
function leave_(p) {
  const key = cleanText_(p.key, 80);
  if (key.length < 16) throw new Error('학교 키가 올바르지 않습니다.');
  const pid = publicId_(key);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let removed = 0;
  try {
    [schoolsSheet_(), dailySheet_(), matSheet_()].forEach(function (sh) {
      const v = sh.getDataRange().getValues();
      for (let i = v.length - 1; i >= 1; i--) if (String(v[i][0]) === pid) { sh.deleteRow(i + 1); removed++; }
    });
  } finally {
    lock.releaseLock();
  }
  clearCache_(); bumpMat_();
  return { publicId: pid, removed: removed };
}

function fmtDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ_, 'yyyy-MM-dd');
  return String(v || '').slice(0, 10);
}

/************ 현황판 · 기록실 ************/
function clearCache_() {
  const c = CacheService.getScriptCache();
  const m = month_(today_());
  c.remove('hall|list|' + m); c.remove('hall|' + prevMonth_(m));
  const keys = ['board|' + m, 'board|' + prevMonth_(m), 'alltime'];
  GRADES_.forEach(function (g) { keys.push('board|' + m + '|' + g, 'board|' + prevMonth_(m) + '|' + g); });
  c.removeAll(keys);
}
const GRADES_ = ['1', '2', '3', '4', '5', '6'];

// 학교 이름 맞추기: 띄어쓰기·대소문자 무시, "초등학교"는 "초"로 (서울햇살초등학교 = 서울 햇살초)
// 현황판에 보이는 이름은 정식 명칭으로 통일: 띄어쓰기 빼고, 끝이 "초"·"초교"면 "초등학교", "중"이면 "중학교" (서울 햇살초 → 서울햇살초등학교)
function officialName_(n) { return String(n || '').replace(/\s+/g, '').replace(/초교?$/, '초등학교').replace(/중$/, '중학교'); }
function schoolKey_(n) { return officialName_(n).toLowerCase(); }
// 학교 정보. 학교 이름(SchoolName)이 같은 여러 시트(반마다 따로 설치)는 한 학교로 합침:
//  map[각 시트 pid].canon = 대표 pid(먼저 참여한 시트), 대표 정보의 등록 학생 수·학년별 수는 합계
function loadSchools_() {
  const v = schoolsSheet_().getDataRange().getValues();
  const map = {}, groups = {};
  for (let i = 1; i < v.length; i++) {
    const pid = String(v[i][0]);
    if (!pid) continue;
    const named = Number(v[i][2]) === 1 && String(v[i][1]).trim();
    map[pid] = {
      pid: pid, canon: pid,
      label: named ? officialName_(v[i][1]) : '익명 학교 ' + pid.slice(0, 4).toUpperCase(),
      named: !!named,
      registered: Number(v[i][3]) || 0,
      regByGrade: (function () { try { return JSON.parse(v[i][10] || '{}') || {}; } catch (e) { return {}; } })(),
      hidden: String(v[i][6]).trim() === '1',
      first: v[i][4] instanceof Date ? v[i][4].getTime() : i
    };
    const k = schoolKey_(v[i][7]);
    if (k.length >= 3) (groups[k] = groups[k] || []).push(pid);
  }
  Object.keys(groups).forEach(function (k) {
    const ids = groups[k].filter(function (p) { return !map[p].hidden; });
    if (ids.length < 2) return;
    ids.sort(function (a, b) { return map[a].first - map[b].first; });
    const c = map[ids[0]], named = ids.map(function (p) { return map[p]; }).filter(function (x) { return x.named; })[0];
    const merged = Object.assign({}, c, { registered: 0, regByGrade: {}, members: ids });
    if (named) { merged.label = named.label; merged.named = true; }
    ids.forEach(function (p) {
      const x = map[p]; merged.registered += x.registered;
      Object.keys(x.regByGrade || {}).forEach(function (g) { merged.regByGrade[g] = (merged.regByGrade[g] || 0) + (Number(x.regByGrade[g]) || 0); });
      if (p !== c.pid) map[p] = Object.assign({}, x, { canon: c.pid });
    });
    map[c.pid] = merged;
  });
  return map;
}
// 합쳐진 시트의 pid → 대표 pid (현황판·기록실이 "우리 학교"를 찾을 때)
function aliasOf_(schools) { const a = {}; Object.keys(schools).forEach(function (p) { if (schools[p].canon !== p) a[p] = schools[p].canon; }); return a; }

// 한 달치를 학교별·학생별로 묶기
// grade 가 있으면 그 학년 학생만 묶음 (학년별 순위). 1인당 평균·참여율은 학년별 등록 수를 보낸 학교만 순위
function aggregateMonth_(month, schools, dv, grade) {
  const by = {};
  for (let i = 1; i < dv.length; i++) {
    const raw = String(dv[i][0]);
    const d = fmtDate_(dv[i][1]);
    if (month_(d) !== month || !schools[raw] || schools[raw].hidden) continue;
    const pid = schools[raw].canon;   // 같은 학교 여러 반 시트는 한 학교로
    let s = by[pid];
    if (!s) s = by[pid] = { total: 0, camera: 0, days: 0, dset: {}, st: {} };
    let list = [];
    try { list = JSON.parse(dv[i][5] || '[]'); } catch (e) {}
    if (grade) list = list.filter(function (r) { return String(r[2]) === grade; });
    if (!list.length) continue;
    if (!s.dset[d]) { s.dset[d] = 1; s.days++; }
    list.forEach(function (r) {
      const c = Number(r[3]) || 0, cam = Number(r[4]) || 0, best = Number(r[5]) || 0;
      s.total += c; s.camera += cam;
      const x = s.st[r[0]] || (s.st[r[0]] = { k: r[0], n: r[1], g: r[2], c: 0, cam: 0, days: 0, best: 0, ds: {} });
      x.n = r[1]; x.g = r[2]; x.c += c; x.cam += cam; x.days++; if (c > 0) x.ds[d] = 1; if (best > x.best) x.best = best;
    });
  }
  const list = Object.keys(by).map(function (pid) {
    const s = by[pid], info = schools[pid];
    const students = Object.keys(s.st).map(function (k) { const x = s.st[k], r = run_(x.ds); x.run = r.run; x.runEnd = r.end; delete x.ds; return x; }).sort(function (a, b) { return b.c - a.c; });
    const participants = students.length;
    const gReg = grade ? (Number(info.regByGrade[grade]) || 0) : info.registered;
    const registered = Math.max(gReg, participants);
    return {
      pid: pid, label: info.label, named: info.named,
      total: s.total, camera: s.camera, days: s.days,
      participants: participants, registered: registered,
      avg: registered ? Math.round(s.total / registered) : 0,
      rate: registered ? Math.round(participants / registered * 1000) / 10 : 0,
      ratioOk: registered >= MIN_REGISTERED_FOR_RATIO && (!grade || gReg > 0),
      noReg: !!grade && !gReg,   // 학년별로 볼 때 학년별 학생 수를 안 보낸 학교 (평균·참여율 표시 안 함)
      students: students
    };
  }).filter(function (s) { return s.total > 0; });
  rank_(list, 'total', function () { return true; });
  rank_(list, 'avg', function (s) { return s.ratioOk; });
  rank_(list, 'rate', function (s) { return s.ratioOk; });
  list.sort(function (a, b) { return b.total - a.total; });
  return list;
}
function rank_(list, field, ok) {
  const arr = list.filter(ok).sort(function (a, b) { return b[field] - a[field] || b.total - a.total; });
  list.forEach(function (s) { s.rank = s.rank || {}; s.rank[field] = null; });
  arr.forEach(function (s, i) {
    s.rank[field] = (i > 0 && arr[i - 1][field] === s[field]) ? arr[i - 1].rank[field] : i + 1;
  });
}
function nationalStudents_(schools, n) {
  const all = [];
  schools.forEach(function (s) {
    s.students.forEach(function (x) { all.push({ k: x.k, n: x.n, g: x.g, c: x.c, cam: x.cam, days: x.days, pid: s.pid, school: s.label }); });
  });
  all.sort(function (a, b) { return b.c - a.c; });
  return all.slice(0, n);
}
function monthsIn_(dv) {
  const m = {};
  for (let i = 1; i < dv.length; i++) { const d = fmtDate_(dv[i][1]); if (d) m[month_(d)] = 1; }
  return Object.keys(m).sort().reverse();
}

// 그 달에 기록이 있는 학년들 (학년 고르기용)
function gradesIn_(month, dv) {
  const g = {};
  for (let i = 1; i < dv.length; i++) {
    if (month_(fmtDate_(dv[i][1])) !== month) continue;
    try { JSON.parse(dv[i][5] || '[]').forEach(function (r) { if (r[2]) g[String(r[2])] = 1; }); } catch (e) {}
  }
  return Object.keys(g).sort(function (a, b) { return (Number(a) || 99) - (Number(b) || 99) || a.localeCompare(b); });
}
// 학년도: 3월 1일에 시작 (2027-02-28 은 2026학년도)
function schoolYear_(d) { const y = Number(String(d).slice(0, 4)), m = Number(String(d).slice(5, 7)); return String(m >= 3 ? y : y - 1); }
// 지구 한 바퀴: 모든 학교가 뛴 합계 (숨긴 학교 제외). years = 학년도별 합계, year = 지금 학년도
function allTime_(dv, schools) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('alltime');
  if (hit) return JSON.parse(hit);
  let total = 0, since = '';
  const years = {};
  for (let i = 1; i < dv.length; i++) {
    const pid = String(dv[i][0]);
    if (!schools[pid] || schools[pid].hidden) continue;
    const n = Number(dv[i][2]) || 0;
    total += n;
    const d = fmtDate_(dv[i][1]);
    if (d && (!since || d < since)) since = d;
    if (d) { const sy = schoolYear_(d); years[sy] = (years[sy] || 0) + n; }
  }
  const out = { total: total, since: since, year: schoolYear_(today_()), years: years };
  cache.put('alltime', JSON.stringify(out), 600);
  return out;
}

// 한 달 안에서 하루도 빠지지 않고 이어서 뛴 가장 긴 날 수 (날짜는 그 달 안만 들어옴)
function run_(ds) {
  const days = Object.keys(ds).sort();
  let best = 0, bestEnd = '', cur = 0, prev = 0;
  days.forEach(function (d) {
    const t = Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86400000;
    cur = (prev && t - prev === 1) ? cur + 1 : 1; prev = t;
    if (cur >= best) { best = cur; bestEnd = d; }
  });
  return { run: best, end: bestEnd };
}
// 전국 '며칠 연속' 순위: 2일 이상만, 같은 날 수면 같은 등수(뛴 횟수 많은 순으로 보여 줌)
// live: 이번 달이고 어제나 오늘까지 이어지고 있으면 true
function nationalStreaks_(schools, n, live) {
  const all = [], y = live ? Utilities.formatDate(new Date(Date.now() - 86400000), TZ_, 'yyyy-MM-dd') : '';
  schools.forEach(function (s) {
    s.students.forEach(function (x) { if (x.run >= 2) all.push({ n: x.n, g: x.g, run: x.run, c: x.c, pid: s.pid, school: s.label, live: !!(live && x.runEnd >= y) }); });
  });
  all.sort(function (a, b) { return b.run - a.run || b.c - a.c; });
  const out = all.slice(0, n);
  out.forEach(function (x, i) { x.rank = (i > 0 && out[i - 1].run === x.run) ? out[i - 1].rank : i + 1; });
  return out;
}
// 전국 '한 번에 최고 연속' 순위: 스마트 줄넘기·카메라 판정기로 잰 기록(껍데기 5판)만. 같은 수면 같은 등수
function nationalBest_(schools, n) {
  const all = [];
  schools.forEach(function (s) {
    s.students.forEach(function (x) { if (x.best > 0) all.push({ n: x.n, g: x.g, best: x.best, c: x.c, pid: s.pid, school: s.label }); });
  });
  all.sort(function (a, b) { return b.best - a.best || b.c - a.c; });
  const out = all.slice(0, n);
  out.forEach(function (x, i) { x.rank = (i > 0 && out[i - 1].best === x.best) ? out[i - 1].rank : i + 1; });
  return out;
}
function getBoard_(month, grade) {
  const cur = month_(today_());
  month = /^\d{4}-\d{2}$/.test(String(month || '')) ? String(month) : cur;
  grade = cleanText_(grade, 4);
  const ck = 'board|' + month + (grade ? '|' + grade : '');
  const cache = CacheService.getScriptCache();
  const hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  const dv = dailySheet_().getDataRange().getValues();
  const info = loadSchools_();
  const schools = aggregateMonth_(month, info, dv, grade);
  const out = {
    month: month, current: cur, updated: new Date().toISOString(),
    grade: grade, grades: gradesIn_(month, dv), allTime: allTime_(dv, info),
    months: monthsIn_(dv),
    minRegistered: MIN_REGISTERED_FOR_RATIO,
    summary: {
      schools: schools.length,
      total: schools.reduce(function (a, s) { return a + s.total; }, 0),
      participants: schools.reduce(function (a, s) { return a + s.participants; }, 0),
      camera: schools.reduce(function (a, s) { return a + s.camera; }, 0)
    },
    students: nationalStudents_(schools, 50),
    streaks: nationalStreaks_(schools, 50, month === cur),
    ropeBest: nationalBest_(schools, 50),
    alias: aliasOf_(info),
    // 학교 순위는 합계·1인당 평균·참여율 중 하나라도 10등 안인 학교만 (학교가 많아져도 가볍게)
    // 우리 학교 줄과 학교 안 학생 순위는 ?api=school 로 그 학교만 따로 받아 가요
    schoolsTotal: schools.length,
    schools: schools.filter(function (s) { return [s.rank.total, s.rank.avg, s.rank.rate].some(function (r) { return r && r <= BOARD_TOP_SCHOOLS; }); })
      .map(function (s) { return schoolRow_(s); }),
    v: COLLECTOR_VERSION
  };
  const text = JSON.stringify(out);
  if (text.length < 90000) cache.put(ck, text, BOARD_CACHE_SEC);
  return out;
}

const BOARD_TOP_SCHOOLS = 10;
function schoolRow_(s) {
  const o = Object.assign({}, s);
  delete o.students; delete o.ratioOk;
  return o;
}
// 학교 하나: 그 학교 줄(순위 포함) + 학교 안 학생 전체 순위 (이름은 가린 채)
function getSchool_(pid, month, grade) {
  const cur = month_(today_());
  pid = cleanText_(pid, 16);
  month = /^\d{4}-\d{2}$/.test(String(month || '')) ? String(month) : cur;
  grade = cleanText_(grade, 4);
  if (!pid) throw new Error('학교가 없어요');
  { const info = loadSchools_(); if (info[pid]) pid = info[pid].canon; }
  const ck = 'school|' + pid + '|' + month + (grade ? '|' + grade : '');
  const cache = CacheService.getScriptCache();
  const hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  const schools = aggregateMonth_(month, loadSchools_(), dailySheet_().getDataRange().getValues(), grade);
  const s = schools.filter(function (x) { return x.pid === pid; })[0];
  // 전국 등수: 50등 밖이어도 우리 학교 학생이 전국 몇 등인지 (같은 횟수·같은 날 수면 같은 등수)
  const allC = [], allR = [], allB = [];
  schools.forEach(function (x) { x.students.forEach(function (y) { allC.push(y.c); if (y.run >= 2) allR.push(y.run); if (y.best > 0) allB.push(y.best); }); });
  const desc = function (a, b) { return b - a; };
  allC.sort(desc); allR.sort(desc); allB.sort(desc);
  const rankIn = function (arr, v) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] > v) lo = m + 1; else hi = m; } return lo + 1; };
  const out = s ? {
    month: month, grade: grade, schoolsTotal: schools.length, school: schoolRow_(s),
    studentsTotal: allC.length, runTotal: allR.length, bestTotal: allB.length,
    students: s.students.map(function (x) { return { n: x.n, g: x.g, c: x.c, cam: x.cam, days: x.days, run: x.run, best: x.best, nr: rankIn(allC, x.c), rr: x.run >= 2 ? rankIn(allR, x.run) : 0, nb: x.best > 0 ? rankIn(allB, x.best) : 0 }; })
  } : { month: month, grade: grade, schoolsTotal: schools.length, studentsTotal: allC.length, runTotal: allR.length, bestTotal: allB.length, school: null, students: [] };
  const text = JSON.stringify(out);
  if (text.length < 95000) cache.put(ck, text, BOARD_CACHE_SEC);
  return out;
}

// 지난 달들(이번 달 제외)의 1~3등
// 기록실: 고를 수 있는 달 목록(최근 HALL_MONTHS 개) + 고른 달 하나의 1~3등
// 달마다 따로 계산해서 저장해 두므로 몇 년이 쌓여도 매번 전체를 다시 계산하지 않는다.
// (Schools 시트 Hidden 을 바꾼 뒤 기록실에 바로 반영하려면 편집기에서 refreshCache 실행)
function getHall_(month) {
  const cache = CacheService.getScriptCache();
  const cur = month_(today_());
  let dv = null;
  const rows = function () { return dv || (dv = dailySheet_().getDataRange().getValues()); };
  let list = null;
  const hitL = cache.get('hall|list|' + cur);
  if (hitL) list = JSON.parse(hitL);
  else {
    list = monthsIn_(rows()).filter(function (m) { return m < cur; }).slice(0, HALL_MONTHS);
    cache.put('hall|list|' + cur, JSON.stringify(list), 3600);
  }
  const want = list.indexOf(String(month || '')) >= 0 ? String(month) : (list[0] || '');
  let detail = null;
  if (want) {
    const hit = cache.get('hall9|' + want);
    if (hit) detail = JSON.parse(hit);
    else {
      detail = hallMonth_(want, loadSchools_(), rows());
      const text = JSON.stringify(detail);
      if (text.length < 95000) cache.put('hall9|' + want, text, want === prevMonth_(cur) ? 3600 : HALL_CACHE_SEC);
    }
  }
  return { current: cur, updated: new Date().toISOString(), minRegistered: MIN_REGISTERED_FOR_RATIO, list: list, month: detail, alias: aliasOf_(loadSchools_()) };
}

function hallMonth_(m, schoolsInfo, dv) {
  const top3 = function (list, field) {
    return list.filter(function (s) { return s.rank[field] && s.rank[field] <= 3; })
      .sort(function (a, b) { return a.rank[field] - b.rank[field]; })
      .map(function (s) { return { rank: s.rank[field], label: s.label, named: s.named, pid: s.pid, total: s.total, avg: s.avg, rate: s.rate, participants: s.participants, registered: s.registered, camera: s.camera }; });
  };
  const schools = aggregateMonth_(m, schoolsInfo, dv);
  const studs = nationalStudents_(schools, 50);
  const st3 = [], st50 = [];
  let r = 0;
  studs.forEach(function (x, i) {
    r = (i > 0 && studs[i - 1].c === x.c) ? r : i + 1;
    if (r <= 3) st3.push({ rank: r, k: x.k, pid: x.pid, n: x.n, g: x.g, c: x.c, cam: x.cam, school: x.school });
    st50.push({ rank: r, pid: x.pid, n: x.n, g: x.g, c: x.c, cam: x.cam, school: x.school });
  });
  // 50등까지 (기록실 팝업용)
  const top50 = function (list, field) {
    return list.filter(function (s) { return s.rank[field]; })
      .sort(function (a, b) { return a.rank[field] - b.rank[field]; }).slice(0, 50)
      .map(function (s) { return { rank: s.rank[field], label: s.label, named: s.named, pid: s.pid, total: s.total, avg: s.avg, rate: s.rate }; });
  };
  return {
    month: m,
    schoolCount: schools.length,
    total: schools.reduce(function (a, s) { return a + s.total; }, 0),
    schools: { total: top3(schools, 'total'), avg: top3(schools, 'avg'), rate: top3(schools, 'rate') },
    students: st3,
    students50: st50,
    streaks50: (function () { return nationalStreaks_(schools, 50, false).map(function (x) { delete x.live; return x; }); })(),
    best50: nationalBest_(schools, 50),   // 13판: 한 번에 최고 연속
    schools50: { total: top50(schools, 'total'), avg: top50(schools, 'avg'), rate: top50(schools, 'rate') },
    // 학교별 학생 1~3등 (학교 안 순위)
    inSchool: schools.slice(0, 30).map(function (s) {
      return { label: s.label, named: s.named, pid: s.pid, top: s.students.slice(0, 3).map(function (x) { return { k: x.k, n: x.n, g: x.g, c: x.c }; }) };
    })
  };
}

// 운영자용: 현황판·기록실 저장본을 모두 지움 (Hidden 을 바꾼 뒤 바로 반영하고 싶을 때 편집기에서 실행)
function refreshCache() {
  const c = CacheService.getScriptCache();
  const months = monthsIn_(dailySheet_().getDataRange().getValues());
  const cur = month_(today_());
  const keys = ['hall|list|' + cur, 'board|' + cur, 'alltime'];
  months.forEach(function (m) { keys.push('hall|' + m, 'hall8|' + m, 'hall9|' + m, 'board|' + m); GRADES_.forEach(function (g) { keys.push('board|' + m + '|' + g); }); });
  c.removeAll(keys);
  return keys.length;
}

/************ 색깔 매트 놀이터 (카메라 판정 기록) ************/
// 학교(Schools 시트)는 줄넘기와 함께 씀: 같은 학교 키면 같은 학교.
// 학교 쪽에서 카메라 판정 + 교사 승인된 기록만 하루 단위로 묶어 보냄. 같은 학교·같은 날은 새 값으로 덮어씀.
const SH_MAT = 'MatDaily';
const MAT_GAMES_ = ['basic', 'stroop', 'memory', 'rhythm', 'dir', 'quiz', 'assoc', 'twist', 'freeze', 'lava'];
const MAT_MAX_ROWS_PER_DAY = 3000;
const MAT_MAX_ATTEMPTS_DAY = 5000;      // 한 학생·한 게임·한 난이도 하루 시도 상한
const MAT_MAX_SEC_DAY = 2 * 3600;     // 하루 2시간까지만 인정
const MAT_BANDS_ = { '1-2': ['1', '2'], '3-4': ['3', '4'], '5-6': ['5', '6'] };
const MAT_TOP_ = 50;   // 매트 학생 순위 50등까지 (현황판은 10등, 나머지는 팝업)

function matSheet_() { return sheet_(SH_MAT, ['PublicId', 'Date', 'Rows', 'UpdatedAt']); }
function matVer_() { return CacheService.getScriptCache().get('matver') || '0'; }
function bumpMat_() { CacheService.getScriptCache().put('matver', String(Date.now()), 21600); }
function bandOf_(g) { g = String(g); for (const b in MAT_BANDS_) if (MAT_BANDS_[b].indexOf(g) >= 0) return b; return ''; }

// p = { key, name, showName, schoolName, days: [{ date, rows: [[sk, name, grade, game, diff, correct, attempts, playSec, doneRuns, doneCorrect, doneAttempts], ...] }] }
function matReport_(p) {
  const key = cleanText_(p.key, 80);
  if (key.length < 16) throw new Error('학교 키가 올바르지 않습니다.');
  const pid = publicId_(key);
  const today = today_();
  const curM = month_(today), prevM = prevMonth_(curM);
  const days = (Array.isArray(p.days) ? p.days : []).slice(0, 70).filter(function (d) {
    const ds = String(d && d.date || '');
    return /^\d{4}-\d{2}-\d{2}$/.test(ds) && ds <= today && (month_(ds) === curM || month_(ds) === prevM);
  });
  let saved = 0;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // 학교 정보: 없으면 만들고, 있으면 마지막 보고 시각·공개 이름만 고침 (줄넘기 쪽 칸은 건드리지 않음)
    const ssh = schoolsSheet_();
    const sv = ssh.getDataRange().getValues();
    let srow = -1;
    for (let i = 1; i < sv.length; i++) if (String(sv[i][0]) === pid) { srow = i + 1; break; }
    const showName = !!p.showName;
    const name = showName ? cleanText_(p.name, 40) : '';
    const schoolName = cleanText_(p.schoolName, 40);
    const now = new Date();
    if (srow === -1) ssh.appendRow([pid, name, showName ? 1 : 0, 0, now, now, '', schoolName, '', '', '']);
    else {
      ssh.getRange(srow, 2, 1, 2).setValues([[name, showName ? 1 : 0]]);
      ssh.getRange(srow, 6).setValue(now);
      if (schoolName) ssh.getRange(srow, 8).setValue(schoolName);
    }

    const msh = matSheet_();
    const mv = msh.getDataRange().getValues();
    const rowOf = {};
    for (let i = 1; i < mv.length; i++) if (String(mv[i][0]) === pid) rowOf[fmtDate_(mv[i][1])] = i + 1;
    days.forEach(function (d) {
      const seen = {};
      const list = [];
      (Array.isArray(d.rows) ? d.rows : []).forEach(function (r) {
        if (!Array.isArray(r) || list.length >= MAT_MAX_ROWS_PER_DAY) return;
        const sk = cleanText_(r[0], 16);
        const game = cleanText_(r[3], 12);
        const diff = cleanText_(r[4], 12);
        if (!sk || MAT_GAMES_.indexOf(game) < 0 || !diff) return;
        const id = sk + '|' + game + '|' + diff;
        if (seen[id]) return;
        const attempts = int_(r[6], MAT_MAX_ATTEMPTS_DAY);
        const correct = Math.min(int_(r[5], MAT_MAX_ATTEMPTS_DAY), attempts);
        const sec = int_(r[7], MAT_MAX_SEC_DAY);
        if (!attempts && !sec) return;
        const doneRuns = int_(r[8], 200);
        const doneAttempts = doneRuns ? Math.min(int_(r[10], MAT_MAX_ATTEMPTS_DAY), attempts) : 0;
        const doneCorrect = doneRuns ? Math.min(int_(r[9], MAT_MAX_ATTEMPTS_DAY), doneAttempts, correct) : 0;
        seen[id] = 1;
        list.push([sk, maskName_(cleanText_(r[1], 20)), cleanText_(r[2], 4), game, diff, correct, attempts, sec, doneAttempts ? doneRuns : 0, doneCorrect, doneAttempts]);
      });
      const row = [pid, d.date, JSON.stringify(list), now];
      if (rowOf[d.date]) msh.getRange(rowOf[d.date], 1, 1, 4).setValues([row]);
      else if (list.length) { msh.appendRow(row); rowOf[d.date] = msh.getLastRow(); }
      saved += list.length;
    });
  } finally {
    lock.releaseLock();
  }
  clearCache_(); bumpMat_();
  return { publicId: pid, days: days.length, rows: saved };
}

// ?api=matBoard&month=YYYY-MM&game=stroop&diff=normal&band=3-4
// 학생 순위 셋(누적 정답 착지 · 누적 플레이 시간 · 정확도[완주한 판만]) + 학교 순위(정답 착지 합)
// 매트 기록 모으기 (현황판·학교 하나가 함께 씀): 고른 달·게임·난이도·학년군
function matAggregate_(month, game, diff, band) {
  const schools = loadSchools_();
  const mv = matSheet_().getDataRange().getValues();
  const st = {}, sc = {}, months = {}, diffs = {}, games = {};
  const climbYears = {}; let climbSince = '';   // 다 함께 하늘까지: 모든 게임·난이도·학년의 정답 착지 합 (학년도별)
  for (let i = 1; i < mv.length; i++) {
    const pid = String(mv[i][0]);
    const d = fmtDate_(mv[i][1]);
    if (!schools[pid] || schools[pid].hidden) continue;
    if (d) months[month_(d)] = 1;
    let rows = [];
    try { rows = JSON.parse(mv[i][2] || '[]'); } catch (e) {}
    if (d) {
      const sy = schoolYear_(d);
      rows.forEach(function (r) { climbYears[sy] = (climbYears[sy] || 0) + (Number(r[5]) || 0); });
      if (rows.length && (!climbSince || d < climbSince)) climbSince = d;
    }
    if (month_(d) !== month) continue;
    rows.forEach(function (r) {
      games[r[3]] = 1;
      if (r[3] !== game) return;
      diffs[r[4]] = 1;
      if (diff && r[4] !== diff) return;
      if (band && bandOf_(r[2]) !== band) return;
      const k = pid + '|' + r[0];
      const x = st[k] || (st[k] = { k: r[0], pid: pid, school: schools[pid].label, n: r[1], g: r[2], correct: 0, attempts: 0, sec: 0, runs: 0, dc: 0, da: 0 });
      x.n = r[1]; x.g = r[2];
      x.correct += Number(r[5]) || 0; x.attempts += Number(r[6]) || 0; x.sec += Number(r[7]) || 0;
      x.runs += Number(r[8]) || 0; x.dc += Number(r[9]) || 0; x.da += Number(r[10]) || 0;
      const s = sc[pid] || (sc[pid] = { pid: pid, label: schools[pid].label, named: schools[pid].named, correct: 0, sec: 0, students: {} });
      s.correct += Number(r[5]) || 0; s.sec += Number(r[7]) || 0; s.students[r[0]] = 1;
    });
  }
  const all = Object.keys(st).map(function (k) { const x = st[k]; x.acc = x.da ? Math.round(x.dc / x.da * 1000) / 10 : null; return x; });
  const schoolList = Object.keys(sc).map(function (p) { const s = sc[p]; return { pid: s.pid, label: s.label, named: s.named, correct: s.correct, sec: s.sec, participants: Object.keys(s.students).length }; })
    .sort(function (a, b) { return b.correct - a.correct || b.sec - a.sec; });
  let r = 0;
  schoolList.forEach(function (s, i) { r = (i > 0 && schoolList[i - 1].correct === s.correct) ? r : i + 1; s.rank = r; });
  return { all: all, schoolList: schoolList, months: months, diffs: diffs, games: games, climbYears: climbYears, climbSince: climbSince };
}
const matPub_ = function (x) { return { n: x.n, g: x.g, pid: x.pid, school: x.school, correct: x.correct, attempts: x.attempts, sec: x.sec, runs: x.runs, acc: x.acc }; };
function matRanked_(arr, val, top) {
  let r = 0;
  return arr.slice(0, top).map(function (x, i) { r = (i > 0 && val(arr[i - 1]) === val(x)) ? r : i + 1; const o = matPub_(x); o.rank = r; return o; });
}
const MAT_TOP_SCHOOLS_ = 10;

function getMatBoard_(month, game, diff, band) {
  const cur = month_(today_());
  month = /^\d{4}-\d{2}$/.test(String(month || '')) ? String(month) : cur;
  game = MAT_GAMES_.indexOf(String(game)) >= 0 ? String(game) : 'stroop';
  diff = cleanText_(diff, 12);
  band = MAT_BANDS_[band] ? String(band) : '';
  const cache = CacheService.getScriptCache();
  const ck = 'mat|' + matVer_() + '|' + month + '|' + game + '|' + diff + '|' + band;
  const hit = cache.get(ck);
  if (hit) return JSON.parse(hit);

  const A = matAggregate_(month, game, diff, band), all = A.all;
  const byCorrect = all.filter(function (x) { return x.correct > 0; }).sort(function (a, b) { return b.correct - a.correct || b.sec - a.sec; });
  const byTime = all.filter(function (x) { return x.sec > 0; }).sort(function (a, b) { return b.sec - a.sec || b.correct - a.correct; });
  const byAcc = all.filter(function (x) { return x.runs > 0 && x.da > 0; }).sort(function (a, b) { return b.acc - a.acc || b.dc - a.dc; });

  const out = {
    month: month, current: cur, updated: new Date().toISOString(),
    game: game, diff: diff, band: band,
    months: Object.keys(A.months).sort().reverse(),
    games: Object.keys(A.games), diffs: Object.keys(A.diffs),
    climb: { year: schoolYear_(today_()), years: A.climbYears, since: A.climbSince, unitM: 1 },
    summary: { schools: A.schoolList.length, students: all.length, correct: all.reduce(function (a, x) { return a + x.correct; }, 0), sec: all.reduce(function (a, x) { return a + x.sec; }, 0) },
    correct: matRanked_(byCorrect, function (x) { return x.correct; }, MAT_TOP_),
    time: matRanked_(byTime, function (x) { return x.sec; }, MAT_TOP_),
    accuracy: matRanked_(byAcc, function (x) { return x.acc; }, MAT_TOP_),
    // 학교 순위는 10등까지만 (우리 학교 줄과 학교 안 순위는 ?api=matSchool 로 그 학교만)
    schoolsTotal: A.schoolList.length,
    schools: A.schoolList.slice(0, MAT_TOP_SCHOOLS_),
    v: COLLECTOR_VERSION
  };
  const text = JSON.stringify(out);
  if (text.length < 90000) cache.put(ck, text, BOARD_CACHE_SEC);
  return out;
}

// ?api=matSchool&pid=…&month=…&game=…&diff=…&band=… : 학교 하나의 줄(순위 포함) + 학교 안 학생 전체 순위(정답 착지 순, 이름은 가린 채)
function getMatSchool_(pid, month, game, diff, band) {
  const cur = month_(today_());
  pid = cleanText_(pid, 16);
  month = /^\d{4}-\d{2}$/.test(String(month || '')) ? String(month) : cur;
  game = MAT_GAMES_.indexOf(String(game)) >= 0 ? String(game) : 'stroop';
  diff = cleanText_(diff, 12);
  band = MAT_BANDS_[band] ? String(band) : '';
  if (!pid) throw new Error('학교가 없어요');
  const cache = CacheService.getScriptCache();
  const ck = 'matsc|' + matVer_() + '|' + pid + '|' + month + '|' + game + '|' + diff + '|' + band;
  const hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  const A = matAggregate_(month, game, diff, band);
  const school = A.schoolList.filter(function (s) { return s.pid === pid; })[0] || null;
  const mine = A.all.filter(function (x) { return x.pid === pid && (x.correct > 0 || x.sec > 0); })
    .sort(function (a, b) { return b.correct - a.correct || b.sec - a.sec; });
  // 전국 등수: 현황판 세 순위(정답 착지·플레이 시간·정확도)와 같은 기준, 같은 값이면 같은 등수 (해당 없으면 0)
  const desc = function (a, b) { return b - a; };
  const vC = [], vT = [], vA = [];
  A.all.forEach(function (x) { if (x.correct > 0) vC.push(x.correct); if (x.sec > 0) vT.push(x.sec); if (x.runs > 0 && x.da > 0) vA.push(x.acc); });
  vC.sort(desc); vT.sort(desc); vA.sort(desc);
  const rankIn = function (arr, v) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] > v) lo = m + 1; else hi = m; } return lo + 1; };
  const out = { month: month, game: game, diff: diff, band: band, schoolsTotal: A.schoolList.length, school: school,
    correctTotal: vC.length, timeTotal: vT.length, accTotal: vA.length,
    students: matRanked_(mine, function (x) { return x.correct; }, 500).map(function (o, i) {
      const x = mine[i];
      o.nrC = x.correct > 0 ? rankIn(vC, x.correct) : 0;
      o.nrT = x.sec > 0 ? rankIn(vT, x.sec) : 0;
      o.nrA = (x.runs > 0 && x.da > 0) ? rankIn(vA, x.acc) : 0;
      delete o.pid; delete o.school; return o;
    }) };
  const text = JSON.stringify(out);
  if (text.length < 95000) cache.put(ck, text, BOARD_CACHE_SEC);
  return out;
}


/************ 학교 대결 (도전장) — 15판 ************
 * 한 학교가 종목을 정해 도전장(대결 코드 6자리)을 만들고, 상대 학교 선생님이 코드를 넣어 받아들임.
 * 종목  run : 점프 Live 에서 dur 초(60·120·180) 한 판 — 선생님 화면이 그 판 결과(합계·뛴 학생 수)를 보냄
 *       day : 기한 안의 하루를 골라 그날 카메라로 인증된 횟수 — 수집기에 이미 모인 하루 집계(Daily)로 계산
 * 겨루는 값: run = 합계 ÷ 뛴 학생 수, day = 카메라 횟수 ÷ 등록 학생 수 (인원이 달라도 공정하게)
 * 반마다 따로 설치해 합친 학교는 대표 학교(canon)로 묶음 */
const SH_DUELS = 'Duels';
const DUEL_HEADER_ = ['Code', 'Created', 'Kind', 'Dur', 'Deadline', 'HostPid', 'GuestPid', 'HostRes', 'GuestRes', 'HostAt', 'GuestAt'];
const DUEL_CH_ = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function duelsSheet_() { return sheet_(SH_DUELS, DUEL_HEADER_); }
function duelSide_(key, schools) {
  const k = cleanText_(key, 80);
  if (k.length < 16) throw new Error('학교 키가 올바르지 않습니다. 전국 현황판 참여를 먼저 켜 주세요.');
  const pid = publicId_(k), s = schools[pid];
  if (!s) throw new Error('아직 전국 현황판에 한 번도 보고되지 않은 학교예요. 기록을 하나 넣은 뒤 다시 해 주세요.');
  if (s.hidden) throw new Error('현황판에서 빠진 학교라 대결을 할 수 없어요.');
  return s.canon;
}
function duelRead_(sh) {
  const v = sh.getDataRange().getValues(), out = [];
  for (let i = 1; i < v.length; i++) {
    const r = v[i]; if (!r[0]) continue;
    const j = function (x) { try { return x ? JSON.parse(x) : null; } catch (e) { return null; } };
    const d = function (x) { return x instanceof Date ? Utilities.formatDate(x, TZ_, 'yyyy-MM-dd') : String(x || ''); };
    out.push({ row: i + 1, code: String(r[0]), created: d(r[1]), kind: String(r[2]), dur: Number(r[3]) || 0, deadline: d(r[4]),
      host: String(r[5]), guest: String(r[6] || ''), hostRes: j(r[7]), guestRes: j(r[8]) });
  }
  return out;
}
function duelPublic_(x, schools) {
  const side = function (pid, res) { if (!pid) return null; const s = schools[pid] || {}; return { pid: pid, label: s.label || '익명 학교', named: !!s.named, res: res || null }; };
  const today = today_(), h = side(x.host, x.hostRes), g = side(x.guest, x.guestRes);
  const done = !!(x.hostRes && x.guestRes), expired = !done && today > x.deadline;
  let winner = '';
  if (done) { const a = Number(x.hostRes.avg) || 0, b = Number(x.guestRes.avg) || 0; winner = a > b ? 'host' : b > a ? 'guest' : 'tie'; }
  return { code: x.code, kind: x.kind, dur: x.dur, created: x.created, deadline: x.deadline, host: h, guest: g,
    status: done ? 'done' : expired ? 'expired' : !x.guest ? 'waiting' : 'playing', winner: winner };
}
function duelCreate_(p) {
  const schools = loadSchools_(), me = duelSide_(p.key, schools);
  const kind = p.kind === 'day' ? 'day' : 'run';
  const dur = kind === 'run' ? ([60, 120, 180].indexOf(Number(p.dur)) >= 0 ? Number(p.dur) : 60) : 0;
  const days = Math.max(1, Math.min(14, Math.round(Number(p.days) || 7)));
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = duelsSheet_(), all = duelRead_(sh), today = today_();
    const open = all.filter(function (x) { return x.host === me && !x.guest && x.deadline >= today; }).length;
    if (open >= 5) throw new Error('아직 상대가 받지 않은 도전장이 5개 있어요. 먼저 받거나 취소한 뒤 만들어 주세요.');
    const used = {}; all.forEach(function (x) { used[x.code] = 1; });
    let code = '';
    for (let t = 0; t < 50 && (!code || used[code]); t++) { code = ''; for (let i = 0; i < 6; i++) code += DUEL_CH_.charAt(Math.floor(Math.random() * DUEL_CH_.length)); }
    const dl = Utilities.formatDate(new Date(Date.now() + days * 86400000), TZ_, 'yyyy-MM-dd');
    sh.appendRow([code, today, kind, dur, dl, me, '', '', '', '', '']);
    sh.getRange(sh.getLastRow(), 2, 1, 1).setNumberFormat('@'); sh.getRange(sh.getLastRow(), 5, 1, 1).setNumberFormat('@');
    sh.getRange(sh.getLastRow(), 2).setValue(today); sh.getRange(sh.getLastRow(), 5).setValue(dl);
    return duelPublic_({ code: code, created: today, kind: kind, dur: dur, deadline: dl, host: me, guest: '', hostRes: null, guestRes: null }, schools);
  } finally { lock.releaseLock(); }
}
function duelFind_(all, code) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const x = all.filter(function (d) { return d.code === c; })[0];
  if (!x) throw new Error('그런 대결 코드가 없어요. 코드를 다시 확인해 주세요.');
  return x;
}
function duelView_(code) { const schools = loadSchools_(); return duelPublic_(duelFind_(duelRead_(duelsSheet_()), code), schools); }
function duelJoin_(p) {
  const schools = loadSchools_(), me = duelSide_(p.key, schools);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = duelsSheet_(), x = duelFind_(duelRead_(sh), p.code);
    if (x.host === me) throw new Error('우리 학교가 만든 도전장이에요. 상대 학교 선생님께 코드를 보내 주세요.');
    if (x.guest && x.guest !== me) throw new Error('이미 다른 학교가 받은 도전장이에요.');
    if (today_() > x.deadline) throw new Error('기한이 지난 도전장이에요.');
    if (!x.guest) { sh.getRange(x.row, 7).setValue(me); x.guest = me; }
    return duelPublic_(x, schools);
  } finally { lock.releaseLock(); }
}
function duelCancel_(p) {
  const schools = loadSchools_(), me = duelSide_(p.key, schools);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = duelsSheet_(), x = duelFind_(duelRead_(sh), p.code);
    if (x.host !== me) throw new Error('도전장을 만든 학교만 취소할 수 있어요.');
    if (x.guest) throw new Error('상대 학교가 이미 받은 도전장은 취소할 수 없어요.');
    sh.deleteRow(x.row); return { ok: true };
  } finally { lock.releaseLock(); }
}
function duelMine_(p) {
  const schools = loadSchools_(), me = duelSide_(p.key, schools);
  const all = duelRead_(duelsSheet_()).filter(function (x) { return x.host === me || x.guest === me; });
  all.sort(function (a, b) { return a.created < b.created ? 1 : a.created > b.created ? -1 : 0; });
  return { me: me, list: all.slice(0, 30).map(function (x) { const o = duelPublic_(x, schools); o.side = x.host === me ? 'host' : 'guest'; return o; }) };
}
function duelSubmit_(p) {
  const schools = loadSchools_(), me = duelSide_(p.key, schools);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = duelsSheet_(), x = duelFind_(duelRead_(sh), p.code), today = today_();
    const side = x.host === me ? 'host' : x.guest === me ? 'guest' : '';
    if (!side) throw new Error('우리 학교가 참여한 대결이 아니에요.');
    if (!x.guest) throw new Error('상대 학교가 아직 도전장을 받지 않았어요.');
    if (today > x.deadline) throw new Error('기한이 지난 대결이에요.');
    if (x[side + 'Res']) throw new Error('이 대결 결과는 이미 보냈어요.');
    const r = p.res || {};
    let res;
    if (x.kind === 'run') {
      const players = Math.round(Number(r.players)), total = Math.round(Number(r.total));
      if (!(players >= 1 && players <= 60)) throw new Error('뛴 학생 수가 올바르지 않아요.');
      if (Math.round(Number(r.dur)) !== x.dur) throw new Error('대결 종목은 ' + (x.dur / 60) + '분 한 판이에요. 같은 시간으로 뛴 판만 보낼 수 있어요.');
      if (!(total >= 0 && total <= players * x.dur * 4)) throw new Error('합계가 너무 커요.');
      res = { total: total, players: players, avg: Math.round(total / players * 10) / 10, at: today, mode: cleanText_(r.mode, 20) };
    } else {
      const date = String(r.date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < x.created || date > today || date > x.deadline) throw new Error('도전장 기간 안의 날짜(오늘까지)를 골라 주세요.');
      const members = Object.keys(schools).filter(function (k) { return schools[k].canon === me; });
      const v = dailySheet_().getDataRange().getValues();
      let cam = 0, parts = 0;
      for (let i = 1; i < v.length; i++) {
        const ds = v[i][1] instanceof Date ? Utilities.formatDate(v[i][1], TZ_, 'yyyy-MM-dd') : String(v[i][1]);
        if (ds === date && members.indexOf(String(v[i][0])) >= 0) { cam += Number(v[i][4]) || 0; parts += Number(v[i][3]) || 0; }
      }
      if (!cam) throw new Error(date + ' 에 카메라로 인증된 기록이 아직 현황판에 없어요. 기록을 넣은 뒤 잠시 기다렸다가 다시 보내 주세요.');
      const reg = (schools[me] && schools[me].registered) || parts;
      res = { date: date, total: cam, players: parts, registered: reg, avg: Math.round(cam / Math.max(1, reg) * 10) / 10, at: today };
    }
    sh.getRange(x.row, side === 'host' ? 8 : 9).setValue(JSON.stringify(res));
    sh.getRange(x.row, side === 'host' ? 10 : 11).setValue(new Date());
    x[side + 'Res'] = res;
    return duelPublic_(x, schools);
  } finally { lock.releaseLock(); }
}
// 현황판: 최근 대결 (상대가 받은 것만, 20개)
function duelList_() {
  const cache = CacheService.getScriptCache(), hit = cache.get('duels');
  if (hit) return JSON.parse(hit);
  const schools = loadSchools_();
  const all = duelRead_(duelsSheet_()).filter(function (x) { return x.guest && !(schools[x.host] || {}).hidden && !(schools[x.guest] || {}).hidden; });
  all.sort(function (a, b) { return a.created < b.created ? 1 : a.created > b.created ? -1 : 0; });
  const out = { list: all.slice(0, 20).map(function (x) { return duelPublic_(x, schools); }) };
  cache.put('duels', JSON.stringify(out), 60);
  return out;
}
