// Renders the animated README previews with the device-exact renderer.
// Run from the smalltv-studio root:  node my-themes/docs/render-gifs.mjs && python my-themes/docs/make-gifs.py
// Writes raw RGBA frame strips to docs/frames/*.rgba; make-gifs.py turns them into GIFs.
import { createServer } from 'vite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url), OUT = new URL('frames/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const C = await vite.ssrLoadModule('/src/core/core.ts');
const load = path => C.unpack(readFileSync(new URL(path, ROOT)));
const data = o => Object.fromEntries(Object.entries(o).flatMap(([s, f]) => Object.entries(f).map(([k, v]) => [s + '.' + k, String(v)])));

const SUNNY = data({ wx: { t: 20, h: 25, c: 'Sunny', hu: '77%', pp: '0%', pph: 0, w: 8, wi: 0 }, pve: { cpu: 43, ram: 86, bk: 82, tl: 2, hl: 2 } });
const STORM = data({ wx: { t: 7, h: 19, c: 'Storm', hu: '88%', pp: '80%', pph: 1, w: 31, wi: 4 }, pve: { cpu: 81, ram: 93, bk: 95, tl: 1, hl: 2 } });
const PARTLY = data({ wx: { t: 31, h: 26, c: 'Partly cloudy', hu: '45%', pp: '10%', pph: 0, w: 14, wi: 7 }, pve: { cpu: 52, ram: 47, bk: 63, tl: 2, hl: 2 } });
const GLANCE = data({ wx: { t: 20, h: 25, wi: 0 }, pve: { cpu: 44, ram: 86, bk: 82 }, srv: { up: 'up 8d 8h', g: '5VM 4CT', cu: 14, ld: '1.2', lp: 15, io: 1, sw: 36, dn: '6.4K/s' }, dsk: { ul: '5.5K/s', root: 68, nas: 37, al: 1 } });

// [output name, package, sample data, seconds, frame step in ms]
const clips = [
  ['dashboard', 'ha-dashboard/ha-dashboard.stheme', SUNNY, 8, 250],
  ['dashboard-smooth-storm', 'ha-dashboard/ha-dashboard-smooth.stheme', STORM, 6, 250],
  ['dashboard-partly', 'ha-dashboard/ha-dashboard.stheme', PARTLY, 6, 250],
  ['neon', 'ha-neon/ha-neon.stheme', PARTLY, 6, 250],
  ['glance', 'ha-glance/ha-glance.stheme', GLANCE, 4, 250],
];
const start = Date.UTC(2026, 9, 14, 21, 37, 40);
for (const [name, path, sample, seconds, step] of clips) {
  const { theme, assets } = load(path), frames = [];
  for (let ms = 0; ms < seconds * 1000; ms += step) frames.push(C.render(theme, assets, new Date(start + ms), ms, sample));
  writeFileSync(new URL(name + '.rgba', OUT), Buffer.concat(frames.map(f => Buffer.from(f.buffer))));
  console.log(name, frames.length, 'frames');
}

// All eight weather icons side by side, each with its name, running at their real speeds.
const { assets } = load('ha-dashboard/ha-dashboard.stheme'), dash = load('ha-dashboard/ha-dashboard.stheme').theme;
const icons = dash.layers.filter(l => l.type === 'animation' && l.id.startsWith('wx-'));
const sheet = {
  spec: 1, theme: { id: 'icons', name: 'icons', author: 'x', version: '1' }, display: { width: 240, height: 240, background: '#000000' },
  layers: icons.flatMap((l, i) => {
    const x = 6 + (i % 4) * 58, y = 44 + Math.floor(i / 4) * 96;
    return [{ ...l, x, y, bind: undefined }, { id: l.id + '-name', type: 'text', x: x + 24, y: y + 54, value: l.id.slice(3), size: 8, color: '#8AB4F8', anchor: 'top-center' }];
  }),
};
const frames = [];
for (let ms = 0; ms < 4000; ms += 125) frames.push(C.render(sheet, assets, null, ms));
writeFileSync(new URL('icons.rgba', OUT), Buffer.concat(frames.map(f => Buffer.from(f.buffer))));
console.log('icons', frames.length, 'frames');
await vite.close();
