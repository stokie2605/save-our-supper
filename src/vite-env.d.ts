/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SMS_WEBHOOK_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
