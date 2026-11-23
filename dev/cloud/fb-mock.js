// 시험용 fb.js — mockserver.js 와 이야기함. 로그인은 localStorage 'mock-user' 로 흉내
export const INC = (n) => ({ __inc: n });
export const DEL = { __del: 1 };
export const NOW = { __now: 1 };
let cbs = [];
const getU = () => { try { return JSON.parse(localStorage.getItem('mock-user')); } catch (e) { return null; } };
const setU = (u) => { if (u) localStorage.setItem('mock-user', JSON.stringify(u)); else localStorage.removeItem('mock-user'); cbs.forEach((cb) => cb(u)); };
export function init() {}
export function ready() { return Promise.resolve(); }
export const SV_TIME = { '.sv': 'timestamp' };
export async function rt(method, path, body) {
  const u = getU();
  const r = await fetch('/__rt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method, path, body, auth: u ? { uid: u.uid, anon: !!u.anon } : null }) });
  const j = await r.json(); if (!j.ok) throw Object.assign(new Error(j.message), { code: j.code }); return j.result;
}
export function onUser(cb) { cbs.push(cb); setTimeout(() => cb(getU()), 0); return () => {}; }
export function user() { return getU(); }
export async function signInGoogle() { const g = JSON.parse(localStorage.getItem('mock-google') || 'null') || { uid: 'teacher1', name: '김선생', email: 't1@example.com' }; setU(Object.assign({ anon: false }, g)); }
export async function signInAnon() { if (getU()) return; setU({ uid: 'anon-' + Math.random().toString(36).slice(2, 10), anon: true, name: '', email: '' }); }
export async function signOut() { setU(null); }
async function call(body) {
  const u = getU(); body.auth = u ? { uid: u.uid, anon: !!u.anon } : null;
  const r = await fetch('/__fb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json(); if (!j.ok) throw Object.assign(new Error(j.message), { code: j.code }); return j.result;
}
export const get = (path) => call({ op: 'get', path });
export const set = (path, data, merge) => call({ op: 'write', ops: [['set', path, data, !!merge]] });
export const update = (path, data) => call({ op: 'write', ops: [['update', path, data]] });
export const add = (path, data) => call({ op: 'add', path, data });
export const del = (path) => call({ op: 'write', ops: [['del', path]] });
export const list = (path) => call({ op: 'list', path });
export const batch = (ops) => call({ op: 'write', ops });
export function errText(e) { const c = (e && e.code) || ''; if (c.includes('permission-denied')) return '권한이 없어요. 로그인했는지, 이 공간의 선생님인지 확인해 주세요.'; return (e && e.message) || String(e); }
