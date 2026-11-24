from playwright.sync_api import sync_playwright
def skipsetup(pg):   # 새 공간은 첫 설정 도우미로 이어짐 → 시험은 메인 화면으로 건너감
    pg.wait_for_selector('.jc-setup, #recordForm', timeout=20000)
    if pg.locator('.jc-setup').count():
        pg.evaluate("sessionStorage.setItem('jc_nudge_off:' + new URLSearchParams(location.search).get('s'), '1')")   # 아래에 뜨는 '첫 설정이 남아 있어요' 알림은 끔
        pg.goto(re.sub(r'&page=setup.*$', '', pg.url)); pg.wait_for_selector('#recordForm', timeout=20000)
import re,json,urllib.request
ROOT='http://localhost:8891'; APP=ROOT+'/jumprope/cloud/'
def fb(b): return json.loads(urllib.request.urlopen(urllib.request.Request(ROOT+'/__fb',data=json.dumps(b).encode(),headers={'Content-Type':'application/json'})).read())
fb({'op':'reset'}); fb({'op':'console_set','path':'admins/t1','data':{'ok':True}})
ok=True
def check(l,c,x=''):
    global ok; ok=ok and bool(c); print(('✔' if c else '✘'),l,x)
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':1100,'height':900}); errs=[]
    import os; V=os.path.dirname(os.path.abspath(__file__))+'/../vendor/'
    def route(r):
        u=r.request.url
        if 'chart.js' in u: return r.fulfill(path=V+'chart.umd.js',content_type='application/javascript')   # 메인 화면 그래프 (빈 파일로 두면 Chart 가 없다는 오류가 남)
        return r.fulfill(body='{}' if 'script.google' in u else '',content_type='application/javascript' if u.endswith('.js') else 'text/css')
    c.route(re.compile(r'^https://.*'),route)
    t=c.new_page(); t.on('pageerror',lambda e:errs.append(str(e))); t.on('dialog',lambda d:d.accept())
    # 1. 예전 기기: 시트판만 기억 → 현황판의 우리 학교는 시트판으로
    t.goto(ROOT+'/jumprope/board.html'); t.evaluate("localStorage.setItem('jr_shell','https://script.google.com/macros/s/OLD/exec')"); t.goto(ROOT+'/jumprope/board.html'); t.wait_for_timeout(500)
    check('예전 기기(시트판만 기억): 현황판 [우리 학교] → 시트판', 'macros%2Fs%2FOLD' in t.get_attribute('#homeLink','href'), t.get_attribute('#homeLink','href')[-40:])
    # 2. 점퍼스 3 공간을 열면 → 현황판·기록실의 우리 학교가 그 공간으로
    t.goto(APP); t.evaluate("localStorage.setItem('mock-google', JSON.stringify({uid:'t1',name:'김선생',email:'t@example.com'}))")
    t.goto(APP); t.click('#jcG'); t.wait_for_selector('#jcNew'); t.click('#jcNew'); t.fill('#jcFind','햇살초등학교'); t.fill('#jcPw','sunny-2026!'); t.fill('#jcPw2','sunny-2026!'); t.click('#jcMk'); t.wait_for_selector('#jcRc',timeout=20000)
    t.check('#jcOk'); t.click('#jcGo'); skipsetup(t); sid=re.search(r's=([a-z0-9]+)',t.url).group(1)
    for pg in ['board.html','hall.html']:
        t.goto(ROOT+'/jumprope/'+pg); t.wait_for_timeout(500); h=t.get_attribute('#homeLink','href')
        check(pg+': [우리 학교] → 방금 연 점퍼스 3 공간', h==APP+'?s='+sid, h[-50:])
    t.click('#homeLink'); t.wait_for_selector('#recordForm',timeout=20000)
    check('눌러서 돌아오면 그 공간이 열림', sid in t.url and '/cloud/' in t.url)
    # 3. 시트판 주소로 다시 들어가면 그쪽을 기억 (마지막으로 연 학교)
    t.goto(ROOT+'/jumprope/?s=demo'); t.wait_for_timeout(800); check('미리보기(demo)는 기억하지 않음', t.evaluate("localStorage.getItem('jr_home')")==APP+'?s='+sid)
    check('JS 에러 없음', not errs, str(errs[:2]))
print('결과:','모두 통과' if ok else '실패 있음')
