import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { installCatchers } from './components/report/catchers'
import { PageBoundary } from './components/report/PageBoundary'
import './index.css'

installCatchers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PageBoundary whole><App /></PageBoundary>
  </StrictMode>,
)
