import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* /api goes to the FastAPI backend (docs/api_contract.md). Only used when VITE_USE_MOCK=false. */
const api = { '/api': 'http://127.0.0.1:8000' };

export default defineConfig({
  plugins: [react()],
  server: { proxy: api },
  preview: { proxy: api },
});
