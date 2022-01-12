import { Quad } from './process';

const prom = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export type ProspectivePage = {
  data: ImageData;
  quad: Quad;
};

export type Pages = {
  filename: string;
  pages: ProspectivePage[];
};

export type PageMetadata = {
  filename: string;
  timeStamp: Date;
  thumbnail: Blob;
};

const dbOpenReq = indexedDB.open('pages');
dbOpenReq.onupgradeneeded = () => {
  const db = dbOpenReq.result;
  db.createObjectStore('pages', { keyPath: 'filename' });
  db.createObjectStore('metadata', { keyPath: 'filename' });
};
const dbp = prom(dbOpenReq);

export const getFile = async (filename: string) => {
  const db = await dbp;
  return prom<Pages>(db.transaction('pages').objectStore('pages').get(filename));
}; 

export async function* getAllMetadata() {
  const db = await dbp;
  const req = db.transaction('metadata').objectStore('metadata').openCursor();
  while (true) {
    const cursor = await prom(req);
    if (!cursor) return;
    yield cursor.value as PageMetadata;
    cursor.continue();
  }
}

export const setFile = async (pages: ProspectivePage[], meta: PageMetadata) => {
  const db = await dbp;
  const tx = db.transaction(['pages', 'metadata'], 'readwrite');
  return Promise.all([
    prom(tx.objectStore('pages').put({ pages, filename: meta.filename })),
    prom(tx.objectStore('metadata').put(meta))
  ]).then(() => {});
};