import { PNG } from 'pngjs';
import { GifRecorder, sideBySide } from './gif-frames';

function solid(width: number, height: number, rgb: [number, number, number]): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgb[0];
    png.data[i + 1] = rgb[1];
    png.data[i + 2] = rgb[2];
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

describe('gif frames', () => {
  it('puts two screenshots side by side with a gap', () => {
    const out = sideBySide(solid(4, 3, [255, 0, 0]), solid(5, 3, [0, 0, 255]));
    expect([out.width, out.height]).toEqual([4 + 6 + 5, 3]);
    expect([...out.data.subarray(0, 3)]).toEqual([255, 0, 0]);
    const rightStart = (4 + 6) * 4;
    expect([...out.data.subarray(rightStart, rightStart + 3)]).toEqual([0, 0, 255]);
  });

  it('merges identical frames and encodes a GIF', () => {
    const red = sideBySide(solid(4, 3, [255, 0, 0]), solid(4, 3, [255, 0, 0]));
    const blue = sideBySide(solid(4, 3, [0, 0, 255]), solid(4, 3, [0, 0, 255]));
    const gif = new GifRecorder();
    gif.add(red, 100);
    gif.add(sideBySide(solid(4, 3, [255, 0, 0]), solid(4, 3, [255, 0, 0])), 100);
    gif.add(blue, 100);
    expect(gif.count).toBe(2);
    const bytes = gif.encode();
    expect(new TextDecoder().decode(bytes.subarray(0, 6))).toBe('GIF89a');
  });
});
