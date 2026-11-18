import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { installSelectCopy } from './components/app/selectCopy'
import { installCatchers } from './components/report/catchers'
import { PageBoundary } from './components/report/PageBoundary'
import './index.css'

installCatchers()
installSelectCopy()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PageBoundary whole><App /></PageBoundary>
  </StrictMode>,
)
