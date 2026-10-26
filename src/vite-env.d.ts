// Vite turns `import url from './worker.mjs?worker&url'` into the URL of the emitted worker asset.
declare module '*?worker&url' {
  const src: string;
  export default src;
}