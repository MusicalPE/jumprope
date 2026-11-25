# 국토 대장정 지형 띠 만들기 → img/journey/terrain-{m,h,p,b,s}.svg
# 외주로 받은 지형 묶음(2400x280)의 색·층 구조(far · mid · near, 위쪽 안개 #F4F9EE, 아래 땅 띠 #E7F0D8)를 그대로 따르되,
# 화면에서는 한 구간이 200px 남짓만 보여서 720px마다 되풀이되는 촘촘한 띠로 다시 그림. 모든 띠는 좌우 끝이 이어지고(같은 띠 반복),
# 층 높이·색이 띠끼리 비슷해서 화면에서 겹쳐 흐리게 넘겨도 경계가 튀지 않음.
import math, os, random
W, H = 720, 280
HAZE, GROUND, BAND = '#F4F9EE', 240, '#E7F0D8'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'img', 'journey')
f = lambda v: ('%.1f' % v).rstrip('0').rstrip('.')

def wave(base, comps):          # 720마다 되풀이되는 물결선 (comps: [(진폭, 주기 수, 위상)])
    return lambda x: base + sum(a * math.sin(2 * math.pi * k * x / W + p) for a, k, p in comps)
def area(fn, step=12, bottom=GROUND):   # 물결선 아래를 채운 면
    pts = [(x, fn(x)) for x in range(0, W + 1, step)]
    d = 'M0,%s ' % f(pts[0][1]) + ' '.join('L%s,%s' % (f(x), f(y)) for x, y in pts[1:]) + ' L%d,%d L0,%d Z' % (W, bottom, bottom)
    return d
def smooth(fn, step=24, bottom=GROUND):   # 부드러운 곡선 (2차 곡선으로 이어 붙임)
    xs = list(range(0, W + 1, step)); d = 'M0,%s' % f(fn(0))
    for a, b in zip(xs, xs[1:]):
        m = (a + b) / 2; d += ' Q%s,%s %s,%s' % (f(a + step * .25), f(fn(a + step * .25) * 1.0), f(m), f(fn(m))) if False else ''
    d = 'M0,%s' % f(fn(0)); prev = 0
    for x in xs[1:]:
        cx = (prev + x) / 2; d += ' Q%s,%s %s,%s' % (f(cx), f(2 * fn(cx) - (fn(prev) + fn(x)) / 2), f(x), f(fn(x))); prev = x
    return d + ' L%d,%d L0,%d Z' % (W, bottom, bottom)
def grad(i, a, b, y1, y2): return '<linearGradient id="%s" x1="0" y1="%d" x2="0" y2="%d" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="%s"/><stop offset="1" stop-color="%s"/></linearGradient>' % (i, y1, y2, a, b)
def pine(x, y, s=1, c='#4E8444', c2='#3F7238'):
    return ''.join('<path d="M%s,%s l%s,%s h%s Z" fill="%s"/>' % (f(x), f(y - (22 - i * 7) * s), f(-(5 + i * 2.2) * s), f((9 + i) * s), f((10 + i * 4.4) * s), c if i % 2 == 0 else c2) for i in range(3)) + '<rect x="%s" y="%s" width="%s" height="%s" fill="#7A5A3A"/>' % (f(x - 1.1 * s), f(y - 3 * s), f(2.2 * s), f(4 * s))
def tree(x, y, s=1, c='#6FA85A', c2='#8CBF72'):
    return '<rect x="%s" y="%s" width="%s" height="%s" fill="#8A6A45"/><circle cx="%s" cy="%s" r="%s" fill="%s"/><circle cx="%s" cy="%s" r="%s" fill="%s"/>' % (f(x - 1.2 * s), f(y - 9 * s), f(2.4 * s), f(9 * s), f(x), f(y - 14 * s), f(7.5 * s), c, f(x - 2.2 * s), f(y - 16 * s), f(4 * s), c2)
def house(x, y, s=1, roof='#E0704A'):
    return '<rect x="%s" y="%s" width="%s" height="%s" fill="#FBF6EA"/><path d="M%s,%s l%s,%s l%s,%s Z" fill="%s"/><rect x="%s" y="%s" width="%s" height="%s" fill="#B98B5E"/>' % (f(x - 8 * s), f(y - 9 * s), f(16 * s), f(9 * s), f(x - 10.5 * s), f(y - 9 * s), f(10.5 * s), f(-7.5 * s), f(10.5 * s), f(7.5 * s), roof, f(x - 1.8 * s), f(y - 5.5 * s), f(3.6 * s), f(5.5 * s))
def svg(defs, far, mid, near):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" preserveAspectRatio="none"><defs>%s</defs>' % (W, H, W, H, defs) +
            '<g id="far">%s</g><g id="mid">%s</g><g id="near">%s</g><rect x="0" y="%d" width="%d" height="%d" fill="%s"/></svg>' % (far, mid, near, GROUND, W, H - GROUND, BAND))
def peaks(pts, bottom=GROUND):   # 뾰족한 산줄기: [(x, y)] 봉우리·골짜기 번갈아. 끝점은 처음과 같은 높이
    return 'M' + ' L'.join('%s,%s' % (f(x), f(y)) for x, y in pts) + ' L%d,%d L0,%d Z' % (W, bottom, bottom)
def snow(pts, i, t=.3):       # i번째 점(봉우리)의 눈 모자
    (xa, ya), (x, y), (xb, yb) = pts[i - 1], pts[i], pts[i + 1]
    l = (x + (xa - x) * t, y + (ya - y) * t); r = (x + (xb - x) * t, y + (yb - y) * t); my = max(l[1], r[1])
    return '<path d="M%s,%s L%s,%s L%s,%s L%s,%s L%s,%s L%s,%s Z" fill="#fff" opacity=".92"/>' % (f(x), f(y), f(l[0]), f(l[1]), f(x - (x - l[0]) * .35), f(my - 3), f(x), f(my + 2.5), f(x + (r[0] - x) * .4), f(my - 3.5), f(r[0]), f(r[1]))

random.seed(7)
out = {}
# ---- m 산 (동쪽·강원): 눈 덮인 봉우리 + 가까운 능선의 소나무 ----
far = [(0, 132), (58, 84), (104, 118), (170, 70), (232, 122), (300, 96), (346, 126), (430, 76), (498, 124), (560, 92), (618, 128), (672, 108), (720, 132)]
mid = [(0, 178), (50, 150), (96, 172), (160, 136), (224, 176), (286, 152), (340, 180), (420, 140), (486, 178), (552, 156), (606, 182), (664, 160), (720, 178)]
near = wave(212, [(7, 2, .4), (3.5, 5, 1.7)])
out['m'] = svg(grad('a', HAZE, '#C3DDB6', 60, 150) + grad('b', '#9BC489', '#7DAF66', 130, 215) + grad('c', '#6D9F57', '#568743', 195, 240),
    '<path d="%s" fill="url(#a)"/>' % peaks(far) + ''.join(snow(far, i, .26) for i in (1, 3, 7, 9)),
    '<path d="%s" fill="url(#b)"/>' % peaks(mid) + ''.join(snow(mid, i, .16) for i in (3, 7)),
    '<path d="%s" fill="url(#c)"/>' % smooth(near) + ''.join(pine(x, near(x) + 3, s) for x, s in [(34, 1.1), (52, .85), (150, 1.2), (176, .9), (262, 1), (372, 1.15), (392, .8), (470, 1), (590, 1.2), (612, .9), (690, 1)]))
# ---- h 구릉 (내륙): 둥근 언덕 + 둥근 나무 + 집 ----
far = wave(128, [(10, 2, .2), (5, 3, 2.1)]); mid = wave(172, [(13, 3, 1.1), (5, 5, .3)]); near = wave(214, [(6, 2, 2.6), (3, 4, .9)])
out['h'] = svg(grad('a', HAZE, '#CFE5C3', 60, 150) + grad('b', '#A6CC92', '#86B870', 150, 215) + grad('c', '#79AC62', '#5F9450', 198, 240),
    '<path d="%s" fill="url(#a)"/>' % smooth(far),
    '<path d="%s" fill="url(#b)"/>' % smooth(mid) + ''.join(tree(x, mid(x) + 2, .8, '#7DAF66', '#98C785') for x in (70, 210, 236, 400, 548, 660)),
    '<path d="%s" fill="url(#c)"/>' % smooth(near) + ''.join(tree(x, near(x) + 3, s) for x, s in [(40, 1.05), (128, .9), (300, 1.1), (322, .85), (470, 1), (610, 1.1)]) + house(190, near(190) + 2, 1) + house(520, near(520) + 2, .9, '#5B8FD0'))
# ---- p 들판·논 (서쪽): 낮은 지평선 + 줄 맞춘 논 + 농가 ----
far = wave(150, [(5, 2, 1.3), (2.5, 3, .2)]); mid = wave(186, [(3, 2, .5)])
rows = ''
for k, (x0, w, c1, c2) in enumerate([(-20, 170, '#E3D27A', '#D2BE5E'), (160, 150, '#B7D68C', '#9CC272'), (320, 190, '#E8D98A', '#D6C468'), (520, 130, '#A9CE82', '#8FBA68'), (660, 110, '#E3D27A', '#D2BE5E')]):
    rows += '<path d="M%d,205 h%d l14,35 h%d Z" fill="%s"/>' % (x0, w, -(w + 28), c1) + ''.join('<path d="M%s,205 l%s,35" stroke="%s" stroke-width="1.6" fill="none"/>' % (f(x0 + w * t), f((t - .5) * 28), c2) for t in (.14, .28, .42, .56, .7, .84))
out['p'] = svg(grad('a', HAZE, '#D6E8C4', 60, 165) + grad('b', '#C9E0A2', '#B4D488', 170, 210),
    '<path d="%s" fill="url(#a)"/>' % smooth(far),
    '<path d="%s" fill="url(#b)"/>' % smooth(mid) + ''.join(tree(x, mid(x) + 2, .75, '#86B870', '#A6CC92') for x in (96, 118, 350, 600)) + house(250, mid(250) + 1, .8),
    '<rect x="0" y="203" width="%d" height="37" fill="#C7DC98"/>' % W + rows + tree(455, 214, 1) + house(84, 213, 1.05) + tree(60, 214, .9))
# ---- b 남해안: 먼 섬 + 바다 + 모래밭 ----
sea = '<rect x="0" y="150" width="%d" height="90" fill="url(#b)"/>' % W + ''.join('<path d="M%d,%d q9,-4 18,0 t18,0" stroke="#fff" stroke-width="1.6" fill="none" opacity=".75"/>' % (x, y) for x, y in [(60, 172), (250, 166), (430, 176), (600, 168), (150, 192), (520, 194), (340, 188)])
isl = lambda x, y, w, h, c: '<path d="M%s,%s q%s,%s %s,0 Z" fill="%s"/>' % (f(x - w / 2), f(y), f(w / 2), f(-h * 2), f(w), c)
sand = wave(218, [(5, 2, .9), (2.5, 5, 2.2)])
out['b'] = svg(grad('a', HAZE, '#D9EEF8', 60, 150) + grad('b', '#BFE6FA', '#5CC4F5', 150, 225) + grad('c', '#F6E7BE', '#EFD9A2', 205, 240),
    '<rect x="0" y="120" width="%d" height="32" fill="url(#a)"/>' % W + isl(120, 152, 150, 16, '#BFD9C9') + isl(470, 152, 200, 22, '#B5D3C2') + isl(650, 152, 90, 10, '#C6DDD0'),
    sea + isl(300, 180, 46, 12, '#8C9A8E') + isl(318, 181, 22, 7, '#7B897D') + isl(585, 186, 34, 9, '#8C9A8E') + pine(300, 172, .55),
    '<path d="%s" fill="#fff" opacity=".85"/>' % smooth(lambda x: sand(x) - 3.5) + '<path d="%s" fill="url(#c)"/>' % smooth(sand) + ''.join('<circle cx="%d" cy="%d" r="2.4" fill="#E3C98A"/>' % (x, y) for x, y in [(90, 232), (260, 229), (410, 234), (560, 230), (680, 233)]))
# ---- s 바다 (뱃길): 수평선 구름 + 물결 ----
cloud = lambda x, y, s: '<g fill="#fff" opacity=".9"><ellipse cx="%s" cy="%s" rx="%s" ry="%s"/><ellipse cx="%s" cy="%s" rx="%s" ry="%s"/><ellipse cx="%s" cy="%s" rx="%s" ry="%s"/></g>' % (f(x), f(y), f(22 * s), f(6 * s), f(x - 10 * s), f(y - 5 * s), f(11 * s), f(6 * s), f(x + 8 * s), f(y - 6 * s), f(13 * s), f(7 * s))
out['s'] = svg(grad('a', HAZE, '#D9EEF8', 60, 150) + grad('b', '#BFE6FA', '#4DBDF3', 150, 240),
    '<rect x="0" y="120" width="%d" height="32" fill="url(#a)"/>' % W + cloud(110, 140, 1) + cloud(400, 134, 1.25) + cloud(630, 142, .9),
    '<rect x="0" y="150" width="%d" height="90" fill="url(#b)"/>' % W,
    ''.join('<path d="M%d,%d q10,-5 20,0 t20,0 t20,0" stroke="#fff" stroke-width="%s" fill="none" opacity="%s"/>' % (x, y, w, o) for x, y, w, o in [(30, 170, 1.5, .7), (220, 164, 1.4, .65), (420, 172, 1.5, .7), (610, 166, 1.4, .65), (120, 192, 1.9, .8), (330, 198, 2, .8), (540, 190, 1.9, .8), (40, 218, 2.3, .85), (250, 222, 2.3, .85), (460, 216, 2.3, .85), (640, 222, 2.3, .85)]))
os.makedirs(OUT, exist_ok=True)
for k, v in out.items():
    open(os.path.join(OUT, 'terrain-%s.svg' % k), 'w', encoding='utf-8').write(v); print(k, len(v))
