import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// export default defineConfig({
//   plugins: [react()],
//   // analyses_out/ lives one level above frontend/ at the project root
//   // import.meta.glob('../../analyses_out/*.json') resolves correctly from src/lib/
// })

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: ['..']   // allow serving files from the project root
    }
  }
  
})