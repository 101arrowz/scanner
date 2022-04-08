import { findDocument, extractDocument, Point, Quad } from './process';
import { toPDF } from './pdf';
import { toImage, getData, download } from './io';
import { ProspectivePage, getFile, setFile } from './db';
import flashURL from 'url:./flash.svg';
import flashOffURL from 'url:./flash-off.svg';
import hdURL from 'url:./hd.svg';
import sdURL from 'url:./sd.svg';
import 'image-capture';

const root = document.getElementById('root') as HTMLDivElement;
const modal = document.getElementById('modal') as HTMLDivElement;
const captures = document.getElementById('captures') as HTMLDivElement;
const preview = document.getElementById('preview') as HTMLVideoElement;
const previewCrop = document.getElementById('preview-crop') as HTMLDivElement;
const previewDoc = document.getElementById('preview-doc') as HTMLDivElement;
const bottomWrapper = document.getElementById('bottom-wrapper') as HTMLDivElement;
const topWrapper = document.getElementById('top-wrapper') as HTMLDivElement;
const selectWrapper = document.getElementById('camera-select-wrapper') as HTMLDivElement;
const select = document.getElementById('camera-select') as HTMLSelectElement;
const qualityWrapper = document.getElementById('quality-wrapper') as HTMLDivElement;
const quality = document.getElementById('quality') as HTMLButtonElement;
const qualityImg = document.getElementById('quality-img') as HTMLImageElement;
const githubWrapper = document.getElementById('github-wrapper') as HTMLDivElement;
const flashWrapper = document.getElementById('flash-wrapper') as HTMLDivElement;
const flash = document.getElementById('flash') as HTMLButtonElement;
const flashImg = document.getElementById('flash-img') as HTMLImageElement;
const pastWrapper = document.getElementById('past-wrapper') as HTMLDivElement;
const past = document.getElementById('past') as HTMLDivElement;
const uploadWrapper = document.getElementById('upload-wrapper') as HTMLDivElement;
const upload = document.getElementById('upload') as HTMLInputElement;
const shutter = document.getElementById('shutter') as HTMLImageElement;
const doneWrapper = document.getElementById('done-wrapper') as HTMLDivElement;
const done = document.getElementById('done') as HTMLButtonElement;
const modalBottomWrapper = document.getElementById('modal-bottom-wrapper') as HTMLDivElement;
const modalCancelWrapper = document.getElementById('modal-cancel-wrapper') as HTMLDivElement;
const modalCancel = document.getElementById('modal-cancel') as HTMLButtonElement;
const modalDoneWrapper = document.getElementById('modal-done-wrapper') as HTMLDivElement;
const modalDone = document.getElementById('modal-done') as HTMLButtonElement;
type Dimensions = {
  width: number;
  height: number;
};

type MaxRes = Dimensions & {
  deviceId: string;
};

let defaultMaxRes: Promise<MaxRes>;
let maxRes: Record<string, Promise<MaxRes> | undefined> = {};

type Page = ProspectivePage & {
  img: HTMLImageElement | HTMLCanvasElement;
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

const point = (a: Point, scale: number) => {
  const elem = document.createElement('div');
  const mwh = Math.min(window.innerWidth, window.innerHeight);
  elem.style.width = mwh * 0.03 + 'px';
  elem.style.height = mwh * 0.03 + 'px';
  elem.style.borderRadius = mwh * 0.015 + 'px';
  elem.style.backgroundColor = 'black';
  elem.style.position = 'absolute';
  adjustPoint(elem, a, scale);
  return elem;
};

const adjustPoint = (elem: HTMLDivElement, a: Point, scale: number) => {
  const mwh = Math.min(window.innerWidth, window.innerHeight);
  elem.style.top = a.y * scale - mwh * 0.015 + 'px';
  elem.style.left = a.x * scale - mwh * 0.015 + 'px';
};

const line = (a: Point, b: Point, scale: number) => {
  const elem = document.createElement('div');
  elem.style.height = '4px';
  elem.style.backgroundColor = 'red';
  elem.style.position = 'absolute';
  elem.style.transformOrigin = 'center left';
  adjustLine(elem, a, b, scale);
  return elem;
};

const adjustLine = (elem: HTMLDivElement, a: Point, b: Point, scale: number) => {
  elem.style.width = Math.hypot(a.x - b.x, a.y - b.y) * scale + 'px';
  elem.style.top = a.y * scale + 'px';
  elem.style.left = a.x * scale + 'px';
  elem.style.transform = `rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)`;
}

const preprocessPhoto = async (src: Blob | ImageBitmap) => {
  let img: HTMLImageElement | HTMLCanvasElement, data: ImageData;
  if (src instanceof Blob) {
    const image = await toImage(src);
    img = image;
    data = await getData(image);
  } else {
    const cnv = document.createElement('canvas');
    cnv.width = src.width;
    cnv.height = src.height;
    cnv.getContext('2d')!.drawImage(src, 0, 0);
    img = cnv;
    data = await getData(src, true);
  }
  const quad = await findDocument(data) || {
    a: { x: 0, y: data.height },
    b: { x: 0, y: 0 },
    c: { x: data.width, y: 0 },
    d: { x: data.width, y: data.height }
  };
  const clampPoint = (a: Point) => {
    if (a.x < 0) a.x = 0;
    else if (a.x > data.width) a.x = data.width;
    if (a.y < 0) a.y = 0;
    else if (a.y > data.height) a.y = data.height;
  };
  clampPoint(quad.a);
  clampPoint(quad.b);
  clampPoint(quad.c);
  clampPoint(quad.d);
  return { img, data, quad };
};

const processPhotos = async (srcs: (Blob | ImageBitmap | Page)[]) => {
  const results = srcs.map(src => src instanceof Blob || src instanceof ImageBitmap ? preprocessPhoto(src) : src);
  const cbs: ((check: boolean) => void)[] = [];
  let firstDimensions = { width: 0, height: 0 };
  let landscape = false;
  for (const result of results) {
    const isFirst = result == results[0];
    const isLast = result == results[results.length - 1];
    const { img, data, quad } = await result;
    const imgCrop = document.createElement('div');
    imgCrop.style.display = 'flex';
    imgCrop.style.justifyContent = 'center';
    imgCrop.style.alignItems = 'center';
    imgCrop.style.overflow = 'hidden';
    imgCrop.style.scrollSnapAlign = 'center';
    const imgDoc = document.createElement('div');
    imgDoc.style.position = 'relative';
    imgDoc.appendChild(img);
    imgCrop.appendChild(imgDoc);
    modal.style.display = 'flex';
    const aspectRatio = Math.max(data.width, data.height) / Math.min(data.width, data.height);
    let scale = 0, docX = 0, docY = 0, latestDims = false;
    let prevElems: HTMLDivElement[] = [];
    const getLatestDims = () => {
      if (!latestDims) {
        const { left, top } = imgDoc.getBoundingClientRect();
        docX = left;
        docY = top;
        latestDims = true; 
      }
    }
    const makePoint = (src: Point, onUpdate: () => void) => {
      const pt = point(src, scale);
      let active = false;
      const onDown = (evt: MouseEvent | TouchEvent, x: number, y: number) => {
        if (pt.parentElement == imgDoc) {
          if (evt.target == pt || (evt.target == img && Math.hypot(x - src.x * scale, y - src.y * scale) < Math.min(window.innerWidth, window.innerHeight) * 0.2)) {
            evt.stopImmediatePropagation();
            active = true;
            onMove(x, y);
          }
        } else {
          imgDoc.removeEventListener('mousedown', onMouseDown);
          imgDoc.removeEventListener('touchstart', onTouchStart);
          imgDoc.removeEventListener('mousemove', onMouseMove);
          imgDoc.removeEventListener('touchmove', onTouchMove);
          imgDoc.removeEventListener('mouseup', onUp);
          imgDoc.removeEventListener('touchend', onUp);
        }
      };
      const onMove = (x: number, y: number) => {
        src.x = x / scale;
        src.y = y / scale;
        adjustPoint(pt, src, scale);
        onUpdate();
      };
      const onUp = () => {
        active = false;
      };
      const onMouseDown = (e: MouseEvent) => {
        getLatestDims();
        onDown(e, e.pageX - docX, e.pageY - docY);
      };
      imgDoc.addEventListener('mousedown', onMouseDown);
      const onTouchStart = (e: TouchEvent) => {
        const touch = e.targetTouches[0];
        getLatestDims();
        onDown(e, touch.pageX - docX, touch.pageY - docY);
      }
      imgDoc.addEventListener('touchstart', onTouchStart);
      const onMouseMove = (e: MouseEvent) => {
        if (active) {
          e.preventDefault();
          onMove(e.pageX - docX, e.pageY - docY);
        }
      };
      imgDoc.addEventListener('mousemove', onMouseMove);
      const onTouchMove = (e: TouchEvent) => {
        if (active) {
          const touch = e.targetTouches[0];
          e.preventDefault();
          onMove(touch.pageX - docX, touch.pageY - docY);
        }
      }
      imgDoc.addEventListener('touchmove', onTouchMove);
      imgDoc.addEventListener('mouseup', onUp);
      imgDoc.addEventListener('touchend', onUp);
      return pt;
    }
    const paintLines = () => {
      for (const elem of prevElems) {
        imgDoc.removeChild(elem);
      }
      const ab = line(quad.a, quad.b, scale);
      const bc = line(quad.b, quad.c, scale);
      const cd = line(quad.c, quad.d, scale);
      const da = line(quad.d, quad.a, scale);
      prevElems = [
        imgDoc.appendChild(ab),
        imgDoc.appendChild(bc),
        imgDoc.appendChild(cd),
        imgDoc.appendChild(da),
        imgDoc.appendChild(makePoint(quad.a, () => {
          adjustLine(da, quad.d, quad.a, scale);
          adjustLine(ab, quad.a, quad.b, scale);
        })),
        imgDoc.appendChild(makePoint(quad.b, () => {
          adjustLine(ab, quad.a, quad.b, scale);
          adjustLine(bc, quad.b, quad.c, scale);
        })),
        imgDoc.appendChild(makePoint(quad.c, () => {
          adjustLine(bc, quad.b, quad.c, scale);
          adjustLine(cd, quad.c, quad.d, scale);
        })),
        imgDoc.appendChild(makePoint(quad.d, () => {
          adjustLine(cd, quad.c, quad.d, scale);
          adjustLine(da, quad.d, quad.a, scale);
        })),
      ];
    };
    const updateImageDimensions = () => {
      const { width, height } = isFirst ? calcDimensions(aspectRatio, 0.925) : firstDimensions;
      if (isFirst) {
        landscape = isLandscape(aspectRatio);
        firstDimensions = { width, height };
        modalCancelWrapper.style.width = modalCancelWrapper.style.height = modalDoneWrapper.style.width = modalDoneWrapper.style.height = (landscape ? window.innerWidth : window.innerHeight) * 0.035 + 'px';
        modalCancelWrapper.style.margin = modalDoneWrapper.style.margin = (landscape ? window.innerWidth : window.innerHeight) * 0.02 + 'px';
        captures.style.width = modal.style.width = window.innerWidth + 'px';
        captures.style.height = modal.style.height = window.innerHeight + 'px';
        modal.style.flexDirection = landscape ? 'row' : 'column';
        captures.style.flexDirection = landscape ? 'column' : 'row';
        if (landscape) {
          modalBottomWrapper.style.flexDirection = 'column';
          modalBottomWrapper.style.height = window.innerHeight + 'px';
          modalBottomWrapper.style.width = ''; 
        } else {
          modalBottomWrapper.style.flexDirection = 'row';
          modalBottomWrapper.style.height = '';
          modalBottomWrapper.style.width = window.innerWidth + 'px';   
        }
      }
      const cssWidth = width + 'px';
      const cssHeight = height + 'px';
    
      if (landscape) {
        img.style.width = '';
        img.style.height = cssHeight;
        scale = window.innerHeight / data.height;
      } else {
        img.style.width = cssWidth;
        img.style.height = '';
        scale = window.innerWidth / data.width;
      }
      imgCrop.style.width = imgCrop.style.minWidth = cssWidth;
      imgCrop.style.height = imgCrop.style.minHeight = cssHeight;
      latestDims = false;
      paintLines();
    };
    updateImageDimensions();
    captures.appendChild(imgCrop);
    const offResize = onResize(updateImageDimensions);
    cbs.push(check => {
      if (check) {
        pages.push({ data, quad, img });
        doneWrapper.style.opacity = '';
        if (isLast) {
          if (img.width > img.height) {
            img.style.height = pastWrapper.style.height;
            img.style.width = '';
          } else {
            img.style.height = '';
            img.style.width = pastWrapper.style.width;
          }
          while (pastWrapper.lastChild != past) {
            pastWrapper.removeChild(pastWrapper.lastChild!);
          }
          pastWrapper.appendChild(img);
        }
      }
      offResize();
      captures.removeChild(imgCrop);
    })
  }

  return new Promise(resolve => {
    const onDone = () => finish(true);
    const onCancel = () => finish(false);
    modalCancel.addEventListener('click', onCancel);
    modalDone.addEventListener('click', onDone);
    const finish = (check: boolean) => {
      modalDone.removeEventListener('click', onDone);
      modalCancel.removeEventListener('click', onCancel);
      modal.style.display = 'none';
      for (const cb of cbs) {
        cb(check);
      }
      resolve(check);
    };
  });
}

const isLandscape = (aspectRatio: number) => window.innerWidth > (window.innerHeight * aspectRatio);

const calcDimensions = (aspectRatio: number, maxRatio: number) => {
  const landscape = isLandscape(aspectRatio);
  const height = landscape ? window.innerHeight : Math.floor(Math.min(window.innerWidth * aspectRatio, window.innerHeight * maxRatio));
  const width = landscape ? Math.floor(Math.min(window.innerHeight * aspectRatio, window.innerWidth * maxRatio)) : window.innerWidth;
  return { width, height };
}

const sideWrappers = [topWrapper, bottomWrapper];
const topElems = [flashWrapper, qualityWrapper, githubWrapper, selectWrapper, pastWrapper];
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
  root.style.width = window.innerWidth + 'px';
  root.style.height = window.innerHeight + 'px';
  for (const sideWrapper of sideWrappers) {
    if (landscape) {
      sideWrapper.style.flexDirection = 'column';
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
  const pastBorderSize = (landscape ? window.innerWidth : window.innerHeight) * 0.002 + 'px';
  pastWrapper.style.borderRadius = pastBorderSize;
  pastWrapper.style.border = pastBorderSize + ' solid white';
  if (landscape) {
    preview.style.height = cssHeight;
    preview.style.width = '';
    root.style.flexDirection = 'row';
  } else {
    preview.style.height = '';
    preview.style.width = cssWidth;
    root.style.flexDirection = 'column';
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
    const docPreview = async () => {
      let quad: Quad | undefined;
      const ts = performance.now();
      if (modal.style.display == 'none') {
        quad = await findDocument(await getData(await cap.grabFrame()), true);
      }
      clearNewElems();
      if (docPreviewTimeout != -1) {
        if (quad) {
          newElems = [
            previewDoc.appendChild(line(quad.a, quad.b, scale)),
            previewDoc.appendChild(line(quad.b, quad.c, scale)),
            previewDoc.appendChild(line(quad.c, quad.d, scale)),
            previewDoc.appendChild(line(quad.d, quad.a, scale))
          ];
        }
        docPreviewTimeout = setTimeout(docPreview, Math.max(250 - performance.now() + ts, 0)) as unknown as number;
      }
    };
    docPreviewTimeout = setTimeout(docPreview, 0) as unknown as number;
  };
  preview.addEventListener('loadedmetadata', onMetadata);
  const cap = new ImageCapture(videoTrack);
  let hd = Object.prototype.toString.call(cap) == '[object ImageCapture]';
  qualityWrapper.style.display = hd ? '' : 'none';
  qualityImg.src = hdURL;
  const onQualityClick = () => {
    hd = !hd;
    qualityImg.src = hd ? hdURL : sdURL;
  };
  quality.addEventListener('click', onQualityClick);
  let docPreviewTimeout = -1;
  const shutterFlash = () => {
    preview.style.opacity = '0';
    setTimeout(() => preview.style.opacity = '', 50);
  };
  const onShutterClick = async () => {
    if (shutter.style.opacity == '') {
      shutter.style.opacity = '0.5';
      shutterFlash();
      try {
        const photo = hd ? await cap.takePhoto() : await cap.grabFrame();
        await processPhotos([photo]);
      } catch (e) {}
      shutter.style.opacity = '';
    }
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
      flashImg.src = torch ? flashURL : flashOffURL;
    } catch (e) {}
  };
  flash.addEventListener('click', onFlashClick);
  return {
    deviceId: maxRes.deviceId,
    close() {
      clearTimeout(docPreviewTimeout);
      docPreviewTimeout = -1;
      shutter.removeEventListener('click', onShutterClick);
      flash.removeEventListener('click', onFlashClick);
      quality.removeEventListener('click', onQualityClick);
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
    shutter.style.opacity = '0.5';
    await processPhotos([...upload.files!]);
    shutter.style.opacity = '';
  };
  done.onclick = async () => {
    if (pages.length) {
      doneWrapper.style.opacity = '0.5';
      while (pastWrapper.lastChild != past) {
        pastWrapper.removeChild(pastWrapper.lastChild!);
      }
      download(new Blob([await toPDF(await Promise.all(pages.map(({ data, quad }) => extractDocument(data, quad, 1224))))]), 'out.pdf')
      pages.length = 0;
    }
  }
  past.onclick = async () => {
    if (pages.length) {
      const currPages = pages.slice();
      pages.length = 0;
      if (!(await processPhotos(currPages))) {
        pages.push(...currPages);
        const { img } = currPages[currPages.length - 1];
        if (img.width > img.height) {
          img.style.height = pastWrapper.style.height;
          img.style.width = '';
        } else {
          img.style.height = '';
          img.style.width = pastWrapper.style.width;
        }
        while (pastWrapper.lastChild != past) {
          pastWrapper.removeChild(pastWrapper.lastChild!);
        }
        pastWrapper.appendChild(img);
      }
    }
  }
}

onLoad();

if (process.env.NODE_ENV == 'production') {
  navigator.serviceWorker.register(new URL('./workers/service.ts', import.meta.url), { type: 'module' });
}
