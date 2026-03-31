import { useState, useRef } from 'react'
import './FileUpload.css'

export default function FileUpload({ onFileLoad, onMultipleFileLoad, onGpxContent }) {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState([])
  const fileInputRef = useRef(null)
  const multiFileInputRef = useRef(null)

  // Single file handler
  const handleFile = (file) => {
    if (file && file.name.endsWith('.gpx')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target.result
        onFileLoad(content)
        if (onGpxContent) {
          onGpxContent(content)
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
    const gpxFiles = files.filter(f => f.name.endsWith('.gpx'))
    if (gpxFiles.length === 0) return
    
    if (gpxFiles.length === 1 && onFileLoad) {
      // Single file: use legacy callback
      handleFile(gpxFiles[0])
    } else if (onMultipleFileLoad) {
      // Multiple files: read all and send as array
      Promise.all(gpxFiles.map(file => {
        return new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = (e) => resolve({ content: e.target.result, name: file.name })
          reader.readAsText(file)
        })
      })).then(results => {
        onMultipleFileLoad(results)
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
        accept=".gpx"
        ref={fileInputRef}
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
      
      {/* Multiple files upload */}
      <input
        type="file"
        id="gpxFilesMulti"
        accept=".gpx"
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
        <p>🗂️ Trascina qui i file GPX</p>
      </div>
    </div>
  )
}
