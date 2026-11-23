// 다른 화면(카메라 판정기 · 점프 Live 큰 화면)이 클라우드판 공간을 쓸 때의 다리
// 주소의 app(또는 s, ls)이 'cloud:<공간>' 이면 그 화면이 이 파일을 불러 씀 (같은 musicalpe.github.io 라 로그인·열쇠를 함께 씀)
let ready = null;
function load(sid) {
  if (!ready) { window.APP = { shellUrl: sid, bridge: true, base: '' }; ready = import('./cloud.js'); }
  return ready;
}
// 판정기: rope_x_who · rope_x_save
export function api(sid, q) {
  return load(sid).then(() => window.JRCLOUD.cameraApi(q)).catch((e) => ({ ok: false, error: String((e && e.message) || e) }));
}
// 점프 Live 수업 방을 주고받는 일은 공간을 열지 않아도 됨 (QR만 찍고 들어온 기기도 쓸 수 있게) — 그 밖의 요청은 공간을 열어서
const ROOM = { liteSetControl: (L, s, a) => L.setControl(s, a[0], a[1], a[2]), litePull: (L, s, a) => L.pull(s, a[0]), liteCloseRoom: (L, s, a) => L.closeRoom(s, a[0]),
  liteInfo: (L, s, a) => L.info(s, a[0]), liteSend: (L, s, a) => L.send(s, a[0], a[1], a[2], a[3]) };
export async function rpc(sid, fn, args) {
  if (ROOM[fn]) return ROOM[fn](await import('./lite.js'), sid, args || []);
  await load(sid);
  return window.JRCLOUD.call(fn, args || []);
}
export async function adminToken(sid) { await load(sid); return window.JRCLOUD.adminToken(); }
