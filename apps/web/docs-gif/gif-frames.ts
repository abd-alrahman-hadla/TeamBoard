import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import { PNG } from 'pngjs';

const GAP = 6;
const GAP_COLOR = [24, 24, 27] as const;

/** Two screenshots side by side, separated by a thin dark bar. */
export function sideBySide(leftPng: Buffer, rightPng: Buffer): PNG {
  const left = PNG.sync.read(leftPng);
  const right = PNG.sync.read(rightPng);
  const height = Math.max(left.height, right.height);
  const out = new PNG({ width: left.width + GAP + right.width, height });
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = GAP_COLOR[0];
    out.data[i + 1] = GAP_COLOR[1];
    out.data[i + 2] = GAP_COLOR[2];
    out.data[i + 3] = 255;
  }
  PNG.bitblt(left, out, 0, 0, left.width, left.height, 0, 0);
  PNG.bitblt(right, out, 0, 0, right.width, right.height, left.width + GAP, 0);
  return out;
}

interface Frame {
  image: PNG;
  delay: number;
}

/** Collects frames; identical consecutive frames are merged into one longer frame. */
export class GifRecorder {
  private readonly frames: Frame[] = [];

  add(image: PNG, delay: number): void {
    const last = this.frames.at(-1);
    if (last && last.image.data.equals(image.data)) {
      last.delay += delay;
      return;
    }
    this.frames.push({ image, delay });
  }

  /** Holds the last frame a bit longer (e.g. a pause before the loop restarts). */
  hold(delay: number): void {
    const last = this.frames.at(-1);
    if (last) last.delay += delay;
  }

  get count(): number {
    return this.frames.length;
  }

  encode(): Uint8Array {
    const gif = GIFEncoder();
    for (const { image, delay } of this.frames) {
      const rgba = new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.length);
      const palette = quantize(rgba, 256);
      gif.writeFrame(applyPalette(rgba, palette), image.width, image.height, { palette, delay });
    }
    gif.finish();
    return gif.bytes();
  }
}
