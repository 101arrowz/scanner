import init, { find_document, extract_document } from '../pkg';
import { toPDF } from './pdf';
import { getImage, download } from './io';

const root = document.getElementById('root') as HTMLDivElement;
const preview = document.getElementById('preview') as HTMLVideoElement;
const previewCrop = document.getElementById('preview-crop') as HTMLDivElement;
const select = document.getElementById('camera-select') as HTMLSelectElement;
const shutter = document.getElementById('shutter') as HTMLSpanElement;

type MaxRes = {
  width: number;
  height: number;
  deviceId: string;
};

let defaultMaxRes: Promise<MaxRes>;
let maxRes: Record<string, Promise<MaxRes> | undefined> = {};
let wasmLoaded: Promise<void>;

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
    return { width: settings.width!, height: settings.height!, deviceId: settings.deviceId! };
  });
  if (device) maxRes[device] = prom;
  else defaultMaxRes = prom;
  return prom;
}

type StreamResult = {
  deviceId: string;
  close(): void;
}

const startStream = async (device?: string): Promise<StreamResult> => {
  const maxRes = await getMaxRes(device);
  if (!device) {
    // Use first device by default
    const device = (await navigator.mediaDevices.enumerateDevices()).find(device => device.kind == 'videoinput')!.deviceId;
    return startStream(device);
  }
  const aspectRatio = maxRes.width / maxRes.height;
  const landscape = window.innerWidth > (window.innerHeight * aspectRatio);
  root.style.flexDirection = landscape ? 'row' : 'column';
  const constraints: MediaTrackConstraints = {
    height: landscape ? window.innerHeight : Math.floor(Math.min(window.innerWidth / aspectRatio, window.innerHeight * 0.9)),
    width: landscape ? Math.floor(Math.min(window.innerHeight * aspectRatio, window.innerWidth * 0.9)) : window.innerWidth,
    facingMode: 'environment',
    deviceId: { exact: maxRes.deviceId }
  };
  const stream = await navigator.mediaDevices.getUserMedia({
    video: constraints
  });
  const videoTrack = stream.getVideoTracks()[0];
  const settings = videoTrack.getSettings();
  preview.srcObject = stream;
  const cssHeight = constraints.height as number + 'px';
  const cssWidth = constraints.width as number + 'px';
  if (landscape) {
    preview.style.height = cssHeight;
    preview.style.width = '';
  } else {
    preview.style.height = '';
    preview.style.width = cssWidth;
  }
  previewCrop.style.width = constraints.width as number + 'px';
  previewCrop.style.height = constraints.height as number + 'px';
  preview.play();
  const cap = new ImageCapture(videoTrack);
  const onShutterClick = async () => {
    await wasmLoaded;
    const img = await getImage(await cap.takePhoto());
    document.body.append(`${JSON.stringify(videoTrack.getSettings())} ${JSON.stringify(constraints)} ${JSON.stringify(videoTrack.getConstraints())} ${JSON.stringify(maxRes)} ${preview.videoWidth} ${preview.videoHeight} ${img.width} ${img.height}`)
    const doc = extract_document(img, find_document(img)!, 1224);
    download(new Blob([await toPDF([doc])]), 'out.pdf')
  }
  shutter.addEventListener('click', onShutterClick);
  return {
    deviceId: maxRes.deviceId,
    close() {
      shutter.removeEventListener('click', onShutterClick);
      preview.pause();
      preview.srcObject = null;
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
  }
}


const onLoad = async () => {
  wasmLoaded = init().then();
  const stream = await startStream();
  for (const device of await navigator.mediaDevices.enumerateDevices()) {
    if (device.kind == 'videoinput') {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.innerText = device.label;
      select.appendChild(option);
    }
  }
  select.value = stream.deviceId;
  const onUpdate = () => {
    stream.close();
    startStream(select.value)
  };
  select.onchange = onUpdate;
  let rst = -1;
  window.onresize = () => {
    clearTimeout(rst);
    rst = setTimeout(onUpdate, 250) as unknown as number;
  };
}

onLoad();

if (process.env.NODE_ENV == 'production') {
  navigator.serviceWorker?.register(new URL('sw.ts', import.meta.url), { type: 'module' });
}
