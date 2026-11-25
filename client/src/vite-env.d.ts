/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** True in the static demo build, whose backend runs in the browser. */
  readonly VITE_DEMO: boolean;
}

declare module 'mammoth/mammoth.browser.min.js' {
  const mammoth: {
    convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
  };
  export default mammoth;
}
