import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  if (mode === 'production' && process.env.VITE_E2E_AUTH === 'true') {
    throw new Error('E2E auth seam must not be active in a production build.');
  }
  return { plugins: [react()] };
});
