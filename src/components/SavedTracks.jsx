import { useState } from 'react'
import { FixedSizeList as List } from 'react-window'
import './SavedTracks.css'

// Genera GPX dalla traccia
const generateGPX = (track) => {
  const { coordinates, elevation, name } = track
  if (!coordinates || coordinates.length === 0) return null
  
  let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Cammini">\n  <metadata>\n    <name>' + name + '</name>\n  </metadata>\n<trk>\n<trkseg>\n'
  
  coordinates.forEach((coord, i) => {
    const ele = elevation && elevation[i] !== undefined ? elevation[i] : 0
    gpx += `    <trkpt lat="${coord[0]}" lon="${coord[1]}">\n      <ele>${ele}</ele>\n    </trkpt>\n`
  })
  
  gpx += '</trkseg>\n</trk>\n</gpx>'
  return gpx
}

// Scarica il file GPX
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

export default function SavedTracks({ tracks, onLoad, onDelete, onSaveCurrent, onRename, hasTrack }) {
  const [sortBy, setSortBy] = useState('date') // 'name' or 'date'
  const [sortOrder, setSortOrder] = useState('desc') // 'asc' or 'desc'
  const [editingName, setEditingName] = useState(null)
  const [newName, setNewName] = useState('')
  
  // Convert tracks object to array and sort
  const trackArray = Object.keys(tracks).map(name => ({
    name,
    ...tracks[name]
  }))
  
  const sortedTracks = [...trackArray].sort((a, b) => {
    let comparison = 0
    if (sortBy === 'name') {
      comparison = a.name.localeCompare(b.name)
    } else {
      // Sort by date
      const dateA = new Date(a.createdAt || 0)
      const dateB = new Date(b.createdAt || 0)
      comparison = dateB - dateA
    }
    // Apply sort order
    return sortOrder === 'asc' ? comparison : -comparison
  })

  const toggleSortOrder = () => {
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
  }

  const handleRename = (oldName) => {
    if (newName && newName.trim() && newName !== oldName) {
      onRename(oldName, newName.trim())
    }
    setEditingName(null)
    setNewName('')
  }

  const startRename = (name) => {
    setEditingName(name)
    setNewName(name)
  }

  const handleExport = (track) => {
    const gpx = generateGPX(track)
    if (gpx) {
      downloadGPX(gpx, track.name)
    }
  }

  return (
    <div className="saved-tracks-container">
      <h3>📁 Tracce Salvate</h3>
      
      <div className="tracks-actions">
        <button 
          className="action-btn primary" 
          onClick={onSaveCurrent}
          disabled={!hasTrack}
        >
          💾 Salva Traccia
        </button>
      </div>

      {/* Sort options */}
      <div className="sort-options">
        <span>Ordina:</span>
        <button 
          className={`sort-btn ${sortBy === 'name' ? 'active' : ''}`}
          onClick={() => setSortBy('name')}
        >
          Nome
        </button>
        <button 
          className={`sort-btn ${sortBy === 'date' ? 'active' : ''}`}
          onClick={() => setSortBy('date')}
        >
          Data
        </button>
        <button 
          className="sort-btn order-btn"
          onClick={toggleSortOrder}
          title={sortOrder === 'asc' ? 'Crescente' : 'Decrescente'}
        >
          {sortOrder === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      <div className="tracks-list">
        {sortedTracks.length === 0 ? (
          <p className="empty-message">Nessuna traccia salvata</p>
        ) : (
          <List
            height={Math.min(400, sortedTracks.length * 60)}
            itemCount={sortedTracks.length}
            itemSize={60}
            width="100%"
          >
            {({ index, style }) => {
              const track = sortedTracks[index];
              return (
                <div style={style} key={track.name} className="track-item">
                  <div className="track-info">
                    {editingName === track.name ? (
                      <input
                        type="text"
                        className="rename-input"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onBlur={() => handleRename(track.name)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRename(track.name)}
                        autoFocus
                      />
                    ) : (
                      <strong onDoubleClick={() => startRename(track.name)} title="Doppio click per rinominare">
                        {track.name}
                      </strong>
                    )}
                    <small>{new Date(track.createdAt).toLocaleString()}</small>
                  </div>
                  <div className="track-actions">
                    <button 
                      className="small-btn"
                      onClick={() => onLoad(track.name)}
                    >
                      Carica
                    </button>
                    <button 
                      className="small-btn"
                      onClick={() => handleExport(track)}
                      title="Esporta come GPX"
                    >
                      📥
                    </button>
                    <button 
                      className="small-btn danger"
                      onClick={() => onDelete(track.name)}
                    >
                      Elimina
                    </button>
                  </div>
                </div>
              );
            }}
          </List>
        )}
      </div>
    </div>
  )
}
