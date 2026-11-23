/************ 점퍼스 학교 찾기 (1판) ************
 * 나이스 교육정보 개방 포털(open.neis.go.kr)의 '학교기본정보'를 대신 물어봐 주는 작은 웹앱.
 * 선생님이 학교 이름을 몇 글자 적으면 전국의 초·중·고에서 찾아 주고, 학교마다 하나뿐인 학교 번호(code)를 함께 돌려줌.
 * 학교 기록은 다루지 않음 (학교 이름·주소처럼 누구나 볼 수 있는 정보만).
 *
 * 설치
 *  1. script.google.com 에서 새 프로젝트 → 이 내용을 모두 붙여 넣고 저장
 *  2. 왼쪽 톱니바퀴(프로젝트 설정) → 스크립트 속성 → 속성 추가:  NEIS_KEY = (나이스에서 받은 인증키)
 *  3. 배포 → 새 배포 → 유형: 웹 앱 · 실행: 나 · 액세스 권한: 모든 사용자 → 배포
 *  4. 나온 웹 앱 주소(…/exec)를 점퍼스에 알려 줌
 *
 * 부르는 법
 *  …/exec?q=서곡            학교 이름에 '서곡'이 들어간 초·중·고
 *  …/exec?sido=전북          전북의 초·중·고 전부 (운영자가 학교 목록을 만들 때)
 *  …/exec?q=서곡&raw=1       나이스가 돌려준 내용을 그대로 (점검용)
 *  …/exec?ping=1             잘 켜져 있는지 */
const SS_VERSION = 1;
const NEIS_URL = 'https://open.neis.go.kr/hub/schoolInfo';
const SIDO_CODE = { '서울': 'B10', '부산': 'C10', '대구': 'D10', '인천': 'E10', '광주': 'F10', '대전': 'G10', '울산': 'H10', '세종': 'I10', '경기': 'J10', '강원': 'K10', '충북': 'M10', '충남': 'N10', '전북': 'P10', '전남': 'Q10', '경북': 'R10', '경남': 'S10', '제주': 'T10' };
const KINDS = ['초등학교', '중학교', '고등학교'];

function doGet(e) {
  const p = (e && e.parameter) || {};
  let out;
  try {
    if (p.ping) out = { ok: true, version: SS_VERSION, key: !!key_() };
    else if (p.raw) out = { ok: true, raw: neis_(p.q ? { SCHUL_NM: String(p.q).slice(0, 30) } : { ATPT_OFCDC_SC_CODE: SIDO_CODE[p.sido] || 'P10' }, 1, 5) };
    else if (p.sido) out = { ok: true, list: bySido_(String(p.sido)) };
    else out = { ok: true, list: byName_(String(p.q || '')) };
  } catch (err) { out = { ok: false, error: String((err && err.message) || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function key_() { return PropertiesService.getScriptProperties().getProperty('NEIS_KEY') || ''; }

// 나이스에 한 번 물어봄 → 나이스가 돌려준 내용 그대로
function neis_(params, page, size) {
  const q = Object.assign({ Type: 'json', pIndex: page || 1, pSize: size || 100 }, params);
  const k = key_(); if (k) q.KEY = k;   // 열쇠가 없으면 나이스가 맛보기로 5건만 줌
  const url = NEIS_URL + '?' + Object.keys(q).map(function (x) { return x + '=' + encodeURIComponent(q[x]); }).join('&');
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('나이스 응답 오류 (' + r.getResponseCode() + ')');
  return JSON.parse(r.getContentText());
}
// 나이스 답에서 학교 줄만 꺼냄. { rows, total }
function rows_(j) {
  if (j && j.RESULT) {   // 자료 없음(INFO-200)은 빈 목록, 그 밖에는 오류
    if (j.RESULT.CODE === 'INFO-200') return { rows: [], total: 0 };
    throw new Error('나이스: ' + (j.RESULT.MESSAGE || j.RESULT.CODE));
  }
  const s = j && j.schoolInfo; if (!s) return { rows: [], total: 0 };
  let total = 0, rows = [];
  s.forEach(function (x) { if (x.head) x.head.forEach(function (h) { if (h.list_total_count != null) total = Number(h.list_total_count) || 0; }); if (x.row) rows = rows.concat(x.row); });
  return { rows: rows, total: total };
}
function slim_(r) { return { code: String(r.SD_SCHUL_CODE || ''), name: String(r.SCHUL_NM || ''), kind: String(r.SCHUL_KND_SC_NM || ''), sido: String(r.LCTN_SC_NM || ''), addr: String(r.ORG_RDNMA || '') }; }
function keep_(x) { return x.code && x.name && KINDS.indexOf(x.kind) >= 0; }

// 학교 이름으로 찾기 (두 글자 이상). 같은 물음은 6시간 기억
function byName_(q) {
  q = q.replace(/\s+/g, '').slice(0, 30);
  if (q.length < 2) return [];
  const cache = CacheService.getScriptCache(), ck = 'q_' + Utilities.base64EncodeWebSafe(Utilities.newBlob(q).getBytes()).slice(0, 200);
  const hit = cache.get(ck); if (hit) return JSON.parse(hit);
  const list = rows_(neis_({ SCHUL_NM: q }, 1, 100)).rows.map(slim_).filter(keep_);
  try { cache.put(ck, JSON.stringify(list), 21600); } catch (err) {}   // 너무 크면 기억하지 않음
  return list;
}
// 한 시·도의 초·중·고 전부 (1,000건씩 넘겨 가며)
function bySido_(sido) {
  const code = SIDO_CODE[sido.replace(/\s+/g, '').slice(0, 2)];
  if (!code) throw new Error('시·도 이름을 확인해 주세요 (예: 전북)');
  let out = [], total = 1;
  for (let page = 1; page <= 10 && out.length < total; page++) {
    const got = rows_(neis_({ ATPT_OFCDC_SC_CODE: code }, page, 1000));
    total = got.total; if (!got.rows.length) break;
    out = out.concat(got.rows);
  }
  return out.map(slim_).filter(keep_);
}
