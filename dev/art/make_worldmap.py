# 지구 대장정 코스 지도 → img/earth-route.webp
#   바탕: 받은 세계 지도를 clean_worldmap.py 로 지운 것.  위에 코스(실제 경로) · 도시 핀 · 한글 이름 · 랜드마크(img/journey/w-*.webp)를 얹어 찍음
#   python3 dev/art/make_worldmap.py <바탕.png> [미리보기 폴더]
import sys, os, math, json, re
from playwright.sync_api import sync_playwright
BASE = os.path.abspath(sys.argv[1]); OUTDIR = sys.argv[2] if len(sys.argv) > 2 else None
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
BW, BH = 2752, 1536; OW = 1600; K = OW / BW; OH = round(BH * K)
# 바탕 지도에 맞춘 투영 (밀러 도법, 해안 9곳으로 맞춤)
def P(lat, lon):
    y = 1.25 * math.degrees(math.log(math.tan(math.pi / 4 + 0.4 * math.radians(lat))))
    return ((7.201 * lon + 1297.429) * K, (-7.846 * y + 935.027) * K)
# 한반도는 작게 나와서 1.6배로 키워 그림 (인천항·부산항 핀도 같이)
KC = P(36.4, 127.8)
def PK(lat, lon): x, y = P(lat, lon); return (KC[0] + (x - KC[0]) * 1.6, KC[1] + (y - KC[1]) * 1.6)
src = open(os.path.join(ROOT, 'board.html'), encoding='utf-8').read()
ej = re.search(r"const EJ = (\[\[.*?\]\]);", src, re.S).group(1).replace("'", '"')
EJ = json.loads(ej)
LM = dict(re.findall(r"'([^']+)': '([a-z]+)'", re.search(r"const EJ_LM = \{(.*?)\};", src).group(1)))
# 도시마다 [랜드마크 dx, dy, 이름 dx, dy] (붐비는 곳은 옆으로 빼고 가는 선으로 이음)
OFF = {'인천항': (30, -40, -40, -10), '칭다오': (-50, 60, -36, 18), '베이징': (8, -52, -34, 18), '울란바토르': (-40, -14, 0, -12), '부산항': (62, 78, 10, 30), '도쿄': (44, -30, 34, 8),
       '이스탄불': (34, -58, 30, 4), '로마': (6, -64, -2, 24), '파리': (-6, -14, 0, 22), '마드리드': (-44, -30, -14, 22), '탕헤르': (-62, 36, -40, 20), '카이로': (34, 50, 36, 20), '테헤란': (10, 54, 0, 24),
       '다카르': (-56, 14, 0, 22), '라고스': (-44, 52, 0, 22), '킨샤사': (44, 26, 22, 22), '케이프타운': (0, 6, 0, 26), '부에노스아이레스': (48, 24, 40, 24), '산티아고': (-56, 26, -18, 22), '리마': (-54, -4, -12, 22),
       '보고타': (36, -32, 8, 22), '멕시코시티': (10, 12, 0, 24), '로스앤젤레스': (-48, -10, -10, 22), '호놀룰루': (0, 4, 0, 26), '우루무치': (14, -8, 22, 22), '알마티': (6, 50, -16, 22), '타슈켄트': (-24, -50, -10, 22)}
pts = [PK(c[1], c[2]) if c[0] in ('인천항', '부산항') else P(c[1], c[2]) for c in EJ]
# 코스: 땅 길은 도시를 부드럽게 잇고, 뱃길은 바다 쪽으로 휘게
def seg(i):
    (x0, y0), (x1, y1) = pts[i - 1], pts[i]; c = EJ[i]
    if c[0] == '도쿄':   # 호놀룰루 → 서쪽으로 날짜 변경선을 넘어 → 도쿄 (지도 왼쪽 끝으로 나갔다가 오른쪽 끝에서 들어옴)
        return 'M%.1f %.1f Q%.1f %.1f %.1f %.1f M%.1f %.1f Q%.1f %.1f %.1f %.1f' % (x0, y0, x0 * .5, y0 + 6, -4, y0 - 10, OW + 4, y0 - 10, (OW + x1) / 2, y1 + 30, x1, y1)
    if c[3]:
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2; L = math.hypot(x1 - x0, y1 - y0); bow = {'칭다오': -.25, '이스탄불': .3, '탕헤르': .25, '부에노스아이레스': .18, '호놀룰루': .2, '부산항': .4}.get(c[0], .2)
        nx, ny = -(y1 - y0) / (L or 1), (x1 - x0) / (L or 1)
        return 'M%.1f %.1f Q%.1f %.1f %.1f %.1f' % (x0, y0, mx + nx * L * bow, my + ny * L * bow, x1, y1)
    return 'M%.1f %.1f L%.1f %.1f' % (x0, y0, x1, y1)
route = ''.join('<path d="%s" class="r%s"/>' % (seg(i), ' sea' if EJ[i][3] or EJ[i][0] == '도쿄' else '') for i in range(1, len(EJ)))
lm = ''; pins = ''; lbl = ''
for i, c in enumerate(EJ):
    x, y = pts[i]; o = OFF.get(c[0], (0, -6, 0, 18)); big = len(c) > 5 and c[5]; end = i in (0, len(EJ) - 1)
    sz = 74 if big or end else 60; lx, ly = x + o[0], y + o[1]
    if math.hypot(o[0], o[1]) > 24: lm += '<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" class="lead"/>' % (x, y, lx, ly - sz * .35)
    if c[0] in LM: lm += '<image href="file://%s/img/journey/w-%s.webp" x="%.1f" y="%.1f" width="%d" height="%d" preserveAspectRatio="xMidYMax meet"/>' % (ROOT, LM[c[0]], lx - sz / 2, ly - sz, sz, sz)
    pins += '<circle cx="%.1f" cy="%.1f" r="%d" class="p%s"/>' % (x, y, 7 if end else 5.5 if big else 4.5, ' end' if end else '')
    lbl += '<text x="%.1f" y="%.1f" class="t%s">%s</text>' % (x + o[2], y + o[3], ' b' if big or end else '', c[0] + (' 출발' if i == 0 else ' 도착' if i == len(EJ) - 1 else ''))
# 한반도·일본: 바탕에서 지워진 자리를 같은 결로 다시 그림 [위도, 경도]
KOR = [(40.0, 124.4), (40.9, 126.0), (42.0, 128.3), (42.4, 130.6), (41.0, 129.8), (39.9, 128.4), (39.0, 127.5), (37.8, 128.8), (36.0, 129.45), (35.2, 129.3), (34.8, 128.5), (34.6, 127.5), (34.3, 126.4), (35.0, 126.3), (36.0, 126.6), (36.8, 126.1), (37.6, 126.6), (37.7, 125.4), (38.1, 124.7), (38.7, 125.1), (39.6, 124.7)]
JPN = [[(34.0, 130.9), (34.3, 132.5), (34.6, 135.0), (34.6, 136.9), (35.0, 139.8), (35.7, 140.9), (37.5, 141.0), (38.5, 141.5), (40.0, 141.9), (41.4, 141.4), (40.8, 140.0), (39.5, 139.9), (38.2, 139.4), (37.4, 138.5), (36.8, 137.0), (35.9, 136.0), (35.5, 133.0), (34.5, 131.0)],
       [(33.2, 129.8), (33.9, 130.2), (33.9, 131.0), (33.0, 131.9), (31.4, 131.4), (31.2, 130.2), (32.6, 130.0)],
       [(41.5, 140.0), (41.8, 141.2), (42.0, 143.3), (43.3, 145.5), (44.0, 144.5), (45.4, 141.8), (44.0, 141.6), (43.3, 140.3), (42.5, 139.9)],
       [(34.3, 132.6), (33.9, 134.7), (33.4, 134.2), (32.8, 132.9)]]
JEJU = [(33.55, 126.2), (33.55, 126.95), (33.25, 126.95), (33.2, 126.2)]
HAW = [[(22.2, -159.8), (22.25, -159.3), (21.9, -159.3), (21.9, -159.75)], [(21.7, -158.3), (21.6, -157.65), (21.25, -157.65), (21.3, -158.25)], [(21.2, -157.3), (21.1, -156.7), (20.9, -156.0), (20.6, -156.4), (20.8, -156.9)], [(20.25, -155.9), (19.9, -154.8), (19.0, -155.6), (19.9, -156.05)]]
def poly(ll, f=P):
    q = [f(a, b) for a, b in ll]; s = 'M%.1f %.1f' % q[0]
    for i in range(len(q)):   # 부드럽게 (가운데 점을 이은 2차 곡선)
        a, b = q[i], q[(i + 1) % len(q)]; s += ' Q%.1f %.1f %.1f %.1f' % (a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    return '<path d="%s Z" class="land"/>' % s
land = poly(KOR, PK) + poly(JEJU, PK) + ''.join(poly(p) for p in JPN + HAW)
html = '''<!doctype html><meta charset="utf-8"><style>body{margin:0}svg{display:block}
.land{fill:#8DBE6C;stroke:#F5E7BD;stroke-width:3.2;stroke-linejoin:round;paint-order:stroke}
path.r{fill:none;stroke:#F26A3D;stroke-width:3.6;stroke-linecap:round;stroke-dasharray:1 8}
path.r.sea{stroke-dasharray:7 7;stroke-linecap:butt;stroke-width:3;opacity:.95}
.lead{stroke:#8A6A45;stroke-width:1.2;stroke-dasharray:2 3;opacity:.7}
circle.p{fill:#fff;stroke:#F26A3D;stroke-width:3}circle.p.end{fill:#F26A3D;stroke:#fff}
text.t{font:700 17px "Pretendard","Noto Sans KR",sans-serif;fill:#173F5F;text-anchor:middle;paint-order:stroke;stroke:#fff;stroke-width:4;stroke-linejoin:round}text.t.b{font-size:19px;font-weight:800}
image{filter:drop-shadow(0 2px 2px rgba(30,60,90,.25))}</style>
<svg width="%d" height="%d" viewBox="0 0 %d %d"><image href="file://%s" width="%d" height="%d" style="filter:none"/>%s%s%s%s%s</svg>''' % (OW, OH, OW, OH, BASE, OW, OH, land, route, lm, pins, lbl)
tmp = os.path.join(OUTDIR or '/tmp', 'worldmap.html'); open(tmp, 'w', encoding='utf-8').write(html)
with sync_playwright() as p:
    b = p.chromium.launch(args=['--allow-file-access-from-files']); pg = b.new_page(viewport={'width': OW, 'height': OH}, device_scale_factor=1)
    pg.goto('file://' + tmp); pg.wait_for_timeout(800); png = os.path.join(OUTDIR or '/tmp', 'worldmap.png'); pg.screenshot(path=png)
from PIL import Image
Image.open(png).convert('RGB').save(os.path.join(OUTDIR, 'earth-route.webp') if OUTDIR else os.path.join(ROOT, 'img', 'earth-route.webp'), 'WEBP', quality=86, method=6)
print('ok', OW, OH)
