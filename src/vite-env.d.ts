/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Which backend feeds the dashboard. Defaults to 'mock'. */
  readonly VITE_DATA_SOURCE?: 'mock' | 'netlify' | 'supabase';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
