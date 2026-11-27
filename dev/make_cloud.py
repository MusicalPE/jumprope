#!/usr/bin/env python3
"""클라우드판 만들기 — 학교판 index.html 에서 cloud/index.html 을 새로 만들어 냄.

클라우드판은 화면이 학교판과 같고, 저장하는 곳만 파이어베이스(cloud/js/cloud.js)임.
학교판 index.html 이나 demo.js 를 고친 뒤 이 스크립트를 다시 돌리면 클라우드판도 같은 화면으로 맞춰짐.
  - <base href="../"> : 그림·글꼴·Shell.gs·changelog.json 등은 저장소 맨 위 것을 그대로 씀
  - 요청(rpc)을 학교 시트 대신 window.JRCLOUD 로 보냄
  - cloud/js/gasfake.js : demo.js 의 가짜 스프레드시트·SHA-256 을 그대로 떼어 옴
쓰는 법:  python3 dev/make_cloud.py   (저장소 맨 위에서)
"""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def read(p): return open(os.path.join(ROOT, p), encoding='utf-8').read()
def write(p, s):
    with open(os.path.join(ROOT, 'cloud', p), 'w', encoding='utf-8') as f: f.write(s)
def must(s, a, b, n=1):
    c = s.count(a)
    if c != n: sys.exit(f'바꿀 글자 수가 달라요 ({c}≠{n}): {a[:70]}')
    return s.replace(a, b)

# ---- 가짜 스프레드시트 (demo.js 에서) ----
d = read('demo.js')
a = d.index('  /* ── SHA-256'); b = d.index("  var CLUB = /\\/club\\//")
write('js/gasfake.js', '// dev/make_cloud.py 가 demo.js 에서 떼어 온 파일 — 직접 고치지 말 것 (demo.js 를 고치고 다시 만들기)\n' + d[a:b] + '\nexport { sha256Bytes, Sheet, Range };\n')

# ---- 화면 ----
s = read('index.html')
s = must(s, '<head>', '<head>\n<script>if (/\\/cloud$/.test(location.pathname)) location.replace(location.pathname + \'/\' + location.search + location.hash);   // …/cloud 로 열면 …/cloud/ 로 (아래 base 가 맞게)</script>\n<base href="../">')
s = must(s, "club: /\\/club\\//.test(location.pathname),", "club: false, cloud: true,")
s = must(s, "  else try { if (s) localStorage.setItem('jr_shell', s); else s = localStorage.getItem('jr_shell') || ''; } catch (e) {}\n", "  // 클라우드판: 주소에 공간이 없으면 [내 공간] 화면 (지난 공간으로 저절로 가지 않음)\n")
s = must(s, "  if (APP.demo) return demoRpc(fn, args);\n", "  if (APP.demo) return demoRpc(fn, args);\n  return window.JRCLOUD.call(fn, args);   // 클라우드판: 학교 시트 대신 파이어베이스\n")
s = must(s, "  if (!APP.shellUrl) return showSetup('');\n", "  if (!APP.shellUrl) return window.JRCLOUD.entry();\n  if (APP.q.page === 'space' && !APP.demo) return window.JRCLOUD.spacePage();\n  if (APP.q.page === 'setup' && !APP.demo) return window.JRCLOUD.setupPage();\n")
s = must(s, "    showSetup('학교 시트에 연결하지 못했어요: ' + (err.message || err) + '<br>· 배포 설정의 \"액세스 권한\"이 <b>모든 사용자</b>인지 · 주소가 맞는지 확인해 주세요.');\n  });\n});", "    window.JRCLOUD.fail(err);\n  });\n});")
s = must(s, "'jumpropeAdminSession'", "('jumpropeCloud:' + APP.shellUrl)", s.count("'jumpropeAdminSession'"))
s = must(s, 'const nextPage = APP.q.next || "admin";\n', 'const nextPage = APP.q.next || "admin";\nif (!APP.demo) window.JRCLOUD.adminLogin(nextPage);   // 클라우드판: 선생님(구글 로그인)이면 비밀번호 없이 통과\n')
s = must(s, "JRQR.show(baseUrl)", "JRQR.show(APP.stuLink || baseUrl)", 2)
s = must(s, "const url = baseUrl, autoUrl = baseUrl + '&qr=1';", "const url = APP.stuLink || baseUrl, autoUrl = baseUrl + '&qr=1';")
s = must(s, '      <a class="nav-link" href="{{BASE}}">메인 화면 →</a>\n', '      <a class="nav-link" href="{{BASE}}">메인 화면 →</a>\n      <a class="nav-link jc-space" href="{{BASE}}&page=space">공간 관리 →</a>\n')
s = must(s, '</head>', '<script>window.APP = APP;</script>\n<script type="module" src="cloud/js/cloud.js"></script>\n</head>')
s = must(s, "new URL(page, location.href).href", "new URL(page, document.baseURI).href")   # 현황판·기록실은 저장소 맨 위 것
# ---- 점프 Live: 큰 화면(monitor.html)에 '학교 시트 주소' 대신 'cloud:공간' 을 넘김 → 큰 화면·판정기가 다리(bridge.js)로 이 공간을 씀 ----
s = must(s, "s=' + encodeURIComponent(APP.shellUrl)", "s=' + encodeURIComponent('cloud:' + APP.shellUrl)", 4)
s = must(s, '<h2>점프 Live (Lite) <span style="font-size:13px;font-weight:600;color:var(--coral-dark);">학교 시트만으로</span></h2>', '<h2>점프 Live (Lite)</h2>')
s = must(s, "바깥 서버 없이 이 학교 시트만으로 수업 방을 열어요.", "이 공간에서 바로 수업 방을 열어요.")
s = must(s, " 껍데기 <b>6판</b>부터 쓸 수 있어요.</p>", "</p>")
# 전국 현황판 참여 번호에 딸린 설치 표시: 껍데기(cloud.js 의 ScriptApp)와 같은 값 'cloud:<공간>' 을 씀 (다르면 서로 "복사한 시트"로 봄)
s = must(s, "  deployId: function(u){ const m = String(u == null ? APP.shellUrl : u).match(/\\/s\\/([A-Za-z0-9_-]{20,})\\//); return m ? m[1] : String(u == null ? APP.shellUrl : u); },", "  deployId: function(u){ return 'cloud:' + String(u == null ? APP.shellUrl : u); },")
# ---- 클라우드판에 맞춘 안내 글 ----
i = s.index("  items: [\n"); j = s.index("  esc: function(t)", i)
HELP = [
    ['학생 들어오게 하기 (선생님)', ['위쪽 "접속 QR"을 눌러 크게 띄우고, 학생 휴대폰으로 찍게 해요. 학생은 로그인하지 않아요.', 'QR 안에 학생 이름을 여는 열쇠가 들어 있어요. 학급 밖으로 퍼졌다면 관리자 메뉴 → "공간 관리"에서 "새 QR 만들기"를 눌러요.']],
    ['기록 넣기 (학생)', ['"오늘 기록 입력"에서 학년·반·이름과 "줄넘기 종류"를 고르고, "뛴 횟수"를 넣어 "저장"해요.', '하루에 여러 번 넣어도 막지 않아요. 그날 뛴 횟수가 모두 더해져요.', '내 휴대폰이면 "이 기기에 내 이름 기억하기"를 켜 두세요. 다음부터 이름이 골라져 있어요.']],
    ['카메라·스마트 줄넘기로 뛰기 (학생)', ['학년·반·이름·종류를 고른 뒤 "카메라로 뛰기"를 누르면 판정기가 열려요. 뛰고 나서 "끝내고 기록하기"를 누르면 횟수가 들어가요.', '"한 대로 둘이"는 한 기기로 친구와 나란히 뛰어요. "스마트 줄넘기로 뛰기"는 줄넘기를 블루투스로 연결해요.', '단추가 안 보이면 선생님이 관리자 메뉴 → "카메라 판정기"에서 켜요.']],
    ['기록 승인 (선생님)', ['관리자 메뉴 → "기본 설정"에서 "승인 절차"를 켜면, 손으로 넣은 기록이 "기록 승인"에서 기다려요.', '"승인"·"거절"을 하나씩 누르거나 "모두 승인"으로 한꺼번에 승인해요. 그래프에는 승인한 기록만 쌓여요.', '카메라·스마트 줄넘기 기록은 승인 없이 바로 반영돼요. "카메라 판정기"에서 승인 대기로 바꿀 수 있어요.']],
    ['내 기록 보기 (학생)', ['메인 화면 그래프에서 내 막대를 누르거나, "표로 보기"에서 내 이름을 눌러요.', '비밀번호를 넣으면 "날짜별 기록"과 "나의 급수"가 보여요. 따로 정하지 않았으면 1234예요.']],
    ['급수 · 여행 · 인증서 (선생님)', ['"급수 인증"에서 학생이 선생님 앞에서 성공한 항목을 체크하고 "저장"해요.', '"우리 반 여행"에서 출발 도시를 고르면 1회를 1m로 바꿔 국토 대장정을 떠나요.', '"인증서 · 상장"에서 급수 인증서와 순위 상장을 출력해요.']],
    ['전국 현황판 · 학교 대결 (선생님)', ['"Jump Earth! 전국"에서 "점퍼스(전국 현황판)에 참여하기"를 켜고 학교 이름을 넣어요. 한 달 단위로 겨루고 매달 1일에 새로 시작해요.', '오늘 기록은 선생님 화면이 열려 있을 때 현황판으로 보내요. 하루에 한 번은 선생님 화면을 열어 주세요.', '"학교 대결"에서 "도전장 올리기"로 다른 학교와 대결 시간을 잡아요.']],
    ['함께 쓰는 선생님 · 다른 기기 (선생님)', ['선생님은 구글 로그인으로 들어와요. 관리자 메뉴 → "공간 관리"에서 "초대 코드 만들기"로 다른 선생님을 초대해요.', '새 기기에서 처음 열 때는 공간 비밀번호를 한 번 넣어요. 함께 쓰는 선생님께도 공간 비밀번호를 알려 주세요.']],
    ['비밀번호를 잊었을 때 · 새 학년 · 백업 (선생님)', ['학생 비밀번호는 "학생 관리"의 "비밀번호 변경" 칸에서 새로 정해 줘요.', '공간 비밀번호를 잊었으면 비밀번호 칸에 복구 코드를 넣어요. 복구 코드까지 잃으면 운영자도 열 수 없어요.', '"공간 관리"의 "엑셀 파일로 받기"·"백업 파일로 받기"로 기록을 내려받아 두세요. 새 학기에는 "비밀번호 · 초기화"의 "모든 기록 삭제"로 기록만 지워요.']],
]
def js(t): return "'" + t.replace("\\", "\\\\").replace("'", "\\'") + "'"
s = s[:i] + "  items: [\n" + ",\n".join("    [" + js(h[0]) + ", [" + ", ".join(js(x) for x in h[1]) + "]]" for h in HELP) + "\n  ],\n" + s[j:]
s = must(s, """      <h2>관리자 비밀번호 변경</h2>
      <p class="hint">초기 비밀번호는 <b>1234</b>입니다. 변경하면 다음 로그인부터 새 비밀번호가 적용됩니다.</p>
      <div class="form-row" style="align-items:flex-end;">""", """      <h2>관리자 비밀번호</h2>
      <p class="hint">점퍼스 3은 <b>구글 로그인</b>이 관리자 비밀번호를 대신해요. 공간 비밀번호·복구 코드·선생님 초대는 왼쪽 메뉴의 <b>공간 관리</b>에서 다뤄요.</p>
      <div class="form-row" style="align-items:flex-end; display:none;">""")
s = must(s, '필요하다면 학교 스프레드시트의 "파일 → 버전 기록"에서 미리 백업해두세요.', '먼저 <b>공간 관리 → 백업 파일로 받기</b>로 내려받아 두세요.')
s = must(s, "에서 쓰던 기록을 이 학교 시트로 옮겨요.", "에서 쓰던 기록을 이 공간으로 옮겨요. (시트판 점퍼스에서 옮기려면 왼쪽 메뉴의 <b>공간 관리 → 기록 옮겨 오기</b>)")
s = must(s, "이 기기가 기억한 우리 학교 시트로 열립니다.", "아이콘은 내 공간 목록으로 열려요.")
s = must(s, "'껍데기 <b>' + APP.shell.shell + '판</b> (최신)'", "'점퍼스 <b>' + (APP.shell.cloud || '') + '</b> · 학생 정보는 모두 암호화해서 저장합니다'")
s = must(s, '<title>줄넘기 기록 관리</title>', '<title>줄넘기 기록 관리</title>')
# 판 번호: 이 화면은 점퍼스 3 (시트로 쓰는 index.html 은 2.x 그대로)
import re
VER = re.search(r"const CLOUD_VERSION = '([0-9.]+)'", read('cloud/js/cloud.js')).group(1)
s, n = re.subn(r"const APP = \{ version: '[0-9.]+'", "const APP = { version: '" + VER + "'", s)
if n != 1: sys.exit('판 번호 자리를 못 찾았어요')
s = must(s, "' · 학교 껍데기 판: <b>' + APP.shell.shell + '</b> · 학교 시트: '", "' · 학교 공간: '")
write('index.html', '<!-- dev/make_cloud.py 가 index.html 에서 만든 파일 — 직접 고치지 말 것 -->\n' + s if not s.lstrip().lower().startswith('<!doctype') else s.replace('\n', '\n<!-- dev/make_cloud.py 가 index.html 에서 만든 파일 — 직접 고치지 말 것 -->\n', 1))
print('cloud/index.html · cloud/js/gasfake.js 만들었어요')
