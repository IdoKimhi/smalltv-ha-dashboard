// Builds ha-glance.stheme: a high-contrast card layout focused on the Proxmox server.
// Run from the smalltv-studio root:  node my-themes/ha-glance/build.mjs
// The animated weather icons are taken from ../ha-dashboard/ha-dashboard.stheme, so build that first.
import { createServer } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = new URL('./', import.meta.url);
// Same JSON as the other themes (Home Assistant writes it to /config/www/smalltv.json).
const DATA_URL = process.env.DATA_URL ?? 'http://YOUR-HA-IP:8123/local/smalltv.json';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const C = await vite.ssrLoadModule('/src/core/core.ts');
const S = await vite.ssrLoadModule('/src/core/source.ts');

/* ---------- palette (GitHub dark: high contrast, easy to read) ---------- */
const BG = '#0D1117', CARD = '#161B22', BORDER = '#30363D', TEXT = '#E6EDF3', MUTED = '#8B949E';
const BLUE = '#58A6FF', GREEN = '#3FB950', YELLOW = '#D29922', RED = '#F85149', ORANGE = '#F0883E', PURPLE = '#BC8CFF';

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
    rect(x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g.set(x, y); },
    line(x0, y0, x1, y1) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 || 1; for (let i = 0; i <= n; i++) g.set(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); },
    // Rounded rectangle filled with `fill`, outlined with `stroke`.
    card(x0, y0, x1, y1, r, fill, stroke) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r), d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d > r * r) continue;
        g.color(d > (r - 1) * (r - 1) || ((x === x0 || x === x1 || y === y0 || y === y1) && d === 0) ? stroke : fill); g.set(x, y);
      }
    },
  };
  return g;
}

/* ---------- reuse the animated weather icons from ha-dashboard ---------- */
const assets = new Map();
const dashboard = C.unpack(readFileSync(new URL('../ha-dashboard/ha-dashboard.stheme', import.meta.url)));
for (const [path, asset] of dashboard.assets) if (path.startsWith('anim/wx-')) assets.set(path, asset);
// [wi index from Home Assistant, id, frames, fps], as in ha-dashboard.
const weather = [[0, 'sunny', 8, 2], [1, 'night', 8, 2], [2, 'cloudy', 8, 2], [3, 'rain', 6, 4], [4, 'storm', 8, 4], [5, 'snow', 8, 3], [6, 'windy', 6, 3], [7, 'partly', 8, 2]];

/* ---------- layout ---------- */
const TILE_W = 111, TILE_H = 47, TILES = { cpu: [6, 92], mem: [123, 92], load: [6, 143], net: [123, 143] };
const BAR = { dx: 7, dy: 40, w: 97, h: 4 };
const DISKS = [['root', 44, 'ROOT'], ['nas', 120, 'NAS'], ['bk', 196, 'BACKUP']];
// Bars fade from the tile's accent to yellow and red towards the end.
const barRamp = accent => [[0, accent], [0.65, accent], [0.85, YELLOW], [1, RED]];
const BAR_COLORS = { cpu: BLUE, mem: PURPLE, load: GREEN };

/* ---------- background: cards, labels, small glyphs, fully lit bars ---------- */
const bg = canvas(240, 240).color(BG); bg.rect(0, 0, 239, 239);
bg.color(BORDER); bg.rect(6, 66, 233, 66);
for (const [, [x, y]] of Object.entries(TILES)) bg.card(x, y, x + TILE_W - 1, y + TILE_H - 1, 6, CARD, BORDER);
bg.card(6, 194, 233, 236, 6, CARD, BORDER);
for (const [id, accent] of Object.entries(BAR_COLORS)) {
  const [x, y] = TILES[id];
  for (let i = 0; i < BAR.w; i++) { bg.color(ramp(barRamp(accent), i / (BAR.w - 1))); bg.rect(x + BAR.dx + i, y + BAR.dy, x + BAR.dx + i, y + BAR.dy + BAR.h - 1); }
}
// House next to the indoor temperature.
bg.color(ORANGE); bg.line(136, 53, 143, 46); bg.line(143, 46, 150, 53); bg.rect(138, 52, 139, 59); bg.rect(147, 52, 148, 59); bg.rect(138, 58, 148, 59); bg.rect(142, 55, 144, 59);
// Network arrows: down (received) and up (sent).
const [nx, ny] = TILES.net;
bg.color(GREEN); bg.rect(nx + 10, ny + 16, nx + 11, ny + 24); bg.line(nx + 7, ny + 22, nx + 10, ny + 26); bg.line(nx + 14, ny + 22, nx + 11, ny + 26);
bg.color(ORANGE); bg.rect(nx + 10, ny + 33, nx + 11, ny + 41); bg.line(nx + 7, ny + 35, nx + 10, ny + 31); bg.line(nx + 14, ny + 35, nx + 11, ny + 31);
// Degree rings that never move: the indoor temperature (always two digits) and the right-aligned CPU temperature.
const ring = (cx, cy, r, color) => { bg.color(color); for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = x * x + y * y; if (d <= r * r + r * 0.6 && d > (r - 1) * (r - 1) + (r - 1) * 0.6) bg.set(cx + x, cy + y); } };
ring(183, 49, 3, ORANGE);
ring(TILES.cpu[0] + 101, TILES.cpu[1] + 21, 2, MUTED);
// Text labels go through the device renderer, so they use the device font.
assets.set('images/bg-raw.png.sti', C.fromRGBA(240, 240, bg.px));
const label = (id, x, y, value, anchor = 'top-left', color = MUTED) => ({ id, type: 'text', x, y, value, size: 8, color, anchor });
const tileLabel = (id, name, right) => {
  const [x, y] = TILES[id];
  return [label(id + '-l', x + 7, y + 6, name), ...(right ? [label(id + '-r', x + 103, y + 6, right, 'top-right')] : [])];
};
const bgTheme = {
  spec: 1, theme: { id: 'bg', name: 'bg', author: 'x', version: '1' }, display: { width: 240, height: 240, background: BG },
  layers: [
    { id: 'raw', type: 'image', x: 0, y: 0, source: 'images/bg-raw.png' },
    ...tileLabel('cpu', 'CPU', 'TEMP'), ...tileLabel('mem', 'MEMORY', 'SWAP'), ...tileLabel('load', 'LOAD', 'IOWAIT%'), ...tileLabel('net', 'NETWORK'),
    ...DISKS.map(([id, cx, name]) => label('d-' + id, cx, 199, name, 'top-center')),
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
const stops = (source, ...pairs) => ({ source, stops: pairs.map(([at, value]) => ({ at, value })) });
// Hides the bar above the value: starts at the value and covers the rest of the track.
const barMask = (id, source, input = [0, 100]) => {
  const [x, y] = TILES[id], x0 = x + BAR.dx;
  return {
    id: id + '-mask', type: 'shape', shape: 'rectangle', x: x0, y: y + BAR.dy, width: BAR.w, height: BAR.h, fill: BORDER,
    bind: { x: { source, input, output: [x0, x0 + BAR.w] }, width: { source, input, output: [BAR.w, 0] } },
  };
};
const tileValue = (id, value, source, warn, crit) => { const [x, y] = TILES[id]; return text(id, x + 7, y + 15, value, 24, TEXT, { bind: { color: stops(source, [0, TEXT], [warn, YELLOW], [crit, RED]) } }); };
const tileRight = (id, value, color, extra = {}) => { const [x, y] = TILES[id.split('-')[0]]; return text(id, x + 103, y + 18, value, 16, color, { anchor: 'top-right', ...extra }); };

const TEMP_STOPS = [[-50, BLUE], [10, '#79C0FF'], [18, YELLOW], [28, ORANGE], [33, RED]];
const DISK_STOPS = [[0, TEXT], [80, YELLOW], [90, RED]];
const theme = {
  spec: 1,
  theme: { id: 'ha-glance', name: 'HA Glance', author: 'idokimhi', version: '1.0.0' },
  display: { width: 240, height: 240, background: BG },
  data: [
    { id: 'wx', url: DATA_URL, interval: 30, fields: ['t', 'h', 'wi'].map(id => ({ id, path: 'wx.' + id })) },
    { id: 'pve', url: DATA_URL, interval: 30, fields: ['cpu', 'ram', 'bk'].map(id => ({ id, path: 'pve.' + id })) },
    { id: 'srv', url: DATA_URL, interval: 30, fields: ['up', 'g', 'cu', 'ld', 'lp', 'io', 'sw', 'dn'].map(id => ({ id, path: 'srv.' + id })) },
    { id: 'dsk', url: DATA_URL, interval: 30, fields: ['ul', 'root', 'nas', 'al'].map(id => ({ id, path: (id === 'ul' ? 'srv.' : 'dsk.') + id })) },
  ],
  layers: [
    { id: 'bg', type: 'image', x: 0, y: 0, source: 'images/bg.png' },
    text('time', 8, 6, '{HH}:{MM}', 40, TEXT),
    text('seconds', 162, 27, '{SS}', 16, MUTED),
    text('date', 8, 46, '{WD} {DD} {MON}', 16, BLUE),
    ...weather.map(([k, id, frames, fps]) => anim('wx-' + id, OFF, OFF, 48, frames, fps, { bind: onlyWhen('wx.wi', k, 188, -1) })),
    text('home', 154, 46, '{wx.h}', 16, ORANGE),
    text('temp', 224, 46, '{wx.t}', 16, YELLOW, { anchor: 'top-right', bind: { color: stops('wx.t', ...TEMP_STOPS) } }),
    { id: 'temp-deg', type: 'shape', shape: 'circle', x: 229, y: 49, radius: 3, stroke: YELLOW, strokeWidth: 1, bind: { stroke: stops('wx.t', ...TEMP_STOPS) } },
    // Server status: a dot colored by Glances' active alerts, uptime and running guests.
    { id: 'alert', type: 'shape', shape: 'circle', x: 12, y: 77, radius: 4, fill: MUTED, bind: { fill: stops('dsk.al', [0, GREEN], [1, YELLOW], [2, RED]) } },
    text('uptime', 22, 70, '{srv.up}', 16, TEXT),
    text('guests', 233, 70, '{srv.g}', 16, MUTED, { anchor: 'top-right' }),
    tileValue('cpu', '{srv.cu}%', 'srv.cu', 70, 90), barMask('cpu', 'srv.cu'),
    tileRight('cpu-temp', '{pve.cpu}', TEXT, { x: TILES.cpu[0] + 97, bind: { color: stops('pve.cpu', [0, TEXT], [66, YELLOW], [76, RED]) } }),
    tileValue('mem', '{pve.ram}%', 'pve.ram', 85, 91), barMask('mem', 'pve.ram'),
    tileRight('mem-swap', '{srv.sw}%', PURPLE),
    tileValue('load', '{srv.ld}', 'srv.lp', 70, 100), barMask('load', 'srv.lp'),
    tileRight('load-io', '{srv.io}', MUTED, { bind: { color: stops('srv.io', [0, MUTED], [5, YELLOW], [15, RED]) } }),
    text('net-down', TILES.net[0] + 20, TILES.net[1] + 14, '{srv.dn}', 16, GREEN),
    text('net-up', TILES.net[0] + 20, TILES.net[1] + 30, '{dsk.ul}', 16, ORANGE),
    ...DISKS.map(([id, cx]) => { const source = id === 'bk' ? 'pve.bk' : 'dsk.' + id; return text('disk-' + id, cx, 210, '{' + source + '}%', 24, TEXT, { anchor: 'top-center', bind: { color: stops(source, ...DISK_STOPS) } }); }),
  ],
};

const errors = C.validate(theme, assets);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
const pkg = C.pack(theme, assets);
writeFileSync(new URL('ha-glance.stheme', OUT), pkg);
writeFileSync(new URL('ha-glance-source.zip', OUT), S.zip(await S.sourceFiles(theme, assets)));

/* ---------- previews, rendered exactly as the device would ---------- */
const sample = o => Object.fromEntries(Object.entries(o).flatMap(([s, f]) => Object.entries(f).map(([k, v]) => [s + '.' + k, String(v)])));
const previews = {
  // Today's real values from Glances and Home Assistant.
  'preview.png': sample({ wx: { t: 20, h: 25, wi: 0 }, pve: { cpu: 44, ram: 86, bk: 82 }, srv: { up: 'up 8d 8h', g: '5VM 4CT', cu: 14, ld: '1.2', lp: 15, io: 1, sw: 36, dn: '6.4K/s' }, dsk: { ul: '5.5K/s', root: 68, nas: 37, al: 1 } }),
  'preview-busy.png': sample({ wx: { t: 34, h: 27, wi: 7 }, pve: { cpu: 79, ram: 94, bk: 91 }, srv: { up: 'up 3h 12m', g: '6VM 4CT', cu: 93, ld: '7.9', lp: 99, io: 18, sw: 71, dn: '48M/s' }, dsk: { ul: '912K/s', root: 84, nas: 52, al: 2 } }),
};
const time = new Date(Date.UTC(2026, 9, 14, 21, 37, 42));
const scaleUp = rgba => { const big = new Uint8ClampedArray(480 * 480 * 4); for (let y = 0; y < 480; y++) for (let x = 0; x < 480; x++) big.set(rgba.subarray(((y >> 1) * 240 + (x >> 1)) * 4, ((y >> 1) * 240 + (x >> 1)) * 4 + 4), (y * 480 + x) * 4); return big; };
for (const [file, data] of Object.entries(previews)) writeFileSync(new URL(file, OUT), await S.encodePNG(480, 480, scaleUp(C.render(theme, assets, time, 0, data))));
console.log('ok:', theme.layers.length, 'layers,', pkg.length, 'bytes,', assets.size, 'images,', C.manifestJson(theme).length, 'byte manifest');
await vite.close();
