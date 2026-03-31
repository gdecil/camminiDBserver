import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const DEFAULT_LAYER = 'OpenStreetMap'

const LAYERS = {
  OpenStreetMap: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors'
  },
  OpenTopoMap: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data: OpenStreetMap, SRTM | Map style: OpenTopoMap'
  },
  'Stamen Terrain': {
    url: 'https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}.jpg',
    attribution: 'Map tiles by Stamen Design, CC BY 3.0'
  },
  'CartoDB Positron': {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  },
  'CartoDB Dark': {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  }
}

// Fix per le icone Marker in Leaflet con React
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
      return () => {
        map.off('click', onMapClick)
      }
    }
  }, [map, onMapClick])
  return null
}

// Component for displaying clickable markers
function MarkersLayer({ markers, onMarkerClick }) {
  const map = useMap()
  const markersRef = useRef({})
  
  useEffect(() => {
    // Clean up old markers
    Object.values(markersRef.current).forEach(marker => {
      if (marker) marker.remove()
    })
    markersRef.current = {}
    
    if (!markers || markers.length === 0) return
    
    // Create new markers for each item
    markers.forEach((markerData, index) => {
      const color = markerData.type === 'track' ? '#3498db' : '#e74c3c'
      const icon = L.divIcon({
        className: 'home-marker',
        html: `<div style="
          position: relative;
          background-color: ${color};
          width: 18px;
          height: 18px;
          border-radius: 50% 50% 50% 0;
          border: 2px solid white;
          box-shadow: 0 1px 4px rgba(0,0,0,0.4);
          transform: rotate(-45deg);
        "></div>
        <span style="
          position: absolute;
          top: -18px;
          left: 50%;
          transform: translateX(-50%);
          background: white;
          color: ${color};
          padding: 1px 6px;
          border-radius: 3px;
          font-size: 9px;
          font-weight: bold;
          white-space: nowrap;
          box-shadow: 0 1px 2px rgba(0,0,0,0.2);
        ">${markerData.name}</span>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      })
      
      const marker = L.marker(markerData.position, { icon })
      
      if (onMarkerClick) {
        marker.on('click', () => onMarkerClick(markerData))
      }
      
      marker.addTo(map)
      markersRef.current[index] = marker
    })
    
    return () => {
      Object.values(markersRef.current).forEach(marker => {
        if (marker) marker.remove()
      })
    }
  }, [markers, map, onMarkerClick])
  
  return null
}

// Draggable Waypoints Layer Component

function DraggableWaypoints({ waypoints, onWaypointDragEnd, draggable = true }) {
  const map = useMap()
  const markersRef = useRef({})
  
  useEffect(() => {
    // Clean up old markers
    Object.values(markersRef.current).forEach(marker => {
      if (marker) marker.remove()
    })
    markersRef.current = {}
    
    // Create new markers for each waypoint
    waypoints.forEach((wp, index) => {
      const icon = createIcon(wp.color, wp.label, draggable)
      const marker = L.marker(wp.position, {
        icon,
        draggable: draggable
      })
      
      if (draggable) {
        marker.on('dragend', function(e) {
          const newLatLng = e.target.getLatLng()
          if (onWaypointDragEnd) {
            onWaypointDragEnd(index, newLatLng.lat, newLatLng.lng)
          }
        })
      }
      
      marker.addTo(map)
      markersRef.current[index] = marker
    })
    
    return () => {
      Object.values(markersRef.current).forEach(marker => {
        if (marker) marker.remove()
      })
    }
  }, [waypoints, map, onWaypointDragEnd, draggable])
  
  return null
}

export default function Map({ 
  trackCoordinates = [], 
  startMarker = null, 
  endMarker = null,
  routeCoordinates = [],
  center = [41.9029, 12.4964],
  zoom = 13,
  onMapClick = null,
  currentLayer = 'OpenStreetMap',
  waypoints = [],
  onWaypointDragEnd = null,
  draggable = true,
  selectedIndex = null, // 0-1 value for highlighted position
  onHover = null, // callback for hover
  markers = [], // markers for home page
  onMarkerClick = null, // callback for marker click
  multipleTracks = [], // Array of {coordinates, color} for multi-track display
  hoverTrack = null, // {coordinates, color, index} for hover marker on loaded track
  poiMarker = null // {position, icon, name} for POI marker
}) {
  // Combine coordinates from single track, route, or multiple tracks
  const multiTrackCoords = multipleTracks.flatMap(t => t.coordinates)
  const allCoords = multiTrackCoords.length > 0 ? [...multiTrackCoords, ...trackCoordinates, ...routeCoordinates] 
    : [...trackCoordinates, ...routeCoordinates]
  const waypointPositions = waypoints.map(wp => wp.position)
  const bounds = allCoords.length > 0 || waypointPositions.length > 0
    ? L.latLngBounds([...allCoords, ...waypointPositions])
    : null

  const layer = LAYERS[currentLayer] || LAYERS[DEFAULT_LAYER]

  return (
    <div className="map-wrapper">
      <MapContainer 
        center={center} 
        zoom={zoom} 
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution={layer.attribution}
          url={layer.url}
        />
        
        {/* Clickable markers for home page */}
        {markers.length > 0 && onMarkerClick && (
          <MarkersLayer markers={markers} onMarkerClick={onMarkerClick} />
        )}
        
        {/* Multiple colored tracks */}
        {multipleTracks.length > 0 && multipleTracks.map((track, index) => (
          track.coordinates.length > 0 && (
            <Polyline 
              key={index}
              positions={track.coordinates} 
              color={track.color || '#3498db'} 
              weight={4} 
              opacity={0.8} 
            />
          )
        ))}
        
        {/* Single track (legacy) */}
        {trackCoordinates.length > 0 && multipleTracks.length === 0 && (
          <Polyline 
            positions={trackCoordinates} 
            color="#3498db" 
            weight={4} 
            opacity={0.8} 
          />
        )}
        
        {routeCoordinates.length > 0 && (
          <Polyline 
            positions={routeCoordinates} 
            color="#e74c3c" 
            weight={5} 
            opacity={0.8} 
          />
        )}
        
        {/* Draggable waypoints using Leaflet directly */}
        {waypoints.length > 0 && onWaypointDragEnd && (
          <DraggableWaypoints 
            waypoints={waypoints} 
            onWaypointDragEnd={onWaypointDragEnd}
            draggable={draggable}
          />
        )}
        
        {startMarker && (
          <Marker position={startMarker} icon={startIcon} />
        )}
        
        {endMarker && (
          <Marker position={endMarker} icon={endIcon} />
        )}
        
        {bounds && <MapController bounds={bounds} />}
        {onMapClick && <MapEvents onMapClick={onMapClick} />}
        
        {/* Selected point marker */}
        {selectedIndex !== null && (routeCoordinates.length > 0 || trackCoordinates.length > 0) && (
          <SelectedPointMarker 
            coordinates={routeCoordinates.length > 0 ? routeCoordinates : trackCoordinates}
            selectedIndex={selectedIndex}
          />
        )}
        
        {/* Hover marker for loaded track profile sync */}
        {hoverTrack && hoverTrack.coordinates && hoverTrack.coordinates.length > 0 && hoverTrack.index !== null && (
          <Marker
            position={hoverTrack.coordinates[Math.floor(hoverTrack.index * (hoverTrack.coordinates.length - 1))]}
            icon={L.divIcon({
              className: 'loaded-track-hover-marker',
              html: `<div style="
                background-color: ${hoverTrack.color || '#ff9800'};
                width: 14px;
                height: 14px;
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.5);
              "></div>`,
              iconSize: [14, 14],
              iconAnchor: [7, 7]
            })}
            interactive={false}
            zIndexOffset={1000}
          />
        )}
        
        {/* POI marker */}
        {poiMarker && poiMarker.position && (
          <Marker
            position={poiMarker.position}
            icon={L.divIcon({
              className: 'poi-marker',
              html: `<div style="
                display: flex;
                flex-direction: column;
                align-items: center;
              ">
                <span style="
                  background: white;
                  padding: 2px 6px;
                  border-radius: 4px;
                  font-size: 10px;
                  white-space: nowrap;
                  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                  font-weight: bold;
                ">${poiMarker.icon} ${poiMarker.name}</span>
                <div style="
                  font-size: 24px;
                  margin-top: -2px;
                  filter: drop-shadow(0 2px 3px rgba(0,0,0,0.4));
                ">📍</div>
              </div>`,
              iconSize: [40, 40],
              iconAnchor: [20, 40]
            })}
          />
        )}
      </MapContainer>
    </div>
  )
}

// Component to show marker at selected position
function SelectedPointMarker({ coordinates, selectedIndex }) {
  const map = useMap()
  const markerRef = useRef(null)
  
  useEffect(() => {
    if (coordinates.length === 0 || selectedIndex === null) return
    
    // Calculate the position based on index
    const index = Math.floor(selectedIndex * (coordinates.length - 1))
    const clampedIndex = Math.max(0, Math.min(index, coordinates.length - 1))
    const position = coordinates[clampedIndex]
    
    // Remove old marker
    if (markerRef.current) {
      markerRef.current.remove()
    }
    
    // Create new marker
    const icon = L.divIcon({
      className: 'selected-point-marker',
      html: `<div style="
        background-color: #ff9800;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.5);
      "></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    })
    
    const marker = L.marker(position, { icon, interactive: false })
    marker.addTo(map)
    markerRef.current = marker
    
    return () => {
      if (markerRef.current) {
        markerRef.current.remove()
        markerRef.current = null
      }
    }
  }, [coordinates, selectedIndex, map])
  
  return null
}
