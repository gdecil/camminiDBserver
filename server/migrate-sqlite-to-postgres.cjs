const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const { withTransaction, initSchema, closePool } = require('./db.cjs');

const sqlitePath = process.env.SQLITE_PATH || path.join(__dirname, '..', 'gpx_viewer.db');

function readTable(db, sql) {
    const result = db.exec(sql);
    if (!result.length) return [];
    const [rows] = result;
    return rows.values.map((valueRow) => {
        const obj = {};
        rows.columns.forEach((col, idx) => {
            obj[col] = valueRow[idx];
        });
        return obj;
    });
}

async function migrate() {
    if (!fs.existsSync(sqlitePath)) {
        throw new Error(`SQLite DB non trovato: ${sqlitePath}`);
    }

    const SQL = await initSqlJs();
    const buffer = fs.readFileSync(sqlitePath);
    const sqliteDb = new SQL.Database(buffer);

    const tracks = readTable(sqliteDb, 'SELECT id, name, coordinates, elevation, photo_folder_path, created_at FROM tracks');
    const routes = readTable(sqliteDb, 'SELECT id, name, start_lat, start_lng, end_lat, end_lng, distance, coordinates, elevation, waypoints, ascent, descent, min_ele, max_ele, photo_folder_path, created_at FROM routes');

    await initSchema();

    await withTransaction(async (client) => {
        for (const t of tracks) {
            await client.query(
                `INSERT INTO tracks (id, name, coordinates, elevation, photo_folder_path, created_at)
                 VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, COALESCE($6::timestamptz, CURRENT_TIMESTAMP))
                 ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    coordinates = EXCLUDED.coordinates,
                    elevation = EXCLUDED.elevation,
                    photo_folder_path = EXCLUDED.photo_folder_path`,
                [t.id, t.name, t.coordinates || '[]', t.elevation || null, t.photo_folder_path || null, t.created_at || null]
            );
        }

        for (const r of routes) {
            await client.query(
                `INSERT INTO routes (id, name, start_lat, start_lng, end_lat, end_lng, distance, coordinates, elevation, waypoints, ascent, descent, min_ele, max_ele, photo_folder_path, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, $13, $14, $15, COALESCE($16::timestamptz, CURRENT_TIMESTAMP))
                 ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    start_lat = EXCLUDED.start_lat,
                    start_lng = EXCLUDED.start_lng,
                    end_lat = EXCLUDED.end_lat,
                    end_lng = EXCLUDED.end_lng,
                    distance = EXCLUDED.distance,
                    coordinates = EXCLUDED.coordinates,
                    elevation = EXCLUDED.elevation,
                    waypoints = EXCLUDED.waypoints,
                    ascent = EXCLUDED.ascent,
                    descent = EXCLUDED.descent,
                    min_ele = EXCLUDED.min_ele,
                    max_ele = EXCLUDED.max_ele,
                    photo_folder_path = EXCLUDED.photo_folder_path`,
                [
                    r.id, r.name, r.start_lat, r.start_lng, r.end_lat, r.end_lng, r.distance || null,
                    r.coordinates || '[]', r.elevation || null, r.waypoints || null, r.ascent || null, r.descent || null,
                    r.min_ele || null, r.max_ele || null, r.photo_folder_path || null, r.created_at || null
                ]
            );
        }
    });

    sqliteDb.close();
    console.log(`Migrazione completata: ${tracks.length} tracks, ${routes.length} routes`);
}

migrate()
    .catch((error) => {
        console.error('Errore migrazione:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await closePool();
    });
