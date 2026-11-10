/* ──────────────────────────────────────────────────────────────
   점퍼스 미리보기 (?s=demo)
   학교 시트 없이 지어낸 학교로 둘러보게 합니다.
   학교 껍데기(Shell.gs)를 그대로 브라우저에서 돌리고, 스프레드시트 대신
   이 창 안의 가짜 표를 씁니다. 이름은 모두 지어낸 것이고,
   바꾼 내용은 이 탭을 닫으면 사라집니다 (다른 화면으로 옮겨 가도 이어짐).
   Made by 음악적체육인
   ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var SAVE_KEY = 'jr_demo_state_v1';
  var RealDate = Date;

  /* ── 시계 (지난 기록을 꾸밀 때만 앞당김) ── */
  var NOW = null;
  function FakeDate() {
    var a = Array.prototype.slice.call(arguments);
    if (!a.length) return new RealDate(NOW !== null ? NOW : RealDate.now());
    return new (Function.prototype.bind.apply(RealDate, [null].concat(a)))();
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = function () { return NOW !== null ? NOW : RealDate.now(); };
  FakeDate.UTC = RealDate.UTC; FakeDate.parse = RealDate.parse;

  /* ── SHA-256 (껍데기가 비밀번호를 거를 때 씀, 바로 답해야 해서 직접 계산) ── */
  function sha256Bytes(str) {
    var msg = unescape(encodeURIComponent(str)), K = [], H = [], i, j;
    function frac(x) { return ((x - Math.floor(x)) * 4294967296) | 0; }
    for (var n = 2, c = 0; c < 64; n++) { var p = true; for (j = 2; j * j <= n; j++) if (n % j === 0) { p = false; break; } if (p) { if (c < 8) H[c] = frac(Math.pow(n, 1 / 2)); K[c] = frac(Math.pow(n, 1 / 3)); c++; } }
    var bytes = []; for (i = 0; i < msg.length; i++) bytes.push(msg.charCodeAt(i));
    var bl = bytes.length * 8; bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
    for (i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bl >>> (i * 8)) & 255);
    var w = new Array(64);
    for (var o = 0; o < bytes.length; o += 64) {
      for (i = 0; i < 16; i++) w[i] = (bytes[o + 4 * i] << 24) | (bytes[o + 4 * i + 1] << 16) | (bytes[o + 4 * i + 2] << 8) | bytes[o + 4 * i + 3];
      for (i = 16; i < 64; i++) {
        var s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
        var s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c2 = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var t2 = (S0 + ((a & b) ^ (a & c2) ^ (b & c2))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c2; c2 = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c2) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var out = []; H.forEach(function (x) { for (var k = 3; k >= 0; k--) { var v = (x >>> (k * 8)) & 255; out.push(v > 127 ? v - 256 : v); } });
    return out;
  }

  /* ── 가짜 스프레드시트 ── */
  function Sheet(name, rows) { this.name = name; this.rows = rows || []; }
  Sheet.prototype.getName = function () { return this.name; };
  Sheet.prototype._trim = function () {
    var r = this.rows;
    while (r.length && r[r.length - 1].every(function (v) { return v === '' || v === null || v === undefined; })) r.pop();
  };
  Sheet.prototype.getLastRow = function () { this._trim(); return this.rows.length; };
  Sheet.prototype.getMaxRows = function () { return Math.max(1000, this.rows.length); };
  Sheet.prototype.getLastColumn = function () {
    var w = 0;
    this.rows.forEach(function (r) { for (var i = r.length - 1; i >= 0; i--) { if (r[i] !== '' && r[i] !== null && r[i] !== undefined) { if (i + 1 > w) w = i + 1; break; } } });
    return w;
  };
  Sheet.prototype._cell = function (r, c) { var row = this.rows[r - 1]; if (!row) return ''; var v = row[c - 1]; return v === undefined || v === null ? '' : v; };
  Sheet.prototype._put = function (r, c, v) { while (this.rows.length < r) this.rows.push([]); var row = this.rows[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; };
  Sheet.prototype.getRange = function (row, col, nr, nc) {
    if (typeof row === 'string') { var m = /^([A-Z]+)(\d+)$/.exec(row); col = m ? m[1].charCodeAt(0) - 64 : 1; row = m ? +m[2] : 1; }
    return new Range(this, row, col, nr || 1, nc || 1);
  };
  Sheet.prototype.getDataRange = function () { var r = this.getLastRow(), c = this.getLastColumn(); return new Range(this, 1, 1, Math.max(1, r), Math.max(1, c)); };
  Sheet.prototype.appendRow = function (arr) { this._trim(); this.rows.push(arr.slice()); return this; };
  Sheet.prototype.deleteRow = function (r) { this.rows.splice(r - 1, 1); return this; };
  Sheet.prototype.deleteRows = function (r, n) { this.rows.splice(r - 1, n); return this; };
  ['setFrozenRows', 'setColumnWidth', 'hideSheet', 'autoResizeColumns', 'setTabColor'].forEach(function (k) { Sheet.prototype[k] = function () { return this; }; });

  function Range(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
  Range.prototype.getValues = function () {
    var out = [];
    for (var i = 0; i < this.nr; i++) { var row = []; for (var j = 0; j < this.nc; j++) row.push(this.sh._cell(this.r + i, this.c + j)); out.push(row); }
    return out;
  };
  Range.prototype.getDisplayValues = function () { return this.getValues().map(function (r) { return r.map(String); }); };
  Range.prototype.getValue = function () { return this.sh._cell(this.r, this.c); };
  Range.prototype.setValue = function (v) { this.sh._put(this.r, this.c, v); return this; };
  Range.prototype.setValues = function (vals) { for (var i = 0; i < vals.length; i++) for (var j = 0; j < vals[i].length; j++) this.sh._put(this.r + i, this.c + j, vals[i][j]); return this; };
  Range.prototype.clearContent = function () { for (var i = 0; i < this.nr; i++) for (var j = 0; j < this.nc; j++) this.sh._put(this.r + i, this.c + j, ''); return this; };
  Range.prototype.clear = Range.prototype.clearContent;
  Range.prototype.getRow = function () { return this.r; };
  Range.prototype.getNumRows = function () { return this.nr; };
  ['setFontWeight', 'setBackground', 'setFontColor', 'setNumberFormat', 'setHorizontalAlignment'].forEach(function (k) { Range.prototype[k] = function () { return this; }; });

  var CLUB = /\/club\//.test(location.pathname), SAVE_KEY2 = CLUB ? 'jrc_demo_state_v1' : SAVE_KEY;
  var book = { title: CLUB ? '햇살 줄넘기 클럽 (예시)' : '햇살초등학교 줄넘기 기록 (예시)', sheets: {} };
  book.getName = function () { return this.title; };
  book.getId = function () { return 'demo'; };
  book.getUrl = function () { return ''; };
  book.getSheetByName = function (n) { return this.sheets[n] || null; };
  book.insertSheet = function (n) { var s = new Sheet(n); this.sheets[n] = s; return s; };
  book.getSheets = function () { var s = this.sheets; return Object.keys(s).map(function (k) { return s[k]; }); };
  book.deleteSheet = function (s) { delete this.sheets[s.name]; };

  var props = {}, cache = {};
  var Props = {
    getProperty: function (k) { return Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null; },
    setProperty: function (k, v) { props[k] = String(v); return Props; },
    setProperties: function (o) { Object.keys(o || {}).forEach(function (k) { props[k] = String(o[k]); }); return Props; },
    deleteProperty: function (k) { delete props[k]; return Props; },
    getProperties: function () { var o = {}; Object.keys(props).forEach(function (k) { o[k] = props[k]; }); return o; },
    getKeys: function () { return Object.keys(props); }
  };
  function alive(k) { var x = cache[k]; if (!x) return null; if (x.e < RealDate.now()) { delete cache[k]; return null; } return x.v; }
  var Cache = {
    get: function (k) { return alive(k); },
    put: function (k, v, ttl) { cache[k] = { v: String(v), e: RealDate.now() + (ttl || 600) * 1000 }; },
    remove: function (k) { delete cache[k]; },
    getAll: function (ks) { var o = {}; (ks || []).forEach(function (k) { var v = alive(k); if (v !== null) o[k] = v; }); return o; },
    putAll: function (o, ttl) { Object.keys(o || {}).forEach(function (k) { Cache.put(k, o[k], ttl); }); },
    removeAll: function (ks) { (ks || []).forEach(function (k) { delete cache[k]; }); }
  };
  var lock = { waitLock: function () {}, tryLock: function () { return true; }, releaseLock: function () {}, hasLock: function () { return true; } };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var G = {
    SpreadsheetApp: { getActiveSpreadsheet: function () { return book; }, openById: function () { return book; } },
    PropertiesService: { getScriptProperties: function () { return Props; }, getDocumentProperties: function () { return Props; } },
    CacheService: { getScriptCache: function () { return Cache; }, getDocumentCache: function () { return Cache; } },
    LockService: { getScriptLock: function () { return lock; }, getDocumentLock: function () { return lock; } },
    Utilities: {
      getUuid: function () { try { return crypto.randomUUID(); } catch (e) { return 'u' + RealDate.now().toString(36) + Math.random().toString(36).slice(2); } },
      formatDate: function (d, tz, fmt) {
        if (!(d instanceof RealDate)) d = new RealDate(d);
        var y = d.getFullYear(), M = d.getMonth() + 1, D = d.getDate(), h = d.getHours(), mi = d.getMinutes(), s = d.getSeconds();
        return fmt.replace(/yyyy|MM|dd|HH|mm|ss|M|d|E/g, function (t) { return { yyyy: y, MM: pad(M), dd: pad(D), HH: pad(h), mm: pad(mi), ss: pad(s), M: M, d: D, E: '일월화수목금토'[d.getDay()] }[t]; });
      },
      computeDigest: function (alg, str) { return sha256Bytes(String(str)); },
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      sleep: function () {}
    },
    Session: { getScriptTimeZone: function () { return 'Asia/Seoul'; } },
    UrlFetchApp: { fetch: function () { throw new Error('미리보기에서는 바깥으로 보내지 않아요.'); } },
    ScriptApp: { getService: function () { return { getUrl: function () { return 'demo'; } }; } },
    ContentService: { createTextOutput: function (t) { return { setMimeType: function () { return t; } }; }, MimeType: { JSON: 'json' } },
    HtmlService: { createHtmlOutput: function () { return { setTitle: function () { return this; }, setXFrameOptionsMode: function () { return this; }, addMetaTag: function () { return this; } }; }, XFrameOptionsMode: {} },
    Logger: { log: function () {} },
    Date: FakeDate
  };

  /* ── 탭 안에서 이어지게 저장 (날짜는 표시를 붙여서) ── */
  function enc(v) { return v instanceof RealDate ? { __d: v.getTime() } : v; }
  function dec(v) { return v && typeof v === 'object' && '__d' in v ? new RealDate(v.__d) : v; }
  function save() {
    try {
      var sh = {}; Object.keys(book.sheets).forEach(function (k) { sh[k] = book.sheets[k].rows.map(function (r) { return r.map(enc); }); });
      sessionStorage.setItem(SAVE_KEY2, JSON.stringify({ sh: sh, props: props, cache: cache, day: new RealDate().toDateString() }));
    } catch (e) {}
  }
  function load() {
    try {
      var d = JSON.parse(sessionStorage.getItem(SAVE_KEY2) || 'null');
      if (!d || d.day !== new RealDate().toDateString()) return false;
      Object.keys(d.sh).forEach(function (k) { book.sheets[k] = new Sheet(k, d.sh[k].map(function (r) { return r.map(dec); })); });
      props = d.props || {}; cache = d.cache || {};
      return true;
    } catch (e) { return false; }
  }

  var S = null, ADMIN = null;
  function boot(src) {
    var names = [], re = /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm, m;
    while ((m = re.exec(src))) names.push(m[1]);
    var keys = Object.keys(G);
    var f = new Function(keys.join(','), src + '\n;return {' + names.map(function (n) { return JSON.stringify(n) + ':' + n; }).join(',') + ', RPC_ALLOW_: RPC_ALLOW_};');
    S = f.apply(null, keys.map(function (k) { return G[k]; }));
    if (!load()) { seed(); save(); }
  }

  /* ── 지어낸 학교 ── */
  var NAMES = ['강하늘', '김도윤', '김서아', '나은호', '문지안', '박하준', '배서윤', '서이안', '손예린', '안시우', '양지호', '오유나',
               '윤도현', '이채원', '임하율', '장민준', '정다인', '조은우', '최아린', '한지성', '홍예준', '구하린', '노을찬', '도아라'];
  function seed() {
    var r = 7; function rnd() { r = (r * 16807) % 2147483647; return (r - 1) / 2147483646; }
    var DAY = 86400000, today = new RealDate(); today.setHours(9, 0, 0, 0);
    props.APPROVAL_ON = '0'; props.CAMERA_ENABLED = '1'; props.DAILY_GOAL = '200';
    var tok = S.verifyAdminPassword('1234').token;
    var rows = NAMES.map(function (n, i) { return { grade: i < 12 ? '5' : '6', cls: '1', number: String(i < 12 ? i + 1 : i - 11), name: n, password: '1111' }; });
    S.addStudentsBulk(tok, rows);
    var studs = S.getStudentsSheet_().getDataRange().getValues().slice(1);
    var types = ['모아뛰기', '모아뛰기', '모아뛰기', '엇갈아뛰기', '이중뛰기', '십자뛰기'];
    var power = studs.map(function () { return 0.6 + rnd() * 0.9; });
    var recSh = S.getRecordsSheet_();
    for (var ago = 34; ago >= 0; ago--) {
      var d = new RealDate(today.getTime() - ago * DAY), dow = d.getDay();
      var ds = G.Utilities.formatDate(d, '', 'yyyy-MM-dd');
      studs.forEach(function (s, i) {
        var chance = dow === 0 || dow === 6 ? 0.25 : 0.72;
        if (i % 6 === 1) chance = 0.97;   // 꾸준히 뛰는 학생 몇 명 (연속 기록)
        if (ago === 0) chance = i % 6 === 1 ? 1 : 0.5;
        var times = rnd() < chance ? (rnd() < 0.35 ? 2 : 1) : 0;
        for (var t = 0; t < times; t++) {
          var hour = dow === 0 || dow === 6 ? 10 + Math.floor(rnd() * 8) : (rnd() < 0.5 ? 9 + Math.floor(rnd() * 4) : 13 + Math.floor(rnd() * 6));
          var at = new RealDate(d); at.setHours(hour, Math.floor(rnd() * 60), 0, 0);
          if (ago === 0 && at.getTime() > RealDate.now()) at = new RealDate(RealDate.now() - 600000);
          NOW = at.getTime();
          var ty = types[Math.floor(rnd() * types.length)];
          var base = ty === '이중뛰기' ? 25 : ty === '십자뛰기' ? 60 : 120;
          var cnt = Math.max(5, Math.round(base * power[i] * (0.7 + rnd() * 0.8) * (1 + (34 - ago) / 80)));
          var best = rnd() < 0.3 ? Math.round(cnt * (0.4 + rnd() * 0.5)) : 0;
          recSh.appendRow([G.Utilities.getUuid(), new RealDate(NOW), s[0], ds, cnt, 'approved', pad(at.getHours()) + ':' + pad(at.getMinutes()), ty, best > 0 ? 'rope' : '', best > 0 ? best : '', '']);
        }
      });
    }
    NOW = null;
    // 카메라 판정기로 넣은 기록처럼 보이게 몇 줄 표시
    var rec = book.sheets.Records;
    for (var k = 1; k < rec.rows.length; k++) if (rnd() < 0.18) rec.rows[k][8] = 'camera';
    // 이제부터 학생이 넣는 기록은 승인 대기, 오늘 들어온 몇 건은 승인을 기다리는 중
    props.APPROVAL_ON = '1';
    var tday = G.Utilities.formatDate(today, '', 'yyyy-MM-dd');
    [3, 8, 15, 21].forEach(function (i) {
      NOW = RealDate.now() - (5 + i) * 60000;
      S.addRecord(studs[i][0], tday, 80 + Math.round(rnd() * 120), pad(new RealDate(NOW).getHours()) + ':' + pad(new RealDate(NOW).getMinutes()), '모아뛰기', 0);
    });
    NOW = null;
    // 급수 인증
    var ch = [];
    studs.forEach(function (s, i) {
      var lv = power[i] > 1.2 ? 2 : power[i] > 0.9 ? 1 : 0;
      for (var L = 0; L <= lv; L++) for (var it = 0; it < 5; it++) {
        if (L < lv || rnd() < 0.5) ch.push({ id: s[0], level: L, item: it, pass: true, date: G.Utilities.formatDate(new RealDate(today.getTime() - (20 - L * 6) * DAY), '', 'yyyy-MM-dd') });
      }
    });
    S.saveLevelPasses(tok, ch);
    ADMIN = tok;
  }

  var ready = null;
  window.JRDEMO = {
    call: function (fn, args, base) {
      if (!ready) ready = fetch((base || '') + 'Shell.gs', { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('미리보기 파일을 받지 못했어요.'); return r.text(); })
        .then(boot);
      return ready.then(function () {
        return new Promise(function (ok, fail) {
          setTimeout(function () {
            try {
              if (S.RPC_ALLOW_.indexOf(fn) < 0) throw new Error('알 수 없는 요청: ' + fn);
              args = args || [];
              // 미리보기에서는 아무 비밀번호나 받음
              if (fn === 'verifyAdminPassword') args = ['1234'];
              if (fn === 'getStudentDetailAuthed') args = [args[0], '1111'];
              if (fn === 'changeAdminPassword') throw new Error('미리보기에서는 비밀번호를 바꾸지 않아요.');
              if (fn === 'natReportToday') return ok({ ok: false, message: '미리보기에서는 전국 현황판에 보내지 않아요.' });
              var out = S[fn].apply(null, args);
              save();
              ok(out === undefined ? null : JSON.parse(JSON.stringify(out, function (k, v) { return v; })));
            } catch (e) { fail(e); }
          }, 80);
        });
      });
    },
    adminToken: function () {
      return (ready || this.call('ping')).then(function () { var t = ADMIN || S.verifyAdminPassword('1234').token; save(); return t; });
    }
  };
})();
