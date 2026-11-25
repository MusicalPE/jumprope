// 지구 대장정 코스 지도 바탕을 실제 해안선 자료(Natural Earth 1:50m, npm world-atlas)로 그림 — 받은 제미나이 지도 느낌(크림색 해안선·초록 풀밭·모래 사막·작은 나무·물결)
//   node dev/art/draw_worldmap.mjs <저장 폴더>   → base.svg, cities.json(도시 위치)
//   필요: npm i world-atlas@2.0.2 topojson-client@3.1.0 d3-geo@3.1.1 d3-geo-projection@4.0.0
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const require = createRequire(process.cwd() + '/'); const topo = require('topojson-client'); const d3 = await import(require.resolve('d3-geo')); const d3p = await import(require.resolve('d3-geo-projection'));
const OUT = process.argv[2]; const W = 1600, H = 893;
const world = JSON.parse(fs.readFileSync(require.resolve('world-atlas/land-50m.json'))); const land0 = topo.feature(world, world.objects.land);
// 남극은 빼고 (위도 -60 아래만 있는 덩어리), 작은 섬도 뺌 — 코스에 나오는 하와이·제주는 남김
const near = (poly, lo0, lo1, la0, la1) => poly[0].some(([lo, la]) => lo >= lo0 && lo <= lo1 && la >= la0 && la <= la1);
const keep = poly => (d3.geoArea({ type: 'Polygon', coordinates: poly }) > 1.2e-4) || near(poly, -161, -154, 18, 23) || near(poly, 126, 127.1, 33, 33.7);
const land = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: (land0.features[0].geometry.coordinates).filter(poly => poly[0].some(([lo, la]) => la > -60) && keep(poly)) } }] };
const proj = d3p.geoMiller().scale(W / (2 * Math.PI)).translate([W / 2, 0]); const top = proj([0, 84])[1]; proj.translate([W / 2, 22 - top]);
const gp = d3.geoPath(proj); const P = (lon, lat) => proj([lon, lat]);
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const inLand = (lon, lat) => d3.geoContains(land, [lon, lat]);
// 지형 얼룩 [경도, 위도, 반지름(도), 색]
const SAND = '#F4E6BC', DEEP = '#6FA557', PALE = '#D8EBCF', SOFT = '#A9CE84';
const blobs = [];
[[-8, 22, 9], [5, 24, 10], [18, 22, 10], [28, 24, 8], [45, 23, 8], [55, 30, 5], [71, 27, 3.5], [60, 42, 6], [66, 39, 4], [84, 40, 6.5], [98, 42, 7], [108, 42, 5.5], [88, 33, 5], [124, -24, 10], [135, -25, 9], [140, -30, 5],
 [-113, 34, 4.5], [-104, 30, 3.5], [-69, -24, 2.6], [-68, -43, 3.5], [20, -24, 5.5], [15, -22, 3]].forEach(b => blobs.push([...b, SAND, .95]));
[[-62, -4, 9], [-55, -9, 7], [-70, -6, 5], [22, 0, 7], [12, 3, 4], [102, 15, 5], [113, 0, 6], [96, 62, 13], [122, 62, 11], [62, 61, 9], [-100, 56, 13], [-75, 52, 8], [18, 63, 4.5], [-84, 38, 6], [30, 56, 6], [-125, 55, 5]].forEach(b => blobs.push([...b, DEEP, .55]));
[[-42, 72, 13], [-80, 76, 10], [100, 77, 9], [140, 73, 8], [60, 75, 6], [-110, 72, 8]].forEach(b => blobs.push([...b, PALE, .95]));
[[-60, -32, 5], [-95, 45, 6], [40, 50, 7], [5, 47, 6], [35, 8, 6], [120, 32, 6], [78, 22, 6], [145, -36, 4]].forEach(b => blobs.push([...b, SOFT, .7]));
const blobSvg = blobs.map(([lo, la, r, c, o]) => { const [x, y] = P(lo, la), [x2] = P(lo + r, la), [, y2] = P(lo, la - r); return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(x2 - x).toFixed(1)}" ry="${(y2 - y).toFixed(1)}" fill="${c}" opacity="${o}"/>`; }).join('');
// 나무: 숲 얼룩 안 육지에 흩뿌림 (북쪽은 뾰족한 나무, 남쪽은 둥근 나무)
const pine = (x, y, s) => `<path d="M${x} ${y - 9 * s}L${x - 3.6 * s} ${y}H${x + 3.6 * s}Z" fill="#4E8A47"/><rect x="${x - .6 * s}" y="${y}" width="${1.2 * s}" height="${2 * s}" fill="#7A5A3A"/>`;
const round = (x, y, s) => `<rect x="${x - .6 * s}" y="${y - 3 * s}" width="${1.2 * s}" height="${4 * s}" fill="#7A5A3A"/><ellipse cx="${x}" cy="${y - 5.5 * s}" rx="${3.4 * s}" ry="${4 * s}" fill="#4F9150"/>`;
let trees = ''; const spots = [[96, 62, 13, 9], [122, 62, 11, 7], [62, 61, 9, 5], [-100, 56, 13, 8], [-75, 52, 8, 4], [18, 63, 4.5, 2], [-84, 38, 6, 3], [30, 56, 6, 3], [-125, 55, 5, 2], [-62, -4, 9, 6], [-55, -9, 7, 3], [22, 0, 7, 4], [102, 15, 5, 2], [113, 0, 6, 2], [145, -36, 4, 1]];
for (const [lo, la, r, n] of spots) { let k = 0, tries = 0; while (k < n && tries++ < 200) { const a = lo + (rnd() * 2 - 1) * r, b = la + (rnd() * 2 - 1) * r * .7; if (!inLand(a, b)) continue; const [x, y] = P(a, b); trees += (Math.abs(b) > 40 ? pine : round)(x.toFixed(1) * 1, y.toFixed(1) * 1, 1.25); k++; } }
// 바다 꾸밈: 물결 · 구름 · 배 · 물고기
const wave = (x, y) => `<path d="M${x} ${y}q5 -4 10 0t10 0t10 0" fill="none" stroke="#5FB4E6" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>`;
const cloud = (x, y, s) => `<g fill="#fff" opacity=".95"><ellipse cx="${x}" cy="${y}" rx="${26 * s}" ry="${7 * s}"/><ellipse cx="${x - 9 * s}" cy="${y - 6 * s}" rx="${11 * s}" ry="${8 * s}"/><ellipse cx="${x + 7 * s}" cy="${y - 8 * s}" rx="${13 * s}" ry="${9 * s}"/></g>`;
const boat = (x, y) => `<g><path d="M${x - 16} ${y}h32l-6 8h-20z" fill="#B7794A" stroke="#7A4E2C" stroke-width="1"/><rect x="${x - 6}" y="${y - 9}" width="11" height="9" rx="1.5" fill="#F6EBD6" stroke="#7A4E2C" stroke-width="1"/><rect x="${x + 1}" y="${y - 14}" width="2.6" height="5" fill="#3E3E52"/></g>`;
const fish = (x, y, c) => `<g fill="${c}"><ellipse cx="${x}" cy="${y}" rx="7" ry="3.6"/><path d="M${x + 6} ${y}l6 -4v8z"/></g>`;
let deco = ''; [[-150, 30], [-140, -20], [-120, 5], [-35, 10], [-30, 40], [-20, -35], [70, -20], [85, -40], [160, 15], [170, -40], [-160, -45], [0, -48], [110, -48], [-90, -30]].forEach(([a, b]) => { const [x, y] = P(a, b); deco += wave(x.toFixed(0) * 1, y.toFixed(0) * 1); });
[[-155, 42, 1], [-30, 30, .9], [40, 66, .9], [150, 0, 1], [-100, -50, .9], [60, -45, .8]].forEach(([a, b, s]) => { const [x, y] = P(a, b); deco += cloud(x, y, s); });
[[-40, 24], [75, -10]].forEach(([a, b]) => { const [x, y] = P(a, b); deco += boat(x, y); });
{ const [x, y] = P(-125, -25); deco += fish(x, y, '#F19A86') + fish(x + 26, y - 8, '#8BA9E6'); }
const landD = gp(land);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><radialGradient id="sea" cx=".5" cy=".45" r=".75"><stop offset="0" stop-color="#B8E6FB"/><stop offset=".7" stop-color="#93D4F4"/><stop offset="1" stop-color="#6EC1EC"/></radialGradient>
<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>
<filter id="glow"><feGaussianBlur stdDeviation="3"/></filter>
<filter id="paper"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .45  0 0 0 0 .35  0 0 0 .07 0"/></filter>
<linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ECB7C"/><stop offset="1" stop-color="#8BBE6E"/></linearGradient>
<clipPath id="lc"><path d="${landD}"/></clipPath></defs>
<rect width="${W}" height="${H}" fill="url(#sea)"/>
<path d="${landD}" fill="none" stroke="#FFFFFF" stroke-opacity=".55" stroke-width="16" filter="url(#glow)"/>
<path d="${landD}" fill="none" stroke="#F6E8BF" stroke-width="7" stroke-linejoin="round"/>
<path d="${landD}" fill="url(#lg)"/>
<g clip-path="url(#lc)"><g filter="url(#soft)">${blobSvg}</g>${trees}</g>
<path d="${landD}" fill="none" stroke="#4E7140" stroke-width="1.7" stroke-linejoin="round"/>
${deco}
<rect width="${W}" height="${H}" filter="url(#paper)"/></svg>`;
fs.writeFileSync(path.join(OUT, 'base.svg'), svg);
const src = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'board.html'), 'utf8');
const EJ = JSON.parse(src.match(/const EJ = (\[\[.*?\]\]);/s)[1].replace(/'/g, '"'));
fs.writeFileSync(path.join(OUT, 'cities.json'), JSON.stringify(Object.fromEntries(EJ.map(c => [c[0], P(c[2], c[1]).map(v => +v.toFixed(1))]))));
console.log('ok', (svg.length / 1e6).toFixed(1) + 'MB');
