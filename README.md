# 🏔️ Cammini

**App per visualizzare tracce GPX e pianificare itinerari escursionistici**

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![React](https://img.shields.io/badge/React-18.2.0-61dafb)
![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-199432)

## ✨ Funzionalità

### 🏠 Home
- Vista mappa con tutti i tracciati e percorsi salvati
- Segnaposti interattivi per ogni elemento salvato
- Clicca su un segnaposto per aprire la traccia/percorso corrispondente
- Sidebar con lista di tutti i cammini salvati

### 📍 Carica GPX
- **Caricamento multiplo**: Carica più file GPX contemporaneamente 🆕
- Visualizza tracce sovrapposte su mappa interattiva con colori diversi 🆕
- Profilo altimetrico con sincronizzazione mappa ↔ grafico
- Salva e gestisci le tue tracce
- Lista tracce con checkbox per mostrare/nascondere ciascuna traccia 🆕

### 🗺️ Calcola Percorso
- Pianifica itinerari multi-tappa
- Trascina i punti sulla mappa
- Calcola distanza e dislivelli
- **3 servizi di routing disponibili:** 🆕
  - **OSRM** - Open Source Routing Machine (gratuito, nessuna API key)
  - **Valhalla** - Open source routing engine (gratuito via server demo)
  - **GraphHopper** - Fast open-source routing (richiede API key gratuita)
- Esporta percorsi come GPX

### 📚 Itinerari Salvati - Sovrapposizione 🆕
- **Aggiungi più itinerari contemporaneamente sulla mappa**
- Ogni itinerario ha un colore distinto per facile identificazione
- **Profili altimetrici sincronizzati** per ogni itinerario sovrapposto
- **Hover sincronizzato**: passa il mouse sul profilo per vedere il punto sulla mappa
- Tabs per selezionare quale profilo visualizzare
- Pulsante "Modifica" per caricare un itinerario completo con waypoint ed elevazione

### 📥 Esporta GPX
- Esporta tracce caricate come file GPX
- Esporta itinerari sovrapposti come file GPX
- Esporta itinerari calcolati come GPX (con waypoint separati)
- Disponibile dalla Home, da Carica GPX e da Calcola Percorso

### 🗺️ Strati Mappa
- OpenStreetMap
- OpenTopoMap
- Stamen Terrain
- CartoDB Positron/Dark

### 🖥️ Modalità Fullscreen
- Premi ⛶ per massima immersività
- La mappa occupa tutto lo schermo
- In "Calcola Percorso" la modifica è disabilitata in fullscreen

## 🚀 Avvio

```bash
# Installa dipendenze
npm install

# Avvia l'app (server + frontend)
npm start

# Oppure solo frontend in development
npm run dev
```

L'app sarà disponibile su:
- Frontend: http://localhost:5174
- Backend API: http://localhost:3001

## 🧭 Navigazione

- `/` - Home (mappa con tutti i tracciati salvati)
- `/gpx` - Carica GPX (visualizza e gestisci tracce)
- `/route` - Calcola Percorso (pianifica itinerari)

## 🏗️ Struttura

```
src/
├── components/
│   ├── Map.jsx              # Componente mappa Leaflet con supporto multi-traccia
│   ├── ElevationProfile.jsx # Grafico altimetrico D3
│   ├── FileUpload.jsx       # Upload singolo/multiplo file GPX
│   ├── LayerSelector.jsx    # Selettore tipo mappa
│   └── SavedTracks.jsx      # Gestione tracce salvate
├── pages/
│   ├── HomeMap.jsx          # Pagina home con mappa e segnaposti
│   ├── GPXViewer.jsx        # Pagina visualizzazione GPX multipla
│   └── RoutePlanner.jsx     # Pagina pianificazione con routing multiplo
├── App.jsx                  # Componente principale
└── main.jsx                 # Entry point React
```

## 🛠️ Tecnologie

- **React 18** - UI framework
- **React Router** - Navigazione
- **Leaflet** - Mappe OpenStreetMap
- **React-Leaflet** - Wrapper React per Leaflet
- **D3.js** - Grafico altimetrico
- **OSRM API** - Routing
- **Valhalla API** - Routing alternativo
- **GraphHopper API** - Routing ad alte prestazioni
- **OpenTopoData API** - Elevazione
- **SQL.js** - Database locale (tracce salvate)
- **Electron** - App desktop

## 🆕 Ultime Novità

### Caricamento Multiplo GPX
- Seleziona più file GPX contemporaneamente
- Ogni traccia appare con un colore diverso sulla mappa
- Checkbox per mostrare/nascondere singole tracce
- Lista tracce con anteprima dei file selezionati

### Tre Motori di Routing
- **OSRM**: Gratuito, nessuna configurazione necessaria
- **Valhalla**: Gratuito, server demo integrato
- **GraphHopper**: API key gratuita disponibile su graphhopper.com

### Sovrapposizione Itinerari
- Aggiungi più itinerari salvati sulla stessa mappa
- Profilo altimetrico per ogni itinerario
- Hover sincronizzato tra profilo e mappa per ogni traccia
- Tabs colorati per navigare tra i profili

## 📱 Responsive

L'app è ottimizzata per:
- Desktop 💻
- Tablet 📱
- Mobile 📱

## 📄 Licenza

MIT License

---

Sviluppato con ❤️ per gli amanti del trekking e dei cammini