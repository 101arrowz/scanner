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

export const getData = (img: HTMLImageElement) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = img.width, canvas.height = img.height;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
}

export const download = (file: Blob, name: string) => {
  const url = URL.createObjectURL(file);
  const el = document.createElement('a');
  el.download = name;
  el.href = url;
  el.click();
  URL.revokeObjectURL(url);
}
