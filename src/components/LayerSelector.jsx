import './LayerSelector.css'
import { LAYERS } from './mapConfig'

export default function LayerSelector({ currentLayer, onLayerChange, showHikingOverlay, onOverlayToggle, autoFitTrack, onAutoFitToggle, elevationTooltip, onElevationTooltipToggle, largeLabels, onLargeLabelsToggle, onOpenWaymarkedTrails, onOpenReliefMaps, onOpenHistoricalMaps, onOpenOldMaps }) {
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
        <div className="selector-group overlay-toggle" style={{ marginTop: '5px', paddingTop: '5px', borderTop: '1px solid #eee', display: 'flex', gap: '12px' }}>
          <div style={{ flex: '2', minWidth: 0 }}>
            <label style={{ cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <input 
                type="checkbox" 
                checked={showHikingOverlay} 
                onChange={(e) => onOverlayToggle(e.target.checked)} 
              />
              🥾 Sentieri (Overlay)
            </label>
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
          {(onOpenWaymarkedTrails || onOpenReliefMaps || onOpenHistoricalMaps || onOpenOldMaps) && (
            <div style={{ flex: '2', minWidth: 0, display: 'flex', flexDirection: 'row', gap: '4px' }}>
              <div style={{ flex: '1', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {onOpenWaymarkedTrails && (
                  <button
                    onClick={onOpenWaymarkedTrails}
                    style={{
                      padding: '4px 8px',
                      fontSize: '0.75rem',
                      background: '#5a8f5a',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      width: '100%',
                      fontWeight: '600',
                      whiteSpace: 'nowrap'
                    }}
                    title="Apri Waymarked Trails con la stessa posizione"
                  >
                    🥾 Waymarked Trails
                  </button>
                )}
                {onOpenReliefMaps && (
                  <button
                    onClick={onOpenReliefMaps}
                    style={{
                      padding: '4px 8px',
                      fontSize: '0.75rem',
                      background: '#5a7fb5',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      width: '100%',
                      fontWeight: '600',
                      whiteSpace: 'nowrap'
                    }}
                    title="Apri Relief Maps con la stessa posizione"
                  >
                    🗺️ Relief Maps
                  </button>
                )}
                {onOpenHistoricalMaps && (
                  <button
                    onClick={onOpenHistoricalMaps}
                    style={{
                      padding: '4px 8px',
                      fontSize: '0.75rem',
                      background: '#8B5E3C',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      width: '100%',
                      fontWeight: '600',
                      whiteSpace: 'nowrap'
                    }}
                    title="Apri OpenHistoricalMap con la stessa posizione"
                  >
                    🏛️ Historical
                  </button>
                )}
              </div>
              {onOpenOldMaps && (
                <div style={{ flex: '1', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <button
                    onClick={onOpenOldMaps}
                    style={{
                      padding: '4px 8px',
                      fontSize: '0.75rem',
                      background: '#D4A76A',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      width: '100%',
                      fontWeight: '600',
                      whiteSpace: 'nowrap'
                    }}
                    title="Apri Old Maps Online"
                  >
                    🗺️ Old Maps
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}