/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where the local server is (default http://127.0.0.1:5198). Not a
   *  secret: nothing secret ever gets a VITE_ prefix (ADR-0021 §4). */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
