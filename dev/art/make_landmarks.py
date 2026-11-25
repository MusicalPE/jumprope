# 국토 대장정 도시 랜드마크: 받은 그림(2000x2000, 흰 바탕)의 바탕을 지우고 작게 줄여 img/journey/lm-*.webp 로 저장
#   python3 dev/art/make_landmarks.py <받은 그림 폴더>     (파일 이름은 아래 SRC 참고)
import sys, os, colorsys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
SRC = {'seoul': '1fda7bdb', 'school': 'ab0b8961', 'jeonju': '0ff79aa1', 'gwangju': '1fbcdce7', 'jeju': 'f4633902', 'yeosu': 'a7bd0a10',
       'busan': '4efd2915', 'pohang': '6ac2406f', 'andong': '5a5548e0', 'gangneung': '5222b13d', 'chuncheon': '8fa688e1', 'daejeon': 'ed28c6af', 'mokpo': '31e6eaad'}
D = sys.argv[1]; OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'img', 'journey')
def cut(im, thresh):
    im = im.convert('RGB'); w, h = im.size; key = (255, 0, 255)
    work = im.copy()
    for x in range(0, w, 8):
        for y in (0, h - 1):
            if work.getpixel((x, y)) != key: ImageDraw.floodfill(work, (x, y), key, thresh=thresh)
    for y in range(0, h, 8):
        for x in (0, w - 1):
            if work.getpixel((x, y)) != key: ImageDraw.floodfill(work, (x, y), key, thresh=thresh)
    a = np.asarray(work); bg = (a[..., 0] == 255) & (a[..., 1] == 0) & (a[..., 2] == 255)
    alpha = Image.fromarray((~bg * 255).astype('uint8')).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(1.6))   # 가장자리 흰 테를 살짝 깎음
    out = im.convert('RGBA'); out.putalpha(alpha); return out
for k, pre in SRC.items():
    f = [x for x in os.listdir(D) if x.startswith(pre)][0]; im = Image.open(os.path.join(D, f))
    if k == 'daejeon':   # 투명 바탕 대신 바둑판 무늬가 그려져 온 그림: 흰색·연회색 칸을 한 색으로 뭉갠 뒤 지움
        a = np.asarray(im.convert('RGB')).astype(int); gray = (abs(a[..., 0] - a[..., 1]) < 6) & (abs(a[..., 1] - a[..., 2]) < 6) & (a.min(axis=2) > 205)
        a[gray] = 255; im = Image.fromarray(a.astype('uint8'))
    if k == 'pohang':    # 살색 손 → 청동 조각상 색 (물에서 손이 올라온 모습이 사람 손처럼 보이지 않게)
        a = np.asarray(im.convert('RGB')).astype(float) / 255; r, g, b = a[..., 0], a[..., 1], a[..., 2]
        hand = (r > g + .12) & (g > b + .04) & (r > .55)
        lum = (.3 * r + .59 * g + .11 * b)
        for c, t in enumerate((0.36, 0.56, 0.52)): a[..., c] = np.where(hand, np.clip(lum * 1.15 * t / .5, 0, 1), a[..., c])
        im = Image.fromarray((a * 255).astype('uint8'))
    o = cut(im, 22 if k != 'daejeon' else 6)
    o = o.crop(o.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()); w, h = o.size; s = 220 / max(w, h)
    o = o.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS); o.save(os.path.join(OUT, 'lm-%s.webp' % k), 'WEBP', quality=86, method=6); print(k, o.size)

# ---- 지구 대장정 도시 랜드마크 (27개, 1024x1024 JPEG 흰 바탕):  python3 dev/art/make_landmarks.py <국내 그림 폴더> <세계 그림 폴더> → img/journey/w-*.webp
WORLD = {'1': 'mexicocity', '10': 'madrid', '11': 'tashkent', '12': 'tangier', '13': 'lagos', '14': 'tehran', '15': 'istanbul', '16': 'qingdao', '17': 'rome', '18': 'urumqi', '19': 'capetown',
         '2': 'honolulu', '20': 'dakar', '21': 'beijing', '22': 'ulaanbaatar', '23': 'paris', '24': 'cairo', '25': 'tokyo', '27': 'incheon', '3': 'busanport', '4': 'losangeles', '5': 'bogota',
         '6': 'lima', '7': 'santiago', '8': 'buenosaires', '9': 'almaty', '': 'kinshasa'}
if len(sys.argv) > 2:
    import re
    for f in sorted(os.listdir(sys.argv[2])):
        m = re.match(r'Gemini_Generated_Image(?: \((\d+)\))?\.jpe?g$', f); k = WORLD.get(m.group(1) or '') if m else None
        if not k: continue
        o = cut(Image.open(os.path.join(sys.argv[2], f)), 26)
        o = o.crop(o.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()); w, h = o.size; s = 200 / max(w, h)
        o = o.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS); o.save(os.path.join(OUT, 'w-%s.webp' % k), 'WEBP', quality=84, method=6)
    print('world', len([x for x in os.listdir(OUT) if x.startswith('w-')]))
