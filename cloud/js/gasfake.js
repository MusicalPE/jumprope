// dev/make_cloud.py 가 demo.js 에서 떼어 온 파일 — 직접 고치지 말 것 (demo.js 를 고치고 다시 만들기)
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


export { sha256Bytes, Sheet, Range };
