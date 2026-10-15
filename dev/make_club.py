#!/usr/bin/env python3
"""클럽판(스포츠클럽·태권도장 등) 만들기 — 학교판 파일에서 club/ 폴더를 새로 만들어 냄.

학교판(index.html·board.html·hall.html·Shell.gs·Collector.gs)을 고친 뒤 이 스크립트를 다시 돌리면
클럽판도 같은 기능으로 맞춰짐. 다른 점은 아래 바꾸기 목록뿐:
  - 화면 글자: 학교 → 클럽 (초등학교·중학교는 그대로), 담당 교사 → 담당 지도자, 상장 직함 담임/체육 교사 → 관장/사범
  - 이름: Jump Earth! 클럽 리그 (전국 현황판) · Jumpers! 클럽 리그 (기록실)
  - 수집기: club/national.json 의 collector (학교판과 아예 다른 수집기)
  - 껍데기: club/Shell.gs (APP_URL 이 …/jumprope/club/) — 학교 껍데기와 섞이지 않게
  - 이 기기에 기억하는 시트 주소 키: jr_shell → jrc_shell
쓰는 법:  python3 dev/make_club.py   (저장소 맨 위에서)
"""
import json, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLUB = os.path.join(ROOT, 'club')
os.makedirs(CLUB, exist_ok=True)


def read(p):
    return open(os.path.join(ROOT, p), encoding='utf-8').read()


def write(p, s):
    with open(os.path.join(CLUB, p), 'w', encoding='utf-8') as f:
        f.write(s)


def must(s, a, b, n=1):
    c = s.count(a)
    if c != n:
        sys.exit(f'바꿀 글자 수가 달라요 ({c}≠{n}): {a[:60]}')
    return s.replace(a, b)


def words(s):
    """학교 → 클럽 (조사까지)"""
    for a, b in [('서울 햇살초등학교', '서울 햇살태권도'), ('서울햇살초등학교', '서울햇살태권도'), ('햇살초등학교', '햇살태권도'),
                 ('담당 교사', '담당 지도자')]:
        s = s.replace(a, b)
    keep = ['학교는 학교용', '학교 현황판으로 가요', '학교용']   # 학교판·클럽판 껍데기 안내 문구는 그대로
    for i, k in enumerate(keep):
        s = s.replace(k, '\x00%d\x00' % i)
    s = re.sub(r'(?<![등중])학교', '클럽', s)
    for i, k in enumerate(keep):
        s = s.replace('\x00%d\x00' % i, k)
    for a, b in [('클럽(반)로', '클럽(반)으로'), ('클럽가', '클럽이'), ('클럽를', '클럽을'), ('클럽는', '클럽은'), ('클럽와', '클럽과'), ('클럽로', '클럽으로')]:
        s = s.replace(a, b)
    return s


def page(s):
    """화면 공통: 위 글자 바꾸기 + 상위 폴더 자원 + 기억 키"""
    s = words(s)
    s = s.replace('url(fonts/', 'url(../fonts/').replace('src="img/', 'src="../img/').replace('href="icons/', 'href="../icons/')
    s = s.replace("'jr_shell'", "'jrc_shell'")
    s = s.replace('Jump Earth (점퍼스)', 'Jump Earth! 클럽 리그').replace('Jump Earth(점퍼스)', 'Jump Earth! 클럽 리그')
    return s


# ---- 앱 ----
s = page(read('index.html'))
s = must(s, '<title>줄넘기 기록 관리</title>', '<title>줄넘기 기록 관리 · 클럽</title>')
s = must(s, '<b class="jn">Jump Earth!</b>현황판', '<b class="jn">Jump Earth!</b>클럽 리그 현황판')
s = must(s, '<option value="담임">담임</option>', '<option value="관장">관장</option>')
s = must(s, '<option value="체육 교사">체육 교사</option>', '<option value="사범">사범</option>')
s = must(s, "r.sel || '담임'", "r.sel || '관장'")
s = s.replace('담임 / 체육 교사 / 직접 입력', '관장 / 사범 / 직접 입력')
s = must(s, "(APP.channel === 'beta' ? '../' : '') + 'img/journey-kid.webp", "'../img/journey-kid.webp")
s = must(s, '<b class="jn">Jump Us!</b>줄넘기 기록', '<b class="jn">Jump Us!</b>클럽 줄넘기 기록')
s = must(s, 'function ourLabel(list){\n', 'function ourLabel(list){\n  return \'우리 \' + unitWord(APP.unit);   // 클럽판: 반·학년이 섞여도 늘 "우리 클럽(도장·직접 입력)"\n')
s = must(s, 'Jump Us! 점퍼스 · 줄넘기 기록</h1>', 'Jump Us! 점퍼스 · 클럽 줄넘기 기록</h1>')
s = must(s, '다른 클럽(체육교사 보조 프로그램 클럽 포함)와', '다른 클럽과')
write('index.html', s)

# ---- 현황판 · 기록실 ----
s = page(read('board.html'))
s = must(s, "(/\\/beta\\//.test(location.pathname) ? '../' : '') + 'img/'", "'../img/'")
s = must(s, '<title>Jump Earth! 점퍼스 · 전국 줄넘기 현황판</title>', '<title>Jump Earth! 클럽 리그 · 전국 줄넘기 현황판</title>')
s = must(s, '<b class="jn">Jump Earth!</b><span class="nb-word">현황판</span>', '<b class="jn">Jump Earth!</b><span class="nb-word">클럽 리그</span>')
write('board.html', s)
s = page(read('hall.html'))
s = must(s, '<title>Jumpers! 점퍼스 · 기록실</title>', '<title>Jumpers! 클럽 리그 · 기록실</title>')
write('hall.html', s)

# ---- 앱 설치 파일 ----
m = json.loads(read('manifest.webmanifest'))
m.update({'id': '/jumprope/club/', 'name': 'Jump Us! 점퍼스 클럽 · 줄넘기 기록', 'short_name': '점퍼스 클럽',
          'description': '스포츠클럽·도장 줄넘기 기록 · 급수 인증 · 전국 클럽 리그'})
for ic in m.get('icons', []):
    ic['src'] = '../' + ic['src']
write('manifest.webmanifest', json.dumps(m, ensure_ascii=False, indent=2) + '\n')
write('sw.js', read('sw.js').replace("var C = 'jumprope-shell';", "var C = 'jumprope-club-shell';"))
write('changelog.json', words(read('changelog.json')))

# ---- 수집기 주소 (처음 한 번 빈칸으로 만들고, 운영자가 클럽 수집기를 배포하면 주소를 넣음) ----
nj = os.path.join(CLUB, 'national.json')
if not os.path.exists(nj):
    write('national.json', json.dumps({'collector': ''}, indent=2) + '\n')
col = json.load(open(nj, encoding='utf-8')).get('collector', '')

# ---- 클럽용 껍데기 ----
s = read('Shell.gs')
s = must(s, "const APP_URL = 'https://musicalpe.github.io/jumprope/';", "const APP_URL = 'https://musicalpe.github.io/jumprope/club/';")
s = must(s, "const BETA_URL = 'https://musicalpe.github.io/jumprope/beta/';", "const BETA_URL = 'https://musicalpe.github.io/jumprope/club/';")
s = re.sub(r"const DEFAULT_COLLECTOR_URL = '[^']*';", "const DEFAULT_COLLECTOR_URL = '" + col + "';   // 클럽 리그 수집기 (학교 현황판과 따로)", s)
s = must(s, "    const res = UrlFetchApp.fetch(natCollector_(),", "    const colUrl = natCollector_();\n    if (!colUrl) return { skipped: 'nocollector' };   // 클럽 리그 수집기가 아직 없음\n    const res = UrlFetchApp.fetch(colUrl,")
s = must(s, " * 줄넘기 기록 관리 v2 — 학교 시트용 껍데기 (Shell.gs)\n", " * 줄넘기 기록 관리 v2 — 클럽용 껍데기 (스포츠클럽·태권도장 등)\n * 화면: musicalpe.github.io/jumprope/club · 전국 현황판: Jump Earth! 클럽 리그 (학교 현황판과 따로)\n")
s = words(s)
write('Shell.gs', s)

# ---- 클럽 리그 수집기 (운영자만 설치) — 학교 수집기와 같은 코드, 따로 배포 ----
s = read('Collector.gs')
s = must(s, " * 줄넘기 기록 관리 v2.1 — 전국 현황판 중앙 수집기 (Collector.gs)\n", " * 줄넘기 기록 관리 — Jump Earth! 클럽 리그 수집기 (스포츠클럽·태권도장 등)\n * 학교 현황판 수집기와 같은 코드를 새 스프레드시트에 따로 배포함. 나온 주소는 club/national.json 에\n")
write('Collector.gs', s)
print('club/ 만들었어요 · 수집기:', col or '(아직 없음)')
