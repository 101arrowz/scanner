import init, { extract_document } from '../pkg';
import { toPDF } from './pdf';
import { download, getImage } from './io';
import { detectDocument, perspective } from './extract';

const imgInput = document.getElementById('img-input') as HTMLInputElement;
const done = document.getElementById('done') as HTMLButtonElement;

const pages: ImageData[] = [];

let extract = (img: ImageData) => perspective(img, detectDocument(img)!);

if (typeof WebAssembly != 'undefined') {
  init().then(() => extract = (img: ImageData) => extract_document(img, 1224));
}

const handleFile = async (file: File) => {
  const img = await getImage(imgInput.files![0]);
  pages.push(extract(img));
}

imgInput.addEventListener('change', async () => {
  handleFile(imgInput.files![0]);
});

done.addEventListener('click', async () => {
  download(new Blob([await toPDF(pages)]), 'out.pdf');
});

if (process.env.NODE_ENV == 'production') {
  navigator.serviceWorker.register(new URL('sw.ts', import.meta.url), { type: 'module' });
}
