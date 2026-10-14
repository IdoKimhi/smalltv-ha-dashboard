// Builds ha-dashboard.stheme (segmented bars) and ha-dashboard-smooth.stheme (smooth bars),
// their source folders (.zip) and preview PNGs.
// Run from the smalltv-studio root:  node my-themes/ha-dashboard/build.mjs
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';

const OUT = new URL('./', import.meta.url);
// Where the TV fetches the JSON that Home Assistant writes to /config/www/smalltv.json.
const DATA_URL = process.env.DATA_URL ?? 'http://YOUR-HA-IP:8123/local/smalltv.json';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const C = await vite.ssrLoadModule('/src/core/core.ts');
const S = await vite.ssrLoadModule('/src/core/source.ts');

/* ---------- colors ---------- */
const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const mix = (a, b, t) => { const x = hex(a), y = hex(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
// Color at position t (0..1) along [[t, color], ...].
const ramp = (stops, t) => {
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) return mix(stops[i - 1][1], stops[i][1], (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
  return stops.at(-1)[1];
};

/* ---------- tiny raster ---------- */
function canvas(w, h) {
  const px = new Uint8ClampedArray(w * h * 4);
  const g = {
    w, h, px, c: [255, 255, 255],
    color(c) { g.c = hex(c); return g; },
    set(x, y) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h) return; px.set([...g.c, 255], (y * w + x) * 4); },
    erase(x, y) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) px.fill(0, (y * w + x) * 4, (y * w + x) * 4 + 4); },
    disc(cx, cy, r, f = g.set) { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) f(cx + x, cy + y); },
    ring(cx, cy, r) { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = x * x + y * y; if (d <= r * r + r * 0.6 && d > (r - 1) * (r - 1) + (r - 1) * 0.6) g.set(cx + x, cy + y); } },
    rect(x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g.set(x, y); },
    line(x0, y0, x1, y1, t = 1) {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 || 1;
      for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n; for (let a = 0; a < t; a++) for (let b = 0; b < t; b++) g.set(x + a - (t >> 1), y + b - (t >> 1)); }
    },
  };
  return g;
}
// Moves a drawing by whole pixels (used for 1px drifts after doubling).
const shift = (g, dx) => {
  const o = canvas(g.w, g.h);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (x - dx >= 0 && x - dx < g.w) o.px.set(g.px.subarray((y * g.w + x - dx) * 4, (y * g.w + x - dx) * 4 + 4), (y * g.w + x) * 4);
  return o;
};
const scale2 = g => {
  const o = canvas(g.w * 2, g.h * 2);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.px.set(g.px.subarray(((y >> 1) * g.w + (x >> 1)) * 4, ((y >> 1) * g.w + (x >> 1)) * 4 + 4), (y * o.w + x) * 4);
  return o;
};

/* ---------- 24x24 glyphs, drawn into g at (ox, oy); f is the animation frame ---------- */
const cloudShape = (g, ox, oy, dy = 0) => { g.disc(ox + 7, oy + 14 + dy, 4); g.disc(ox + 12, oy + 10 + dy, 6); g.disc(ox + 17, oy + 14 + dy, 4); g.rect(ox + 7, oy + 14 + dy, ox + 17, oy + 18 + dy); };
// Two-tone cloud: a lighter body with a shaded underside.
const cloud = (g, ox, oy, dy, top, shade) => {
  g.color(shade); cloudShape(g, ox, oy, dy);
  g.color(top); cloudShape(g, ox, oy - 1, dy);
};
const sunRays = (g, cx, cy, f, frames, r0, r1) => {
  for (let i = 0; i < 8; i++) {
    const a = (i + f / frames) * Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
    g.line(cx + c * r0, cy + s * r0, cx + c * r1, cy + s * r1, 2);
  }
};
const drops = (g, ox, oy, f, color) => {
  g.color(color);
  [[8, 0], [13, 2], [18, 4]].forEach(([x, phase]) => { const y = 15 + ((f + phase) % 6); g.line(ox + x, oy + y, ox + x - 1, oy + y + 2, 2); });
};
const glyphs = {
  sun(g, f, n, ox = 0, oy = 0) {
    g.color('#FFB347'); sunRays(g, ox + 12, oy + 12, 0, n, 8, 10.5);
    g.color('#FFCC00'); g.disc(ox + 12, oy + 12, 5);
    g.color('#FFE680'); g.disc(ox + 11, oy + 11, 2);
  },
  moon(g, f, n, ox = 0, oy = 0) {
    g.color('#C9D6FF'); g.disc(ox + 10, oy + 13, 7);
    g.disc(ox + 14, oy + 10, 6, (x, y) => g.erase(x, y));
    const star = (x, y, on) => { g.color(on ? '#FFFFFF' : '#5A6A8A'); g.set(x, y); if (on) { g.set(x - 1, y); g.set(x + 1, y); g.set(x, y - 1); g.set(x, y + 1); } };
    star(ox + 19, oy + 5, f % 4 < 2); star(ox + 21, oy + 15, f % 4 >= 2); star(ox + 15, oy + 21, (f + 1) % 4 < 2);
  },
  cloud(g, f, n, ox = 0, oy = 0) { cloud(g, ox, oy, 1, '#C8D2DC', '#8A949E'); },
  partly(g, f, n, ox = 0, oy = 0) {
    g.color('#FFB347'); sunRays(g, ox + 15, oy + 8, 0, n, 6, 8);
    g.color('#FFCC00'); g.disc(ox + 15, oy + 8, 4);
    cloud(g, ox - 2, oy, 2, '#E0E6EE', '#9AA5B1');
  },
  rain(g, f, n, ox = 0, oy = 0) { cloud(g, ox, oy, -3, '#B8C4D0', '#7A8794'); drops(g, ox, oy, f, '#4DA6FF'); },
  storm(g, f, n, ox = 0, oy = 0) {
    cloud(g, ox, oy, -3, '#9AA5B1', '#5E6873'); drops(g, ox, oy, f, '#4DA6FF');
    if (f === 0) { g.color('#FFE066'); g.line(ox + 13, oy + 12, ox + 10, oy + 17, 2); g.line(ox + 10, oy + 17, ox + 14, oy + 17, 2); g.line(ox + 14, oy + 17, ox + 11, oy + 23, 2); }
  },
  snow(g, f, n, ox = 0, oy = 0) {
    cloud(g, ox, oy, -3, '#E0E6EE', '#9AA5B1'); g.color('#FFFFFF');
    [[7, 0], [12, 3], [17, 1], [10, 5], [15, 4]].forEach(([x, phase]) => { const t = (f + phase) % n, y = 16 + t * 7 / n; g.rect(ox + x + (t % 4 < 2 ? 0 : 1), oy + y, ox + x + (t % 4 < 2 ? 1 : 2), oy + y + 1); });
  },
  wind(g, f, n, ox = 0, oy = 0) {
    // Each gust line sways on its own phase.
    const dx = phase => Math.round(Math.sin((f / n + phase) * 2 * Math.PI));
    const top = ox + dx(0), mid = ox + dx(0.33), low = ox + dx(0.66);
    g.color('#A8D8D8');
    g.line(top + 2, oy + 8, top + 15, oy + 8, 2); g.line(top + 15, oy + 8, top + 18, oy + 6, 2); g.line(top + 18, oy + 6, top + 17, oy + 3, 2); g.line(top + 17, oy + 3, top + 14, oy + 4, 1);
    g.color('#E0F4F4'); g.line(mid + 4, oy + 13, mid + 21, oy + 13, 2);
    g.color('#A8D8D8');
    g.line(low + 2, oy + 18, low + 13, oy + 18, 2); g.line(low + 13, oy + 18, low + 16, oy + 20, 2); g.line(low + 16, oy + 20, low + 15, oy + 23, 2); g.line(low + 15, oy + 23, low + 12, oy + 22, 1);
  },
  home(g, ox = 0, oy = 0) {
    g.line(ox + 2, oy + 12, ox + 12, oy + 3, 2); g.line(ox + 12, oy + 3, ox + 22, oy + 12, 2);
    g.rect(ox + 5, oy + 11, ox + 6, oy + 21); g.rect(ox + 18, oy + 11, ox + 19, oy + 21); g.rect(ox + 5, oy + 20, ox + 19, oy + 21); g.rect(ox + 10, oy + 14, ox + 14, oy + 21);
  },
  homeLarge(g, ox = 0, oy = 0) {
    g.line(ox + 2, oy + 15, ox + 15, oy + 3, 3); g.line(ox + 15, oy + 3, ox + 28, oy + 15, 3);
    g.rect(ox + 6, oy + 14, ox + 8, oy + 28); g.rect(ox + 22, oy + 14, ox + 24, oy + 28); g.rect(ox + 6, oy + 26, ox + 24, oy + 28); g.rect(ox + 13, oy + 18, ox + 17, oy + 28);
  },
  humidity(g, ox = 0, oy = 0) {
    g.disc(ox + 12, oy + 15, 6);
    for (let y = 2; y <= 15; y++) { const half = (y - 2) * 6 / 13; g.rect(Math.round(ox + 12 - half), oy + y, Math.round(ox + 12 + half), oy + y); }
  },
  rainSmall(g, ox, oy) { cloudShape(g, ox, oy, -3); for (const x of [8, 12, 16]) g.line(ox + x, oy + 18, ox + x - 2, oy + 22, 2); },
  windSmall(g, ox, oy) {
    g.line(ox + 2, oy + 8, ox + 15, oy + 8, 2); g.line(ox + 15, oy + 8, ox + 18, oy + 6, 2); g.line(ox + 18, oy + 6, ox + 17, oy + 3, 2); g.line(ox + 17, oy + 3, ox + 14, oy + 4, 1);
    g.line(ox + 2, oy + 13, ox + 20, oy + 13, 2);
    g.line(ox + 2, oy + 18, ox + 13, oy + 18, 2); g.line(ox + 13, oy + 18, ox + 16, oy + 20, 2); g.line(ox + 16, oy + 20, ox + 15, oy + 23, 2); g.line(ox + 15, oy + 23, ox + 12, oy + 22, 1);
  },
};

const baseAssets = new Map();
let assets = baseAssets;
const addImage = (name, g) => assets.set('images/' + name + '.png.sti', C.fromRGBA(g.w, g.h, g.px));
const addAnimation = (name, frames, draw) => {
  for (let f = 0; f < frames; f++) { const g = draw(f); assets.set('anim/' + name + '/' + String(f).padStart(3, '0') + '.png.sti', C.fromRGBA(g.w, g.h, g.px)); }
};

/* ---------- animated weather icons (48x48), shown by Home Assistant's wx.wi ---------- */
// [wi index, id, glyph, frames, fps, drift]; drifting icons sway 1px left and right.
const weather = [
  [0, 'sunny', 'sun', 8, 2, true], [1, 'night', 'moon', 8, 2], [2, 'cloudy', 'cloud', 8, 2, true], [3, 'rain', 'rain', 6, 4],
  [4, 'storm', 'storm', 8, 4], [5, 'snow', 'snow', 8, 3], [6, 'windy', 'wind', 6, 3], [7, 'partly', 'partly', 8, 2, true],
];
for (const [, id, glyph, frames, , drift] of weather) addAnimation('wx-' + id, frames, f => {
  const g = canvas(24, 24); glyphs[glyph](g, f, frames);
  return drift ? shift(scale2(g), Math.round(Math.sin(f / frames * 2 * Math.PI))) : scale2(g);
});

/* ---------- Proxmox status pulse (12x12): green normally, red when the CPU runs hot ---------- */
const BAND = '#1F3A5F';
for (const [id, core] of [['pulse-ok', '#00FF88'], ['pulse-hot', '#FF5555']]) {
  addAnimation(id, 10, f => {
    const g = canvas(12, 12), r = 2 + Math.floor(f * 3 / 10);
    g.color(mix(core, BAND, 0.3 + f / 14)); g.ring(6, 6, r);
    g.color(core); g.disc(6, 6, 2);
    return g;
  });
}
addImage('rain-hot', (() => { const g = canvas(24, 24).color('#4DA6FF'); glyphs.rainSmall(g, 0, 0); return g; })());

for (const STYLE of ['segmented', 'smooth']) {
const NAME = STYLE === 'segmented' ? 'ha-dashboard' : 'ha-dashboard-smooth';
assets = new Map(baseAssets);
/* ---------- full-screen background: everything that never changes ---------- */
const BAR_X = 74, BAR_W = 90, SEG = 6, SEGS = 15, RAM_Y = 192, BK_Y = 214, BAR_H = 12, UNLIT = '#262626';
const RAM_RAMP = [[0, '#00FF88'], [0.6, '#7CFF4D'], [0.82, '#FFCC00'], [1, '#FF5555']];
const BK_RAMP = [[0, '#4DA6FF'], [0.6, '#8AB4F8'], [0.82, '#FFCC00'], [1, '#FF5555']];
const bg = canvas(240, 240);
for (let y = 0; y < 240; y++) { bg.color(y < 66 ? mix('#122544', '#000000', y / 66) : '#000000'); bg.rect(0, y, 239, y); }
// Divider lines that fade out towards the edges.
for (const y of [70, 158]) for (let x = 10; x <= 230; x++) { bg.color(mix('#000000', '#4A6A9A', Math.max(0, 1 - Math.abs(x - 120) / 110) ** 0.7)); bg.set(x, y); }
// Proxmox band: rounded, with a vertical gradient and a highlight edge.
for (let y = 162; y <= 183; y++) for (let x = 20; x <= 219; x++) {
  const cx = x < 26 ? 26 : x > 213 ? 213 : x, cy = y < 168 ? 168 : y > 177 ? 177 : y;
  if ((x - cx) ** 2 + (y - cy) ** 2 > 36) continue;
  bg.color(y === 162 || (y < 165 && (x - cx) ** 2 + (y - cy) ** 2 > 16) ? '#4A7AB5' : mix('#2E5A8F', '#132A47', (y - 162) / 21)); bg.set(x, y);
}
// Small static icons.
bg.color('#FF9966'); glyphs.home(bg, 162, 79);
bg.color('#8AB4F8'); glyphs.humidity(bg, 8, 128);
bg.color('#8AB4F8'); glyphs.rainSmall(bg, 90, 128);
bg.color('#FFFFFF'); glyphs.windSmall(bg, 168, 128);
// Fully lit bars; a mask layer hides the part above the current value.
for (const [y, rampStops] of [[RAM_Y, RAM_RAMP], [BK_Y, BK_RAMP]]) {
  if (STYLE === 'segmented') for (let i = 0; i < SEGS; i++) {
    const c = ramp(rampStops, (i + 0.5) / SEGS), x = BAR_X + i * SEG;
    bg.color(c); bg.rect(x, y, x + SEG - 2, y + BAR_H - 1);
    bg.color(mix(c, '#FFFFFF', 0.45)); bg.rect(x, y, x + SEG - 2, y + 1);
    bg.color(mix(c, '#000000', 0.35)); bg.rect(x, y + BAR_H - 2, x + SEG - 2, y + BAR_H - 1);
  }
  else for (let i = 0; i < BAR_W; i++) for (let row = 0; row < BAR_H; row++) {
    // A continuous gradient with soft vertical shading: lighter on top, darker below.
    const c = ramp(rampStops, i / (BAR_W - 1)), t = row / (BAR_H - 1);
    bg.color(t < 0.35 ? mix(c, '#FFFFFF', 0.35 * (1 - t / 0.35)) : mix(c, '#000000', 0.3 * Math.max(0, (t - 0.6) / 0.4))); bg.set(BAR_X + i, y + row);
  }
}
// The static labels go through the device renderer, so they use the device font exactly.
assets.set('images/bg-raw.png.sti', C.fromRGBA(240, 240, bg.px));
const labels = (id, x, y, value, color) => ({ id, type: 'text', x, y, value, size: 16, color });
const bgTheme = {
  spec: 1, theme: { id: 'bg', name: 'bg', author: 'x', version: '1' }, display: { width: 240, height: 240, background: '#000000' },
  layers: [{ id: 'raw', type: 'image', x: 0, y: 0, source: 'images/bg-raw.png' }, labels('pve', 40, 166, 'Proxmox', '#FFFFFF'), labels('ram', 20, 190, 'RAM', '#C8D2DC'), labels('bk', 20, 212, 'Bkup', '#C8D2DC')],
};
assets.set('images/bg.png.sti', C.fromRGBA(240, 240, C.render(bgTheme, assets, null)));
assets.delete('images/bg-raw.png.sti');
// Drawn over the masks: segmented bars get their gap columns back, smooth bars get rounded ends.
const overlay = canvas(BAR_W, BK_Y - RAM_Y + BAR_H).color('#000000'), R = BAR_H / 2;
for (const y of [0, BK_Y - RAM_Y]) {
  if (STYLE === 'segmented') for (let i = 1; i <= SEGS; i++) overlay.rect(i * SEG - 1, y, i * SEG - 1, y + BAR_H - 1);
  else for (let row = 0; row < BAR_H; row++) for (let i = 0; i < BAR_W; i++) {
    const cx = Math.min(Math.max(i + 0.5, R), BAR_W - R), cy = row + 0.5 - R;
    if ((i + 0.5 - cx) ** 2 + cy ** 2 > R * R) overlay.set(i, y + row);
  }
}
addImage('bar-' + STYLE, overlay);

/* ---------- manifest ---------- */
const OFF = 300; // off-screen
// Shows a layer at (x, y) only while `field` equals k: x leaves when the value is above k, y when below.
const onlyWhen = (field, k, x, y) => ({
  x: { source: field, input: [k + 0.5, k + 0.51], output: [x, OFF] },
  y: { source: field, input: [k - 0.51, k - 0.5], output: [OFF, y] },
});
const text = (id, x, y, value, size, color, extra = {}) => ({ id, type: 'text', x, y, value, size, color, ...extra });
const image = (id, x, y, name, extra = {}) => ({ id, type: 'image', x, y, source: 'images/' + name + '.png', ...extra });
const anim = (id, x, y, size, frames, fps, extra = {}) => ({ id, type: 'animation', x, y, source: 'anim/' + id, width: size, height: size, frames, fps, loop: true, ...extra });
const degree = (id, x, y, radius, stroke, strokeWidth, bind) => ({ id, type: 'shape', shape: 'circle', x, y, radius, stroke, strokeWidth, ...(bind && { bind }) });
const stops = (source, ...pairs) => ({ source, stops: pairs.map(([at, value]) => ({ at, value })) });
// Hides the unlit part of a baked bar: starts at the value and covers the rest.
const barMask = (id, y, source) => ({
  id, type: 'shape', shape: 'rectangle', x: BAR_X, y, width: BAR_W, height: BAR_H, fill: UNLIT,
  bind: { x: { source, input: [0, 100], output: [BAR_X, BAR_X + BAR_W] }, width: { source, input: [0, 100], output: [BAR_W, 0] } },
});

const TEMP_STOPS = [[-50, '#8AB4F8'], [10, '#A8D8D8'], [18, '#FFCC00'], [28, '#FF9966'], [33, '#FF5555']];
const RAM_STOPS = [[0, '#00FF88'], [91, '#FF5555']], BK_STOPS = [[0, '#8AB4F8'], [81, '#FFCC00'], [91, '#FF5555']], CPU_STOPS = [[0, '#FFFFFF'], [76, '#FF5555']];
const theme = {
  spec: 1,
  theme: STYLE === 'segmented' ? { id: 'ha-dashboard', name: 'HA Dashboard', author: 'idokimhi', version: '1.4.0' } : { id: 'ha-dashboard-smooth', name: 'HA Dashboard Smooth', author: 'idokimhi', version: '1.4.0' },
  display: { width: 240, height: 240, background: '#000000' },
  data: [
    { id: 'wx', url: DATA_URL, interval: 30, fields: ['t', 'h', 'c', 'hu', 'pp', 'pph', 'w', 'wi'].map(id => ({ id, path: 'wx.' + id })) },
    { id: 'pve', url: DATA_URL, interval: 30, fields: ['cpu', 'ram', 'bk', 'tl', 'hl'].map(id => ({ id, path: 'pve.' + id })) },
  ],
  layers: [
    image('bg', 0, 0, 'bg'),
    text('time-shadow', 26, 7, '{HH}:{MM}', 40, '#000000'),
    text('time', 24, 4, '{HH}:{MM}', 40, '#FFFFFF'),
    text('seconds', 181, 18, '{SS}', 24, '#8AB4F8'),
    text('date', 120, 48, '{WD} {DD} {MON}', 16, '#8AB4F8', { anchor: 'top-center' }),
    ...weather.map(([k, id, , frames, fps]) => anim('wx-' + id, OFF, OFF, 48, frames, fps, { bind: onlyWhen('wx.wi', k, 14, 76) })),
    text('temp', 70, 78, '{wx.t}', 24, '#FFCC00', { bind: { color: stops('wx.t', ...TEMP_STOPS) } }),
    // The font has no degree sign: a ring placed after the last digit (pve.tl = number of characters).
    degree('temp-deg', 110, 83, 4, '#FFCC00', 2, { x: { source: 'pve.tl', input: [1, 3], output: [92, 128] }, stroke: stops('wx.t', ...TEMP_STOPS) }),
    image('rain-hot', OFF, 128, 'rain-hot', { bind: { x: { source: 'wx.pph', input: [0.5, 0.51], output: [OFF, 90] } } }),
    text('home', 190, 82, '{wx.h}', 20, '#FF9966'),
    degree('home-deg', 224, 85, 3, '#FF9966', 2, { x: { source: 'pve.hl', input: [1, 3], output: [209, 239] } }),
    text('cond', 70, 106, '{wx.c}', 16, '#FFFFFF'),
    text('hum', 36, 132, '{wx.hu}', 16, '#8AB4F8'),
    text('pp', 118, 132, '{wx.pp}', 16, '#8AB4F8', { bind: { color: stops('wx.pph', [0, '#8AB4F8'], [1, '#4DA6FF']) } }),
    text('wind', 196, 132, '{wx.w}', 16, '#FFFFFF'),
    anim('pulse-ok', OFF, 167, 12, 10, 5, { bind: { x: { source: 'pve.cpu', input: [75.5, 75.51], output: [25, OFF] } } }),
    anim('pulse-hot', OFF, 167, 12, 10, 8, { bind: { x: { source: 'pve.cpu', input: [75.5, 75.51], output: [OFF, 25] } } }),
    text('cpu', 206, 166, 'CPU {pve.cpu}', 16, '#FFFFFF', { anchor: 'top-right', bind: { color: stops('pve.cpu', ...CPU_STOPS) } }),
    degree('cpu-deg', 210, 169, 3, '#FFFFFF', 1, { stroke: stops('pve.cpu', ...CPU_STOPS) }),
    barMask('ram-mask', RAM_Y, 'pve.ram'),
    barMask('bk-mask', BK_Y, 'pve.bk'),
    image('bar-' + STYLE, BAR_X, RAM_Y, 'bar-' + STYLE),
    text('ram', 220, 190, '{pve.ram}%', 16, '#00FF88', { anchor: 'top-right', bind: { color: stops('pve.ram', ...RAM_STOPS) } }),
    text('bk', 220, 212, '{pve.bk}%', 16, '#8AB4F8', { anchor: 'top-right', bind: { color: stops('pve.bk', ...BK_STOPS) } }),
  ],
};

const errors = C.validate(theme, assets);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
const pkg = C.pack(theme, assets);
writeFileSync(new URL(NAME + '.stheme', OUT), pkg);
writeFileSync(new URL(NAME + '-source.zip', OUT), S.zip(await S.sourceFiles(theme, assets)));

/* ---------- previews, rendered exactly as the device would ---------- */
const sample = (o) => Object.fromEntries(Object.entries(o).flatMap(([s, f]) => Object.entries(f).map(([k, v]) => [s + '.' + k, String(v)])));
const previews = {
  'preview.png': sample({ wx: { t: 20, h: 25, c: 'Sunny', hu: '77%', pp: '0%', pph: 0, w: 8, wi: 0 }, pve: { cpu: 43, ram: 86, bk: 82, tl: 2, hl: 2 } }),
  'preview-partly.png': sample({ wx: { t: 31, h: 26, c: 'Partly cloudy', hu: '45%', pp: '10%', pph: 0, w: 14, wi: 7 }, pve: { cpu: 52, ram: 47, bk: 63, tl: 2, hl: 2 } }),
  'preview-alert.png': sample({ wx: { t: 7, h: 19, c: 'Storm', hu: '88%', pp: '80%', pph: 1, w: 31, wi: 4 }, pve: { cpu: 81, ram: 93, bk: 95, tl: 1, hl: 2 } }),
};
const time = new Date(Date.UTC(2026, 9, 14, 21, 37, 42));
const scaleUp = rgba => { const big = new Uint8ClampedArray(480 * 480 * 4); for (let y = 0; y < 480; y++) for (let x = 0; x < 480; x++) big.set(rgba.subarray(((y >> 1) * 240 + (x >> 1)) * 4, ((y >> 1) * 240 + (x >> 1)) * 4 + 4), (y * 480 + x) * 4); return big; };
for (const [file, data] of Object.entries(previews)) writeFileSync(new URL(STYLE === 'segmented' ? file : file.replace('preview', 'preview-smooth'), OUT), await S.encodePNG(480, 480, scaleUp(C.render(theme, assets, time, 0, data))));
  console.log(NAME + ':', theme.layers.length, 'layers,', pkg.length, 'bytes,', assets.size, 'images,', C.manifestJson(theme).length, 'byte manifest');
}
// Every frame of every weather icon side by side, to check the animations.
const sheet = canvas(8 * 52, weather.length * 52);
weather.forEach(([, id, , frames], row) => { for (let f = 0; f < frames; f++) { const a = baseAssets.get('anim/wx-' + id + '/' + String(f).padStart(3, '0') + '.png.sti'), rgba = C.assetRGBA(a); for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) if (rgba[(y * 48 + x) * 4 + 3]) sheet.px.set(rgba.subarray((y * 48 + x) * 4, (y * 48 + x) * 4 + 4), ((row * 52 + y + 2) * sheet.w + f * 52 + x + 2) * 4); } });
for (let i = 0; i < sheet.px.length; i += 4) if (!sheet.px[i + 3]) sheet.px.set([0, 0, 0, 255], i);
writeFileSync(new URL('frames.png', OUT), await S.encodePNG(sheet.w, sheet.h, sheet.px));
await vite.close();
