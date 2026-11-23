# 점퍼스 클라우드판 전체 시험:  node mockserver.js 띄운 뒤  python3 test_cloud.py
# 가짜 파이어베이스(규칙 흉내 포함)로, 진짜 점퍼스 화면을 선생님·학생·두 번째 선생님으로 끝까지 밟음
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
def dump(): return fb({'op': 'dump'})['result']['docs']
fb({'op': 'reset'})
def route(r):
    u = r.request.url
    if 'chart.js' in u: return r.fulfill(path=V + 'chart.umd.js', content_type='application/javascript')
    if 'qrcode' in u: return r.fulfill(path=V + 'qrcode.js', content_type='application/javascript')
    if 'script.google' in u: return r.fulfill(body='{"ok":true}', content_type='application/json')
    return r.fulfill(body='', content_type='text/css')
PW = 'sunny-2026!'
NAMES = ['김하늘', '박준우', '이서연']
num = lambda t: t.replace(',', '').strip()
with sync_playwright() as p:
    b = p.chromium.launch()
    def ctx(google=None, phone=False):
        kw = {'viewport': {'width': 390, 'height': 840}} if phone else {'viewport': {'width': 1200, 'height': 900}}
        c = b.new_context(**kw); c.route(re.compile(r'https://(cdn\.jsdelivr\.net|fonts\.|script\.google|mail\.google).*'), route)
        c.grant_permissions(['clipboard-read', 'clipboard-write'], origin=ROOT)
        pg = c.new_page(); pg.set_default_timeout(15000); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('dialog', lambda d: d.accept())
        if google: pg.goto(APP); pg.evaluate("g=>localStorage.setItem('mock-google', JSON.stringify(g))", google)
        return c, pg, errs
    def try_js(pg, js):
        return pg.evaluate("async()=>{const fb=await import('/jumprope/cloud/js/fb.js');try{await (" + js + ");return 'ok'}catch(e){return e.code||e.message}}")
    def record(pg, g, c, name, kind, n):
        pg.select_option('#gradeSelect', g); pg.wait_for_timeout(150); pg.select_option('#classSelect', c); pg.wait_for_timeout(150)
        pg.select_option('#nameSelect', label=name)
        pg.select_option('#typeSelect', kind); pg.fill('#countInput', str(n)); pg.click('#recordForm button[type=submit]'); pg.wait_for_timeout(1800)
    def main(pg):
        pg.goto(APP + '?s=' + sid); pg.wait_for_selector('#recordForm', timeout=20000); pg.wait_for_timeout(1500)
    # ---------- 1. 선생님: 로그인 · 공간 만들기 ----------
    tc, t, terr = ctx({'uid': 'teacher1', 'name': '김선생', 'email': 't1@example.com'})
    t.goto(APP); t.wait_for_selector('#jcG'); t.click('#jcG'); t.wait_for_selector('#jcNew')
    check('선생님 로그인 → 내 공간', '아직 공간이 없어요' in t.inner_text('body'))
    t.click('#jcNew'); t.fill('#jcNm', '햇살초등학교'); t.fill('#jcPw', 'short'); t.fill('#jcPw2', 'short'); t.click('#jcMk')
    check('짧은 비밀번호 막음', '8자 이상' in t.inner_text('#jcM'))
    t.fill('#jcPw', PW); t.fill('#jcPw2', PW); t.click('#jcMk'); t.wait_for_selector('#jcRc', timeout=20000)
    rc = t.inner_text('#jcRc').strip()
    check('복구 코드 보여 줌 (20자)', len(rc.replace('-', '')) == 20, rc)
    mail = urllib.parse.unquote(t.get_attribute('#jcMail', 'href'))
    check('내 메일로 보내 두기: 로그인한 메일·복구 코드·학교 이름', 'to=t1@example.com' in mail and rc in mail and '햇살초등학교' in mail)
    check('적어 두기 전에는 계속 못 누름', t.is_disabled('#jcGo'))
    t.check('#jcOk'); t.click('#jcGo'); t.wait_for_selector('#recordForm', timeout=20000)
    sid = re.search(r's=([a-z0-9]+)', t.url).group(1)
    check('공간 만들고 → 진짜 점퍼스 메인 화면', t.is_visible('#statStudents') and t.is_visible('.topbar-nav .jrhelp-btn'), sid)
    # ---------- 2. 관리자 메뉴: 비밀번호 없이 통과 · 학생 등록 ----------
    t.click('#navAdmin'); t.wait_for_selector('#adminNav', timeout=15000)
    check('관리자 메뉴: 구글 로그인으로 바로 통과', 'page=admin' in t.url and 'token=' in t.url)
    check('관리자 메뉴에 [공간 관리] 링크', t.locator('#adminNav a.jc-space').count() == 1)
    t.click('#adminNav button[data-tab="register"]'); t.fill('#bulkText', '4\t1\t1\t김하늘\n4\t1\t2\t박준우\n4\t2\t1\t이서연'); t.wait_for_timeout(300); t.click('#bulkAddBtn'); t.wait_for_timeout(2000)
    t.click('#adminNav button[data-tab="students"]'); t.wait_for_timeout(800)
    check('학생 3명 등록', t.locator('#studentTable tbody tr').count() == 3)
    d = dump(); raw = json.dumps(d, ensure_ascii=False)
    check('서버에는 암호문만 (학생 이름이 없음)', ('spaces/' + sid + '/book/Students') in d and not any(n in raw for n in NAMES))
    check('표 문서: Students · props', all(('spaces/' + sid + '/book/' + k) in d for k in ['Students', 'props']))
    # ---------- 3. 학생 QR 주소 ----------
    main(t); t.click('#navQr'); t.wait_for_selector('#qrOverlay .qr-url')
    link = t.text_content('#qrOverlay .qr-url').strip(); t.keyboard.press('Escape')
    check('접속 QR 주소: 공간·열쇠·쓰기표', ('?s=' + sid) in link and '#k=' in link and '&w=' in link, link[:70])
    wtok = link.split('&w=')[1]
    check('새 학교는 승인 절차가 켜져 있음', d['spaces/' + sid + '/meta/pub']['approval'] is True and t.is_visible('#navApproval'))
    # ---------- 4. 학생: QR 로 들어와 기록 ----------
    sc, s, serr = ctx(phone=True)
    s.goto(link); s.wait_for_selector('#recordForm', timeout=20000); s.wait_for_timeout(1200)
    check('학생 QR → 로그인 없이 메인', s.text_content('#statStudents').strip() == '3', s.text_content('#statStudents'))
    check('주소창에서 열쇠 지움', '#k=' not in s.url)
    s.select_option('#gradeSelect', '4'); s.wait_for_timeout(150); s.select_option('#classSelect', '1'); s.wait_for_timeout(150)
    opts = s.eval_on_selector_all('#nameSelect option', 'o=>o.map(x=>x.textContent)')
    check('이름 목록이 풀려서 보임', any('김하늘' in o for o in opts) and any('박준우' in o for o in opts), str(opts))
    nm = [o for o in opts if '김하늘' in o][0]
    record(s, '4', '1', nm, '모아뛰기', 120)
    check('승인 켬 → 승인 후 반영 안내', '승인 후' in s.text_content('#formMsg'), s.text_content('#formMsg'))
    check('학생 화면: 승인 대기 1', s.text_content('#statPending').strip() == '1')
    d = dump(); inbox = [k for k in d if k.startswith('spaces/' + sid + '/inbox/')]
    check('기록은 inbox 에 암호문으로 (횟수만 규칙 확인용)', len(inbox) == 1 and d[inbox[0]]['n'] == 120 and d[inbox[0]]['st'] == 'wait' and 'box' in d[inbox[0]])
    check('규칙: 학생은 표를 못 고침', try_js(s, "fb.set('spaces/" + sid + "/book/Students',{box:{}})") == 'permission-denied')
    check('규칙: 학생은 공간 문서(잠금 상자)를 못 읽음', try_js(s, "fb.get('spaces/" + sid + "')") == 'permission-denied')
    check('규칙: 학생은 선생님 전용 설정을 못 읽음', try_js(s, "fb.get('spaces/" + sid + "/priv/secret')") == 'permission-denied')
    ent = "{box:{v:1,iv:'x',ct:'y'},n:%d,src:'%s',st:'%s',w:'%s',t:fb.NOW}"
    check('규칙: 승인 켬일 때 학생이 바로 반영(ok) 못 함', try_js(s, "fb.add('spaces/" + sid + "/inbox'," + ent % (10, 'hand', 'ok', wtok) + ")") == 'permission-denied')
    check('규칙: 쓰기표가 틀리면 못 넣음', try_js(s, "fb.add('spaces/" + sid + "/inbox'," + ent % (10, 'hand', 'wait', 'wrongtoken') + ")") == 'permission-denied')
    check('규칙: 5000 넘는 횟수 못 넣음', try_js(s, "fb.add('spaces/" + sid + "/inbox'," + ent % (6000, 'hand', 'wait', wtok) + ")") == 'permission-denied')
    s.click('#navAdmin'); s.wait_for_selector('#jcG', timeout=10000)
    check('학생이 관리자 메뉴를 누르면 구글 로그인 안내', '선생님만' in s.inner_text('#msg'))
    # ---------- 5. 선생님: 승인 ----------
    main(t)
    check('선생님 메인: 승인 대기 1', t.text_content('#statPending').strip() == '1')
    d = dump()
    check('선생님 화면이 열리면 inbox 를 표에 합침', not [k for k in d if k.startswith('spaces/' + sid + '/inbox/')] and any(k.startswith('spaces/' + sid + '/book/Records_') for k in d))
    t.click('#navApproval'); t.wait_for_selector('#pendingTable tbody tr button[data-action="approve"]', timeout=15000)
    check('기록 승인 화면: 이름이 풀려 보임', '김하늘' in t.inner_text('#pendingTable'))
    t.click('#pendingTable tbody tr:first-child button[data-action="approve"]'); t.wait_for_timeout(1800)
    main(t)
    check('승인 뒤 누적 120', num(t.text_content('#statTotal')).startswith('120'), t.text_content('#statTotal'))
    # ---------- 6. 학생: 다시 열면 (주소에 열쇠 없어도) ----------
    main(s)
    check('학생 다시 열기 → 누적 120', num(s.text_content('#statTotal')).startswith('120'))
    stu_id = t.evaluate("window.JRCLOUD.call('getAllStudentsPublic',[]).then(r=>r[0].id)")
    s.goto(APP + '?s=' + sid + '&page=student&id=' + stu_id); s.wait_for_selector('#authPw')
    s.fill('#authPw', '1234'); s.click('#authForm button[type=submit]'); s.wait_for_timeout(1500)
    check('학생 기록 조회 (1234)', s.locator('#dailyTable tbody tr').count() >= 1, s.text_content('#pageTitle'))
    # ---------- 7. 승인 끄면 바로 반영 · 열어 둔 학생 화면 ----------
    t.click('#navAdmin'); t.wait_for_selector('#adminNav'); t.click('#adminNav button[data-tab="basic"]'); t.wait_for_timeout(400)
    t.uncheck('#approvalOn'); t.click('#saveApprovalBtn'); t.wait_for_timeout(1500)
    check('승인 절차 끔 → 공개 설정에도 반영', dump()['spaces/' + sid + '/meta/pub']['approval'] is False)
    main(s)
    record(s, '4', '1', nm, '이중뛰기', 30)
    check('승인 끔 → 바로 반영 (150)', '바로 반영' in s.text_content('#formMsg') and num(s.text_content('#statTotal')).startswith('150'), s.text_content('#formMsg') + ' / ' + s.text_content('#statTotal'))
    t.check('#approvalOn'); t.click('#saveApprovalBtn'); t.wait_for_timeout(1500)
    record(s, '4', '1', nm, '모아뛰기', 7)
    check('열어 둔 학생 화면도 뒤늦게 켠 승인 절차를 따름', '승인 후' in s.text_content('#formMsg'), s.text_content('#formMsg'))
    # ---------- 8. 관리자 기능 몇 가지 (테마 · 급수) ----------
    t.click('#adminNav button[data-tab="theme"]'); t.wait_for_timeout(800); t.click('#themeSwatches .swatch[title="민트"]'); t.click('#saveThemeBtn'); t.wait_for_timeout(1500)
    check('테마 저장', bool(t.text_content('#themeMsg').strip()), t.text_content('#themeMsg'))
    main(s)
    check('학생 화면에도 테마 색이 따라옴', s.evaluate('getComputedStyle(document.documentElement).getPropertyValue("--coral").trim()').upper() != '#F26A3D')
    t.click('#adminNav button[data-tab="levels"]'); t.wait_for_timeout(1500)
    check('급수 인증 탭에 학생 이름', '김하늘' in t.inner_text('body'))
    # ---------- 9. 공간 관리: 초대 · 두 번째 선생님 ----------
    t.click('#adminNav a.jc-space'); t.wait_for_selector('#jcInvMk')
    check('공간 관리 화면', '학생 접속 QR' in t.inner_text('body') and t.locator('.jc-qr svg').count() == 1)
    t.click('#jcInvMk'); t.wait_for_selector('.jc-code'); code = t.inner_text('.jc-code').strip()
    check('초대 코드 8자', len(code) == 8, code)
    t2c, t2, t2err = ctx({'uid': 'teacher2', 'name': '이선생', 'email': 't2@example.com'})
    t2.goto(APP + '?s=' + sid); t2.wait_for_selector('#jcG'); t2.click('#jcG'); t2.wait_for_selector('#jcOut')
    check('초대 전: 이 공간 선생님 아님', '선생님이 아니에요' in t2.inner_text('body'))
    t2.goto(APP); t2.wait_for_selector('#jcInv'); t2.fill('#jcInv', 'WRONG123'); t2.click('#jcJoin'); t2.wait_for_timeout(500)
    check('틀린 초대 코드', '기한이 지났어요' in t2.inner_text('#jcM'), t2.inner_text('#jcM'))
    t2.fill('#jcInv', code); t2.click('#jcJoin'); t2.wait_for_selector('#jcPw', timeout=10000)
    t2.fill('#jcPw', 'wrong-password'); t2.click('#jcGo'); t2.wait_for_timeout(1800)
    check('틀린 공간 비밀번호', '맞지 않아요' in t2.inner_text('#jcM'))
    t2.fill('#jcPw', PW); t2.click('#jcGo'); t2.wait_for_selector('#recordForm', timeout=20000); t2.wait_for_timeout(1200)
    t2.select_option('#gradeSelect', '4'); t2.wait_for_timeout(150); t2.select_option('#classSelect', '1'); t2.wait_for_timeout(150)
    check('두 번째 선생님: 이름 보임', any('김하늘' in o for o in t2.eval_on_selector_all('#nameSelect option', 'o=>o.map(x=>x.textContent)')))
    check('규칙: 두 번째 선생님은 잠금 상자 못 고침', try_js(t2, "fb.update('spaces/" + sid + "',{crypto:{wrap:1}})") == 'permission-denied')
    t2.goto(APP + '?s=' + sid + '&page=space'); t2.wait_for_selector('#jcForget')
    check('두 번째 선생님은 비밀번호 못 바꿈', '만든 선생님만' in t2.inner_text('body'))
    # ---------- 10. 새 QR → 예전 QR 로는 못 넣음 ----------
    t.click('#jcRot'); t.wait_for_timeout(2500); t.wait_for_selector('#jcCp'); t.click('#jcCp'); t.wait_for_timeout(300)
    link2 = t.evaluate('navigator.clipboard.readText()')
    check('새 QR 주소 (쓰기표가 바뀜)', '&w=' in link2 and link2.split('&w=')[1] != wtok)
    record(s, '4', '1', nm, '모아뛰기', 10)
    check('새 QR 뒤 예전 QR 기기는 기록 못 넣음 (안내)', 'QR이 바뀌었어요' in s.text_content('#formMsg'), s.text_content('#formMsg'))
    s.goto(link2); s.wait_for_selector('#recordForm'); s.wait_for_timeout(1200)
    record(s, '4', '1', nm, '모아뛰기', 10)
    check('새 QR 찍으면 다시 됨', '승인 후' in s.text_content('#formMsg'), s.text_content('#formMsg'))
    # ---------- 11. 학교 이름 · 비밀번호 바꾸기 · 새 기기 · 복구 코드 ----------
    t.fill('#jcNm', '햇살초등학교 4학년'); t.click('#jcNmSave'); t.wait_for_timeout(800)
    check('학교 이름 바꾸기', dump()['spaces/' + sid + '/meta/pub']['name'] == '햇살초등학교 4학년')
    t.fill('#jcCur', PW); t.fill('#jcNp', 'new-pass-9999'); t.click('#jcKeyGo'); t.wait_for_timeout(2500)
    check('비밀번호 바꾸기', '바꿨어요' in t.inner_text('#jcKm'))
    t3c, t3, t3err = ctx({'uid': 'teacher1', 'name': '김선생', 'email': 't1@example.com'})
    t3.goto(APP + '?s=' + sid); t3.wait_for_selector('#jcG'); t3.click('#jcG'); t3.wait_for_selector('#jcPw')
    t3.fill('#jcPw', PW); t3.click('#jcGo'); t3.wait_for_timeout(1800)
    check('새 기기: 예전 비밀번호는 안 됨', '맞지 않아요' in t3.inner_text('#jcM'))
    t3.fill('#jcPw', rc.lower()); t3.click('#jcGo'); t3.wait_for_selector('#recordForm', timeout=20000); t3.wait_for_timeout(1200)
    check('새 기기: 복구 코드로 열림', t3.text_content('#statStudents').strip() == '3')
    # ---------- 12. 전국 현황판 보내기는 선생님 화면에서만 ----------
    check('학생 화면은 전국 현황판에 보내지 않음', s.evaluate("window.JRCLOUD.call('natReportToday',['t']).then(r=>r.skipped)") == 'student')
    # ---------- 화면 ----------
    main(s); s.screenshot(path=HERE + '/cloud_phone.png', full_page=True)
    main(t); t.screenshot(path=HERE + '/cloud_pc.png', full_page=True)
    allerr = terr + serr + t2err + t3err
    check('JS 에러 없음', not allerr, str(allerr[:3]))
print('결과:', '모두 통과' if ok else '실패 있음')
