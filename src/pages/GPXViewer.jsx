import { useState, useEffect } from 'react'
import { FixedSizeList as List } from 'react-window'
import { useSearchParams } from 'react-router-dom'
import Map from '../components/Map'
import FileUpload from '../components/FileUpload'
import SavedTracks from '../components/SavedTracks'
import LayerSelector from '../components/LayerSelector'
import ElevationProfile from '../components/ElevationProfile'
import PhotoGallery from '../components/PhotoGallery'
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
  const [sidebarWidth, setSidebarWidth] = useState(520)
  const [sidebarMode, setSidebarMode] = useState('wide')
  const [showHikingOverlay, setShowHikingOverlay] = useState(false)
  const [largeLabels, setLargeLabels] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [searchParams] = useSearchParams()
  const trackIdParam = searchParams.get('trackId')
  const [filterText, setFilterText] = useState('')
  
  // Multiple tracks state
  const [tracks, setTracks] = useState([]) // Array of {id, name, coordinates, elevation, color, visible, gpxContent}
  const [activeTrackId, setActiveTrackId] = useState(null) // Currently selected track for profile view
  const [trackFilterActive, setTrackFilterActive] = useState(!!trackIdParam)

  // Sidebar resize handlers
  const handleResizeStart = (e) => {
    e.preventDefault()
    setIsResizing(true)
    setSidebarMode('custom')
  }

  const toggleSidebarMode = () => {
    const newMode = sidebarMode === 'wide' ? 'normal' : 'wide'
    setSidebarMode(newMode)
    setSidebarWidth(newMode === 'wide' ? 520 : 350)
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

  // Helper function moved before usage
  const resampleElevations = (elevations, targetLength) => {
    if (!elevations || elevations.length === 0 || targetLength === 0) return Array(targetLength).fill(0)
    if (elevations.length === targetLength) return elevations
    
    const result = []
    const srcLen = elevations.length
    
    for (let i = 0; i < targetLength; i++) {
      const srcIndex = (i / (targetLength - 1)) * (srcLen - 1)
      const lowerIndex = Math.floor(srcIndex)
      const upperIndex = Math.min(lowerIndex + 1, srcLen - 1)
      const fraction = srcIndex - lowerIndex
      
      if (fraction === 0) {
        result.push(elevations[lowerIndex])
      } else {
        const lower = elevations[lowerIndex] ?? 0
        const upper = elevations[upperIndex] ?? 0
        result.push(lower + (upper - lower) * fraction)
      }
    }
    return result
  }

  useEffect(() => {
    loadSavedTracks()
  }, [])

  // Carica automaticamente la traccia se specificato nella query string
  useEffect(() => {
    if (trackIdParam && Object.keys(savedTracks).length > 0) {
      if (savedTracks[trackIdParam]) {
        handleLoadTrack(trackIdParam)
      }
    }
  }, [trackIdParam, savedTracks])

  // Update filter active state
  useEffect(() => {
    setTrackFilterActive(!!trackIdParam)
  }, [trackIdParam])

  const loadSavedTracks = async () => {
    try {
      const res = await fetch(`${API_URL}/tracks`)
      const data = await res.json()
      const tracksObj = {}
      data.forEach(track => {
        try {
          // Parse coordinates
          let coordinates = null
          let coordsStr = track.coordinates
          
          if (typeof coordsStr === 'string') {
            try {
              coordinates = JSON.parse(coordsStr)
            } catch (e) {
              const match = coordsStr.match(/\[[\s\S]*\]/)
              if (match) coordinates = JSON.parse(match[0])
            }
          } else if (Array.isArray(coordsStr)) {
            coordinates = coordsStr
          }
          
          if (!coordinates || coordinates.length === 0) {
            throw new Error('No valid coordinates found')
          }
          
            // Parse elevation - handle all formats
          let elevationData = null
          let eleRaw = track.elevation
          if (eleRaw !== null && eleRaw !== undefined && eleRaw !== '') {
            if (Array.isArray(eleRaw)) {
              elevationData = eleRaw
            } else if (typeof eleRaw === 'string') {
              try {
                // First try direct parse
                let parsed = JSON.parse(eleRaw)
                // Handle nested arrays from SQL.js
                while (Array.isArray(parsed) && parsed.length === 1 && Array.isArray(parsed[0])) {
                  parsed = parsed[0]
                }
                elevationData = parsed
              } catch (e) {
                console.log(`Could not parse elevation for track "${track.name}":`, e.message)
              }
            }
          }
          
          // Resample elevation if needed
          if (elevationData && Array.isArray(elevationData) && elevationData.length !== coordinates.length) {
            elevationData = resampleElevations(elevationData, coordinates.length)
          }
          
          console.log(`Track "${track.name}": ${coordinates.length} coordinates, ${elevationData ? elevationData.length : 0} elevations`)
          
          tracksObj[track.id] = {
            ...track,
            coordinates,
            elevation: elevationData,
            createdAt: track.created_at
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

  const handleLoadTrack = (id) => {
    const track = savedTracks[id]
    if (track && track.coordinates) {
      // Verify coordinates is an array of pairs [lat, lon]
      const coordinates = Array.isArray(track.coordinates) && track.coordinates.length > 0 && Array.isArray(track.coordinates[0]) 
        ? track.coordinates 
        : null
      
      if (!coordinates) {
        showMessage(`Errore nel caricamento traccia "${track.name}"`, 'error')
        return
      }
      
      setTrackCoordinates(coordinates)
      
      if (coordinates.length > 0) {
        // Verify elevation is valid array with same length as coordinates
        let elevationData = null
        if (track.elevation && Array.isArray(track.elevation) && track.elevation.length === coordinates.length) {
          elevationData = track.elevation
          // Store elevations for potential reuse
          window._currentElevations = elevationData
        }
        
        if (elevationData) {
          const realGPX = generateGPXFromElevations(coordinates, elevationData)
          setGpxContent(realGPX)
        } else {
          // If elevation doesn't match coordinates, generate simulated data
          const simulatedGPX = generateGPXFromCoordinates(coordinates)
          setGpxContent(simulatedGPX)
          console.warn(`Elevation data mismatch: ${track.elevation?.length || 0} elevations vs ${coordinates.length} coordinates for track "${track.name}"`)
        }
      }
      showMessage(`Traccia "${track.name}" caricata${track.elevation && Array.isArray(track.elevation) && track.elevation.length === coordinates.length ? ' con profilo altimetrico' : ' (profilo simulato)'}`, 'info')
    }
  }

  const handleDeleteTrack = async (id) => {
    const track = savedTracks[id]
    if (!track) return
    if (!confirm(`Eliminare la traccia "${track.name}"?`)) return

    try {
      await fetch(`${API_URL}/tracks/${id}`, { method: 'DELETE' })
      delete savedTracks[id]
      setSavedTracks({...savedTracks})
      showMessage(`Traccia "${track.name}" eliminata`, 'success')
    } catch (error) {
      showMessage('Errore nell\'eliminare la traccia', 'error')
    }
  }

  const handleRenameTrack = async (id, newName) => {
    const track = savedTracks[id]
    if (!track) return

    try {
      const res = await fetch(`${API_URL}/tracks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName })
      })
      if (res.ok) {
        savedTracks[id] = { ...track, name: newName }
        setSavedTracks({...savedTracks})
        showMessage(`Traccia rinominata in "${newName}"`, 'success')
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

  // Convert GPX to KML format
  const gpxToKml = (gpxContent, name) => {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(gpxContent, 'text/xml')
    
    let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${name || 'GPX Track'}</name>
    <Style id="trackStyle">
      <LineStyle>
        <color>ff0000ff</color>
        <width>4</width>
      </LineStyle>
    </Style>
`
    
    // Parse tracks
    const tracks = xmlDoc.getElementsByTagName('trk')
    for (let i = 0; i < tracks.length; i++) {
      const trackName = tracks[i].getElementsByTagName('name')[0]?.textContent || `Track ${i + 1}`
      const trackSegments = tracks[i].getElementsByTagName('trkseg')
      
      for (let j = 0; j < trackSegments.length; j++) {
        const trackPoints = trackSegments[j].getElementsByTagName('trkpt')
        if (trackPoints.length > 0) {
          kml += `    <Placemark>
      <name>${trackName}${trackSegments.length > 1 ? ` (Segment ${j + 1})` : ''}</name>
      <styleUrl>#trackStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
`
          for (let k = 0; k < trackPoints.length; k++) {
            const lat = parseFloat(trackPoints[k].getAttribute('lat'))
            const lon = parseFloat(trackPoints[k].getAttribute('lon'))
            const ele = trackPoints[k].getElementsByTagName('ele')[0]?.textContent || '0'
            kml += `          ${lon},${lat},${ele}
`
          }
          kml += `        </coordinates>
      </LineString>
    </Placemark>
`
        }
      }
    }
    
    // Parse routes
    const routes = xmlDoc.getElementsByTagName('rte')
    for (let i = 0; i < routes.length; i++) {
      const routeName = routes[i].getElementsByTagName('name')[0]?.textContent || `Route ${i + 1}`
      const routePoints = routes[i].getElementsByTagName('rtept')
      
      if (routePoints.length > 0) {
        kml += `    <Placemark>
      <name>${routeName}</name>
      <styleUrl>#trackStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
`
        for (let j = 0; j < routePoints.length; j++) {
          const lat = parseFloat(routePoints[j].getAttribute('lat'))
          const lon = parseFloat(routePoints[j].getAttribute('lon'))
          const ele = routePoints[j].getElementsByTagName('ele')[0]?.textContent || '0'
          kml += `          ${lon},${lat},${ele}
`
        }
        kml += `        </coordinates>
      </LineString>
    </Placemark>
`
      }
    }
    
    kml += `  </Document>
</kml>`
    return kml
  }

  // Open Google My Maps for KML import (with automatic file download)
  const openGoogleMyMaps = (track) => {
    // First get the GPX content
    let trackGPXContent = null
    if (track?.gpxContent) {
      trackGPXContent = track.gpxContent
    } else if (gpxContent) {
      trackGPXContent = gpxContent
    }
    
    if (!trackGPXContent) {
      showMessage('Nessun file GPX disponibile', 'warning')
      return
    }

    // Convert GPX to KML
    const trackName = track?.name || extractGPXName(trackGPXContent) || `traccia_${Date.now()}`
    const kmlContent = gpxToKml(trackGPXContent, trackName)
    
    // Create download link for KML
    const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${trackName}.kml`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    // Open Google My Maps in new tab
    window.open('https://www.google.com/maps/d/', '_blank')
    showMessage('File KML scaricato! Vai su Google My Maps per importarlo', 'success')
  }

  // Open track in Google Maps
  const openInGoogleMaps = (coords) => {
    if (!coords || coords.length < 2) {
      showMessage('Nessuna traccia da visualizzare', 'warning')
      return
    }
    // Sample coordinates to stay within URL limits (Google Maps supports ~10 waypoints)
    const maxWaypoints = 10
    const step = coords.length > maxWaypoints ? Math.floor(coords.length / maxWaypoints) : 1
    const sampledCoords = []
    for (let i = 0; i < coords.length && sampledCoords.length < maxWaypoints; i += step) {
      sampledCoords.push(coords[i])
    }
    // Ensure last point is included
    if (sampledCoords[sampledCoords.length - 1] !== coords[coords.length - 1]) {
      sampledCoords.push(coords[coords.length - 1])
    }
    // Build waypoints string
    const waypointsStr = sampledCoords.map(c => `${c[0]},${c[1]}`).join('|')
    const url = `https://www.google.com/maps/dir/?api=1&waypoints=${encodeURIComponent(waypointsStr)}`
    window.open(url, '_blank')
    showMessage('Apertura Google Maps...', 'success')
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

  // Photo markers for map
  const [photoMarkers, setPhotoMarkers] = useState([])
  const [photoGalleryKey, setPhotoGalleryKey] = useState(0)
  const [showFullscreenGallery, setShowFullscreenGallery] = useState(false)

  // Callback to receive photo markers from PhotoGallery
  useEffect(() => {
    window.onPhotoMarkersLoaded = (markers) => {
      setPhotoMarkers(markers)
    }
    return () => { delete window.onPhotoMarkersLoaded }
  }, [activeTrackId])

  const toggleProfileDetach = () => {
    setIsProfileDetached(!isProfileDetached)
  }

  // Filter tracks if trackIdParam is present
  const filteredTracks = trackFilterActive && trackIdParam && savedTracks[trackIdParam] ? { [trackIdParam]: savedTracks[trackIdParam] } : savedTracks

  return (
    <div className={`gpx-viewer ${isFullscreen ? 'fullscreen-mode' : ''}`}>
      <div className="map-section">
        <LayerSelector 
          currentLayer={currentLayer} 
          onLayerChange={setCurrentLayer} 
          showHikingOverlay={showHikingOverlay}
          onOverlayToggle={setShowHikingOverlay}
          largeLabels={largeLabels}
          onLargeLabelsToggle={setLargeLabels}
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
          showHikingOverlay={showHikingOverlay}
          photoMarkers={photoMarkers}
        />
        
        {/* Profile overlay on map when detached - multiple tracks */}
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
        
        {/* Profile overlay on map when detached - single file */}
        {gpxContent && tracks.length === 0 && isProfileDetached && (
          <div className="profile-overlay">
            <ElevationProfile 
              gpxContent={gpxContent}
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
          <div className="sidebar-header">
            <h3>Carica GPX</h3>
            <button className="sidebar-toggle-btn" onClick={toggleSidebarMode}>
              {sidebarMode === 'wide' ? '🔽 Compatto' : '🔼 Larga'}
            </button>
          </div>
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
                <List
                  height={Math.min(300, tracks.length * 45)}
                  itemCount={tracks.length}
                  itemSize={45}
                  width="100%"
                >
                  {({ index, style }) => {
                    const track = tracks[index];
                    return (
                      <div 
                        style={style}
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
                            className="track-action-btn google-maps-btn" 
                            onClick={(e) => { e.stopPropagation(); openInGoogleMaps(track.coordinates) }}
                            title="Apri in Google Maps"
                          >📍</button>
                          <button 
                            className="track-action-btn remove" 
                            onClick={(e) => { e.stopPropagation(); removeTrack(track.id) }}
                            title="Rimuovi"
                          >✕</button>
                        </div>
                      </div>
                    );
                  }}
                </List>
              </div>
            </div>
          )}

          {/* Show profile controls when tracks are loaded */}
          {(tracks.length > 0 || (gpxContent && tracks.length === 0)) && (
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
              {!isProfileDetached && (
                <ElevationProfile 
                  gpxContent={gpxContent}
                  selectedIndex={selectedIndex}
                  onHover={(index) => setSelectedIndex(index)}
                />
              )}
          {/* Google Maps and My Maps buttons for single file */}
              <div className="google-maps-buttons">
                <button 
                  className="google-maps-btn primary"
                  onClick={() => openGoogleMyMaps(null)}
                  title="Importa file GPX in Google My Maps"
                >
                  💾 Scarica e importa in Google My Maps
                </button>
                <button 
                  className="google-maps-btn secondary"
                  onClick={() => openInGoogleMaps(trackCoordinates)}
                  title="Apri traccia in Google Maps"
                >
                  📍 Apri in Google Maps
                </button>
              </div>
            </>
          )}
          
          {/* Photo Gallery - only show for loaded saved tracks */}
          {activeTrackId && (
            <PhotoGallery 
              key={photoGalleryKey} 
              itemId={activeTrackId} 
              itemType="track" 
              coordinates={activeTrack?.coordinates}
              onFullscreenToggle={(isFullscreen) => {
                setShowFullscreenGallery(isFullscreen)
                if (isFullscreen) {
                  setIsFullscreen(true)
                }
              }}
            />
          )}
          
          <div className="filter-container" style={{ marginBottom: '1rem', position: 'relative' }}>
            <input 
              type="text" 
              placeholder="🔍 Cerca tra le tracce..." 
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
          
          <SavedTracks
            tracks={filteredTracks}
            filterId={trackIdParam}
            filterText={filterText}
            onLoad={(id) => {
              handleLoadTrack(id)
              const track = savedTracks[id]
              if (track) {
                setActiveTrackId(track.id)
                setPhotoGalleryKey(k => k + 1)
              }
            }}
            onDelete={handleDeleteTrack}
            onRename={handleRenameTrack}
            onSaveCurrent={handleSaveCurrent}
            hasTrack={trackCoordinates.length > 0 || tracks.length > 0}
          />
        </div>
      )}

      {/* Fullscreen Photo Gallery Overlay */}
      {showFullscreenGallery && activeTrackId && isFullscreen && (
        <div className="fullscreen-gallery-overlay">
          <PhotoGallery 
            key={`fullscreen-${photoGalleryKey}`}
            itemId={activeTrackId} 
            itemType="track" 
            coordinates={activeTrack?.coordinates}
            fullscreenMode={true}
            onFullscreenToggle={(isFullscreen) => setShowFullscreenGallery(isFullscreen)}
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
