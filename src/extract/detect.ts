import { Quad, Point } from '.';

const clamp = (x: number, min: number, max: number) =>
  x < min
    ? min
    : x > max
      ? max
      : x;

// Convolution function
const convolve = (src: Float32Array, width: number, height: number, matrix: Float32Array, radius: number, dst = new Float32Array(src.length)) => {
  const matSide = (radius << 1) + 1;
  if (process.env.NODE_ENV != 'production') {
    if (src.length != width * height || matrix.length != matSide * matSide) {
      throw new Error('invalid dimensions');
    }
  }
  const iim = height - matSide, jim = width - matSide;
  for (let i = 0; i < height; ++i) {
    for (let j = 0; j < width; ++j) {
      let result = 0.0;
      const ii = clamp(i - radius, 0, iim), ji = clamp(j - radius, 0, jim);
      for (let mi = 0; mi < matSide; ++mi) {
        for (let mj = 0; mj < matSide; ++mj) {
          result += src[(mi + ii) * width + (mj + ji)] * matrix[mi * matSide + mj];
        }
      }
      dst[i * width + j] = result;
    }
  }
  return dst;
}

const grayscale = (src: Uint8ClampedArray, dst = new Float32Array(src.buffer, src.byteOffset, src.byteLength >> 2)) => {
  for (let px = 0; px < dst.length; ++px) {
    const pos = px << 2;
    dst[px] = src[pos] * 0.00116796875 + src[pos + 1] * 0.00229296875 + src[pos + 2] * 0.0004453125;
  }
  return dst;
}

const downscale = (src: Float32Array, width: number, height: number, by: number, dst?: Float32Array) => {
  const overBy = 1 / by;
  const dw = Math.floor(width * overBy);
  const dh = Math.floor(height * overBy);
  if (!dst) {
    dst = new Float32Array(dh * dw);
  }
  const overBy2 = overBy * overBy, mi = dh - 1, mj = dw - 1;
  for (let i = 1; i < mi; ++i) {
    const si = i * by, sie = si + by, sif = Math.floor(si), sic = sif + 1, sief = Math.floor(sie);
    const sir = sic - si, sire = sie - sief;
    for (let j = 1; j < mj; ++j) {
      const sj = j * by, sje = sj + by, sjf = Math.floor(sj), sjc = sjf + 1, sjef = Math.floor(sje);
      const sjr = sjc - sj, sjre = sje - sjef;
      let sum = 0;
      for (let rsi = sic; rsi < sief; ++rsi) {
        for (let rsj = sjc; rsj < sjef; ++rsj) {
          sum += src[rsi * width + rsj];
        }
      }
      for (let rsj = sjc; rsj < sjef; ++rsj)  {
        sum += src[sif * width + rsj] * sir;
        sum += src[sief * width + rsj] * sire;
      }
      for (let rsi = sic; rsi < sief; ++rsi)  {
        sum += src[rsi * width + sjf] * sjr;
        sum += src[rsi * width + sjef] * sjre;
      }
      sum += src[sif * width + sjf] * sir * sjr;
      sum += src[sif * width + sjef] * sir * sjre;
      sum += src[sief * width + sjf] * sire * sjr;
      sum += src[sief * width + sjef] * sire * sjre;
      dst[i * dw + j] = sum * overBy2;
    }
  }
  for (let i = 1; i < mi; ++i) {
    dst[i * dw] = dst[i * dw + 1];
    dst[i * dw + mj] = dst[i * dw + mj - 1];
  }
  for (let j = 0; j < dw; ++j) {
    dst[j] = dst[j + dw];
    dst[mi * dw + j] = dst[(mi - 1) * dw + j];
  }
  return dst;
}

const channel = (src: Uint8ClampedArray, channel: 0 | 1 | 2, dst = new Float32Array(src.buffer, src.byteOffset, src.byteLength >> 2)) => {
  for (let px = 0; px < dst.length; ++px) {
    dst[px] = src[(px << 2) + channel] / 255;
  }
  return dst;
}

const grayscaleToRGB = (src: Float32Array, dst = new Uint8ClampedArray(src.buffer, src.byteOffset, src.byteLength)) => {
  for (let px = 0; px < src.length; ++px) {
    const pos = px << 2;
    dst[pos] = dst[pos + 1] = dst[pos + 2] = src[px] * 255;
    dst[pos + 3] = 255;
  }
  return dst;
}

const gaussianKernel = new Float32Array([
  0.01258, 0.02516, 0.03145, 0.02516, 0.01258,
  0.02516, 0.0566, 0.07547, 0.0566, 0.02516,
  0.03145, 0.07547, 0.09434, 0.07547, 0.03145,
  0.02516, 0.0566, 0.07547, 0.0566, 0.02516,
  0.01258, 0.02516, 0.03145, 0.02516, 0.01258
]);
// const gaussianKernel = new Float32Array([
//   0.01134, 0.08382, 0.01134,
//   0.08382, 0.61935, 0.08382,
//   0.01134, 0.08382, 0.01134
// ]);

const gaussianBlur = (src: Float32Array, width: number, height: number, dst?: Float32Array) =>
  convolve(src, width, height, gaussianKernel, 2, dst);

const cos = new Float32Array(256);
const sin = new Float32Array(256);
for (let t = 0; t < 256; ++t) {
  const theta = Math.PI * t / 256;
  cos[t] = Math.cos(theta);
  sin[t] = Math.sin(theta);
}
sin[0] = cos[128];

const sortQuad = ({ a, b, c, d }: Quad): Quad => {
  const side = Math.hypot(a.x - b.x, a.y - b.y) + Math.hypot(c.x - d.x, c.y - d.y);
  const top = Math.hypot(b.x - c.x, b.y - c.y) + Math.hypot(d.x - a.x, d.y - a.y);
  // ab or cd
  if (side > top) {
    if (a.x + b.x < c.x + d.x) {
      return a.y > b.y
        ? { a: a, b: b, c: c, d: d }
        : { a: b, b: a, c: d, d: c };
    } else {
      return c.y > d.y
        ? { a: c, b: d, c: a, d: b }
        : { a: d, b: c, c: b, d: a };
    }
  } else {
    if (b.x + c.x < d.x + a.x) {
      return b.y > c.y
        ? { a: b, b: c, c: d, d: a }
        : { a: c, b: b, c: a, d: d };
    } else {
      return d.y > a.y
        ? { a: d, b: a, c: b, d: c }
        : { a: a, b: d, c: c, d: b };
    }
  }
}

const HOUGH_MATCH_RATIO = 1 / 40;
const GRADIENT_ERROR = 32;

export const detectDocument = ({ data, width, height }: ImageData, maxTries = 3) => {
  let scaleFactor = width / 360;
  if (scaleFactor < 2) {
    scaleFactor = 1;
  } else if (scaleFactor > 5) {
    scaleFactor = 5;
  }
  // This logic necessary for edge cases
  const scaleRatio = 1 / scaleFactor;
  const srcWidth = Math.floor(width * scaleRatio);
  const srcHeight = Math.floor(height * scaleRatio);
  const diag = Math.hypot(srcWidth, srcHeight);
  const numBins = Math.floor(diag);
  const srcLen = srcWidth * srcHeight;
  const scratch = new Float32Array(srcLen * 3 + (numBins << 8));
  const dst = scratch.subarray(0, srcLen);
  const gradBuf = scratch.subarray(srcLen, srcLen << 1);
  const src = scratch.subarray(srcLen << 1, srcLen * 3);
  const buf = scratch.subarray(srcLen * 3);
  if (scaleFactor == 1) {
    grayscale(data, src)
  } else {
    downscale(grayscale(data, new Float32Array(width * height)), width, height, scaleFactor, src);
  }
  gaussianBlur(src, srcWidth, srcHeight, dst);
  const east = 1, southwest = srcWidth - 1, south = srcWidth, southeast = srcWidth + 1;
  const iim = srcHeight - 1, jim = srcWidth - 1;
  let totalGrad = 0.0, max = 0.0;
  for (let i = 1; i < iim; ++i) {
    for (let j = 1; j < jim; ++j) {
      const px = i * srcWidth + j;
      const nw = dst[px - southeast], n = dst[px - south], ne = dst[px - southwest], w = dst[px - east],
            e = dst[px + east], sw = dst[px + southwest], s = dst[px + south], se = dst[px + southeast];
      const sx = 10 * (e - w) + 3 * (ne + se - nw - sw);
      const sy = 10 * (n - s) + 3 * (ne + nw - se - sw);
      const dir = sy / sx;
      const grad = Math.pow(sx * sx + sy * sy, 0.3) || 0;
      // Add 128 to fix range. Note that this requires rotating the coordinate system
      const angle = Math.floor(Math.atan(dir) * 256 / Math.PI) + 128;
      if (!isNaN(angle)) {
        for (let off = -GRADIENT_ERROR; off <= GRADIENT_ERROR; ++off) {
          let ang = (angle + off) & 255;
          const bin = (cos[ang] * i + sin[ang] * j + diag) >> 1;
          max = Math.max(max, buf[(bin << 8) + ang] += grad / (off * off + 3));
        }
      }
      // Two shifts because otherwise indexing is messed up by in-between values
      gradBuf[px] = grad;
      totalGrad += grad;
    }
  }
  const avgGrad = totalGrad / ((srcHeight - 2) * (srcWidth - 2));
  type Line = { b: number; a: number; s: number; };
  for (let threshold = max * 0.05, numTries = maxTries; numTries > 0; --numTries, threshold *= 0.5) {
    let lines: Line[] = [];
    for (let bin = 0; bin < numBins; ++bin) {
      for (let angle = 0; angle < 256; ++angle) {
        const ind = (bin << 8) + angle;
        let val = buf[ind];
        if (val > threshold) {
          lines.push({ b: bin, a: angle, s: val });
        }
      }
    }
    lines.sort((a, b) => b.s - a.s);
    const maxBinErr = Math.ceil(numBins * HOUGH_MATCH_RATIO), maxAngleErr = Math.ceil(256 * HOUGH_MATCH_RATIO);
    for (let i = 0; i < lines.length; ++i) {
      const { b: l1b, a: l1a, s: l1s } = lines[i];
      let strength = l1s;
      for (let j = i + 1; j < lines.length; ++j) {
        const { b, a, s } = lines[j];
        let angleErr = Math.abs(l1a - a);
        if (Math.abs(l1b - b) <= maxBinErr && Math.min(angleErr, 256 - angleErr) <= maxAngleErr) {
          lines.splice(j, 1);
          strength += s;
          --j;
        }
      }
      lines[i].s = strength;
    }
    const intersection = (l1: Line, l2: Line): Point => {
      const a = sin[l1.a], d = sin[l2.a];
      const b = cos[l1.a], e = cos[l2.a];
      const c = (l1.b << 1) - diag, f = (l2.b << 1) - diag;
      // derived on paper
      const y = (a * f - d * c) / (a * e - d * b);
      const x = (c - y * b) / a;
      return { x, y };
    }
    // within ellipse that inscribes rectangle with same aspect ratio, expanded a bit
    // basically allows for minor corner clipping
    const inBounds = (p: Point) => {
      const x = p.x / srcWidth - 0.5, y = p.y / srcHeight - 0.5;
      // less than or equal to 0.5 for perfect inscription
      return x * x + y * y <= 0.55;
    };
    lines.sort((a, b) => b.s - a.s);
    // Max 5000 quadrilaterals to check
    if (lines.length > 20) {
      lines = lines.slice(0, 20);
      numTries = 1;
    }
    const scoreBetween = (a: Point, b: Point) => {
      let score = 0.0;
      // TODO: optimize
      // algorithm shamelessly robbed from https://en.wikipedia.org/wiki/Bresenham%27s_line_algorithm
      const xi = Math.round(a.x), yi = Math.round(a.y);
      const xf = Math.round(b.x), yf = Math.round(b.y);
      const dx = Math.abs(xf - xi), dy = -Math.abs(yf - yi);
      const sx = xi < xf ? 1 : -1;
      const sy = yi < yf ? 1 : -1;
      for (let x = xi, y = yi, err = dx + dy; x != xf || y != yf;) {
        const px = y * srcWidth + x;
        score += (gradBuf[px] || 0) - avgGrad;
        const e2 = err * 2;
        if (e2 >= dy) {
          err += dy;
          x += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y += sy;
        }
      }
      // Low dependence on length
      return score * (Math.pow(dx - dy, -0.6) || 0);
    }
    const scoreQuad = ({ a, b, c, d }: Quad) => {
      return Math.pow(scoreBetween(a, b) + scoreBetween(b, c) + scoreBetween(c, d) + scoreBetween(d, a), 2);
    }
    const rightErr = (l1: Line, l2: Line) => {
      const err = Math.abs(l1.a - l2.a) - 128;
      return err * err + 1;
    }
    const scoreLines = (l1: Line, l2: Line, l3: Line, l4: Line) => {
      const e12 = rightErr(l1, l2), e23 = rightErr(l2, l3), e34 = rightErr(l3, l4), e41 = rightErr(l4, l1);
      return Math.pow(e12 * e12 + e23 * e23 + e34 * e34 + e41 * e41, -0.3) * Math.pow(l1.s * l2.s * l3.s * l4.s, 0.1);
    }
    const rects: { q: Quad; s: number; }[] = [];
    for (let i = 0; i < lines.length; ++i) {
      const l1 = lines[i];
      for (let j = i + 1; j < lines.length; ++j) {
        const l2 = lines[j];
        const i12 = intersection(l1, l2);
        for (let k = j + 1; k < lines.length; ++k) {
          const l3 = lines[k];
          const i13 = intersection(l1, l3);
          const i23 = intersection(l2, l3);
          if (inBounds(i12)) {
            // assume corner is a page corner
            // then i13 XOR i23 must also be a corner
            if (inBounds(i13)) {
              if (!inBounds(i23)) {
                for (let l = k + 1; l < lines.length; ++l) {
                  const l4 = lines[l];
                  const i14 = intersection(l1, l4);
                  const i24 = intersection(l2, l4);
                  const i34 = intersection(l3, l4);
                  if (!inBounds(i14) && inBounds(i24) && inBounds(i34)) {
                    const q = { a: i12, b: i13, c: i34, d: i24 };
                    rects.push({
                      q,
                      s: scoreQuad(q) * scoreLines(l1, l3, l4, l2)
                    });
                  }
                }
              }
            } else if (inBounds(i23)) {
              for (let l = k + 1; l < lines.length; ++l) {
                const l4 = lines[l];
                const i14 = intersection(l1, l4);
                const i24 = intersection(l2, l4);
                const i34 = intersection(l3, l4);
                if (!inBounds(i24) && inBounds(i14) && inBounds(i34)) {
                  const q = { a: i12, b: i23, c: i34, d: i14 };
                  rects.push({
                    q,
                    s: scoreQuad(q) * scoreLines(l2, l3, l4, l1)
                  });
                }
              }
            }
          } else {
            // l1, l2 might be parallel
            // l3 must be perpendicular
            if (inBounds(i13) && inBounds(i23)) {
              for (let l = k + 1; l < lines.length; ++l) {
                const l4 = lines[l];
                const i14 = intersection(l1, l4);
                const i24 = intersection(l2, l4);
                const i34 = intersection(l3, l4);
                if (!inBounds(i34) && inBounds(i14) && inBounds(i24)) {
                  const q = { a: i13, b: i23, c: i24, d: i14 };
                  rects.push({
                    q,
                    s: scoreQuad(q) * scoreLines(l3, l2, l4, l1)
                  });
                }
              }
            }
          }
        }
      }
    }
    rects.sort((a, b) => b.s - a.s);
    if (!rects.length) continue;
    const rect = sortQuad(rects[0].q);
    return {
      a: {
        x: rect.a.x * scaleFactor,
        y: rect.a.y * scaleFactor
      },
      b: {
        x: rect.b.x * scaleFactor,
        y: rect.b.y * scaleFactor
      },
      c: {
        x: rect.c.x * scaleFactor,
        y: rect.c.y * scaleFactor
      },
      d: {
        x: rect.d.x * scaleFactor,
        y: rect.d.y * scaleFactor
      }
    };
  }
}