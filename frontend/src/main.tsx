import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './theme.css'
import './estilos-b.css'
import './estilos-c.css'
import './escritorio.css'
import './repaso.css'
import './diseno.css'
import { registrarSW } from './lib/avisos'
import { aplicarDiseno } from './lib/diseno'

registrarSW()
aplicarDiseno()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
