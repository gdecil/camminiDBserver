# 🏔️ Cammini DB Server

Versione del progetto con backend PostgreSQL locale (fase 1) e strumenti per futura migrazione cloud.

## Configurazione database (fase 1 locale)

1. Installa PostgreSQL locale.
2. Crea un database (es. `cammini_local`).
3. Imposta variabili ambiente:

```bash
set DATABASE_URL=postgresql://postgres:password@localhost:5432/cammini_local
set PGSSLMODE=disable
```

4. Avvia backend/frontend:

```bash
npm install
npm start
```

## Migrazione da SQLite (`gpx_viewer.db`) a PostgreSQL

```bash
npm run db:migrate-sqlite
```

Puoi specificare un file SQLite alternativo:

```bash
set SQLITE_PATH=C:\path\to\gpx_viewer.db
npm run db:migrate-sqlite
```

## Portabilità tra locazioni/provider

- Crea dump dal DB corrente:

```bash
npm run db:dump -- C:\backup\cammini.dump
```

- Ripristina su nuova destinazione (`DATABASE_URL` puntata al target):

```bash
npm run db:restore -- C:\backup\cammini.dump
```

- Migrazione diretta source -> target:

```bash
set TARGET_DATABASE_URL=postgresql://user:pass@host:5432/cammini_target
npm run db:migrate-target
```

OneDrive/Google Drive/Dropbox sono consigliati per archiviare i dump (`.dump`), non per ospitare il DB live concorrente.

**App per visualizzare tracce GPX e pianificare itinerari escursionistici**

![Version](https://img.shields.io/badge/version-1.1.0-blue)
![React](https://img.shields.io/badge/React-18.2.0-61dafb)
![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-199432)

## ✨ Funzionalità

### 🏠 Home
- Vista mappa con tutti i tracciati e percorsi salvati
- Segnaposti interattivi per ogni elemento salvato
- Clicca su un segnaposto per aprire la traccia/percorso corrispondente
- Sidebar con lista di tutti i cammini salvati

### 📍 Carica GPX
- **Caricamento multiplo**: Carica più file GPX contemporaneamente
- Visualizza tracce sovrapposte su mappa interattiva con colori diversi
- Profilo altimetrico con sincronizzazione mappa ↔ grafico
- Salva e gestisci le tue tracce
- Lista tracce con checkbox per mostrare/nascondere ciascuna traccia
- **Filtro da URL**: Passa `?trackId=X` per mostrare una traccia specifica
- Esporta come GPX e KML (per Google My Maps)

### 🗺️ Calcola Percorso
- Pianifica itinerari multi-tappa
- Trascina i punti sulla mappa
- Calcola distanza e dislivelli
- **🔍 Ricerca luoghi (Geocoding)** - Nuovo!
  - Pulsante 🔍 accanto ad ogni waypoint
  - Cerca indirizzi, città, luoghi con Nominatim (OpenStreetMap)
  - Inserimento automatico coordinate e nome
- **3 servizi di routing disponibili:**
  - **OSRM** - Open Source Routing Machine (gratuito, nessuna API key)
  - **Valhalla** - Open source routing engine (gratuito via server demo)
  - **GraphHopper** - Fast open-source routing (richiede API key gratuita)
- Esporta percorsi come GPX
- **Filtro da URL**: Passa `?routeId=X` per mostrare un percorso specifico

### 📚 Itinerari Salvati - Sovrapposizione
- **Aggiungi più itinerari contemporaneamente sulla mappa**
- Ogni itinerario ha un colore distinto per facile identificazione
- **Profili altimetrici sincronizzati** per ogni itinerario sovrapposto
- **Hover sincronizzato**: passa il mouse sul profilo per vedere il punto sulla mappa
- Tabs per selezionare quale profilo visualizzare
- Pulsante "Modifica" per caricare un itinerario completo con waypoint ed elevazione

### 📷 Associazione Foto alle Tracce
- Associa una cartella locale di foto a una traccia salvata
- Percorso salvato nel database (associato una sola volta)
- Se la cartella non viene trovata, chiede di riassociarla
- Galleria foto scorrevole con anteprime
- **Scansione GPS**: estrae coordinate GPS dai metadata EXIF delle foto
- Foto con GPS visualizzate come marker sulla mappa
- Click su un marker foto → popup con anteprima della foto

### 🗺️ Ricerca POI (Luoghi lungo il percorso)
- Trova Hotel, Guest House, Ostelli, Campeggi, Ristoranti, Cafè e Rifugi
- Risultati raggruppati per categoria
- Ordinamento per distanza, nome o categoria
- Click su un luogo per vedere il segnaposto sulla mappa
- Segnaposto personalizzato con icona e nome del luogo

### 📥 Esporta
- Esporta tracce caricate come file GPX
- Esporta itinerari sovrapposti come file GPX
- Esporta itinerari calcolati come GPX (con waypoint separati)
- **Esporta KML**: per importazione in Google My Maps

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

- `npm run dev` - Avvia Vite dev server

- `npm run build` - Build per produzione

- `npm run preview` - Preview build

- `npm run server` - Avvia il server backend

- `npm run start` - Avvia server e dev contemporaneamente


L'app sarà disponibile su:
- Frontend: http://localhost:5174
- Backend API: http://localhost:3001

## 🧭 Navigazione

- `/` - Home (mappa con tutti i tracciati salvati)
- `/gpx` - Carica GPX (visualizza e gestisci tracce)
- `/gpx?trackId=123` - Carica GPX con filtro traccia specifica
- `/route` - Calcola Percorso (pianifica itinerari)
- `/route?routeId=123` - Calcola Percorso con filtro percorso specifico

## 🏗️ Struttura

```
src/
├── components/
│   ├── Map.jsx              # Componente mappa Leaflet con supporto multi-traccia
│   ├── ElevationProfile.jsx # Grafico altimetrico D3
│   ├── FileUpload.jsx       # Upload singolo/multiplo file GPX
│   ├── LayerSelector.jsx    # Selettore tipo mappa
│   ├── SavedTracks.jsx     # Gestione tracce salvate
│   └── PhotoGallery.jsx     # Galleria foto con EXIF GPS
├── pages/
│   ├── HomeMap.jsx          # Pagina home con mappa e segnaposti
│   ├── GPXViewer.jsx        # Pagina visualizzazione GPX multipla
│   └── RoutePlanner.jsx     # Pagina pianificazione con routing multiplo
├── App.jsx                  # Componente principale
└── main.jsx                 # Entry point React
```

## 🛠️ Tecnologie

- **React 18** - UI framework
- **React Router** - Navigazione con parametri URL
- **Leaflet** - Mappe OpenStreetMap
- **React-Leaflet** - Wrapper React per Leaflet
- **D3.js** - Grafico altimetrico
- **Nominatim API** - Geocoding (ricerca luoghi)
- **OSRM API** - Routing
- **Valhalla API** - Routing alternativo
- **GraphHopper API** - Routing ad alte prestazioni
- **OpenTopoData API** - Elevazione
- **Overpass API** - Punti di interesse (POI)
- **SQL.js** - Database locale (tracce salvate)

## 🆕 Ultime Novità (v1.1.0)

### 🔍 Geocoding - Ricerca Luoghi
- Pulsante 🔍 accanto ad ogni waypoint in "Calcola Percorso"
- Popup di ricerca con Nominatim (OpenStreetMap)
- Risultati in italiano con città e paese
- Click su risultato → coordinate e nome inseriti automaticamente

### 🔗 Filtro da URL
- Da Home, clicca su una traccia/percorso → si apre la pagina con filtro
- `?trackId=123` in Carica GPX mostra solo quella traccia
- `?routeId=123` in Calcola Percorso mostra solo quel percorso
- Badge "Filtro attivo" con pulsante per rimuovere il filtro

### 📷 Galleria Foto Migliorata
- Scansione automatica coordinate GPS da EXIF
- Marker sulla mappa per ogni foto geolocalizzata
- Popup con anteprima al click del marker

## 📱 Responsive

L'app è ottimizzata per:
- Desktop 💻
- Tablet 📱
- Mobile 📱

## 📄 Utility
1. `GET http://localhost:3001/api/databases` - per listare i database
2. `GET http://localhost:3001/api/health` - per vedere il database corrente
3. `POST /api/switch-db` - Cambia database

node switch-db.cjs gpx_viewerAs.db
node verify-routes.cjs
node transfer-routes

  - Body: `{ "dbName": "gpx_viewerAs.db" }`
  - Richiede riavvio del server per applicare le modifiche

## 📄 Licenza

MIT License

---

Sviluppato con ❤️ per gli amanti del trekking e dei cammini