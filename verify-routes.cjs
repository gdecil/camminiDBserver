// Script completo per verificare la correttezza e usabilità dei file database
const initSqlJs = require('sql.js');
const fs = require('fs');

const DATABASES = [
    'C:\\Users\\gdeci\\IaAi\\gpx-viewer-react\\gpx_viewer.db',
    'C:\\Users\\gdeci\\IaAi\\gpx-viewer-react\\gpx_viewer0.db',
    'C:\\Users\\gdeci\\IaAi\\gpx-viewer-react\\gpx_viewerAs.db',
    'C:\\Users\\gdeci\\IaAi\\gpx-viewer-react\\gpx_viewerLen.db'
];

// Colonne attese per ogni tabella
const EXPECTED_COLUMNS = {
    routes: [
        'id', 'name', 'start_lat', 'start_lng', 'end_lat', 'end_lng',
        'distance', 'coordinates', 'created_at', 'elevation', 'waypoints',
        'ascent', 'descent', 'min_ele', 'max_ele', 'photo_folder_path'
    ],
    tracks: [
        'id', 'name', 'coordinates', 'elevation', 'created_at', 'photo_folder_path'
    ]
};

function validateCoordinates(lat, lng, fieldName) {
    const errors = [];
    if (lat === null || lat === undefined) {
        errors.push(`${fieldName}: latitudine mancante`);
    } else if (typeof lat !== 'number' || isNaN(lat)) {
        errors.push(`${fieldName}: latitudine non valida (${lat})`);
    } else if (lat < -90 || lat > 90) {
        errors.push(`${fieldName}: latitudine fuori range (${lat}, deve essere -90/90)`);
    }

    if (lng === null || lng === undefined) {
        errors.push(`${fieldName}: longitudine mancante`);
    } else if (typeof lng !== 'number' || isNaN(lng)) {
        errors.push(`${fieldName}: longitudine non valida (${lng})`);
    } else if (lng < -180 || lng > 180) {
        errors.push(`${fieldName}: longitudine fuori range (${lng}, deve essere -180/180)`);
    }

    return errors;
}

function validateJSON(jsonStr, fieldName) {
    const errors = [];
    if (!jsonStr || jsonStr === 'null') {
        return errors; // Campo opzionale
    }
    try {
        const parsed = JSON.parse(jsonStr);
        if (!Array.isArray(parsed)) {
            errors.push(`${fieldName}: non è un array JSON`);
        }
    } catch (e) {
        errors.push(`${fieldName}: JSON non valido - ${e.message}`);
    }
    return errors;
}

function validateDate(dateStr, fieldName) {
    const errors = [];
    if (!dateStr) {
        return errors;
    }
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
        errors.push(`${fieldName}: data non valida (${dateStr})`);
    }
    return errors;
}

async function verifyDatabase(dbPath) {
    console.log('\n' + '='.repeat(60));
    console.log('VERIFICA DATABASE:', dbPath);
    console.log('='.repeat(60));

    if (!fs.existsSync(dbPath)) {
        console.log('❌ Database non trovato');
        return { success: false, errors: ['File non esiste'] };
    }

    const stats = fs.statSync(dbPath);
    console.log(`✓ File trovato (${(stats.size / 1024).toFixed(2)} KB)`);

    const SQL = await initSqlJs();
    const buffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(buffer);

    const allErrors = [];
    const warnings = [];
    let routesChecked = 0;
    let tracksChecked = 0;

    // 1. Verifica struttura tabelle
    console.log('\n--- STRUTTURA DATABASE ---');
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    if (tables.length === 0) {
        allErrors.push('Nessuna tabella trovata nel database');
    } else {
        console.log(`✓ Trovate ${tables[0].values.length} tabelle:`);
        tables[0].values.forEach(row => {
            console.log(`  - ${row[0]}`);
        });
    }

    // 2. Verifica colonne per ogni tabella
    for (const [tableName, expectedCols] of Object.entries(EXPECTED_COLUMNS)) {
        try {
            const colResult = db.exec(`PRAGMA table_info(${tableName})`);
            if (colResult.length === 0) {
                allErrors.push(`Tabella '${tableName}' non esiste`);
                continue;
            }

            const actualCols = colResult[0].values.map(row => row[1]);
            console.log(`\nTabella '${tableName}': ${actualCols.length} colonne`);

            const missingCols = expectedCols.filter(c => !actualCols.includes(c));
            if (missingCols.length > 0) {
                warnings.push(`Tabella '${tableName}': colonne mancanti: ${missingCols.join(', ')}`);
            }
        } catch (e) {
            allErrors.push(`Tabella '${tableName}': errore - ${e.message}`);
        }
    }

    // 3. Verifica routes
    console.log('\n--- VERIFICA ROUTES ---');
    try {
        const routesResult = db.exec('SELECT * FROM routes');
        if (routesResult.length > 0) {
            const routes = routesResult[0].values;
            const columns = routesResult[0].columns;
            const colMap = {};
            columns.forEach((col, i) => colMap[col] = i);

            console.log(`Trovate ${routes.length} routes`);

            routes.forEach((row, idx) => {
                const routeErrors = [];

                // ID
                if (!row[colMap.id]) routeErrors.push('ID mancante');

                // Nome
                if (!row[colMap.name]) routeErrors.push('Nome mancante');

                // Coordinate
                const startLat = row[colMap.start_lat];
                const startLng = row[colMap.start_lng];
                const endLat = row[colMap.end_lat];
                const endLng = row[colMap.end_lng];
                routeErrors.push(...validateCoordinates(startLat, startLng, `Route ${idx + 1}: start`));
                routeErrors.push(...validateCoordinates(endLat, endLng, `Route ${idx + 1}: end`));

                // JSON fields
                const coords = row[colMap.coordinates];
                const elevation = row[colMap.elevation];
                const waypoints = row[colMap.waypoints];
                routeErrors.push(...validateJSON(coords, `Route ${idx + 1}: coordinates`));
                routeErrors.push(...validateJSON(elevation, `Route ${idx + 1}: elevation`));
                routeErrors.push(...validateJSON(waypoints, `Route ${idx + 1}: waypoints`));

                // Data
                routeErrors.push(...validateDate(row[colMap.created_at], `Route ${idx + 1}: created_at`));

                if (routeErrors.length > 0) {
                    allErrors.push(...routeErrors);
                } else {
                    routesChecked++;
                }
            });
        } else {
            console.log('⚠ Nessuna route trovata');
        }
    } catch (e) {
        allErrors.push(`Errore verifica routes: ${e.message}`);
    }

    // 4. Verifica tracks
    console.log('\n--- VERIFICA TRACKS ---');
    try {
        const tracksResult = db.exec('SELECT * FROM tracks');
        if (tracksResult.length > 0) {
            const tracks = tracksResult[0].values;
            const columns = tracksResult[0].columns;
            const colMap = {};
            columns.forEach((col, i) => colMap[col] = i);

            console.log(`Trovati ${tracks.length} tracks`);

            tracks.forEach((row, idx) => {
                const trackErrors = [];

                // ID
                if (!row[colMap.id]) trackErrors.push('ID mancante');

                // Nome
                if (!row[colMap.name]) trackErrors.push('Nome mancante');

                // Coordinate
                const coords = row[colMap.coordinates];
                trackErrors.push(...validateJSON(coords, `Track ${idx + 1}: coordinates`));

                // Elevation
                const elevation = row[colMap.elevation];
                trackErrors.push(...validateJSON(elevation, `Track ${idx + 1}: elevation`));

                // Data
                trackErrors.push(...validateDate(row[colMap.created_at], `Track ${idx + 1}: created_at`));

                if (trackErrors.length > 0) {
                    allErrors.push(...trackErrors);
                } else {
                    tracksChecked++;
                }
            });
        } else {
            console.log('⚠ Nessun track trovato');
        }
    } catch (e) {
        allErrors.push(`Errore verifica tracks: ${e.message}`);
    }

    // 5. Statistiche
    console.log('\n--- STATISTICHE ---');
    try {
        const routeCount = db.exec('SELECT COUNT(*) FROM routes')[0]?.values[0][0] || 0;
        const trackCount = db.exec('SELECT COUNT(*) FROM tracks')[0]?.values[0][0] || 0;
        console.log(`  Routes: ${routeCount}`);
        console.log(`  Tracks: ${trackCount}`);
        console.log(`  Totale: ${routeCount + trackCount}`);

        const dateRange = db.exec('SELECT MIN(created_at), MAX(created_at) FROM (SELECT created_at FROM routes UNION ALL SELECT created_at FROM tracks)');
        if (dateRange.length > 0 && dateRange[0].values[0][0]) {
            console.log(`  Data più vecchia: ${dateRange[0].values[0][0]}`);
            console.log(`  Data più recente: ${dateRange[0].values[0][1]}`);
        }
    } catch (e) {
        // Ignore stats errors
    }

    db.close();

    // Riepilogo
    console.log('\n' + '='.repeat(60));
    console.log('RIEPILOGO');
    console.log('='.repeat(60));
    console.log(`✓ Routes valide: ${routesChecked}`);
    console.log(`✓ Tracks validi: ${tracksChecked}`);

    if (warnings.length > 0) {
        console.log(`\n⚠ Warning (${warnings.length}):`);
        warnings.forEach(w => console.log(`  - ${w}`));
    }

    if (allErrors.length > 0) {
        console.log(`\n❌ Errori trovati (${allErrors.length}):`);
        allErrors.forEach(e => console.log(`  - ${e}`));
        return { success: false, errors: allErrors, warnings, routesChecked, tracksChecked };
    }

    console.log('\n✅ Database OK - Nessun errore trovato');
    return { success: true, errors: [], warnings, routesChecked, tracksChecked };
}

async function main() {
    console.log('============================================================');
    console.log('  TOOL DI VERIFICA DATABASE GPX VIEWER');
    console.log('============================================================');

    for (const dbPath of DATABASES) {
        await verifyDatabase(dbPath);
    }

    console.log('\n============================================================');
    console.log('  VERIFICA COMPLETATA');
    console.log('============================================================');
}

main().catch(console.error);
