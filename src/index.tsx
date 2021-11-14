import { render } from 'react-dom';

const readFile = File.prototype.arrayBuffer || function(this: File) {
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

const grayscale = (src: Uint8ClampedArray, dst = new Float32Array(src.buffer)) => {
  for (let px = 0; px < dst.length; ++px) {
    const pos = px << 2;
    dst[px] = src[pos] * 0.00116796875 + src[pos + 1] * 0.00229296875 + src[pos + 2] * 0.0004453125;
  }
  return dst;
}

const channel = (src: Uint8ClampedArray, channel: 0 | 1 | 2, dst = new Float32Array(src.buffer)) => {
  for (let px = 0; px < dst.length; ++px) {
    dst[px] = src[(px << 2) + channel] / 255;
  }
  return dst;
}

const grayscaleToRGB = (src: Float32Array, dst = new Uint8ClampedArray(src.buffer)) => {
  for (let px = 0; px < src.length; ++px) {
    const pos = px << 2;
    dst[pos] = dst[pos + 1] = dst[pos + 2] = src[px] * 255;
    dst[pos + 3] = 255;
  }
  return dst;
}

// TODO: optimize these with manual implementations for better perf
const sobelX = convolver(new Float32Array([
  1.0, 0.0, -1.0,
  2.0, 0.0, -2.0,
  1.0, 0.0, -1.0
]), 1);

const sobelY = convolver(new Float32Array([
  1.0, 2.0, 1.0,
  0.0, 0.0, 0.0,
  -1.0, -2.0, -1.0
]), 1);

const gaussianBlur = convolver(new Float32Array([
  0.01258, 0.02516, 0.03145, 0.02516, 0.01258,
  0.02516, 0.0566, 0.07547, 0.0566, 0.02516,
  0.03145, 0.07547, 0.09434, 0.07547, 0.03145,
  0.02516, 0.0566, 0.07547, 0.0566, 0.02516,
  0.01258, 0.02516, 0.03145, 0.02516, 0.01258
]), 2);

const harris = (src: Float32Array, width: number, height: number, dst = src, scratch = new Float32Array(src.length * 5)) => {
  const sobelXResult = sobelX(dst, width, height, scratch.subarray(0, src.length));
  const sobelYResult = sobelY(dst, width, height, scratch.subarray(src.length, src.length * 2));
  const gradX2 = scratch.subarray(src.length * 2, src.length * 3);
  const gradY2 = scratch.subarray(src.length * 3, src.length * 4);
  const gradXY = scratch.subarray(src.length * 4, src.length * 5);
  const iim = height - 9, jim = width - 9;
  for (let i = 0; i < height; ++i) {
    for (let j = 0; j < width; ++j) {
      let gx2 = 0.0, gy2 = 0.0, gxy = 0.0;
      const ii = clamp(i - 4, 0, iim), ji = clamp(j - 4, 0, jim);
      for (let mi = 0; mi < 9; ++mi) {
        for (let mj = 0; mj < 9; ++mj) {
          const px = (mi + ii) * width + (mj + ji);
          const sx = sobelXResult[px];
          const sy = sobelYResult[px];
          gx2 += sx * sx;
          gy2 += sy * sy;
          gxy += sx * sy;
        }
      }
      const px = i * width + j;
      gradX2[px] = gx2;
      gradY2[px] = gy2;
      gradXY[px] = gxy;
    }
  }
  for (let px = 0; px < dst.length; ++px) {
    const gx2 = gradX2[px], gy2 = gradY2[px], gxy = gradXY[px];
    const det = gx2 * gy2 - (gxy * gxy);
    const trace = gx2 + gy2;
    dst[px] = det - (0.04 * trace * trace);
  }
  return dst;
}

const canny = (src: Float32Array, width: number, height: number, dst = src, scratch = new Float32Array(src.length * 3)) => {
  gaussianBlur(src, width, height, dst);
  const sobelXResult = sobelX(dst, width, height, scratch.subarray(0, dst.length));
  const sobelYResult = sobelY(dst, width, height, scratch.subarray(dst.length, dst.length * 2));
  const east = 1, southwest = width - 1, south = width, southeast = width + 1;
  for (let i = 0; i < height; ++i) {
    for (let j = 0; j < width; ++j) {
      const px = i * width + j;
      const sx = sobelXResult[px], sy = sobelYResult[px];
      const dir = sy / sx;
      let offset = east;
      if (dir < -2.4142 || dir > 2.4142) offset = south;
      else if (dir < -0.4142) offset = southeast;
      else if (dir > 0.4142) offset = southwest;
      const grad = Math.hypot(sx, sy);
      const nextPX = px + offset, lastPX = px - offset;
      dst[px] =
        (nextPX < dst.length && grad < Math.hypot(sobelXResult[nextPX], sobelYResult[nextPX])) ||
        (lastPX >= 0 && grad < Math.hypot(sobelXResult[lastPX], sobelYResult[lastPX]))
        ? 0
        : grad;
    }
  }
  return dst;
}

const cos = new Float32Array(45);
const sin = new Float32Array(45);
for (let t = 0; t < 45; ++t) {
  const theta = Math.PI * t / 45;
  cos[t] = Math.cos(theta);
  sin[t] = Math.sin(theta);
}

const houghLines = (src: Float32Array, width: number, height: number, dst = new Float32Array(src.length)) => {
  const diag = Math.hypot(width, height);
  const maxDiag = Math.ceil(diag);
  const buf = new Float32Array(45 * maxDiag);
  for (let i = 0; i < height; ++i) {
    for (let j = 0; j < width; ++j) {
      const px = i * width + j;
      const edge = src[px];
      if (edge > 0.2) {
        for (let t = 0; t < 45; ++t) {
          let bin = (i * cos[t] + j * sin[t] + diag) >> 1;
          buf[t * maxDiag + bin] += edge;
        }
      }
    }
  }
  console.log(performance.now())
  let maxVal = Number.EPSILON;
  for (let i = 0; i < buf.length; ++i) {
    maxVal = Math.max(maxVal, buf[i]);
  }
  const ctx = plot(grayscaleToRGB(src), width, height);
  for (let t = 0; t < 45; ++t) {
    for (let p = 0; p < maxDiag; ++p) {
      const level = buf[t * maxDiag + p];
      if (level / maxVal > 0.5) {
        ctx.strokeStyle = `rgba(255, 0, 0, ${level / maxVal})`;
        let rho = (p << 1) - maxDiag;
        const a = cos[t];
        const b = sin[t];
        const x1 = b * rho - 5000 * a;
        const y1 = a * rho + 5000 * b;
        const x2 = b * rho + 5000 * a;
        const y2 = a * rho - 5000 * b;
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      } 
    }
  }
  return dst;
}

const normalize = (src: Float32Array, dst = src) => {
  let max = Number.EPSILON;
  for (let px = 0; px < dst.length; ++px) max = Math.max(max, src[px]);
  for (let px = 0; px < dst.length; ++px) dst[px] = src[px] / max;
  return dst;
}

const plot = (src: Uint8ClampedArray, width: number, height: number) => {
  const into = document.createElement('canvas');
  into.width = width;
  into.height = height;
  const ctx = into.getContext('2d')!;
  ctx.putImageData(new ImageData(src, width, height), 0, 0);
  document.body.appendChild(into);
  return ctx;
}

const getEdges = ({ data, width, height }: ImageData) => {
  // Reuse buffer for performance
  // const img = grayscale(data);
  // console.log(grayscale(data), width, height);
  console.log(performance.now())
  const edges = canny(grayscale(data), width, height);
  houghLines(edges, width, height);
  // plot(grayscaleToRGB(edges), width, height);
}

const App = () => {
  return <input type="file" accept="image/*" onChange={async ({ currentTarget: { files } }) => {
    console.log(files, getEdges(await getImage(files![0])));
  }}></input>
}

render(<App />, document.getElementById('root'));