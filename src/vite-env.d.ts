/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENAI_API_KEY: string;
  readonly VITE_WORKER_URL:string;
  readonly VITE_GEMINI_API_KEY:string;
  // Add other env variables here
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
