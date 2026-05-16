import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Ocultar splash screen una vez que React ha montado
const splash = document.getElementById('splash')
if (splash) {
  splash.classList.add('hide')
  splash.addEventListener('transitionend', () => splash.remove(), { once: true })
}
