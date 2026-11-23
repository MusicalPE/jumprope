# 점퍼스 클라우드판 전체 시험:  node mockserver.js 띄운 뒤  python3 test_cloud.py
# 가짜 파이어베이스(규칙 흉내 포함)로 선생님·학생·두 번째 선생님 흐름을 끝까지 밟음
from playwright.sync_api import sync_playwright
import json, re, os, urllib.request
ROOT = 'http://localhost:8891'
APP = ROOT + '/jumprope/cloud/'
V = os.path.dirname(os.path.abspath(__file__)) + '/../vendor/'
ok = True
def check(l, c, x=''):
    global ok; ok = ok and bool(c); print(('✔' if c else '✘'), l, x)
def fb(body):
    r = urllib.request.urlopen(urllib.request.Request(ROOT + '/__fb', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'}))
    return json.loads(r.read())
fb({'op': 'reset'})
def route(r):
    u = r.request.url
    if 'qrcode' in u: return r.fulfill(path=V + 'qrcode.js', content_type='application/javascript')
    return r.fulfill(body='', content_type='text/css')
PW = 'sunny-2026!'
with sync_playwright() as p:
    b = p.chromium.launch()
    def ctx(google=None, phone=False):
        kw = {'viewport': {'width': 390, 'height': 840}} if phone else {'viewport': {'width': 1200, 'height': 900}}
        c = b.new_context(**kw); c.route(re.compile(r'https://(cdn\.jsdelivr\.net|fonts\.).*'), route)
        c.grant_permissions(['clipboard-read', 'clipboard-write'], origin=ROOT)
        pg = c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('dialog', lambda d: d.accept())
        if google: pg.goto(APP); pg.evaluate("g=>localStorage.setItem('mock-google', JSON.stringify(g))", google)
        return c, pg, errs
    # ---------- 1. 선생님: 로그인 · 공간 만들기 ----------
    tc, t, terr = ctx({'uid': 'teacher1', 'name': '김선생', 'email': 't1@example.com'})
    t.goto(APP); t.wait_for_selector('#gbtn'); t.click('#gbtn'); t.wait_for_selector('#newbtn')
    check('선생님 로그인 → 내 공간', '아직 공간이 없어요' in t.inner_text('body'))
    t.click('#newbtn'); t.fill('#nm', '햇살초등학교'); t.fill('#pw', 'short'); t.fill('#pw2', 'short'); t.click('#mk')
    check('짧은 비밀번호 막음', '8자 이상' in t.inner_text('#m'))
    t.fill('#pw', PW); t.fill('#pw2', PW); t.click('#mk'); t.wait_for_selector('#rc', timeout=20000)
    rc = t.inner_text('#rc').strip()
    check('복구 코드 보여 줌 (20자)', len(rc.replace('-', '')) == 20, rc)
    check('적어 두기 전에는 계속 못 누름', t.is_disabled('#go'))
    t.check('#ok'); t.click('#go'); t.wait_for_selector('.hero')
    sid = re.search(r's=([a-z0-9]+)', t.url).group(1)
    check('공간 만들고 메인으로', '햇살초등학교 줄넘기 기록' in t.inner_text('.hero'), sid)
    docs = fb({'op': 'dump'})['result']['docs']
    sp = docs['spaces/' + sid]
    check('공간 문서: 주인·암호 상자', sp['owner'] == 'teacher1' and 'wrap' in sp['crypto'] and 'recovery' in sp['crypto'] and 'qbox' in sp)
    check('내 공간 목록에 들어감', docs['users/teacher1']['spaces'][sid] == '햇살초등학교')
    # ---------- 2. 학생 등록 ----------
    t.click('#adm'); t.wait_for_selector('#bulk')
    t.fill('#bulk', '4 1 1 김하늘\n4 1 2 박준우\n4 2 1 이서연\n잘못된 줄')
    t.click('#add'); t.wait_for_timeout(800)
    check('학생 3명 등록 (잘못된 줄 빼기)', '3명 등록' in t.inner_text('#am') and '1개는 뺐어요' in t.inner_text('#am'), t.inner_text('#am'))
    ros = fb({'op': 'dump'})['result']['docs']['spaces/' + sid + '/meta/roster']['list']
    raw = json.dumps(ros, ensure_ascii=False)
    check('명단은 암호문 (이름이 서버에 없음)', len(ros) == 3 and '김하늘' not in raw and '박준우' not in raw)
    t.fill('#bulk', '4 1 1 김하늘'); t.click('#add'); t.wait_for_timeout(600)
    check('같은 번호는 다시 안 넣음', '이미 있는 1명' in t.inner_text('#am'))
    # ---------- 3. 승인 절차 켜기 · QR 주소 ----------
    t.click('[data-tab=settings]'); t.check('#ap'); t.click('#sv'); t.wait_for_timeout(500)
    check('승인 절차 켬', fb({'op': 'dump'})['result']['docs']['spaces/' + sid + '/meta/pub']['approval'] is True)
    t.click('[data-tab=qr]'); t.wait_for_selector('#cp'); t.click('#cp'); t.wait_for_timeout(300)
    link = t.evaluate('navigator.clipboard.readText()')
    check('학생 QR 주소: 공간·열쇠·쓰기표', ('?s=' + sid) in link and '#k=' in link and '&w=' in link, link[:80])
    check('QR 그림', t.locator('.qr svg').count() == 1)
    # ---------- 4. 학생: QR 로 들어와 기록 ----------
    sc, s, serr = ctx(phone=True)
    s.goto(link); s.wait_for_selector('#save', timeout=15000)
    check('학생 QR → 로그인 없이 기록 화면', '햇살초등학교' in s.inner_text('.hero'))
    check('주소창에서 열쇠 지움', '#k=' not in s.url)
    check('학생 화면에는 관리 단추 없음', s.locator('#adm').count() == 0)
    s.select_option('#fg', '4'); s.select_option('#fc', '1')
    opts = s.eval_on_selector_all('#fs option', 'o=>o.map(x=>x.textContent)')
    check('이름 목록이 풀려서 보임', '1번 김하늘' in opts and '2번 박준우' in opts, str(opts))
    s.select_option('#fs', label='1번 김하늘'); s.fill('#fn', '120'); s.check('#fme'); s.click('#save'); s.wait_for_timeout(800)
    check('승인 켬 → 승인 후 반영 안내', '승인 후' in s.inner_text('#fm'), s.inner_text('#fm'))
    check('승인 전엔 그래프에 없음', '이번 달 기록이 아직 없어요' in s.inner_text('body'))
    s.fill('#fn', '99999'); s.click('#save'); s.wait_for_timeout(300)
    check('너무 큰 횟수 막음', '사이로' in s.inner_text('#fm'))
    # 규칙: 학생 기기가 직접 하면 안 되는 것들
    def try_js(pg, js):
        return pg.evaluate("async()=>{const fb=await import('/jumprope/cloud/js/fb.js');try{await (" + js + ");return 'ok'}catch(e){return e.code||e.message}}")
    check('규칙: 학생은 명단을 못 고침', try_js(s, "fb.set('spaces/" + sid + "/meta/roster',{list:{}})") == 'permission-denied')
    check('규칙: 학생은 공간 문서(잠금 상자)를 못 읽음', try_js(s, "fb.get('spaces/" + sid + "')") == 'permission-denied')
    check('규칙: 승인 켬일 때 학생이 바로 반영(ok) 못 함', try_js(s, "fb.add('spaces/" + sid + "/inbox',{s:'x',d:'2026-11-23',k:'k1',n:10,src:'hand',st:'ok',w:'" + link.split('&w=')[1] + "',t:fb.NOW})") == 'permission-denied')
    check('규칙: 쓰기표가 틀리면 못 넣음', try_js(s, "fb.add('spaces/" + sid + "/inbox',{s:'x',d:'2026-11-23',k:'k1',n:10,src:'hand',st:'wait',w:'wrongtoken',t:fb.NOW})") == 'permission-denied')
    check('규칙: 5000 넘는 횟수 못 넣음', try_js(s, "fb.add('spaces/" + sid + "/inbox',{s:'x',d:'2026-11-23',k:'k1',n:6000,src:'hand',st:'wait',w:'" + link.split('&w=')[1] + "',t:fb.NOW})") == 'permission-denied')
    check('규칙: 학생은 달 요약을 못 고침', try_js(s, "fb.set('spaces/" + sid + "/months/2026-11',{d:{}})") == 'permission-denied')
    # ---------- 5. 선생님: 승인 → 접기 ----------
    t.goto(APP + '?s=' + sid); t.wait_for_selector('.hero')
    check('선생님 메인: 승인 기다리는 기록 1개', '승인 기다리는 기록 1개' in t.inner_text('.hero'))
    t.click('#adm'); t.wait_for_selector('[data-ok]')
    check('관리 → 기록 승인 탭이 먼저', '김하늘' in t.inner_text('#pane'))
    t.click('[data-ok]'); t.wait_for_timeout(800)
    d = fb({'op': 'dump'})['result']['docs']
    mkeys = [k for k in d if k.startswith('spaces/' + sid + '/months/')]
    inbox = [k for k in d if k.startswith('spaces/' + sid + '/inbox/')]
    check('승인하면 달 요약으로 접히고 inbox 비움', len(mkeys) == 1 and not inbox and '120' in json.dumps(d[mkeys[0]]), str(mkeys))
    t.click('#back'); t.wait_for_selector('.bars')
    check('선생님 메인 그래프에 120', '120' in t.inner_text('.bars'))
    # ---------- 6. 학생: 다시 열면 (주소에 열쇠 없어도) 기억 ----------
    s.goto(APP + '?s=' + sid); s.wait_for_selector('.bars')
    check('학생 다시 열기 → 그래프에 120', '120' in s.inner_text('.bars'))
    check('내 이름 기억 (이 기기)', s.eval_on_selector('#fs', 'e=>e.options[e.selectedIndex].textContent') == '1번 김하늘')
    s.click('[data-stu]'); s.fill('#pw', '0000'); s.click('#go')
    check('학생 비밀번호 틀림', '맞지 않아요' in s.inner_text('#m'))
    s.fill('#pw', '1234'); s.click('#go'); s.wait_for_timeout(300)
    check('학생 기록 조회 (1234)', '이번 달 120회' in s.inner_text('#body'))
    # ---------- 7. 승인 절차 끄면 바로 반영 ----------
    t.click('#adm'); t.click('[data-tab=settings]'); t.uncheck('#ap'); t.click('#sv'); t.wait_for_timeout(400)
    s.goto(APP + '?s=' + sid); s.wait_for_selector('#save'); s.fill('#fn', '30'); s.click('#save'); s.wait_for_timeout(800)
    check('승인 끔 → 바로 반영 (150)', s.inner_text('#fm').startswith('입력되었습니다') and '150' in s.inner_text('.bars'), s.inner_text('.bars'))
    # 학생 화면을 연 뒤에 선생님이 승인 절차를 켬 → 새로 고치지 않아도 승인 대기로
    t.check('#ap'); t.click('#sv'); t.wait_for_timeout(400)
    s.fill('#fn', '7'); s.click('#save'); s.wait_for_timeout(900)
    check('열어 둔 학생 화면: 뒤늦게 켠 승인 절차도 따름', '승인 후' in s.inner_text('#fm') and '150' in s.inner_text('.bars'), s.inner_text('#fm'))
    t.uncheck('#ap'); t.click('#sv'); t.wait_for_timeout(400)
    t.click('[data-tab=approve]'); t.click('[data-no]'); t.wait_for_timeout(600)
    # ---------- 8. 두 번째 선생님 초대 ----------
    t.click('#back'); t.click('#adm'); t.click('[data-tab=teachers]'); t.click('#mk'); t.wait_for_selector('.code')
    code = t.inner_text('.code').strip()
    check('초대 코드 8자', len(code) == 8, code)
    t2c, t2, t2err = ctx({'uid': 'teacher2', 'name': '이선생', 'email': 't2@example.com'})
    t2.goto(APP + '?s=' + sid); t2.wait_for_selector('#gbtn'); t2.click('#gbtn'); t2.wait_for_selector('.card h2')
    check('초대 전: 이 공간 선생님 아님', '선생님이 아니에요' in t2.inner_text('body'))
    t2.goto(APP); t2.wait_for_selector('#inv'); t2.fill('#inv', 'WRONG123'); t2.click('#joinbtn'); t2.wait_for_timeout(400)
    check('틀린 초대 코드', '기한이 지났어요' in t2.inner_text('#jm') or '권한' in t2.inner_text('#jm'), t2.inner_text('#jm'))
    t2.fill('#inv', code); t2.click('#joinbtn'); t2.wait_for_selector('#pw', timeout=10000)
    check('초대 코드로 함께하기 → 비밀번호로 열기 화면', '열기' in t2.inner_text('h2'))
    t2.fill('#pw', 'wrong-password'); t2.click('#go'); t2.wait_for_timeout(1500)
    check('틀린 공간 비밀번호', '맞지 않아요' in t2.inner_text('#m'))
    t2.fill('#pw', PW); t2.click('#go'); t2.wait_for_selector('.hero', timeout=15000)
    check('두 번째 선생님: 이름 보임', '김하늘' in t2.inner_text('.bars'))
    t2.click('#adm'); t2.click('[data-tab=keys]')
    check('두 번째 선생님은 비밀번호 못 바꿈', '만든 선생님만' in t2.inner_text('#pane'))
    check('규칙: 두 번째 선생님은 잠금 상자 못 고침', try_js(t2, "fb.update('spaces/" + sid + "',{crypto:{wrap:1}})") == 'permission-denied')
    # ---------- 9. 새 QR → 예전 QR 로는 못 넣음 ----------
    t.click('[data-tab=qr]'); t.click('#rot'); t.wait_for_timeout(800)
    s.goto(APP + '?s=' + sid); s.wait_for_selector('#save'); s.fill('#fn', '10'); s.click('#save'); s.wait_for_timeout(800)
    check('새 QR 뒤 예전 QR 기기는 기록 못 넣음 (안내)', 'QR이 바뀌었어요' in s.inner_text('#fm'), s.inner_text('#fm'))
    t.click('#cp'); t.wait_for_timeout(300); link2 = t.evaluate('navigator.clipboard.readText()')
    s.goto(link2); s.wait_for_selector('#save'); s.fill('#fn', '10'); s.click('#save'); s.wait_for_timeout(800)
    check('새 QR 찍으면 다시 됨', s.inner_text('#fm').startswith('입력되었습니다'))
    # ---------- 10. 새 기기 · 비밀번호 바꾸기 · 복구 코드 ----------
    t.click('[data-tab=keys]'); t.fill('#cur', PW); t.fill('#np', 'new-pass-9999'); t.click('#go'); t.wait_for_timeout(2500)
    check('비밀번호 바꾸기', '바꿨어요' in t.inner_text('#m'))
    t3c, t3, t3err = ctx({'uid': 'teacher1', 'name': '김선생', 'email': 't1@example.com'})
    t3.goto(APP + '?s=' + sid); t3.wait_for_selector('#gbtn'); t3.click('#gbtn'); t3.wait_for_selector('#pw')
    t3.fill('#pw', PW); t3.click('#go'); t3.wait_for_timeout(1500)
    check('새 기기: 예전 비밀번호는 안 됨', '맞지 않아요' in t3.inner_text('#m'))
    t3.fill('#pw', rc.lower()); t3.click('#go'); t3.wait_for_selector('.hero', timeout=15000)
    check('새 기기: 복구 코드로 열림 (소문자도)', '김하늘' in t3.inner_text('.bars'))
    t3.click('#adm'); t3.click('[data-tab=keys]'); t3.click('#forget'); t3.wait_for_selector('#pw')
    t3.fill('#pw', 'new-pass-9999'); t3.click('#go'); t3.wait_for_selector('.hero', timeout=15000)
    check('열쇠 잊기 → 새 비밀번호로 열림', '김하늘' in t3.inner_text('.bars'))
    # ---------- 11. 학생 삭제 · 비밀번호 초기화 ----------
    t.click('[data-tab=students]'); t.click('[data-del]'); t.wait_for_timeout(800)
    check('학생 삭제 (3 → 2명)', '2명' in t.inner_text('#pane'))
    # ---------- 휴대폰 화면 ----------
    s.goto(APP + '?s=' + sid); s.wait_for_selector('#save'); s.screenshot(path=os.path.dirname(os.path.abspath(__file__)) + '/cloud_phone.png', full_page=True)
    t.click('#back'); t.wait_for_selector('.hero'); t.screenshot(path=os.path.dirname(os.path.abspath(__file__)) + '/cloud_pc.png', full_page=True)
    allerr = terr + serr + t2err + t3err
    check('JS 에러 없음', not allerr, str(allerr[:3]))
print('결과:', '모두 통과' if ok else '실패 있음')
