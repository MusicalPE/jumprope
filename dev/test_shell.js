// 껍데기 단위 시험 (서버 없이): node test_shell.js
const { createGas } = require('./gas-emu');
let ok = true;
const check = (label, cond, extra) => { ok = ok && !!cond; console.log((cond ? '✔' : '✘') + ' ' + label + (extra ? ' ' + extra : '')); };
for (const [name, sp] of [['정식(2판)', undefined], ['베타(3판)', __dirname + '/../beta/Shell.gs']]) {
  const g = createGas({ selfUrl: 'x', shellPath: sp }), c = g.ctx;
  check(name + ' 새 학교 승인 절차 기본 켜짐', c.getAppSettingsPublic().approvalOn === true);
  g.props.APPROVAL_ON = '0';
  const t = c.verifyAdminPassword('1234').token;
  c.addStudentsBulk(t, [{ grade: '6', cls: '1', number: '1', name: '가가가' }, { grade: '6', cls: '1', number: '2', name: '나나나' }, { grade: '6', cls: '1', number: '3', name: '다다다' }]);
  const [a, b, d] = c.getAllStudentsPublic().map(s => s.id);
  [a, b, a, a, d, b, a].forEach((id, i) => c.addRecord(id, '2026-10-0' + (i % 3 + 1), 10 + i, '10:00', '모아뛰기'));
  g.props.APPROVAL_ON = '1'; c.addRecord(a, '2026-10-03', 50, '10:00', '모아뛰기'); c.addRecord(b, '2026-10-03', 60, '10:00', '모아뛰기');
  if (c.saveLevelPasses) c.saveLevelPasses(t, [{ id: a, level: 0, item: 0, pass: true }, { id: b, level: 0, item: 0, pass: true }]);
  c.deleteStudent(t, a);
  const recs = g.sheets.Records._rows.slice(1).map(r => r[2]);
  check(name + ' 학생 삭제 → 그 학생 기록도 삭제', !recs.includes(a) && recs.filter(x => x === b).length === 3 && recs.filter(x => x === d).length === 1, JSON.stringify(recs.length));
  check(name + ' 승인 대기에서 삭제 학생 빠짐', c.getPendingRecords(t).length === 1 && c.getPendingRecordsPublic().length === 1);
  // 예전 껍데기로 지워 남아 있던 기록(주인 없는 기록)도 승인 목록에 안 보임
  g.sheets.Records.appendRow(['x', new Date(), 'no-such-student', '2026-10-03', 5, 'pending', '', '모아뛰기', '']);
  check(name + ' 주인 없는 대기 기록 숨김', c.getPendingRecords(t).length === 1);
  if (c.getLevelsPublic) check(name + ' 급수 기록도 삭제', JSON.stringify(Object.keys(c.getLevelsPublic())) === JSON.stringify([b]));
}
console.log('결과:', ok ? '모두 통과' : '실패 있음');
process.exit(ok ? 0 : 1);
