# 2.1 전국 현황판 시험: (SEED=1 node devserver.js 를 켠 상태에서) python3 test_national.py
from playwright.sync_api import sync_playwright
import urllib.parse, json, urllib.request, re, os
H='http://localhost:8890'
CH=os.environ.get('CH', 'beta/')   # 정식판 시험: CH= python3 test_national.py
EXEC=H+'/exec'
APPU=H+'/jumprope/'+CH+'?s='+urllib.parse.quote(EXEC, safe='')
V=os.path.dirname(os.path.abspath(__file__))+'/vendor/'
OUT=os.environ.get('SHOTS', '.')
def route(r):
    u=r.request.url
    if 'chart.js' in u: return r.fulfill(path=V+'chart.umd.js', content_type='application/javascript')
    if 'qrcode' in u: return r.fulfill(path=V+'qrcode.js', content_type='application/javascript')
    if 'pretendard' in u: return r.fulfill(body='', content_type='text/css')
    return r.continue_()
def get(u): return json.loads(urllib.request.urlopen(u).read())
def col_state(): return get(H+'/__col/state')
urllib.request.urlopen(urllib.request.Request(H+'/__col/seed', data=b'{}', method='POST')).read()
ok=True
def check(label, cond, extra=''):
    global ok
    ok = ok and bool(cond)
    print(('✔' if cond else '✘'), label, extra)
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1150,'height':900}, device_scale_factor=1.5)
    ctx.route(re.compile(r'https://cdn\.jsdelivr\.net/.*'), route)
    pg=ctx.new_page(); pg.set_default_timeout(8000); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.goto(APPU); pg.wait_for_timeout(1800)
    check('참여 전: 현황판 버튼 숨김', not pg.is_visible('#navBoard'))
    # 관리자 → 전국 현황판 탭 → 참여 켜기
    pg.goto(APPU+'&page=adminLogin&next=admin'); pg.wait_for_timeout(1200)
    pg.fill('#pw','1234'); pg.click('#loginForm button[type=submit]'); pg.wait_for_timeout(2000)
    pg.click('#adminNav button[data-tab="national"]'); pg.wait_for_timeout(500)
    pg.check('#natOn'); pg.click('#saveNatBtn'); pg.wait_for_timeout(300)
    check('학교 이름 없으면 저장 막힘', '학교 이름' in pg.text_content('#natMsg'), pg.text_content('#natMsg'))
    pg.fill('#natName', '우리초등학교'); pg.click('#saveNatBtn'); pg.wait_for_timeout(300)
    check('담당 교사 없으면 저장 막힘', '담당 교사' in pg.text_content('#natMsg'), pg.text_content('#natMsg'))
    pg.fill('#natTeacher', '홍길동'); pg.fill('#natContact', 'hong@school.kr'); pg.check('#natShowName')
    pg.click('#saveNatBtn'); pg.wait_for_timeout(2500)
    check('저장·보내기 메시지', '보냈어요' in pg.text_content('#natMsg'), pg.text_content('#natMsg'))
    check('참여 켜면 승인 절차도 켜짐', get(H+'/__state')['props'].get('APPROVAL_ON')=='1' and '승인 절차를 함께 켰어요' in pg.text_content('#natMsg'), pg.text_content('#natMsg'))
    check('미리보기 표시', pg.is_visible('#natPreview table'), pg.text_content('#natPreview .nat-kpis'))
    st=col_state()
    ours=[r for r in st['schools'] if r[1]=='우리초등학교']
    check('수집기에 학교 등록', len(ours)==1, str(ours))
    pid=ours[0][0]
    check('운영자 칸: 학교·교사·연락처', ours[0][7:10]==['우리초등학교','홍길동','hong@school.kr'], str(ours[0][7:10]))
    b_=get(H+'/collector?api=board')
    check('현황판 응답에 교사·연락처 없음', '홍길동' not in json.dumps(b_, ensure_ascii=False) and 'hong@' not in json.dumps(b_))
    rows=[r for r in st['daily'] if r[0]==pid]
    names=[s[1] for r in rows for s in json.loads(r[5])]
    check('이름 가림만 전송', all('*' in n for n in names) and '김하늘' not in json.dumps(st, ensure_ascii=False), str(sorted(set(names))))
    pg.screenshot(path=OUT+'/nat_admin.png', full_page=True)
    # 메인: 버튼 + 기록 저장 → 오늘 집계 즉시 전송
    pg.goto(APPU); pg.wait_for_timeout(2000)
    check('참여 후: 현황판 버튼', pg.is_visible('#navBoard'), pg.get_attribute('#navBoard','href'))
    before=sum(r[2] for r in col_state()['daily'] if r[0]==pid)
    pg.select_option('#gradeSelect','6'); pg.wait_for_timeout(100); pg.select_option('#classSelect','1'); pg.wait_for_timeout(100)
    pg.select_option('#nameSelect', index=1); pg.select_option('#typeSelect','모아뛰기'); pg.fill('#countInput','500')
    pg.click('#recordForm button[type=submit]'); pg.wait_for_timeout(2500)
    after=sum(r[2] for r in col_state()['daily'] if r[0]==pid)
    check('승인 전 기록은 현황판에 안 감 (+0)', after==before, f'{before} → {after}')
    pg.click('#navApproval'); pg.wait_for_timeout(2000)
    if pg.is_visible('#pw'):
        pg.fill('#pw','1234'); pg.click('#loginForm button[type=submit]'); pg.wait_for_timeout(2000)
    pg.click('#pendingTable tbody tr:first-child button[data-action="approve"]'); pg.wait_for_timeout(5000)
    after=sum(r[2] for r in col_state()['daily'] if r[0]==pid)
    check('승인하면 현황판 반영 (+500)', after-before==500, f'{before} → {after}')
    # 현황판
    pg.goto(H+'/jumprope/'+CH+'board.html?me='+pid); pg.wait_for_timeout(1500)
    rows=pg.locator('tr.school').count()
    check('현황판 학교 행', rows==4, str(rows))
    check('우리 학교 강조', pg.locator('tr.school.me').count()==1)
    check('우리 학교 학생 순위 펼침', pg.locator('tr.detail table.mini tbody tr').count()>0)
    check('익명 학교 표시', pg.locator('tr.school .anon').count()==1)
    pg.screenshot(path=OUT+'/nat_board.png', full_page=True)
    pg.click('#sortSeg button[data-k="avg"]'); pg.wait_for_timeout(200)
    check('1인당 평균 정렬 첫 줄 순위 1', pg.text_content('tr.school:first-child .rank').strip()=='1')
    opts=pg.eval_on_selector_all('#monthSel option','e=>e.map(x=>x.value)')
    check('달 선택지 2개 이상', len(opts)>=2, str(opts))
    pg.select_option('#monthSel', opts[1]); pg.wait_for_timeout(1200)
    check('지난 달 보기', '최종 기록' in pg.text_content('#heroSub'), pg.text_content('#heroSub'))
    # 기록실
    pg.goto(H+'/jumprope/'+CH+'hall.html?me='+pid); pg.wait_for_timeout(1500)
    check('기록실 달 카드', pg.locator('.month').count()==1, pg.text_content('.month-head h2'))
    check('학교 1~3등', pg.locator('.podiums .podium').first.locator('.pl').count()==3)
    check('학생 1~3등', pg.locator('.podium.stars .pl').count()>=3)
    pg.click('details.ins summary'); pg.wait_for_timeout(200)
    pg.screenshot(path=OUT+'/nat_hall.png', full_page=True)
    hopts=pg.eval_on_selector_all('#monthSel option','e=>e.map(x=>x.value)')
    check('기록실 달 고르기 최근 12개월', len(hopts)==12 and hopts==sorted(hopts, reverse=True), str(hopts))
    pg.select_option('#monthSel', hopts[5]); pg.wait_for_timeout(1200)
    h2=pg.text_content('.month-head h2')
    check('다른 달 고르면 그 달만 표시', pg.locator('.month').count()==1 and h2==f'{int(hopts[5][:4])}년 {int(hopts[5][5:])}월', h2)
    check('주소에 달 남김', 'month='+hopts[5] in pg.url, pg.url)
    pg.reload(); pg.wait_for_timeout(1500)
    check('새로고침해도 고른 달 유지', pg.input_value('#monthSel')==hopts[5])
    hall=get(H+'/collector?api=hall')['result']
    check('수집기 기록실 응답: 목록 12개 + 한 달 상세', len(hall['list'])==12 and hall['month']['month']==hall['list'][0], str(hall['list'][:3]))
    # 휴대폰 폭
    m=b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2); m.route(re.compile(r'https://cdn\.jsdelivr\.net/.*'), route)
    mp=m.new_page(); mp.goto(H+'/jumprope/'+CH+'board.html?me='+pid); mp.wait_for_timeout(1500)
    check('휴대폰 가로 넘침 없음', mp.evaluate('document.documentElement.scrollWidth<=window.innerWidth'))
    mp.screenshot(path=OUT+'/nat_board_phone.png', full_page=True)
    # 학생 화면 자동 보고에는 교사 정보가 안 실림 (관리자 기기 기억값 지우고 새 맥락)
    sc=get(H+'/__state')
    check('학교 시트 설정에 교사 정보 없음', '홍길동' not in json.dumps(sc['props'], ensure_ascii=False))
    # 참여 끄기 → 기록 삭제
    pg.goto(APPU+'&page=adminLogin&next=admin'); pg.wait_for_timeout(1200)
    if pg.is_visible('#pw'):
        pg.fill('#pw','1234'); pg.click('#loginForm button[type=submit]'); pg.wait_for_timeout(2000)
    pg.click('#adminNav button[data-tab="basic"]'); pg.wait_for_timeout(800)
    pg.uncheck('#approvalOn'); pg.click('#saveApprovalBtn'); pg.wait_for_timeout(2500)
    st=col_state()
    check('승인 절차 끄면 참여도 꺼지고 수집기에서 삭제', not any(r[0]==pid for r in st['schools']+st['daily']) and '참여도 껐' in pg.text_content('#approvalMsg'), pg.text_content('#approvalMsg'))
    ex=json.loads(get(H+'/__state')['props'].get('EXTRA_SETTINGS','{}'))
    check('참여 설정 꺼짐', ex.get('nat',{}).get('on') is False, str(ex.get('nat')))
    # 다시 참여 → 승인 절차 다시 켜짐 → 참여 끄기
    pg.click('#adminNav button[data-tab="national"]'); pg.wait_for_timeout(800)
    pg.check('#natOn'); pg.click('#saveNatBtn'); pg.wait_for_timeout(2500)
    check('다시 참여하면 승인 절차 다시 켜짐', get(H+'/__state')['props'].get('APPROVAL_ON')=='1' and any(r[0]==pid for r in col_state()['schools']), pg.text_content('#natMsg'))
    pg.uncheck('#natOn'); pg.click('#saveNatBtn'); pg.wait_for_timeout(2000)
    st=col_state()
    check('참여 끄면 수집기에서 삭제', not any(r[0]==pid for r in st['schools']+st['daily']), pg.text_content('#natMsg'))
    check('JS 에러 없음', not errs, str(errs))
    b.close()
print('결과:', '모두 통과' if ok else '실패 있음')
