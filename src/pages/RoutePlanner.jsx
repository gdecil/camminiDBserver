import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import Map from '../components/Map'
import LayerSelector from '../components/LayerSelector'
import ElevationProfile from '../components/ElevationProfile'
import './RoutePlanner.css'

const API_URL = '/api'

// Routing services configuration
const ROUTING_SERVICES = {
  osrm: {
    name: 'OSRM',
    description: 'Open Source Routing Machine',
    url: (sLng, sLat, eLng, eLat) => 
      `https://router.project-osrm.org/route/v1/walking/${sLng},${sLat};${eLng},${eLat}?overview=full&geometries=geojson`,
    parse: (data) => {
      if (data.code === 'Ok' && data.routes?.[0]) {
        return {
          coords: data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]),
          distance: data.routes[0].distance
        }
      }
      return null
    }
  },
  valhalla: {
    name: 'Valhalla',
    description: 'Open source routing engine',
    url: (sLng, sLat, eLng, eLat) => {
      const body = {
        locations: [{ lat: sLat, lon: sLng }, { lat: eLat, lon: eLng }],
        costing: 'pedestrian',
        units: 'kilometers'
      }
      return 'https://valhalla1.openstreetmap.de/route'
    },
    parse: async (sLng, sLat, eLng, eLat) => {
      const body = {
        locations: [{ lat: parseFloat(sLat), lon: parseFloat(sLng) }, { lat: parseFloat(eLat), lon: parseFloat(eLng) }],
        costing: 'pedestrian',
        units: 'kilometers'
      }
      const res = await fetch('https://valhalla1.openstreetmap.de/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (data.trip?.legs?.[0]) {
        const leg = data.trip.legs[0]
        const coords = leg.shape ? decodePolyline6(leg.shape, 6) : []
        const distance = leg.summary?.length * 1000 || 0
        return { coords, distance }
      }
      return null
    },
    isAsync: true
  },
  graphhopper: {
    name: 'GraphHopper',
    description: 'Fast open-source routing engine (API key required)',
    url: (sLng, sLat, eLng, eLat, apiKey) => {
      const keyParam = apiKey ? `&key=${apiKey}` : ''
      return `https://graphhopper.com/api/1/route?point=${sLat},${sLng}&point=${eLat},${eLng}&vehicle=foot&locale=it&calc_points=true&points_encoded=false${keyParam}`
    },
    parse: (data) => {
      if (data.paths?.[0]) {
        const path = data.paths[0]
        const coords = path.points?.coordinates?.map(c => [c[1], c[0]]) || []
        return {
          coords,
          distance: path.distance
        }
      }
      return null
    },
    requiresApiKey: true
  }
}

function decodePolyline6(str, precision) {
  let index = 0, lat = 0, lng = 0
  const coordinates = []
  while (index < str.length) {
    let latitudeChange = 0, shift = 0, byte
    do {
      byte = str.charCodeAt(index++) - 63
      latitudeChange |= (byte & 0x1F) << shift
      shift += 5
    } while (byte >= 0x20)
    lat += (latitudeChange & 1 ? ~(latitudeChange >> 1) : latitudeChange >> 1)
    
    let longitudeChange = 0; shift = 0
    do {
      byte = str.charCodeAt(index++) - 63
      longitudeChange |= (byte & 0x1F) << shift
      shift += 5
    } while (byte >= 0x20)
    lng += (longitudeChange & 1 ? ~(longitudeChange >> 1) : longitudeChange >> 1)
    
    coordinates.push([lat / Math.pow(10, precision), lng / Math.pow(10, precision)])
  }
  return coordinates
}

const WAYPOINT_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e']

// Collapsible Section Component
function CollapsibleSection({ id, title, defaultOpen, children, className = '' }) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  return (
    <div className={`collapsible-section ${isOpen ? 'open' : 'collapsed'} ${className}`}>
      <div className="section-header" onClick={() => setIsOpen(!isOpen)}>
        <span className="section-arrow">{isOpen ? '▼' : '▶'}</span>
        <span className="section-title">{title}</span>
      </div>
      {isOpen && <div className="section-content">{children}</div>}
    </div>
  )
}

export default function RoutePlanner() {
  const [waypoints, setWaypoints] = useState([])
  const [routeCoordinates, setRouteCoordinates] = useState([])
  const [distance, setDistance] = useState(null)
  const [elevationData, setElevationData] = useState(null)
  const [loadingElevation, setLoadingElevation] = useState(false)
  const [message, setMessage] = useState(null)
  const [currentLayer, setCurrentLayer] = useState('OpenStreetMap')
  const [savedRoutes, setSavedRoutes] = useState([])
  const [loadedRouteIds, setLoadedRouteIds] = useState([])
  const [loadedRoutes, setLoadedRoutes] = useState([])
  const LOADED_ROUTE_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#ff6b6b', '#4ecdc4']
  const [showLoadedProfile, setShowLoadedProfile] = useState(false)
  const [activeProfileTab, setActiveProfileTab] = useState(null)
  const [loadedTrackHoverIndex, setLoadedTrackHoverIndex] = useState(null)
  const [hoveredLoadedRouteId, setHoveredLoadedRouteId] = useState(null)
  const [sortBy, setSortBy] = useState('date')
  const [sortOrder, setSortOrder] = useState('desc')
  const [showRouteProfile, setShowRouteProfile] = useState(false)
  const [profileKey, setProfileKey] = useState(0)
  const [segments, setSegments] = useState([])
  const [draggedIndex, setDraggedIndex] = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [sidebarWidth, setSidebarWidth] = useState(380)
  const [isResizing, setIsResizing] = useState(false)
  const [searchParams] = useSearchParams()
  const routeIdParam = searchParams.get('routeId')
  const [routingService, setRoutingService] = useState('osrm')
  const [isCalculating, setIsCalculating] = useState(false)
  const [graphhopperApiKey, setGraphhopperApiKey] = useState('')
  
  // POI State
  const [poiFilter, setPoiFilter] = useState({
    hotels: true, guesthouses: true, hostels: true, campsites: true,
    restaurants: true, cafes: true, shelters: true,
  })
  const [pois, setPois] = useState([])
  const [isSearchingPois, setIsSearchingPois] = useState(false)
  const [showPois, setShowPois] = useState(false)
  const [poiSearchRadius, setPoiSearchRadius] = useState(1000)
  const [selectedPoi, setSelectedPoi] = useState(null)
  const [showAllPois, setShowAllPois] = useState(true) // Show all categories
  const [poiSortBy, setPoiSortBy] = useState('distance') // 'distance', 'name', 'category'
  const [poiGroupedByCategory, setPoiGroupedByCategory] = useState({}) // Grouped POIs

  const handleResizeStart = (e) => { e.preventDefault(); setIsResizing(true) }

  useEffect(() => {
    const handleMouseMove = (e) => { if (isResizing) setSidebarWidth(Math.min(550, Math.max(280, window.innerWidth - e.clientX))) }
    const handleMouseUp = () => setIsResizing(false)
    if (isResizing) { document.addEventListener('mousemove', handleMouseMove); document.addEventListener('mouseup', handleMouseUp) }
    return () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp) }
  }, [isResizing])

  useEffect(() => { loadSavedRoutes() }, [])
  useEffect(() => {
    if (routeIdParam && savedRoutes.length > 0) {
      const route = savedRoutes.find(r => r.id === routeIdParam)
      if (route) handleLoadRoute(route)
    }
  }, [routeIdParam, savedRoutes])

  const loadSavedRoutes = async () => {
    try {
      const res = await fetch(`${API_URL}/routes`)
      const data = await res.json()
      setSavedRoutes(data.map(route => ({
        ...route,
        coordinates: route.coordinates ? (typeof route.coordinates === 'string' ? JSON.parse(route.coordinates) : route.coordinates) : [],
        waypoints: route.waypoints ? (typeof route.waypoints === 'string' ? JSON.parse(route.waypoints) : route.waypoints) : [],
        elevation: route.elevation ? (typeof route.elevation === 'string' ? JSON.parse(route.elevation) : route.elevation) : null,
        createdAt: route.created_at
      })))
    } catch (error) { console.error('Error loading routes:', error) }
  }

  const getSortedRoutes = () => {
    const sorted = [...savedRoutes]
    sorted.sort((a, b) => {
      if (sortBy === 'name') return sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
      const dateA = new Date(a.createdAt || a.created_at), dateB = new Date(b.createdAt || b.created_at)
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA
    })
    return sorted
  }

  const handleRenameRoute = async (route) => {
    const newName = prompt('Nuovo nome per l\'itinerario:', route.name)
    if (!newName || newName === route.name) return
    try {
      await fetch(`${API_URL}/routes/${route.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName }) })
      showMessage(`Itinerario rinominato in "${newName}"`, 'success')
      loadSavedRoutes()
    } catch (error) { showMessage('Errore nel rinominare l\'itinerario', 'error') }
  }

  const toggleSort = (field) => {
    if (sortBy === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    else { setSortBy(field); setSortOrder('desc') }
  }

  const handleLoadRoute = (route) => {
    if (!route) return
    let loadedWaypoints = []
    if (route.waypoints?.length > 0) loadedWaypoints = route.waypoints.map((wp, i) => ({ id: Date.now() + i, lat: String(wp.lat), lng: String(wp.lng), name: wp.name || `Punto ${i + 1}` }))
    else if (route.start_lat && route.end_lat) loadedWaypoints = [{ id: Date.now(), lat: String(route.start_lat), lng: String(route.start_lng), name: 'Partenza' }, { id: Date.now() + 1, lat: String(route.end_lat), lng: String(route.end_lng), name: 'Arrivo' }]
    setWaypoints(loadedWaypoints)
    let coords = []
    if (route.coordinates) coords = typeof route.coordinates === 'string' ? JSON.parse(route.coordinates) : route.coordinates
    setRouteCoordinates(coords)
    if (route.elevation?.length > 0) {
      setElevationData({ ascent: route.ascent || 0, descent: route.descent || 0, minElevation: route.minElevation || 0, maxElevation: route.maxElevation || 0, elevations: route.elevation })
      setDistance(route.distance); setProfileKey(k => k + 1)
      showMessage(`Itinerario "${route.name}" caricato con profilo`, 'success')
    } else { setElevationData(null); if (route.distance) setDistance(route.distance); showMessage(`Itinerario "${route.name}" caricato`, 'success') }
  }

  const toggleLoadRoute = (route) => {
    const isLoaded = loadedRouteIds.includes(route.id)
    if (isLoaded) {
      setLoadedRouteIds(prev => prev.filter(id => id !== route.id))
      setLoadedRoutes(prev => prev.filter(r => r.id !== route.id))
      if (activeProfileTab === `route_${route.id}`) setActiveProfileTab(null)
      showMessage(`Itinerario "${route.name}" rimosso`, 'info')
    } else {
      let coords = route.coordinates ? (typeof route.coordinates === 'string' ? JSON.parse(route.coordinates) : route.coordinates) : []
      const color = LOADED_ROUTE_COLORS[loadedRoutes.length % LOADED_ROUTE_COLORS.length]
      setLoadedRouteIds(prev => [...prev, route.id])
      setLoadedRoutes(prev => [...prev, { id: route.id, name: route.name, coordinates: coords, color, distance: route.distance || '?', elevation: route.elevation || null, distanceNum: parseFloat(route.distance) || 0 }])
      setActiveProfileTab(`route_${route.id}`); setShowLoadedProfile(true)
      showMessage(`Itinerario "${route.name}" aggiunto alla mappa`, 'success')
    }
  }

  const clearLoadedRoutes = () => { setLoadedRouteIds([]); setLoadedRoutes([]); showMessage('Itinerari aggiuntivi rimossi', 'info') }
  const handleDeleteRoute = async (route) => {
    if (!confirm(`Eliminare l'itinerario "${route.name}"?`)) return
    try { await fetch(`${API_URL}/routes/${route.id}`, { method: 'DELETE' }); showMessage(`Eliminato`, 'success'); loadSavedRoutes() }
    catch (error) { showMessage('Errore nell\'eliminazione', 'error') }
  }

  const handleSaveRoute = async () => {
    if (!distance || waypoints.length < 2) { showMessage('Calcola prima il percorso', 'error'); return }
    const routeName = prompt('Nome per l\'itinerario:', `Itinerario ${new Date().toLocaleDateString()}`)
    if (!routeName) return
    const validWaypoints = waypoints.filter(wp => !isNaN(parseFloat(wp.lat)) && !isNaN(parseFloat(wp.lng)))
    try {
      await fetch(`${API_URL}/routes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: routeName, startLat: parseFloat(validWaypoints[0].lat), startLng: parseFloat(validWaypoints[0].lng), endLat: parseFloat(validWaypoints[validWaypoints.length - 1].lat), endLng: parseFloat(validWaypoints[validWaypoints.length - 1].lng), distance, coordinates: routeCoordinates, elevation: elevationData?.elevations || null, waypoints: validWaypoints.map(wp => ({ lat: wp.lat, lng: wp.lng, name: wp.name })), ascent: elevationData?.ascent || null, descent: elevationData?.descent || null, minElevation: elevationData?.minElevation || null, maxElevation: elevationData?.maxElevation || null }) })
      showMessage(`Itinerario "${routeName}" salvato!`, 'success'); loadSavedRoutes()
    } catch (error) { showMessage('Errore nel salvataggio', 'error') }
  }

  const showMessage = (text, type = 'info') => { setMessage({ text, type }); setTimeout(() => setMessage(null), 5000) }
  const handleMapClick = (e) => { if (isFullscreen) return; const { lat, lng } = e.latlng; setWaypoints([...waypoints, { id: Date.now(), lat: lat.toFixed(6), lng: lng.toFixed(6), name: `Punto ${waypoints.length + 1}` }]) }
  const addWaypoint = () => { setWaypoints([...waypoints, { id: Date.now(), lat: '', lng: '', name: `Tappa ${waypoints.length + 1}` }]) }
  const updateWaypoint = (id, field, value) => { setWaypoints(waypoints.map(wp => wp.id === id ? { ...wp, [field]: value } : wp)) }
  const removeWaypoint = (id) => { const nw = waypoints.filter(wp => wp.id !== id); setWaypoints(nw); if (nw.length >= 2) setTimeout(() => calculateMultiRoute(), 0) }
  const handleDragStart = (e, index) => { setDraggedIndex(index); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/html', e.target) }
  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
  const handleDragEnter = (e) => { e.preventDefault() }
  const handleDragEnd = () => { setDraggedIndex(null) }
  const handleDrop = (e, dropIndex) => {
    e.preventDefault(); if (draggedIndex === null || draggedIndex === dropIndex) return
    const nw = [...waypoints]; const item = nw[draggedIndex]; nw.splice(draggedIndex, 1); nw.splice(dropIndex, 0, item)
    setWaypoints(nw); setDraggedIndex(null)
    if (nw.length >= 2) setTimeout(() => calculateMultiRoute(), 0)
  }
  const handleWaypointDragEnd = (index, newLat, newLng) => {
    const nw = waypoints.map((wp, i) => i === index ? { ...wp, lat: newLat.toFixed(6), lng: newLng.toFixed(6) } : wp)
    setWaypoints(nw); if (nw.length >= 2) setTimeout(() => calculateMultiRoute(), 0)
  }
  const clearAllWaypoints = () => { setWaypoints([]); setRouteCoordinates([]); setDistance(null); setElevationData(null); setSegments([]); setShowRouteProfile(false) }

  const getSegmentRoute = async (sLat, sLng, eLat, eLng, serviceKey) => {
    const service = ROUTING_SERVICES[serviceKey]; if (!service) return null
    try {
      if (service.isAsync) return await service.parse(sLng, sLat, eLng, eLat)
      const url = service.requiresApiKey ? service.url(sLng, sLat, eLng, eLat, graphhopperApiKey) : service.url(sLng, sLat, eLng, eLat)
      const res = await fetch(url); const data = await res.json(); return service.parse(data)
    } catch (error) { console.error(`Error with ${service.name}:`, error); return null }
  }

  const calculateMultiRoute = async () => {
    const validWaypoints = waypoints.filter(wp => !isNaN(parseFloat(wp.lat)) && !isNaN(parseFloat(wp.lng)))
    if (validWaypoints.length < 2) { showMessage('Aggiungi almeno 2 punti', 'error'); return }
    setIsCalculating(true); setLoadingElevation(true); setRouteCoordinates([]); setDistance(null); setElevationData(null); setSegments([]); setShowRouteProfile(false)
    const serviceName = ROUTING_SERVICES[routingService]?.name || routingService.toUpperCase()
    showMessage(`Calcolo percorso con ${serviceName}...`, 'info')
    try {
      let allCoords = [], totalDistance = 0, segmentDistances = []
      for (let i = 0; i < validWaypoints.length - 1; i++) {
        const sLat = parseFloat(validWaypoints[i].lat), sLng = parseFloat(validWaypoints[i].lng)
        const eLat = parseFloat(validWaypoints[i + 1].lat), eLng = parseFloat(validWaypoints[i + 1].lng)
        const result = await getSegmentRoute(sLat, sLng, eLat, eLng, routingService)
        if (result?.coords?.length > 0) {
          allCoords = i > 0 ? [...allCoords, ...result.coords.slice(1)] : result.coords
          totalDistance += result.distance; segmentDistances.push((result.distance / 1000).toFixed(2))
        } else {
          const R = 6371, dLat = (eLat - sLat) * Math.PI / 180, dLng = (eLng - sLng) * Math.PI / 180
          const a = Math.sin(dLat/2) ** 2 + Math.cos(sLat * Math.PI/180) * Math.cos(eLat * Math.PI/180) * Math.sin(dLng/2) ** 2
          const segDist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
          allCoords = i > 0 ? [...allCoords, [eLat, eLng]] : [[sLat, sLng], [eLat, eLng]]
          totalDistance += segDist * 1000; segmentDistances.push(segDist.toFixed(2))
        }
      }
      setRouteCoordinates(allCoords); setDistance((totalDistance / 1000).toFixed(2)); setSegments(segmentDistances)
      await calculateElevation(allCoords); showMessage(`Percorso calcolato con ${serviceName}`, 'success')
    } catch (error) { console.error('Error:', error); showMessage('Errore nel calcolo', 'error') }
    setIsCalculating(false); setLoadingElevation(false)
  }

  const calculateElevation = async (coordinates) => {
    if (coordinates?.length < 2) return; setLoadingElevation(true)
    try {
      const step = Math.max(1, Math.floor(coordinates.length / 100))
      const sampledCoords = []; for (let i = 0; i < coordinates.length; i += step) sampledCoords.push(coordinates[i])
      if (sampledCoords[sampledCoords.length - 1] !== coordinates[coordinates.length - 1]) sampledCoords.push(coordinates[coordinates.length - 1])
      const response = await fetch(`${API_URL}/elevation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locations: sampledCoords.map(c => ({ lat: c[0], lng: c[1] })) }) })
      const data = await response.json()
      if (data.status === 'OK' && data.results) {
        const elevations = data.results.map(r => r.elevation).filter(e => e !== null)
        if (elevations.length > 1) {
          let ascent = 0, descent = 0
          for (let i = 1; i < elevations.length; i++) { const diff = elevations[i] - elevations[i-1]; if (diff > 0) ascent += diff; else descent += Math.abs(diff) }
          setElevationData({ ascent: Math.round(ascent), descent: Math.round(descent), minElevation: Math.round(Math.min(...elevations)), maxElevation: Math.round(Math.max(...elevations)), elevations })
          setProfileKey(k => k + 1)
        }
      }
    } catch (error) { console.error('Error elevation:', error) }
    setLoadingElevation(false)
  }

  const generateRouteGPXForProfile = () => {
    if (!elevationData?.elevations?.length || !routeCoordinates.length) return null
    let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1">\n<trk>\n<trkseg>\n'
    elevationData.elevations.forEach((ele, i) => {
      const coordIndex = Math.floor((i / (elevationData.elevations.length - 1)) * (routeCoordinates.length - 1))
      const coord = routeCoordinates[coordIndex]
      if (coord) gpx += `    <trkpt lat="${coord[0].toFixed(6)}" lon="${coord[1].toFixed(6)}"><ele>${ele.toFixed(2)}</ele></trkpt>\n`
    })
    return gpx + '</trkseg>\n</trk>\n</gpx>'
  }

  const generateRouteGPX = (route) => {
    const { coordinates, elevation, name } = route; if (!coordinates?.length) return null
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Cammini">\n  <metadata>\n    <name>${name}</name>\n  </metadata>\n<trk>\n<trkseg>\n`
    coordinates.forEach((coord) => gpx += `    <trkpt lat="${coord[0]}" lon="${coord[1]}">\n      <ele>0</ele>\n    </trkpt>\n`)
    return gpx + '</trkseg>\n</trk>\n</gpx>'
  }

  const downloadGPX = (gpx, filename) => {
    const blob = new Blob([gpx], { type: 'application/gpx+xml' }); const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename.endsWith('.gpx') ? filename : filename + '.gpx'
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  const handleExportRoute = (route) => { const gpx = generateRouteGPX(route); if (gpx) downloadGPX(gpx, route.name) }
  const routeGPXContent = generateRouteGPXForProfile()
  const validWaypoints = waypoints.filter(wp => !isNaN(parseFloat(wp.lat)) && !isNaN(parseFloat(wp.lng)))
  const hoveredRoute = loadedTrackHoverIndex !== null && hoveredLoadedRouteId ? loadedRoutes.find(r => r.id === hoveredLoadedRouteId) : null

  const searchPois = async () => {
    let allCoords = routeCoordinates
    if (!allCoords || allCoords.length === 0) {
      allCoords = []
      loadedRoutes.forEach(r => {
        if (r.coordinates && Array.isArray(r.coordinates) && r.coordinates.length > 0) {
          allCoords = [...allCoords, ...r.coordinates]
        }
      })
    }
    if (!allCoords || allCoords.length === 0) { showMessage('Calcola prima un itinerario', 'warning'); return }
    setIsSearchingPois(true)
    // Limit to max 10 sampled points to avoid Overpass timeout
    const maxPoints = Math.min(10, allCoords.length)
    const step = Math.max(1, Math.floor(allCoords.length / maxPoints))
    const sampledPoints = []
    for (let i = 0; i < allCoords.length && sampledPoints.length < maxPoints; i += step) sampledPoints.push(allCoords[i])
    const parts = []; if (poiFilter.hotels) parts.push('node["tourism"="hotel"]'); if (poiFilter.guesthouses) parts.push('node["tourism"="guest_house"]')
    if (poiFilter.hostels) parts.push('node["tourism"="hostel"]'); if (poiFilter.campsites) parts.push('node["tourism"="camp_site"]')
    if (poiFilter.restaurants) parts.push('node["amenity"="restaurant"]'); if (poiFilter.cafes) parts.push('node["amenity"="cafe"]')
    if (poiFilter.shelters) parts.push('node["tourism"="wilderness_hut"]')
    let queryBody = '[out:json][timeout:30];\n(\n'
    sampledPoints.forEach(point => parts.forEach(part => { queryBody += `${part}(around:${poiSearchRadius},${point[0]},${point[1]});\n` }))
    queryBody += ');\nout body;\n>; out skel qt;'
    try {
      const response = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: `data=${encodeURIComponent(queryBody)}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
      if (!response.ok) throw new Error('Overpass API error')
      const data = await response.json(); const poiMap = {}
      data.elements?.forEach(el => {
        if (el.type === 'node' && el.lat && el.lon && !poiMap[el.id]) {
          let type = 'other', icon = '📍'
          if (el.tags?.tourism === 'hotel') { type = 'Hotel'; icon = '🏨' }
          else if (el.tags?.tourism === 'guest_house') { type = 'Guest House'; icon = '🏠' }
          else if (el.tags?.tourism === 'hostel') { type = 'Ostello'; icon = '🛏️' }
          else if (el.tags?.tourism === 'camp_site') { type = 'Campeggio'; icon = '⛺' }
          else if (el.tags?.amenity === 'restaurant') { type = 'Ristorante'; icon = '🍽️' }
          else if (el.tags?.amenity === 'cafe') { type = 'Cafè'; icon = '☕' }
          else if (el.tags?.tourism === 'wilderness_hut') { type = 'Rifugio'; icon = '🏔️' }
          let minDist = Infinity; allCoords.forEach(c => { const d = Math.sqrt(Math.pow(el.lat - c[0], 2) + Math.pow(el.lon - c[1], 2)) * 111000; if (d < minDist) minDist = d })
          poiMap[el.id] = { id: el.id, lat: el.lat, lng: el.lon, name: el.tags?.name || type, type, icon, distance: minDist }
        }
      })
      const result = Object.values(poiMap).filter(p => p.distance <= poiSearchRadius).sort((a, b) => a.distance - b.distance)
      setPois(result); setShowPois(true); showMessage(`${result.length} luoghi trovati`, 'success')
    } catch (error) { console.error('POI error:', error); showMessage('Errore nella ricerca', 'error') }
    setIsSearchingPois(false)
  }

  // Group POIs by category and sort
  useEffect(() => {
    if (pois.length === 0) { setPoiGroupedByCategory({}); return }
    
    // Filter selected categories
    const categoryMap = {
      'Hotel': '🏨 Hotel',
      'Guest House': '🏠 Guest',
      'Ostello': '🛏️ Ostelli',
      'Campeggio': '⛺ Campeggi',
      'Ristorante': '🍽️ Ristoranti',
      'Cafè': '☕ Cafè',
      'Rifugio': '🏔️ Rifugi',
    }
    
    const filtered = pois.filter(poi => {
      const catLabel = categoryMap[poi.type] || '📍 Altro'
      // Check if any checkbox is selected for this category
      const catKey = Object.entries(categoryMap).find(([_, label]) => label === catLabel)?.[0]
      if (!catKey) return true
      
      // Map category name to filter key
      const filterMapping = {
        'Hotel': 'hotels',
        'Guest House': 'guesthouses',
        'Ostello': 'hostels',
        'Campeggio': 'campsites',
        'Ristorante': 'restaurants',
        'Cafè': 'cafes',
        'Rifugio': 'shelters',
      }
      return poiFilter[filterMapping[catKey]] !== false
    })
    
    // Sort
    const sorted = [...filtered].sort((a, b) => {
      if (poiSortBy === 'distance') return a.distance - b.distance
      if (poiSortBy === 'name') return a.name.localeCompare(b.name)
      if (poiSortBy === 'category') return a.type.localeCompare(b.type)
      return 0
    })
    
    // Group by category
    const grouped = {}
    sorted.forEach(poi => {
      const cat = categoryMap[poi.type] || '📍 Altro'
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(poi)
    })
    
    setPoiGroupedByCategory(grouped)
  }, [pois, poiSortBy, poiFilter])

  return (
    <div className={`route-planner ${isFullscreen ? 'fullscreen-mode' : ''}`}>
      <div className="map-section">
        <LayerSelector currentLayer={currentLayer} onLayerChange={setCurrentLayer} />
        <button className="fullscreen-btn" onClick={() => { !isFullscreen ? document.documentElement.requestFullscreen?.() : document.exitFullscreen?.(); setIsFullscreen(!isFullscreen) }} title={isFullscreen ? 'Esci' : 'Fullscreen'}>{isFullscreen ? '✕' : '⛶'}</button>
        <Map trackCoordinates={routeCoordinates} startMarker={validWaypoints.length > 0 ? [parseFloat(validWaypoints[0].lat), parseFloat(validWaypoints[0].lng)] : null}
          endMarker={validWaypoints.length > 1 ? [parseFloat(validWaypoints[validWaypoints.length - 1].lat), parseFloat(validWaypoints[validWaypoints.length - 1].lng)] : null}
          routeCoordinates={routeCoordinates} multipleTracks={loadedRoutes.map(r => ({ coordinates: r.coordinates, color: r.color }))}
          hoverTrack={hoveredRoute ? { coordinates: hoveredRoute.coordinates, color: hoveredRoute.color, index: loadedTrackHoverIndex } : null}
          onMapClick={handleMapClick} currentLayer={currentLayer} waypoints={validWaypoints.map((wp, i) => ({ position: [parseFloat(wp.lat), parseFloat(wp.lng)], color: WAYPOINT_COLORS[i % WAYPOINT_COLORS.length], label: wp.name }))}
          poiMarker={selectedPoi ? { position: [selectedPoi.lat, selectedPoi.lng], icon: selectedPoi.icon, name: selectedPoi.name } : null}
          onWaypointDragEnd={isFullscreen ? null : handleWaypointDragEnd} draggable={!isFullscreen} selectedIndex={selectedIndex} onHover={(index) => setSelectedIndex(index)} />
        {showRouteProfile && routeGPXContent && elevationData && !loadingElevation && <div className="route-profile-container"><ElevationProfile key={profileKey} gpxContent={routeGPXContent} isOverlay={false} routeCoordinates={routeCoordinates} totalDistance={distance ? parseFloat(distance) : null} selectedIndex={selectedIndex} onHover={(index) => setSelectedIndex(index)} /></div>}
      </div>
      {!isFullscreen && <div className="sidebar" style={{ width: sidebarWidth }}>
        <div className="sidebar-resize-handle" onMouseDown={handleResizeStart} />
        
        <CollapsibleSection id="itinerary" title="🗺️ Itinerario Multi-Tappa" defaultOpen={true}>
          <p className="hint">Aggiungi punti di passaggio</p>
          <div className="routing-service-selector">
            <label>Servizio di routing:</label>
            <div className="service-buttons">
              {Object.entries(ROUTING_SERVICES).map(([key, service]) => (<button key={key} className={`service-btn ${routingService === key ? 'active' : ''}`} onClick={() => setRoutingService(key)} title={service.description}>{service.name}</button>))}
            </div>
            {routingService === 'graphhopper' && <div className="api-key-input"><label>🔑 API Key: <a href="https://graphhopper.com/#start-api-and-routing" target="_blank" rel="noopener noreferrer" className="api-key-link">Ottieni gratis →</a></label><input id="gh-api-key" type="text" value={graphhopperApiKey} onChange={(e) => setGraphhopperApiKey(e.target.value)} placeholder="Incolla API key..." />{!graphhopperApiKey && <p className="api-key-warning">⚠️ Senza API key userà linee rette</p>}</div>}
          </div>
          <div className="waypoints-list">
            {waypoints.map((wp, index) => (<div key={wp.id} className={`waypoint-item ${draggedIndex === index ? 'dragging' : ''}`} style={{ borderLeftColor: WAYPOINT_COLORS[index % WAYPOINT_COLORS.length] }} draggable onDragStart={(e) => handleDragStart(e, index)} onDragOver={handleDragOver} onDragEnter={handleDragEnter} onDragEnd={handleDragEnd} onDrop={(e) => handleDrop(e, index)}><div className="waypoint-header"><span className="waypoint-drag-handle">⋮⋮</span><span className="waypoint-number" style={{ backgroundColor: WAYPOINT_COLORS[index % WAYPOINT_COLORS.length] }}>{index + 1}</span><input type="text" className="waypoint-name" value={wp.name} onChange={(e) => updateWaypoint(wp.id, 'name', e.target.value)} placeholder="Nome tappa" /><button className="waypoint-remove" onClick={() => removeWaypoint(wp.id)}>✕</button></div><div className="waypoint-coords"><input type="text" placeholder="Lat" value={wp.lat} onChange={(e) => updateWaypoint(wp.id, 'lat', e.target.value)} /><input type="text" placeholder="Lng" value={wp.lng} onChange={(e) => updateWaypoint(wp.id, 'lng', e.target.value)} /></div>{index > 0 && segments[index - 1] && <div className="segment-distance">← {segments[index - 1]} km</div>}</div>))}
          </div>
          <button className="add-waypoint-btn" onClick={addWaypoint}>➕ Aggiungi Tappa</button>
          <div className="route-actions">
            <button className="calc-btn" onClick={calculateMultiRoute} disabled={isCalculating}>{isCalculating ? '⏳ Calcolo...' : `🚶 Calcola (${ROUTING_SERVICES[routingService]?.name || routingService})`}</button>
            {waypoints.length > 0 && <button className="clear-btn" onClick={clearAllWaypoints}>🗑️ Svuota</button>}
          </div>
          {distance && <div className="distance-result"><strong>Distanza Totale: {distance} km</strong>{loadingElevation && <div className="elevation-loading">📊 Calcolo dislivelli...</div>}{elevationData && !loadingElevation && <div className="elevation-stats"><div className="elevation-item ascent">⬆️ Salita: <strong>{elevationData.ascent} m</strong></div><div className="elevation-item descent">⬇️ Discesa: <strong>{elevationData.descent} m</strong></div><div className="elevation-range">📍 Altitudine: {elevationData.minElevation}m - {elevationData.maxElevation}m</div><button className="show-profile-btn" onClick={() => setShowRouteProfile(!showRouteProfile)}>{showRouteProfile ? '📍 Nascondi' : '📊 Mostra profilo'}</button><button className="save-route-btn" onClick={handleSaveRoute}>💾 Salva</button></div>}</div>}
        </CollapsibleSection>

        {savedRoutes.length > 0 && <CollapsibleSection id="savedRoutes" title={`📁 Itinerari Salvati (${savedRoutes.length})`} defaultOpen={false}>
          <div className="saved-routes-header"><div className="sort-buttons"><button className={`sort-btn ${sortBy === 'name' ? 'active' : ''}`} onClick={() => toggleSort('name')}>📝 A-Z {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}</button><button className={`sort-btn ${sortBy === 'date' ? 'active' : ''}`} onClick={() => toggleSort('date')}>📅 Data {sortBy === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}</button></div></div>
          <div className="routes-list">
            {getSortedRoutes().map(route => { const isLoaded = loadedRouteIds.includes(route.id); return (<div key={route.id} className={`route-item ${isLoaded ? 'loaded' : ''}`}><div className="route-info"><strong>{isLoaded ? '✅ ' : ''}{route.name}</strong><small>{route.distance ? `${route.distance} km` : ''}{route.elevation ? ' 📊' : ''} • {new Date(route.createdAt || route.created_at).toLocaleDateString()}</small></div><div className="route-actions"><button className={`small-btn ${isLoaded ? 'loaded-btn' : ''}`} onClick={() => toggleLoadRoute(route)}>{isLoaded ? '✓ Sovrapposto' : '+ Aggiungi'}</button><button className="small-btn edit-btn" onClick={() => handleLoadRoute(route)}>✏️ Modifica</button><button className="small-btn" onClick={() => handleExportRoute(route)}>📥</button><button className="small-btn danger" onClick={() => handleDeleteRoute(route)}>🗑️</button></div></div>) })}
          </div>
          {loadedRoutes.length > 0 && <div><div className="clear-loaded-routes-bar"><span>{loadedRoutes.length} itinerari sovrapposti</span><button className="clear-loaded-btn" onClick={clearLoadedRoutes}>✕ Rimuovi tutti</button></div><button className="toggle-loaded-profile-btn" onClick={() => setShowLoadedProfile(!showLoadedProfile)}>{showLoadedProfile ? '📍 Nascondi profili' : '📊 Mostra profili'}</button>
            {showLoadedProfile && loadedRoutes.length > 0 && <div className="loaded-profiles-container"><div className="profile-tabs">{loadedRoutes.map((route) => (<button key={route.id} className={`profile-tab ${activeProfileTab === `route_${route.id}` ? 'active' : ''}`} onClick={() => setActiveProfileTab(`route_${route.id}`)}><span className="tab-color-indicator" style={{ backgroundColor: route.color }} /><span className="tab-name" title={route.name}>{route.name}</span></button>))}</div>{activeProfileTab && <LoadRouteProfile route={loadedRoutes.find(r => `route_${r.id}` === activeProfileTab)} selectedIndex={loadedTrackHoverIndex} onHover={(index, routeId) => { setLoadedTrackHoverIndex(index); setHoveredLoadedRouteId(routeId) }} onHoverEnd={() => { setLoadedTrackHoverIndex(null); setHoveredLoadedRouteId(null) }} />}</div>}
          </div>}
        </CollapsibleSection>}

        <CollapsibleSection id="poi" title="🔍 Luoghi lungo il percorso" defaultOpen={true}>
          <div className="poi-filters">
            <div className="poi-filter-row"><label>Raggio:</label><select value={poiSearchRadius} onChange={e => setPoiSearchRadius(Number(e.target.value))}><option value={500}>500m</option><option value={1000}>1 km</option><option value={2000}>2 km</option><option value={5000}>5 km</option></select></div>
            <div className="poi-categories">
              {[['hotels','🏨 Hotel'],['guesthouses','🏠 Guest'],['hostels','🛏️ Ostelli'],['campsites','⛺ Campeggi'],['restaurants','🍽️ Ristoranti'],['cafes','☕ Cafè'],['shelters','🏔️ Rifugi']].map(([key, label]) => (<label key={key} className="poi-checkbox"><input type="checkbox" checked={poiFilter[key]} onChange={() => setPoiFilter(p => ({ ...p, [key]: !p[key] }))} />{label}</label>))}
            </div>
            <button className="search-poi-btn" onClick={searchPois} disabled={isSearchingPois}>{isSearchingPois ? '⏳ Ricerca...' : '🔍 Cerca luoghi'}</button>
          </div>
          {showPois && Object.keys(poiGroupedByCategory).length > 0 && <div className="poi-results">
            <div className="poi-results-header">
              <span>📍 {Object.values(poiGroupedByCategory).flat().length} luoghi</span>
              <button className="close-poi-btn" onClick={() => { setShowPois(false); setSelectedPoi(null) }}>✕</button>
            </div>
            {selectedPoi && <button className="clear-poi-btn" onClick={() => setSelectedPoi(null)}>✕ Rimuovi: {selectedPoi.icon} {selectedPoi.name}</button>}
            
            <div className="poi-sort-controls">
              <label>Ordina:</label>
              <select value={poiSortBy} onChange={e => setPoiSortBy(e.target.value)}>
                <option value="distance">Distanza</option>
                <option value="name">Nome</option>
                <option value="category">Categoria</option>
              </select>
              <label className="show-all-label">
                <input type="checkbox" checked={showAllPois} onChange={() => setShowAllPois(!showAllPois)} />
                Visualizza tutti
              </label>
            </div>
            
            <div className="poi-grouped-list">
              {Object.entries(poiGroupedByCategory).map(([category, categoryPois]) => (
                showAllPois || categoryPois.some(p => selectedPoi?.id === p.id) ? (
                  <div key={category} className="poi-category-group">
                    <h5>{category} ({categoryPois.length})</h5>
                    <div className="poi-list">
                      {categoryPois.map(poi => (<div key={poi.id} className={`poi-item ${selectedPoi?.id === poi.id ? 'active' : ''}`} onClick={() => setSelectedPoi(poi)}><span className="poi-icon">{poi.icon}</span><div className="poi-info"><strong>{poi.name}</strong><small>{poi.type} • {poi.distance < 100 ? `${Math.round(poi.distance)}m` : `${(poi.distance / 1000).toFixed(1)}km`}</small></div></div>))}
                    </div>
                  </div>
                ) : null
              ))}
            </div>
          </div>}
        </CollapsibleSection>

        {message && <div className={`message ${message.type}`}>{message.text}</div>}
      </div>}
    </div>
  )
}

function LoadRouteProfile({ route, onHover, onHoverEnd, selectedIndex }) {
  const [profileGPX, setProfileGPX] = useState(null)
  useEffect(() => {
    if (route?.coordinates && route.elevation?.length > 0) {
      let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1">\n<trk>\n<trkseg>\n'
      route.elevation.forEach((ele, i) => { const c = route.coordinates[Math.floor((i / (route.elevation.length - 1)) * (route.coordinates.length - 1))] || route.coordinates[0]; if (c) gpx += `    <trkpt lat="${c[0]?.toFixed(6)}" lon="${c[1]?.toFixed(6)}"><ele>${ele?.toFixed(2)}</ele></trkpt>\n` })
      setProfileGPX(gpx + '</trkseg>\n</trk>\n</gpx>')
    }
  }, [route])
  if (!profileGPX) return <div className="loaded-profile-placeholder"><p>Profilo non disponibile</p></div>
  return (<div className="loaded-profile-container"><ElevationProfile gpxContent={profileGPX} trackName={route.name} selectedIndex={selectedIndex || null} onHover={onHover} /></div>)
}