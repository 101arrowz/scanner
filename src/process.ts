import { Message, Messages, Quad, Point } from './workers/process';

const newWorker = () => new Worker(new URL('./workers/process.ts', import.meta.url), { type: 'module' });

const processWorkers: Worker[] = [];

if (navigator.hardwareConcurrency) {
  for (let i = 1; i < navigator.hardwareConcurrency; ++i) {
    processWorkers.push(newWorker());
  }
}

const getWorker = () => processWorkers.pop() || newWorker();
const returnWorker = (worker: Worker) => processWorkers.push(worker);

let messageID = 0;

const message = async <T extends Message>(msg: T, transfer?: Transferable[]) => {
  return new Promise<Messages[T['type']][1]>((resolve, reject) => {
    const worker = getWorker();
    let id = messageID++;
    // const ts = performance.now();
    const onMessage = (evt: MessageEvent) => {
      const { id: mid, error, result } = evt.data;
      if (mid == id) {
        if (error) {
          let err = new Error(error.message);
          err.stack = error.stack;
          err.name = error.name;
          reject(err);
        } else {
          resolve(result);
        }
        // console.log('Processed', msg, 'in', (performance.now() - ts) + 'ms', { result, error });
        returnWorker(worker);
        worker.removeEventListener('message', onMessage);
      }
    };
    worker.addEventListener('message', onMessage);
    worker.postMessage({ id, msg }, transfer || []);
  })
}

export function findDocument(data: ImageData, transfer?: boolean) {
  return message({
    type: 'find-document',
    data
  }, transfer ? [data.data.buffer] : []);
}

export function extractDocument(data: ImageData, region: Quad, targetWidth: number, transfer?: boolean) {
  return message({
    type: 'extract-document',
    data,
    region,
    targetWidth
  }, transfer ? [data.data.buffer] : []);
}

export function bitmapToData(bitmap: ImageBitmap, transfer?: boolean) {
  return message({
    type: 'get-data',
    bitmap
  }, transfer ? [bitmap] : []);
}

export { Quad, Point }