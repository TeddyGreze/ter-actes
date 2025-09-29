// src/types/url-import.d.ts
declare module '*.mjs?url' {
  const href: string;
  export default href;
}
declare module '*.js?url' {
  const href: string;
  export default href;
}

// (facultatif mais pratique)
declare module 'pdfjs-dist/build/pdf.worker.mjs?url' {
  const href: string;
  export default href;
}
declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const href: string;
  export default href;
}
