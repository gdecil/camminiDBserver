import { useState, useRef } from 'react'
import './FileUpload.css'

export default function FileUpload({ onFileLoad, onMultipleFileLoad, onGpxContent }) {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState([])
  const fileInputRef = useRef(null)
  const multiFileInputRef = useRef(null)

  // Convert KML to GPX
    const convertKmlToGpx = (kmlContent, fileName) => {
      const parser = new DOMParser()
      const xmlDoc = parser.parseFromString(kmlContent, 'text/xml')
    
      let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1">\n  <metadata>\n    <name>' + (fileName.replace('.kml', '') || 'KML Track') + '</name>\n  </metadata>\n'
    
      // Parse Folder/Placemark elements (Google Maps exports)
      const folders = xmlDoc.getElementsByTagName('Folder')
      const placemarks = xmlDoc.getElementsByTagName('Placemark')
    
      // Handle Google Earth/Maps KML withgx:Track
      const gxTracks = xmlDoc.getElementsByTagName('gx:Track')
      for (let i = 0; i < gxTracks.length; i++) {
        const gxTrack = gxTracks[i]
        const trackName = gxTrack.getElementsByTagName('name')[0]?.textContent || `Track ${i + 1}`
        gpx += '  <trk>\n    <name>' + trackName + '</name>\n    <trkseg>\n'
      
        const coords = gxTrack.getElementsByTagName('gx:coord')
        const times = gxTrack.getElementsByTagName('when')
      
        for (let j = 0; j < coords.length; j++) {
          const coordText = coords[j].textContent.trim()
          const parts = coordText.split(/\s+/)
          if (parts.length >= 2) {
            const lon = parseFloat(parts[0])
            const lat = parseFloat(parts[1])
            const ele = parts.length > 2 ? parseFloat(parts[2]) : 0
            if (!isNaN(lat) && !isNaN(lon)) {
              gpx += '      <trkpt lat="' + lat + '" lon="' + lon + '">\n        <ele>' + ele + '</ele>\n      </trkpt>\n'
            }
          }
        }
        gpx += '    </trkseg>\n  </trk>\n'
      }
    
      // Handle LineString placemarks
      for (let i = 0; i < placemarks.length; i++) {
        const placemark = placemarks[i]
        const name = placemark.getElementsByTagName('name')[0]?.textContent || 'Track'
        const lineString = placemark.getElementsByTagName('LineString')[0]
        const coordinates = lineString?.getElementsByTagName('coordinates')[0]?.textContent
      
        if (coordinates) {
          gpx += '  <trk>\n    <name>' + name + '</name>\n    <trkseg>\n'
        
          const coordList = coordinates.trim().split(/\s+/)
          for (let j = 0; j < coordList.length; j++) {
            const coord = coordList[j].split(',')
            if (coord.length >= 2) {
              const lon = parseFloat(coord[0])
              const lat = parseFloat(coord[1])
              const ele = coord.length > 2 ? parseFloat(coord[2]) : 0
              if (!isNaN(lat) && !isNaN(lon)) {
                gpx += '      <trkpt lat="' + lat + '" lon="' + lon + '">\n        <ele>' + ele + '</ele>\n      </trkpt>\n'
              }
            }
          }
          gpx += '    </trkseg>\n  </trk>\n'
        }
      }
    
      // Handle multi-geometry with LineString
      const multiGeometries = xmlDoc.getElementsByTagName('MultiGeometry')
      for (let i = 0; i < multiGeometries.length; i++) {
        const mg = multiGeometries[i]
        const name = mg.getElementsByTagName('name')[0]?.textContent || 'Track'
        const lineStrings = mg.getElementsByTagName('LineString')
      
        for (let l = 0; l < lineStrings.length; l++) {
          const coords = lineStrings[l].getElementsByTagName('coordinates')[0]?.textContent
          if (coords) {
            gpx += '  <trk>\n    <name>' + name + (lineStrings.length > 1 ? ` (Part ${l + 1})` : '') + '</name>\n    <trkseg>\n'
          
            const coordList = coords.trim().split(/\s+/)
            for (let j = 0; j < coordList.length; j++) {
              const coord = coordList[j].split(',')
              if (coord.length >= 2) {
                const lon = parseFloat(coord[0])
                const lat = parseFloat(coord[1])
                const ele = coord.length > 2 ? parseFloat(coord[2]) : 0
                if (!isNaN(lat) && !isNaN(lon)) {
                  gpx += '      <trkpt lat="' + lat + '" lon="' + lon + '">\n        <ele>' + ele + '</ele>\n      </trkpt>\n'
                }
              }
            }
            gpx += '    </trkseg>\n  </trk>\n'
          }
        }
      }
    
      gpx += '</gpx>'
      return gpx
    }

    // Single file handler
    const handleFile = (file) => {
      if (file) {
        const reader = new FileReader()
        reader.onload = (e) => {
          let content = e.target.result
          let fileName = file.name
        
          // Convert KML to GPX if needed
          if (file.name.toLowerCase().endsWith('.kml')) {
            content = convertKmlToGpx(content, fileName)
            fileName = fileName.replace('.kml', '.gpx')
          }
        
          if (content && content.includes('<gpx')) {
            onFileLoad(content)
            if (onGpxContent) {
              onGpxContent(content)
            }
          }
        }
        reader.readAsText(file)
      }
    }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    handleMultipleFiles(files)
  }

  // Handle multiple files
    const handleMultipleFiles = (files) => {
      // Accept both GPX and KML files
      const validFiles = files.filter(f => 
        f.name.toLowerCase().endsWith('.gpx') || 
        f.name.toLowerCase().endsWith('.kml')
      )
    
      if (validFiles.length === 0) return
    
      if (validFiles.length === 1 && onFileLoad) {
        // Single file: use legacy callback
        handleFile(validFiles[0])
      } else if (onMultipleFileLoad) {
        // Multiple files: read all and convert KML to GPX if needed
        Promise.all(validFiles.map(file => {
          return new Promise((resolve) => {
            const reader = new FileReader()
            reader.onload = (e) => {
              let content = e.target.result
              let fileName = file.name
            
              // Convert KML to GPX if needed
              if (file.name.toLowerCase().endsWith('.kml')) {
                content = convertKmlToGpx(content, fileName)
                fileName = fileName.replace('.kml', '.gpx')
              }
            
              resolve({ content, name: fileName })
            }
            reader.readAsText(file)
          })
        })).then(results => {
          // Filter out any files that failed conversion
          const validResults = results.filter(r => r.content && r.content.includes('<gpx'))
          if (validResults.length > 0) {
            onMultipleFileLoad(validResults)
          }
        })
      }
    }

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files)
    if (files.length > 1 || onMultipleFileLoad) {
      handleMultipleFiles(files)
    } else {
      handleFile(files[0])
    }
    // Reset input so same file can be selected again
    e.target.value = ''
  }

  const handleMultiFileSelect = (e) => {
    const files = Array.from(e.target.files)
    if (files.length > 0) {
      setSelectedFiles(files.map(f => f.name))
      handleMultipleFiles(files)
    }
    // Reset input
    e.target.value = ''
  }

  const clearSelectedFiles = () => {
    setSelectedFiles([])
  }

  return (
    <div className="file-upload-container">
      {/* Single file upload (original behavior) */}
            <input
              type="file"
              id="gpxFile"
              accept=".gpx,.kml"
              ref={fileInputRef}
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
      
            {/* Multiple files upload */}
            <input
              type="file"
              id="gpxFilesMulti"
              accept=".gpx,.kml"
              multiple
              ref={multiFileInputRef}
              onChange={handleMultiFileSelect}
              style={{ display: 'none' }}
            />
      
      <div className="upload-buttons">
        <button 
          className="upload-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Carica un singolo file GPX"
        >
          📂 Singolo
        </button>
        
        <button 
          className="upload-btn multi-btn"
          onClick={() => multiFileInputRef.current?.click()}
          title="Carica più file GPX contemporaneamente"
        >
          📂📂 Multipli
        </button>
      </div>
      
      {/* Selected files preview */}
      {selectedFiles.length > 0 && (
        <div className="selected-files">
          <strong>File selezionati ({selectedFiles.length}):</strong>
          <ul>
            {selectedFiles.map((name, i) => (
              <li key={i}>📄 {name}</li>
            ))}
          </ul>
          <button className="clear-files-btn" onClick={clearSelectedFiles}>✕ Rimuovi</button>
        </div>
      )}
      
      <p className="drag-text">oppure trascina qui i file</p>
      
      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <p>🗂️ Trascina qui i file GPX/KML</p>
      </div>
    </div>
  )
}
