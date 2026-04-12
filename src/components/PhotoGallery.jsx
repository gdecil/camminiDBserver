import { useState, useEffect, useRef } from 'react'
import EXIF from 'exif-js'
import './PhotoGallery.css'

const API_URL = '/api'

export default function PhotoGallery({ itemId, itemType, coordinates: trackCoordinates, fullscreenMode = false, onFullscreenToggle, onDragSelect, openPhotoRequest, onPhotoOpenHandled }) {
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
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [dragSelectedPhoto, setDragSelectedPhoto] = useState(null) // Photo selected for drag-and-drop positioning
  const fileInputRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const modalImgRef = useRef(null)

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
        try {
          EXIF.getData(img, function() {
            try {
              const lat = EXIF.getTag(this, 'GPSLatitude')
              const lon = EXIF.getTag(this, 'GPSLongitude')
              const latRef = EXIF.getTag(this, 'GPSLatitudeRef') || 'N'
              const lonRef = EXIF.getTag(this, 'GPSLongitudeRef') || 'E'
              
              if (lat && lon && Array.isArray(lat) && lat.length === 3) {
                const latDecimal = convertDMSToDD(lat[0], lat[1], lat[2], latRef)
                const lonDecimal = convertDMSToDD(lon[0], lon[1], lon[2], lonRef)
                resolve([latDecimal, lonDecimal])
              } else {
                resolve(null)
              }
            } catch (exifErr) {
              console.warn('EXIF parsing error for photo:', photoUrl, exifErr)
              resolve(null)
            }
          })
        } catch (err) {
          console.warn('EXIF getData error for photo:', photoUrl, err)
          resolve(null)
        }
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

  const handlePhotoClick = (e, photo, index) => {
    if (e.shiftKey) {
      // Shift+click to select for drag-and-drop positioning
      const newSelection = dragSelectedPhoto?.index === index ? null : { photo, index }
      setDragSelectedPhoto(newSelection)
      if (onDragSelect) onDragSelect(newSelection)
    } else {
      // Normal click to open modal
      setSelectedPhoto({ photo, index })
      setSelectedMarkerIndex(index)
      setCurrentPhotoIndex(index)
    }
  }

  // Navigation functions for fullscreen mode
  const goToPrevious = () => {
    const newIndex = Math.max(0, currentPhotoIndex - 1)
    setCurrentPhotoIndex(newIndex)
    scrollToPhoto(newIndex)
    if (window.onPhotoMarkersLoaded && photos[newIndex]) {
      handlePhotoClick(photos[newIndex], newIndex)
    }
  }

  const goToNext = () => {
    const newIndex = Math.min(photos.length - 1, currentPhotoIndex + 1)
    setCurrentPhotoIndex(newIndex)
    scrollToPhoto(newIndex)
    if (window.onPhotoMarkersLoaded && photos[newIndex]) {
      handlePhotoClick(photos[newIndex], newIndex)
    }
  }

  const scrollToPhoto = (index) => {
    if (scrollContainerRef.current) {
      const photoWidth = scrollContainerRef.current.scrollWidth / photos.length
      scrollContainerRef.current.scrollTo({
        left: photoWidth * index,
        behavior: 'smooth'
      })
    }
  }

  // Handle touch/swipe for fullscreen mode
  const [touchStart, setTouchStart] = useState(null)
  const [touchEnd, setTouchEnd] = useState(null)

  const handleTouchStart = (e) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }

  const handleTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return
    const distance = touchStart - touchEnd
    const minSwipeDistance = 50
    if (Math.abs(distance) > minSwipeDistance) {
      if (distance > 0) {
        goToNext()
      } else {
        goToPrevious()
      }
    }
  }

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        goToPrevious()
      } else if (e.key === 'ArrowRight') {
        goToNext()
      } else if (e.key === 'Escape') {
        if (selectedPhoto) {
          setSelectedPhoto(null)
        } else if (fullscreenMode && onFullscreenToggle) {
          onFullscreenToggle(false)
          document.exitFullscreen?.().catch(() => {})
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedPhoto, fullscreenMode, onFullscreenToggle])

  // Navigation for modal
  const goToPreviousModal = () => {
    const newIndex = Math.max(0, currentPhotoIndex - 1)
    setCurrentPhotoIndex(newIndex)
    setSelectedPhoto({ photo: photos[newIndex], index: newIndex })
    if (scrollContainerRef.current) {
      const photoWidth = scrollContainerRef.current.scrollWidth / photos.length
      scrollContainerRef.current.scrollTo({ left: photoWidth * newIndex, behavior: 'smooth' })
    }
  }

  const goToNextModal = () => {
    const newIndex = Math.min(photos.length - 1, currentPhotoIndex + 1)
    setCurrentPhotoIndex(newIndex)
    setSelectedPhoto({ photo: photos[newIndex], index: newIndex })
    if (scrollContainerRef.current) {
      const photoWidth = scrollContainerRef.current.scrollWidth / photos.length
      scrollContainerRef.current.scrollTo({ left: photoWidth * newIndex, behavior: 'smooth' })
    }
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

  // Reset zoom when photo changes
  useEffect(() => {
    if (selectedPhoto) {
      setZoom(1)
      setPan({ x: 0, y: 0 })
    }
  }, [selectedPhoto?.index])

  useEffect(() => {
    if (!openPhotoRequest || !openPhotoRequest.path || photos.length === 0) return
    const matchIndex = photos.findIndex(photo => photo.path === openPhotoRequest.path)
    if (matchIndex !== -1) {
      const photo = photos[matchIndex]
      setSelectedPhoto({ photo, index: matchIndex })
      setCurrentPhotoIndex(matchIndex)
      scrollToPhoto(matchIndex)
      if (onPhotoOpenHandled) onPhotoOpenHandled()
    }
  }, [openPhotoRequest, photos, onPhotoOpenHandled])

  // Zoom handlers
  const handleWheel = (e) => {
    if (!selectedPhoto) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.2 : 0.2
    setZoom(z => Math.max(0.5, Math.min(5, z + delta)))
  }

  const handleMouseDown = (e) => {
    if (zoom > 1) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }

  const handleMouseMove = (e) => {
    if (isDragging && zoom > 1) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
    }
  }

  const handleMouseUp = () => setIsDragging(false)

  // Track fullscreen state
  const [isFullscreenView, setIsFullscreenView] = useState(false)

  // Check and update fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreenView(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

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
        <div 
          className={`gallery-grid ${fullscreenMode ? 'fullscreen-gallery-grid' : ''}`}
          ref={scrollContainerRef}
          onTouchStart={fullscreenMode ? handleTouchStart : undefined}
          onTouchMove={fullscreenMode ? handleTouchMove : undefined}
          onTouchEnd={fullscreenMode ? handleTouchEnd : undefined}
        >
          {photos.map((photo, index) => (
            <div 
              key={index} 
              className={`gallery-item ${selectedPhoto?.index === index ? 'selected' : ''} ${dragSelectedPhoto?.index === index ? 'drag-selected' : ''}`}
              onClick={(e) => handlePhotoClick(e, photo, index)}
            >
              <img src={photo.url} alt={photo.name} loading="lazy" />
              {photoMarkers.find(m => m.index === index) && (
                <span className="gps-badge" title="Foto con GPS">📍</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Navigation Controls for Fullscreen Mode */}
      {fullscreenMode && photos.length > 1 && (
        <div className="gallery-nav-controls fullscreen-nav">
          <button 
            className="nav-arrow nav-prev"
            onClick={goToPrevious}
            disabled={currentPhotoIndex === 0}
            title="Precedente"
          >
            ◀
          </button>
          <span className="photo-counter">{currentPhotoIndex + 1} / {photos.length}</span>
          <button 
            className="nav-arrow nav-next"
            onClick={goToNext}
            disabled={currentPhotoIndex === photos.length - 1}
            title="Successiva"
          >
            ▶
          </button>
        </div>
      )}

      {/* Toggle fullscreen button in normal mode */}
      {!fullscreenMode && photos.length > 0 && (
        <button 
          className="btn-fullscreen-gallery"
          onClick={() => {
            // Request browser fullscreen first
            document.documentElement.requestFullscreen?.().catch(() => {})
            onFullscreenToggle && onFullscreenToggle(true)
          }}
          title="Visualizza a schermo intero"
        >
          ⛶ Visualizza a schermo intero
        </button>
      )}

      {/* Selected Photo Modal */}
      {selectedPhoto && (
        <div 
          className={`photo-modal ${isFullscreenView ? 'fullscreen-view' : ''}`}
          onClick={() => setSelectedPhoto(null)}
          onWheel={handleWheel}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div 
            className="photo-modal-content" 
            onClick={(e) => e.stopPropagation()}
            style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
          >
            <button className="close-modal" onClick={() => setSelectedPhoto(null)}>✕</button>
            
            {/* Navigation arrows for modal */}
            {photos.length > 1 && (
              <button 
                className="modal-nav-arrow modal-prev"
                onClick={goToPreviousModal}
                disabled={currentPhotoIndex === 0}
                title="Precedente (← freccia)"
              >
                ◀
              </button>
            )}
            
            <div 
              className="photo-zoom-container"
              onMouseDown={handleMouseDown}
            >
              <img 
                src={selectedPhoto.photo.url} 
                alt={selectedPhoto.photo.name}
                style={{ 
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in'
                }}
                draggable={false}
              />
            </div>
            
            {photos.length > 1 && (
              <button 
                className="modal-nav-arrow modal-next"
                onClick={goToNextModal}
                disabled={currentPhotoIndex === photos.length - 1}
                title="Successiva (→ freccia)"
              >
                ▶
              </button>
            )}
            
            <div className="photo-modal-info">
              <strong>{selectedPhoto.photo.name}</strong>
              <span>{selectedPhoto.index + 1} / {photos.length} - {(selectedPhoto.photo.size / 1024).toFixed(0)} KB</span>
              {zoom > 1 && <span className="zoom-info">🔍 {Math.round(zoom * 100)}% • trascina per spostare</span>}
              {zoom === 1 && <span className="zoom-info">🖱️ scroll per zoom</span>}
            </div>
            {photoMarkers.find(m => m.index === selectedPhoto.index) && (
              <span className="gps-marker-info">📍 GPS: {photoMarkers.find(m => m.index === selectedPhoto.index).position.join(', ')}</span>
            )}
          </div>
        </div>
      )}

      {/* Close fullscreen button */}
      {fullscreenMode && (
        <button 
          className="btn-exit-fullscreen"
          onClick={() => {
            onFullscreenToggle && onFullscreenToggle(false)
            document.exitFullscreen?.().catch(() => {})
          }}
          title="Esci dalla modalità fullscreen (ESC)"
        >
          ✕ Esci fullscreen
        </button>
      )}
    </div>
  )
}