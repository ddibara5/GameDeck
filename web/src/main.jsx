import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { initTheme } from './lib/theme.js'
import { installHeroOrigin } from './lib/heroOrigin.js'
import './index.css'
import './cardSize.css'

// Apply the saved theme (and keep 'system' synced to the OS) before first paint.
initTheme()

// Start recording tapped covers now: the detail sheet is code-split, so it can't
// install this itself without missing the very tap that opens it.
installHeroOrigin()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Only register the service worker in production builds, and only when the
// browser supports it, so local `vite dev` never fights a stale cache.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('GameDeck: service worker registration failed', err)
    })
  })
}
