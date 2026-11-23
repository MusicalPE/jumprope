/* 점퍼스 학교 이름 규칙 (2026-11-23) — 점퍼스 3 · 전국 현황판(Jump Earth!) · 기록실이 함께 씀
 *  · 시·군 이름 + 학교 이름을 붙여 씀 (띄어쓰기 없음). 학교 이름이 이미 시·군 이름으로 시작하면 그대로
 *      서곡초등학교(전주) → 전주서곡초등학교 · 전주서곡초등학교 → 전주서곡초등학교 · 전주초등학교 → 전주초등학교
 *  · 도 이름은 쓰지 않음. 시·군 이름이 다른 도에도 있을 때만 도를 붙임 (강원고성… · 경남고성… · 경기광주…)
 *  · 특별시·광역시는 시 이름 (서울… · 부산…)
 *  · 분교: 봉동초등학교양화분교장(완주) → 완주봉동초양화분교
 *  · 교대 부설: 전주교육대학교전주부설초등학교 → 전주부설초등학교
 *  · 사대 부설: 전북대학교사범대학부설고등학교 → 전북사대부설고등학교 (줄이면 전북사대부고)
 *  · 좁은 화면에서는 줄여서: 무주초 · 완주중 · 전주완산고 · 전주여고 · 전주공고
 * 브라우저(window.JRSchool) · Node(require) · Apps Script(그대로 붙여 넣기) 어디서나 같은 파일 */
var JRSchool = (function () {
  var METRO = { '서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구', '인천광역시': '인천', '광주광역시': '광주', '대전광역시': '대전', '울산광역시': '울산', '세종특별자치시': '세종' };
  var DO = { '경기도': '경기', '강원특별자치도': '강원', '강원도': '강원', '충청북도': '충북', '충청남도': '충남', '전북특별자치도': '전북', '전라북도': '전북', '전라남도': '전남', '경상북도': '경북', '경상남도': '경남', '제주특별자치도': '제주' };
  var DO_SHORT = ['경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
  var SAME = { '고성': 1, '광주': 1 };   // 다른 시·도에도 있는 시·군 이름 → 도를 붙여 구별 (광역시 광주는 그냥 '광주')
  function squash(s) { return String(s == null ? '' : s).replace(/\s+/g, ''); }
  function sidoShort(sido) { var s = squash(sido); return METRO[s] || DO[s] || (DO_SHORT.indexOf(s) >= 0 || /^(서울|부산|대구|인천|광주|대전|울산|세종)$/.test(s) ? s : ''); }
  function isMetro(sido) { var s = squash(sido); return !!METRO[s] || /^(서울|부산|대구|인천|대전|울산|세종)$/.test(s); }
  function cut(r) { r = squash(r); return r.length >= 3 ? r.replace(/[시군]$/, '') : r; }   // 전주시 → 전주 · 완주군 → 완주
  // 주소("전북특별자치도 전주시 완산구 …")에서 시·도와 시·군
  function fromAddr(addr) { var t = String(addr || '').trim().split(/\s+/); return { sido: t[0] || '', region: t[1] || '' }; }
  // 학교 이름 앞에 붙일 지역 (도를 붙여야 하면 붙여서)와, 겹치는지 볼 때 쓰는 시·군 이름
  function area(sido, region) {
    var ss = sidoShort(sido);
    if (isMetro(sido) || (squash(sido) === '광주광역시')) return { base: ss, full: ss };
    var b = cut(region);
    return { base: b, full: SAME[b] && ss ? ss + b : b };
  }
  /* o = { name: 학교 이름(나이스 SCHUL_NM), sido: 시·도, region: 시·군 } 또는 { name, addr: 도로명 주소 } → 화면에 쓰는 이름 */
  function make(o) {
    var n = squash(o && o.name); if (!n) return '';
    var loc = o.addr && !(o.sido || o.region) ? fromAddr(o.addr) : { sido: o.sido || '', region: o.region || '' };
    var a = area(loc.sido, loc.region), m;
    if ((m = /^(.+?)대학교사범대학(?:부설|부속)(.*?)(초등학교|중학교|고등학교)$/.exec(n))) return m[1] + '사대부설' + m[2] + m[3];   // 대학 이름으로 구별되니 지역을 붙이지 않음
    if ((m = /^(.+?)교육대학교(.*?)(?:부설|부속)초등학교$/.exec(n))) n = (m[2] || m[1]) + '부설초등학교';
    if ((m = /^(.+?)(초등|중|고등)학교(.+?)분교장?$/.exec(n))) n = m[1] + ({ '초등': '초', '중': '중', '고등': '고' })[m[2]] + m[3] + '분교';
    if (!a.base) return n;
    if (n.indexOf(a.full) === 0) return n;
    if (n.indexOf(a.base) === 0) return a.full.slice(0, a.full.length - a.base.length) + n;   // 고성초등학교(강원) → 강원고성초등학교
    return a.full + n;
  }
  /* 좁은 화면용 줄임 */
  function short(name) {
    return squash(name)
      .replace(/사대부설초등학교$/, '사대부초').replace(/사대부설중학교$/, '사대부중').replace(/사대부설고등학교$/, '사대부고')
      .replace(/여자중학교$/, '여중').replace(/여자고등학교$/, '여고').replace(/공업고등학교$/, '공고').replace(/상업고등학교$/, '상고')
      .replace(/초등학교$/, '초').replace(/중학교$/, '중').replace(/고등학교$/, '고');
  }
  /* 예전에 적어 둔 이름을 새 규칙으로 읽기: 띄어쓰기를 떼고, 맨 앞의 도 이름을 뗌 ("전북 무주초등학교" → "무주초등학교").
     단, 도 이름으로 구별해야 하는 곳(강원고성… · 경기광주…)과 사대 부설(전북사대부설…)은 그대로 */
  function legacy(name) {
    var n = squash(name).replace(/초교?$/, '초등학교').replace(/([^여])중$/, '$1중학교');
    for (var i = 0; i < DO_SHORT.length; i++) {
      var d = DO_SHORT[i];
      if (n.indexOf(d) !== 0 || n.length <= d.length + 3) continue;
      var rest = n.slice(d.length);
      if (/^사대부/.test(rest) || /^(여자)?(초등|중|고등)학교$/.test(rest)) return n;   // 전북사대부설… · '경기초등학교'처럼 도 이름이 곧 학교 이름인 곳
      for (var k in SAME) if (rest.indexOf(k) === 0) return n;
      return rest;
    }
    return n;
  }
  return { make: make, short: short, legacy: legacy, fromAddr: fromAddr, sidoShort: sidoShort };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = JRSchool;
