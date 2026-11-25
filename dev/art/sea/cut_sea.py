"""받은 바다 그림(흰 체크무늬 배경) → 배경을 지워 img/journey/sea-*.webp
쓰는 법: python3 dev/art/sea/cut_sea.py <그림 폴더>  (폴더 안 p-000.png ~ p-005.png = 고래·돌고래·거북·물고기·화물선·돛단배)
흰색을 투명으로 바꾸는 방식(color to alpha): 물체는 불투명, 둘레의 옅은 물결은 반투명이라 띠의 바다에 자연스럽게 섞임"""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
OUT = os.path.join(ROOT, 'img', 'journey')
NAMES = ['whale', 'dolphin', 'turtle', 'fish', 'cargo', 'sail']
WATER = {'whale': 2.0, 'dolphin': 2.0, 'turtle': 2.0, 'fish': .9, 'cargo': 2.0, 'sail': 2.0}   # 물결 진하기
src = sys.argv[1]
for i, n in enumerate(NAMES):
    c = np.asarray(Image.open(os.path.join(src, f'p-{i:03d}.png')).convert('RGB')).astype(np.float32)
    a0 = ((255 - c).max(2) / 255)
    a = np.clip((a0 - 0.085) / 0.915, 0, 1)            # 체크무늬(238~255)는 0
    al = np.clip(a * WATER[n], 0, 1); al = np.maximum(al, a0 * (a > 0))   # 물체는 불투명, 물결은 반투명
    # 바깥 테두리와 이어진 흰 바탕만 배경. 그림 안쪽에 갇힌 흰 곳(돛·고래 배·물보라)은 불투명하게
    low = a0 < 0.16; lab, _ = ndimage.label(low)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    inner = low & ~np.isin(lab, list(edge))
    inner = ndimage.gaussian_filter(inner.astype(np.float32), 1.0)
    al = np.maximum(al, inner)
    # 따뜻한 색(크림색 돛·나무 배)은 바탕(무채색 흰·회색)과 달리 불투명하게
    warm = ndimage.gaussian_filter(np.clip((c[..., 0] - c[..., 2] - 6) / 10, 0, 1) * (a0 > 0.03), 0.8)
    al = np.maximum(al, warm)
    al[al < 0.02] = 0
    rgb = np.where(al[..., None] > 0, (c - (1 - al[..., None]) * 255) / np.maximum(al[..., None], 1e-3), 255)
    im = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), al * 255]).astype(np.uint8), 'RGBA')
    bb = im.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox(); im = im.crop(bb)
    im.thumbnail((520, 520), Image.LANCZOS)
    im.save(os.path.join(OUT, f'sea-{n}.webp'), quality=86, method=6)
    print(n, im.size, round(im.width / im.height, 3), os.path.getsize(os.path.join(OUT, f'sea-{n}.webp')))
