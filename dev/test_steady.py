# 꾸준히 뛴 친구(수집기 22판: 평일 5일·하루 100회 = 그 주 달성) 시험: SEED=1 node devserver.js 띄운 뒤 python3 test_steady.py
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
# 기대값: 금요일이 이 달에 있는 주 가운데 평일 5일을 다 채운 주 수, 이번 주(월~오늘) 평일 수
D=lambda d: datetime.date(today.year,today.month,d)
mon=today-datetime.timedelta(days=today.weekday())
def exp(pred):   # pred(date) → 그날 100회 넘겼나
    wk=0; m0=D(1)-datetime.timedelta(days=D(1).weekday())
    for i in range(6):
        w=m0+datetime.timedelta(days=7*i)
        if (w+datetime.timedelta(days=4)).month!=today.month or (w+datetime.timedelta(days=4)).year!=today.year: continue
        if all(pred(w+datetime.timedelta(days=k)) for k in range(5)): wk+=1
    tw=sum(1 for k in range(5) if pred(mon+datetime.timedelta(days=k)))
    return wk,tw
inm=lambda d: d.month==today.month and d.year==today.year and d<=today
jun=exp(lambda d: inm(d)); ha=exp(lambda d: inm(d) and d.day%2==1); big0=exp(lambda d: inm(d) and (today-d).days<=2)
check('수집기 22판 응답에 steady·big', isinstance(bd.get('steady'),list) and bd.get('steadyMin')==100 and bd.get('steadyDays')==5 and len(bd.get('big',[]))==3, 'n=%s 이번 주 달성=%s 이번 달 달성=%s'%(len(bd.get('steady',[])),bd.get('steadyWeek'),bd.get('steadyMonth')))
find=lambda nm,sch: ([x for x in bd['steady'] if x['n'].startswith(nm) and x['school'].startswith(sch)] or [None])[0]
j=find('준','여울'); check('준이: 달성한 주 %d · 이번 주 %d일 (평일만 셈)'%jun, j and (j['wk'],j['tw'])==jun, json.dumps(j,ensure_ascii=False))
h=find('하','여울'); check('하람(홀수 날만 100회): 달성한 주 %d · 이번 주 %d일'%ha, (h is None and ha==(0,0)) or (h and (h['wk'],h['tw'])==ha), json.dumps(h,ensure_ascii=False))
g=find('가','산들'); check('사흘 7,000회 학생: 달성한 주 %d · 이번 주 %d일 (주말에 뛴 날은 안 셈)'%big0, (g is None and big0==(0,0)) or (g and (g['wk'],g['tw'])==big0), json.dumps(g,ensure_ascii=False))
check('99회만 뛴 서우는 목록에 없음', find('서','여울') is None)
check('steady 목록에 총 횟수(c) 없음 · 달성 순으로 정렬', all('c' not in x for x in bd['steady']) and bd['steady']==sorted(bd['steady'],key=lambda x:(-x['wk'],-x['tw'])) )
check('많이 뛴 친구 첫째 = 7,000회', bd['big'][0]['c']==7000)
check('예전 화면용 students(총 횟수)도 그대로 옴', bd['students'][0]['c']==7000)
pidA=[s for s in bd['schools'] if s['label'].startswith('산들')][0]['pid']
sc=get(H+'/collector?api=school&pid='+pidA)['result']
g2=[x for x in sc['students'] if x['c']==7000][0]
check('학교 안 순위: 7,000회 학생 그대로 1등 · 달성한 주/이번 주 함께 옴', sc['students'][0]['c']==7000 and (g2['wk'],g2['tw'])==big0)
# 지난달을 보면 '이번 주' 칸이 없음
prev=(today.replace(day=1)-datetime.timedelta(days=1)).strftime('%Y-%m'); bp=get(H+'/collector?api=board&month='+prev)['result']
check('지난달 보기: steadyNow 꺼짐', bp.get('steadyNow') is False and all(x['tw']==0 for x in bp.get('steady',[])))
with sync_playwright() as p:
    b=p.chromium.launch()
    for name,vp in (('pc',{'width':1280,'height':900}),('phone',{'width':390,'height':844})):
        ctx=b.new_context(viewport=vp, device_scale_factor=2); ctx.route(re.compile(r'https://(cdn\.jsdelivr\.net|fonts\.).*'), lambda r: r.fulfill(body='',content_type='text/css'))
        for ch in ('','beta/'):
            pg=ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(H+'/jumprope/'+ch+'board.html?me='+pidA); pg.wait_for_timeout(2500)
            card=pg.inner_text('.o-stu')
            check(name+' '+(ch or '정식')+' 꾸준히 뛴 친구 칸', '꾸준히 뛴 친구' in card and '평일 5일' in card and '주말은 쉬어요' in card and '이번 주 달성' in card)
            rows=pg.locator('.o-stu tbody tr'); first=rows.nth(0).inner_text()
            check(name+' '+(ch or '정식')+' 첫 줄 = 준이 · 등수 칸 없음', '준' in first and ('%d주'%jun[0] if jun[0] else '–') in first and pg.locator('.o-stu thead th').nth(0).inner_text()=='이름', first.replace('\n',' | '))
            check(name+' '+(ch or '정식')+' 많이 뛴 친구 한 줄', '많이 뛴 친구' in card and '7,000회' in card)
            check(name+' '+(ch or '정식')+' 학교 순위·며칠 연속·최고 연속 칸 그대로', pg.locator('.o-sch').count()==1 and pg.locator('.o-run').count()==1 and '산들' in pg.inner_text('.o-sch'))
            inn=pg.inner_text('.o-sch')
            check(name+' '+(ch or '정식')+' 학교 안 순위에 총 횟수·달성한 주', '7,000' in inn and '달성한 주' in inn)
            pg.click('#stuMore'); pg.wait_for_timeout(500)
            pop=pg.inner_text('.pop-list'); check(name+' '+(ch or '정식')+' 팝업: 꾸준히 목록 · 이름 찾기', '준' in pop and '7,000' not in pop)
            if pg.locator('.pop-mine').count():
                pg.click('.pop-mine'); pg.wait_for_timeout(400); mine=pg.inner_text('.pop-list'); check(name+' '+(ch or '정식')+' 우리 학교만', '준*' not in mine, mine[:70].replace('\n',' | '))
            pg.keyboard.press('Escape')
            if not ch:
                pg.locator('.o-stu').scroll_into_view_if_needed(); pg.locator('.o-stu').screenshot(path=OUT+'/steady_'+name+'.png')
            check(name+' '+(ch or '정식')+' JS 에러 없음', not errs, str(errs[:2]))
            pg.close()
        ctx.close()
    # 예전 수집기(21판 이하) 응답이면 예전 칸 그대로
    ctx=b.new_context(viewport={'width':1280,'height':900})
    def old(r):
        J=json.loads(urllib.request.urlopen(r.request.url).read()); j=J['result']; [j.pop(k,None) for k in ('steady','steadyTotal','steadyWeek','steadyMonth','steadyMin','steadyDays','steadyNow','big')]
        for x in j.get('students',[]): x.pop('wk',None); x.pop('tw',None)
        j=J
        r.fulfill(body=json.dumps(j),content_type='application/json',headers={'access-control-allow-origin':'*'})
    ctx.route(re.compile(r'.*/collector\?api=(board|school).*'), old); ctx.route(re.compile(r'https://(cdn\.jsdelivr\.net|fonts\.).*'), lambda r: r.fulfill(body='',content_type='text/css'))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.goto(H+'/jumprope/board.html?me='+pidA); pg.wait_for_timeout(2500)
    card=pg.inner_text('.o-stu'); check('예전 수집기: 전국 학생 순위(횟수) 칸 그대로', '전국 학생 순위' in card and '7,000' in card and not errs, str(errs[:1]))
print('결과:', '모두 통과' if ok else '실패 있음')
