# 2.2 베타 시험 (급수 인증 · 인증서 · 우리 반 여행 · 학년별 순위 · 지구 한 바퀴)
# SEED=1 SHELL_PATH=../beta/Shell.gs node devserver.js 를 새로 켠 뒤: python3 test_v22.py
from playwright.sync_api import sync_playwright
import urllib.parse, json, urllib.request, re, os, datetime
H='http://localhost:8890'
EXEC=H+'/exec'
APPU=H+'/jumprope/beta/?s='+urllib.parse.quote(EXEC, safe='')
V=os.path.dirname(os.path.abspath(__file__))+'/vendor/'
OUT=os.environ.get('SHOTS', '.')
def route(r):
    u=r.request.url
    if 'chart.js' in u: return r.fulfill(path=V+'chart.umd.js', content_type='application/javascript')
    if 'qrcode' in u: return r.fulfill(path=V+'qrcode.js', content_type='application/javascript')
    if 'pretendard' in u: return r.fulfill(body='', content_type='text/css')
    return r.continue_()
def get(u): return json.loads(urllib.request.urlopen(u).read())
def rpc(fn, *args):
    j=json.loads(urllib.request.urlopen(urllib.request.Request(EXEC, data=json.dumps({'fn':fn,'args':list(args)}).encode(), headers={'Content-Type':'text/plain'})).read())
    if not j['ok']: raise Exception(j['error'])
    return j['result']
urllib.request.urlopen(urllib.request.Request(H+'/__col/seed', data=b'{}', method='POST')).read()
ok=True
def check(label, cond, extra=''):
    global ok
    ok = ok and bool(cond)
    print(('✔' if cond else '✘'), label, extra)
# 지난 달 기록 하나 (승인 절차 꺼진 기존 학교라 바로 승인) → 기록실 상장 시험용
first=datetime.date.today().replace(day=1); prev=(first-datetime.timedelta(days=1)).replace(day=10).isoformat()
studs=rpc('getAllStudentsPublic'); sid=studs[0]['id']
rpc('addRecord', sid, prev, 900, '10:00', '모아뛰기'); rpc('addRecord', studs[1]['id'], prev, 400, '10:00', '모아뛰기')
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1150,'height':900}, device_scale_factor=1.5)
    ctx.route(re.compile(r'https://cdn\.jsdelivr\.net/.*'), route)
    pg=ctx.new_page(); pg.set_default_timeout(8000); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.goto(APPU+'&page=adminLogin&next=admin'); pg.wait_for_timeout(1200)
    pg.fill('#pw','1234'); pg.click('#loginForm button[type=submit]'); pg.wait_for_timeout(2000)
    # ── 급수 인증
    pg.click('#adminNav button[data-tab="levels"]'); pg.wait_for_timeout(800)
    check('껍데기 3판 안내 숨김', not pg.is_visible('#lvNoShell'))
    pg.select_option('#lvClass','6|1'); pg.wait_for_timeout(300)
    check('급수 기본 = 흰 줄넘기, 항목 5개', pg.input_value('#lvLevel')=='0' and pg.locator('#lvGrid th.it').count()==5, pg.input_value('#lvLevel'))
    first_row=pg.locator('#lvGrid tbody tr').first
    for c in first_row.locator('input.lvCk').all(): c.check()
    pg.locator('#lvGrid tbody tr').nth(1).locator('input.lvCk').first.check()
    pg.click('#lvSave'); pg.wait_for_timeout(1500)
    msg=pg.text_content('#lvMsg')
    check('저장 → 급수 오른 학생 안내', '급수가 오른 학생' in msg and '흰 줄넘기' in msg, msg)
    lv=get(H+'/__state')['levels']
    check('Levels 시트 6줄 (5+1)', len(lv)==1+6, str(len(lv)))
    pg.screenshot(path=OUT+'/v22_levels.png', full_page=True)
    # 앞 급수를 못 딴 학생은 잠금: 노랑 → 김하늘(흰 땀) 열림, 박준우(없음) 잠김 / 초록 → 둘 다 잠김
    pg.select_option('#lvLevel','1'); pg.wait_for_timeout(300)
    r0=pg.locator('#lvGrid tbody tr').nth(0); r1=pg.locator('#lvGrid tbody tr').nth(1)
    check('노랑: 흰 딴 학생 열림, 못 딴 학생 잠김', not r0.locator('input.lvCk').first.is_disabled() and r1.locator('input.lvCk').first.is_disabled() and 'lv-locked' in (r1.get_attribute('class') or ''))
    pg.locator('#lvGrid th.it input.lvAll').first.check(); pg.wait_for_timeout(100)
    check('모두 체크는 잠긴 학생 건너뜀', r0.locator('input.lvCk').first.is_checked() and not r1.locator('input.lvCk').first.is_checked())
    pg.select_option('#lvLevel','2'); pg.wait_for_timeout(300)
    check('초록: 노랑 못 딴 학생 모두 잠김', pg.locator('#lvGrid input.lvCk:not([disabled])').count()==0 and '를 아직 못 딴' in pg.text_content('#lvGrid'))
    pg.select_option('#lvLevel','0'); pg.wait_for_timeout(300)
    # 체크 해제 → 줄 삭제
    pg.locator('#lvGrid tbody tr').nth(1).locator('input.lvCk').first.uncheck(); pg.click('#lvSave'); pg.wait_for_timeout(1200)
    check('체크 풀면 삭제', len(get(H+'/__state')['levels'])==1+5)
    # 급수표 고치기 → 되돌리기
    pg.fill('#lvTableText', '흰 #FFFFFF\n모아 뛰기, 10\n\n노랑 #FFD60A\n이중 뛰기, 5'); pg.click('#lvTableSave'); pg.wait_for_timeout(1000)
    check('급수표 저장', '2개 급수' in pg.text_content('#lvTableMsg') and pg.locator('#lvLevel option').count()==2, pg.text_content('#lvTableMsg'))
    pg.click('#lvTableReset'); pg.wait_for_timeout(1000)
    check('협회 기준표로 되돌리기', pg.locator('#lvLevel option').count()==9)
    # ── 우리 반 여행
    pg.click('#adminNav button[data-tab="journey"]'); pg.wait_for_timeout(800)
    pg.check('#jrOn'); pg.select_option('#jrCourse','korea'); pg.click('#jrSave'); pg.wait_for_timeout(1000)
    check('여행 저장', '메인 화면에 보여요' in pg.text_content('#jrMsg') and '국토 한 바퀴' in pg.text_content('#jrPreview'), pg.text_content('#jrMsg'))
    # ── 전국 현황판 참여 (지난 달 기록까지 보내기)
    pg.click('#adminNav button[data-tab="national"]'); pg.wait_for_timeout(800)
    pg.check('#natOn'); pg.fill('#natName','우리초등학교'); pg.fill('#natTeacher','홍길동'); pg.check('#natShowName'); pg.click('#saveNatBtn'); pg.wait_for_timeout(2500)
    st=get(H+'/__col/state'); ours=[r for r in st['schools'] if r[1]=='우리초등학교']
    check('학년별 등록 수 저장', len(ours)==1 and json.loads(ours[0][10] or '{}').get('6')==3, str(ours[0][10:] if ours else ours))
    # ── 인증서
    pg.click('#adminNav button[data-tab="certs"]'); pg.wait_for_timeout(800)
    pg.click('#certMake'); pg.wait_for_timeout(1200)
    check('급수 인증서 1장', pg.locator('#certPreview .cert').count()==1 and '흰 줄넘기' in pg.text_content('#certPreview'), pg.text_content('#certMsg'))
    check('인증서에 실명·학교·선생님', '김하늘' in pg.text_content('#certPreview .cert') and '우리초등학교' in pg.text_content('#certPreview') and '홍길동' in pg.text_content('#certPreview'))
    check('직함 기본 담임', '담임 홍길동' in pg.text_content('#certPreview'))
    pg.select_option('#certRole','체육 교사'); pg.wait_for_timeout(800)
    check('직함 체육 교사', '체육 교사 홍길동' in pg.text_content('#certPreview'))
    pg.select_option('#certRole','__custom'); pg.fill('#certRoleCustom','교장'); pg.press('#certRoleCustom','Tab'); pg.wait_for_timeout(800)
    check('직함 직접 입력', pg.is_visible('#certRoleCustom') and '교장 홍길동' in pg.text_content('#certPreview'))
    pg.screenshot(path=OUT+'/v22_cert_level.png', full_page=True)
    pg.select_option('#certKind','nat'); pg.click('#certMake'); pg.wait_for_timeout(2500)
    txt=pg.text_content('#certPreview'); n_c=pg.locator('#certPreview .cert').count()
    check('전국 상장: 우리 학교 1~3등 실명', n_c>=2 and '김하늘' in txt and '우리초등학교 1위' in txt, pg.text_content('#certMsg'))
    pg.screenshot(path=OUT+'/v22_cert_nat.png', full_page=True)
    pg.evaluate("document.body.classList.add('printing-cert')"); pg.emulate_media(media='print')
    pg.pdf(path=OUT+'/v22_certs.pdf', landscape=True, prefer_css_page_size=True, print_background=True)
    pg.emulate_media(media='screen'); pg.evaluate("document.body.classList.remove('printing-cert')")
    # ── 메인: 급수 · 여행
    pg.goto(APPU); pg.wait_for_timeout(2500)
    check('메인 우리 반 급수', pg.is_visible('#levelCard') and '흰' in pg.text_content('#levelDist'), pg.text_content('#levelDist'))
    pg.click('#levelDist button.lv-pick'); pg.wait_for_timeout(200)
    check('급수 누르면 명단', pg.is_visible('#levelWho') and '김하늘' in pg.text_content('#levelWho'), pg.text_content('#levelWho'))
    check('아직 없음은 명단 안 펼침', pg.locator('#levelDist button.lv-pick').count()==1 and pg.locator('#levelDist .lv-pick.none').count()==1)
    pg.click('#levelDist button.lv-pick'); pg.wait_for_timeout(200)
    check('다시 누르면 접힘', not pg.is_visible('#levelWho'))
    check('메인 여행 막대', pg.is_visible('#journeyCard') and '국토 한 바퀴' in pg.text_content('#journeyCard'), pg.text_content('#journeyCard')[:80])
    pg.screenshot(path=OUT+'/v22_main.png', full_page=True)
    pg.goto(APPU+'&page=adminLogin&next=admin'); pg.wait_for_timeout(1200)
    if pg.is_visible('#pw'):
        pg.fill('#pw','1234'); pg.click('#loginForm button[type=submit]'); pg.wait_for_timeout(2000)
    pg.click('#adminNav button[data-tab="levels"]'); pg.wait_for_timeout(800)
    check('메인 표시 기본 켜짐', pg.is_checked('#lvMain'))
    pg.uncheck('#lvMain'); pg.wait_for_timeout(1000)
    pg.goto(APPU); pg.wait_for_timeout(2500)
    check('끄면 메인에 우리 반 급수 숨김', not pg.is_visible('#levelCard'))
    # ── 학생 화면: 나의 급수
    pg.goto(APPU+'&page=student&id='+sid); pg.wait_for_timeout(1000)
    pg.fill('#authPw','1234'); pg.click('#authForm button[type=submit]'); pg.wait_for_timeout(1500)
    check('학생 화면 나의 급수 + 다음 도전 노랑', pg.is_visible('#myLevelCard') and '흰 줄넘기' in pg.text_content('#myLevel') and '노랑 줄넘기' in pg.text_content('#myLevel'), pg.text_content('#myLevel')[:90])
    # ── 승인: 누르는 즉시 반영 + 모두 승인
    for c_ in (11, 12, 13, 14): rpc('addRecord', studs[1]['id'], datetime.date.today().isoformat(), c_, '10:00', '모아뛰기')
    pg.goto(APPU+'&page=adminLogin&next=approval'); pg.wait_for_timeout(1200)
    if pg.is_visible('#pw'):
        pg.fill('#pw','1234'); pg.click('#loginForm button[type=submit]'); pg.wait_for_timeout(2500)
    check('승인 대기 4건 + 모두 승인 버튼', pg.locator('#pendingTable tbody tr').count()==4 and pg.is_visible('#approveAllBtn'), pg.text_content('#pendingCount'))
    pg.click('#pendingTable tbody tr:first-child button[data-action="approve"]'); pg.wait_for_timeout(150)
    check('누르는 즉시 승인됨 표시', '승인됨' in pg.text_content('#pendingTable tbody tr:first-child') and '(3건)' in pg.text_content('#pendingCount'), pg.text_content('#pendingCount'))
    pg.click('#approveAllBtn'); pg.wait_for_timeout(2500)
    recs=get(H+'/__state')['records']
    check('모두 승인 → 서버 반영', '3건 승인했어요' in pg.text_content('#approveMsg') and not [r for r in recs[1:] if r[5]=='pending'] and pg.is_visible('#emptyMsg'), pg.text_content('#approveMsg'))
    # ── 현황판: 학년 · 지구
    pg.goto(H+'/jumprope/beta/board.html'); pg.wait_for_timeout(1800)
    check('지구 한 바퀴 카드', pg.locator('.earth').count()==1 and 'km' in pg.text_content('.earth'), pg.text_content('.earth')[:90])
    gopts=pg.eval_on_selector_all('#gradeSel option','e=>e.map(x=>x.value)')
    check('학년 고르기', '6' in gopts and '4' in gopts, str(gopts))
    pg.select_option('#gradeSel','6'); pg.wait_for_timeout(1500)
    subs=pg.eval_on_selector_all('.card:last-of-type table tbody td .sub','e=>e.map(x=>x.textContent)')
    check('6학년만 보기', '6학년만' in pg.text_content('#heroSub') and subs and all(t=='6학년' for t in subs), str(subs[:8]))
    pg.screenshot(path=OUT+'/v22_board.png', full_page=True)
    bg=get(H+'/collector?api=board&grade=6')['result']
    me=[x for x in bg['schools'] if x['label']=='우리초등학교']
    check('수집기 6학년: 등록 3명 기준, 5명 미만이라 평균 순위 제외', me and me[0]['registered']==3 and me[0]['rank']['avg'] is None and me[0]['rank']['total'], str(me[0]['rank'] if me else bg['schools'][:1]))
    old=get(H+'/collector?api=board')['result']
    check('예전 응답 유지(학년 없이)', old['grade']=='' and len(old['schools'])>=4)
    check('JS 에러 없음', not errs, str(errs))
    b.close()
print('결과:', '모두 통과' if ok else '실패 있음')
