declare module 'url:*' {
  const url: string;
  export default url;
}

declare const process: {
  env: {
    NODE_ENV: string
  }
}