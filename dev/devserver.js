// 시험용: /exec = Shell.gs (흉내 Apps Script), /jumprope/ = GitHub 에 올릴 화면
const express = require('express');
const path = require('path');
const { createGas } = require('./gas-emu');
const PORT = +process.env.PORT || 8890;
const gas = createGas({ selfUrl: 'http://localhost:' + PORT + '/exec' });
// 전국 현황판 중앙 수집기 (../Collector.gs) — /collector
const col = createGas({ selfUrl: 'http://localhost:' + PORT + '/collector', shellPath: __dirname + '/../Collector.gs' });
// 기존 1.x 사용 학교처럼 학생·기록 몇 개 넣어 두기 (env SEED=1)
if (process.env.SEED) {
  const g = gas.ctx;
  gas.props.APPROVAL_ON = '0';   // 승인 절차를 꺼 두고 쓰던 학교
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
app.get('/collector', (req, res) => send(res, col.ctx.doGet({ parameter: req.query })));
app.post('/collector', (req, res) => send(res, col.ctx.doPost({ postData: { contents: req.body } })));
// 시험 중에는 화면이 로컬 수집기를 쓰도록 national.json 을 바꿔서 내려줌
app.get(['/jumprope/national.json', '/jumprope/beta/national.json'], (req, res) => res.json({ collector: 'http://localhost:' + PORT + '/collector' }));
app.post('/__col/seed', (req, res) => { try { res.json(seedCollector(JSON.parse(req.body || '{}'))); } catch (e) { res.status(500).send(String(e.stack || e)); } });
app.get('/__col/state', (req, res) => res.json({ schools: (col.sheets.Schools || { _rows: [] })._rows, daily: (col.sheets.Daily || { _rows: [] })._rows }));
app.use('/jumprope', express.static(path.join(__dirname, '..')));
app.use('/checker', express.static(path.join(__dirname, 'checker')));
app.get('/__state', (req, res) => res.json({ props: gas.props, records: (gas.sheets.Records || { _rows: [] })._rows, students: (gas.sheets.Students || { _rows: [] })._rows }));
app.listen(PORT, () => console.log('dev on ' + PORT));

// 다른 학교 몇 곳 + 지난 달 기록을 수집기에 직접 넣기 (현황판·기록실 시험용)
function seedCollector(o) {
  const c = col.ctx, names = ['김민준','이서윤','박도윤','최하은','정시우','강지호','조수아','윤예준','장하린','임주원'];
  const today = c.today_(), m = today.slice(0, 7), pm = c.prevMonth_(m);
  const day = (mm, d) => mm + '-' + String(d).padStart(2, '0');
  const schools = [['seed-school-key-aaaaaaaaaaaa', '햇살초등학교', true, 40, 1.0], ['seed-school-key-bbbbbbbbbbbb', '푸른숲초등학교', true, 120, 0.6], ['seed-school-key-cccccccccccc', '', false, 25, 1.4]];
  // 지난 달 기록은 수집기가 '지금 기준 지난 달'까지만 받으므로 Daily 시트에 직접 쓴다
  const dsh = c.dailySheet_(); c.schoolsSheet_();
  schools.forEach(([key, name, show, reg, k], si) => {
    c.report_({ key, name, showName: show, registered: reg, days: [] });
    const pid = c.publicId_(key);
    // 지난 달 20일치 + 이번 달 + 더 오래된 달 13개(각 2일, 기록실 12개월 제한 시험용)
    const older = []; let om = pm; for (let k = 0; k < 13; k++) { om = c.prevMonth_(om); older.push([om, 2]); }
    [[pm, 20], [m, Math.min(Number(today.slice(8)), 3)]].concat(older).forEach(([mm, nd]) => {
      for (let d = 1; d <= nd; d++) {
        const st = names.slice(0, 4 + si * 2).map((n, i) => ['s' + si + 'x' + i, c.maskName_(n), String(4 + (i % 3)), Math.round((60 + i * 17 + d * 3) * k), i % 3 === 0 ? 30 : 0]);
        const total = st.reduce((a, s) => a + s[3], 0), cam = st.reduce((a, s) => a + s[4], 0);
        dsh.appendRow([pid, day(mm, d), total, st.length, cam, JSON.stringify(st), new Date()]);
      }
    });
  });
  c.clearCache_();
  return { ok: true, month: m, prev: pm };
}
