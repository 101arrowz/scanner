import { useEffect, useRef, useState } from 'react';
import { css } from '@emotion/react';
import { render } from 'react-dom';

const readFile = Blob.prototype.arrayBuffer || function(this: Blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      resolve(fr.result as ArrayBuffer);
    };
    fr.onerror = () => {
      reject(fr.error);
    };
    fr.readAsArrayBuffer(this);
  })
}

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d')!;

const getImage = async (img: File) => {
  const elem = document.createElement('img');
  const loaded = new Promise<void>((resolve, reject) => {
    elem.onload = () => { resolve(); };
    elem.onerror = err => { reject(err); };
  });
  elem.src = URL.createObjectURL(img);
  await loaded;
  URL.revokeObjectURL(elem.src);
  canvas.width = elem.width, canvas.height = elem.height;
  ctx.drawImage(elem, 0, 0);
  return ctx.getImageData(0, 0, elem.width, elem.height);
}

const download = (file: Blob, name: string) => {
  const url = URL.createObjectURL(file);
  const el = document.createElement('a');
  el.download = name;
  el.href = url;
  el.click();
  URL.revokeObjectURL(url);
}

const clamp = (x: number, min: number, max: number) =>
  x < min
    ? min
    : x > max
      ? max
      : x;

// Convolution function
const convolve = (src: Float32Array, width: number, height: number, matrix: Float32Array, radius: number, dst = new Float32Array(src.length)) => {
  const matSide = (radius << 1) + 1;
  if (process.env.NODE_ENV !== 'production') {
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

const convolver = (matrix: Float32Array, radius: number) =>
  (src: Float32Array, width: number, height: number, dst?: Float32Array) =>
    convolve(src, width, height, matrix, radius, dst);

const grayscale = (src: Uint8ClampedArray, dst = new Float32Array(src.buffer, src.byteOffset, src.byteLength >> 2)) => {
  for (let px = 0; px < dst.length; ++px) {
    const pos = px << 2;
    dst[px] = src[pos] * 0.00116796875 + src[pos + 1] * 0.00229296875 + src[pos + 2] * 0.0004453125;
  }
  return dst;
}

const downscale = (src: Float32Array, width: number, height: number, by: number, dst?: Float32Array) => {
  const dw = Math.floor(width / by);
  const dh = Math.floor(height / by)
  if (!dst) {
    dst = new Float32Array(dh * dw);
  }
  const by2 = by * by;
  for (let i = 0; i < dh; ++i) {
    const si = i * by, sie = si + by, sif = Math.floor(si), sic = sif + 1, sief = Math.floor(sie);
    const sir = sic - si, sire = sie - sief;
    for (let j = 0; j < dw; ++j) {
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
      dst[i * dw + j] = sum / by2;
    }
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

const gaussianBlur = (src: Float32Array, width: number, height: number, dst?: Float32Array) =>
  convolve(src, width, height, gaussianKernel, 2, dst);

const cos = new Float32Array(256);
const sin = new Float32Array(256);
for (let t = 0; t < 256; ++t) {
  const theta = Math.PI * t / 256;
  cos[t] = Math.cos(theta);
  sin[t] = Math.sin(theta);
}

const HOUGH_MATCH_RATIO = 1 / 40;

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

type Point = { x: number, y: number; };
type Quad = { a: Point; b: Point; c: Point; d: Point; };

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

if (process.env.NODE_ENV !== 'production' && /(iPad)|(iPhone)|(iPod)|(android)|(webOS)/i.test(navigator.userAgent)) {
  console.log = (...data) => {
    const el = document.createElement('div');
    el.textContent = data.map(v => typeof v == 'object' ? JSON.stringify(v) : v).join(' ');
    document.body.appendChild(el);
  }
  console.timeLog = (label, ...data) => {
    console.log(label + ' ' + performance.now() + ' ' + data.join(' '));
  }
}

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

const toPDF = async (images: ImageData[]) => {
  const pdfChunks: (string | ArrayLike<number>)[] = [];
  let index = 0;
  const offsets: number[] = [];
  const write = (chunk: string | ArrayLike<number>) => {
    pdfChunks.push(chunk);
    index += chunk.length;
  }
  const token = (chunk: string | ArrayLike<number>) => {
    write(' ');
    write(chunk);
  }
  const concat = (chunks: (string | ArrayLike<number>)[]) => {
    let len = 0;
    for (const chunk of chunks) len += chunk.length;
    const buf = new Uint8Array(len);
    len = 0;
    for (const chunk of chunks) {
      if (typeof chunk == 'string') {
        for (let i = 0; i < chunk.length; ++i) buf[i + len] = chunk.charCodeAt(i);
      } else {
        buf.set(chunk, len);
      }
      len += chunk.length;
    }
    return buf;
  }
  // Convenience functions
  const comment = (content: string) => {
    write("%" + content + '\n');
  }
  const number = (value: number) => {
    // Note: this doesnt work for very small and very large numbers
    token(value.toString());
  }
  const ascii = (value: string) => {
    token('(' + value.replace(/[\n\r\t\f\b\(\)\\]/g, c => '\\00' + c.charCodeAt(0).toString(8)) + ')');
  }
  const bin = (value: string | ArrayLike<number>) => {
    let data = '<';
    if (typeof value == 'string') {
      for (let i = 0; i < value.length; ++i) {
        data += value.charCodeAt(i).toString(16);
      }
    } else {
      for (let i = 0; i < value.length; ++i) {
        data += value[i].toString(16);
      }
    }
    token(data + '>');
  };
  const name = (value: string) => {
    // Note: only supports ASCII names
    token('/' + value);
  };
  const array = (fn: () => void) => {
    token('[');
    fn();
    token(']');
  };
  type Dict = Record<string, () => void>;
  const dict = (values: Dict) => {
    token('<<');
    for (const key in values) {
      name(key);
      values[key]();
    }
    token('>>');
  };
  const stream = (desc: Dict, content: ArrayLike<number>) => {
    if (!desc['Length']) throw new TypeError('need stream length');
    dict(desc);
    token('stream\n');
    write(content);
    write('endstream');
  };
  const object = (fn: () => void,) => {
    write(' ');
    write(offsets.push(index) + ' 0 obj');
    fn();
    token('endobj');
    return offsets.length;
  };
  const reference = (id: number) => {
    token(id + ' 0 R');
  }
  const nullObject = () => {
    token('null');
  };

  // v1.4 for compatibility
  comment('PDF-1.4');
    // 4 byte binary comment, as suggested by spec
  comment('\x90\x85\xfa\xe3');
  const pages = await Promise.all(images.map(async img => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d')!.putImageData(img, 0, 0);
    const jpeg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
    const jpegData = new Uint8Array(await readFile.call(jpeg));
    const image = object(() => {
      stream({
        Type() {
          name('XObject');
        },
        Subtype() {
          name('Image');
        },
        Width() {
          number(img.width);
        },
        Height() {
          number(img.height);
        },
        ColorSpace() {
          name('DeviceRGB');
        },
        BitsPerComponent() {
          number(8);
        },
        Filter() {
          name('DCTDecode');
        },
        Length() {
          number(jpegData.length);
        }
      }, jpegData);
    });
    // US Letter width
    const height = 792;
    const width = height * img.width / img.height;
    const contents = object(() => {
      const result = `${width} 0 0 ${height} 0 0 cm /I Do`;
      stream({
        Length() {
          number(result.length);
        }
      }, concat([
        result
      ]));
    });
    const page = object(() => {
      dict({
        Type() {
          name('Page')
        },
        Parent() {
          reference(offsets.length + 1);
        },
        Resources() {
          dict({
            XObject() {
              dict({
                I() {
                  reference(image);
                }
              });
            }
          });
        },
        Contents() {
          reference(contents);
        },
        MediaBox() {
          array(() => {
            number(0);
            number(0);
            number(width);
            number(height);
          });
        }
      });
    });
    return page;
  }));

  const pageRoot = object(() => {
    dict({
      Type() {
        name('Pages');
      },
      Kids() {
        array(() => {
          for (const page of pages) {
            reference(page);
          }
        });
      },
      Count() {
        number(pages.length);
      }
    })
  });

  const catalog = object(() => {
    dict({
      Type() {
        name('Catalog');
      },
      Pages() {
        reference(pageRoot);
      }
    });
  });

  // XREF
  write('\n');
  const xrefOffset = index;
  write('xref\n0 ' + (offsets.length + 1) + '\n0000000000 65535 f \n');
  for (const offset of offsets) {
    write(offset.toString().padStart(10, '0') + ' 00000 n \n');
  }
  write('trailer');
  dict({
    Size() {
      number(offsets.length + 1);
    },
    Root() {
      reference(catalog);
    }
  });
  write('\nstartxref\n' + xrefOffset + '\n%%EOF');
  return concat(pdfChunks);
}

const detectDocument = ({ data, width, height }: ImageData, maxTries = 3) => {
  console.time('document');
  const diag = Math.hypot(width, height);
  const numBins = Math.floor(diag);
  let scaleFactor = width / 360;
  if (scaleFactor < 2) {
    scaleFactor = 1;
  } else if (scaleFactor > 5) {
    scaleFactor = 5;
  }
  const srcWidth = Math.floor(width / scaleFactor);
  const srcHeight = Math.floor(height / scaleFactor);
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
  console.timeLog('document', 'grayscale');
  gaussianBlur(src, srcWidth, srcHeight, dst);
  console.timeLog('document', 'blur');
  const east = 1, southwest = srcWidth - 1, south = srcWidth, southeast = srcWidth + 1;
  const iim = srcHeight - 1, jim = srcWidth - 1;
  let totalGrad = 0.0;
  for (let i = 1; i < iim; ++i) {
    for (let j = 1; j < jim; ++j) {
      const px = i * srcWidth + j;
      const nw = dst[px - southeast], n = dst[px - south], ne = dst[px - southwest], w = dst[px - east],
            e = dst[px + east], sw = dst[px + southwest], s = dst[px + south], se = dst[px + southeast];
      const sx = 10 * (e - w) + 3 * (ne + se - nw - sw);
      const sy = 10 * (n - s) + 3 * (ne + nw - se - sw);
      const dir = sy / sx;
      const grad = Math.hypot(sx, sy);
      // Add 128 to fix range. Note that this requires rotating the coordinate system
      const angle = Math.floor(Math.atan(dir) * 256 / Math.PI) + 128;
      // Two shifts because otherwise indexing is messed up by in-between values
      const bin = (cos[angle] * i + sin[angle] * j + diag) >> 1;
      buf[(bin << 8) + angle] += grad;
      gradBuf[px] = grad;
      totalGrad += grad;
    }
  }
  const avgGrad = totalGrad / ((srcHeight - 2) * (srcWidth - 2));
  console.timeLog('document', 'tally');
  type Line = { b: number; a: number; s: number; };
  let max = 0.0;
  for (let px = 0; px < buf.length; ++px) max = Math.max(buf[px], max);
  console.timeLog('document', 'tally2');
  for (let threshold = max * 0.1, numTries = maxTries; numTries > 0; --numTries, threshold *= 0.5) {
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
    console.timeLog('document', 'tally3');
    lines.sort((a, b) => b.s - a.s);
    const maxBinErr = Math.ceil(numBins * HOUGH_MATCH_RATIO), maxAngleErr = Math.ceil(256 * HOUGH_MATCH_RATIO);
    for (let i = 0; i < lines.length; ++i) {
      const { b: l1b, a: l1a, s: l1s } = lines[i];
      let strength = l1s;
      for (let j = i + 1; j < lines.length; ++j) {
        const { b, a, s } = lines[j];
        if (Math.abs(l1b - b) <= maxBinErr && Math.abs(l1a - a) <= maxAngleErr) {
          lines.splice(j, 1);
          strength += s;
          --j;
        }
      }
      lines[i].s = strength;
    }
    console.timeLog('document', 'hough');
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
    console.log(lines);
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
        score += (gradBuf[px] || 0) - avgGrad - avgGrad;
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
      return Math.max(score, 0) * Math.pow(dx * dx + dy * dy, -0.3);
    }
    const scoreQuad = ({ a, b, c, d }: Quad) => {
      // const ab = Math.hypot(a.x - b.x, a.y - b.y);
      // const bc = Math.hypot(b.x - c.x, b.y - c.y);
      // const cd = Math.hypot(c.x - d.x, c.y - d.y);
      // const ad = Math.hypot(d.x - a.x, d.y - a.y);
      // let rat: number;
      // if (ab + cd > bc + ad) {
      //   rat = Math.pow(Math.abs(((ab + cd) / (bc + ad)) - 11 / 8.5) + 1, 3);
      // } else {
      //   rat = Math.pow(Math.abs(((bc + ad) / (ab + cd)) - 11 / 8.5) + 1, 3);
      // }
      // rat = 1;
      return Math.pow(scoreBetween(a, b) * scoreBetween(b, c) * scoreBetween(c, d) * scoreBetween(d, a), 2);
    }
    const rightErr = (l1: Line, l2: Line) => {
      const err = Math.abs(l1.a - l2.a) - 128;
      return err * err + 1;
    }
    const scoreLines = (l1: Line, l2: Line, l3: Line, l4: Line) => {
      const e12 = rightErr(l1, l2), e23 = rightErr(l2, l3), e34 = rightErr(l3, l4), e41 = rightErr(l4, l1);
      return Math.pow(e12 * e12 + e23 * e23 + e34 * e34 + e41 * e41, -0.2) * Math.pow(l1.s * l2.s * l3.s * l4.s, 0.3);
    }
    const rects: { q: Quad; s: number; }[] = []
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
    console.timeLog('document', 'rects');
    rects.sort((a, b) => b.s - a.s);
    console.log(rects);
    if (!rects.length) continue;
    const rect = rects[0].q;
    if (process.env.NODE_ENV !== 'production') {
      const ctx = plot(grayscaleToRGB(src, new Uint8ClampedArray(dst.length << 2)), srcWidth, srcHeight);
      for (const { b, a, s } of lines) {
        const bin = Math.round(b), angle = a * Math.PI / 256;
        ctx.strokeStyle = `rgba(255, 0, 0, ${1})`;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const rho = ((bin << 1) - diag);
        const x = s * rho, y = c * rho;
        ctx.moveTo(x + c * 10000, y - s * 10000);
        ctx.lineTo(x - c * 10000, y + s * 10000);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.strokeStyle = `rgba(0, 0, 255, ${1})`;
      ctx.lineWidth = 2;
      ctx.moveTo(rect.a.x, rect.a.y);
      const go = (x: number, y: number, col: string) => {
        ctx.fillStyle = col;
        ctx.lineTo(x, y);
        ctx.fillRect(x - 10, y - 10, 21, 21);
      };
      go(rect.b.x, rect.b.y, 'green');
      go(rect.c.x, rect.c.y, 'blue');
      go(rect.d.x, rect.d.y, 'purple');
      go(rect.a.x, rect.a.y, 'red');
      ctx.stroke();
      ctx.closePath();
    }
    const sorted = sortQuad(rect);
    sorted.a.x *= scaleFactor;
    sorted.b.x *= scaleFactor;
    sorted.c.x *= scaleFactor;
    sorted.d.x *= scaleFactor;
    sorted.a.y *= scaleFactor;
    sorted.b.y *= scaleFactor;
    sorted.c.y *= scaleFactor;
    sorted.d.y *= scaleFactor;
    console.timeEnd('document');
    return sorted;
  }
}

const perspective = ({ data, width, height }: ImageData, rect: Quad) => {
  const trueHeight = Math.floor(Math.max(
    Math.hypot(rect.a.x - rect.b.x, rect.a.y - rect.b.y) +
    Math.hypot(rect.c.x - rect.d.x, rect.c.y - rect.d.y)
  ) / 2);
  const trueWidth = Math.floor((
    Math.hypot(rect.a.x - rect.d.x, rect.a.y - rect.d.y) +
    Math.hypot(rect.b.x - rect.c.x, rect.b.y - rect.c.y)
  ) / 2);
  const newHeight = Math.min(trueHeight, 1584);
  const newWidth = Math.floor(8.5 / 11 * newHeight) // Math.floor(trueWidth / trueHeight * newHeight);
  const projector = createProjector({
    a: { x: 0, y: newHeight },
    b: { x: 0, y: 0 },
    c: { x: newWidth, y: 0 },
    d: { x: newWidth, y: newHeight }
  }, rect);
  const out = new Uint8ClampedArray(newWidth * newHeight * 4);
  for (let y = 0; y < newHeight; ++y) {
    for (let x = 0; x < newWidth; ++x) {
      const pt = projector({ x, y });
      const xf = Math.floor(pt.x);
      const yf = Math.floor(pt.y);
      const dBase = (y * newWidth + x) * 4;
      out[dBase + 3] = 255;
      if (xf >= -1 && xf < width && yf >= -1 && yf < height) {
        const xt = pt.x - xf;
        const yt = pt.y - yf;
        const rawBase = (yf * width + xf) * 4;
        for (let i = 0; i < 3; ++i) {
          const base = rawBase + i;
          let a = data[base] * (1 - xt) + data[base + 4] * xt;
          let b = data[base + 4 * width] * (1 - xt) + data[base + 4 * width + 4] * xt;
          out[dBase + i] = a * (1 - yt) + b * yt;
        }
      }
    }
  }
  return new ImageData(out, newWidth, newHeight);
}

const normalize = (src: Float32Array, dst = src) => {
  let max = Number.EPSILON;
  for (let px = 0; px < dst.length; ++px) max = Math.max(max, src[px]);
  for (let px = 0; px < dst.length; ++px) dst[px] = src[px] / max;
  return dst;
}

const plot = (src: Uint8ClampedArray, width: number, height: number) => {
  const into = document.createElement('canvas');
  into.addEventListener('click', e => {
    console.log(`x: ${e.offsetX}, y: ${e.offsetY}`)
  })
  into.width = width;
  into.height = height;
  const ctx = into.getContext('2d')!;
  ctx.putImageData(new ImageData(src, width, height), 0, 0);
  document.body.appendChild(into);
  return ctx;
}

const DocumentDetectionStream = () => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D>();
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({
      video: {
        // width: { ideal: 4096 },
        // height: { ideal: 2160 },
        facingMode: 'environment'
      }
    }).then(mediaStream => {
      const { width, height } = mediaStream.getVideoTracks()[0].getSettings();
      const vid = document.createElement('video');
      if ('srcObject' in vid) {
        vid.srcObject = mediaStream;
      } else {
        vid.src = URL.createObjectURL(mediaStream as unknown as MediaSource);
      }
      vid.play();
      canvas.current!.width = width!;
      canvas.current!.height = height!;
      const ctx = ctxRef.current!;
      const step = () => {
        ctx.drawImage(vid, 0, 0);
        const imageData = ctx.getImageData(0, 0, width!, height!);
        const rect = detectDocument(imageData);
        if (rect) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(0, 0, 255, ${1})`;
          ctx.lineWidth = 2;
          ctx.moveTo(rect.a.x, rect.a.y);
          const go = (x: number, y: number, col: string) => {
            ctx.fillStyle = col;
            ctx.lineTo(x, y);
            ctx.fillRect(x - 10, y - 10, 21, 21);
          };
          go(rect.b.x, rect.b.y, 'green');
          go(rect.c.x, rect.c.y, 'blue');
          go(rect.d.x, rect.d.y, 'purple');
          go(rect.a.x, rect.a.y, 'red');
          ctx.stroke();
          ctx.closePath();
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }, []);
  useEffect(() => {
    ctxRef.current = canvas.current!.getContext('2d')!;
  }, [canvas]);
  return <canvas ref={canvas} width={0} height={0} />;
}

const App = () => {
  return <DocumentDetectionStream />
  return <input type="file" accept="image/*" onChange={async ({ currentTarget: { files } }) => {
    const img = await getImage(files![0]);
    let rect = detectDocument(img);
    if (rect) {
      download(new Blob([await toPDF([perspective(img, rect)])]), 'out.pdf');
    }
  }}></input>
}

render(<App />, document.getElementById('root'));