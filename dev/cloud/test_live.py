# 점퍼스 클라우드판 — 점프 Live(수업 방·학생 방) · 전용 라이브 표시 · 공간 삭제 시험
#   node mockserver.js 띄운 뒤  python3 test_live.py   (옆 폴더에 jumpropelive · jump-rope-checker 저장소가 있어야 함)
from playwright.sync_api import sync_playwright
import json, re, os, urllib.request, urllib.parse
ROOT = 'http://localhost:8891'
APP = ROOT + '/jumprope/cloud/'
HERE = os.path.dirname(os.path.abspath(__file__))
V = HERE + '/../vendor/'
ok = True
def check(l, c, x=''):
    global ok; ok = ok and bool(c); print(('✔' if c else '✘'), l, x)
def fb(body):
    r = urllib.request.urlopen(urllib.request.Request(ROOT + '/__fb', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'}))
    return json.loads(r.read())
def dump(): return fb({'op': 'dump'})['result']
fb({'op': 'reset'})
def route(r):
    u = r.request.url
    if 'chart.js' in u: return r.fulfill(path=V + 'chart.umd.js', content_type='application/javascript')
    if 'qrcode' in u: return r.fulfill(path=V + 'qrcode.js', content_type='application/javascript')
    if u.endswith('.js'): return r.fulfill(body='', content_type='application/javascript')
    return r.fulfill(body='', content_type='text/css')
PW = 'sunny-2026!'
NAMES = ['김하늘', '박준우', '이서연']
num = lambda t: t.replace(',', '').strip()
BR = "import('/jumprope/cloud/js/bridge.js')"
with sync_playwright() as p:
    b = p.chromium.launch()
    errs = []
    def ctx(google=None, phone=False):
        c = b.new_context(viewport={'width': 390, 'height': 840} if phone else {'width': 1200, 'height': 900})
        c.route(re.compile(r'https://(cdn\.jsdelivr\.net|fonts\.|script\.google|www\.gstatic|unpkg|cdnjs).*'), route)
        pg = c.new_page(); pg.set_default_timeout(15000); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
        if google: pg.goto(APP); pg.evaluate("g=>localStorage.setItem('mock-google', JSON.stringify(g))", google)
        return c, pg
    def rpc(pg, fn, args):   # 다리로 부르기 (오류는 글자로)
        return pg.evaluate("([sid,fn,args])=>" + BR + ".then(m=>m.rpc(sid,fn,args)).catch(e=>({__err:String(e.message||e)}))", [sid, fn, args])
    def main(pg):
        pg.goto(APP + '?s=' + sid); pg.wait_for_selector('#recordForm', timeout=20000); pg.wait_for_timeout(1500)
    # ---------- 준비: 선생님 · 공간 · 학생 3명 ----------
    tc, t = ctx({'uid': 'teacher1', 'name': '김선생', 'email': 't1@example.com'})
    t.goto(APP); t.wait_for_selector('#jcG'); t.click('#jcG'); t.wait_for_selector('#jcNew')
    t.click('#jcNew'); t.fill('#jcNm', '햇살초등학교'); t.fill('#jcPw', PW); t.fill('#jcPw2', PW); t.click('#jcMk'); t.wait_for_selector('#jcRc', timeout=20000)
    t.check('#jcOk'); t.click('#jcGo'); t.wait_for_selector('#recordForm', timeout=20000)
    sid = re.search(r's=([a-z0-9]+)', t.url).group(1)
    t.click('#navAdmin'); t.wait_for_selector('#adminNav', timeout=15000)
    t.click('#adminNav button[data-tab="register"]'); t.fill('#bulkText', '4\t1\t1\t김하늘\n4\t1\t2\t박준우\n4\t2\t1\t이서연'); t.wait_for_timeout(300); t.click('#bulkAddBtn'); t.wait_for_timeout(2000)
    tok = t.evaluate("window.JRCLOUD.adminToken()")
    studs = t.evaluate("tok=>window.JRCLOUD.call('getAllStudents',[tok])", tok)
    ids = {x['name']: x['id'] for x in studs}
    check('준비: 공간 · 학생 3명', len(ids) == 3, sid)
    t.evaluate("tok=>window.JRCLOUD.call('setCameraSettings',[tok,{enabled:true}]).catch(e=>String(e))", tok)
    main(t); t.click('#navQr'); t.wait_for_selector('#qrOverlay .qr-url'); link = t.text_content('#qrOverlay .qr-url').strip(); t.keyboard.press('Escape')

    # ---------- 1. 거절된 기록이 있어도 학생 QR 입장이 막히지 않음 (0.3.0 의 "QR이 바뀌었어요" 문제) ----------
    sc, s = ctx(phone=True)
    s.goto(link); s.wait_for_selector('#recordForm', timeout=20000); s.wait_for_timeout(1200)
    s.select_option('#gradeSelect', '4'); s.wait_for_timeout(150); s.select_option('#classSelect', '1'); s.wait_for_timeout(150); s.select_option('#nameSelect', ids['김하늘'])
    s.select_option('#typeSelect', index=1); s.fill('#countInput', '30'); s.click('#recordForm button[type=submit]'); s.wait_for_timeout(1800)
    main(t)
    pend = t.evaluate("tok=>window.JRCLOUD.call('getPendingRecords',[tok])", tok)
    plist = pend if isinstance(pend, list) else pend.get('records') or pend.get('list') or []
    check('학생 기록 30회가 승인 대기로', len(plist) == 1, str(pend)[:120])
    rid = plist[0].get('id') or plist[0].get('recordId')
    t.evaluate("([tok,id])=>window.JRCLOUD.call('rejectRecord',[tok,id])", [tok, rid]); t.wait_for_timeout(800)
    n_in = lambda: len([k for k in dump()['docs'] if k.startswith('spaces/' + sid + '/inbox/')])
    before_in, before_deny = n_in(), len(dump()['denies'])
    s2c, s2 = ctx(phone=True)
    s2.goto(link); 
    try: s2.wait_for_selector('#recordForm', timeout=20000); entered = True
    except Exception: entered = False
    s2.wait_for_timeout(1500)
    check('거절된 기록이 있는 공간: 새 기기가 QR로 들어감', entered and '문제가 생겼어요' not in s2.inner_text('body'), s2.inner_text('body')[:60].replace('\n', ' '))
    check('들어가면서 서버에 아무것도 쓰지 않음 (거절된 줄을 새 기록으로 올리지 않음)', n_in() == before_in and len(dump()['denies']) == before_deny, str(n_in()) + '/' + str(before_in))
    main(s); check('기록을 넣었던 기기도 다시 열림', s.is_visible('#recordForm'))

    # ---------- 2. 전용 라이브 표시: 앱에서는 못 켜고, 콘솔에서 켜면 ping 이 알려 줌 ----------
    ping = t.evaluate("window.JRCLOUD.call('ping',[])")
    check('보통 공간: 점프 Live (Lite) 켜짐 · 전용 라이브 꺼짐', ping['lite'] and not ping['live'], str({k: ping[k] for k in ['lite', 'live']}))
    r = t.evaluate("async sid=>{const fb=await import('/jumprope/cloud/js/fb.js');try{await fb.set('spaces/'+sid+'/meta/flags',{live:true});return 'ok'}catch(e){return e.code||e.message}}", sid)
    check('선생님도 앱에서는 전용 라이브 표시를 못 켬 (규칙)', r == 'permission-denied', r)
    t.click('#navAdmin'); t.wait_for_selector('#adminNav'); 
    check('관리자 메뉴: 점프 Live 탭에 Lite 카드만', t.locator('#adminNav button[data-tab="live"]').count() == 1 and t.locator('#openLiteBtn').count() == 1 and t.locator('#liveFbCard').count() == 0)
    check('Lite 카드 글: 학교 시트·껍데기 이야기 없음', '학교 시트' not in t.inner_text('.tab-pane[data-tab="live"]') and '껍데기' not in t.inner_text('.tab-pane[data-tab="live"]'))
    with t.expect_popup() as pop: t.click('#adminNav button[data-tab="live"]'); t.wait_for_timeout(200); t.click('#openLiteBtn')
    m = pop.value; m.on('pageerror', lambda e: errs.append('monitor: ' + str(e))); m.on('dialog', lambda d: d.accept())
    check('큰 화면 주소: lite=1 · s=cloud:공간', 'lite=1' in m.url and ('s=' + urllib.parse.quote('cloud:' + sid, safe='')) in m.url, m.url[-70:])

    # ---------- 3. 큰 화면(monitor.html): 비밀번호 없이 명단 → 방 열기 ----------
    m.wait_for_function("document.getElementById('clsChips') && document.getElementById('clsChips').children.length>0", timeout=20000)
    check('큰 화면: 비밀번호 없이 명단을 가져옴 (4-1 · 4-2)', m.locator('#clsChips .chip').count() == 2 and m.is_hidden('#pwRow'), m.inner_text('#appInfo')[:50])
    m.click('#btnOpen'); m.wait_for_selector('#qrUrl', state='visible', timeout=15000); m.wait_for_function("document.getElementById('qrUrl').textContent.length>10")
    surl = m.inner_text('#qrUrl').strip(); room = re.search(r'room=([^&]+)', surl).group(1)
    check('방 열림 · 학생 QR 주소에 ls=cloud:공간', ('ls=' + urllib.parse.quote('cloud:' + sid, safe='')) in surl and len(room) >= 20, surl[-80:])
    rt = dump()['rt']['lite'][sid]['rooms'][room]
    check('방은 실시간 데이터베이스에: 주인=선생님 로그인 · 이름 없음', rt['own'] == 'teacher1' and not any(n in json.dumps(rt, ensure_ascii=False) for n in NAMES))

    # ---------- 4. 학생 기기: 공간 QR을 찍은 적 없는 기기도 방 QR만으로 ----------
    dc, d1 = ctx(phone=True)
    d1.goto(surl.replace('https://musicalpe.github.io', ROOT)); d1.wait_for_selector('#btnCam')
    src = d1.content()
    check('판정기 1.3.9: ls=cloud:공간 을 받아들이고 다리로 보냄', "const VER='1.3.9'" in src and "/^cloud:[A-Za-z0-9_-]{8,64}$/.test(v)" in src and "bridge.js')).rpc(shell.slice(6)" in src)
    inf = d1.evaluate("([sid,room])=>" + BR + ".then(m=>m.rpc(sid,'liteInfo',[room])).catch(e=>({__err:String(e.message||e)}))", [sid, room])
    check('학생 기기: 방 정보 (liteInfo) — 로그인 없이(익명)', inf.get('meta') and inf['ctl']['ph'] == 'open' and inf['taken'] == [], str(inf)[:140])
    snd = d1.evaluate("([sid,room])=>" + BR + ".then(m=>m.rpc(sid,'liteSend',[room,'devaaaa0001',{g:4,c:1,n:1,cnt:0,best:0,st:'ready'},true]))", [sid, room])
    check('학생 기기: 내 상태 보내고 신호 받음 (liteSend)', snd.get('ctl', {}).get('ph') == 'open' and snd.get('meta', {}).get('g') is not None and abs(snd['t'] - d1.evaluate("Date.now()")) < 5000, str(snd)[:120])
    m.wait_for_timeout(3500)
    pl = rpc(m, 'litePull', [room, ''])
    check('큰 화면: 들어온 학생이 보임 (litePull)', pl['devs'].get('devaaaa0001', {}).get('n') == 1, str(pl)[:120])
    bad = d1.evaluate("([sid,room])=>" + BR + ".then(m=>m.rpc(sid,'liteSetControl',[room,'x',{ph:'go',id:'k1'}])).then(()=>'ok').catch(e=>String(e.message||e))", [sid, room])
    check('학생 기기는 신호를 못 바꿈 (규칙)', '방 열쇠' in bad, bad)
    bad2 = d1.evaluate("([sid,room])=>" + BR + ".then(m=>m.rpc(sid,'liteCloseRoom',[room,'x'])).then(()=>'ok').catch(e=>String(e.message||e))", [sid, room])
    check('학생 기기는 방을 못 닫음 (규칙)', '방 열쇠' in bad2, bad2)
    rpc(m, 'liteSetControl', [room, '', {'ph': 'go', 'id': 'k1', 'at': 0, 'dur': 30}])
    snd = d1.evaluate("([sid,room])=>" + BR + ".then(m=>m.rpc(sid,'liteSend',[room,'devaaaa0001',{g:4,c:1,n:1,cnt:42,best:20,st:'jump',run:true,ctl:'k1'},false]))", [sid, room])
    check('시작 신호가 학생 기기에 닿음', snd['ctl']['ph'] == 'go' and snd['ctl']['id'] == 'k1', str(snd)[:100])
    pl = rpc(m, 'litePull', [room, ''])
    check('큰 화면에 횟수 42', pl['devs']['devaaaa0001']['cnt'] == 42)
    idle = {'g': 4, 'c': 1, 'n': 1, 'cnt': 42, 'best': 20, 'st': 'stop', 'run': False, 'ctl': 'k1'}
    rpc(d1, 'liteSend', [room, 'devaaaa0001', idle, False]); tA = json.loads(dump()['rt']['lite'][sid]['rooms'][room]['devs']['devaaaa0001'])['t']
    d1.wait_for_timeout(300); r_idle = rpc(d1, 'liteSend', [room, 'devaaaa0001', idle, False]); tB = json.loads(dump()['rt']['lite'][sid]['rooms'][room]['devs']['devaaaa0001'])['t']
    check('쉬는 동안 상태가 그대로면 다시 올리지 않고 신호만 받음', tA == tB and r_idle['ctl']['ph'] == 'go', str(tB - tA))
    rpc(d1, 'liteSend', [room, 'devaaaa0001', dict(idle, st='ready'), False]); tC = json.loads(dump()['rt']['lite'][sid]['rooms'][room]['devs']['devaaaa0001'])['t']
    check('상태가 바뀌면 바로 올림', tC > tB)
    inf2 = d1.evaluate("([sid,room])=>" + BR + ".then(m=>m.rpc(sid,'liteInfo',[room]))", [sid, room])
    check('들어온 번호(taken)에 4-1-1', inf2['taken'] == [{'g': 4, 'c': 1, 'n': 1}], str(inf2['taken']))
    # 결과 저장 (큰 화면 → 다리 → 공간)
    typ = rpc(m, 'getJumpTypes', [])[0]
    mtok = m.evaluate("sid=>" + BR + ".then(b=>b.adminToken(sid))", sid)
    sv = rpc(m, 'addLiveRecordsAdmin', [mtok, typ, [{'id': ids['김하늘'], 'count': 42}], 'k1'])
    main(t); 
    check('결과가 승인된 기록으로 들어감 (누적 42)', sv.get('saved') == 1 and num(t.text_content('#statTotal')).startswith('42'), str(sv)[:80] + ' / ' + num(t.text_content('#statTotal')))
    m.evaluate("document.getElementById('qr').hidden=true"); m.click('#btnClose'); m.wait_for_timeout(2500)
    snd = d1.evaluate("([sid,room])=>" + BR + ".then(m=>m.rpc(sid,'liteSend',[room,'devaaaa0001',{g:4,c:1,n:1,st:'ready'},false]))", [sid, room])
    check('방을 닫으면 학생 기기가 닫힘을 앎 · 방이 지워짐', snd.get('closed') is True and room not in (dump()['rt'].get('lite', {}).get(sid, {}).get('rooms') or {}), str(snd)[:80])
    m.close()

    # ---------- 5. 학생 방 (각자 기기로 대결) ----------
    main(s)
    check('학생 화면에 [각자 기기로 대결] 보임', s.is_visible('#duelBtn'))
    def camtok(pg, name):
        r = pg.evaluate("id=>window.JRCLOUD.call('issueCameraToken',[id,'모아뛰기'])", ids[name]); return re.search(r'[?&]t=([^&]+)', r['url']).group(1), r['url']
    ta, urla = camtok(s, '김하늘'); main(s2); tb, urlb = camtok(s2, '박준우')
    ja = s.context.new_page(); ja.goto(urla.replace('https://musicalpe.github.io', ROOT)); ja.wait_for_selector('#btnCam')
    jb = s2.context.new_page(); jb.goto(urlb.replace('https://musicalpe.github.io', ROOT)); jb.wait_for_selector('#btnCam')
    who = ja.evaluate("([sid,t])=>" + BR + ".then(m=>m.api(sid,{api:'rope_x_who',t:t}))", [sid, ta])
    check('판정기: 학생 방을 쓸 수 있다고 알려 줌 (방)', who['ok'] and who['data']['방'], str(who['data'].get('방')))
    op = rpc(ja, 'liteStuOpen', [ta, {'mode': '1v1'}])
    check('방 만들기: 4자리 방 번호', re.fullmatch(r'\d{4}', str(op.get('code', ''))) and op['mode'] == '1v1', str(op)[:120])
    op2 = rpc(ja, 'liteStuOpen', [ta, {'mode': '1v1'}])
    check('다시 눌러도 같은 방', op2.get('room') == op['room'] and op2.get('code') == op['code'])
    jn = rpc(jb, 'liteStuJoin', [tb, op['code']])
    check('친구가 방 번호로 들어옴', jn.get('room') == op['room'], str(jn)[:100])
    check('없는 방 번호는 안내', '찾지 못했어요' in rpc(jb, 'liteStuJoin', [tb, '0000' if op['code'] != '0000' else '0001']).get('__err', ''))
    rpc(ja, 'liteSend', [op['room'], 'devaaaa000a', {'g': 4, 'c': 1, 'n': 1, 'cnt': 10, 'st': 'jump'}, False])
    rpc(jb, 'liteSend', [op['room'], 'devaaaa000b', {'g': 4, 'c': 1, 'n': 2, 'cnt': 7, 'st': 'jump'}, False])
    bd = rpc(jb, 'liteStuBoard', [op['room']])
    check('방 현황: 두 사람 이름과 횟수 · 방장 이름', bd.get('ppl') == {'4-1-1': '김하늘', '4-1-2': '박준우'} and sorted((x['name'], x['cnt']) for x in bd['devs']) == [('김하늘', 10), ('박준우', 7)] and bd['host'] == '김하늘' and bd['cap'] == 2, str(bd)[:200])
    rtraw = json.dumps(dump()['rt'], ensure_ascii=False)
    check('학생 방도 서버에는 이름이 암호문으로만', not any(n in rtraw for n in NAMES) and op['room'] in rtraw)
    s3c, s3 = ctx(phone=True); s3.goto(link); s3.wait_for_selector('#recordForm', timeout=20000); s3.wait_for_timeout(1000)
    tcx, urlc = camtok(s3, '이서연')
    full = rpc(s3, 'liteStuJoin', [tcx, op['code']])
    check('1대1 방은 2명까지', '꽉 찼어요' in full.get('__err', ''), str(full)[:80])
    rpc(jb, 'liteStuLeave', [tb, op['room']])
    check('친구가 나가면 자리가 빔', list(rpc(ja, 'liteStuBoard', [op['room']])['ppl']) == ['4-1-1'])
    check('방장이 아닌 친구는 방을 못 닫음', '방 열쇠' in rpc(jb, 'liteCloseRoom', [op['room'], '']).get('__err', ''))
    rpc(ja, 'liteCloseRoom', [op['room'], op['owner']])
    lt = dump()['rt'].get('lite', {}).get(sid, {})
    check('방장이 닫으면 방과 방 번호가 지워짐', op['room'] not in (lt.get('rooms') or {}) and op['code'] not in (lt.get('codes') or {}))
    jsrc = ja.content()
    check('방 QR 주소: 클라우드판 앱 주소로 (cloud/ · s=공간)', "(beta\\/|club\\/|cloud\\/)?$" in jsrc and "LINK.app.indexOf('cloud:')===0?LINK.app.slice(6):LINK.app" in jsrc)
    ja.close(); jb.close()

    # ---------- 6. 콘솔에서 전용 라이브 표시를 켠 공간 ----------
    fb({'op': 'console_set', 'path': 'spaces/' + sid + '/meta/flags', 'data': {'live': True}})
    main(t); ping = t.evaluate("window.JRCLOUD.call('ping',[])")
    check('표시를 켠 공간: ping 이 전용 라이브를 알려 줌', ping['live'] == 1 and ping['lite'])
    t.click('#navAdmin'); t.wait_for_selector('#adminNav'); t.click('#adminNav button[data-tab="live"]'); t.wait_for_timeout(300)
    check('관리자 메뉴: 전용 점프 라이브 카드도 보임', t.locator('#liveFbCard').count() == 1 and t.is_visible('#openLiveBtn'))
    with t.expect_popup() as pop: t.click('#openLiveBtn')
    m = pop.value
    check('전용 라이브 주소: lite 없이 s=cloud:공간', 'lite=1' not in m.url and ('s=' + urllib.parse.quote('cloud:' + sid, safe='')) in m.url, m.url[-60:])
    m.close()
    main(s); check('학생 기기도 표시를 읽을 수 있음(읽기만)', s.evaluate("window.JRCLOUD.call('ping',[]).then(p=>p.live)") == 1)

    # ---------- 6-2. 읽기 수 아끼기: 두 번째부터는 "그 뒤로 바뀐 문서"만 ----------
    def reads_after(fn):
        n0 = len(dump()['reads']); fn(); return dump()['reads'][n0:]
    main(s3)
    r1 = reads_after(lambda: main(s3))
    check('학생 기기: 다시 열 때 표를 전부 읽지 않고 바뀐 것만 물음 (빈 기록함은 그냥 읽음)', r1 and all(x.endswith('/book since') or '/inbox' in x for x in r1), str(r1))
    tot0 = num(s3.text_content('#statTotal'))
    tok2 = t.evaluate("window.JRCLOUD.adminToken()")
    typ2 = t.evaluate("window.JRCLOUD.call('getJumpTypes',[])")[0]
    t.evaluate("([tok,id,typ])=>window.JRCLOUD.call('addLiveRecordsAdmin',[tok,typ,[{id:id,count:8}],'kx2'])", [tok2, ids['박준우'], typ2]); t.wait_for_timeout(500)
    r2 = reads_after(lambda: main(s3))
    check('선생님이 기록을 넣으면 학생 기기도 바로 따라옴 (42 → 50)', tot0.startswith('42') and num(s3.text_content('#statTotal')).startswith('50'), tot0 + ' → ' + num(s3.text_content('#statTotal')) + ' ' + str(r2))
    main(s); s.select_option('#gradeSelect', '4'); s.wait_for_timeout(150); s.select_option('#classSelect', '1'); s.wait_for_timeout(150); s.select_option('#nameSelect', ids['김하늘'])
    s.select_option('#typeSelect', index=1); s.fill('#countInput', '11'); s.click('#recordForm button[type=submit]'); s.wait_for_timeout(1800)
    main(t); pend2 = t.evaluate("tok=>window.JRCLOUD.call('getPendingRecords',[tok])", tok2)
    check('학생이 넣은 기록은 그대로 선생님 승인 대기로', len(pend2) == 1 and str(pend2[0].get('count')) == '11', str(pend2)[:100])
    t.evaluate("([tok,id])=>window.JRCLOUD.call('approveRecord',[tok,id])", [tok2, pend2[0]['recordId']]); t.wait_for_timeout(600)
    main(s3); check('승인하면 다른 학생 기기 누적에도 반영 (50 → 61)', num(s3.text_content('#statTotal')).startswith('61'), num(s3.text_content('#statTotal')))
    t.evaluate("tok=>window.JRCLOUD.call('resetAllRecords',[tok]).catch(e=>String(e.message||e))", tok2); t.wait_for_timeout(800)
    gone = [k for k, v in dump()['docs'].items() if k.startswith('spaces/' + sid + '/book/Records_') and v.get('gone')]
    main(s3); main(s)
    check('기록 모두 지우기: 표 문서는 없어짐 표시로 · 학생 기기들도 0으로', len(gone) >= 1 and num(s3.text_content('#statTotal')).startswith('0') and num(s.text_content('#statTotal')).startswith('0'), str(len(gone)) + ' / ' + num(s3.text_content('#statTotal')) + ' / ' + num(s.text_content('#statTotal')))
    main(t); check('선생님 화면도 0 · 다시 기록하면 살아남', num(t.text_content('#statTotal')).startswith('0'))
    t.evaluate("([tok,id,typ])=>window.JRCLOUD.call('addLiveRecordsAdmin',[tok,typ,[{id:id,count:5}],'kx3'])", [tok2, ids['박준우'], typ2]); t.wait_for_timeout(500)
    main(s3); check('지운 뒤 새 기록 5회가 학생 기기에 보임', num(s3.text_content('#statTotal')).startswith('5'), num(s3.text_content('#statTotal')))
    r3 = reads_after(lambda: main(t))
    check('선생님 화면: 표는 바뀐 것만 묻고 기록함만 전부 읽음', 'spaces/' + sid + '/book since' in r3 and ('spaces/' + sid + '/book') not in r3, str(r3))

    # ---------- 7. 공간 삭제 ----------
    t.goto(APP + '?s=' + sid + '&page=space'); t.wait_for_selector('#jcDelGo')
    check('공간 관리: 점프 Live 안내와 공간 주소', '전용 점프 라이브' in t.inner_text('body') and sid in t.inner_text('body'))
    t.fill('#jcDelNm', '햇살초'); t.click('#jcDelGo'); t.wait_for_timeout(500)
    check('학교 이름이 다르면 지우지 않음', '같지 않아요' in t.inner_text('#jcDelM') and ('spaces/' + sid) in dump()['docs'])
    t.fill('#jcDelNm', '햇살초등학교'); t.click('#jcDelGo'); t.wait_for_selector('#jcNew', timeout=20000)
    left = [k for k in dump()['docs'] if sid in k]
    check('삭제: 공간 문서가 모두 지워짐 (콘솔에서 만든 표시만 남음)', left == ['spaces/' + sid + '/meta/flags'], str(left))
    check('삭제 뒤 내 공간 목록에서 빠짐', '아직 공간이 없어요' in t.inner_text('body') and sid not in json.dumps(dump()['docs'].get('users/teacher1', {})))
    s.goto(APP + '?s=' + sid); s.wait_for_timeout(2500)
    check('지운 공간의 학생 QR은 더 이상 열리지 않음', not s.is_visible('#recordForm') and '찾을 수 없어요' in s.inner_text('body'), s.inner_text('body')[:50].replace('\n', ' '))
    same = open(HERE + '/../../../jumpropelive/index.html', encoding='utf-8').read() == open(HERE + '/../../../jump-rope-checker/index.html', encoding='utf-8').read()
    check('판정기 두 곳(jump-rope-checker · jumpropelive)이 같은 파일', same)
    check('JS 에러 없음', not errs, str(errs[:3]))
print('결과:', '모두 통과' if ok else '실패 있음')
