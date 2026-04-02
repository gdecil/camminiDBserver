import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Map from '../components/Map'
import LayerSelector from '../components/LayerSelector'
import './HomeMap.css'

const API_URL = '/api'

// Generate GPX for tracks
const generateTrackGPX = (track) => {
  const { coordinates, elevation, name } = track
  if (!coordinates || coordinates.length === 0) return null
  
  let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Cammini">\n  <metadata>\n    <name>' + name + '</name>\n  </metadata>\n<trk>\n<trkseg>\n'
  
  coordinates.forEach((coord, i) => {
    const ele = elevation && elevation[i] !== undefined ? elevation[i] : 0
    gpx += `    <trkpt lat="${coord[0]}" lon="${coord[1]}">\n      <ele>${ele}</ele>\n    </trkpt>\n`
  })
  
  gpx += '</trkseg>\n</trk>\n</gpx>'
  return gpx
}

// Generate GPX for routes (without waypoints, with elevation interpolation)
const generateRouteGPX = (route) => {
  const { coordinates, elevation, name } = route
  if (!coordinates || coordinates.length === 0) return null
  
  let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Cammini">\n  <metadata>\n    <name>' + name + '</name>\n  </metadata>\n<trk>\n<trkseg>\n'
  
  const numCoords = coordinates.length
  const numElevations = elevation ? elevation.length : 0
  
  if (numElevations > 0) {
    // Interpolate elevation for each coordinate
    coordinates.forEach((coord, i) => {
      const eleIndex = numElevations > 1 ? (i / (numCoords - 1)) * (numElevations - 1) : 0
      const eleLower = Math.floor(eleIndex)
      const eleUpper = Math.min(eleLower + 1, numElevations - 1)
      const eleFraction = eleIndex - eleLower
      const ele = elevation[eleLower] !== undefined && elevation[eleUpper] !== undefined
        ? elevation[eleLower] + (elevation[eleUpper] - elevation[eleLower]) * eleFraction
        : (elevation[eleLower] || 0)
      gpx += `    <trkpt lat="${coord[0]}" lon="${coord[1]}">\n      <ele>${ele.toFixed(1)}</ele>\n    </trkpt>\n`
    })
  } else {
    // No elevation data
    coordinates.forEach((coord) => {
      gpx += `    <trkpt lat="${coord[0]}" lon="${coord[1]}">\n      <ele>0</ele>\n    </trkpt>\n`
    })
  }
  
  gpx += '</trkseg>\n</trk>\n</gpx>'
  return gpx
}

// Download GPX file
const downloadGPX = (gpx, filename) => {
  const blob = new Blob([gpx], { type: 'application/gpx+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.gpx') ? filename : filename + '.gpx'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Handle export item
const handleExportItem = (item, e) => {
  e.stopPropagation()
  let gpx
  if (item.type === 'route') {
    gpx = generateRouteGPX(item)
  } else {
    gpx = generateTrackGPX(item)
  }
  if (gpx) {
    downloadGPX(gpx, item.name)
  }
}

export default function HomeMap() {
  const [savedItems, setSavedItems] = useState([])
  const [currentLayer, setCurrentLayer] = useState('OpenStreetMap')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const [filterText, setFilterText] = useState('')
  const [markers, setMarkers] = useState([])
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const [isResizing, setIsResizing] = useState(false)
  const [showHikingOverlay, setShowHikingOverlay] = useState(false)

  useEffect(() => {
    loadSavedItems()
  }, [])

  // Sidebar resize handlers
  const handleResizeStart = (e) => {
    e.preventDefault()
    setIsResizing(true)
  }

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return
      const newWidth = window.innerWidth - e.clientX
      setSidebarWidth(Math.min(400, Math.max(200, newWidth)))
    }
    const handleMouseUp = () => setIsResizing(false)
    
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  const loadSavedItems = async () => {
    try {
      const res = await fetch(`${API_URL}/saved`)
      const data = await res.json()
      setSavedItems(data)
    } catch (error) {
      console.error('Error loading saved items:', error)
    } finally {
      setLoading(false)
    }
  }

  // Estrai il centro della traccia/percorso per il marker
  const getCenterPoint = (item) => {
    if (item.type === 'route' && item.coordinates && item.coordinates.length > 0) {
      return item.coordinates[Math.floor(item.coordinates.length / 2)]
    }
    if (item.coordinates && item.coordinates.length > 0) {
      return item.coordinates[Math.floor(item.coordinates.length / 2)]
    }
    if (item.type === 'route' && item.startLat && item.startLng) {
      return [item.startLat, item.startLng]
    }
    return null
  }

  const handleMarkerClick = (item) => {
    // Se è un percorso calcolato, vai a RoutePlanner, altrimenti a GPXViewer
    if (item.type === 'route') {
      navigate(`/route?routeId=${item.id}`)
    } else {
      navigate(`/gpx?trackId=${item.id}`)
    }
  }

  const filteredItems = savedItems.filter(item => 
    item.name.toLowerCase().includes(filterText.toLowerCase())
  )

  // Prepara i marker quando savedItems cambia
  useEffect(() => {
    const newMarkers = filteredItems.map(item => {
      const center = getCenterPoint(item)
      if (!center) return null
      
      return {
        id: item.id,
        name: item.name,
        type: item.type,
        position: center,
        coordinates: item.coordinates
      }
    }).filter(m => m !== null)
    
    setMarkers(newMarkers)
  }, [filteredItems])

  console.log('Rendering HomeMap, savedItems:', savedItems.length, 'markers:', markers.length)

  return (
    <div className="home-map">
      <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 1000 }}>
        <LayerSelector 
          currentLayer={currentLayer} 
          onLayerChange={setCurrentLayer} 
          showHikingOverlay={showHikingOverlay}
          onOverlayToggle={setShowHikingOverlay}
        />
      </div>
      
      {loading ? (
        <div className="loading">Caricamento...</div>
      ) : savedItems.length === 0 ? (
        <div className="no-items">
          <h2>Nessuna traccia o percorso salvato</h2>
          <p>Carica un file GPX o crea un percorso per vederlo qui</p>
        </div>
      ) : (
        <Map 
          markers={markers}
          onMarkerClick={handleMarkerClick}
          currentLayer={currentLayer}
          zoom={6}
          center={[41.9029, 12.4964]}
          showHikingOverlay={showHikingOverlay}
        />
      )}
      
      <div className="home-sidebar" style={{ width: sidebarWidth }}>
        <div className="sidebar-resize-handle" onMouseDown={handleResizeStart} />
        <h2>I Tuoi Cammini</h2>
        
        <div className="filter-container" style={{ marginBottom: '1rem', position: 'relative' }}>
          <input 
            type="text" 
            placeholder="🔍 Cerca tra i cammini..." 
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={{ width: '100%', padding: '8px 30px 8px 10px', borderRadius: '4px', border: '1px solid #ddd' }}
          />
          {filterText && (
            <button 
              onClick={() => setFilterText('')}
              style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#888' }}
            >✕</button>
          )}
        </div>

        {savedItems.length === 0 ? (
          <p className="empty-message">Nessun elemento salvato</p>
        ) : filteredItems.length === 0 ? (
          <p className="empty-message">Nessun risultato per "{filterText}"</p>
        ) : (
          <ul className="items-list">
            {filteredItems.map(item => (
              <li 
                key={item.id} 
                className="item-card"
                onClick={() => handleMarkerClick(item)}
              >
                <span className="item-type">{item.type === 'track' ? '📍' : '🥾'}</span>
                <span className="item-name">{item.name}</span>
                {item.distance && (
                  <span className="item-distance">{item.distance}</span>
                )}
                <button 
                  className="export-btn"
                  onClick={(e) => handleExportItem(item, e)}
                  title="Esporta GPX"
                >
                  📥
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
