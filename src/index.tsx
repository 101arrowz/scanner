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
  ctx.drawImage(elem, 0, 0);
  return ctx.getImageData(0, 0, elem.width, elem.height);
}

const clamp = (x: number, min: number, max: number) =>
  x < min
    ? min
    : x > max
      ? max
      : x;

const convolve = (src: Float32Array, width: number, height: number, matrix: Float32Array, radius: number, dst = src) => {
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
    const pos = px << 1;
    dst[px] = src[pos] * 0.299 + src[pos + 1] * 0.587 + src[pos + 2] * 0.114;
  }
  return dst;
}

const sobelX = convolver(new Float32Array([
  1.0, 0.0, -1.0,
  2.0, 0.0, -2.0,
  1.0, 0.0, -1.0
]), 1);

const sobelY = convolver(new Float32Array([
  1.0, 2.0, 1.0,
  0.0, 0.0, 0.0,
  -1.0, -2.0, -1.0
]), 1)

const getEdges = ({ data, width, height }: ImageData) => {
  // Reuse buffer for performance
  const img = grayscale(data);

}

const App = () => {
  return <input type="file" accept="image/*" onChange={async ({ currentTarget: { files } }) => {
    console.log(files, getEdges(await getImage(files![0])));
  }}></input>
}

render(<App />, document.getElementById('root'));