import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { LAYERS, DEFAULT_LAYER } from './mapConfig'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const createIcon = (color, label = null, draggable = false) => {
  const labelHtml = label ? `<span style="position: absolute; top: -22px; left: 50%; transform: translateX(-50%); background: ${color}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; white-space: nowrap; font-weight: bold; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">${label}</span>` : ''
  const cursorStyle = draggable ? 'cursor: grab;' : ''
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="${cursorStyle} position: relative; background-color: ${color}; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4);">${labelHtml}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

const startIcon = createIcon('#2ecc71')
const endIcon = createIcon('#e74c3c')

function MapController({ bounds }) {
  const map = useMap()
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50] })
    }
  }, [bounds, map])
  return null
}

function MapEvents({ onMapClick }) {
  const map = useMap()
  useEffect(() => {
    if (onMapClick) {
      map.on('click', onMapClick)
      return () => { map.off('click', onMapClick) }
    }
  }, [map, onMapClick])
  return null
}

function MarkersLayer({ markers, onMarkerClick }) {
  const map = useMap()
  const markersRef = useRef({})
  useEffect(() => {
    Object.values(markersRef.current).forEach(marker => { if (marker) marker.remove() })
    markersRef.current = {}
    if (!markers || markers.length === 0) return
    markers.forEach((markerData, index) => {
      const color = markerData.type === 'track' ? '#3498db' : '#e74c3c'
      const icon = L.divIcon({
        className: 'home-marker',
        html: `<div style="position: relative; background-color: ${color}; width: 18px; height: 18px; border-radius: 50% 50% 50% 0; border: 2px solid white; box-shadow: 0 1px 4px rgba(0,0,0,0.4); transform: rotate(-45deg);"></div><span style="position: absolute; top: -18px; left: 50%; transform: translateX(-50%); background: white; color: ${color}; padding: 1px 6px; border-radius: 3px; font-size: 9px; font-weight: bold; white-space: nowrap; box-shadow: 0 1px 2px rgba(0,0,0,0.2);">${markerData.name}</span>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      })
      const marker = L.marker(markerData.position, { icon })
      if (onMarkerClick) marker.on('click', () => onMarkerClick(markerData))
      marker.addTo(map)
      markersRef.current[index] = marker
    })
    return () => { Object.values(markersRef.current).forEach(marker => { if (marker) marker.remove() }) }
  }, [markers, map, onMarkerClick])
  return null
}

function DraggableWaypoints({ waypoints, onWaypointDragEnd, draggable = true }) {
  const map = useMap()
  const markersRef = useRef({})
  useEffect(() => {
    Object.values(markersRef.current).forEach(marker => { if (marker) marker.remove() })
    markersRef.current = {}
    waypoints.forEach((wp, index) => {
      const icon = createIcon(wp.color, wp.label, draggable)
      const marker = L.marker(wp.position, { icon, draggable })
      if (draggable) {
        marker.on('dragend', function(e) {
          if (onWaypointDragEnd) onWaypointDragEnd(index, e.target.getLatLng().lat, e.target.getLatLng().lng)
        })
      }
      marker.addTo(map)
      markersRef.current[index] = marker
    })
    return () => { Object.values(markersRef.current).forEach(marker => { if (marker) marker.remove() }) }
  }, [waypoints, map, onWaypointDragEnd, draggable])
  return null
}

function SelectedPointMarker({ coordinates, selectedIndex }) {
  const map = useMap()
  const markerRef = useRef(null)
  useEffect(() => {
    if (coordinates.length === 0 || selectedIndex === null) return
    const index = Math.floor(selectedIndex * (coordinates.length - 1))
    const clampedIndex = Math.max(0, Math.min(index, coordinates.length - 1))
    const position = coordinates[clampedIndex]
    if (markerRef.current) markerRef.current.remove()
    const icon = L.divIcon({
      className: 'selected-point-marker',
      html: `<div style="background-color: #ff9800; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.5);"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    })
    const marker = L.marker(position, { icon, interactive: false })
    marker.addTo(map)
    markerRef.current = marker
    return () => { if (markerRef.current) { markerRef.current.remove(); markerRef.current = null } }
  }, [coordinates, selectedIndex, map])
  return null
}

// Component for GPS-tagged photo markers
function PhotoMarkersLayer({ photoMarkers }) {
  const map = useMap()
  const markersRef = useRef([])
  useEffect(() => {
    markersRef.current.forEach(marker => { if (marker) marker.remove() })
    markersRef.current = []
    if (!photoMarkers || photoMarkers.length === 0) return
    photoMarkers.forEach((pm, index) => {
      const icon = L.divIcon({
        className: 'photo-marker',
        html: `<div style="position: relative; display: flex; flex-direction: column; align-items: center;"><span style="font-size: 10px; background: rgba(255,255,255,0.9); padding: 1px 4px; border-radius: 3px; box-shadow: 0 1px 2px rgba(0,0,0,0.2);">📷${index + 1}</span></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      })
      const marker = L.marker(pm.position, { icon })
      marker.bindPopup(`<div style="max-width: 200px; text-align: center;"><img src="${pm.photo.url}" alt="${pm.photo.name}" style="max-width: 100%; border-radius: 4px;" /><p style="margin: 5px 0 0 0; font-size: 11px; color: #666;">${pm.photo.name}</p></div>`)
      marker.addTo(map)
      markersRef.current.push(marker)
    })
    return () => { markersRef.current.forEach(marker => { if (marker) marker.remove() }) }
  }, [photoMarkers, map])
  return null
}

export default function Map({ 
  trackCoordinates = [], startMarker = null, endMarker = null, routeCoordinates = [],
  center = [41.9029, 12.4964], zoom = 13, onMapClick = null, currentLayer = 'OpenStreetMap',
  waypoints = [], onWaypointDragEnd = null, draggable = true, selectedIndex = null,
  onHover = null, markers = [], onMarkerClick = null, multipleTracks = [],
  hoverTrack = null, poiMarker = null, photoMarkers = [], showHikingOverlay = false
}) {
  const multiTrackCoords = multipleTracks.flatMap(t => t.coordinates)
  const allCoords = multiTrackCoords.length > 0 ? [...multiTrackCoords, ...trackCoordinates, ...routeCoordinates] : [...trackCoordinates, ...routeCoordinates]
  const waypointPositions = waypoints.map(wp => wp.position)
  const bounds = allCoords.length > 0 || waypointPositions.length > 0 ? L.latLngBounds([...allCoords, ...waypointPositions]) : null
  const layer = LAYERS[currentLayer] || LAYERS[DEFAULT_LAYER]

  return (
    <div className="map-wrapper">
      <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution={layer.attribution} url={layer.url} />
        {showHikingOverlay && (
          <TileLayer 
            url="https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://waymarkedtrails.org">Waymarked Trails</a>'
            zIndex={10}
            opacity={0.7}
          />
        )}
        {markers.length > 0 && onMarkerClick && <MarkersLayer markers={markers} onMarkerClick={onMarkerClick} />}
        {multipleTracks.length > 0 && multipleTracks.map((track, index) => (
          track.coordinates.length > 0 && <Polyline key={index} positions={track.coordinates} color={track.color || '#3498db'} weight={4} opacity={0.8} />
        ))}
        {trackCoordinates.length > 0 && multipleTracks.length === 0 && <Polyline positions={trackCoordinates} color="#3498db" weight={4} opacity={0.8} />}
        {routeCoordinates.length > 0 && <Polyline positions={routeCoordinates} color="#e74c3c" weight={5} opacity={0.8} />}
        {waypoints.length > 0 && onWaypointDragEnd && <DraggableWaypoints waypoints={waypoints} onWaypointDragEnd={onWaypointDragEnd} draggable={draggable} />}
        {startMarker && <Marker position={startMarker} icon={startIcon} />}
        {endMarker && <Marker position={endMarker} icon={endIcon} />}
        {bounds && <MapController bounds={bounds} />}
        {onMapClick && <MapEvents onMapClick={onMapClick} />}
        {selectedIndex !== null && (routeCoordinates.length > 0 || trackCoordinates.length > 0) && <SelectedPointMarker coordinates={routeCoordinates.length > 0 ? routeCoordinates : trackCoordinates} selectedIndex={selectedIndex} />}
        {hoverTrack && hoverTrack.coordinates && hoverTrack.coordinates.length > 0 && hoverTrack.index !== null && (
          <Marker position={hoverTrack.coordinates[Math.floor(hoverTrack.index * (hoverTrack.coordinates.length - 1))]} icon={L.divIcon({ className: 'loaded-track-hover-marker', html: `<div style="background-color: ${hoverTrack.color || '#ff9800'}; width: 14px; height: 14px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.5);"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] })} interactive={false} zIndexOffset={1000} />
        )}
        {photoMarkers.length > 0 && <PhotoMarkersLayer photoMarkers={photoMarkers} />}
        {poiMarker && poiMarker.position && (
          <Marker position={poiMarker.position} icon={L.divIcon({ className: 'poi-marker', html: `<div style="display: flex; flex-direction: column; align-items: center;"><span style="background: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,0.3); font-weight: bold;">${poiMarker.icon} ${poiMarker.name}</span><div style="font-size: 24px; margin-top: -2px; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.4));">📍</div></div>`, iconSize: [40, 40], iconAnchor: [20, 40] })} />
        )}
      </MapContainer>
    </div>
  )
}