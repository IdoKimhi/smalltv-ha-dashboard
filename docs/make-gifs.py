"""Turns the frame strips from render-gifs.mjs into 2x-scaled looping GIFs next to this file."""
from pathlib import Path
from PIL import Image

HERE = Path(__file__).parent
STEPS = {'icons': 125}  # ms per frame; everything else uses 250

for strip in sorted((HERE / 'frames').glob('*.rgba')):
    raw = strip.read_bytes()
    size = 240 * 240 * 4
    frames = [Image.frombytes('RGBA', (240, 240), raw[i:i + size]).convert('RGB').resize((480, 480), Image.NEAREST)
              for i in range(0, len(raw), size)]
    out = HERE / (strip.stem + '.gif')
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=STEPS.get(strip.stem, 250), loop=0, optimize=True)
    print(out.name, len(frames), 'frames,', out.stat().st_size // 1024, 'KiB')
