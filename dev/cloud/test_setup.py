# 점퍼스 3 — 첫 설정 도우미 시험:  node mockserver.js 띄운 뒤  python3 test_setup.py
from playwright.sync_api import sync_playwright
import json, re, os, urllib.request
ROOT = 'http://localhost:8891'; APP = ROOT + '/jumprope/cloud/'
V = os.path.dirname(os.path.abspath(__file__)) + '/../vendor/'
SHOT = os.environ.get('SHOT', '')
ok = True
def check(l, c, x=''):
    global ok; ok = ok and bool(c); print(('✔' if c else '✘'), l, x)
def fb(body):
    return json.loads(urllib.request.urlopen(urllib.request.Request(ROOT + '/__fb', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})).read())
fb({'op': 'reset'})
fb({'op': 'console_set', 'path': 'admins/t1', 'data': {'ok': True}})   # 시험용 선생님을 운영자로 (가입 암호 없이 만들게)
PW = 'sunny-2026!'
posts = []
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    def route(r):
        u = r.request.url
        if 'chart.js' in u: return r.fulfill(path=V + 'chart.umd.js', content_type='application/javascript')
        if 'qrcode' in u: return r.fulfill(path=V + 'qrcode.js', content_type='application/javascript')
        if u.startswith('https://script.google.com/'):
            if r.request.method == 'POST': posts.append(json.loads(r.request.post_data or '{}'))
            return r.fulfill(body=json.dumps({'ok': True, 'result': {}}), content_type='application/json', headers={'Access-Control-Allow-Origin': '*'})
        return r.fulfill(body='', content_type='application/javascript' if u.endswith('.js') else 'text/css')
    def ctx(g, w=1100, h=900):
        c = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if SHOT else 1); c.route(re.compile(r'^https://.*'), route)
        pg = c.new_page(); pg.set_default_timeout(15000); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
        pg.goto(APP); pg.evaluate("g=>localStorage.setItem('mock-google', JSON.stringify(g))", g)
        pg.goto(APP); pg.wait_for_selector('#jcG'); pg.click('#jcG'); pg.wait_for_selector('#jcNew'); pg.wait_for_timeout(400)
        return pg
    def shot(pg, name):
        if SHOT: pg.screenshot(path=SHOT + '/' + name + '.png', full_page=True)
    step = lambda pg: pg.text_content('.jc-steps li.now').strip()
    call = lambda pg, fn, args='[]': pg.evaluate("a=>window.JRCLOUD.adminToken().then(t=>window.JRCLOUD.call(a[0],[t].concat(a[1])))", [fn, json.loads(args)])

    # ---------- 1. 만들기 → 복구 코드 → 도우미 3단계로 이어짐 ----------
    t = ctx({'uid': 't1', 'name': '김선생', 'email': 't1@example.com'})
    t.click('#jcNew'); t.wait_for_selector('#jcFind'); t.fill('#jcFind', '햇살초등학교'); t.fill('#jcPw', PW); t.fill('#jcPw2', PW); t.click('#jcMk')
    t.wait_for_selector('#jcRc', timeout=20000); t.check('#jcOk'); t.click('#jcGo')
    t.wait_for_selector('.jc-setup #jcSt', timeout=20000); sid = re.search(r's=([a-z0-9]+)', t.url).group(1)
    check('복구 코드 다음은 첫 설정 도우미', 'page=setup' in t.url and step(t) == '3 학생 등록', step(t))
    check('1·2단계는 끝난 것으로 표시', t.locator('.jc-steps li.done').count() == 2)
    shot(t, 's3_empty')
    # ---------- 2. 학생 등록 ----------
    t.click('#jcNext'); t.wait_for_timeout(300)
    check('빈 채로 등록을 누르면 안내', '등록할 학생이 없어요' in t.inner_text('#jcSm'))
    t.fill('#jcSt', '학년\t반\t번호\t이름\n6\t1\t1\t김하늘\n6\t1\t2\t박준우\n6학년 1반 3번 한소율\n6\t1\t2\t박준우\n엉터리줄'); t.wait_for_timeout(200)
    check('미리 세어 줌: 3명 등록 · 2줄 제외', '3명 등록 예정' in t.inner_text('#jcCnt') and '2줄 제외' in t.inner_text('#jcCnt'), t.inner_text('#jcCnt'))
    check('다시 적으면 앞의 안내는 사라짐', t.inner_text('#jcSm').strip() == '')
    check('빠지는 줄의 까닭을 알려 줌', '겹침' in t.inner_text('#jcBad') and '순서를 확인' in t.inner_text('#jcBad'))
    shot(t, 's3_filled')
    t.click('#jcNext'); t.wait_for_selector('#jcAp')
    st = call(t, 'getAllStudents')
    check('학생 3명이 들어감', len(st) == 3 and sorted(x['name'] for x in st) == ['김하늘', '박준우', '한소율'], [x['name'] for x in st])
    # ---------- 3. 기본 설정 ----------
    check('4단계: 권장값이 채워져 있음 (승인 켜짐 · 목표 100)', step(t) == '4 기본 설정' and t.is_checked('#jcAp') and t.input_value('#jcGoal') == '100', t.input_value('#jcGoal'))
    shot(t, 's4')
    check('처음에는 카메라 판정기 · 바로 인정이 골라져 있음(권장값)', t.is_checked('#jcCam') and t.is_checked('#jcAuto'))
    t.uncheck('#jcCam'); check('카메라를 꺼면 "바로 인정"은 못 고름', t.is_disabled('#jcAuto')); t.check('#jcCam')
    t.fill('#jcGoal', '0'); t.click('#jcNext'); t.wait_for_timeout(300)
    check('목표 0은 막음', '1 이상' in t.inner_text('#jcSm') and step(t) == '4 기본 설정')
    t.fill('#jcGoal', '150'); t.click('#jcNext'); t.wait_for_selector('.jc-qr svg')
    cam = call(t, 'getCameraSettingsAdmin'); goal = t.evaluate("window.JRCLOUD.call('getDailyGoal',[])"); app = t.evaluate("window.JRCLOUD.call('getAppSettingsPublic',[])")
    check('설정 저장됨: 승인 켜짐 · 목표 150 · 카메라 켜짐 · 바로 인정', app['approvalOn'] and goal == 150 and cam['enabled'] and cam['autoApprove'], [app, goal, cam.get('enabled'), cam.get('autoApprove')])
    # ---------- 4. 학생 QR ----------
    check('5단계: 학생 QR', step(t) == '5 학생 QR' and t.locator('.jc-qr svg').count() == 1)
    shot(t, 's5')
    link = t.evaluate("window.APP.stuLink")
    # ---------- 5. 중간에 나갔다 오면 이어짐 · 알림 ----------
    t.goto(APP + '?s=' + sid); t.wait_for_selector('#recordForm', timeout=20000); t.wait_for_selector('.jc-todo')
    check('메인 화면에 "첫 설정이 남아 있어요" 알림', '이어서 하기' in t.inner_text('.jc-todo'))
    shot(t, 'nudge')
    t.click('.jc-todo a'); t.wait_for_selector('.jc-qr svg')
    check('이어서 하기 → 멈춘 단계(5)에서 다시', step(t) == '5 학생 QR', step(t))
    t.click('#jcPrev'); t.wait_for_selector('#jcAp'); check('← 이전: 4단계로, 저장한 값이 그대로', t.input_value('#jcGoal') == '150' and t.is_checked('#jcCam'))
    t.click('#jcSkip'); t.wait_for_selector('.jc-qr svg'); t.click('#jcNext'); t.wait_for_selector('#jcNat')
    # ---------- 6. 전국 현황판 ----------
    check('6단계: 참여는 꺼진 채 시작', step(t) == '6 전국 현황판' and not t.is_checked('#jcNat') and t.is_disabled('#jcShow'))
    shot(t, 's6')
    t.check('#jcNat'); t.uncheck('#jcShow'); t.click('#jcNext'); t.wait_for_selector('#jcHome')
    nat = call(t, 'getExtraSettingsAdmin')['nat']
    check('참여 저장: 켜짐 · 학교 이름은 공간 이름 · 이름 안 보이기 · 설치 표시 cloud:', nat['on'] and nat['name'] == '햇살초등학교' and nat['showName'] is False and nat['shell'] == 'cloud:' + sid and len(nat['key']) >= 16, {k: v for k, v in nat.items() if k != 'key'})
    # ---------- 7. 끝 ----------
    check('7단계: 요약 (학생 3명 · 승인 켜짐 · 참여 중)', step(t) == '7 끝' and '3명' in t.inner_text('.jc-setup') and '참여 중' in t.inner_text('.jc-setup'))
    shot(t, 's7')
    t.click('#jcHome'); t.wait_for_selector('#recordForm', timeout=20000); t.wait_for_timeout(1500)
    check('끝낸 뒤에는 알림이 안 뜸', t.locator('.jc-todo').count() == 0)
    check('메인 화면: 학생 3명', t.text_content('#statStudents').strip() == '3')
    # ---------- 8. 도우미로 만든 공간이 제대로 도는지: 학생 QR로 기록 → 선생님 승인 → 현황판 보내기 ----------
    s = b.new_context(viewport={'width': 420, 'height': 860}); s.route(re.compile(r'^https://.*'), route); sp = s.new_page(); sp.set_default_timeout(15000); sp.on('pageerror', lambda e: errs.append(str(e)))
    sp.goto(link); sp.wait_for_selector('#recordForm', timeout=20000); sp.wait_for_timeout(800)
    check('학생 QR로 들어옴 (학생에게는 알림 없음)', sp.text_content('#statStudents').strip() == '3' and sp.locator('.jc-todo').count() == 0)
    sid1 = [x for x in st if x['name'] == '김하늘'][0]['id']
    today = sp.evaluate("new Date(Date.now()+9*3600e3).toISOString().slice(0,10)")
    r = sp.evaluate("a=>window.JRCLOUD.call('addRecord',[a[0],a[1],120,'10:00','모아뛰기'])", [sid1, today])
    check('학생이 손으로 넣은 기록은 승인 대기', r and r.get('ok') and r.get('approval') is True, r)
    t.goto(APP + '?s=' + sid); t.wait_for_selector('#recordForm', timeout=20000); t.wait_for_timeout(1500)   # 선생님 화면을 새로 열면 학생이 넣은 줄을 표에 합침
    pend = call(t, 'getPendingRecords')
    check('선생님에게 승인 대기 1건', len(pend) == 1, len(pend))
    call(t, 'approveRecord', json.dumps([pend[0]['recordId']]))
    rep = t.evaluate("window.JRCLOUD.call('natReportToday',['setup-test'])")
    check('승인 뒤 전국 현황판으로 보냄 (복사한 시트로 보지 않음)', rep and rep.get('ok') and rep.get('students') == 1, rep)
    # 관리자 화면의 전국 현황판 칸도 "옮긴 시트"로 보지 않아야 함
    t.goto(APP + '?s=' + sid + '&page=adminLogin&next=admin'); t.wait_for_selector('.admin-nav', timeout=20000); t.wait_for_timeout(1500)
    check('관리자 화면: 참여 번호가 "옮겨 온 시트"로 뜨지 않음', t.evaluate("NAT.load().then(()=>NAT.active() && !NAT.moved())"))
    # ---------- 9. 예전 공간(도우미 없이 쓰던 공간)에는 알림이 안 뜸 · 참여 번호 표시 고쳐 줌 ----------
    t.evaluate("sid=>window.JRCLOUD.adminToken().then(t=>window.JRCLOUD.call('setExtraSettings',[t,{nat:{on:true,key:'old-key-0123456789abcdef',name:'햇살초등학교',showName:true,shell:sid}}]))", sid)
    rep = t.evaluate("window.JRCLOUD.call('natReportToday',['setup-test'])")
    check('예전에 공간 번호만 적힌 참여 설정도 보내짐 (cloud: 로 고쳐 씀)', rep and rep.get('ok'), rep)
    check('고친 값이 저장됨', call(t, 'getExtraSettingsAdmin')['nat']['shell'] == 'cloud:' + sid)
    # ---------- 10. 휴대폰 화면 ----------
    m = ctx({'uid': 't1', 'name': '김선생', 'email': 't1@example.com'}, 390, 800)
    m.goto(APP + '?s=' + sid + '&page=setup&step=3'); m.wait_for_selector('#jcPw, .jc-setup', timeout=20000)
    if m.locator('#jcPw').count(): m.fill('#jcPw', PW); m.click('#jcGo'); m.wait_for_selector('.jc-setup #jcSt', timeout=20000)
    check('휴대폰: 옆으로 넘치지 않음', m.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), m.evaluate("document.documentElement.scrollWidth"))
    check('다 끝낸 공간도 ?step= 으로 다시 볼 수 있음 · 등록된 학생 수 안내', '3명이 등록' in m.inner_text('.jc-setup'))
    shot(m, 'phone_s3')
    m.goto(APP + '?s=' + sid + '&page=setup&step=6'); m.wait_for_selector('#jcNat'); shot(m, 'phone_s6')
    check('휴대폰 6단계도 넘치지 않음', m.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
    check('JS 에러 없음', not errs, errs)
print('결과:', '모두 통과' if ok else '실패 있음')
