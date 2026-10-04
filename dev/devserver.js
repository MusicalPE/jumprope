// 시험용: /exec = Shell.gs (흉내 Apps Script), /jumprope/ = GitHub 에 올릴 화면
const express = require('express');
const path = require('path');
const { createGas } = require('./gas-emu');
const PORT = +process.env.PORT || 8890;
const gas = createGas({ selfUrl: 'http://localhost:' + PORT + '/exec' });
// 기존 1.x 사용 학교처럼 학생·기록 몇 개 넣어 두기 (env SEED=1)
if (process.env.SEED) {
  const g = gas.ctx;
  const t = g.verifyAdminPassword('1234').token;
  g.addStudentsBulk(t, [{ grade: '6', cls: '1', number: '1', name: '김하늘' }, { grade: '6', cls: '1', number: '2', name: '박준우' }, { grade: '6', cls: '1', number: '3', name: '이서연' }, { grade: '5', cls: '2', number: '7', name: '최온유' }]);
  const ids = g.getAllStudentsPublic().map(s => s.id);
  const d = n => { const x = new Date(); x.setDate(x.getDate() - n); return g.formatDate_(x); };
  [[0,0,120,'모아뛰기'],[0,1,80,'엇갈아뛰기'],[1,1,150,'모아뛰기'],[2,0,200,'이중뛰기'],[3,2,60,'모아뛰기'],[1,0,90,'모아뛰기'],[0,3,40,'십자뛰기']].forEach(([s,day,c,ty]) => g.addRecord(ids[s], d(day), c, '10:00', ty));
}
const app = express();
app.use(express.text({ type: '*/*', limit: '2mb' }));
function send(res, out) {
  res.set('Access-Control-Allow-Origin', '*');
  if (out && out._type === 'html') return res.type('html').send(out.content);
  res.type('json').send(out.content);
}
app.get('/exec', (req, res) => send(res, gas.ctx.doGet({ parameter: req.query })));
app.post('/exec', (req, res) => send(res, gas.ctx.doPost({ postData: { contents: req.body } })));
app.use('/jumprope', express.static(path.join(__dirname, '..')));
app.use('/checker', express.static(path.join(__dirname, 'checker')));
app.get('/__state', (req, res) => res.json({ props: gas.props, records: (gas.sheets.Records || { _rows: [] })._rows, students: (gas.sheets.Students || { _rows: [] })._rows }));
app.listen(PORT, () => console.log('dev on ' + PORT));
