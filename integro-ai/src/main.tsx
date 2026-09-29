import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { isDemo } from './lib/revenue/demo'

// Capture ?demo=1 before anything else (sign-in redirects can drop the query string).
isDemo()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
