export type Point = {
  x: number;
  y: number;
}

export type Quad = {
  a: Point;
  b: Point;
  c: Point;
  d: Point;
};

export type Messages = {
  'find-document': [{
    data: ImageData;
  }, Quad | undefined];
  'extract-document': [{
    data: ImageData;
    region: Quad;
    targetWidth: number;
    targetHeight?: number;
  }, ImageData];
  'get-data': [{
    bitmap: ImageBitmap;
  }, ImageData];
};

export type Message = {
  [T in keyof Messages]: {
    type: T;
  } & Messages[T][0];
}[keyof Messages];