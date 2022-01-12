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

const dbOpenReq = indexedDB.open('pages');
dbOpenReq.onupgradeneeded = () => {
  const db = dbOpenReq.result;
  db.createObjectStore('pages', { keyPath: 'filename' });
};
const dbp = prom(dbOpenReq);

export const getPages = async (filename: string) => {
  const db = await dbp;
  return prom<Pages>(db.transaction('pages').objectStore('pages').get(filename));
};

export const setPages = async (pages: Pages) => {
  const db = await dbp;
  return prom(db.transaction('pages', 'readwrite').objectStore('pages').put(pages)).then(() => {});
};