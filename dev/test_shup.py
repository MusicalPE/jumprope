# 껍데기 새 판으로 바꾸는 법 팝업 시험: SEED=1 node devserver.js 띄운 뒤 python3 test_shup.py
from playwright.sync_api import sync_playwright
import urllib.parse, re, os, json, urllib.request
EXEC='http://localhost:8890/exec'; CH=os.environ.get('CH','')
BASE='http://localhost:8890/jumprope/'+CH+'?s='+urllib.parse.quote(EXEC, safe='')
V=os.path.dirname(os.path.abspath(__file__))+'/vendor/'
def route(r):
    u=r.request.url
    if 'chart.js' in u: return r.fulfill(path=V+'chart.umd.js', content_type='application/javascript')
    if 'qrcode' in u: return r.fulfill(path=V+'qrcode.js', content_type='application/javascript')
    return r.fulfill(body='', content_type='text/css')
tok=json.loads(urllib.request.urlopen(urllib.request.Request(EXEC, data=json.dumps({'fn':'verifyAdminPassword','args':['1234']}).encode())).read())['result']['token']
ok=True
def check(l,c,x=''):
    global ok; ok=ok and bool(c); print(('✔' if c else '✘'),l,x)
with sync_playwright() as p:
    b=p.chromium.launch()
    for name,kw in (('컴퓨터',{}),('휴대폰',{'user_agent':'Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36','viewport':{'width':390,'height':800}})):
        ctx=b.new_context(**kw); ctx.grant_permissions(['clipboard-read','clipboard-write'], origin='http://localhost:8890')
        ctx.route(re.compile(r'https://(cdn\.jsdelivr\.net|fonts\.).*'), route)
        pg=ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(BASE+'&page=admin&token='+tok); pg.wait_for_timeout(2500)
        check(name+' 최신 판: 단추 없음 · "최신" 표시', pg.locator('.shup-btn').count()==0 and '최신' in pg.text_content('#shellLine'), pg.text_content('#shellLine'))
        pg.evaluate("APP.latestShell = 99; SHUP.mark(); document.getElementById('shellNotice').innerHTML='<div class=\"warn-box\">예전 판 경고</div>'; SHUP.mark();")
        check(name+' 예전 판: 접속 주소 칸', '새 판 있음' in pg.text_content('#shellLine') and pg.locator('#shellLine .shup-btn').count()==1, pg.text_content('#shellLine'))
        check(name+' 예전 판: 판 정보·경고 줄 단추', pg.locator('#versionInfo .shup-btn').count()==1 and pg.locator('#shellNotice .shup-btn').count()==1)
        pg.evaluate("document.getElementById('qrShowBtn').click()"); pg.wait_for_timeout(300)
        pg.evaluate("document.querySelector('#shellLine .shup-btn').click()"); pg.wait_for_timeout(1200)
        top=pg.evaluate("(function(){const r=document.querySelector('.shup-sheet').getBoundingClientRect();const e=document.elementFromPoint(r.left+r.width/2,r.top+20);return !!e.closest('.shup-sheet');})()")
        check(name+' 팝업이 다른 팝업(QR) 위에 뜸', pg.locator('#qrOverlay').count()==1 and top)
        txt=pg.inner_text('.shup-sheet')
        check(name+' 컴퓨터 안내', '컴퓨터에서 해 주세요' in txt)
        check(name+' 휴대폰 안내 줄 '+('있음' if kw else '없음'), ('지금은 휴대폰이에요' in txt)==bool(kw))
        check(name+' 4단계', pg.locator('.shup-sheet li').count()==4 and '새로고침' in txt)
        check(name+' 내 시트 주소', pg.get_attribute('#shupSheet','href')=='https://docs.google.com/spreadsheets/d/EMU/edit', pg.get_attribute('#shupSheet','href'))
        pg.click('#shupCopy'); pg.wait_for_timeout(800)
        clip=pg.evaluate("navigator.clipboard.readText()")
        check(name+' 복사한 코드 = 껍데기', 'const SHELL_VERSION = 9;' in clip and 'function doPost' in clip and clip==open(os.path.dirname(os.path.abspath(__file__))+'/../'+('club/' if 'club' in CH else '')+'Shell.gs',encoding='utf-8').read(), pg.text_content('#shupMsg'))
        check(name+' 새 판 번호 표시', pg.text_content('#shupVer')=='9판')
        # 복사가 막힐 때
        pg.evaluate("() => { navigator.clipboard.writeText = function(){ return Promise.reject(new Error(1)); }; }"); pg.click('#shupCopy'); pg.wait_for_timeout(500)
        sel=pg.evaluate("(function(){const t=document.getElementById('shupText');return [t.style.display, t.value.length, t.selectionEnd-t.selectionStart];})()")
        check(name+' 복사 막힘 → 글 칸에 펼쳐 전체 선택', sel[0]=='' and sel[1]>1000 and sel[1]==sel[2] and 'Ctrl+C' in pg.text_content('#shupMsg'), str(sel))
        if not kw: pg.screenshot(path='shup_pc.png')
        else: pg.screenshot(path='shup_phone.png')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        check(name+' Esc → 이 팝업만 닫힘', pg.locator('#shupOverlay').count()==0 and pg.locator('#qrOverlay').count()==1)
        check(name+' JS 에러 없음', not errs, str(errs[:2]))
        ctx.close()
print('결과:', '모두 통과' if ok else '실패 있음')
