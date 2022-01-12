interface OffscreenCanvasRenderingContext2D {
  drawImage(bitmap: ImageBitmap, x: number, y: number): void;
  getImageData(x: number, y: number, width: number, height: number): ImageData;
}

declare class OffscreenCanvas {
  constructor(width: number, height: number);
  getContext(mode: '2d'): OffscreenCanvasRenderingContext2D;
}