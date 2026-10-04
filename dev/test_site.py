from playwright.sync_api import sync_playwright
import urllib.parse, json, urllib.request, re
EXEC='http://localhost:8890/exec'
APPU='http://localhost:8890/jumprope/?s='+urllib.parse.quote(EXEC, safe='')
V=__import__('os').path.dirname(__import__('os').path.abspath(__file__))+'/vendor/'
def route(r):
    u=r.request.url
    if 'chart.js' in u: return r.fulfill(path=V+'chart.umd.js', content_type='application/javascript')
    if 'qrcode' in u: return r.fulfill(path=V+'qrcode.js', content_type='application/javascript')
    if 'pretendard' in u: return r.fulfill(body='', content_type='text/css')
    return r.continue_()
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1150,'height':900}, device_scale_factor=1.5)
    ctx.route(re.compile(r'https://cdn\.jsdelivr\.net/.*'), route)
    pg=ctx.new_page(); pg.set_default_timeout(8000); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    # 0) 주소 없이 열기 → 연결 화면
    pg.goto('http://localhost:8890/jumprope/'); pg.wait_for_timeout(600)
    print('연결 화면:', pg.is_visible('#setupUrl'))
    pg.fill('#setupUrl', EXEC); pg.click('#setupGo'); pg.wait_for_timeout(1800)
    print('메인 표시:', pg.is_visible('#recordForm'), '| 학생수:', pg.text_content('#statStudents'), '| 누적:', pg.text_content('#statTotal'))
    print('라벨(승인 꺼짐):', pg.text_content('#statPendingLabel'), '/', pg.text_content('#pendingTitle'), '| 승인버튼 숨김:', not pg.is_visible('#navApproval'))
    print('그래프 데이터셋:', pg.evaluate("Chart.instances ? Object.values(Chart.instances).map(c=>c.data.datasets.map(d=>d.label)) : null"))
    pg.screenshot(path='shots_main.png', full_page=True)
    # 기록 입력 (바로 반영)
    pg.select_option('#gradeSelect','6'); pg.wait_for_timeout(100); pg.select_option('#classSelect','1'); pg.wait_for_timeout(100)
    pg.select_option('#nameSelect', index=2); pg.select_option('#typeSelect','모아뛰기'); pg.fill('#countInput','77')
    pg.click('#recordForm button[type=submit]'); pg.wait_for_timeout(1500)
    print('입력:', pg.text_content('#formMsg'), '| 누적:', pg.text_content('#statTotal'), '| 오늘 목록:', pg.locator('#pendingTable tbody tr').count())
    # QR
    pg.click('#navQr'); pg.wait_for_timeout(300); print('QR URL:', pg.text_content('#qrOverlay .qr-url')[:80]); pg.keyboard.press('Escape')
    # 학생 페이지 (막대 클릭 대신 직접)
    sid = json.loads(urllib.request.urlopen(urllib.request.Request(EXEC, data=json.dumps({'fn':'getAllStudentsPublic','args':[]}).encode(), headers={'Content-Type':'text/plain'})).read())['result'][0]['id']
    pg.goto(APPU+'&page=student&id='+sid); pg.wait_for_timeout(1200)
    pg.fill('#authPw','1234'); pg.click('#authForm button[type=submit]'); pg.wait_for_timeout(1200)
    print('학생 페이지:', pg.text_content('#pageTitle'), '| 행:', pg.locator('#dailyTable tbody tr').count())
    # 관리자
    pg.goto(APPU+'&page=adminLogin&next=admin'); pg.wait_for_timeout(1200)
    pg.fill('#pw','1234'); pg.click('#loginForm button[type=submit]'); pg.wait_for_timeout(2000)
    print('관리자 URL page=admin:', 'page=admin' in pg.url, '| 탭:', pg.eval_on_selector_all('#adminNav button','e=>e.map(x=>x.innerText.replace(/\\n/g," "))'))
    print('NEW 표시:', pg.is_visible('#updatesDot'))
    pg.click('#adminNav button[data-tab="basic"]'); pg.wait_for_timeout(300)
    print('QR 카드 URL:', pg.text_content('#qrUrlText')[:70], '| 즐겨찾기:', pg.text_content('#qrAutoUrl')[-20:])
    pg.check('#approvalOn'); pg.click('#saveApprovalBtn'); pg.wait_for_timeout(1200); print('승인 저장:', pg.text_content('#approvalMsg'), '| 사이드바 승인링크:', pg.is_visible('#navApprovalLink'))
    pg.screenshot(path='shots_admin_basic.png', full_page=True)
    pg.click('#adminNav button[data-tab="updates"]'); pg.wait_for_timeout(800)
    print('내역 정보:', pg.text_content('#versionInfo'))
    print('최신:', pg.text_content('#changelogLatest .cl-head'), '| 이전 접힘 수:', pg.locator('#changelogOlder details').count(), '| NEW 사라짐:', not pg.is_visible('#updatesDot'))
    pg.click('#changelogOlder details:first-of-type summary'); pg.wait_for_timeout(200)
    pg.screenshot(path='shots_updates.png', full_page=True)
    # 학생 관리 / 등록 / 테마 빠르게
    pg.click('#adminNav button[data-tab="register"]'); pg.fill('#bulkText','6\t2\t1\t정다은\n6\t2\t2\t오시우'); pg.wait_for_timeout(300); pg.click('#bulkAddBtn'); pg.wait_for_timeout(1500); print('등록:', pg.text_content('#bulkMsg'))
    pg.click('#adminNav button[data-tab="theme"]'); pg.wait_for_timeout(800); pg.click('#themeSwatches .swatch[title="민트"]'); pg.click('#saveThemeBtn'); pg.wait_for_timeout(1200); print('테마:', pg.text_content('#themeMsg'))
    pg.click('#adminNav button[data-tab="students"]'); pg.wait_for_timeout(500); print('학생 행:', pg.locator('#studentTable tbody tr').count())
    # 메인: 승인 켜진 상태
    pg.goto(APPU); pg.wait_for_timeout(1800)
    print('승인 켬 → 라벨:', pg.text_content('#statPendingLabel'), '| 승인버튼:', pg.is_visible('#navApproval'), '| 테마 --coral:', pg.evaluate('getComputedStyle(document.documentElement).getPropertyValue("--coral").trim()'))
    pg.select_option('#gradeSelect','6'); pg.wait_for_timeout(100); pg.select_option('#classSelect','1'); pg.wait_for_timeout(100)
    pg.select_option('#nameSelect', index=1); pg.select_option('#typeSelect','이중뛰기'); pg.fill('#countInput','33'); pg.click('#recordForm button[type=submit]'); pg.wait_for_timeout(1500)
    print('승인 켬 입력:', pg.text_content('#formMsg'), '| 대기:', pg.text_content('#statPending'))
    # 승인 화면 (세션 10분 내)
    pg.click('#navApproval'); pg.wait_for_timeout(2000)
    print('승인 화면 행:', pg.locator('#pendingTable tbody tr').count())
    pg.click('#pendingTable tbody tr:first-child button[data-action="approve"]'); pg.wait_for_timeout(1500)
    print('승인 후 행:', pg.locator('#pendingTable tbody tr').count())
    # 카메라 토큰 + 판정기 API(GET) 왕복
    tok = json.loads(urllib.request.urlopen(urllib.request.Request(EXEC, data=json.dumps({'fn':'verifyAdminPassword','args':['1234']}).encode(), headers={'Content-Type':'text/plain'})).read())['result']['token']
    def call(fn,*a): return json.loads(urllib.request.urlopen(urllib.request.Request(EXEC, data=json.dumps({'fn':fn,'args':list(a)}).encode(), headers={'Content-Type':'text/plain'})).read())
    call('setCameraSettings', tok, {'enabled':True,'autoApprove':True,'sens':10,'url':'https://musicalpe.github.io/jump-rope-checker/'})
    r=call('issueCameraToken', sid, '모아뛰기')['result']; q=urllib.parse.parse_qs(urllib.parse.urlparse(r['url']).query)
    print('판정기 app=', q['app'][0], 'target=', q['target'][0])
    sv=json.loads(urllib.request.urlopen(EXEC+'?api=rope_x_save&t='+q['t'][0]+'&count=25').read()); print('판정기 저장:', sv)
    print('설치 확인 화면:', '프로그램 열기' in urllib.request.urlopen(EXEC).read().decode())
    print('JS 에러:', errs or '없음')
    b.close()
