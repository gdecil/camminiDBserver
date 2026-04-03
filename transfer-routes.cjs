// Script per trasferire le routes da un database all'altro
const initSqlJs = require('sql.js');
const fs = require('fs');

const SOURCE_DB = 'C:\\Users\\gdeci\\IaAi\\gpx-viewer-react\\gpx_viewer.db';
const TARGET_DB = 'C:\\Users\\gdeci\\IaAi\\gpx-viewer-react\\gpx_viewer0.db';

async function transferRoutes() {
    const SQL = await initSqlJs();
    
    // Leggi il database sorgente
    let sourceDb;
    if (fs.existsSync(SOURCE_DB)) {
        const buffer = fs.readFileSync(SOURCE_DB);
        sourceDb = new SQL.Database(buffer);
        console.log('✓ Caricato database sorgente');
    } else {
        console.error('✗ Database sorgente non trovato:', SOURCE_DB);
        process.exit(1);
    }
    
    // Leggi tutte le routes dal database sorgente
    const routesResult = sourceDb.exec('SELECT * FROM routes');
    
    if (routesResult.length === 0 || routesResult[0].values.length === 0) {
        console.log('Nessuna route trovata nel database sorgente');
        return;
    }
    
    console.log(`Trovate ${routesResult[0].values.length} routes nel database sorgente`);
    
    // Ottieni i nomi delle colonne
    const columns = routesResult[0].columns;
    console.log('Colonne:', columns);
    
    // Leggi o crea il database destinazione
    let targetDb;
    if (fs.existsSync(TARGET_DB)) {
        const buffer = fs.readFileSync(TARGET_DB);
        targetDb = new SQL.Database(buffer);
        console.log('✓ Caricato database destinazione');
    } else {
        targetDb = new SQL.Database();
        console.log('✓ Creato nuovo database destinazione');
    }
    
    // Verifica che la tabella routes esista
    try {
        targetDb.run(`CREATE TABLE IF NOT EXISTS routes (
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
    } catch (e) {
        // Tabella già esiste
    }
    
    // Inserisci ogni route nel database destinazione
    let inserted = 0;
    routesResult[0].values.forEach(row => {
        // Crea un oggetto dalla riga
        const route = {};
        columns.forEach((col, i) => {
            route[col] = row[i];
        });
        
        // Genera un nuovo ID per evitare conflitti
        const newId = require('crypto').randomUUID();
        
        try {
            targetDb.run(`INSERT INTO routes (id, name, start_lat, start_lng, end_lat, end_lng, distance, coordinates, created_at, elevation, waypoints, ascent, descent, min_ele, max_ele)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    newId,
                    route.name,
                    route.start_lat,
                    route.start_lng,
                    route.end_lat,
                    route.end_lng,
                    route.distance,
                    route.coordinates,
                    route.created_at,
                    route.elevation,
                    route.waypoints,
                    route.ascent,
                    route.descent,
                    route.min_ele,
                    route.max_ele
                ]
            );
            inserted++;
        } catch (e) {
            console.error('Errore inserimento route:', route.name, e.message);
        }
    });
    
    console.log(`✓ Inserite ${inserted} routes nel database destinazione`);
    
    // Salva il database destinazione
    const data = targetDb.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(TARGET_DB, buffer);
    console.log('✓ Database salvato');
    
    sourceDb.close();
    targetDb.close();
    
    console.log('\n=== TRASFERIMENTO COMPLETATO ===');
}

transferRoutes().catch(console.error);