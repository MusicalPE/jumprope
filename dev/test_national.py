# 2.1 전국 현황판 시험: (SEED=1 node devserver.js 를 켠 상태에서) python3 test_national.py
from playwright.sync_api import sync_playwright
import urllib.parse, json, urllib.request, re, os
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
    check('이름 칸 처음엔 숨김', not pg.is_visible('#natName'))
    pg.check('#natOn'); pg.check('#natShowName'); pg.fill('#natName', '우리초등학교')
    pg.click('#saveNatBtn'); pg.wait_for_timeout(2500)
    check('저장·보내기 메시지', '보냈어요' in pg.text_content('#natMsg'), pg.text_content('#natMsg'))
    check('미리보기 표시', pg.is_visible('#natPreview table'), pg.text_content('#natPreview .nat-kpis'))
    st=col_state()
    ours=[r for r in st['schools'] if r[1]=='우리초등학교']
    check('수집기에 학교 등록', len(ours)==1, str(ours))
    pid=ours[0][0]
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
    check('저장 직후 현황판 반영 (+500)', after-before==500, f'{before} → {after}')
    # 현황판
    pg.goto(H+'/jumprope/beta/board.html?me='+pid); pg.wait_for_timeout(1500)
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
    pg.goto(H+'/jumprope/beta/hall.html?me='+pid); pg.wait_for_timeout(1500)
    check('기록실 달 카드', pg.locator('.month').count()==1, pg.text_content('.month-head h2'))
    check('학교 1~3등', pg.locator('.podiums .podium').first.locator('.pl').count()==3)
    check('학생 1~3등', pg.locator('.podium.stars .pl').count()>=3)
    pg.click('details.ins summary'); pg.wait_for_timeout(200)
    pg.screenshot(path=OUT+'/nat_hall.png', full_page=True)
    # 휴대폰 폭
    m=b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2); m.route(re.compile(r'https://cdn\.jsdelivr\.net/.*'), route)
    mp=m.new_page(); mp.goto(H+'/jumprope/beta/board.html?me='+pid); mp.wait_for_timeout(1500)
    check('휴대폰 가로 넘침 없음', mp.evaluate('document.documentElement.scrollWidth<=window.innerWidth'))
    mp.screenshot(path=OUT+'/nat_board_phone.png', full_page=True)
    # 참여 끄기 → 기록 삭제
    pg.goto(APPU+'&page=adminLogin&next=admin'); pg.wait_for_timeout(1200)
    if pg.is_visible('#pw'):
        pg.fill('#pw','1234'); pg.click('#loginForm button[type=submit]'); pg.wait_for_timeout(2000)
    pg.click('#adminNav button[data-tab="national"]'); pg.wait_for_timeout(1500)
    pg.uncheck('#natOn'); pg.click('#saveNatBtn'); pg.wait_for_timeout(2000)
    st=col_state()
    check('참여 끄면 수집기에서 삭제', not any(r[0]==pid for r in st['schools']+st['daily']), pg.text_content('#natMsg'))
    check('JS 에러 없음', not errs, str(errs))
    b.close()
print('결과:', '모두 통과' if ok else '실패 있음')
