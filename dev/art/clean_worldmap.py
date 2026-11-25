# 받은 세계 지도(2752x1536)에서 글자·코스 점선·핀·그려진 랜드마크·워터마크를 지워 바탕 지도만 남김
#   python3 dev/art/clean_worldmap.py <받은 지도.png> <저장할 바탕.png>
import sys, numpy as np, cv2
im = cv2.imread(sys.argv[1], cv2.IMREAD_COLOR); H, W = im.shape[:2]; s = W / 2576   # 아래 상자들은 2576 폭 기준으로 짚은 값
mask = np.zeros((H, W), np.uint8)
hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV); Hh, Ss, Vv = [hsv[..., i].astype(int) for i in range(3)]
# 지도 바탕 색(바다·풀밭·모래·해안 크림색)이 아닌 점 = 글자나 그려진 그림
mapcol = (((Hh >= 88) & (Hh <= 112) & (Vv > 170)) |                       # 바다
          ((Hh >= 28) & (Hh <= 62) & (Ss > 40) & (Vv > 110)) |            # 풀밭
          ((Hh >= 14) & (Hh <= 32) & (Ss > 25) & (Ss < 120) & (Vv > 185)))  # 모래·해안선
def box(x0, y0, x1, y1, pad=6, text=False, rect=False):   # 상자 안에서 바탕색이 아닌 점만 지움 (상자째 지우면 해안선까지 뭉개짐)
    X0, Y0, X1, Y1 = int(x0 * s) - pad, int(y0 * s) - pad, int(x1 * s) + pad, int(y1 * s) + pad
    if rect: mask[Y0:Y1, X0:X1] = 255; return   # 해안선에서 먼 곳(사막 한가운데 등)은 상자째
    odd = ((Hh >= 4) & (Hh <= 24) & (Ss > 95)) | (Vv < 125)                    # 갈색·주황 그림, 짙은 테두리
    sub = (Vv[Y0:Y1, X0:X1] < 130) if text else (~mapcol[Y0:Y1, X0:X1] | odd[Y0:Y1, X0:X1])
    m = sub.astype(np.uint8) * 255; m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)); m = cv2.dilate(m, np.ones((5 if text else 7, 5 if text else 7), np.uint8))
    mask[Y0:Y1, X0:X1] |= m
# 글자
for b in [(100, 748, 222, 778), (625, 946, 692, 978), (606, 1112, 720, 1142), (840, 1151, 1006, 1182), (1293, 1150, 1433, 1182), (1556, 1008, 1748, 1044),
          (1367, 693, 1438, 724), (1295, 603, 1371, 634), (1560, 603, 1633, 634), (1895, 533, 1953, 564), (2039, 536, 2145, 567), (2177, 583, 2255, 614), (2055, 653, 2138, 684)]: box(*b, pad=4, text=True)
# 그려진 랜드마크 (우리 그림으로 바꿔 얹음) — 해안에 걸친 것은 그림 점만, 땅 한가운데·바다 한가운데는 상자째
for b in [(1748, 488, 1847, 564), (1873, 483, 1947, 534), (1562, 628, 1640, 662), (1788, 588, 1872, 652), (1133, 703, 1227, 802), (2418, 1283, 2522, 1382)]: box(*b, rect=True)
for b in [(1208, 452, 1262, 548), (1268, 532, 1342, 580), (1408, 518, 1502, 597), (1358, 650, 1442, 694), (98, 618, 212, 722), (388, 556, 462, 632), (486, 612, 507, 642), (488, 673, 584, 737),
          (688, 912, 762, 988), (723, 1083, 797, 1157), (798, 1053, 840, 1152), (1321, 1078, 1435, 1114), (1198, 788, 1247, 837), (1278, 828, 1337, 897), (1298, 913, 1352, 972), (1296, 1003, 1354, 1072), (2000, 540, 2045, 640), (1425, 640, 1450, 672)]: box(*b)
# 주황 코스 점선·핀 (색으로)
hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV); b, g, r = [im[..., i].astype(int) for i in range(3)]
orange = ((r > 190) & (g > 70) & (g < 160) & (b < 120) & (r - g > 60)).astype(np.uint8) * 255
mask |= cv2.dilate(orange, np.ones((7, 7), np.uint8))
out = cv2.inpaint(im, mask, 5, cv2.INPAINT_NS)
# 한반도·일본 자리: 바다로 칠해 두고(그 위에 make_worldmap.py 가 실제 모양으로 다시 그림). 바다색은 일본 동쪽 바다에서 줄마다 따옴
reg = np.array([[2072, 498], [2140, 462], [2218, 428], [2236, 470], [2236, 655], [2060, 660], [2046, 610], [2066, 560]], np.float32) * s
rm = np.zeros((H, W), np.uint8); cv2.fillPoly(rm, [reg.astype(np.int32)], 255); rm = cv2.GaussianBlur(rm, (0, 0), 3)
col = out[:, int(2246 * s):int(2262 * s)].astype(float).mean(axis=1)            # 줄마다 바다색
sea = np.repeat(col[:, None, :], W, axis=1); a = (rm.astype(float) / 255)[..., None]
out = (out * (1 - a) + sea * a).astype(np.uint8)
cv2.imwrite(sys.argv[2], out); cv2.imwrite(sys.argv[2].replace('.png', '_mask.png'), mask)
