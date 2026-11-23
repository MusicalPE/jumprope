# 점퍼스 3 — 가입 코드(학교마다 운영자가 발급) 시험:  node mockserver.js 띄운 뒤  python3 test_codes.py
from playwright.sync_api import sync_playwright
import json, re, os, urllib.request
ROOT = 'http://localhost:8891'; APP = ROOT + '/jumprope/cloud/'
ok = True
def check(l, c, x=''):
    global ok; ok = ok and bool(c); print(('✔' if c else '✘'), l, x)
def fb(body):
    return json.loads(urllib.request.urlopen(urllib.request.Request(ROOT + '/__fb', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})).read())
def docs(): return fb({'op': 'dump'})['result']['docs']
fb({'op': 'reset'})
fb({'op': 'console_set', 'path': 'admins/op1', 'data': {'ok': True}})   # 운영자는 콘솔에서만 지정
PW = 'sunny-2026!'
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    def ctx(g):
        c = b.new_context(viewport={'width': 1100, 'height': 900}); c.grant_permissions(['clipboard-read', 'clipboard-write'], origin=ROOT)
        V = os.path.dirname(os.path.abspath(__file__)) + '/../vendor/'
        def route(r):
            u = r.request.url
            if 'chart.js' in u: return r.fulfill(path=V + 'chart.umd.js', content_type='application/javascript')
            if 'qrcode' in u: return r.fulfill(path=V + 'qrcode.js', content_type='application/javascript')
            return r.fulfill(body='', content_type='application/javascript' if u.endswith('.js') else 'text/css')
        c.route(re.compile(r'^https://.*'), route)
        pg = c.new_page(); pg.set_default_timeout(15000); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
        pg.goto(APP); pg.evaluate("g=>localStorage.setItem('mock-google', JSON.stringify(g))", g)
        pg.goto(APP); pg.wait_for_selector('#jcG'); pg.click('#jcG'); pg.wait_for_selector('#jcNew'); pg.wait_for_timeout(400)
        return pg
    def tryjs(pg, js):
        return pg.evaluate("async()=>{const fb=await import('/jumprope/cloud/js/fb.js');try{await (" + js + ");return 'ok'}catch(e){return e.code||e.message}}")
    # ---------- 1. 운영자: 코드 발급 ----------
    op = ctx({'uid': 'op1', 'name': '운영자', 'email': 'op@example.com'})
    check('운영자에게만 [가입 코드 관리] 보임', op.locator('#jcCodes').count() == 1)
    op.click('#jcCodes'); op.wait_for_selector('#jcIss'); op.fill('#jcSc', '서울 햇살초등학교'); op.click('#jcIss'); op.wait_for_selector('[data-cp]')
    op.fill('#jcSc', '서울 새싹초등학교'); op.click('#jcIss'); op.wait_for_function("document.querySelectorAll('[data-cp]').length==2")
    cd = {v['school']: k.split('/')[1] for k, v in docs().items() if k.startswith('codes/')}
    code, code2 = cd['서울 햇살초등학교'], cd['서울 새싹초등학교']
    check('학교마다 코드 발급 (8자)', len(code) == 8 and len(code2) == 8 and code != code2, code + ' / ' + code2)
    # ---------- 2. 보통 선생님: 코드 없이는 못 만듦 ----------
    t = ctx({'uid': 'tA', 'name': '김선생', 'email': 'a@example.com'})
    check('보통 선생님에게는 [가입 코드 관리] 없음', t.locator('#jcCodes').count() == 0)
    check('보통 선생님은 코드 목록을 못 읽고 못 만듦 (규칙)', tryjs(t, "fb.list('codes')") == 'permission-denied' and tryjs(t, "fb.set('codes/AAAA1111',{school:'가짜초',n:0})") == 'permission-denied' and tryjs(t, "fb.set('admins/tA',{ok:true})") == 'permission-denied')
    t.click('#jcNew'); t.wait_for_selector('#jcCd')
    check('학교 이름 칸은 직접 못 고침', t.evaluate("document.getElementById('jcNm').readOnly") is True)
    t.fill('#jcPw', PW); t.fill('#jcPw2', PW); t.click('#jcMk'); t.wait_for_timeout(500)
    check('코드 없이 만들기 → 막고 안내', '가입 코드를 넣어 주세요' in t.inner_text('#jcM') and not [k for k in docs() if k.startswith('spaces/')])
    t.fill('#jcCd', 'ZZZZ9999'); t.click('#jcMk'); t.wait_for_timeout(600)
    check('없는 코드 → 안내', '찾지 못했어요' in t.inner_text('#jcM'))
    check('코드 없이 규칙을 직접 두드려도 못 만듦', tryjs(t, "fb.set('spaces/hack00000000000000000001',{owner:'tA',name:'아무초'})") == 'permission-denied')
    check('코드는 맞아도 학교 이름을 바꾸면 못 만듦 (규칙)', tryjs(t, "fb.set('spaces/hack00000000000000000002',{owner:'tA',name:'다른초등학교',code:'" + code + "'})") == 'permission-denied')
    # ---------- 3. 코드를 넣으면 학교 이름이 저절로 · 같은 코드로 반마다 ----------
    t.fill('#jcCd', code.lower()[:4] + '-' + code.lower()[4:]); t.dispatch_event('#jcCd', 'change'); t.wait_for_function("document.getElementById('jcNm').value.length>0")
    check('코드를 넣으면 학교 이름이 저절로 들어감 (소문자·줄표도 됨)', t.input_value('#jcNm') == '서울 햇살초등학교' and t.evaluate("document.getElementById('jcNm').readOnly") is True)
    t.fill('#jcCl', '6학년 1반'); t.click('#jcMk'); t.wait_for_selector('#jcRc', timeout=20000)
    t.check('#jcOk'); t.click('#jcGo'); t.wait_for_selector('#recordForm', timeout=20000)
    sid1 = re.search(r's=([a-z0-9]+)', t.url).group(1); d = docs()
    check('공간이 그 학교 이름으로 만들어짐', d['spaces/' + sid1]['name'] == '서울 햇살초등학교' and d['spaces/' + sid1]['code'] == code and d['spaces/' + sid1 + '/meta/pub']['name'] == '서울 햇살초등학교')
    t2 = ctx({'uid': 'tB', 'name': '박선생', 'email': 'b@example.com'})
    t2.click('#jcNew'); t2.wait_for_selector('#jcCd'); t2.fill('#jcCd', code); t2.fill('#jcCl', '6학년 2반'); t2.fill('#jcPw', PW); t2.fill('#jcPw2', PW); t2.click('#jcMk'); t2.wait_for_selector('#jcRc', timeout=20000)
    t2.check('#jcOk'); t2.click('#jcGo'); t2.wait_for_selector('#recordForm', timeout=20000)
    sid2 = re.search(r's=([a-z0-9]+)', t2.url).group(1); d = docs()
    check('같은 코드로 다른 반도 만듦 · 이름은 같은 학교', sid2 != sid1 and d['spaces/' + sid2]['name'] == '서울 햇살초등학교' and d['codes/' + code]['n'] == 2, str(d['codes/' + code].get('n')))
    t.goto(APP); t.wait_for_selector('#jcNew')
    check('내 공간 목록에는 학급까지 보임', '서울 햇살초등학교 · 6학년 1반' in t.inner_text('.jc-spaces'))
    # ---------- 4. 학교 이름은 선생님이 못 바꿈 ----------
    t.goto(APP + '?s=' + sid1 + '&page=space'); t.wait_for_selector('#jcForget')
    check('공간 관리: 학교 이름 고치는 칸이 없음', t.locator('#jcNmSave').count() == 0 and '가입 코드에 적힌 이름' in t.inner_text('body'))
    check('규칙으로도 이름을 못 바꿈 (공간 문서 · 공개 설정)', tryjs(t, "fb.update('spaces/" + sid1 + "',{name:'전국 1등초'})") == 'permission-denied' and tryjs(t, "fb.set('spaces/" + sid1 + "/meta/pub',{name:'전국 1등초'},true)") == 'permission-denied')
    check('코드로 만든 공간도 평소처럼 씀 (승인 절차 바꾸기 · QR 새로 만들기)', tryjs(t, "fb.set('spaces/" + sid1 + "/meta/pub',{approval:false},true)") == 'ok' and tryjs(t, "fb.update('spaces/" + sid1 + "',{wtok:'x'})") == 'ok')
    check('만든 공간 수는 1씩만 올릴 수 있음', tryjs(t, "fb.update('codes/" + code + "',{n:99})") == 'permission-denied' and tryjs(t, "fb.update('codes/" + code + "',{school:'바꿔치기초'})") == 'permission-denied')
    # ---------- 5. 운영자: 중지 · 다시 쓰기 · 삭제 ----------
    op.goto(APP); op.wait_for_selector('#jcCodes'); op.click('#jcCodes'); op.wait_for_selector('[data-off]')
    check('운영자 화면에 만든 공간 수 2', '2' in op.inner_text('table tr:has(code:text("' + code[:4] + '-' + code[4:] + '")) td:nth-child(3)'))
    op.click('[data-off="' + code + '"]'); op.wait_for_function("document.body.innerText.includes('(중지)')")
    t3 = ctx({'uid': 'tC', 'name': '이선생', 'email': 'c@example.com'})
    t3.click('#jcNew'); t3.wait_for_selector('#jcCd'); t3.fill('#jcCd', code); t3.fill('#jcPw', PW); t3.fill('#jcPw2', PW); t3.click('#jcMk'); t3.wait_for_timeout(600)
    check('중지한 코드로는 새 공간을 못 만듦 (화면 · 규칙)', '쓸 수 없는 코드' in t3.inner_text('#jcM') and tryjs(t3, "fb.set('spaces/hack00000000000000000003',{owner:'tC',name:'서울 햇살초등학교',code:'" + code + "'})") == 'permission-denied')
    t.goto(APP + '?s=' + sid1); t.wait_for_selector('#recordForm', timeout=20000)
    check('이미 만든 공간은 그대로 열림', t.is_visible('#recordForm'))
    op.click('[data-del="' + code2 + '"]'); op.wait_for_function("document.querySelectorAll('[data-cp]').length==1")
    check('코드 삭제', ('codes/' + code2) not in docs())
    # ---------- 6. 운영자는 코드 없이도 · 이름도 바꿈 ----------
    op.goto(APP); op.wait_for_selector('#jcNew'); op.click('#jcNew'); op.wait_for_selector('#jcCd'); op.fill('#jcNm', '시험용 학교'); op.fill('#jcPw', PW); op.fill('#jcPw2', PW); op.click('#jcMk'); op.wait_for_selector('#jcRc', timeout=20000)
    check('운영자는 코드 없이 공간을 만듦', any(v.get('name') == '시험용 학교' for k, v in docs().items() if re.fullmatch(r'spaces/[a-z0-9]+', k)))
    check('JS 에러 없음', not errs, str(errs[:3]))
print('결과:', '모두 통과' if ok else '실패 있음')
