"""받은 갈매기 그림(흰 체크무늬 바탕 위의 흰 새) → img/journey/sea-gull-1~3.webp
쓰는 법: python3 dev/art/sea/cut_gulls.py <그림 폴더>   (폴더 안 g-000.png ~ g-002.png)
바탕 체크무늬는 완전한 무채색(R=G=B)이고 새는 살짝 따뜻하거나(몸) 차가운(날개) 색이라 색 기운으로 가름"""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
OUT = os.path.join(ROOT, 'img', 'journey')
src = sys.argv[1]
for i in range(3):
    c = np.asarray(Image.open(os.path.join(src, f'g-{i:03d}.png')).convert('RGB')).astype(np.float32)
    tint = np.abs(c[..., 0] - c[..., 2]) >= 3
    dark = c.min(2) < 236
    m = ndimage.binary_opening(tint | dark, iterations=2)
    m = ndimage.binary_fill_holes(ndimage.binary_closing(m, iterations=6))
    lab, n = ndimage.label(m); sizes = ndimage.sum(m, lab, range(1, n + 1))
    m = lab == (1 + int(np.argmax(sizes)))                      # 가장 큰 덩어리(새)만
    m = ndimage.binary_erosion(m, iterations=1)
    al = ndimage.gaussian_filter(m.astype(np.float32), 1.4)
    im = Image.fromarray(np.dstack([c, al * 255]).astype(np.uint8), 'RGBA')
    im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox())
    im.thumbnail((360, 360), Image.LANCZOS)
    p = os.path.join(OUT, f'sea-gull-{i + 1}.webp'); im.save(p, quality=88, method=6)
    print(os.path.basename(p), im.size, round(im.width / im.height, 3))
