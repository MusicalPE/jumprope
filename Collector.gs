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
 *              Students = [[학생키, 가린이름, 학년, 횟수, 카메라횟수], ...]
 *  - MatDaily: PublicId, Date, Rows(JSON), UpdatedAt   ← 색깔 매트 놀이터(카메라 판정·교사 승인 기록만)
 *              Rows = [[학생키, 가린이름, 학년, 게임, 난이도, 정답착지, 시도, 플레이초, 완주판수, 완주정답, 완주시도], ...]
 *************************************************************/

const COLLECTOR_VERSION = 8;   // 8: 전국 순위 50등까지(현황판 학생 50명, 기록실 students50·schools50)  7: 매트 '다 함께 하늘까지'(정답 착지 1번 = 1m, 학년도별 누적 climb)  6: 색깔 매트 놀이터 기록(matReport, ?api=matBoard)   4: 학년별 순위(?grade=), 지구 한 바퀴(allTime), 기록실 학생 키(상장용)  5: 지구 한 바퀴 학년도별(3월 1일 시작)
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
    else if (q.api === 'hall') out = getHall_(q.month);
    else if (q.api === 'matBoard') out = getMatBoard_(q.month, q.game, q.diff, q.band);
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
      const prevCam = {};
      if (p.camPartial && rowOf[d.date]) {
        try { JSON.parse(dv[rowOf[d.date] - 1][5] || '[]').forEach(function (s) { prevCam[s[0]] = s[4] || 0; }); } catch (e) {}
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
        list.push([sk, maskName_(cleanText_(s[1], 20)), cleanText_(s[2], 4), c, cam]);
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

function loadSchools_() {
  const v = schoolsSheet_().getDataRange().getValues();
  const map = {};
  for (let i = 1; i < v.length; i++) {
    const pid = String(v[i][0]);
    if (!pid) continue;
    const named = Number(v[i][2]) === 1 && String(v[i][1]).trim();
    map[pid] = {
      pid: pid,
      label: named ? String(v[i][1]).trim() : '익명 학교 ' + pid.slice(0, 4).toUpperCase(),
      named: !!named,
      registered: Number(v[i][3]) || 0,
      regByGrade: (function () { try { return JSON.parse(v[i][10] || '{}') || {}; } catch (e) { return {}; } })(),
      hidden: String(v[i][6]).trim() === '1'
    };
  }
  return map;
}

// 한 달치를 학교별·학생별로 묶기
// grade 가 있으면 그 학년 학생만 묶음 (학년별 순위). 1인당 평균·참여율은 학년별 등록 수를 보낸 학교만 순위
function aggregateMonth_(month, schools, dv, grade) {
  const by = {};
  for (let i = 1; i < dv.length; i++) {
    const pid = String(dv[i][0]);
    const d = fmtDate_(dv[i][1]);
    if (month_(d) !== month || !schools[pid] || schools[pid].hidden) continue;
    let s = by[pid];
    if (!s) s = by[pid] = { total: 0, camera: 0, days: 0, st: {} };
    let list = [];
    try { list = JSON.parse(dv[i][5] || '[]'); } catch (e) {}
    if (grade) list = list.filter(function (r) { return String(r[2]) === grade; });
    if (!list.length) continue;
    s.days++;
    list.forEach(function (r) {
      const c = Number(r[3]) || 0, cam = Number(r[4]) || 0;
      s.total += c; s.camera += cam;
      const x = s.st[r[0]] || (s.st[r[0]] = { k: r[0], n: r[1], g: r[2], c: 0, cam: 0, days: 0 });
      x.n = r[1]; x.g = r[2]; x.c += c; x.cam += cam; x.days++;
    });
  }
  const list = Object.keys(by).map(function (pid) {
    const s = by[pid], info = schools[pid];
    const students = Object.keys(s.st).map(function (k) { return s.st[k]; }).sort(function (a, b) { return b.c - a.c; });
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
    schools: schools.map(function (s) {
      const o = Object.assign({}, s);
      o.students = s.students.slice(0, 30).map(function (x) { return { n: x.n, g: x.g, c: x.c, cam: x.cam, days: x.days }; });
      delete o.ratioOk;
      return o;
    })
  };
  const text = JSON.stringify(out);
  if (text.length < 90000) cache.put(ck, text, BOARD_CACHE_SEC);
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
    const hit = cache.get('hall8|' + want);
    if (hit) detail = JSON.parse(hit);
    else {
      detail = hallMonth_(want, loadSchools_(), rows());
      const text = JSON.stringify(detail);
      if (text.length < 95000) cache.put('hall8|' + want, text, want === prevMonth_(cur) ? 3600 : HALL_CACHE_SEC);
    }
  }
  return { current: cur, updated: new Date().toISOString(), minRegistered: MIN_REGISTERED_FOR_RATIO, list: list, month: detail };
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
  months.forEach(function (m) { keys.push('hall|' + m, 'hall8|' + m, 'board|' + m); GRADES_.forEach(function (g) { keys.push('board|' + m + '|' + g); }); });
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
const MAT_TOP_ = 30;

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
  const pub = function (x) { return { n: x.n, g: x.g, school: x.school, correct: x.correct, attempts: x.attempts, sec: x.sec, runs: x.runs, acc: x.acc }; };
  const ranked = function (arr, val) {
    let r = 0;
    return arr.slice(0, MAT_TOP_).map(function (x, i) { r = (i > 0 && val(arr[i - 1]) === val(x)) ? r : i + 1; const o = pub(x); o.rank = r; return o; });
  };
  const byCorrect = all.filter(function (x) { return x.correct > 0; }).sort(function (a, b) { return b.correct - a.correct || b.sec - a.sec; });
  const byTime = all.filter(function (x) { return x.sec > 0; }).sort(function (a, b) { return b.sec - a.sec || b.correct - a.correct; });
  const byAcc = all.filter(function (x) { return x.runs > 0 && x.da > 0; }).sort(function (a, b) { return b.acc - a.acc || b.dc - a.dc; });
  const schoolList = Object.keys(sc).map(function (p) { const s = sc[p]; return { label: s.label, named: s.named, correct: s.correct, sec: s.sec, participants: Object.keys(s.students).length }; })
    .sort(function (a, b) { return b.correct - a.correct || b.sec - a.sec; });
  let r = 0;
  schoolList.forEach(function (s, i) { r = (i > 0 && schoolList[i - 1].correct === s.correct) ? r : i + 1; s.rank = r; });

  const out = {
    month: month, current: cur, updated: new Date().toISOString(),
    game: game, diff: diff, band: band,
    months: Object.keys(months).sort().reverse(),
    games: Object.keys(games), diffs: Object.keys(diffs),
    climb: { year: schoolYear_(today_()), years: climbYears, since: climbSince, unitM: 1 },
    summary: { schools: schoolList.length, students: all.length, correct: all.reduce(function (a, x) { return a + x.correct; }, 0), sec: all.reduce(function (a, x) { return a + x.sec; }, 0) },
    correct: ranked(byCorrect, function (x) { return x.correct; }),
    time: ranked(byTime, function (x) { return x.sec; }),
    accuracy: ranked(byAcc, function (x) { return x.acc; }),
    schools: schoolList.slice(0, MAT_TOP_)
  };
  const text = JSON.stringify(out);
  if (text.length < 90000) cache.put(ck, text, BOARD_CACHE_SEC);
  return out;
}
