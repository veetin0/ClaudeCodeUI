import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import '@fontsource/barlow-semi-condensed/latin-500.css'
import '@fontsource/barlow-semi-condensed/latin-600.css'
import '@fontsource/barlow-semi-condensed/latin-700.css'
import '@fontsource/pixelify-sans/latin-400.css'
import '@fontsource/pixelify-sans/latin-500.css'
import '@fontsource/pixelify-sans/latin-600.css'
import '@fontsource/pixelify-sans/latin-700.css'
import '@fontsource/vt323/latin-400.css'
import './styles.css'
import './pixel.css'
import { bootTheme } from './lib/theme'

document.documentElement.classList.add(`platform-${window.harness?.platform ?? 'web'}`)
bootTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
