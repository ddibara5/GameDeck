import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { initTheme } from './lib/theme.js'
import { initGround } from './lib/ground.js'
import './index.css'
import './cardSize.css'

// Apply the saved theme (and keep 'system' synced to the OS) before first paint.
initTheme()
// The ground goes on in the same pass. `off` and `wash` are synchronous; the two
// art sources resolve from the library cache and paint when they land, which is
// why this is not awaited.
initGround()

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
