/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WORKER_URL:string;
  // Add other env variables here
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
