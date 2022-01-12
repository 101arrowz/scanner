import { bitmapToData } from './process';

export const toImage = async (img: Blob) => {
  const elem = document.createElement('img');
  const loaded = new Promise<void>((resolve, reject) => {
    elem.onload = () => { resolve(); };
    elem.onerror = err => { reject(err); };
  });
  elem.src = URL.createObjectURL(img);
  await loaded;
  URL.revokeObjectURL(elem.src);
  return elem;
}

const sharedCanvas = document.createElement('canvas');
const sharedCtx = sharedCanvas.getContext('2d')!

export const getData = async (img: HTMLImageElement | ImageBitmap) => {
  if (sharedCanvas['transferControlToOffscreen' as 'getContext']) {
    return bitmapToData(img instanceof ImageBitmap ? img : await createImageBitmap(img));
  }
  sharedCanvas.width = img.width, sharedCanvas.height = img.height;
  sharedCtx.drawImage(img, 0, 0);
  return sharedCtx.getImageData(0, 0, img.width, img.height);
}

export const download = (file: Blob, name: string) => {
  const url = URL.createObjectURL(file);
  const el = document.createElement('a');
  el.download = name;
  el.href = url;
  el.click();
  URL.revokeObjectURL(url);
}
