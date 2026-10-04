// 아주 작은 Apps Script 흉내 — Shell.gs 를 node 에서 그대로 돌려 보기 위한 시험 도구
const vm = require('vm'), fs = require('fs'), crypto = require('crypto');
function makeSheet(name){
  const rows = []; // 2차원 배열
  const sh = {
    _rows: rows, getName: () => name,
    getLastRow: () => rows.length,
    getLastColumn: () => rows.reduce((m, r) => Math.max(m, r.length), 0),
    appendRow: (arr) => { rows.push(arr.slice()); },
    getDataRange: () => sh.getRange(1, 1, Math.max(rows.length, 1), Math.max(sh.getLastColumn(), 1)),
    insertColumnBefore: (c) => { rows.forEach(r => r.splice(c - 1, 0, '')); },
    deleteRow: (r) => { rows.splice(r - 1, 1); },
    getRange: (r, c, nr, nc) => {
      nr = nr || 1; nc = nc || 1;
      const get = (i, j) => { const row = rows[r - 1 + i]; const v = row ? row[c - 1 + j] : undefined; return v === undefined || v === null ? '' : v; };
      const set = (i, j, v) => { while (rows.length < r + i) rows.push([]); const row = rows[r - 1 + i]; while (row.length < c + j) row.push(''); row[c - 1 + j] = v; };
      return {
        getValue: () => get(0, 0), setValue: (v) => { set(0, 0, v); return this; },
        getValues: () => { if (!rows.length) return [[]]; const out = []; for (let i = 0; i < nr; i++) { const rr = []; for (let j = 0; j < nc; j++) rr.push(get(i, j)); out.push(rr); } return out; },
        setValues: (vals) => { vals.forEach((rr, i) => rr.forEach((v, j) => set(i, j, v))); }
      };
    }
  };
  return sh;
}
function createGas(opts){
  opts = opts || {};
  const sheets = {}; const props = {}; const cache = {};
  const ss = { getName: () => '6학년 1반 줄넘기', getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = makeSheet(n)) };
  const pad = n => String(n).padStart(2, '0');
  const ctx = {
    console, JSON, Math, Date, Number, String, Array, Object, Error, RegExp, encodeURIComponent, decodeURIComponent, parseInt, isNaN,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; } }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = String(v); }, remove: k => { delete cache[k]; } }) },
    Intl,
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(String(s), 'utf8').digest()).map(b => b > 127 ? b - 256 : b),
      formatDate: (d, tz, f) => { d = new Date(d); return f.replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate())).replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())); }
    },
    Session: { getScriptTimeZone: () => 'Asia/Seoul' },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ _type: 'text', content: t, setMimeType() { return this; }, getContent() { return this.content; } }) },
    HtmlService: { createHtmlOutput: h => ({ _type: 'html', content: h, setTitle() { return this; }, addMetaTag() { return this; }, getContent() { return this.content; } }) },
    ScriptApp: { getService: () => ({ getUrl: () => opts.selfUrl || 'http://localhost:8890/exec' }) },
    UrlFetchApp: { fetch: (url, o) => {
      const key = (url.match(/key=([^&]+)/) || [])[1] || '';
      const ok = decodeURIComponent(key).startsWith('AIza');
      if (/models\?/.test(url)) return { getResponseCode: () => ok ? 200 : 400, getContentText: () => JSON.stringify(ok ? { models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] } : { error: { message: 'API key not valid' } }) };
      return { getResponseCode: () => ok ? 200 : 400, getContentText: () => JSON.stringify(ok ? { candidates: [{ content: { parts: [{ text: '오늘도 한 번 더 뛰는 우리 반, 꾸준함이 최고야!' }] } }] } : { error: { message: 'API key not valid. Please pass a valid API key.' } }) };
    } },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) },
    Logger: { log: () => {} }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(opts.shellPath || __dirname + '/../Shell.gs', 'utf8'), ctx, { filename: 'Shell.gs' });
  return { ctx, sheets, props, cache, ss };
}
module.exports = { createGas };
