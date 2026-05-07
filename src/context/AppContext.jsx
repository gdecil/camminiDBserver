import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AppContext = createContext(null)

const STORAGE_KEY = 'cammini-page-state'

// Default state for each page
const PAGE_DEFAULTS = {
  gpx: {
    trackCoordinates: [],
    gpxContent: null,
    currentElevations: null,
    tracks: [],
    activeTrackId: null,
    currentWaypoints: [],
    autoFitTrack: true,
    elevationTooltip: true,
    isProfileDetached: false,
    selectedIndex: null,
    showHikingOverlay: false,
    largeLabels: false,
  },
  route: {
    waypoints: [],
    routeCoordinates: [],
    distance: null,
    elevationData: null,
    segments: [],
    showRouteProfile: false,
    selectedIndex: null,
    autoFitTrack: true,
    elevationTooltip: true,
    showHikingOverlay: false,
    largeLabels: false,
  },
  home: {
    showHikingOverlay: false,
    largeLabels: false,
  },
}

const COMMON_KEYS = ['currentLayer', 'showHikingOverlay', 'largeLabels']

export function AppProvider({ children }) {
  const [currentLayer, setCurrentLayer] = useState(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.currentLayer) return parsed.currentLayer
      }
    } catch {}
    return 'OpenStreetMap'
  })

  const [pageState, setPageState] = useState(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        const state = {}
        for (const page of ['gpx', 'route', 'home']) {
          state[page] = { ...PAGE_DEFAULTS[page], ...(parsed[page] || {}) }
        }
        return state
      }
    } catch {}
    return {
      gpx: { ...PAGE_DEFAULTS.gpx },
      route: { ...PAGE_DEFAULTS.route },
      home: { ...PAGE_DEFAULTS.home },
    }
  })

  // Persist to sessionStorage on changes
  useEffect(() => {
    try {
      const toSave = { currentLayer }
      for (const page of ['gpx', 'route', 'home']) {
        toSave[page] = pageState[page]
      }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
    } catch {}
  }, [currentLayer, pageState])

  const updatePageState = useCallback((page, updates) => {
    setPageState(prev => ({
      ...prev,
      [page]: { ...prev[page], ...updates },
    }))
  }, [])

  const resetPage = useCallback((page) => {
    setPageState(prev => ({
      ...prev,
      [page]: { ...PAGE_DEFAULTS[page] },
    }))
  }, [])

  const resetAll = useCallback(() => {
    setPageState({
      gpx: { ...PAGE_DEFAULTS.gpx },
      route: { ...PAGE_DEFAULTS.route },
      home: { ...PAGE_DEFAULTS.home },
    })
    setCurrentLayer('OpenStreetMap')
    try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
  }, [])

  return (
    <AppContext.Provider value={{
      currentLayer, setCurrentLayer,
      pageState, updatePageState, resetPage, resetAll,
      PAGE_DEFAULTS,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}