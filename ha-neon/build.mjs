// Builds ha-neon.stheme: a synthwave take on the same Home Assistant data as ha-dashboard.
// Run from the smalltv-studio root:  node my-themes/ha-neon/build.mjs
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const OUT = new URL('./', import.meta.url);
// Same JSON as ha-dashboard (Home Assistant writes it to /config/www/smalltv.json).
const DATA_URL = process.env.DATA_URL ?? 'http://YOUR-HA-IP:8123/local/smalltv.json';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const C = await vite.ssrLoadModule('/src/core/core.ts');
const S = await vite.ssrLoadModule('/src/core/source.ts');

/* ---------- palette ---------- */
const CYAN = '#00F0FF', PINK = '#FF2E88', PURPLE = '#B44CFF', YELLOW = '#FFD319', ORANGE = '#FF8A3D', RED = '#FF3860', LAVENDER = '#9D7FD6', WELL = '#12052A';

/* ---------- colors and raster ---------- */
const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const mix = (a, b, t) => { const x = hex(a), y = hex(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const ramp = (stops, t) => {
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) return mix(stops[i - 1][1], stops[i][1], (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
  return stops.at(-1)[1];
};
function canvas(w, h) {
  const px = new Uint8ClampedArray(w * h * 4);
  const g = {
    w, h, px, c: [255, 255, 255],
    color(c) { g.c = hex(c); return g; },
    set(x, y) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h) return; px.set([...g.c, 255], (y * w + x) * 4); },
    has(x, y) { return x >= 0 && y >= 0 && x < w && y < h && px[(y * w + x) * 4 + 3] > 0; },
    disc(cx, cy, r, f = g.set) { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) f(cx + x, cy + y); },
    rect(x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g.set(x, y); },
    line(x0, y0, x1, y1, t = 1) {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 || 1;
      for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n; for (let a = 0; a < t; a++) for (let b = 0; b < t; b++) g.set(x + a - (t >> 1), y + b - (t >> 1)); }
    },
  };
  return g;
}
const scale2 = g => {
  const o = canvas(g.w * 2, g.h * 2);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.px.set(g.px.subarray(((y >> 1) * g.w + (x >> 1)) * 4, ((y >> 1) * g.w + (x >> 1)) * 4 + 4), (y * o.w + x) * 4);
  return o;
};

/* ---------- neon-tube icons ----------
 * Each part is a filled 24x24 shape. Doubled to 48x48, it becomes a 2px neon tube around a dark
 * tinted inside (which hides the parts behind it), with a dim 1px glow outside.
 * Solid parts (drops, rays, stars, bolts) are drawn bright all the way through. */
function neon(parts) {
  const out = canvas(48, 48);
  for (const { draw, color, solid } of parts) {
    const m = canvas(24, 24); draw(m);
    const M = scale2(m), glow = mix(color, '#000000', 0.62), inside = mix(color, '#1A0838', 0.84);
    const edge = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => !M.has(x + dx, y + dy));
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      if (M.has(x, y)) { out.color(solid || edge(x, y) ? color : inside); out.set(x, y); }
      else if (!out.has(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => M.has(x + dx, y + dy))) { out.color(glow); out.set(x, y); }
    }
  }
  return out;
}
const cloudShape = (dx = 0, dy = 0) => g => { g.disc(7 + dx, 14 + dy, 4); g.disc(12 + dx, 10 + dy, 6); g.disc(17 + dx, 14 + dy, 4); g.rect(7 + dx, 14 + dy, 17 + dx, 18 + dy); };
const rays = (cx, cy, r0, r1, f, n) => g => { for (let i = 0; i < 8; i++) { const a = (i + f / n) * Math.PI / 4; g.line(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, 1); } };
const drops = f => g => [[8, 0], [13, 2], [18, 4]].forEach(([x, p]) => { const y = 15 + ((f + p) % 6); g.line(x, y, x - 1, y + 2, 1); });
const bob = (f, n) => Math.round(Math.sin(f / n * 2 * Math.PI));
const icons = {
  sun: (f, n) => neon([{ draw: rays(12, 12, 8, 11, f, n), color: ORANGE, solid: true }, { draw: g => g.disc(12, 12, 6), color: YELLOW }]),
  moon: (f, n) => neon([
    { draw: g => { g.disc(10, 13, 7); g.disc(14, 10, 6, (x, y) => { const i = (y * 24 + x) * 4; if (x >= 0 && y >= 0 && x < 24 && y < 24) g.px.fill(0, i, i + 4); }); }, color: '#C9A9FF' },
    { draw: g => { for (const [x, y, on] of [[19, 4, f % 4 < 2], [21, 15, f % 4 >= 2], [16, 21, (f + 1) % 4 < 2]]) { g.set(x, y); if (on) { g.set(x - 1, y); g.set(x + 1, y); g.set(x, y - 1); g.set(x, y + 1); } } }, color: '#FFFFFF', solid: true },
  ]),
  cloud: (f, n) => neon([{ draw: cloudShape(bob(f, n), 1), color: CYAN }]),
  partly: (f, n) => neon([
    { draw: rays(15, 8, 6, 8, f, n), color: ORANGE, solid: true }, { draw: g => g.disc(15, 8, 4), color: YELLOW },
    { draw: cloudShape(bob(f, n) - 2, 2), color: CYAN },
  ]),
  rain: f => neon([{ draw: cloudShape(0, -3), color: CYAN }, { draw: drops(f), color: PINK, solid: true }]),
  storm: f => neon([
    { draw: cloudShape(0, -3), color: PURPLE }, { draw: drops(f), color: CYAN, solid: true },
    ...([0, 1, 3].includes(f) ? [{ draw: g => { g.line(13, 12, 10, 17, 1); g.line(10, 17, 14, 17, 1); g.line(14, 17, 11, 23, 1); }, color: YELLOW, solid: true }] : []),
  ]),
  snow: (f, n) => neon([
    { draw: cloudShape(0, -3), color: CYAN },
    { draw: g => [[7, 0], [12, 3], [17, 1], [10, 5], [15, 4]].forEach(([x, p]) => { const t = (f + p) % n; g.set(x + (t % 4 < 2 ? 0 : 1), 16 + t * 7 / n); }), color: '#FFFFFF', solid: true },
  ]),
  wind: (f, n) => {
    const dx = p => Math.round(Math.sin((f / n + p) * 2 * Math.PI) * 1.5), a = dx(0), b = dx(0.33), c = dx(0.66);
    return neon([
      { draw: g => { g.line(a + 2, 7, a + 15, 7); g.line(a + 15, 7, a + 18, 5); g.line(a + 18, 5, a + 17, 2); g.line(a + 17, 2, a + 14, 3); }, color: CYAN, solid: true },
      { draw: g => g.line(b + 4, 12, b + 21, 12), color: PINK, solid: true },
      { draw: g => { g.line(c + 2, 17, c + 13, 17); g.line(c + 13, 17, c + 16, 19); g.line(c + 16, 19, c + 15, 22); g.line(c + 15, 22, c + 12, 21); }, color: CYAN, solid: true },
    ]);
  },
};

const assets = new Map();
const addAnimation = (name, frames, draw) => {
  for (let f = 0; f < frames; f++) { const g = draw(f, frames); assets.set('anim/' + name + '/' + String(f).padStart(3, '0') + '.png.sti', C.fromRGBA(g.w, g.h, g.px)); }
};
// [wi index from Home Assistant, id, frames, fps]
const weather = [[0, 'sun', 8, 6], [1, 'moon', 8, 3], [2, 'cloud', 8, 3], [3, 'rain', 6, 8], [4, 'storm', 8, 6], [5, 'snow', 8, 5], [6, 'wind', 6, 8], [7, 'partly', 8, 3]];
for (const [, id, frames] of weather) addAnimation('wx-' + id, frames, icons[id]);

/* ---------- background: sky, horizon, grid floor, gauge wells and labels ---------- */
const HORIZON = 150, GAUGES = [40, 120, 200], WELL_TOP = 167, WELL_H = 43, WELL_W = 16;
const GAUGE_RAMP = [[0, CYAN], [0.5, PURPLE], [0.8, PINK], [1, RED]];
const bg = canvas(240, 240);
for (let y = 0; y < 240; y++) {
  bg.color(y < HORIZON ? ramp([[0, '#05010F'], [0.55, '#140630'], [1, '#3A0B52']], y / HORIZON) : mix('#1A0430', '#07010F', (y - HORIZON) / 90));
  bg.rect(0, y, 239, y);
}
// Stars, fixed so every build is identical.
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 40; i++) { const x = Math.floor(rnd() * 240), y = Math.floor(rnd() * 140), b = rnd(); if (x > 140 && y > 76) continue; bg.color(mix('#2A1050', '#FFFFFF', 0.3 + b * 0.6)); bg.set(x, y); }
// Perspective grid on the floor.
for (let k = 1; k <= 9; k++) { const y = HORIZON + Math.round(k * k * 1.12); if (y < 240) { bg.color(mix('#3A0B52', '#8A2BB0', 1 - k / 12)); bg.rect(0, y, 239, y); } }
for (let i = -7; i <= 7; i++) { bg.color('#5A1A7A'); bg.line(120 + i * 6, HORIZON, 120 + i * 60, 240, 1); }
// Glowing horizon.
for (const [dy, c] of [[-2, '#4A0E5C'], [-1, '#A0206A'], [0, PINK], [1, '#A0206A'], [2, '#4A0E5C']]) { bg.color(c); bg.rect(0, HORIZON + dy, 239, HORIZON + dy); }
// Gauge wells: a cyan frame around a dark inside, filled with lit stripes that a mask hides above the value.
for (const cx of GAUGES) {
  const x0 = cx - WELL_W / 2, x1 = x0 + WELL_W - 1;
  bg.color(mix(CYAN, '#000000', 0.55)); bg.rect(x0 - 2, WELL_TOP - 2, x1 + 2, WELL_TOP + WELL_H + 1);
  bg.color(CYAN); bg.rect(x0 - 1, WELL_TOP - 1, x1 + 1, WELL_TOP + WELL_H);
  bg.color(WELL); bg.rect(x0, WELL_TOP, x1, WELL_TOP + WELL_H - 1);
  for (let row = 0; row < WELL_H; row++) {
    const y = WELL_TOP + WELL_H - 1 - row;
    if (row % 3 === 2) continue;
    const c = ramp(GAUGE_RAMP, row / (WELL_H - 1));
    bg.color(c); bg.rect(x0 + 1, y, x1 - 1, y);
    bg.color(mix(c, '#FFFFFF', 0.5)); bg.rect(x0 + 1, y, x0 + 2, y);
  }
}
// Labels go through the device renderer so they use the device font.
assets.set('images/bg-raw.png.sti', C.fromRGBA(240, 240, bg.px));
const label = (id, x, y, value, color, anchor = 'top-left') => ({ id, type: 'text', x, y, value, size: 8, color, anchor });
const bgTheme = {
  spec: 1, theme: { id: 'bg', name: 'bg', author: 'x', version: '1' }, display: { width: 240, height: 240, background: '#000000' },
  layers: [
    { id: 'raw', type: 'image', x: 0, y: 0, source: 'images/bg-raw.png' },
    label('in', 150, 86, 'INSIDE', LAVENDER), label('hum', 150, 104, 'HUMID', LAVENDER), label('rain', 150, 122, 'RAIN', LAVENDER), label('wind', 150, 140, 'WIND', LAVENDER),
    label('cpu', GAUGES[0], 156, 'CPU', LAVENDER, 'top-center'), label('ram', GAUGES[1], 156, 'RAM', LAVENDER, 'top-center'), label('bk', GAUGES[2], 156, 'BACKUP', LAVENDER, 'top-center'),
  ],
};
assets.set('images/bg.png.sti', C.fromRGBA(240, 240, C.render(bgTheme, assets, null)));
assets.delete('images/bg-raw.png.sti');

/* ---------- manifest ---------- */
const OFF = 300; // off-screen
// Shows a layer at (x, y) only while `field` equals k: x leaves when the value is above k, y when below.
const onlyWhen = (field, k, x, y) => ({
  x: { source: field, input: [k + 0.5, k + 0.51], output: [x, OFF] },
  y: { source: field, input: [k - 0.51, k - 0.5], output: [OFF, y] },
});
const text = (id, x, y, value, size, color, extra = {}) => ({ id, type: 'text', x, y, value, size, color, ...extra });
const anim = (id, x, y, size, frames, fps, extra = {}) => ({ id, type: 'animation', x, y, source: 'anim/' + id, width: size, height: size, frames, fps, loop: true, ...extra });
const degree = (id, x, y, radius, stroke, strokeWidth, bind) => ({ id, type: 'shape', shape: 'circle', x, y, radius, stroke, strokeWidth, ...(bind && { bind }) });
const stops = (source, ...pairs) => ({ source, stops: pairs.map(([at, value]) => ({ at, value })) });
// Covers the gauge from the top down to the value. CPU runs 30-90 °C, the others 0-100 %.
const gaugeMask = (id, cx, source, input) => ({
  id, type: 'shape', shape: 'rectangle', x: cx - WELL_W / 2, y: WELL_TOP, width: WELL_W, height: WELL_H, fill: WELL,
  bind: { height: { source, input, output: [WELL_H, 0] } },
});

const TEMP_STOPS = [[-50, CYAN], [18, YELLOW], [28, ORANGE], [33, RED]];
const CPU_STOPS = [[0, CYAN], [76, RED]], RAM_STOPS = [[0, CYAN], [91, RED]], BK_STOPS = [[0, CYAN], [81, YELLOW], [91, RED]];
const theme = {
  spec: 1,
  theme: { id: 'ha-neon', name: 'HA Neon', author: 'idokimhi', version: '1.0.0' },
  display: { width: 240, height: 240, background: '#05010F' },
  data: [
    { id: 'wx', url: DATA_URL, interval: 30, fields: ['t', 'h', 'c', 'hu', 'pp', 'pph', 'w', 'wi'].map(id => ({ id, path: 'wx.' + id })) },
    { id: 'pve', url: DATA_URL, interval: 30, fields: ['cpu', 'ram', 'bk', 'tl'].map(id => ({ id, path: 'pve.' + id })) },
  ],
  layers: [
    { id: 'bg', type: 'image', x: 0, y: 0, source: 'images/bg.png' },
    // Neon clock: a pink glow offset behind near-white digits.
    text('time-glow', 12, 8, '{HH}:{MM}', 48, PINK),
    text('time', 10, 6, '{HH}:{MM}', 48, '#E8F9FF'),
    text('seconds-glow', 199, 29, '{SS}', 24, PINK),
    text('seconds', 198, 27, '{SS}', 24, CYAN),
    text('date', 120, 58, '{WD} {DD} {MON}', 16, PINK, { anchor: 'top-center' }),
    ...weather.map(([k, id, frames, fps]) => anim('wx-' + id, OFF, OFF, 48, frames, fps, { bind: onlyWhen('wx.wi', k, 6, 80) })),
    text('temp', 62, 82, '{wx.t}', 40, YELLOW, { bind: { color: stops('wx.t', ...TEMP_STOPS) } }),
    degree('temp-deg', 124, 87, 4, YELLOW, 2, { x: { source: 'pve.tl', input: [1, 3], output: [94, 154] }, stroke: stops('wx.t', ...TEMP_STOPS) }),
    // Long condition names ("Partly cloudy") scroll; short ones stay put.
    text('cond', 8, 132, '{wx.c}', 16, CYAN, { scroll: { width: 136, mode: 'bounce', speed: 25, pause: 1500 } }),
    text('home', 224, 82, '{wx.h}', 16, ORANGE, { anchor: 'top-right' }),
    degree('home-deg', 229, 85, 3, ORANGE, 1),
    text('hum', 232, 100, '{wx.hu}', 16, CYAN, { anchor: 'top-right' }),
    text('pp', 232, 118, '{wx.pp}', 16, CYAN, { anchor: 'top-right', bind: { color: stops('wx.pph', [0, CYAN], [1, PINK]) } }),
    text('wind', 232, 136, '{wx.w}', 16, '#E8F9FF', { anchor: 'top-right' }),
    gaugeMask('cpu-mask', GAUGES[0], 'pve.cpu', [30, 90]),
    gaugeMask('ram-mask', GAUGES[1], 'pve.ram', [0, 100]),
    gaugeMask('bk-mask', GAUGES[2], 'pve.bk', [0, 100]),
    text('cpu', GAUGES[0] - 3, 218, '{pve.cpu}', 16, CYAN, { anchor: 'top-center', bind: { color: stops('pve.cpu', ...CPU_STOPS) } }),
    degree('cpu-deg', GAUGES[0] + 14, 221, 3, CYAN, 1, { stroke: stops('pve.cpu', ...CPU_STOPS) }),
    text('ram', GAUGES[1], 218, '{pve.ram}%', 16, CYAN, { anchor: 'top-center', bind: { color: stops('pve.ram', ...RAM_STOPS) } }),
    text('bk', GAUGES[2], 218, '{pve.bk}%', 16, CYAN, { anchor: 'top-center', bind: { color: stops('pve.bk', ...BK_STOPS) } }),
  ],
};

const errors = C.validate(theme, assets);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
const pkg = C.pack(theme, assets);
writeFileSync(new URL('ha-neon.stheme', OUT), pkg);
writeFileSync(new URL('ha-neon-source.zip', OUT), S.zip(await S.sourceFiles(theme, assets)));

/* ---------- previews, rendered exactly as the device would ---------- */
const sample = o => Object.fromEntries(Object.entries(o).flatMap(([s, f]) => Object.entries(f).map(([k, v]) => [s + '.' + k, String(v)])));
const previews = {
  'preview.png': [sample({ wx: { t: 20, h: 25, c: 'Sunny', hu: '77%', pp: '0%', pph: 0, w: 8, wi: 0 }, pve: { cpu: 43, ram: 86, bk: 82, tl: 2 } }), 0],
  'preview-partly.png': [sample({ wx: { t: 31, h: 26, c: 'Partly cloudy', hu: '45%', pp: '10%', pph: 0, w: 14, wi: 7 }, pve: { cpu: 52, ram: 47, bk: 63, tl: 2 } }), 2600],
  'preview-alert.png': [sample({ wx: { t: 7, h: 19, c: 'Storm', hu: '88%', pp: '80%', pph: 1, w: 31, wi: 4 }, pve: { cpu: 81, ram: 93, bk: 95, tl: 1 } }), 0],
};
const time = new Date(Date.UTC(2026, 9, 14, 21, 37, 42));
const scaleUp = rgba => { const big = new Uint8ClampedArray(480 * 480 * 4); for (let y = 0; y < 480; y++) for (let x = 0; x < 480; x++) big.set(rgba.subarray(((y >> 1) * 240 + (x >> 1)) * 4, ((y >> 1) * 240 + (x >> 1)) * 4 + 4), (y * 480 + x) * 4); return big; };
for (const [file, [data, elapsed]] of Object.entries(previews)) writeFileSync(new URL(file, OUT), await S.encodePNG(480, 480, scaleUp(C.render(theme, assets, time, elapsed, data))));
const sheet = canvas(8 * 52, weather.length * 52).color('#140630'); sheet.rect(0, 0, sheet.w - 1, sheet.h - 1);
weather.forEach(([, id, frames], row) => { for (let f = 0; f < frames; f++) { const rgba = C.assetRGBA(assets.get('anim/wx-' + id + '/' + String(f).padStart(3, '0') + '.png.sti')); for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) if (rgba[(y * 48 + x) * 4 + 3]) sheet.px.set(rgba.subarray((y * 48 + x) * 4, (y * 48 + x) * 4 + 4), ((row * 52 + y + 2) * sheet.w + f * 52 + x + 2) * 4); } });
writeFileSync(new URL('frames.png', OUT), await S.encodePNG(sheet.w, sheet.h, sheet.px));
console.log('ok:', theme.layers.length, 'layers,', pkg.length, 'bytes,', assets.size, 'images,', C.manifestJson(theme).length, 'byte manifest');
await vite.close();
