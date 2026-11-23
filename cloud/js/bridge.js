// 다른 화면(카메라 판정기)이 클라우드판 공간에 기록을 넣을 때 쓰는 다리
// 판정기 주소의 app 이 'cloud:<공간>' 이면 판정기가 이 파일을 불러 api() 를 부름 (같은 musicalpe.github.io 라 로그인·열쇠를 함께 씀)
let ready = null;
export function api(sid, q) {
  if (!ready) { window.APP = { shellUrl: sid, bridge: true, base: '' }; ready = import('./cloud.js'); }
  return ready.then(() => window.JRCLOUD.cameraApi(q)).catch((e) => ({ ok: false, error: String((e && e.message) || e) }));
}
