import { Routes, Route, Navigate } from 'react-router-dom'
import { useStore } from './store/app'
import { useEffect } from 'react'
import { Home } from './screens/Home'
import { Run } from './screens/Run'
import { Results } from './screens/Results'
import { History } from './screens/History'
import { Settings } from './screens/Settings'
import { Diagnostics } from './screens/Diagnostics'
import { MaskEditor } from './screens/MaskEditor'

export default function App() {
  const { journey } = useStore()

  // Day mode only — the app is light-themed with no dark toggle.
  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('dark')
    root.setAttribute('data-theme', 'light')
  }, [])

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/run" element={<Run />} />
      <Route path="/results" element={journey.results ? <Results /> : <Navigate to="/run" replace />} />
      <Route path="/history" element={<History />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/diagnostics" element={<Diagnostics />} />
      <Route path="/mask-editor" element={<MaskEditor />} />
    </Routes>
  )
}
