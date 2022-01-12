import { findDocument, extractDocument, Point, Quad } from './process';
import { toPDF } from './pdf';
import { toImage, getData, download } from './io';
import { ProspectivePage, getPages, setPages } from './db';
import flashURL from 'url:./flash.svg';
import flashOffURL from 'url:./flash-off.svg';
import 'image-capture';

const sharedCanvas = document.createElement('canvas');
const sharedCtx = sharedCanvas.getContext('2d')!;

const root = document.getElementById('root') as HTMLDivElement;
const modal = document.getElementById('modal') as HTMLDivElement;
const preview = document.getElementById('preview') as HTMLVideoElement;
const previewCrop = document.getElementById('preview-crop') as HTMLDivElement;
const previewDoc = document.getElementById('preview-doc') as HTMLDivElement;
const bottomWrapper = document.getElementById('bottom-wrapper') as HTMLDivElement;
const topWrapper = document.getElementById('top-wrapper') as HTMLDivElement;
const selectWrapper = document.getElementById('camera-select-wrapper') as HTMLDivElement;
const select = document.getElementById('camera-select') as HTMLSelectElement;
const githubWrapper = document.getElementById('github-wrapper') as HTMLDivElement;
const flashWrapper = document.getElementById('flash-wrapper') as HTMLDivElement;
const flash = document.getElementById('flash') as HTMLButtonElement;
const flashImg = document.getElementById('flash-img') as HTMLImageElement;
const uploadWrapper = document.getElementById('upload-wrapper') as HTMLDivElement;
const upload = document.getElementById('upload') as HTMLInputElement;
const shutter = document.getElementById('shutter') as HTMLImageElement;
const doneWrapper = document.getElementById('done-wrapper') as HTMLDivElement;
const done = document.getElementById('done') as HTMLButtonElement;

type Dimensions = {
  width: number;
  height: number;
};

type MaxRes = Dimensions & {
  deviceId: string;
};

let defaultMaxRes: Promise<MaxRes>;
let maxRes: Record<string, Promise<MaxRes> | undefined> = {};

type Page = {
  page: ProspectivePage;
  img: HTMLImageElement;
};

const pages: Page[] = [];

const log = (text: string) => {
  const el = document.createElement('div');
  el.innerText = text;
  root.appendChild(el);
}

const resizeListeners: (() => void)[] = [];

const onResize = (listener: () => void) => {
  resizeListeners.push(listener);
  return () => {
    resizeListeners.splice(resizeListeners.indexOf(listener), 1);
  };
};

const callResizeListeners = () => {
  for (const listener of resizeListeners) {
    listener();
  }
};

let rst = -1;
window.addEventListener('resize', () => {
  clearTimeout(rst);
  rst = setTimeout(callResizeListeners, 250) as unknown as number;
}, { passive: true });

const getMaxRes = (device?: string) => {
  const constraints: MediaTrackConstraints = {
    width: 100000,
    height: 100000,
    facingMode: 'environment'
  };
  if (device) {
    if (maxRes[device]) return maxRes[device]!;
    constraints.deviceId = { exact: device };
  } else if (defaultMaxRes) {
    return defaultMaxRes;
  }
  const prom = navigator.mediaDevices.getUserMedia({
    video: constraints 
  }).then(media => {
    const settings = media.getVideoTracks()[0].getSettings();
    for (const track of media.getTracks()) {
      track.stop();
    }
    const width = Math.max(settings.width!, settings.height!);
    const height = Math.min(settings.width!, settings.height!);
    return { width, height, deviceId: settings.deviceId! };
  });
  if (device) maxRes[device] = prom;
  else defaultMaxRes = prom.then(val => {
    maxRes[val.deviceId] = prom;
    return val;
  });
  return prom;
}

const bitmapToData = (bitmap: ImageBitmap) => {
  sharedCanvas.height = bitmap.height;
  sharedCanvas.width = bitmap.width;
  sharedCtx.drawImage(bitmap, 0, 0);
  return sharedCtx.getImageData(0, 0, sharedCanvas.width, sharedCanvas.height);
}

const processPhoto = async (blob: Blob) => {
  const img = await toImage(blob);
  const data = getData(img);
  const quad = await findDocument(data) || {
    a: { x: 0, y: data.height },
    b: { x: 0, y: 0 },
    c: { x: data.width, y: 0 },
    d: { x: data.width, y: data.height }
  };
  modal.style.display = 'flex';
  const aspectRatio = data.width / data.height;
  const updateImageDimensions = () => {
    const { width, height } = calcDimensions(aspectRatio, 0.93);
    img.style.width = width + 'px';
    img.style.height = height + 'px';
  };
  updateImageDimensions();
  const offResize = onResize(updateImageDimensions);


  modal.style.display = 'none';
  offResize();
  pages.push({ page: { data, quad }, img });
}

const isLandscape = (aspectRatio: number) => window.innerWidth > (window.innerHeight * aspectRatio);

const calcDimensions = (aspectRatio: number, maxRatio: number) => {
  const landscape = isLandscape(aspectRatio);
  const height = landscape ? window.innerHeight : Math.floor(Math.min(window.innerWidth * aspectRatio, window.innerHeight * maxRatio));
  const width = landscape ? Math.floor(Math.min(window.innerHeight * aspectRatio, window.innerWidth * maxRatio)) : window.innerWidth;
  return { width, height };
}

const sideWrappers = [topWrapper, bottomWrapper];
const topElems = [flashWrapper, githubWrapper, selectWrapper];
const bottomElems = [doneWrapper, uploadWrapper];
const allElems = topElems.concat(bottomElems, shutter);

const startStream = async (device?: string) => {
  const maxRes = await getMaxRes(device);
  let aspectRatio = maxRes.width / maxRes.height;
  const landscape = isLandscape(aspectRatio);
  const { width, height } = calcDimensions(aspectRatio, 0.84);
  const cssHeight = height + 'px';
  const cssWidth = width + 'px';
  previewCrop.style.width = previewCrop.style.minWidth = cssWidth;
  previewCrop.style.height = previewCrop.style.minHeight = cssHeight;
  modal.style.width = root.style.width = window.innerWidth + 'px';
  modal.style.height = root.style.height = window.innerHeight + 'px';
  for (const sideWrapper of sideWrappers) {
    if (landscape) {
      sideWrapper.style.flexDirection = sideWrapper == topWrapper ? 'column-reverse' : 'column';
      sideWrapper.style.height = window.innerHeight + 'px';
      sideWrapper.style.width = '';
    } else {
      sideWrapper.style.flexDirection = 'row';
      sideWrapper.style.height = '';
      sideWrapper.style.width = window.innerWidth + 'px';   
    }
  }
  for (const topElem of topElems) {
    topElem.style.width = topElem.style.height = (landscape ? window.innerWidth : window.innerHeight) * 0.03 + 'px';
  }
  for (const bottomElem of bottomElems) {
    bottomElem.style.width = bottomElem.style.height = (landscape ? window.innerWidth : window.innerHeight) * 0.035 + 'px';
  }
  for (const elem of allElems) {
    elem.style.margin = (landscape ? window.innerWidth : window.innerHeight) * 0.02 + 'px';
  }
  shutter.style.width = shutter.style.height = (landscape ? window.innerWidth : window.innerHeight) * 0.05 + 'px';
  if (landscape) {
    preview.style.height = cssHeight;
    preview.style.width = '';
    modal.style.flexDirection = root.style.flexDirection = 'row';
  } else {
    preview.style.height = '';
    preview.style.width = cssWidth;
    modal.style.flexDirection = root.style.flexDirection = 'column';
  }
  const constraints: MediaTrackConstraints = {
    width: maxRes.width, 
    height: maxRes.height,
    deviceId: { exact: maxRes.deviceId }
  };
  const stream = await navigator.mediaDevices.getUserMedia({
    video: constraints
  });
  const videoTrack = stream.getVideoTracks()[0];
  const capabilities = videoTrack.getCapabilities();
  flashWrapper.style.display = capabilities.torch ? '' : 'none';
  preview.srcObject = stream;
  let newElems: Node[] = [];
  const clearNewElems = () => {
    for (const elem of newElems) {
      previewDoc.removeChild(elem);
    };
    newElems.length = 0;
  }
  const onMetadata = () => {
    const scale = landscape ? window.innerHeight / preview.videoHeight : window.innerWidth / preview.videoWidth;
    const line = (a: Point, b: Point) => {
      const elem = document.createElement('div');
      elem.style.width = Math.hypot(a.x - b.x, a.y - b.y) * scale + 'px';
      elem.style.height = '4px';
      elem.style.backgroundColor = 'red';
      elem.style.position = 'absolute';
      elem.style.top = a.y * scale + 'px';
      elem.style.left = a.x * scale + 'px';
      elem.style.transformOrigin = 'top left';
      elem.style.transform = `rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)`;
      return elem;
    };
    const docPreview = async () => {
      let quad = await findDocument(bitmapToData(await cap.grabFrame()), true);
      clearNewElems();
      if (docPreviewTimeout != -1) {
        if (quad) {
          newElems = [
            previewDoc.appendChild(line(quad.a, quad.b)),
            previewDoc.appendChild(line(quad.b, quad.c)),
            previewDoc.appendChild(line(quad.c, quad.d)),
            previewDoc.appendChild(line(quad.d, quad.a))
          ];
        }
        docPreviewTimeout = setTimeout(docPreview, 0) as unknown as number;
      }
    };
    docPreviewTimeout = setTimeout(docPreview, 0) as unknown as number;
  };
  preview.addEventListener('loadedmetadata', onMetadata);
  const cap = new ImageCapture(videoTrack);
  let docPreviewTimeout = -1;
  const shutterFlash = () => {
    preview.style.opacity = '0';
    setTimeout(() => preview.style.opacity = '', 50);
  }
  const onShutterClick = async () => {
    const photo = await cap.takePhoto();
    shutterFlash();
    await processPhoto(photo);
  };
  shutter.addEventListener('click', onShutterClick);
  let torch = false;
  flashImg.src = flashOffURL;
  const onFlashClick = async () => {
    try {
      torch = !torch;
      await videoTrack.applyConstraints({
        advanced: [{ torch }]
      });
      flashImg.src = torch
        ? flashURL
        : flashOffURL;
    } catch (e) {

    }
  };
  flash.addEventListener('click', onFlashClick);
  return {
    deviceId: maxRes.deviceId,
    close() {
      clearTimeout(docPreviewTimeout);
      clearNewElems();
      docPreviewTimeout = -1;
      shutter.removeEventListener('click', onShutterClick);
      flash.removeEventListener('click', onFlashClick);
      preview.removeEventListener('loadedmetadata', onMetadata);
      preview.pause();
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
  }
}


const onLoad = async () => {
  let stream = await startStream(localStorage.getItem('defaultDevice')!);
  const updateBold = () => {
    for (const option of select.options) {
      option.style.fontWeight = '';
    }
    select.selectedOptions[0].style.fontWeight = 'bold';
  }
  for (const device of await navigator.mediaDevices.enumerateDevices()) {
    if (device.kind == 'videoinput') {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.label = device.label;
      select.appendChild(option);
    }
  }
  select.value = stream.deviceId;
  updateBold();
  const update = async () => {
    updateBold();
    stream.close();
    select.disabled = true;
    localStorage.setItem('defaultDevice', select.value);
    stream = await startStream(select.value);
    select.disabled = false;
  };
  select.onchange = update;
  onResize(update);
  upload.onchange = async () => {
    for (const file of upload.files!) {
      await processPhoto(file);
    }
  };
  done.onclick = async () => {
    download(new Blob([await toPDF(await Promise.all(pages.map(({ page }) => extractDocument(page.data, page.quad, 1224, true))))]), 'out.pdf')
    pages.length = 0;
  }
}

onLoad();

if (process.env.NODE_ENV == 'production') {
  navigator.serviceWorker.register(new URL('./workers/service.ts', import.meta.url), { type: 'module' });
}
