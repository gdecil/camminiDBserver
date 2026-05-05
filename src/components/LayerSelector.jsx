import './LayerSelector.css'
import { LAYERS } from './mapConfig'

export default function LayerSelector({ currentLayer, onLayerChange, showHikingOverlay, onOverlayToggle, autoFitTrack, onAutoFitToggle, elevationTooltip, onElevationTooltipToggle, largeLabels, onLargeLabelsToggle, onOpenWaymarkedTrails }) {
  return (
    <div className={`layer-selector ${largeLabels ? 'large-labels' : ''}`}>
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
      {onLargeLabelsToggle && (
        <div className="selector-group">
          {/* <label style={{ cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <input 
              type="checkbox" 
              checked={largeLabels} 
              onChange={(e) => onLargeLabelsToggle(e.target.checked)} 
            />
            🔤 Etichette grandi
          </label> */}
        </div>
      )}
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
          {onOpenWaymarkedTrails && (
            <button
              onClick={onOpenWaymarkedTrails}
              style={{
                marginTop: '6px',
                padding: '4px 10px',
                fontSize: '0.8rem',
                background: '#5a8f5a',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                width: '100%',
                fontWeight: '600'
              }}
              title="Apri Waymarked Trails con la stessa posizione"
            >
              🌐 Apri su Waymarked Trails
            </button>
          )}
          {onAutoFitToggle && (
            <label style={{ cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '6px' }}>
              <input 
                type="checkbox" 
                checked={autoFitTrack} 
                onChange={(e) => onAutoFitToggle(e.target.checked)} 
              />
              📍 Zoom traccia
            </label>
          )}
          {onElevationTooltipToggle && (
            <label style={{ cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '6px' }}>
              <input 
                type="checkbox" 
                checked={elevationTooltip} 
                onChange={(e) => onElevationTooltipToggle(e.target.checked)} 
              />
              📏 Tooltip elevazione
            </label>
          )}
        </div>
      )}
    </div>
  )
}
