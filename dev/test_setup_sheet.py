# 시트판 첫 설정 도우미 (2.10.0) 시험
#   새 학교:  node devserver.js            띄운 뒤  python3 test_setup_sheet.py new
#   쓰던 학교: SEED=1 node devserver.js     띄운 뒤  python3 test_setup_sheet.py old
# (CH=club/ 로 클럽판도)
from playwright.sync_api import sync_playwright
import urllib.parse, json, urllib.request, re, sys, os
MODE = sys.argv[1] if len(sys.argv) > 1 else 'new'
CH = os.environ.get('CH', '')
EXEC = 'http://localhost:8890/exec'
APPU = 'http://localhost:8890/jumprope/' + CH + '?s=' + urllib.parse.quote(EXEC, safe='')
V = os.path.dirname(os.path.abspath(__file__)) + '/vendor/'
OUT = os.environ.get('OUT', os.path.dirname(os.path.abspath(__file__)))
fails = []
def check(name, ok, info=''):
    print(('✔ ' if ok else '✘ ') + name + (' ' + str(info) if info and not ok else ''))
    if not ok: fails.append(name)
def call(fn, *args):
    r = json.loads(urllib.request.urlopen(urllib.request.Request(EXEC, data=json.dumps({'fn': fn, 'args': list(args)}).encode(), headers={'Content-Type': 'text/plain'})).read())
    return r.get('result')
def route(r):
    u = r.request.url
    if 'chart.js' in u: return r.fulfill(path=V + 'chart.umd.js', content_type='application/javascript')
    if 'qrcode' in u: return r.fulfill(path=V + 'qrcode.js', content_type='application/javascript')
    if 'pretendard' in u: return r.fulfill(body='', content_type='text/css')
    return r.continue_()
def step_now(pg):
    t = pg.text_content('.jc-steps li.now') if pg.locator('.jc-steps li.now').count() else ''
    return (t or '').strip()
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1150, 'height': 900})
    ctx.route(re.compile(r'https://cdn\.jsdelivr\.net/.*'), route)
    pg = ctx.new_page(); pg.set_default_timeout(8000); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    n_before = len(call('getAllStudentsPublic') or [])
    # 관리자 로그인 1234 → 도우미 1단계
    pg.goto(APPU + '&page=adminLogin&next=admin'); pg.wait_for_timeout(1200)
    pg.fill('#pw', '1234'); pg.click('#loginForm button[type=submit]'); pg.wait_for_timeout(2500)
    check('1234 로그인 → 도우미 비밀번호 단계', 'page=setup' in pg.url and step_now(pg).startswith('1'), pg.url)
    check('비밀번호 단계는 나중에 하기 없음', pg.locator('#jcSkip').count() == 0)
    check('비밀번호 단계는 이전 없음', pg.locator('#jcPrev').count() == 0)
    check('관리자 메뉴로 빠지는 링크 없음', pg.locator('text=도우미 닫고 관리자 메뉴로').count() == 0)
    pg.screenshot(path=OUT + '/setup_sheet_1.png', full_page=True)
    # 잘못 넣기
    pg.fill('#jcPw1', '12'); pg.fill('#jcPw2', '12'); pg.click('#jcNext'); pg.wait_for_timeout(300)
    check('4자 미만 막음', '4자 이상' in (pg.text_content('#jcSm') or ''))
    pg.fill('#jcPw1', '1234'); pg.fill('#jcPw2', '1234'); pg.click('#jcNext'); pg.wait_for_timeout(300)
    check('1234 그대로 막음', '다른 비밀번호' in (pg.text_content('#jcSm') or ''))
    pg.fill('#jcPw1', 'abcd5'); pg.fill('#jcPw2', 'abcd6'); pg.click('#jcNext'); pg.wait_for_timeout(300)
    check('두 칸 다름 막음', '달라요' in (pg.text_content('#jcSm') or ''))
    pg.fill('#jcPw1', 'sun-77'); pg.fill('#jcPw2', 'sun-77'); pg.click('#jcNext'); pg.wait_for_timeout(3000)
    check('새 비밀번호로 바뀜', (call('verifyAdminPassword', 'sun-77') or {}).get('ok') is True)
    check('1234 로는 이제 안 들어감', (call('verifyAdminPassword', '1234') or {}).get('ok') is False)
    if MODE == 'old':
        check('쓰던 학교: 비밀번호만 바꾸고 관리자 메뉴로', 'page=admin' in pg.url and 'page=setup' not in pg.url, pg.url)
        check('관리자 메뉴에 첫 설정 도우미 링크', pg.locator('#adminNav a', has_text='첫 설정 도우미').count() == 1)
        check('학생 수 그대로', len(call('getAllStudentsPublic') or []) == n_before)
        # 다시 로그인 (새 비밀번호) → 도우미 안 뜸
        pg.evaluate("localStorage.removeItem('jumpropeAdminSession')")
        pg.goto(APPU + '&page=adminLogin&next=admin'); pg.wait_for_timeout(1200)
        pg.fill('#pw', 'sun-77'); pg.click('#loginForm button[type=submit]'); pg.wait_for_timeout(2500)
        check('새 비밀번호 로그인 → 바로 관리자 메뉴', 'page=admin' in pg.url and 'page=setup' not in pg.url, pg.url)
        # 링크로 도우미 열기 → 1단계는 '이미 바꿨어요'
        pg.locator('#adminNav a', has_text='첫 설정 도우미').click(); pg.wait_for_timeout(2500)
        check('링크로 연 도우미 열림', 'page=setup' in pg.url and pg.locator('.jc-steps').count() == 1, pg.url)
        pg.goto(pg.url.split('&step=')[0] + '&step=1'); pg.wait_for_timeout(2000)
        check('이미 바꾼 학교: 1단계는 안내만', '이미 바꿨어요' in (pg.text_content('.card') or ''))
    else:
        check('새 학교: 2단계 학생 등록으로 이어짐', step_now(pg).startswith('2'), step_now(pg))
        pg.fill('#jcSt', '6\t1\t1\t김하늘\n6\t1\t2\t박준우\n6 1 3 한소율\n잘못된 줄'); pg.wait_for_timeout(200)
        check('붙여 넣기 미리 세기', '3명 등록 예정' in (pg.text_content('#jcCnt') or '') and '1줄 제외' in (pg.text_content('#jcCnt') or ''), pg.text_content('#jcCnt'))
        pg.click('#jcNext'); pg.wait_for_timeout(2500)
        check('학생 3명 등록', len(call('getAllStudentsPublic') or []) == n_before + 3)
        check('3단계 기본 설정', step_now(pg).startswith('3'), step_now(pg))
        check('승인 절차 권장값 체크', pg.is_checked('#jcAp'))
        pg.fill('#jcGoal', '150'); pg.click('#jcNext'); pg.wait_for_timeout(3000)
        st = call('getAppSettingsPublic') or {}
        check('승인 절차 켜짐 · 목표 150', st.get('approvalOn') is True and st.get('dailyGoal') == 150, st)
        check('4단계 국토 대장정', step_now(pg).startswith('4'), step_now(pg))
        check('국토 대장정 미리보기', pg.locator('#jcJp .jr-scene').count() == 1)
        pg.select_option('#jcJs', '전주'); pg.click('#jcNext'); pg.wait_for_timeout(2500)
        tok = call('verifyAdminPassword', 'sun-77')['token']
        ex = call('getExtraSettingsAdmin', tok) or {}
        check('국토 대장정 저장 (전주 출발)', (ex.get('journey') or {}).get('start') == '전주' and (ex.get('journey') or {}).get('on') is True, ex.get('journey'))
        check('5단계 학생 QR', step_now(pg).startswith('5') and pg.locator('.jc-qr svg').count() == 1, step_now(pg))
        check('QR 단계에 반 안에서만 안내', '반 밖' in (pg.text_content('.card') or ''))
        pg.screenshot(path=OUT + '/setup_sheet_5.png', full_page=True)
        pg.click('#jcNext'); pg.wait_for_timeout(2500)
        check('6단계 전국 현황판', step_now(pg).startswith('6'), step_now(pg))
        check('참여 미리 체크', pg.is_checked('#jcNat'))
        pg.click('#jcNext'); pg.wait_for_timeout(300)
        check('학교 이름 없으면 막음', any(w in (pg.text_content('#jcSm') or '') for w in ['학교 이름', '클럽 이름']), pg.text_content('#jcSm'))
        pg.fill('#jcNm', '수원 햇살초등학교'); pg.click('#jcNext'); pg.wait_for_timeout(300)
        check('담당 교사 없으면 막음', any(w in (pg.text_content('#jcSm') or '') for w in ['담당 교사', '담당 지도자']), pg.text_content('#jcSm'))
        pg.fill('#jcTn', '김선생'); pg.click('#jcNext'); pg.wait_for_timeout(5000)
        ex = call('getExtraSettingsAdmin', tok) or {}
        nat = ex.get('nat') or {}
        check('전국 현황판 참여 저장', nat.get('on') is True and bool(nat.get('key')) and nat.get('name') == '수원햇살초등학교', nat)
        check('7단계 끝', step_now(pg).startswith('7'), step_now(pg))
        txt = pg.text_content('.card') or ''
        check('요약: 학생 3명 · 참여 중 · 전주 출발', '3명' in txt and '참여 중' in txt and '전주 출발' in txt, txt[:200])
        pg.screenshot(path=OUT + '/setup_sheet_7.png', full_page=True)
        pg.wait_for_timeout(800)
        check('도우미 끝 표시 저장', (call('getExtraSettingsAdmin', tok) or {}).get('setup') == 'done')
        # 다시 로그인 → 도우미 안 뜸
        pg.evaluate("localStorage.removeItem('jumpropeAdminSession')")
        pg.goto(APPU + '&page=adminLogin&next=admin'); pg.wait_for_timeout(1200)
        pg.fill('#pw', 'sun-77'); pg.click('#loginForm button[type=submit]'); pg.wait_for_timeout(2500)
        check('끝낸 뒤 로그인 → 관리자 메뉴', 'page=admin' in pg.url and 'page=setup' not in pg.url, pg.url)
        # 메인 화면 기록 입력이 그대로 되는지
        pg.goto(APPU); pg.wait_for_timeout(2500)
        check('메인 화면 국토 대장정 전주 출발', '전주 출발' in (pg.text_content('.jr-card') or ''))
    # 토큰 없이 열면 로그인으로
    pg.evaluate("localStorage.removeItem('jumpropeAdminSession')")
    pg.goto(APPU + '&page=setup'); pg.wait_for_timeout(2000)
    check('토큰 없이 도우미 → 로그인 화면', 'page=adminLogin' in pg.url and pg.is_visible('#pw'), pg.url)
    check('JS 오류 없음', not errs, errs)
    b.close()
print('결과:', '모두 통과' if not fails else '실패 있음 ' + str(fails))
