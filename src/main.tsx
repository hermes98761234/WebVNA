import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useStore } from './store'
import * as controller from './controller'
import { registerPwa } from './pwa'

// Dev-only handle for debugging from the browser console.
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__webvna = { useStore, controller }

registerPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
