/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_THUMBNAIL_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
