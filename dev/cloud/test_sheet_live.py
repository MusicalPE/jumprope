# 시트판(학교 시트 껍데기)으로 여는 점프 Live (Lite)가 그대로인지 — 큰 화면·판정기 고친 뒤 되돌아보기
from playwright.sync_api import sync_playwright
import re, json, urllib.request
ROOT='http://localhost:8891'; SH='https://script.google.com/macros/s/TEST/exec'
ok=True
def check(l,c,x=''):
    global ok; ok=ok and bool(c); print(('✔' if c else '✘'),l,x)
calls=[]
def route(r):
    u=r.request.url
    if u.startswith(SH):
        body=r.request.post_data or ''
        try: calls.append(json.loads(body)['fn'])
        except Exception: pass
        res=urllib.request.urlopen(urllib.request.Request('http://localhost:8890/exec',data=body.encode(),headers={'Content-Type':'text/plain'})).read()
        return r.fulfill(body=res,content_type='application/json',headers={'Access-Control-Allow-Origin':'*'})
    if u.endswith('.js'): return r.fulfill(body='',content_type='application/javascript')
    return r.fulfill(body='',content_type='text/css')
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':1200,'height':900}); errs=[]
    c.route(re.compile(r'^https://.*'),route)
    m=c.new_page(); m.on('pageerror',lambda e:errs.append(str(e))); m.on('dialog',lambda d:d.accept())
    m.goto(ROOT+'/jumpropelive/monitor.html?lite=1&s='+SH)
    m.wait_for_selector('#pwRow',state='visible',timeout=15000)
    check('시트판: 관리자 비밀번호를 물어봄 (예전 그대로)', True)
    m.fill('#inPw','1234'); m.keyboard.press('Enter'); 
    try: m.wait_for_function("document.getElementById('clsChips').children.length>0",timeout=8000)
    except Exception: m.click('#pwRow button'); m.wait_for_function("document.getElementById('clsChips').children.length>0",timeout=8000)
    check('시트판: 명단을 가져옴', m.locator('#clsChips .chip').count()>=1, m.inner_text('#appInfo')[:40])
    m.click('#btnOpen'); m.wait_for_function("document.getElementById('qrUrl').textContent.length>10",timeout=15000)
    surl=m.inner_text('#qrUrl').strip(); room=re.search(r'room=([^&]+)',surl).group(1)
    check('시트판: 방 열림 · 학생 주소에 ls=학교 시트', 'ls=https%3A%2F%2Fscript.google.com' in surl, surl[-70:])
    m.wait_for_timeout(4000)
    check('시트판: 큰 화면이 학교 시트로 주고받음 (liteOpenRoom · litePull)', 'liteOpenRoom' in calls and 'litePull' in calls and 'verifyAdminPassword' in calls, str(sorted(set(calls))))
    j=c.new_page(); j.on('pageerror',lambda e:errs.append('judge: '+str(e)))
    j.goto(surl.replace('https://musicalpe.github.io',ROOT)); j.wait_for_selector('#btnCam')
    src=j.content(); fn=re.search(r"async function shellPost\(shell,fn,args,deny\)\{.*?return j\.result; \}",src,re.S).group(0)
    r=j.evaluate("([fn,sh,room])=>{ const f=new Function('return ('+fn.replace('async function shellPost','async function')+')')(); return f(sh,'liteInfo',[room]); }",[fn,SH,room])
    check('시트판: 판정기의 요청 함수가 학교 시트로 보내고 답을 받음 (liteInfo)', r.get('meta') and r['ctl']['ph']=='open', str(r)[:100])
    r2=j.evaluate("([fn,sh,room])=>{ const f=new Function('return ('+fn.replace('async function shellPost','async function')+')')(); return f(sh,'liteSend',[room,'devbbbb0001',{g:4,c:1,n:1,cnt:3,st:'jump'},true]); }",[fn,SH,room])
    check('시트판: liteSend', r2.get('ctl',{}).get('ph')=='open' and 'meta' in r2, str(r2)[:100])
    check('JS 에러 없음', not errs, str(errs[:3]))
print('결과:','모두 통과' if ok else '실패 있음')
