import init, { find_document, extract_document, Quad as WasmQuad } from '../../pkg/scanner';
import { Message, Messages } from './ipc'

declare const self: DedicatedWorkerGlobalScope

const handle = <T extends Message>(message: T): { result: Messages[T['type']][1]; transfer?: Transferable[] } => {
  if (message.type == 'find-document') {
    // const ts = performance.now();
    const quad = find_document(message.data);
    // console.log('find_document:', (performance.now() - ts) + 'ms')
    return {
      result: quad && {
        a: {
          x: quad.a.x,
          y: quad.a.y
        },
        b: {
          x: quad.b.x,
          y: quad.b.y
        },
        c: {
          x: quad.c.x,
          y: quad.c.y
        },
        d: {
          x: quad.d.x,
          y: quad.d.y
        }
      }
    };
  } else if (message.type == 'extract-document') {
    const { a, b, c, d } = message.region;
    const quad = new WasmQuad(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y);
    const result = extract_document(message.data, quad, message.targetWidth, message.targetHeight);
    return { result, /*transfer: [result.data.buffer]*/ };
  } else if (message.type == 'get-data') {
    const { width, height } = message.bitmap;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(message.bitmap, 0, 0);
    const result = ctx.getImageData(0, 0, width, height)
    return { result, /*transfer: [result.data.buffer]*/ };
  } else {
    throw new TypeError('invalid message');
  }
}

let load = init().catch(() => {});

self.onmessage = async (evt: MessageEvent<{ msg: Message }>) => {
  await load;
  const { msg, ...data } = evt.data;
  try {
    const { result, transfer } = handle(msg);
    self.postMessage({ result, ...data }, transfer || []);
  } catch (err) {
    if (!(err instanceof Error)) {
      err = new Error(`Error in process worker: ${err}`);
    }
    self.postMessage({
      error: {
        message: (err as Error).message,
        stack: (err as Error).stack,
        name: (err as Error).name
      },
      ...data
    });
  }
};