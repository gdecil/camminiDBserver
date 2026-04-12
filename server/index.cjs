const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { query, withTransaction, initSchema, closePool } = require('./db.cjs');

const app = express();
const PORT = process.env.PORT || 3001;
const DIST_PATH = path.join(__dirname, '..', 'dist');

const currentDbName = process.env.DATABASE_URL || 'postgresql://unset';

// Password per operazioni protette (cambiala con una variabile d'ambiente)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'cammini2026';

// IP autorizzati senza password (localhost e rete locale)
const ALLOWED_IPS = ['127.0.0.1', '::1', 'localhost'];

function isLocalNetwork(req) {
    let clientIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || '';
    clientIp = clientIp.replace(/^::ffff:/, '');

    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
        const ips = forwardedFor.split(',').map((ip) => ip.trim());
        clientIp = ips[0];
    }

    const realIp = req.headers['x-real-ip'];
    if (realIp) {
        clientIp = realIp.trim();
    }

    console.log('Client IP rilevato:', clientIp);

    if (ALLOWED_IPS.includes(clientIp) || clientIp === 'localhost') return true;
    if (clientIp.startsWith('192.168.')) return true;
    if (clientIp.startsWith('10.')) return true;
    if (clientIp.startsWith('172.')) {
        const parts = clientIp.split('.');
        if (parts.length >= 2) {
            const second = parseInt(parts[1], 10);
            if (second >= 16 && second <= 31) return true;
        }
    }
    return false;
}

function validateAdminPassword(req, res, next) {
    if (!isLocalNetwork(req)) {
        return res.status(401).json({
            error: 'Operazione consentita solo da localhost o rete locale',
            hint: "Per modifiche remote, usa l'accesso diretto al server"
        });
    }
    if (ADMIN_PASSWORD && req.headers['x-admin-password'] && req.headers['x-admin-password'] !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Password admin non valida' });
    }
    next();
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));

if (fs.existsSync(DIST_PATH)) {
    app.use(express.static(DIST_PATH));
    console.log('Serving static files from:', DIST_PATH);
} else {
    console.log('WARNING: dist/ folder not found. Run npm run build first.');
}

async function initDatabase() {
    await initSchema();
    console.log('Database initialized');
}

function toJsonValue(value, fallback) {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string') return JSON.parse(value);
    return value;
}

function toJsonString(value, fallback = '[]') {
    if (value === null || value === undefined) return fallback;
    return typeof value === 'string' ? value : JSON.stringify(value);
}

app.put('/api/items/:id/photo-folder', async (req, res) => {
    try {
        const { id } = req.params;
        const { photoFolderPath } = req.body;
        await withTransaction(async (client) => {
            await client.query('UPDATE tracks SET photo_folder_path = $1 WHERE id = $2', [photoFolderPath, id]);
            await client.query('UPDATE routes SET photo_folder_path = $1 WHERE id = $2', [photoFolderPath, id]);
        });
        res.json({ message: 'Photo folder path updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/photos/list', (req, res) => {
    try {
        const { folderPath } = req.body;
        if (!folderPath) return res.status(400).json({ error: 'Folder path is required' });
        if (!fs.existsSync(folderPath)) return res.status(404).json({ error: 'Folder not found' });

        const files = fs.readdirSync(folderPath);
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'];
        const imageFiles = files.filter((file) => imageExtensions.includes(path.extname(file).toLowerCase()));

        const fileInfo = imageFiles.map((file) => {
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

app.get('/api/photos/*', (req, res) => {
    try {
        const filePath = req.url.replace('/api/photos/', '');
        const decodedPath = decodeURIComponent(filePath);
        if (!fs.existsSync(decodedPath)) return res.status(404).json({ error: 'File not found' });

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

app.get('/api/saved', async (_req, res) => {
    try {
        const tracksResult = await query('SELECT id, name, coordinates, elevation, created_at, photo_folder_path FROM tracks ORDER BY created_at DESC');
        const routesResult = await query('SELECT id, name, start_lat, start_lng, end_lat, end_lng, distance, coordinates, elevation, waypoints, ascent, descent, min_ele, max_ele, created_at, photo_folder_path FROM routes ORDER BY created_at DESC');
        const items = [];

        tracksResult.rows.forEach((row) => {
            items.push({
                id: row.id,
                name: row.name,
                type: 'track',
                coordinates: toJsonValue(row.coordinates, []),
                elevation: toJsonValue(row.elevation, null),
                created_at: row.created_at,
                photoFolderPath: row.photo_folder_path || null
            });
        });

        routesResult.rows.forEach((row) => {
            items.push({
                id: row.id,
                name: row.name,
                type: 'route',
                startLat: row.start_lat,
                startLng: row.start_lng,
                endLat: row.end_lat,
                endLng: row.end_lng,
                distance: row.distance,
                coordinates: toJsonValue(row.coordinates, []),
                elevation: toJsonValue(row.elevation, null),
                waypoints: toJsonValue(row.waypoints, []),
                ascent: row.ascent || null,
                descent: row.descent || null,
                minElevation: row.min_ele || null,
                maxElevation: row.max_ele || null,
                created_at: row.created_at,
                photoFolderPath: row.photo_folder_path || null
            });
        });

        items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        res.json(items);
    } catch (error) {
        console.error('Error fetching saved items:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/saved/:id', validateAdminPassword, async (req, res) => {
    try {
        const { id } = req.params;
        await withTransaction(async (client) => {
            await client.query('DELETE FROM tracks WHERE id = $1', [id]);
            await client.query('DELETE FROM routes WHERE id = $1', [id]);
        });
        res.json({ message: 'Item deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/saved/:id', validateAdminPassword, async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });

        const trackResult = await query('SELECT id FROM tracks WHERE id = $1', [id]);
        if (trackResult.rowCount > 0) {
            await query('UPDATE tracks SET name = $1 WHERE id = $2', [name, id]);
        } else {
            await query('UPDATE routes SET name = $1 WHERE id = $2', [name, id]);
        }

        res.json({ message: 'Item renamed successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/tracks', async (_req, res) => {
    try {
        const result = await query('SELECT id, name, coordinates, elevation, waypoints, created_at, photo_folder_path FROM tracks ORDER BY created_at DESC');
        if (result.rowCount === 0) return res.json([]);
        const tracks = result.rows.map((row) => ({
            id: row.id,
            name: row.name,
            coordinates: toJsonString(row.coordinates, '[]'),
            elevation: row.elevation ? toJsonString(row.elevation, null) : null,
            waypoints: row.waypoints ? toJsonString(row.waypoints, []) : [],
            created_at: row.created_at,
            photoFolderPath: row.photo_folder_path || null
        }));
        res.json(tracks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/tracks', async (req, res) => {
    try {
        const { name, coordinates, elevation, waypoints, photoFolderPath } = req.body;
        if (!name || !coordinates) return res.status(400).json({ error: 'Name and coordinates are required' });

        const trackId = crypto.randomUUID();
        await query(
            'INSERT INTO tracks (id, name, coordinates, elevation, waypoints, photo_folder_path) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6)',
            [trackId, name, JSON.stringify(coordinates), elevation ? JSON.stringify(elevation) : null, waypoints ? JSON.stringify(waypoints) : null, photoFolderPath || null]
        );
        res.json({ id: trackId, message: 'Track saved successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/tracks/:id', validateAdminPassword, async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM tracks WHERE id = $1', [id]);
        res.json({ message: 'Track deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/tracks/:id', validateAdminPassword, async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });
        await query('UPDATE tracks SET name = $1 WHERE id = $2', [name, id]);
        res.json({ message: 'Track renamed successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/routes', async (_req, res) => {
    try {
        const result = await query('SELECT id, name, start_lat, start_lng, end_lat, end_lng, distance, coordinates, elevation, waypoints, ascent, descent, min_ele, max_ele, created_at, photo_folder_path FROM routes ORDER BY created_at DESC');
        if (result.rowCount === 0) return res.json([]);
        const routes = result.rows.map((row) => ({
            id: row.id,
            name: row.name,
            start_lat: row.start_lat,
            start_lng: row.start_lng,
            end_lat: row.end_lat,
            end_lng: row.end_lng,
            distance: row.distance,
            coordinates: toJsonValue(row.coordinates, []),
            elevation: toJsonValue(row.elevation, null),
            waypoints: toJsonValue(row.waypoints, []),
            ascent: row.ascent,
            descent: row.descent,
            min_ele: row.min_ele,
            max_ele: row.max_ele,
            created_at: row.created_at,
            photoFolderPath: row.photo_folder_path || null
        }));
        res.json(routes);
    } catch (error) {
        console.error('Error fetching routes:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/routes', async (req, res) => {
    try {
        const { name, startLat, startLng, endLat, endLng, distance, coordinates, elevation, waypoints, ascent, descent, minElevation, maxElevation, photoFolderPath } = req.body;
        if (!name || !coordinates) return res.status(400).json({ error: 'All route fields are required' });

        const routeId = crypto.randomUUID();
        await query(
            `INSERT INTO routes (id, name, start_lat, start_lng, end_lat, end_lng, distance, coordinates, elevation, waypoints, ascent, descent, min_ele, max_ele, photo_folder_path)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, $13, $14, $15)`,
            [routeId, name, startLat, startLng, endLat, endLng, distance, JSON.stringify(coordinates), elevation ? JSON.stringify(elevation) : null, waypoints ? JSON.stringify(waypoints) : null, ascent || null, descent || null, minElevation || null, maxElevation || null, photoFolderPath || null]
        );
        res.json({ id: routeId, message: 'Route saved successfully' });
    } catch (error) {
        console.error('Error saving route:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/routes/:id', validateAdminPassword, async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM routes WHERE id = $1', [id]);
        res.json({ message: 'Route deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/routes/:id', validateAdminPassword, async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });
        await query('UPDATE routes SET name = $1 WHERE id = $2', [name, id]);
        res.json({ message: 'Route renamed successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/health', (_req, res) => {
    res.json({ status: 'OK', currentDb: currentDbName });
});

app.get('/api/databases', (_req, res) => {
    res.json({
        databases: [{ name: 'postgres', label: 'PostgreSQL', exists: true, current: true }],
        currentDb: currentDbName
    });
});

app.post('/api/switch-db', (_req, res) => {
    res.status(400).json({
        error: 'Switch DB non supportato con PostgreSQL. Usa DATABASE_URL e riavvia il server.',
        needsRestart: true
    });
});

app.post('/api/elevation', async (req, res) => {
    let { locations } = req.body;
    if (!locations || !Array.isArray(locations)) {
        return res.status(400).json({ error: 'Locations array required', received: typeof locations });
    }
    if (locations.length > 100) {
        const step = Math.floor(locations.length / 100);
        locations = locations.filter((_, i) => i % step === 0 || i === locations.length - 1).slice(0, 100);
    }
    const locationString = locations.map((loc) => `${loc.lat.toFixed(6)},${loc.lng.toFixed(6)}`).join('|');
    try {
        const url = `https://api.opentopodata.org/v1/srtm30m?locations=${encodeURIComponent(locationString)}`;
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error calling OpenTopoData:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get photo geolocations for a track
app.get('/api/tracks/:id/photos', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query(
            'SELECT id, track_id, photo_path, photo_name, latitude, longitude, created_at, updated_at FROM photo_geolocations WHERE track_id = $1 ORDER BY created_at DESC',
            [id]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching photo geolocations:', error);
        res.status(500).json({ error: error.message });
    }
});

// Save photo geolocation for a track
app.post('/api/tracks/:id/photos', async (req, res) => {
    try {
        const { id: trackId } = req.params;
        const { photoPath, photoName, latitude, longitude } = req.body;
        
        if (!photoPath || !photoName || latitude === undefined || longitude === undefined) {
            return res.status(400).json({ error: 'photoPath, photoName, latitude, and longitude are required' });
        }

        // Check if photo already has geolocation for this track
        const existing = await query(
            'SELECT id FROM photo_geolocations WHERE track_id = $1 AND photo_path = $2',
            [trackId, photoPath]
        );

        if (existing.rowCount > 0) {
            // Update existing
            await query(
                'UPDATE photo_geolocations SET latitude = $1, longitude = $2, updated_at = CURRENT_TIMESTAMP WHERE track_id = $3 AND photo_path = $4',
                [latitude, longitude, trackId, photoPath]
            );
            res.json({ message: 'Photo geolocation updated', updated: true });
        } else {
            // Insert new
            const geoId = crypto.randomUUID();
            await query(
                'INSERT INTO photo_geolocations (id, track_id, photo_path, photo_name, latitude, longitude) VALUES ($1, $2, $3, $4, $5, $6)',
                [geoId, trackId, photoPath, photoName, latitude, longitude]
            );
            res.json({ id: geoId, message: 'Photo geolocation saved', created: true });
        }
    } catch (error) {
        console.error('Error saving photo geolocation:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update photo geolocation (for drag and drop)
app.put('/api/tracks/:id/photos', async (req, res) => {
    try {
        const { id: trackId } = req.params;
        const { photoPath, latitude, longitude } = req.body;
        
        if (!photoPath || latitude === undefined || longitude === undefined) {
            return res.status(400).json({ error: 'photoPath, latitude, and longitude are required' });
        }

        const result = await query(
            'UPDATE photo_geolocations SET latitude = $1, longitude = $2, updated_at = CURRENT_TIMESTAMP WHERE track_id = $3 AND photo_path = $4 RETURNING id',
            [latitude, longitude, trackId, photoPath]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Photo geolocation not found' });
        }

        res.json({ message: 'Photo geolocation updated', photoPath, latitude, longitude });
    } catch (error) {
        console.error('Error updating photo geolocation:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete photo geolocation
app.delete('/api/tracks/:id/photos/:photoPath', async (req, res) => {
    try {
        const { id: trackId } = req.params;
        const { photoPath } = req.params;
        
        await query(
            'DELETE FROM photo_geolocations WHERE track_id = $1 AND photo_path = $2',
            [trackId, decodeURIComponent(photoPath)]
        );
        
        res.json({ message: 'Photo geolocation deleted' });
    } catch (error) {
        console.error('Error deleting photo geolocation:', error);
        res.status(500).json({ error: error.message });
    }
});

async function start() {
    await initDatabase();
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
}

start();

process.on('SIGINT', () => {
    closePool().finally(() => process.exit(0));
});
