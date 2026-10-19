import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API's ADMIN_URL defaults to http://localhost:5174, so keep this port fixed.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
});
