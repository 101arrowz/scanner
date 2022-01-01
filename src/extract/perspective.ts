import { Quad, Point } from '.';

// logic stolen from https://math.stackexchange.com/a/339033

// 3x3 matrix adjugate
const adj3 = (src: Float32Array, dst = new Float32Array(9)) => {
  dst[0] = src[4] * src[8] - src[5] * src[7];
  dst[1] = src[2] * src[7] - src[1] * src[8];
  dst[2] = src[1] * src[5] - src[2] * src[4];
  dst[3] = src[5] * src[6] - src[3] * src[8];
  dst[4] = src[0] * src[8] - src[2] * src[6];
  dst[5] = src[2] * src[3] - src[0] * src[5];
  dst[6] = src[3] * src[7] - src[4] * src[6];
  dst[7] = src[1] * src[6] - src[0] * src[7];
  dst[8] = src[0] * src[4] - src[1] * src[3];
  return dst;
}

// 3x3 matrix multiplication
const mul3 = (a: Float32Array, b: Float32Array, dst = new Float32Array(9)) => {
  dst[0] = a[0] * b[0] + a[1] * b[3] + a[2] * b[6];
  dst[1] = a[0] * b[1] + a[1] * b[4] + a[2] * b[7];
  dst[2] = a[0] * b[2] + a[1] * b[5] + a[2] * b[8];
  dst[3] = a[3] * b[0] + a[4] * b[3] + a[5] * b[6];
  dst[4] = a[3] * b[1] + a[4] * b[4] + a[5] * b[7];
  dst[5] = a[3] * b[2] + a[4] * b[5] + a[5] * b[8];
  dst[6] = a[6] * b[0] + a[7] * b[3] + a[8] * b[6];
  dst[7] = a[6] * b[1] + a[7] * b[4] + a[8] * b[7];
  dst[8] = a[6] * b[2] + a[7] * b[5] + a[8] * b[8];
  return dst;
};

// 3x3 matrix multiplication with 3-vector
const mul3v = (a: Float32Array, b: Float32Array, dst = new Float32Array(3)) => {
  dst[0] = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  dst[1] = a[3] * b[0] + a[4] * b[1] + a[5] * b[2];
  dst[2] = a[6] * b[0] + a[7] * b[1] + a[8] * b[2];
  return dst;
};

// matrix that maps basis vectors to points
const basisToPoints = ({ a, b, c, d }: Quad) => {
  const m = new Float32Array([
    a.x, b.x, c.x,
    a.y, b.y, c.y,
    1,   1,   1
  ]);
  const coeffs = mul3v(adj3(m), new Float32Array([d.x, d.y, 1]));
  // Multiply values by coefficients
  return mul3(m, new Float32Array([
    coeffs[0], 0, 0,
    0, coeffs[1], 0,
    0, 0, coeffs[2]
  ]));
}

const createProjector = (from: Quad, to: Quad) => {
  const srcBasis = basisToPoints(from), dstBasis = basisToPoints(to);
  const proj = mul3(dstBasis, adj3(srcBasis));
  return (point: Point): Point => {
    const projected = mul3v(proj, new Float32Array([point.x, point.y, 1]));
    return {
      x: projected[0] / projected[2],
      y: projected[1] / projected[2]
    };
  };
}

export const perspective = ({ data, width, height }: ImageData, rect: Quad) => {
  const trueHeight = Math.floor(Math.max(
    Math.hypot(rect.a.x - rect.b.x, rect.a.y - rect.b.y) +
    Math.hypot(rect.c.x - rect.d.x, rect.c.y - rect.d.y)
  ) / 2);
  const trueWidth = Math.floor((
    Math.hypot(rect.a.x - rect.d.x, rect.a.y - rect.d.y) +
    Math.hypot(rect.b.x - rect.c.x, rect.b.y - rect.c.y)
  ) / 2);
  const newWidth = Math.min(trueWidth, 1224);
  const newHeight = Math.floor(trueHeight / trueWidth * newWidth);
  const projector = createProjector({
    a: { x: 0, y: newHeight },
    b: { x: 0, y: 0 },
    c: { x: newWidth, y: 0 },
    d: { x: newWidth, y: newHeight }
  }, rect);
  const out = new Uint8ClampedArray(newWidth * newHeight * 4);
  const offSW = width << 2, offSE = offSW + 4;
  for (let y = 0; y < newHeight; ++y) {
    for (let x = 0; x < newWidth; ++x) {
      const pt = projector({ x, y });
      const xf = Math.floor(pt.x);
      const yf = Math.floor(pt.y);
      const dBase = (y * newWidth + x) * 4;
      out[dBase + 3] = 255;
      if (xf >= -1 && xf < width && yf >= -1 && yf < height) {
        const xt = pt.x - xf;
        const xtr = 1 - xt;
        const yt = pt.y - yf;
        const ytr = 1 - yt;
        const rawBase = (yf * width + xf) * 4;
        for (let i = 0; i < 3; ++i) {
          const base = rawBase + i;
          let a = data[base] * xtr + data[base + 4] * xt;
          let b = data[base + offSW] * xtr + data[base + offSE] * xt;
          out[dBase + i] = a * ytr + b * yt;
        }
      }
    }
  }
  return new ImageData(out, newWidth, newHeight);
}