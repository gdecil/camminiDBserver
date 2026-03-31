import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import Map from '../components/Map'
import FileUpload from '../components/FileUpload'
import SavedTracks from '../components/SavedTracks'
import LayerSelector from '../components/LayerSelector'
import ElevationProfile from '../components/ElevationProfile'
import './GPXViewer.css'

const API_URL = '/api'

// Distinct colors for multiple tracks
const TRACK_COLORS = [
  '#3498db', '#e74c3c', '#2ecc71', '#f39c12', 
  '#9b59b6', '#1abc9c', '#e67e22', '#34495e',
  '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4'
]

export default function GPXViewer() {
  const [trackCoordinates, setTrackCoordinates] = useState([])
  const [gpxContent, setGpxContent] = useState(null)
  const [savedTracks, setSavedTracks] = useState({})
  const [message, setMessage] = useState(null)
  const [currentLayer, setCurrentLayer] = useState('OpenStreetMap')
  const [isProfileDetached, setIsProfileDetached] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [sidebarWidth, setSidebarWidth] = useState(350)
  const [isResizing, setIsResizing] = useState(false)
  const [searchParams] = useSearchParams()
  const trackIdParam = searchParams.get('trackId')
  
  // Multiple tracks state
  const [tracks, setTracks] = useState([]) // Array of {id, name, coordinates, elevation, color, visible, gpxContent}
  const [activeTrackId, setActiveTrackId] = useState(null) // Currently selected track for profile view

  // Sidebar resize handlers
  const handleResizeStart = (e) => {
    e.preventDefault()
    setIsResizing(true)
  }

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return
      const newWidth = window.innerWidth - e.clientX
      setSidebarWidth(Math.min(500, Math.max(250, newWidth)))
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

  useEffect(() => {
    loadSavedTracks()
  }, [])

  // Carica automaticamente la traccia se specificato nella query string
  useEffect(() => {
    if (trackIdParam && Object.keys(savedTracks).length > 0) {
      const trackEntry = Object.entries(savedTracks).find(([name, track]) => track.id === trackIdParam)
      if (trackEntry) {
        handleLoadTrack(trackEntry[0])
      }
    }
  }, [trackIdParam, savedTracks])

  const loadSavedTracks = async () => {
    try {
      const res = await fetch(`${API_URL}/tracks`)
      const data = await res.json()
      const tracksObj = {}
      data.forEach(track => {
        try {
          let coordsStr = track.coordinates
          
          if (typeof coordsStr !== 'string') {
            if (Array.isArray(coordsStr)) {
              tracksObj[track.name] = {
                ...track,
                coordinates: coordsStr,
                elevation: track.elevation ? JSON.parse(track.elevation) : null,
                createdAt: track.created_at
              }
              return
            }
            coordsStr = JSON.stringify(coordsStr)
          }
          
          try {
            const coordinates = JSON.parse(coordsStr)
            const elevationData = track.elevation ? JSON.parse(track.elevation) : null
            tracksObj[track.name] = {
              ...track,
              coordinates,
              elevation: elevationData,
              createdAt: track.created_at
            }
          } catch (directParseError) {
            const match = coordsStr.match(/\[[\s\S]*\]/)
            
            if (match) {
              const matchedString = ('' + match[0])
              const coordinates = JSON.parse(matchedString)
              
              let elevationData = null
              if (track.elevation) {
                try {
                  const eleStr = String(track.elevation).trim()
                  const eleMatch = eleStr.match(/\[[\s\S]*\]/)
                  if (eleMatch) {
                    elevationData = JSON.parse(eleMatch[0])
                  } else {
                    elevationData = JSON.parse(eleStr)
                  }
                } catch (eleError) {
                  console.log('Elevation parse failed:', eleError.message)
                }
              }
              
              tracksObj[track.name] = {
                ...track,
                coordinates,
                elevation: elevationData,
                createdAt: track.created_at
              }
            }
          }
        } catch (parseError) {
          console.log('Track skipped:', track.name, parseError.message)
        }
      })
      setSavedTracks(tracksObj)
    } catch (error) {
      console.error('Error loading tracks:', error)
    }
  }

  const showMessage = (text, type = 'info') => {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 5000)
  }

  const parseGPX = (gpxContent) => {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(gpxContent, 'text/xml')
    const coordinates = []
    const elevations = []

    const tracks = xmlDoc.getElementsByTagName('trk')
    const routes = xmlDoc.getElementsByTagName('rte')
    const waypoints = xmlDoc.getElementsByTagName('wpt')

    for (let i = 0; i < tracks.length; i++) {
      const trackSegments = tracks[i].getElementsByTagName('trkseg')
      for (let j = 0; j < trackSegments.length; j++) {
        const trackPoints = trackSegments[j].getElementsByTagName('trkpt')
        for (let k = 0; k < trackPoints.length; k++) {
          const lat = parseFloat(trackPoints[k].getAttribute('lat'))
          const lon = parseFloat(trackPoints[k].getAttribute('lon'))
          const ele = trackPoints[k].getElementsByTagName('ele')[0]
          const elevation = ele ? parseFloat(ele.textContent) : null
          
          if (!isNaN(lat) && !isNaN(lon)) {
            coordinates.push([lat, lon])
            elevations.push(elevation)
          }
        }
      }
    }

    for (let i = 0; i < routes.length; i++) {
      const routePoints = routes[i].getElementsByTagName('rtept')
      for (let j = 0; j < routePoints.length; j++) {
        const lat = parseFloat(routePoints[j].getAttribute('lat'))
        const lon = parseFloat(routePoints[j].getAttribute('lon'))
        const ele = routePoints[j].getElementsByTagName('ele')[0]
        const elevation = ele ? parseFloat(ele.textContent) : null
        
        if (!isNaN(lat) && !isNaN(lon)) {
          coordinates.push([lat, lon])
          elevations.push(elevation)
        }
      }
    }

    for (let i = 0; i < waypoints.length; i++) {
      const lat = parseFloat(waypoints[i].getAttribute('lat'))
      const lon = parseFloat(waypoints[i].getAttribute('lon'))
      if (!isNaN(lat) && !isNaN(lon)) {
        coordinates.push([lat, lon])
      }
    }

    return { coordinates, elevations }
  }

  // Extract name from GPX content
  const extractGPXName = (gpxContent) => {
    const match = gpxContent.match(/<name>([^<]+)<\/name>/)
    return match ? match[1] : null
  }

  // Build fit bounds from multiple tracks
  const getAllCoordinates = () => {
    const allCoords = []
    tracks.forEach(track => {
      if (track.visible && track.coordinates.length > 0) {
        allCoords.push(...track.coordinates)
      }
    })
    return allCoords
  }

  const handleFileLoad = (gpxContent) => {
    try {
      const { coordinates: coords, elevations } = parseGPX(gpxContent)
      if (coords.length === 0) {
        showMessage('Nessuna traccia trovata nel file GPX', 'error')
        return
      }
      setTrackCoordinates(coords)
      setGpxContent(gpxContent)
      window._currentElevations = elevations
      showMessage('File GPX caricato con successo', 'success')
    } catch (error) {
      showMessage('Errore durante il parsing del file GPX', 'error')
    }
  }

  // Handle multiple file upload
  const handleMultipleFileLoad = (fileResults) => {
    console.log('handleMultipleFileLoad called with', fileResults.length, 'files')
    
    const newTracks = fileResults.map((result, index) => {
      try {
        const { coordinates, elevations } = parseGPX(result.content)
        if (coordinates.length === 0) {
          showMessage(`Nessuna traccia trovata in ${result.name}`, 'warning')
          return null
        }
        
        const trackName = extractGPXName(result.content) || result.name.replace('.gpx', '')
        
        return {
          id: Date.now() + index,
          name: trackName,
          fileName: result.name,
          coordinates,
          elevation: elevations,
          gpxContent: result.content,
          color: TRACK_COLORS[(index) % TRACK_COLORS.length],
          visible: true
        }
      } catch (error) {
        showMessage(`Errore parsing ${result.name}`, 'error')
        return null
      }
    }).filter(t => t !== null)
    
    console.log('Created', newTracks.length, 'new tracks')
    
    if (newTracks.length > 0) {
      setTracks(prev => {
        const updated = [...prev, ...newTracks]
        console.log('Tracks state updated, now has', updated.length, 'tracks')
        return updated
      })
      
      // Set the first new track as active for profile view
      if (activeTrackId === null && newTracks.length > 0) {
        setActiveTrackId(newTracks[0].id)
      }
      
      showMessage(`${newTracks.length} traccia${newTracks.length > 1 ? 'e' : ''} caricate`, 'success')
    }
  }

  const handleSaveCurrent = async () => {
    // If we have multiple tracks, prompt which one to save
    if (tracks.length > 0) {
      showMessage('Usa il pulsante salva nella lista tracce per salvare un singolo percorso', 'info')
      return
    }
    
    if (trackCoordinates.length === 0) {
      showMessage('Nessuna traccia da salvare', 'warning')
      return
    }

    const name = prompt('Nome traccia:', `Traccia_${new Date().toISOString().slice(0, 10)}`)
    if (!name) return

    const elevations = window._currentElevations || null
    
    try {
      const res = await fetch(`${API_URL}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, coordinates: trackCoordinates, elevation: elevations })
      })
      if (res.ok) {
        showMessage(`Traccia "${name}" salvata`, 'success')
        loadSavedTracks()
      } else {
        const errorData = await res.json()
        showMessage('Errore nel salvare la traccia: ' + errorData.error, 'error')
      }
    } catch (error) {
      showMessage('Errore nel salvare la traccia: ' + error.message, 'error')
    }
  }

  const generateGPXFromCoordinates = (coordinates) => {
    let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1">\n<trk>\n<trkseg>\n'
    const baseElevation = 100 + Math.random() * 200
    
    coordinates.forEach((coord, i) => {
      const elevation = baseElevation + Math.sin(i / 10) * 50 + Math.random() * 20
      gpx += `    <trkpt lat="${coord[0]}" lon="${coord[1]}">\n      <ele>${elevation.toFixed(1)}</ele>\n    </trkpt>\n`
    })
    
    gpx += '</trkseg>\n</trk>\n</gpx>'
    return gpx
  }

  const generateGPXFromElevations = (coordinates, elevations) => {
    let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1">\n<trk>\n<trkseg>\n'
    
    coordinates.forEach((coord, i) => {
      const elevation = elevations && elevations[i] !== null ? elevations[i].toFixed(1) : '0'
      gpx += `    <trkpt lat="${coord[0]}" lon="${coord[1]}">\n      <ele>${elevation}</ele>\n    </trkpt>\n`
    })
    
    gpx += '</trkseg>\n</trk>\n</gpx>'
    return gpx
  }

  const handleLoadTrack = (name) => {
    const track = savedTracks[name]
    if (track && track.coordinates) {
      setTrackCoordinates(track.coordinates)
      
      if (track.coordinates.length > 0) {
        if (track.elevation && track.elevation.length > 0) {
          const realGPX = generateGPXFromElevations(track.coordinates, track.elevation)
          setGpxContent(realGPX)
        } else {
          const simulatedGPX = generateGPXFromCoordinates(track.coordinates)
          setGpxContent(simulatedGPX)
        }
      }
      showMessage(`Traccia "${name}" caricata`, 'success')
    }
  }

  const handleDeleteTrack = async (name) => {
    if (!confirm(`Eliminare la traccia "${name}"?`)) return
    const track = savedTracks[name]
    if (!track || !track.id) return

    try {
      await fetch(`${API_URL}/tracks/${track.id}`, { method: 'DELETE' })
      showMessage(`Traccia "${name}" eliminata`, 'success')
      loadSavedTracks()
    } catch (error) {
      showMessage('Errore nell\'eliminare la traccia', 'error')
    }
  }

  const handleRenameTrack = async (oldName, newName) => {
    const track = savedTracks[oldName]
    if (!track || !track.id) return

    try {
      const res = await fetch(`${API_URL}/tracks/${track.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName })
      })
      if (res.ok) {
        showMessage(`Traccia rinominata in "${newName}"`, 'success')
        setSavedTracks({})
        loadSavedTracks()
      } else {
        showMessage('Errore nel rinominare la traccia', 'error')
      }
    } catch (error) {
      showMessage('Errore nel rinominare la traccia', 'error')
    }
  }

  // Multiple tracks handlers
  const toggleTrackVisibility = (trackId) => {
    setTracks(prev => prev.map(t => 
      t.id === trackId ? { ...t, visible: !t.visible } : t
    ))
  }

  const removeTrack = (trackId) => {
    setTracks(prev => prev.filter(t => t.id !== trackId))
    if (activeTrackId === trackId) {
      setActiveTrackId(null)
    }
    showMessage('Traccia rimossa', 'info')
  }

  const clearAllTracks = () => {
    if (tracks.length === 0) return
    if (!confirm(`Rimuovere tutte le ${tracks.length} tracce caricate?`)) return
    setTracks([])
    setActiveTrackId(null)
    showMessage('Tutte le tracce rimosse', 'info')
  }

  const setActiveTrack = (trackId) => {
    setActiveTrackId(trackId)
  }

  const saveTrack = async (track) => {
    if (!track || track.coordinates.length === 0) return
    
    const name = prompt('Nome traccia:', track.name)
    if (!name) return

    try {
      const res = await fetch(`${API_URL}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name, 
          coordinates: track.coordinates, 
          elevation: track.elevation 
        })
      })
      if (res.ok) {
        showMessage(`Traccia "${name}" salvata`, 'success')
        loadSavedTracks()
      } else {
        const errorData = await res.json()
        showMessage('Errore: ' + errorData.error, 'error')
      }
    } catch (error) {
      showMessage('Errore nel salvare: ' + error.message, 'error')
    }
  }

  const downloadTrackGPX = (track) => {
    if (!track || !track.gpxContent) return
    
    const blob = new Blob([track.gpxContent], { type: 'application/gpx+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = track.name.endsWith('.gpx') ? track.name : track.name + '.gpx'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showMessage(`Traccia "${track.name}" esportata`, 'success')
  }

  // Calculate distance for a track
  const calculateDistance = (coords) => {
    if (!coords || coords.length < 2) return 0
    let total = 0
    for (let i = 1; i < coords.length; i++) {
      const dLat = (coords[i][0] - coords[i-1][0]) * Math.PI / 180
      const dLon = (coords[i][1] - coords[i-1][1]) * Math.PI / 180
      const a = Math.sin(dLat/2)**2 + Math.cos(coords[i-1][0]*Math.PI/180) * Math.cos(coords[i][0]*Math.PI/180) * Math.sin(dLon/2)**2
      total += 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    }
    return total.toFixed(2)
  }

  // Get active track for profile
  const activeTrack = tracks.find(t => t.id === activeTrackId)
  const allCoordinates = getAllCoordinates()

  // Active GPX content for profile
  const activeGPXContent = activeTrack?.gpxContent || null

  const toggleProfileDetach = () => {
    setIsProfileDetached(!isProfileDetached)
  }

  return (
    <div className={`gpx-viewer ${isFullscreen ? 'fullscreen-mode' : ''}`}>
      <div className="map-section">
        <LayerSelector 
          currentLayer={currentLayer} 
          onLayerChange={setCurrentLayer} 
        />
        
        <button 
          className="fullscreen-btn"
          onClick={() => {
            if (!isFullscreen) {
              document.documentElement.requestFullscreen?.().catch(() => {})
            } else {
              document.exitFullscreen?.().catch(() => {})
            }
            setIsFullscreen(!isFullscreen)
          }}
          title={isFullscreen ? 'Torna alla visualizzazione normale' : 'Mappa a tutto schermo'}
        >
          {isFullscreen ? '✕' : '⛶'}
        </button>
        
        <Map 
          trackCoordinates={allCoordinates.length > 0 ? allCoordinates : trackCoordinates} 
          multipleTracks={tracks.length > 0 ? tracks.filter(t => t.visible).map(t => ({
            coordinates: t.coordinates,
            color: t.color
          })) : []}
          currentLayer={currentLayer}
          selectedIndex={selectedIndex}
          onHover={(index) => setSelectedIndex(index)}
        />
        
        {/* Profile overlay on map when detached */}
        {activeGPXContent && isProfileDetached && (
          <div className="profile-overlay">
            <ElevationProfile 
              gpxContent={activeGPXContent} 
              trackName={activeTrack?.name}
              isOverlay={true}
              selectedIndex={selectedIndex}
              onHover={(index) => setSelectedIndex(index)}
            />
          </div>
        )}
      </div>
      
      {!isFullscreen && (
        <div className="sidebar" style={{ width: sidebarWidth }}>
          <div className="sidebar-resize-handle" onMouseDown={handleResizeStart} />
          <FileUpload 
            onFileLoad={handleFileLoad} 
            onMultipleFileLoad={handleMultipleFileLoad}
          />
          
          {/* Multiple tracks list */}
          {tracks.length > 0 && (
            <div className="multi-tracks-panel">
              <div className="multi-tracks-header">
                <h4>📋 Tracce Caricate ({tracks.length})</h4>
                <button className="clear-all-btn" onClick={clearAllTracks} title="Rimuovi tutte">
                  🗑️
                </button>
              </div>
              <div className="tracks-list">
                {tracks.map((track, index) => (
                  <div 
                    key={track.id} 
                    className={`track-item ${activeTrackId === track.id ? 'active' : ''}`}
                    onClick={() => setActiveTrack(track.id)}
                  >
                    <input 
                      type="checkbox"
                      checked={track.visible}
                      onChange={(e) => {
                        e.stopPropagation()
                        toggleTrackVisibility(track.id)
                      }}
                      title="Mostra/Nascondi"
                    />
                    <span 
                      className="track-color-indicator" 
                      style={{ backgroundColor: track.color }}
                      title={track.color}
                    />
                    <span className="track-name" title={track.fileName}>{track.name}</span>
                    <span className="track-distance">{calculateDistance(track.coordinates)} km</span>
                    <div className="track-actions">
                      <button 
                        className="track-action-btn" 
                        onClick={(e) => { e.stopPropagation(); saveTrack(track) }}
                        title="Salva nel database"
                      >💾</button>
                      <button 
                        className="track-action-btn" 
                        onClick={(e) => { e.stopPropagation(); downloadTrackGPX(track) }}
                        title="Esporta GPX"
                      >📥</button>
                      <button 
                        className="track-action-btn remove" 
                        onClick={(e) => { e.stopPropagation(); removeTrack(track.id) }}
                        title="Rimuovi"
                      >✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Show profile controls when tracks are loaded */}
          {tracks.length > 0 && (
            <button 
              className="detach-profile-btn"
              onClick={toggleProfileDetach}
              title={isProfileDetached ? "Riporta profilo nella sidebar" : "Sposta profilo sulla mappa"}
            >
              {isProfileDetached ? "📍 Riporta nella sidebar" : "🗺️ Sposta sulla mappa"}
            </button>
          )}
          
          {/* Show profile for active track */}
          {activeGPXContent && !isProfileDetached && (
            <ElevationProfile 
              gpxContent={activeGPXContent}
              trackName={activeTrack?.name}
              selectedIndex={selectedIndex}
              onHover={(index) => setSelectedIndex(index)}
            />
          )}
          
          {/* Original profile for single file loading */}
          {gpxContent && tracks.length === 0 && (
            <>
              <button 
                className="detach-profile-btn"
                onClick={toggleProfileDetach}
                title={isProfileDetached ? "Riporta profilo nella sidebar" : "Sposta profilo sulla mappa"}
              >
                {isProfileDetached ? "📍 Riporta nella sidebar" : "🗺️ Sposta sulla mappa"}
              </button>
              {!isProfileDetached && (
                <ElevationProfile 
                  gpxContent={gpxContent}
                  selectedIndex={selectedIndex}
                  onHover={(index) => setSelectedIndex(index)}
                />
              )}
            </>
          )}
          
          <SavedTracks
            tracks={savedTracks}
            onLoad={handleLoadTrack}
            onDelete={handleDeleteTrack}
            onRename={handleRenameTrack}
            onSaveCurrent={handleSaveCurrent}
            hasTrack={trackCoordinates.length > 0 || tracks.length > 0}
          />
        </div>
      )}

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}
    </div>
  )
}