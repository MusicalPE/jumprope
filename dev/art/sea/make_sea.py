"""지구 대장정 바다 꾸밈 그림(고래·돌고래·거북·물고기·화물선·돛단배) → img/journey/sea-*.webp
쓰는 법: python3 dev/art/sea/make_sea.py  (저장소 맨 위에서)"""
import os, sys
from playwright.sync_api import sync_playwright
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
OUT = os.path.join(ROOT, 'img', 'journey')
INK = '#2C5F86'   # 부드러운 남색 윤곽
RIP = '<path d="M{x0} {y} q{q} -7 {w2} 0 t{w2} 0" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".85"/>'
def rip(x0, y, w): return RIP.format(x0=x0, y=y, q=w/4, w2=w/2)
S = {}
S['whale'] = (240, 160, f'''
<defs><linearGradient id="wb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5F9FD6"/><stop offset="1" stop-color="#3B78B5"/></linearGradient></defs>
<g stroke="{INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
 <path d="M112 34 q-6 -16 -16 -20 M112 34 q2 -18 0 -26 M112 34 q8 -16 18 -20" fill="none" stroke="#8FD0F2" stroke-width="5"/>
 <path d="M28 112 C 30 70, 80 52, 130 56 C 172 59, 196 82, 198 104 L 204 98 C 214 84, 228 76, 236 80 C 230 92, 222 104, 214 110 C 222 116, 230 126, 232 136 C 220 136, 208 128, 200 118 C 186 132, 150 140, 108 138 C 60 136, 28 130, 28 112 Z" fill="url(#wb)"/>
 <path d="M40 120 C 70 132, 130 134, 180 120 C 170 132, 140 138, 108 138 C 70 137, 46 131, 40 120 Z" fill="#CFE6F6" stroke="none"/>
 <path d="M96 116 q16 14 34 6" fill="none" stroke="{INK}" stroke-width="3"/>
</g>
<circle cx="66" cy="92" r="6" fill="{INK}"/><circle cx="68" cy="90" r="2" fill="#fff"/>
<circle cx="54" cy="106" r="7" fill="#F4A3A3" opacity=".7"/>
<path d="M60 70 q30 -12 64 -8" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".45"/>
{rip(10,146,90)}{rip(140,150,80)}''')
S['dolphin'] = (220, 160, f'''
<defs><linearGradient id="db" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8FB4D6"/><stop offset="1" stop-color="#5D88B5"/></linearGradient></defs>
<g stroke="{INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
 <path d="M30 120 C 40 70, 90 34, 140 34 C 160 34, 176 40, 186 50 L 206 52 C 200 58, 192 60, 184 60 C 186 70, 182 80, 172 84 C 160 70, 140 64, 120 70 C 90 80, 66 100, 56 126 L 68 142 C 56 142, 42 138, 34 130 C 26 136, 14 136, 8 132 C 16 126, 24 122, 30 120 Z" fill="url(#db)"/>
 <path d="M118 36 C 112 22, 116 12, 126 6 C 128 18, 134 28, 142 34 Z" fill="url(#db)"/>
 <path d="M112 72 C 104 86, 104 96, 110 104 C 118 94, 124 84, 126 72 Z" fill="url(#db)"/>
</g>
<circle cx="168" cy="52" r="4.5" fill="{INK}"/><circle cx="169.5" cy="50.5" r="1.5" fill="#fff"/>
<path d="M190 58 q-6 4 -12 2" fill="none" stroke="{INK}" stroke-width="2.5" stroke-linecap="round"/>
<g fill="#BFE6F8" stroke="#fff" stroke-width="2"><circle cx="40" cy="146" r="5"/><circle cx="56" cy="150" r="3.5"/><circle cx="24" cy="148" r="3"/></g>
{rip(4,154,80)}{rip(110,154,70)}''')
S['turtle'] = (200, 140, f'''
<g stroke="{INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
 <path d="M150 70 C 166 60, 186 62, 192 74 C 194 86, 180 92, 164 88 Z" fill="#9FD27E"/>
 <path d="M60 50 C 40 34, 20 30, 12 38 C 16 50, 36 58, 58 62 Z" fill="#9FD27E"/>
 <path d="M140 100 C 150 116, 160 126, 150 132 C 136 128, 128 116, 124 104 Z" fill="#9FD27E"/>
 <path d="M60 98 C 44 108, 30 118, 34 126 C 48 126, 62 116, 72 104 Z" fill="#9FD27E"/>
 <path d="M44 84 C 44 50, 80 32, 110 34 C 142 36, 160 58, 156 86 C 150 106, 120 114, 96 112 C 66 110, 44 100, 44 84 Z" fill="#6FA85A"/>
 <path d="M82 50 L 110 46 L 128 62 L 120 86 L 92 92 L 72 74 Z" fill="#8CC46F"/>
 <path d="M82 50 L 72 40 M110 46 L 114 36 M128 62 L 146 56 M120 86 L 136 100 M92 92 L 86 108 M72 74 L 50 78" fill="none"/>
</g>
<circle cx="182" cy="72" r="3.5" fill="{INK}"/>
<path d="M90 54 q18 -10 34 2" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".5"/>''')
S['fish'] = (180, 110, ''.join(f'''
<g transform="translate({x} {y}) scale({s})" stroke="{INK}" stroke-width="3" stroke-linejoin="round">
 <path d="M0 20 C 10 4, 38 0, 52 16 L 66 6 C 64 16, 64 24, 66 34 L 52 24 C 38 40, 10 36, 0 20 Z" fill="{c}"/>
 <path d="M24 8 C 26 18, 26 24, 24 32" fill="none" stroke="#fff" stroke-width="3" opacity=".7"/>
 <circle cx="12" cy="17" r="3" fill="{INK}" stroke="none"/></g>''' for x, y, s, c in [(14, 14, 1.0, '#FFB44C'), (86, 40, .85, '#FF8E5E'), (40, 66, .75, '#FFC966')]))
S['cargo'] = (260, 170, f'''
<g stroke="{INK}" stroke-width="3" stroke-linejoin="round">
 <rect x="168" y="42" width="44" height="54" rx="4" fill="#F6F2E8"/>
 <rect x="176" y="52" width="10" height="9" rx="2" fill="#8FD0F2"/><rect x="194" y="52" width="10" height="9" rx="2" fill="#8FD0F2"/>
 <rect x="180" y="20" width="16" height="24" rx="2" fill="#E85B4A"/><rect x="180" y="20" width="16" height="7" fill="#33404D"/>
 <rect x="36" y="72" width="30" height="24" fill="#F2A541"/><rect x="66" y="72" width="30" height="24" fill="#4BA3C7"/><rect x="96" y="72" width="30" height="24" fill="#7CBF6B"/><rect x="126" y="72" width="30" height="24" fill="#E8726A"/>
 <rect x="51" y="48" width="30" height="24" fill="#E8726A"/><rect x="81" y="48" width="30" height="24" fill="#F2C94C"/><rect x="111" y="48" width="30" height="24" fill="#4BA3C7"/>
 <path d="M14 96 L 246 96 L 226 140 L 34 140 Z" fill="#D9473B"/>
 <path d="M22 112 L 238 112" stroke="#fff" stroke-width="4"/>
</g>
<g stroke="{INK}" stroke-width="1.5" opacity=".5"><path d="M44 74v20M54 74v20M74 74v20M84 74v20M104 74v20M114 74v20M134 74v20M144 74v20M59 50v20M69 50v20M89 50v20M99 50v20M119 50v20M129 50v20" fill="none"/></g>
<circle cx="60" cy="124" r="5" fill="#fff" stroke="{INK}" stroke-width="2.5"/>
{rip(4,154,110)}{rip(130,158,110)}''')
S['sail'] = (180, 190, f'''
<g stroke="{INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
 <path d="M92 14 L 92 134" fill="none" stroke-width="4"/>
 <path d="M96 20 C 130 50, 150 96, 156 126 L 96 126 Z" fill="#FFFDF7"/>
 <path d="M88 34 C 64 64, 46 100, 40 126 L 88 126 Z" fill="#F7E3C4"/>
 <path d="M92 14 L 118 22 L 92 30 Z" fill="#E85B4A"/>
 <path d="M22 134 L 162 134 C 156 152, 140 164, 120 166 L 60 166 C 40 164, 28 152, 22 134 Z" fill="#B97A4A"/>
 <path d="M30 146 L 154 146" stroke="#8E5A33" stroke-width="3"/>
</g>
<path d="M104 40 C 124 64, 136 92, 140 112" fill="none" stroke="#fff" stroke-width="4" opacity=".6" stroke-linecap="round"/>
{rip(4,178,80)}{rip(96,180,80)}''')
html = lambda w, h, body: f'<html><body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{body}</svg></body></html>'
only = sys.argv[1:]
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(device_scale_factor=2)
    for name, (w, h, body) in S.items():
        if only and name not in only: continue
        pg.set_viewport_size({'width': w, 'height': h}); pg.set_content(html(w, h, body))
        png = os.path.join(OUT, f'sea-{name}.png'); pg.locator('svg').screenshot(path=png, omit_background=True)
        Image.open(png).save(png[:-4] + '.webp', quality=88); os.remove(png); print('sea-' + name + '.webp')
