import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { installCatchers } from '@shared/components/report/catchers'
import { PageBoundary } from '@shared/components/report/PageBoundary'
import { call } from '@shared/rpc'
import { setAppearance, type Appearance } from '@shared/theme'
import App from './App'
import './index.css'

// Light or dark from Settings (public/theme.js already painted the last choice)
call<{ appearance: Appearance }>('preferences.get').then((p) => setAppearance(p.appearance)).catch(() => {})

installCatchers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PageBoundary whole><App /></PageBoundary>
  </StrictMode>,
)
