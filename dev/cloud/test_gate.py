# 점퍼스 3 — 가입 문(학교 목록에서 고르기 + 공통 가입 암호) 시험:  node mockserver.js 띄운 뒤  python3 test_gate.py
from playwright.sync_api import sync_playwright
import json, re, os, urllib.request
ROOT = 'http://localhost:8891'; APP = ROOT + '/jumprope/cloud/'
V = os.path.dirname(os.path.abspath(__file__)) + '/../vendor/'
ok = True
def check(l, c, x=''):
    global ok; ok = ok and bool(c); print(('✔' if c else '✘'), l, x)
def fb(body):
    return json.loads(urllib.request.urlopen(urllib.request.Request(ROOT + '/__fb', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})).read())
def docs(): return fb({'op': 'dump'})['result']['docs']
def spaces(): return {k: v for k, v in docs().items() if re.fullmatch(r'spaces/[a-z0-9]+', k)}
fb({'op': 'reset'})
fb({'op': 'console_set', 'path': 'admins/op1', 'data': {'ok': True}})   # 운영자는 콘솔에서만 지정
PW = 'sunny-2026!'; GATE = '함께뛰어요2026'
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    def route(r):
        u = r.request.url
        if 'chart.js' in u: return r.fulfill(path=V + 'chart.umd.js', content_type='application/javascript')
        if 'qrcode' in u: return r.fulfill(path=V + 'qrcode.js', content_type='application/javascript')
        return r.fulfill(body='', content_type='application/javascript' if u.endswith('.js') else 'text/css')
    def ctx(g, w=1100):
        c = b.new_context(viewport={'width': w, 'height': 900}); c.route(re.compile(r'^https://.*'), route)
        pg = c.new_page(); pg.set_default_timeout(15000); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
        pg.goto(APP); pg.evaluate("g=>localStorage.setItem('mock-google', JSON.stringify(g))", g)
        pg.goto(APP); pg.wait_for_selector('#jcG'); pg.click('#jcG'); pg.wait_for_selector('#jcNew'); pg.wait_for_timeout(400)
        return pg
    def tryjs(pg, js):
        return pg.evaluate("async()=>{const fb=await import('/jumprope/cloud/js/fb.js');try{await (" + js + ");return 'ok'}catch(e){return e.code||e.message}}")
    def make(pg, find, gate, cls=''):
        pg.goto(APP); pg.wait_for_selector('#jcNew'); pg.click('#jcNew'); pg.wait_for_selector('#jcFind')
        pg.fill('#jcFind', find); pg.wait_for_timeout(200)
        if pg.locator('#jcList [data-n]').count(): pg.click('#jcList [data-n] >> nth=0')
        if cls: pg.fill('#jcCl', cls)
        if gate is not None: pg.fill('#jcGp', gate)
        pg.fill('#jcPw', PW); pg.fill('#jcPw2', PW); pg.click('#jcMk')
    # ---------- 1. 운영자: 가입 암호 · 학교 목록 ----------
    op = ctx({'uid': 'op1', 'name': '운영자', 'email': 'op@example.com'})
    check('운영자에게만 [가입 관리] 보임', op.locator('#jcCodes').count() == 1)
    op.click('#jcCodes'); op.wait_for_selector('#jcGpS'); op.fill('#jcGp', GATE); op.click('#jcGpS'); op.wait_for_function("document.getElementById('jcM').innerText.includes('저장했어요')")
    op.fill('#jcBulk', '햇살초등학교\n새싹중학교\n\n  푸른고등학교  \n햇살초등학교\n하늘초등학교'); op.fill('#jcPre', '서울'); op.click('#jcBulkGo'); op.wait_for_selector('#jcCt')
    d = docs()
    check('학교 목록: 겹친 줄·빈 줄 빼고 4곳 (앞말 붙임)', sorted(d['gate/schools']['names']) == ['서울 새싹중학교', '서울 푸른고등학교', '서울 하늘초등학교', '서울 햇살초등학교'], str(d['gate/schools']['names']))
    check('가입 암호는 암호와 그 표시(hash)로 저장', d['gate/main']['pass'] == GATE and len(d['gate/main']['hash']) == 64)
    # ---------- 2. 보통 선생님 ----------
    t = ctx({'uid': 'tA', 'name': '김선생', 'email': 'a@example.com'}, 390)
    check('보통 선생님에게는 [가입 관리] 없음', t.locator('#jcCodes').count() == 0)
    check('보통 선생님은 가입 암호를 못 읽고, 목록·암호·운영자 표시를 못 고침 (규칙)', tryjs(t, "fb.get('gate/main')") == 'permission-denied' and tryjs(t, "fb.set('gate/schools',{names:['가짜초']})") == 'permission-denied' and tryjs(t, "fb.set('gate/main',{hash:'x'})") == 'permission-denied' and tryjs(t, "fb.set('admins/tA',{ok:true})") == 'permission-denied' and tryjs(t, "fb.list('spaces')") == 'permission-denied')
    t.click('#jcNew'); t.wait_for_selector('#jcFind'); t.fill('#jcFind', '초등'); t.wait_for_timeout(200)
    check('학교 찾기: 몇 글자로 걸러짐 (초등 → 2곳)', t.eval_on_selector_all('#jcList [data-n]', 'e=>e.map(x=>x.dataset.n)') == ['서울 하늘초등학교', '서울 햇살초등학교'])
    t.fill('#jcFind', '없는학교'); t.wait_for_timeout(200)
    check('없는 학교는 고를 수 없음', t.locator('#jcList [data-n]').count() == 0 and '찾는 학교가 없어요' in t.inner_text('#jcList'))
    t.fill('#jcPw', PW); t.fill('#jcPw2', PW); t.fill('#jcGp', GATE); t.click('#jcMk'); t.wait_for_timeout(400)
    check('학교를 고르지 않으면 만들지 않음', '골라 주세요' in t.inner_text('#jcM') and not spaces())
    make(t, '햇살', '틀린암호'); t.wait_for_function("document.getElementById('jcM').innerText.length>0")
    check('가입 암호가 틀리면 못 만듦', '가입 암호' in t.inner_text('#jcM') and not spaces(), t.inner_text('#jcM'))
    make(t, '햇살', ''); t.wait_for_timeout(400)
    check('가입 암호를 비우면 안내', '가입 암호를 넣어 주세요' in t.inner_text('#jcM'))
    h = docs()['gate/main']['hash']
    check('암호 표시를 알아도 목록에 없는 학교 이름으로는 못 만듦 (규칙)', tryjs(t, "fb.set('spaces/hack00000000000000000001',{owner:'tA',name:'아무초등학교',gate:'" + h + "'})") == 'permission-denied')
    check('암호 없이 규칙을 직접 두드려도 못 만듦', tryjs(t, "fb.set('spaces/hack00000000000000000002',{owner:'tA',name:'서울 햇살초등학교'})") == 'permission-denied')
    # ---------- 3. 학교 고르고 암호 맞으면 · 같은 학교에서 반마다 ----------
    make(t, '햇살', GATE, '6학년 1반'); t.wait_for_selector('#jcRc', timeout=20000)
    t.check('#jcOk'); t.click('#jcGo'); t.wait_for_selector('#recordForm', timeout=20000)
    sid1 = re.search(r's=([a-z0-9]+)', t.url).group(1); d = docs()
    check('공간이 고른 학교 이름 그대로 만들어짐', d['spaces/' + sid1]['name'] == '서울 햇살초등학교' and d['spaces/' + sid1 + '/meta/pub']['name'] == '서울 햇살초등학교')
    t2 = ctx({'uid': 'tB', 'name': '박선생', 'email': 'b@example.com'})
    make(t2, '햇살초', GATE, '6학년 2반'); t2.wait_for_selector('#jcRc', timeout=20000); t2.check('#jcOk'); t2.click('#jcGo'); t2.wait_for_selector('#recordForm', timeout=20000)
    check('같은 학교의 다른 반도 만듦 (이름은 같은 학교)', sorted(v['name'] for v in spaces().values()) == ['서울 햇살초등학교', '서울 햇살초등학교'])
    t.goto(APP); t.wait_for_selector('#jcNew')
    check('내 공간 목록에는 학급까지 보임', '서울 햇살초등학교 · 6학년 1반' in t.inner_text('.jc-spaces'))
    # ---------- 4. 학교 이름은 선생님이 못 바꿈 ----------
    t.goto(APP + '?s=' + sid1 + '&page=space'); t.wait_for_selector('#jcForget')
    check('공간 관리: 학교 이름 고치는 칸이 없음', t.locator('#jcNmSave').count() == 0 and '학교 목록에서 고른 이름' in t.inner_text('body'))
    check('규칙으로도 이름을 못 바꿈 (공간 문서 · 공개 설정)', tryjs(t, "fb.update('spaces/" + sid1 + "',{name:'전국 1등초'})") == 'permission-denied' and tryjs(t, "fb.set('spaces/" + sid1 + "/meta/pub',{name:'전국 1등초'},true)") == 'permission-denied')
    check('만든 공간은 평소처럼 씀 (승인 절차 바꾸기 · QR 새로 만들기)', tryjs(t, "fb.set('spaces/" + sid1 + "/meta/pub',{approval:false},true)") == 'ok' and tryjs(t, "fb.update('spaces/" + sid1 + "',{wtok:'x'})") == 'ok')
    # ---------- 5. 운영자: 공간 수 · 학교 중지 · 암호 바꾸기 · 빼기 ----------
    op.goto(APP); op.wait_for_selector('#jcCodes'); op.click('#jcCodes'); op.wait_for_selector('#jcCt')
    check('운영자 화면: 학교별 공간 수 (햇살 2)', op.inner_text('#jcCt tr[data-sc="서울 햇살초등학교"] td:nth-child(2)').strip() == '2' and op.input_value('#jcGp') == GATE)
    op.fill('#jcFind', '새싹'); op.wait_for_timeout(200)
    check('학교 이름으로 찾기', op.locator('#jcCt tr[data-sc]:visible').count() == 1)
    op.fill('#jcFind', ''); op.click('[data-off="서울 새싹중학교"]'); op.wait_for_function("document.body.innerText.includes('(중지)')")
    t3 = ctx({'uid': 'tC', 'name': '이선생', 'email': 'c@example.com'})
    t3.click('#jcNew'); t3.wait_for_selector('#jcFind'); t3.fill('#jcFind', '새싹'); t3.wait_for_timeout(200)
    check('중지한 학교는 목록에 안 나오고 규칙으로도 막힘', t3.locator('#jcList [data-n]').count() == 0 and tryjs(t3, "fb.set('spaces/hack00000000000000000003',{owner:'tC',name:'서울 새싹중학교',gate:'" + h + "'})") == 'permission-denied')
    op.fill('#jcGp', '새암호5678'); op.click('#jcGpS'); op.wait_for_function("document.getElementById('jcM').innerText.includes('저장했어요')")
    make(t3, '푸른', GATE); t3.wait_for_function("document.getElementById('jcM').innerText.length>0")
    check('암호를 바꾸면 예전 암호로는 못 만듦', '가입 암호' in t3.inner_text('#jcM') and len(spaces()) == 2)
    make(t3, '푸른', '새암호5678'); t3.wait_for_selector('#jcRc', timeout=20000)
    check('새 암호로는 만듦', len(spaces()) == 3)
    t.goto(APP + '?s=' + sid1); t.wait_for_selector('#recordForm', timeout=20000)
    check('암호가 바뀌어도 이미 만든 공간은 그대로 열림', t.is_visible('#recordForm'))
    op.click('[data-del="서울 하늘초등학교"]'); op.wait_for_function("!document.querySelector('[data-del=\"서울 하늘초등학교\"]')")
    check('학교 빼기', '서울 하늘초등학교' not in docs()['gate/schools']['names'])
    # ---------- 6. 운영자는 목록에 없는 이름도 ----------
    op.goto(APP); op.wait_for_selector('#jcNew'); op.click('#jcNew'); op.wait_for_selector('#jcFind')
    check('운영자 화면에는 가입 암호 칸이 없음', op.locator('#jcGp').count() == 0)
    op.fill('#jcFind', '시험용 학교'); op.fill('#jcPw', PW); op.fill('#jcPw2', PW); op.click('#jcMk'); op.wait_for_selector('#jcRc', timeout=20000)
    check('운영자는 목록에 없는 이름으로도 공간을 만듦', any(v.get('name') == '시험용 학교' for v in spaces().values()))
    t.goto(APP); t.wait_for_selector('#jcNew'); t.click('#jcNew'); t.wait_for_selector('#jcFind'); t.fill('#jcFind', '햇살'); t.wait_for_timeout(200); t.click('#jcList [data-n] >> nth=0'); t.screenshot(path=os.path.dirname(os.path.abspath(__file__)) + '/gate_phone.png', full_page=True)
    check('JS 에러 없음', not errs, str(errs[:3]))
print('결과:', '모두 통과' if ok else '실패 있음')
