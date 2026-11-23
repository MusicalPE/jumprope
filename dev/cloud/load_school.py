# 300명 학교가 한 달(20일) 쓴 크기를 재 봄 — 가짜 서버
from playwright.sync_api import sync_playwright
import re,json,urllib.request,sys
ROOT='http://localhost:8891'; APP=ROOT+'/jumprope/cloud/'
def fb(b): return json.loads(urllib.request.urlopen(urllib.request.Request(ROOT+'/__fb',data=json.dumps(b).encode(),headers={'Content-Type':'application/json'})).read())
fb({'op':'reset'})
fb({'op': 'console_set', 'path': 'admins/t1', 'data': {'ok': True}})   # 시험용 선생님을 운영자로 (가입 코드 없이 공간을 만들 수 있게)
size=lambda v: len(json.dumps(v))
with sync_playwright() as p:
    b=p.chromium.launch()
    def ctx():
        c=b.new_context(viewport={'width':1200,'height':900}); c.route(re.compile(r'^https://.*'),lambda r:r.fulfill(body='',content_type='application/javascript' if r.request.url.endswith('.js') else 'text/css'))
        pg=c.new_page(); pg.set_default_timeout(120000); pg.on('dialog',lambda d:d.accept()); return pg
    t=ctx(); t.goto(APP); t.evaluate("localStorage.setItem('mock-google', JSON.stringify({uid:'t1',name:'김선생',email:'t@example.com'}))")
    t.goto(APP); t.click('#jcG'); t.click('#jcNew'); t.fill('#jcNm','햇살초등학교'); t.fill('#jcPw','sunny-2026!'); t.fill('#jcPw2','sunny-2026!'); t.click('#jcMk'); t.wait_for_selector('#jcRc')
    t.check('#jcOk'); t.click('#jcGo'); t.wait_for_selector('#recordForm'); sid=re.search(r's=([a-z0-9]+)',t.url).group(1)
    tok=t.evaluate("window.JRCLOUD.adminToken()")
    rows=[[str(1+i//100+3),str(1+(i%100)//25),str(1+i%25),'학생%03d'%i] for i in range(300)]
    t.evaluate("([tok,rows])=>window.JRCLOUD.call('addStudentsBulk',[tok,rows.map(r=>({grade:r[0],cls:r[1],number:r[2],name:r[3]}))]).catch(e=>String(e.message||e))",[tok,rows])
    st=t.evaluate("tok=>window.JRCLOUD.call('getAllStudents',[tok])",tok); print('학생',len(st))
    if len(st)<300: sys.exit('학생 등록 실패')
    typ=t.evaluate("window.JRCLOUD.call('getJumpTypes',[])")[0]
    ids=[x['id'] for x in st]
    for d in range(20):
        for k in range(3):
            t.evaluate("([tok,typ,ids,d,k])=>window.JRCLOUD.call('addLiveRecordsAdmin',[tok,typ,ids.map((id,i)=>({id:id,count:100+((i*7+d)%50)})),'run'+d+'_'+k])",[tok,typ,ids[k*100:(k+1)*100],d,k])
    docs={k:v for k,v in fb({'op':'dump'})['result']['docs'].items() if k.startswith('spaces/'+sid+'/book/')}
    rec={k:size(v) for k,v in docs.items() if 'Records_' in k}
    print('기록 6000줄 → 조각 %d개, 조각 하나 평균 %.0fKB, 모두 %.2fMB · 학생 명단 %.0fKB'%(len(rec),sum(rec.values())/len(rec)/1024,sum(rec.values())/1048576,size(docs['spaces/'+sid+'/book/Students'])/1024))
    # 학생 기기: 처음 열 때와, 누가 기록 하나 넣은 뒤 다시 열 때 받는 양
    t.goto(APP+'?s='+sid); t.wait_for_selector('#recordForm'); t.click('#navQr'); t.wait_for_selector('#qrOverlay .qr-url'); link=t.text_content('#qrOverlay .qr-url').strip()
    s=ctx(); got=[]
    def onres(r):
        if r.url.endswith('/__fb'):
            try: got.append(len(r.body()))
            except Exception: pass
    s.on('response',onres)
    import time
    t0=time.time(); s.goto(link); s.wait_for_selector('#recordForm'); s.wait_for_timeout(1500); print('학생 기기 처음 열기: 받은 양 %.2fMB · %.1f초'%(sum(got)/1048576,time.time()-t0))
    got.clear(); t0=time.time(); s.goto(APP+'?s='+sid); s.wait_for_selector('#recordForm'); s.wait_for_timeout(1500); print('다시 열기(바뀐 것 없음): %.1fKB · %.1f초'%(sum(got)/1024,time.time()-t0))
    t.evaluate("([tok,typ,id])=>window.JRCLOUD.call('addLiveRecordsAdmin',[tok,typ,[{id:id,count:5}],'runx'])",[tok,typ,st[0]['id']]); t.wait_for_timeout(500)
    got.clear(); s.goto(APP+'?s='+sid); s.wait_for_selector('#recordForm'); s.wait_for_timeout(1500); print('선생님이 기록 하나 넣은 뒤 다시 열기: %.1fKB'%(sum(got)/1024))
