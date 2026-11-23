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
s = must(s, '<head>', '<head>\n<base href="../">')
s = must(s, "club: /\\/club\\//.test(location.pathname),", "club: false, cloud: true,")
s = must(s, "  else try { if (s) localStorage.setItem('jr_shell', s); else s = localStorage.getItem('jr_shell') || ''; } catch (e) {}\n", "  // 클라우드판: 주소에 공간이 없으면 [내 공간] 화면 (지난 공간으로 저절로 가지 않음)\n")
s = must(s, "  if (APP.demo) return demoRpc(fn, args);\n", "  if (APP.demo) return demoRpc(fn, args);\n  return window.JRCLOUD.call(fn, args);   // 클라우드판: 학교 시트 대신 파이어베이스\n")
s = must(s, "  if (!APP.shellUrl) return showSetup('');\n", "  if (!APP.shellUrl) return window.JRCLOUD.entry();\n  if (APP.q.page === 'space' && !APP.demo) return window.JRCLOUD.spacePage();\n")
s = must(s, "    showSetup('학교 시트에 연결하지 못했어요: ' + (err.message || err) + '<br>· 배포 설정의 \"액세스 권한\"이 <b>모든 사용자</b>인지 · 주소가 맞는지 확인해 주세요.');\n  });\n});", "    window.JRCLOUD.fail(err);\n  });\n});")
s = must(s, "'jumpropeAdminSession'", "('jumpropeCloud:' + APP.shellUrl)", s.count("'jumpropeAdminSession'"))
s = must(s, 'const nextPage = APP.q.next || "admin";\n', 'const nextPage = APP.q.next || "admin";\nif (!APP.demo) window.JRCLOUD.adminLogin(nextPage);   // 클라우드판: 선생님(구글 로그인)이면 비밀번호 없이 통과\n')
s = must(s, "JRQR.show(baseUrl)", "JRQR.show(APP.stuLink || baseUrl)", 2)
s = must(s, "const url = baseUrl, autoUrl = baseUrl + '&qr=1';", "const url = APP.stuLink || baseUrl, autoUrl = baseUrl + '&qr=1';")
s = must(s, '      <a class="nav-link" href="{{BASE}}">메인 화면 →</a>\n', '      <a class="nav-link" href="{{BASE}}">메인 화면 →</a>\n      <a class="nav-link jc-space" href="{{BASE}}&page=space">공간 관리 →</a>\n')
s = must(s, '</head>', '<script>window.APP = APP;</script>\n<script type="module" src="cloud/js/cloud.js"></script>\n</head>')
s = must(s, '<title>줄넘기 기록 관리</title>', '<title>줄넘기 기록 관리 · 클라우드판</title>')
write('index.html', '<!-- dev/make_cloud.py 가 index.html 에서 만든 파일 — 직접 고치지 말 것 -->\n' + s if not s.lstrip().lower().startswith('<!doctype') else s.replace('\n', '\n<!-- dev/make_cloud.py 가 index.html 에서 만든 파일 — 직접 고치지 말 것 -->\n', 1))
print('cloud/index.html · cloud/js/gasfake.js 만들었어요')
