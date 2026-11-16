# 꾸준히 뛴 친구(수집기 22판) 시험: SEED=1 node devserver.js 띄운 뒤 python3 test_steady.py
# 장면: 한 학교 학생이 3일 동안 7,000회 · 다른 학교 학생은 날마다 150회씩 꾸준히
from playwright.sync_api import sync_playwright
import json, urllib.request, re, os, datetime
H='http://localhost:8890'; OUT=os.environ.get('SHOTS','.')
def post(u,b): return json.loads(urllib.request.urlopen(urllib.request.Request(u,data=json.dumps(b).encode(),method='POST')).read() or b'{}')
def get(u): return json.loads(urllib.request.urlopen(u).read())
post(H+'/__col/seed',{})
today=datetime.date.today(); m=today.strftime('%Y-%m'); nd=today.day
day=lambda d: '%s-%02d'%(m,d)
# 산들초: 큰 숫자 3일 (교사 입력, 카메라 0) / 여울가람초: 날마다 꾸준히 (카메라)
big=[('가온',[2500,2500,2000]),('나래',[2200,2100,2015]),('다솜',[700,700,609]),('라온',[2000,0,0]),('마루',[60,70,80])]
A={'key':'steady-test-key-aaaaaaaaaaaa','name':'산들초등학교','showName':True,'registered':13,
   'days':[{'date':day(nd-2+i),'students':[['a%d'%j,n,'4',c[i],0] for j,(n,c) in enumerate(big) if c[i]>0]} for i in range(3) if nd-2+i>=1]}
B={'key':'steady-test-key-bbbbbbbbbbbb','name':'여울가람초등학교','showName':True,'registered':20,
   'days':[{'date':day(d),'students':[['b0','준이','4',150,150],['b1','하람','4',120 if d%2 else 40,0],['b2','서우','5',99,99]]} for d in range(1,nd+1)]}
for p in (A,B): r=post(H+'/collector',{'fn':'report','args':[p]}); assert r.get('ok') is not False, r
bd=get(H+'/collector?api=board')['result']; ok=True
def check(l,c,x=''):
    global ok; ok=ok and bool(c); print(('✔' if c else '✘'),l,x)
check('수집기 22판 응답에 steady', isinstance(bd.get('steady'),list) and bd.get('steadyMin')==100, 'n=%s first=%s'%(len(bd.get('steady',[])),bd.get('steadyFirst')))
top=bd['steady'][0]
check('1등은 날마다 뛴 준이 (총 횟수 7,000 학생이 아님)', top['n'].startswith('준') and top['d1']==nd, json.dumps(top,ensure_ascii=False))
check('steady 목록에 총 횟수(c) 없음', all('c' not in x for x in bd['steady']))
check('100회 못 미친 날은 안 셈 (하람: 홀수 날만, 서우: 99회라 0일 → 목록에 없음)', not any(x['n'].startswith('서') and x['school'].startswith('여울') for x in bd['steady']) and [x for x in bd['steady'] if x['n'].startswith('하') and x['school'].startswith('여울')][0]['d1']==(nd+1)//2)
check('예전 화면용 students(총 횟수)도 그대로 옴', bd['students'][0]['c']==7000)
pidA=[s for s in bd['schools'] if s['label'].startswith('산들')][0]['pid']
sc=get(H+'/collector?api=school&pid='+pidA)['result']
g=[x for x in sc['students'] if x['c']==7000][0]
check('학교 안 순위: 7,000회 학생은 그대로 1등, 꾸준함 전국 등수는 따로', sc['students'][0]['c']==7000 and g['d1']==min(3,nd) and g['sr']>=1, 'd1=%s sr=%s nr=%s'%(g['d1'],g['sr'],g['nr']))
with sync_playwright() as p:
    b=p.chromium.launch()
    for name,vp in (('pc',{'width':1280,'height':900}),('phone',{'width':390,'height':844})):
        ctx=b.new_context(viewport=vp, device_scale_factor=2); ctx.route(re.compile(r'https://(cdn\.jsdelivr\.net|fonts\.).*'), lambda r: r.fulfill(body='',content_type='text/css'))
        for ch in ('','beta/'):
            pg=ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(H+'/jumprope/'+ch+'board.html?me='+pidA); pg.wait_for_timeout(2500)
            card=pg.inner_text('.o-stu')
            check(name+' '+(ch or '정식')+' 꾸준히 뛴 친구 칸', '꾸준히 뛴 친구' in card and '하루 100회 넘게 뛴 날 수' in card and '7,000' not in card)
            rows=pg.locator('.o-stu tbody tr'); first=rows.nth(0).inner_text()
            check(name+' '+(ch or '정식')+' 첫 줄 = 준이 · %d일'%nd, '준' in first and ('%d일'%nd) in first, first.replace('\n',' | '))
            check(name+' '+(ch or '정식')+' 학교 순위·며칠 연속·최고 연속 칸 그대로', pg.locator('.o-sch').count()==1 and pg.locator('.o-run').count()==1 and '산들' in pg.inner_text('.o-sch'))
            inn=pg.inner_text('.o-sch')
            check(name+' '+(ch or '정식')+' 학교 안 순위에 총 횟수 보임', '7,000' in inn and '하루 100회 넘게 뛴 날' in inn)
            pg.click('#stuMore'); pg.wait_for_timeout(500)
            pop=pg.inner_text('.pop-list'); check(name+' '+(ch or '정식')+' 팝업: 꾸준히 목록 · 이름 찾기', '준' in pop and '7,000' not in pop)
            if pg.locator('.pop-mine').count():
                pg.click('.pop-mine'); pg.wait_for_timeout(400); mine=pg.inner_text('.pop-list'); check(name+' '+(ch or '정식')+' 우리 학교만', '가' in mine and '준' not in mine.replace('기준',''), mine[:60].replace('\n',' | '))
            pg.keyboard.press('Escape')
            if not ch:
                pg.locator('.o-stu').scroll_into_view_if_needed(); pg.locator('.o-stu').screenshot(path=OUT+'/steady_'+name+'.png')
            check(name+' '+(ch or '정식')+' JS 에러 없음', not errs, str(errs[:2]))
            pg.close()
        ctx.close()
    # 예전 수집기(21판 이하) 응답이면 예전 칸 그대로
    ctx=b.new_context(viewport={'width':1280,'height':900})
    def old(r):
        J=json.loads(urllib.request.urlopen(r.request.url).read()); j=J['result']; [j.pop(k,None) for k in ('steady','steadyTotal','steadyFirst','steadyMin')]
        for x in j.get('students',[]): x.pop('d1',None); x.pop('sr',None)
        j=J
        r.fulfill(body=json.dumps(j),content_type='application/json',headers={'access-control-allow-origin':'*'})
    ctx.route(re.compile(r'.*/collector\?api=(board|school).*'), old); ctx.route(re.compile(r'https://(cdn\.jsdelivr\.net|fonts\.).*'), lambda r: r.fulfill(body='',content_type='text/css'))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.goto(H+'/jumprope/board.html?me='+pidA); pg.wait_for_timeout(2500)
    card=pg.inner_text('.o-stu'); check('예전 수집기: 전국 학생 순위(횟수) 칸 그대로', '전국 학생 순위' in card and '7,000' in card and not errs, str(errs[:1]))
print('결과:', '모두 통과' if ok else '실패 있음')
