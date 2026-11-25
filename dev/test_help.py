# 사용 안내 창 시험: SEED=1 node devserver.js 띄운 뒤 python3 test_help.py  (CH=club/ · CH=beta/ 도)
from playwright.sync_api import sync_playwright
import urllib.parse, re, os, json, urllib.request
EXEC='http://localhost:8890/exec'; CH=os.environ.get('CH','')
ROOT='http://localhost:8890/jumprope/'+CH
BASE=ROOT+'?s='+urllib.parse.quote(EXEC, safe='')
V=os.path.dirname(os.path.abspath(__file__))+'/vendor/'
N=9   # 안내 항목 수
def route(r):
    u=r.request.url
    if 'chart.js' in u: return r.fulfill(path=V+'chart.umd.js', content_type='application/javascript')
    if 'qrcode' in u: return r.fulfill(path=V+'qrcode.js', content_type='application/javascript')
    return r.fulfill(body='', content_type='text/css')
tok=json.loads(urllib.request.urlopen(urllib.request.Request(EXEC, data=json.dumps({'fn':'verifyAdminPassword','args':['1234']}).encode())).read())['result']['token']
SID=json.loads(urllib.request.urlopen(urllib.request.Request(EXEC, data=json.dumps({'fn':'getAllStudentsPublic','args':[]}).encode())).read())['result'][0]['id']
ok=True
def check(l,c,x=''):
    global ok; ok=ok and bool(c); print(('✔' if c else '✘'),l,x)
PAGES=[('메인', BASE, '.topbar-nav'), ('학생 기록 조회', BASE+'&page=student&id='+str(SID), '.jrhelp-row'), ('관리자 로그인', BASE+'&page=adminLogin', '.jrhelp-row'),
       ('기록 승인', BASE+'&page=approval&token='+tok, '.jrhelp-row'), ('관리자 메뉴', BASE+'&page=admin&token='+tok, '#adminNav')]
with sync_playwright() as p:
    b=p.chromium.launch()
    for name,kw in (('컴퓨터',{}),('휴대폰',{'user_agent':'Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36','viewport':{'width':390,'height':800}})):
        ctx=b.new_context(**kw); ctx.route(re.compile(r'https://(cdn\.jsdelivr\.net|fonts\.).*'), route)
        pg=ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        for pn,url,where in PAGES:
            pg.goto(url); pg.wait_for_timeout(1800)
            btn=pg.locator(where+' .jrhelp-btn')
            check(name+' '+pn+': 단추 1개', btn.count()==1 and pg.locator('.jrhelp-btn').count()==1)
            if pn!='관리자 메뉴':
                end=pg.evaluate("(w)=>{const c=document.querySelector(w);const k=[...c.children].filter(e=>getComputedStyle(e).display!=='none');const b=k[k.length-1];if(!b||!b.classList.contains('jrhelp-btn'))return false;const r=b.getBoundingClientRect(),o=document.querySelector('.container').getBoundingClientRect();return o.right-r.right<40;}", where)
                check(name+' '+pn+': 줄 맨 끝 · 오른쪽', end)
            else:
                last=pg.evaluate("()=>{const k=[...document.getElementById('adminNav').children];return k[k.length-1].classList.contains('jrhelp-btn');}")
                check(name+' 관리자 메뉴: 왼쪽 메뉴 맨 아래', last)
            bb=btn.bounding_box(); vis=btn.is_visible()
            if pn=='관리자 메뉴' and kw:   # 휴대폰에서는 가로 메뉴 끝 → 밀어서 보기
                btn.scroll_into_view_if_needed(); bb=btn.bounding_box(); vis=btn.is_visible()
            check(name+' '+pn+': 보이고 높이 44px 이상', vis and bb and bb['height']>=44, str(bb and round(bb['height'])))
            st=pg.evaluate("(w)=>{const b=document.querySelector(w+' .jrhelp-btn');const s=getComputedStyle(b);const q=getComputedStyle(b.querySelector('.jrhelp-qm'));return [s.borderTopWidth,s.textDecorationLine,q.borderRadius,q.backgroundColor,b.textContent];}", where)
            check(name+' '+pn+': 모양(테두리·밑줄 없음, 검은 동그라미 ?)', st[0]=='0px' and st[1]=='none' and st[2]=='50%' and st[3]=='rgb(31, 41, 55)' and st[4]=='?사용 안내', str(st))
            btn.click(); pg.wait_for_timeout(300)
            sheet=pg.locator('.jrhelp-sheet')
            check(name+' '+pn+': 창 열림 · 제목', sheet.count()==1 and pg.text_content('#jrhelpTitle')=='점퍼스 간략 사용법')
            check(name+' '+pn+': 항목 '+str(N)+'개 · 번호', pg.locator('.jrhelp-sheet section').count()==N and pg.locator('.jrhelp-num').nth(N-1).text_content()==str(N))
            pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
            check(name+' '+pn+': Esc로 닫힘', pg.locator('#jrhelpOverlay').count()==0)
        # 메인에서 닫기 · 확인 · 바깥 · 스크롤 · 미리보기 주소
        pg.goto(BASE); pg.wait_for_timeout(1800)
        for how in ('닫기','확인','바깥'):
            pg.click('.topbar-nav .jrhelp-btn'); pg.wait_for_timeout(200)
            if how=='닫기': pg.click('#jrhelpX')
            elif how=='확인': pg.click('#jrhelpOk')
            else: pg.mouse.click(5,5)
            pg.wait_for_timeout(200)
            check(name+' '+how+' 누르면 닫힘', pg.locator('#jrhelpOverlay').count()==0)
        pg.click('.topbar-nav .jrhelp-btn'); pg.wait_for_timeout(200)
        inner=pg.evaluate("()=>{const s=document.querySelector('.jrhelp-sheet');return [s.scrollHeight>s.clientHeight, s.getBoundingClientRect().bottom<=innerHeight+1, getComputedStyle(s).overflowY];}")
        check(name+' 길면 창 안에서 스크롤', inner[1] and inner[2]=='auto' and (inner[0] or not kw), str(inner))
        href=pg.get_attribute('#jrhelpDemo','href'); tgt=pg.get_attribute('#jrhelpDemo','target')
        check(name+' 미리보기 단추: 새 탭 · ?demo', tgt=='_blank' and href=='?demo', href)
        # 다른 팝업(QR) 위에서 Esc → 안내 창만 닫힘
        pg.keyboard.press('Escape'); pg.click('#navQr'); pg.wait_for_timeout(400)
        qr=pg.locator('#qrOverlay').count()
        if qr:
            pg.evaluate("document.querySelector('.topbar-nav .jrhelp-btn').click()"); pg.wait_for_timeout(200)
            pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
            check(name+' QR 위에서 Esc → 안내 창만 닫힘', pg.locator('#jrhelpOverlay').count()==0 and pg.locator('#qrOverlay').count()==1)
            pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        if not kw: pg.evaluate("document.querySelector('.topbar-nav .jrhelp-btn').click()"); pg.wait_for_timeout(200); pg.screenshot(path='help_pc.png'); pg.keyboard.press('Escape')
        else: pg.evaluate("document.querySelector('.topbar-nav .jrhelp-btn').click()"); pg.wait_for_timeout(200); pg.screenshot(path='help_phone.png'); pg.keyboard.press('Escape')
        check(name+' JS 에러 없음', not errs, str(errs[:2]))
        ctx.close()
    # 미리보기 안에서는 미리보기 단추를 숨김 (베타에는 미리보기가 없음)
    if 'beta' not in CH:
        ctx=b.new_context(); ctx.route(re.compile(r'https://(cdn\.jsdelivr\.net|fonts\.).*'), route)
        pg=ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(ROOT+'?demo'); pg.wait_for_timeout(2500)
        pg.click('.topbar-nav .jrhelp-btn'); pg.wait_for_timeout(200)
        check('미리보기 안: 창은 열리고 미리보기 단추는 숨김', pg.locator('.jrhelp-sheet').count()==1 and pg.locator('#jrhelpDemo').count()==0)
        check('미리보기 JS 에러 없음', not errs, str(errs[:2]))
        ctx.close()
print('결과:', '모두 통과' if ok else '실패 있음')
