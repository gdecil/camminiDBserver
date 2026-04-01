import { useState, useEffect, useRef } from 'react'
import EXIF from 'exif-js'
import './PhotoGallery.css'

const API_URL = '/api'

export default function PhotoGallery({ itemId, itemType, coordinates: trackCoordinates }) {
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(false)
  const [folderPath, setFolderPath] = useState('')
  const [error, setError] = useState(null)
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [photoMarkers, setPhotoMarkers] = useState([])
  const [scanningGPS, setScanningGPS] = useState(false)
  const [gpsScanned, setGpsScanned] = useState(false)
  const [showGPSCheckbox, setShowGPSCheckbox] = useState(false)
  const [showFolderInput, setShowFolderInput] = useState(false)
  const [selectedMarkerIndex, setSelectedMarkerIndex] = useState(null)
  const fileInputRef = useRef(null)

  // Load saved folder path from item
  useEffect(() => {
    const loadFolderPath = async () => {
      try {
        const res = await fetch(`${API_URL}/saved`)
        const items = await res.json()
        const item = items.find(i => i.id === itemId)
        if (item?.photoFolderPath) {
          setFolderPath(item.photoFolderPath)
          // Check if the folder exists
          try {
            await fetch(`${API_URL}/photos/list`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ folderPath: item.photoFolderPath })
            })
          } catch {
            // Folder not found
            setShowFolderInput(true)
            return
          }
          // Load photos
          loadPhotos(item.photoFolderPath)
        } else {
          setShowFolderInput(true)
        }
      } catch {
        setShowFolderInput(true)
      }
    }
    if (itemId) loadFolderPath()
  }, [itemId])

  const loadPhotos = async (folderPath) => {
    setLoading(true)
    setError(null)
    setGpsScanned(false)
    setPhotoMarkers([])
    try {
      const res = await fetch(`${API_URL}/photos/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Errore nel caricamento delle foto')
      }
      const data = await res.json()
      // Add photo URL for each file
      const photosWithUrl = data.files.map(f => ({
        ...f,
        url: `/api/photos/${encodeURIComponent(f.path)}`
      }))
      setPhotos(photosWithUrl)
      setLoading(false)
      // Check if photos have GPS data available
      checkForGPX(photosWithUrl)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  // Check first 3 photos for GPS data
  const checkForGPX = async (photos) => {
    if (photos.length === 0) return
    setShowGPSCheckbox(false)
    // Try to read GPS from first photo
    const firstPhoto = photos[0]
    try {
      const coords = await getPhotoGPS(firstPhoto.url)
      if (coords) {
        setShowGPSCheckbox(true)
      }
    } catch {
      // No GPS in first photo
    }
  }

  // Get GPS from a photo using exif-js
  const getPhotoGPS = async (photoUrl) => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'Anonymous'
      img.onload = () => {
        EXIF.getData(img, function() {
          const lat = EXIF.getTag(this, 'GPSLatitude')
          const lon = EXIF.getTag(this, 'GPSLongitude')
          const latRef = EXIF.getTag(this, 'GPSLatitudeRef') || 'N'
          const lonRef = EXIF.getTag(this, 'GPSLongitudeRef') || 'E'
          
          if (lat && lon) {
            const latDecimal = convertDMSToDD(lat[0], lat[1], lat[2], latRef)
            const lonDecimal = convertDMSToDD(lon[0], lon[1], lon[2], lonRef)
            resolve([latDecimal, lonDecimal])
          } else {
            resolve(null)
          }
        })
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = photoUrl
    })
  }

  const convertDMSToDD = (degrees, minutes, seconds, direction) => {
    let dd = degrees + minutes / 60 + seconds / (60 * 60)
    if (direction === 'S' || direction === 'W') {
      dd = -dd
    }
    return dd
  }

  const handleSetFolderPath = async () => {
    if (!folderPath.trim()) {
      setError('Inserisci un percorso valido')
      return
    }
    
    // Test if folder exists
    try {
      const res = await fetch(`${API_URL}/photos/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: folderPath.trim() })
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Cartella non trovata')
        return
      }
    } catch {
      setError('Errore durante la verifica della cartella')
      return
    }

    // Save folder path to database
    try {
      await fetch(`${API_URL}/items/${itemId}/photo-folder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoFolderPath: folderPath.trim() })
      })
    } catch (err) {
      console.error('Failed to save folder path:', err)
    }

    setShowFolderInput(false)
    setError(null)
    loadPhotos(folderPath.trim())
  }

  const handleScanForGPS = async () => {
    setScanningGPS(true)
    const markers = []
    const photosWithGPS = []
    
    // Scan all photos for GPS data
    for (let i = 0; i < photos.length; i++) {
      try {
        const coords = await getPhotoGPS(photos[i].url)
        if (coords) {
          markers.push({
            position: coords,
            photo: photos[i],
            index: i
          })
          photosWithGPS.push({ ...photos[i], gps: coords })
        }
      } catch {
        // No GPS data for this photo
      }
    }
    
    setPhotoMarkers(markers)
    setScanningGPS(false)
    setGpsScanned(true)
    
    if (markers.length === 0) {
      alert('Nessuna foto con coordinate GPS trovata')
    } else {
      alert(`${markers.length} foto trovate con coordinate GPS`)
    }
    
    if (window.onPhotoMarkersLoaded) {
      window.onPhotoMarkersLoaded(markers)
    }
  }

  const handlePhotoClick = (photo, index) => {
    setSelectedPhoto({ photo, index })
    setSelectedMarkerIndex(index)
  }

  const handleRemoveFolder = async () => {
    try {
      await fetch(`${API_URL}/items/${itemId}/photo-folder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoFolderPath: null })
      })
    } catch (err) {
      console.error('Failed to remove folder path:', err)
    }
    setFolderPath('')
    setPhotos([])
    setShowFolderInput(true)
    setGpsScanned(false)
    setPhotoMarkers([])
  }

  // Get folder name from path
  const folderName = folderPath.split(/[\\/]/).pop() || folderPath

  return (
    <div className="photo-gallery">
      {/* Folder path prompt */}
      {showFolderInput && (
        <div className="folder-prompt">
          <h4>📷 Associa una cartella di foto</h4>
          <input 
            type="text"
            className="folder-input"
            value={folderPath} 
            onChange={(e) => setFolderPath(e.target.value)} 
            placeholder="Es: C:\Utenti\Nome\Foto Cammino"
            onKeyDown={(e) => e.key === 'Enter' && handleSetFolderPath()}
          />
          <button className="btn-set-folder" onClick={handleSetFolderPath}>Associa</button>
        </div>
      )}

      {/* Manage loaded folder */}
      {!showFolderInput && folderPath && (
        <div className="folder-header">
          <span>📁 {folderName}</span>
          <div className="folder-actions">
            <button className="btn-remove-folder" onClick={handleRemoveFolder}>✕ Rimuovi</button>
            <input 
              type="file"
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept="image/*" 
              multiple 
              onChange={() => setShowFolderInput(true)}
            />
          </div>
        </div>
      )}

      {/* Error message */}
      {error && <div className="gallery-error">⚠️ {error}</div>}

      {/* GPS Scan button (only shown if photos loaded and some have GPS) */}
      {showGPSCheckbox && photos.length > 0 && (
        <div className="gps-checkbox-wrapper">
          <button 
            className="btn-scan-gps" 
            onClick={handleScanForGPS} 
            disabled={scanningGPS || gpsScanned}
          >
            {scanningGPS ? '📡 Scansione...' : gpsScanned ? `✓ ${photoMarkers.length} GPS trovati` : '📡 Scansiona per coordinate GPS'}
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && <div className="gallery-loading">📷 Caricamento foto...</div>}

      {/* Photo Gallery */}
      {photos.length > 0 && !showFolderInput && (
        <div className="gallery-grid">
          {photos.map((photo, index) => (
            <div 
              key={index} 
              className={`gallery-item ${selectedPhoto?.index === index ? 'selected' : ''}`}
              onClick={() => handlePhotoClick(photo, index)}
            >
              <img src={photo.url} alt={photo.name} loading="lazy" />
              {photoMarkers.find(m => m.index === index) && (
                <span className="gps-badge" title="Foto con GPS">📍</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Selected Photo Modal */}
      {selectedPhoto && (
        <div className="photo-modal" onClick={() => setSelectedPhoto(null)}>
          <div className="photo-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-modal" onClick={() => setSelectedPhoto(null)}>✕</button>
            <img src={selectedPhoto.photo.url} alt={selectedPhoto.photo.name} />
            <div className="photo-modal-info">
              <strong>{selectedPhoto.photo.name}</strong>
              <span>{(selectedPhoto.photo.size / 1024).toFixed(0)} KB</span>
            </div>
            {photoMarkers.find(m => m.index === selectedPhoto.index) && (
              <span className="gps-marker-info">📍 GPS: {photoMarkers.find(m => m.index === selectedPhoto.index).position.join(', ')}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}