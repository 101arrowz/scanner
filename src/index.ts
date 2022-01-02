import init, { find_document, extract_document } from '../pkg';
import { toPDF } from './pdf';
import { download, getImage } from './io';

const imgInput = document.getElementById('img-input') as HTMLInputElement;
const done = document.getElementById('done') as HTMLButtonElement;

const pages: ImageData[] = [];

let loaded = init();

const handleFile = async (file: File) => {
  const img = await getImage(file);
  await loaded;
  let document = find_document(img);
  if (document) {
    pages.push(extract_document(img, document, 1224));
  }
}

imgInput.addEventListener('change', async () => {
  handleFile(imgInput.files![0]);
});

done.addEventListener('click', async () => {
  download(new Blob([await toPDF(pages)]), 'out.pdf');
});

if (process.env.NODE_ENV == 'production') {
  navigator.serviceWorker?.register(new URL('sw.ts', import.meta.url), { type: 'module' });
}
