import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import HomeMap from './pages/HomeMap'
import GPXViewer from './pages/GPXViewer'
import RoutePlanner from './pages/RoutePlanner'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <div className="app">
          <header className="header">
            <h1>🏔️ Cammini</h1>
            <nav className="navbar">
              <NavLink to="/" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Home
              </NavLink>
              <NavLink to="/gpx" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Carica GPX
              </NavLink>
              <NavLink to="/route" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                Calcola Percorso
              </NavLink>
            </nav>
          </header>
          <main className="main">
            <Routes>
              <Route path="/" element={<HomeMap />} />
              <Route path="/gpx" element={<GPXViewer />} />
              <Route path="/route" element={<RoutePlanner />} />
            </Routes>
          </main>
        </div>
      </AppProvider>
    </BrowserRouter>
  )
}

export default App
