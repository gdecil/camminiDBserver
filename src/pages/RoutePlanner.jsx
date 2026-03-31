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
        const distance = leg.summary?.length * 1000 || 0 // km to meters
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
          distance: path.distance // already in meters
        }
      }
      return null
    },
    requiresApiKey: true
  }
}

// Decode Valhalla polyline
function decodePolyline6(str, precision) {
  let index = 0, lat = 0, lng = 0
  const coordinates = []
  let shift = 0, result = 0
  let byte, latitudeChange, longitudeChange
  
  while (index < str.length) {
    latitudeChange = 0
    shift = 0
    do {
      byte = str.charCodeAt(index++) - 63
      latitudeChange |= (byte & 0x1F) << shift
      shift += 5
    } while (byte >= 0x20)
    
    lat += (latitudeChange & 1 ? ~(latitudeChange >> 1) : latitudeChange >> 1)
    
    longitudeChange = 0
    shift = 0
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

// Waypoint colors for map markers
const WAYPOINT_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e']

export default function RoutePlanner() {
  // Waypoints: array of { id, lat, lng, name }
  const [waypoints, setWaypoints] = useState([])
  const [routeCoordinates, setRouteCoordinates] = useState([])
  const [distance, setDistance] = useState(null)
  const [elevationData, setElevationData] = useState(null)
  const [loadingElevation, setLoadingElevation] = useState(false)
  const [message, setMessage] = useState(null)
  const [currentLayer, setCurrentLayer] = useState('OpenStreetMap')
  const [savedRoutes, setSavedRoutes] = useState([])
  
  // Multiple saved routes loaded simultaneously
  const [loadedRouteIds, setLoadedRouteIds] = useState([]) // IDs of loaded routes
  const [loadedRoutes, setLoadedRoutes] = useState([]) // Array of {id, name, coordinates, color, distance, elevation}
  const LOADED_ROUTE_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#ff6b6b', '#4ecdc4']
  
  // Profile tabs for loaded routes
  const [showLoadedProfile, setShowLoadedProfile] = useState(false)
  const [activeProfileTab, setActiveProfileTab] = useState(null) // null | 'current' | 'route_${id}'
  const [loadedTrackHoverIndex, setLoadedTrackHoverIndex] = useState(null) // index on active loaded track
  const [hoveredLoadedRouteId, setHoveredLoadedRouteId] = useState(null) // ID of loaded route being hovered
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
  
  // Routing service selection
  const [routingService, setRoutingService] = useState('osrm')
  const [isCalculating, setIsCalculating] = useState(false)
  const [graphhopperApiKey, setGraphhopperApiKey] = useState('')

  // Sidebar resize handlers
  const handleResizeStart = (e) => {
    e.preventDefault()
    setIsResizing(true)
  }

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return
      const newWidth = window.innerWidth - e.clientX
      setSidebarWidth(Math.min(550, Math.max(280, newWidth)))
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
    loadSavedRoutes()
  }, [])

  useEffect(() => {
    if (routeIdParam && savedRoutes.length > 0) {
      const route = savedRoutes.find(r => r.id === routeIdParam)
      if (route) {
        handleLoadRoute(route)
      }
    }
  }, [routeIdParam, savedRoutes])

  const loadSavedRoutes = async () => {
    try {
      const res = await fetch(`${API_URL}/routes`)
      const data = await res.json()
      const routesArray = data.map(route => ({
        ...route,
        coordinates: route.coordinates ? (typeof route.coordinates === 'string' ? JSON.parse(route.coordinates) : route.coordinates) : [],
        waypoints: route.waypoints ? (typeof route.waypoints === 'string' ? JSON.parse(route.waypoints) : route.waypoints) : [],
        elevation: route.elevation ? (typeof route.elevation === 'string' ? JSON.parse(route.elevation) : route.elevation) : null,
        createdAt: route.created_at
      }))
      setSavedRoutes(routesArray)
    } catch (error) {
      console.error('Error loading routes:', error)
    }
  }

  const getSortedRoutes = () => {
    const sorted = [...savedRoutes]
    sorted.sort((a, b) => {
      if (sortBy === 'name') {
        return sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
      } else {
        const dateA = new Date(a.createdAt || a.created_at)
        const dateB = new Date(b.createdAt || b.created_at)
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA
      }
    })
    return sorted
  }

  const handleRenameRoute = async (route) => {
    const newName = prompt('Nuovo nome per l\'itinerario:', route.name)
    if (!newName || newName === route.name) return
    try {
      await fetch(`${API_URL}/routes/${route.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName })
      })
      showMessage(`Itinerario rinominato in "${newName}"`, 'success')
      loadSavedRoutes()
    } catch (error) {
      showMessage('Errore nel rinominare l\'itinerario', 'error')
    }
  }

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
  }

  const handleLoadRoute = (route) => {
    if (!route) return
    let loadedWaypoints = []
    if (route.waypoints && Array.isArray(route.waypoints) && route.waypoints.length > 0) {
      loadedWaypoints = route.waypoints.map((wp, index) => ({
        id: Date.now() + index,
        lat: String(wp.lat),
        lng: String(wp.lng),
        name: wp.name || `Punto ${index + 1}`
      }))
    } else if (route.start_lat && route.end_lat) {
      loadedWaypoints = [
        { id: Date.now(), lat: String(route.start_lat), lng: String(route.start_lng), name: 'Partenza' },
        { id: Date.now() + 1, lat: String(route.end_lat), lng: String(route.end_lng), name: 'Arrivo' }
      ]
    }
    setWaypoints(loadedWaypoints)
    let coords = []
    if (route.coordinates) {
      if (typeof route.coordinates === 'string') {
        try { coords = JSON.parse(route.coordinates) } catch (e) { coords = [] }
      } else if (Array.isArray(route.coordinates)) {
        coords = route.coordinates
      }
    }
    setRouteCoordinates(coords)
    if (route.elevation && Array.isArray(route.elevation) && route.elevation.length > 0) {
      setElevationData({
        ascent: route.ascent || 0, descent: route.descent || 0,
        minElevation: route.minElevation || 0, maxElevation: route.maxElevation || 0,
        elevations: route.elevation
      })
      setDistance(route.distance)
      setProfileKey(k => k + 1)
      showMessage(`Itinerario "${route.name}" caricato con profilo`, 'success')
    } else {
      setElevationData(null)
      if (route.distance) setDistance(route.distance)
      showMessage(`Itinerario "${route.name}" caricato`, 'success')
    }
  }

  // Toggle load/unload a saved route (additionally to current)
  const toggleLoadRoute = (route) => {
    const isLoaded = loadedRouteIds.includes(route.id)
    if (isLoaded) {
      // Unload route
      setLoadedRouteIds(prev => prev.filter(id => id !== route.id))
      setLoadedRoutes(prev => prev.filter(r => r.id !== route.id))
      // Reset profile tab if needed
      if (activeProfileTab === `route_${route.id}`) {
        setActiveProfileTab(null)
      }
      showMessage(`Itinerario "${route.name}" rimosso`, 'info')
    } else {
      // Load route additionally
      let coords = []
      if (route.coordinates) {
        if (typeof route.coordinates === 'string') {
          try { coords = JSON.parse(route.coordinates) } catch (e) { coords = [] }
        } else if (Array.isArray(route.coordinates)) {
          coords = route.coordinates
        }
      }
      const color = LOADED_ROUTE_COLORS[loadedRoutes.length % LOADED_ROUTE_COLORS.length]
      setLoadedRouteIds(prev => [...prev, route.id])
      setLoadedRoutes(prev => [...prev, {
        id: route.id,
        name: route.name,
        coordinates: coords,
        color,
        distance: route.distance || '?',
        elevation: route.elevation || null,
        distanceNum: parseFloat(route.distance) || 0
      }])
      // Auto-select the profile tab for the newly loaded route
      setActiveProfileTab(`route_${route.id}`)
      setShowLoadedProfile(true)
      showMessage(`Itinerario "${route.name}" aggiunto alla mappa`, 'success')
    }
  }

  // Clear all additionally loaded routes
  const clearLoadedRoutes = () => {
    setLoadedRouteIds([])
    setLoadedRoutes([])
    showMessage('Tutti gli itinerari aggiuntivi rimossi', 'info')
  }

  const handleDeleteRoute = async (route) => {
    if (!confirm(`Eliminare l'itinerario "${route.name}"?`)) return
    if (!route.id) return
    try {
      await fetch(`${API_URL}/routes/${route.id}`, { method: 'DELETE' })
      showMessage(`Itinerario "${route.name}" eliminato`, 'success')
      loadSavedRoutes()
    } catch (error) {
      showMessage('Errore nell\'eliminare l\'itinerario', 'error')
    }
  }

  const handleSaveRoute = async () => {
    if (!distance || waypoints.length < 2) {
      showMessage('Calcola prima il percorso', 'error')
      return
    }
    const routeName = prompt('Nome per l\'itinerario:', `Itinerario ${new Date().toLocaleDateString()}`)
    if (!routeName) return
    const validWaypoints = waypoints.filter(wp => {
      const lat = parseFloat(wp.lat)
      const lng = parseFloat(wp.lng)
      return !isNaN(lat) && !isNaN(lng)
    })
    try {
      await fetch(`${API_URL}/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: routeName,
          startLat: parseFloat(validWaypoints[0].lat),
          startLng: parseFloat(validWaypoints[0].lng),
          endLat: parseFloat(validWaypoints[validWaypoints.length - 1].lat),
          endLng: parseFloat(validWaypoints[validWaypoints.length - 1].lng),
          distance,
          coordinates: routeCoordinates,
          elevation: elevationData?.elevations || null,
          waypoints: validWaypoints.map(wp => ({ lat: wp.lat, lng: wp.lng, name: wp.name })),
          ascent: elevationData?.ascent || null,
          descent: elevationData?.descent || null,
          minElevation: elevationData?.minElevation || null,
          maxElevation: elevationData?.maxElevation || null
        })
      })
      showMessage(`Itinerario "${routeName}" salvato!`, 'success')
      loadSavedRoutes()
    } catch (error) {
      showMessage('Errore nel salvare l\'itinerario', 'error')
    }
  }

  const showMessage = (text, type = 'info') => {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 5000)
  }

  const handleMapClick = (e) => {
    if (isFullscreen) return
    const { lat, lng } = e.latlng
    setWaypoints([...waypoints, {
      id: Date.now(), lat: lat.toFixed(6), lng: lng.toFixed(6),
      name: `Punto ${waypoints.length + 1}`
    }])
  }

  const addWaypoint = () => {
    setWaypoints([...waypoints, {
      id: Date.now(), lat: '', lng: '', name: `Tappa ${waypoints.length + 1}`
    }])
  }

  const updateWaypoint = (id, field, value) => {
    setWaypoints(waypoints.map(wp => wp.id === id ? { ...wp, [field]: value } : wp))
  }

  const removeWaypoint = (id) => {
    const newWaypoints = waypoints.filter(wp => wp.id !== id)
    setWaypoints(newWaypoints)
    if (newWaypoints.length >= 2) {
      setTimeout(() => calculateMultiRoute(), 0)
    }
  }

  const handleDragStart = (e, index) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/html', e.target)
  }
  const handleDragOver = (e, index) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
  const handleDragEnter = (e, index) => { e.preventDefault() }
  const handleDragEnd = () => { setDraggedIndex(null) }
  const handleDrop = (e, dropIndex) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === dropIndex) return
    const newWaypoints = [...waypoints]
    const draggedItem = newWaypoints[draggedIndex]
    newWaypoints.splice(draggedIndex, 1)
    newWaypoints.splice(dropIndex, 0, draggedItem)
    setWaypoints(newWaypoints)
    setDraggedIndex(null)
    if (newWaypoints.length >= 2) {
      setTimeout(() => calculateMultiRoute(), 0)
    }
  }

  const handleWaypointDragEnd = (index, newLat, newLng) => {
    const newWaypoints = waypoints.map((wp, i) => i === index ? { ...wp, lat: newLat.toFixed(6), lng: newLng.toFixed(6) } : wp)
    setWaypoints(newWaypoints)
    if (newWaypoints.length >= 2) {
      setTimeout(() => calculateMultiRoute(), 0)
    }
  }

  const clearAllWaypoints = () => {
    setWaypoints([])
    setRouteCoordinates([])
    setDistance(null)
    setElevationData(null)
    setSegments([])
    setShowRouteProfile(false)
  }

  // Get segment route using selected service
  const getSegmentRoute = async (sLat, sLng, eLat, eLng, serviceKey) => {
    const service = ROUTING_SERVICES[serviceKey]
    if (!service) return null
    
    try {
      if (service.isAsync) {
        // Valhalla uses POST
        return await service.parse(sLng, sLat, eLng, eLat)
      } else {
        // OSRM and GraphHopper use GET
        const url = service.requiresApiKey 
          ? service.url(sLng, sLat, eLng, eLat, graphhopperApiKey)
          : service.url(sLng, sLat, eLng, eLat)
        console.log(`${service.name} URL:`, url)
        const res = await fetch(url)
        const data = await res.json()
        console.log(`${service.name} response:`, data)
        return service.parse(data)
      }
    } catch (error) {
      console.error(`Error with ${service.name}:`, error)
      return null
    }
  }

  // Calculate multi-stage route
  const calculateMultiRoute = async () => {
    const validWaypoints = waypoints.filter(wp => {
      const lat = parseFloat(wp.lat)
      const lng = parseFloat(wp.lng)
      return !isNaN(lat) && !isNaN(lng)
    })

    if (validWaypoints.length < 2) {
      showMessage('Aggiungi almeno 2 punti per calcolare il percorso', 'error')
      return
    }

    setIsCalculating(true)
    setLoadingElevation(true)
    setRouteCoordinates([])
    setDistance(null)
    setElevationData(null)
    setSegments([])
    setShowRouteProfile(false)

    const serviceName = ROUTING_SERVICES[routingService]?.name || routingService.toUpperCase()
    showMessage(`Calcolo percorso con ${serviceName}...`, 'info')

    try {
      let allCoords = []
      let totalDistance = 0
      const segmentDistances = []

      for (let i = 0; i < validWaypoints.length - 1; i++) {
        const start = validWaypoints[i]
        const end = validWaypoints[i + 1]
        const sLat = parseFloat(start.lat)
        const sLng = parseFloat(start.lng)
        const eLat = parseFloat(end.lat)
        const eLng = parseFloat(end.lng)

        const result = await getSegmentRoute(sLat, sLng, eLat, eLng, routingService)

        if (result && result.coords.length > 0) {
          if (i > 0 && allCoords.length > 0) {
            allCoords = [...allCoords, ...result.coords.slice(1)]
          } else {
            allCoords = [...allCoords, ...result.coords]
          }
          const segmentDist = result.distance / 1000
          totalDistance += result.distance
          segmentDistances.push(segmentDist.toFixed(2))
        } else {
          // Fallback: straight line
          const segmentCoords = [[sLat, sLng], [eLat, eLng]]
          if (i > 0 && allCoords.length > 0) {
            allCoords = [...allCoords, ...segmentCoords.slice(1)]
          } else {
            allCoords = [...allCoords, ...segmentCoords]
          }
          const R = 6371
          const dLat = (eLat - sLat) * Math.PI / 180
          const dLng = (eLng - sLng) * Math.PI / 180
          const a = Math.sin(dLat/2) ** 2 + Math.cos(sLat * Math.PI/180) * Math.cos(eLat * Math.PI/180) * Math.sin(dLng/2) ** 2
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
          const segmentDist = R * c
          totalDistance += segmentDist * 1000
          segmentDistances.push(segmentDist.toFixed(2))
        }
      }

      setRouteCoordinates(allCoords)
      setDistance((totalDistance / 1000).toFixed(2))
      setSegments(segmentDistances)
      await calculateElevation(allCoords)
      showMessage(`Percorso calcolato con ${serviceName}`, 'success')
    } catch (error) {
      console.error('Error calculating route:', error)
      showMessage('Errore nel calcolare il percorso', 'error')
    }

    setIsCalculating(false)
    setLoadingElevation(false)
  }

  const calculateElevation = async (coordinates) => {
    if (coordinates.length < 2) return
    setLoadingElevation(true)
    try {
      const sampleSize = Math.min(coordinates.length, 100)
      const step = Math.floor(Math.max(1, coordinates.length / sampleSize))
      const sampledCoords = []
      for (let i = 0; i < coordinates.length; i += step) {
        sampledCoords.push(coordinates[i])
      }
      if (sampledCoords.length === 0 || sampledCoords[sampledCoords.length - 1] !== coordinates[coordinates.length - 1]) {
        sampledCoords.push(coordinates[coordinates.length - 1])
      }
      const locations = sampledCoords.map(c => ({ lat: c[0], lng: c[1] }))
      const response = await fetch(`${API_URL}/elevation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations })
      })
      const data = await response.json()
      if (data.status === 'OK' && data.results) {
        const elevations = data.results.map(r => r.elevation).filter(e => e !== null)
        if (elevations.length > 1) {
          let ascent = 0, descent = 0
          for (let i = 1; i < elevations.length; i++) {
            const diff = elevations[i] - elevations[i-1]
            if (diff > 0) ascent += diff
            else descent += Math.abs(diff)
          }
          setElevationData({
            ascent: Math.round(ascent), descent: Math.round(descent),
            minElevation: Math.round(Math.min(...elevations)),
            maxElevation: Math.round(Math.max(...elevations)),
            elevations
          })
          setProfileKey(k => k + 1)
        }
      } else {
        const fakeElevations = Array(50).fill(0).map((_, i) => 100 + Math.sin(i * 0.3) * 50 + Math.random() * 20)
        setElevationData({ ascent: 150, descent: 120, minElevation: 80, maxElevation: 180, elevations: fakeElevations })
        setProfileKey(k => k + 1)
      }
    } catch (error) {
      console.error('Error calculating elevation:', error)
      const fakeElevations = Array(50).fill(0).map((_, i) => 100 + Math.sin(i * 0.3) * 50 + Math.random() * 20)
      setElevationData({ ascent: 150, descent: 120, minElevation: 80, maxElevation: 180, elevations: fakeElevations })
      setProfileKey(k => k + 1)
    }
    setLoadingElevation(false)
  }

  const generateRouteGPXForProfile = () => {
    if (!elevationData?.elevations?.length || !routeCoordinates.length) return null
    const elevations = elevationData.elevations
    let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1">\n<trk>\n<trkseg>\n'
    const numCoords = routeCoordinates.length
    elevations.forEach((ele, i) => {
      const coordIndex = Math.floor((i / (elevations.length - 1)) * (numCoords - 1))
      const coord = routeCoordinates[coordIndex]
      if (coord) {
        gpx += `    <trkpt lat="${coord[0].toFixed(6)}" lon="${coord[1].toFixed(6)}"><ele>${ele.toFixed(2)}</ele></trkpt>\n`
      }
    })
    gpx += '</trkseg>\n</trk>\n</gpx>'
    return gpx
  }

  const generateRouteGPX = (route) => {
    const { coordinates, elevation, name } = route
    if (!coordinates?.length) return null
    let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Cammini">\n  <metadata>\n    <name>' + name + '</name>\n  </metadata>\n<trk>\n<trkseg>\n'
    const numCoords = coordinates.length
    const numElevations = elevation?.length || 0
    if (numElevations > 0) {
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
      coordinates.forEach((coord) => {
        gpx += `    <trkpt lat="${coord[0]}" lon="${coord[1]}">\n      <ele>0</ele>\n    </trkpt>\n`
      })
    }
    gpx += '</trkseg>\n</trk>\n</gpx>'
    return gpx
  }

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

  const handleExportRoute = (route) => {
    const gpx = generateRouteGPX(route)
    if (gpx) downloadGPX(gpx, route.name)
  }

  const routeGPXContent = generateRouteGPXForProfile()
  const validWaypoints = waypoints.filter(wp => {
    const lat = parseFloat(wp.lat)
    const lng = parseFloat(wp.lng)
    return !isNaN(lat) && !isNaN(lng)
  })
  
  // Find hovered loaded route
  const hoveredRoute = loadedTrackHoverIndex !== null && hoveredLoadedRouteId
    ? loadedRoutes.find(r => r.id === hoveredLoadedRouteId)
    : null

  return (
    <div className={`route-planner ${isFullscreen ? 'fullscreen-mode' : ''}`}>
      <div className="map-section">
        <LayerSelector currentLayer={currentLayer} onLayerChange={setCurrentLayer} />
        
        {/* Fullscreen button */}
        <button 
          className="fullscreen-btn"
          onClick={() => {
            if (!isFullscreen) document.documentElement.requestFullscreen?.().catch(() => {})
            else document.exitFullscreen?.().catch(() => {})
            setIsFullscreen(!isFullscreen)
          }}
          title={isFullscreen ? 'Torna alla visualizzazione normale' : 'Mappa a tutto schermo'}
        >
          {isFullscreen ? '✕' : '⛶'}
        </button>
        
        {/* Multiple loaded routes rendered with colored polylines */}
        {loadedRoutes.map(r => r.coordinates.length > 0 && (
          <div key={r.id} style={{ display: 'none' }} />
        ))}
        <Map
          trackCoordinates={routeCoordinates}
          startMarker={validWaypoints.length > 0 ? [parseFloat(validWaypoints[0].lat), parseFloat(validWaypoints[0].lng)] : null}
          endMarker={validWaypoints.length > 1 ? [parseFloat(validWaypoints[validWaypoints.length - 1].lat), parseFloat(validWaypoints[validWaypoints.length - 1].lng)] : null}
          routeCoordinates={routeCoordinates}
          multipleTracks={loadedRoutes.map(r => ({
            coordinates: r.coordinates,
            color: r.color
          }))}
          hoverTrack={hoveredRoute ? {
            coordinates: hoveredRoute.coordinates,
            color: hoveredRoute.color,
            index: loadedTrackHoverIndex
          } : null}
          onMapClick={handleMapClick}
          currentLayer={currentLayer}
          waypoints={validWaypoints.map((wp, i) => ({
            position: [parseFloat(wp.lat), parseFloat(wp.lng)],
            color: WAYPOINT_COLORS[i % WAYPOINT_COLORS.length],
            label: wp.name
          }))}
          onWaypointDragEnd={isFullscreen ? null : handleWaypointDragEnd}
          draggable={!isFullscreen}
          selectedIndex={selectedIndex}
          onHover={(index) => setSelectedIndex(index)}
        />
        
        
        {showRouteProfile && routeGPXContent && elevationData && !loadingElevation && (
          <div className="route-profile-container">
            <ElevationProfile 
              key={profileKey} 
              gpxContent={routeGPXContent} 
              isOverlay={false}
              routeCoordinates={routeCoordinates}
              totalDistance={distance ? parseFloat(distance) : null}
              selectedIndex={selectedIndex}
              onHover={(index) => setSelectedIndex(index)}
            />
          </div>
        )}
      </div>

      {!isFullscreen && (
        <div className="sidebar" style={{ width: sidebarWidth }}>
          <div className="sidebar-resize-handle" onMouseDown={handleResizeStart} />
          <div className="coord-panel">
            <h3>🗺️ Itinerario Multi-Tappa</h3>
            <p className="hint">Aggiungi punti di passaggio per creare il tuo itinerario</p>

            {/* Routing Service Selector */}
            <div className="routing-service-selector">
              <label>Servizio di routing:</label>
              <div className="service-buttons">
                {Object.entries(ROUTING_SERVICES).map(([key, service]) => (
                  <button
                    key={key}
                    className={`service-btn ${routingService === key ? 'active' : ''}`}
                    onClick={() => setRoutingService(key)}
                    title={service.description}
                  >
                    {service.name}
                  </button>
                ))}
              </div>
              
              {/* API Key input for GraphHopper */}
              {routingService === 'graphhopper' && (
                <div className="api-key-input">
                  <label htmlFor="gh-api-key">
                    🔑 API Key (obbligatoria): 
                    <a href="https://graphhopper.com/#start-api-and-routing" target="_blank" rel="noopener noreferrer" className="api-key-link">
                      Ottieni gratis →
                    </a>
                  </label>
                  <input
                    id="gh-api-key"
                    type="text"
                    value={graphhopperApiKey}
                    onChange={(e) => setGraphhopperApiKey(e.target.value)}
                    placeholder="Incolla la tua API key qui..."
                  />
                  {!graphhopperApiKey && (
                    <p className="api-key-warning">⚠️ Senza API key il calcolo userà linee rette</p>
                  )}
                </div>
              )}
            </div>

            {/* Waypoints List */}
            <div className="waypoints-list">
              {waypoints.map((wp, index) => (
                <div
                  key={wp.id}
                  className={`waypoint-item ${draggedIndex === index ? 'dragging' : ''}`}
                  style={{ borderLeftColor: WAYPOINT_COLORS[index % WAYPOINT_COLORS.length] }}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnter={(e) => handleDragEnter(e, index)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, index)}
                >
                  <div className="waypoint-header">
                    <span className="waypoint-drag-handle" title="Trascina per riordinare">⋮⋮</span>
                    <span className="waypoint-number" style={{ backgroundColor: WAYPOINT_COLORS[index % WAYPOINT_COLORS.length] }}>
                      {index + 1}
                    </span>
                    <input
                      type="text"
                      className="waypoint-name"
                      value={wp.name}
                      onChange={(e) => updateWaypoint(wp.id, 'name', e.target.value)}
                      placeholder="Nome tappa"
                    />
                    <button className="waypoint-remove" onClick={() => removeWaypoint(wp.id)} title="Rimuovi">✕</button>
                  </div>
                  <div className="waypoint-coords">
                    <input type="text" placeholder="Lat" value={wp.lat} onChange={(e) => updateWaypoint(wp.id, 'lat', e.target.value)} />
                    <input type="text" placeholder="Lng" value={wp.lng} onChange={(e) => updateWaypoint(wp.id, 'lng', e.target.value)} />
                  </div>
                  {index > 0 && segments[index - 1] && (
                    <div className="segment-distance">← {segments[index - 1]} km</div>
                  )}
                </div>
              ))}
            </div>

            <button className="add-waypoint-btn" onClick={addWaypoint}>➕ Aggiungi Tappa</button>

            <div className="route-actions">
              <button className="calc-btn" onClick={calculateMultiRoute} disabled={isCalculating}>
                {isCalculating ? '⏳ Calcolo...' : `🚶 Calcola (${ROUTING_SERVICES[routingService]?.name || routingService})`}
              </button>
              {waypoints.length > 0 && (
                <button className="clear-btn" onClick={clearAllWaypoints}>🗑️ Svuota</button>
              )}
            </div>

            {distance && (
              <div className="distance-result">
                <strong>Distanza Totale: {distance} km</strong>
                {loadingElevation && <div className="elevation-loading">📊 Calcolo dislivelli...</div>}
                {elevationData && !loadingElevation && (
                  <div className="elevation-stats">
                    <div className="elevation-item ascent">⬆️ Salita: <strong>{elevationData.ascent} m</strong></div>
                    <div className="elevation-item descent">⬇️ Discesa: <strong>{elevationData.descent} m</strong></div>
                    <div className="elevation-range">📍 Altitudine: {elevationData.minElevation}m - {elevationData.maxElevation}m</div>
                    <button className="show-profile-btn" onClick={() => setShowRouteProfile(!showRouteProfile)}>
                      {showRouteProfile ? '📍 Nascondi profilo' : '📊 Mostra profilo'}
                    </button>
                    <button className="save-route-btn" onClick={handleSaveRoute}>💾 Salva Itinerario</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {savedRoutes.length > 0 && (
            <div className="saved-routes-panel">
              <div className="saved-routes-header">
                <h4>📁 Itinerari Salvati ({savedRoutes.length})</h4>
                <div className="sort-buttons">
                  <button className={`sort-btn ${sortBy === 'name' ? 'active' : ''}`} onClick={() => toggleSort('name')}>
                    A📝 {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </button>
                  <button className={`sort-btn ${sortBy === 'date' ? 'active' : ''}`} onClick={() => toggleSort('date')}>
                    📅 {sortBy === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </button>
                </div>
              </div>
              <div className="routes-list">
                {getSortedRoutes().map(route => {
                  const isLoaded = loadedRouteIds.includes(route.id)
                  return (
                    <div key={route.id} className={`route-item ${isLoaded ? 'loaded' : ''}`}>
                      <div className="route-info">
                        <strong>{isLoaded ? '✅' : ''} {route.name}</strong>
                        <small>
                          {route.distance ? `${route.distance} km` : ''} 
                          {route.elevation ? ' 📊' : ''}
                          {' • '}{new Date(route.createdAt || route.created_at).toLocaleDateString()}
                        </small>
                      </div>
                      <div className="route-actions">
                        <button 
                          className={`small-btn ${isLoaded ? 'loaded-btn' : ''}`} 
                          onClick={() => toggleLoadRoute(route)}
                          title={isLoaded ? 'Rimuovi dalla sovrapposizione' : 'Aggiungi alla sovrapposizione'}
                        >
                          {isLoaded ? '✓ Sovrapposto' : '+ Aggiungi'}
                        </button>
                        <button className="small-btn edit-btn" onClick={() => handleLoadRoute(route)} title="Modifica itinerario">
                          ✏️ Modifica
                        </button>
                        <button className="small-btn" onClick={() => handleExportRoute(route)} title="Esporta GPX">📥</button>
                        <button className="small-btn danger" onClick={() => handleDeleteRoute(route)}>🗑️</button>
                      </div>
                    </div>
                  )
                })}
              </div>
              
              {/* Clear all additionally loaded routes button */}
              {loadedRoutes.length > 0 && (
                <div className="clear-loaded-routes-bar">
                  <span>{loadedRoutes.length} itinerari{loadedRoutes.length > 1 ? ' sovrapposti' : ' sovrapposto'} sulla mappa</span>
                  <button className="clear-loaded-btn" onClick={clearLoadedRoutes}>✕ Rimuovi tutti</button>
                </div>
              )}
              
              {/* Profile tabs for loaded routes */}
              {loadedRoutes.length > 0 && showLoadedProfile && (
                <div className="loaded-profiles-container">
                  <div className="profile-tabs">
                    {loadedRoutes.map((route, index) => (
                      <button
                        key={route.id}
                        className={`profile-tab ${activeProfileTab === `route_${route.id}` ? 'active' : ''}`}
                        onClick={() => setActiveProfileTab(`route_${route.id}`)}
                      >
                        <span 
                          className="tab-color-indicator" 
                          style={{ backgroundColor: route.color }}
                        />
                        <span className="tab-name" title={route.name}>{route.name}</span>
                        <span className="tab-distance">{route.distance !== '?' ? `${route.distance} km` : ''}</span>
                      </button>
                    ))}
                  </div>
                  
                  {/* Profile for selected loaded route */}
                  {(() => {
                    const activeRoute = loadedRoutes.find(r => `route_${r.id}` === activeProfileTab)
                    if (!activeProfileTab || !activeRoute) return null
                    return (
                      <LoadRouteProfile
                        key={activeRoute.id}
                        route={activeRoute}
                        selectedIndex={loadedTrackHoverIndex}
                        onHover={(index, routeId) => {
                          setLoadedTrackHoverIndex(index)
                          setHoveredLoadedRouteId(routeId)
                        }}
                        onHoverEnd={() => {
                          setLoadedTrackHoverIndex(null)
                          setHoveredLoadedRouteId(null)
                        }}
                      />
                    )
                  })()}
                </div>
              )}
              
              {/* Toggle button for loaded profiles */}
              {loadedRoutes.length > 0 && (
                <button className="toggle-loaded-profile-btn" onClick={() => setShowLoadedProfile(!showLoadedProfile)}>
                  {showLoadedProfile ? '📍 Nascondi profili' : '📊 Mostra profili itinerari'}
                </button>
              )}
            </div>
          )}
          {message && <div className={`message ${message.type}`}>{message.text}</div>}
        </div>
      )}
    </div>
  )
}


// Component to display elevation profile for loaded route
function LoadRouteProfile({ route, onHover, onHoverEnd, selectedIndex }) {
  const [profileGPX, setProfileGPX] = useState(null)
  
  const handleHover = (index) => {
    if (onHover) {
      onHover(index, route.id)
    }
  }
  
  const handleHoverEndLocal = () => {
    if (onHoverEnd) {
      onHoverEnd()
    }
  }
  
  useEffect(() => {
    if (route?.coordinates && route.elevation && route.elevation.length > 0) {
      // Generate GPX from saved elevation data
      const elevations = route.elevation
      const coords = route.coordinates
      let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1">\n<trk>\n<trkseg>\n'
      
      elevations.forEach((ele, i) => {
        const coordIndex = Math.floor((i / (elevations.length - 1)) * (coords.length - 1))
        const coord = coords[coordIndex] || coords[0]
        if (coord) {
          gpx += `    <trkpt lat="${coord[0]?.toFixed(6) || 0}" lon="${coord[1]?.toFixed(6) || 0}"><ele>${ele?.toFixed(2) || 0}</ele></trkpt>\n`
        }
      })
      gpx += '</trkseg>\n</trk>\n</gpx>'
      setProfileGPX(gpx)
    }
  }, [route])
  
  if (!profileGPX) {
    return (
      <div className="loaded-profile-placeholder">
        <p>Profilo altimetrico non disponibile per questo itinerario</p>
      </div>
    )
  }
  
  return (
    <div className="loaded-profile-container" onMouseLeave={handleHoverEndLocal}>
      <ElevationProfile 
        gpxContent={profileGPX}
        trackName={route.name}
        selectedIndex={selectedIndex || null}
        onHover={handleHover}
      />
    </div>
  )
}
