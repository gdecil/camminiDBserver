const express = require('express');
const cors = require('cors');
const path = require('path');
const initSqlJs = require('sql.js');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = './gpx_viewer.db';
const DIST_PATH = path.join(__dirname, '..', 'dist');

// Lista database disponibili
const AVAILABLE_DATABASES = [
    { name: 'gpx_viewer.db', label: 'Default' },
    { name: 'gpx_viewerAs.db', label: 'Ascenti' },
    { name: 'gpx_viewerLen.db', label: 'Lunghezza' }
];

let db;
let currentDbName = 'gpx_viewer.db';

// Password per operazioni protette (cambiala con una variabile d'ambiente)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'cammini2026';

// IP autorizzati senza password (localhost e rete locale)
const ALLOWED_IPS = ['127.0.0.1', '::1', 'localhost'];

// Helper: verifica se la richiesta è da IP locale o rete locale
function isLocalNetwork(req) {
    // Estrai IP dalla richiesta (supporta anche proxy/nginx)
    let clientIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || '';
    
    // Rimuovi prefix IPv6 se presente
    clientIp = clientIp.replace(/^::ffff:/, '');
    
    // Prova anche X-Forwarded-For header (usato da nginx/proxy)
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
        // Prendi il primo IP nella lista (quello originale del client)
        const ips = forwardedFor.split(',').map(ip => ip.trim());
        clientIp = ips[0];
    }
    
    // Prova anche X-Real-IP
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
        clientIp = realIp.trim();
    }
    
    // Log per debug
    console.log('Client IP rilevato:', clientIp);
    
    // Controlla localhost
    if (ALLOWED_IPS.includes(clientIp) || clientIp === 'localhost') {
        return true;
    }
    
    // Controlla rete locale 192.168.x.x
    if (clientIp.startsWith('192.168.')) {
        return true;
    }
    
    // Controlla rete locale 10.x.x.x
    if (clientIp.startsWith('10.')) {
        return true;
    }
    
    // Controlla rete locale 172.16-31.x.x
    if (clientIp.startsWith('172.')) {
        const parts = clientIp.split('.');
        if (parts.length >= 2) {
            const second = parseInt(parts[1]);
            if (second >= 16 && second <= 31) {
                return true;
            }
        }
    }
    
    return false;
}

// Helper: valida password admin
function validateAdminPassword(req, res, next) {
    // Solo localhost o rete locale può operare senza password
    if (!isLocalNetwork(req)) {
        return res.status(401).json({ 
            error: 'Operazione consentita solo da localhost o rete locale',
            hint: 'Per modifiche remote, usa l\'accesso diretto al server'
        });
    }
    next();
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static files from dist/ folder (for production deployment)
if (fs.existsSync(DIST_PATH)) {
    app.use(express.static(DIST_PATH));
    console.log('Serving static files from:', DIST_PATH);
} else {
    console.log('WARNING: dist/ folder not found. Run npm run build first.');
}

// Initialize database
async function initDatabase() {
    const SQL = await initSqlJs();

    try {
        if (fs.existsSync(DB_PATH)) {
            const buffer = fs.readFileSync(DB_PATH);
            db = new SQL.Database(buffer);
            console.log('Loaded existing database');
        } else {
            db = new SQL.Database();
            console.log('Created new database');
        }
    } catch (err) {
        db = new SQL.Database();
        console.log('Created new database');
    }

    db.run(`CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        coordinates TEXT NOT NULL,
        elevation TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS routes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        start_lat REAL NOT NULL,
        start_lng REAL NOT NULL,
        end_lat REAL NOT NULL,
        end_lng REAL NOT NULL,
        distance TEXT,
        coordinates TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        elevation TEXT,
        waypoints TEXT,
        ascent INTEGER,
        descent INTEGER,
        min_ele INTEGER,
        max_ele INTEGER
    )`);

    // Add missing columns to existing tables
    const columnsToAdd = [
        { table: 'tracks', col: 'elevation', type: 'TEXT' },
        { table: 'routes', col: 'elevation', type: 'TEXT' },
        { table: 'routes', col: 'waypoints', type: 'TEXT' },
        { table: 'routes', col: 'ascent', type: 'INTEGER' },
        { table: 'routes', col: 'descent', type: 'INTEGER' },
        { table: 'routes', col: 'min_ele', type: 'INTEGER' },
        { table: 'routes', col: 'max_ele', type: 'INTEGER' },
        { table: 'tracks', col: 'photo_folder_path', type: 'TEXT' },
        { table: 'routes', col: 'photo_folder_path', type: 'TEXT' }
    ];
    
    columnsToAdd.forEach(({ table, col, type }) => {
        try {
            db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
            console.log(`Added ${col} to ${table}`);
        } catch (e) {
            // Column already exists, ignore
        }
    });

    saveDatabase();
    console.log('Database initialized');
}

function saveDatabase() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    }
}

// ===== PHOTO FOLDER API =====

// Update photo folder path for a track/route
app.put('/api/items/:id/photo-folder', (req, res) => {
    try {
        const { id } = req.params;
        const { photoFolderPath } = req.body;
        
        // Update in tracks first, then routes
        db.run('UPDATE tracks SET photo_folder_path = ? WHERE id = ?', [photoFolderPath, id]);
        db.run('UPDATE routes SET photo_folder_path = ? WHERE id = ?', [photoFolderPath, id]);
        
        saveDatabase();
        res.json({ message: 'Photo folder path updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get photos from a folder (returns file names, not actual file data due to browser security)
app.post('/api/photos/list', (req, res) => {
    try {
        const { folderPath } = req.body;
        if (!folderPath) {
            return res.status(400).json({ error: 'Folder path is required' });
        }

        // Check if folder exists
        if (!fs.existsSync(folderPath)) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        // Read directory and filter image files
        const files = fs.readdirSync(folderPath);
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'];
        const imageFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return imageExtensions.includes(ext);
        });

        // Get file info (name, size, date)
        const fileInfo = imageFiles.map(file => {
            const filePath = path.join(folderPath, file);
            const stats = fs.statSync(filePath);
            return {
                name: file,
                path: path.join(folderPath, file),
                size: stats.size,
                modified: stats.mtime.toISOString()
            };
        });

        res.json({ files: fileInfo, count: fileInfo.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Serve a specific photo file
app.get('/api/photos/*', (req, res) => {
    try {
        const filePath = req.url.replace('/api/photos/', '');
        const decodedPath = decodeURIComponent(filePath);
        
        if (!fs.existsSync(decodedPath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        const ext = path.extname(decodedPath).toLowerCase();
        const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.bmp': 'image/bmp',
            '.tiff': 'image/tiff'
        };

        res.setHeader('Content-Type', mimeTypes[ext] || 'image/jpeg');
        res.sendFile(path.resolve(decodedPath));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== UNIFIED API =====

// Get all saved items (tracks + routes)
app.get('/api/saved', (req, res) => {
    try {
        const tracksResult = db.exec('SELECT id, name, coordinates, elevation, created_at, photo_folder_path FROM tracks ORDER BY created_at DESC');
        const routesResult = db.exec('SELECT id, name, start_lat, start_lng, end_lat, end_lng, distance, coordinates, elevation, waypoints, ascent, descent, min_ele, max_ele, created_at, photo_folder_path FROM routes ORDER BY created_at DESC');
        
        const items = [];
        
        // Add tracks
        if (tracksResult.length > 0) {
            tracksResult[0].values.forEach(row => {
                items.push({
                    id: row[0],
                    name: row[1],
                    type: 'track',
                    coordinates: row[2] ? JSON.parse(row[2]) : [],
                    elevation: row[3] ? JSON.parse(row[3]) : null,
                    created_at: row[4],
                    photoFolderPath: row[5] || null
                });
            });
        }
        
        // Add routes
        if (routesResult.length > 0) {
            routesResult[0].values.forEach(row => {
                items.push({
                    id: row[0],
                    name: row[1],
                    type: 'route',
                    startLat: row[2],
                    startLng: row[3],
                    endLat: row[4],
                    endLng: row[5],
                    distance: row[6],
                    coordinates: row[7] ? JSON.parse(row[7]) : [],
                    elevation: row[8] ? JSON.parse(row[8]) : null,
                    waypoints: row[9] ? JSON.parse(row[9]) : [],
                    ascent: row[10] || null,
                    descent: row[11] || null,
                    minElevation: row[12] || null,
                    maxElevation: row[13] || null,
                    created_at: row[14],
                    photoFolderPath: row[15] || null
                });
            });
        }
        
        // Sort by created_at descending
        items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        res.json(items);
    } catch (error) {
        console.error('Error fetching saved items:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete saved item (by id, regardless of type)
app.delete('/api/saved/:id', validateAdminPassword, (req, res) => {
    try {
        const { id } = req.params;
        
        // Try to delete from tracks first
        db.run('DELETE FROM tracks WHERE id = ?', [id]);
        // Then try routes
        db.run('DELETE FROM routes WHERE id = ?', [id]);
        
        saveDatabase();
        res.json({ message: 'Item deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Rename saved item
app.put('/api/saved/:id', validateAdminPassword, (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }
        
        // Try tracks first, then routes
        const trackResult = db.exec('SELECT id FROM tracks WHERE id = ?', [id]);
        if (trackResult.length > 0 && trackResult[0].values.length > 0) {
            db.run('UPDATE tracks SET name = ? WHERE id = ?', [name, id]);
        } else {
            db.run('UPDATE routes SET name = ? WHERE id = ?', [name, id]);
        }
        
        saveDatabase();
        res.json({ message: 'Item renamed successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== LEGACY TRACKS API (kept for compatibility) =====

app.get('/api/tracks', (req, res) => {
    try {
        const result = db.exec('SELECT id, name, coordinates, elevation, created_at, photo_folder_path FROM tracks ORDER BY created_at DESC');
        if (result.length === 0) return res.json([]);
        
        const tracks = result[0].values.map(row => ({
            id: row[0],
            name: row[1],
            coordinates: row[2] || '[]',
            elevation: row[3] || null,
            created_at: row[4],
            photoFolderPath: row[5] || null
        }));
        res.json(tracks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/tracks', (req, res) => {
    try {
        const { name, coordinates, elevation, photoFolderPath } = req.body;
        if (!name || !coordinates) {
            return res.status(400).json({ error: 'Name and coordinates are required' });
        }

        console.log(`Saving track "${name}" with ${coordinates.length} coordinates and ${elevation ? elevation.length : 0} elevations`);

        const trackId = crypto.randomUUID();
        const elevationStr = elevation ? JSON.stringify(elevation) : null;
        db.run('INSERT INTO tracks (id, name, coordinates, elevation, photo_folder_path) VALUES (?, ?, ?, ?, ?)', 
            [trackId, name, JSON.stringify(coordinates), elevationStr, photoFolderPath || null]);
        saveDatabase();

        res.json({ id: trackId, message: 'Track saved successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/tracks/:id', validateAdminPassword, (req, res) => {
    try {
        const { id } = req.params;
        db.run('DELETE FROM tracks WHERE id = ?', [id]);
        saveDatabase();
        res.json({ message: 'Track deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/tracks/:id', validateAdminPassword, (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }
        db.run('UPDATE tracks SET name = ? WHERE id = ?', [name, id]);
        saveDatabase();
        res.json({ message: 'Track renamed successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== LEGACY ROUTES API (kept for compatibility) =====

app.get('/api/routes', (req, res) => {
    try {
        const result = db.exec('SELECT id, name, start_lat, start_lng, end_lat, end_lng, distance, coordinates, elevation, waypoints, ascent, descent, min_ele, max_ele, created_at, photo_folder_path FROM routes ORDER BY created_at DESC');
        if (result.length === 0) return res.json([]);
        
        const routes = result[0].values.map(row => ({
            id: row[0],
            name: row[1],
            start_lat: row[2],
            start_lng: row[3],
            end_lat: row[4],
            end_lng: row[5],
            distance: row[6],
            coordinates: row[7] ? (typeof row[7] === 'string' ? JSON.parse(row[7]) : row[7]) : [],
            elevation: row[8] ? (typeof row[8] === 'string' ? JSON.parse(row[8]) : row[8]) : null,
            waypoints: row[9] ? (typeof row[9] === 'string' ? JSON.parse(row[9]) : row[9]) : [],
            ascent: row[10],
            descent: row[11],
            min_ele: row[12],
            max_ele: row[13],
            created_at: row[14],
            photoFolderPath: row[15] || null
        }));
        res.json(routes);
    } catch (error) {
        console.error('Error fetching routes:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/routes', (req, res) => {
    try {
        const { name, startLat, startLng, endLat, endLng, distance, coordinates, elevation, waypoints, ascent, descent, minElevation, maxElevation, photoFolderPath } = req.body;
        if (!name || !coordinates) {
            return res.status(400).json({ error: 'All route fields are required' });
        }

        const routeId = crypto.randomUUID();
        db.run(`INSERT INTO routes (id, name, start_lat, start_lng, end_lat, end_lng, distance, coordinates, elevation, waypoints, ascent, descent, min_ele, max_ele, photo_folder_path)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [routeId, name, startLat, startLng, endLat, endLng, distance, 
             JSON.stringify(coordinates), 
             elevation ? JSON.stringify(elevation) : null,
             waypoints ? JSON.stringify(waypoints) : null,
             ascent || null, descent || null, 
             minElevation || null, maxElevation || null,
             photoFolderPath || null]);
        saveDatabase();

        res.json({ id: routeId, message: 'Route saved successfully' });
    } catch (error) {
        console.error('Error saving route:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/routes/:id', validateAdminPassword, (req, res) => {
    try {
        const { id } = req.params;
        db.run('DELETE FROM routes WHERE id = ?', [id]);
        saveDatabase();
        res.json({ message: 'Route deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/routes/:id', validateAdminPassword, (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }
        
        db.run('UPDATE routes SET name = ? WHERE id = ?', [name, id]);
        saveDatabase();
        res.json({ message: 'Route renamed successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', currentDb: currentDbName });
});

// ===== DATABASE MANAGEMENT API =====

// Get list of available databases
app.get('/api/databases', (req, res) => {
    try {
        const databases = AVAILABLE_DATABASES.map(db => ({
            ...db,
            exists: fs.existsSync(path.join(__dirname, '..', db.name)),
            current: db.name === currentDbName
        }));
        res.json({ databases, currentDb: currentDbName });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Switch to a different database (requires server restart)
app.post('/api/switch-db', (req, res) => {
    try {
        const { dbName } = req.body;
        
        if (!dbName) {
            return res.status(400).json({ error: 'dbName is required' });
        }
        
        const dbConfig = AVAILABLE_DATABASES.find(d => d.name === dbName);
        if (!dbConfig) {
            return res.status(400).json({ 
                error: 'Database non valido',
                available: AVAILABLE_DATABASES.map(d => d.name)
            });
        }
        
        const dbPath = path.join(__dirname, '..', dbName);
        if (!fs.existsSync(dbPath)) {
            return res.status(404).json({ error: `Database non trovato: ${dbName}` });
        }
        
        // Salva il database corrente prima di uscire
        saveDatabase();
        
        // Aggiorna il percorso del database
        currentDbName = dbName;
        
        res.json({ 
            message: `Database cambiato a ${dbName}. Riavvia il server per applicare le modifiche.`,
            newDb: dbName,
            needsRestart: true
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Proxy endpoint for OpenTopoData to bypass CORS
app.post('/api/elevation', async (req, res) => {
    let { locations } = req.body;
    
    if (!locations || !Array.isArray(locations)) {
        return res.status(400).json({ error: 'Locations array required', received: typeof locations });
    }
    
    // Limit to 100 locations (API limit)
    if (locations.length > 100) {
        const step = Math.floor(locations.length / 100)
        locations = locations.filter((_, i) => i % step === 0 || i === locations.length - 1).slice(0, 100)
    }
    
    const locationString = locations.map(loc => 
        `${loc.lat.toFixed(6)},${loc.lng.toFixed(6)}`
    ).join('|');
    
    console.log('Location count:', locations.length);
    
    try {
        const url = `https://api.opentopodata.org/v1/srtm30m?locations=${encodeURIComponent(locationString)}`;
        const response = await fetch(url);
        const data = await response.json();
        console.log('OpenTopoData response status:', data.status);
        res.json(data);
    } catch (error) {
        console.error('Error calling OpenTopoData:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start server
async function start() {
    await initDatabase();
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
}

start();

process.on('SIGINT', () => {
    console.log('Saving database...');
    if (db) saveDatabase();
    process.exit(0);
});