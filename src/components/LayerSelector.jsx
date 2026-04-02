import './LayerSelector.css'
import { LAYERS } from './mapConfig'

export default function LayerSelector({ currentLayer, onLayerChange, showHikingOverlay, onOverlayToggle }) {
  return (
    <div className="layer-selector">
      <div className="selector-group">
        <label>🗺️ Layer:</label>
        <select 
          value={currentLayer} 
          onChange={(e) => onLayerChange(e.target.value)}
        >
          {Object.keys(LAYERS).map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>
      {onOverlayToggle && (
        <div className="selector-group overlay-toggle" style={{ marginTop: '5px', paddingTop: '5px', borderTop: '1px solid #eee' }}>
          <label style={{ cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <input 
              type="checkbox" 
              checked={showHikingOverlay} 
              onChange={(e) => onOverlayToggle(e.target.checked)} 
            />
            🥾 Sentieri (Overlay)
          </label>
        </div>
      )}
    </div>
  )
}
