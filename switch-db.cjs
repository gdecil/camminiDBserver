/**
 * Script per cambiare database e riavviare il server
 * 
 * Usage:
 *   node switch-db.cjs [database_name]
 * 
 * Esempi:
 *   node switch-db.cjs gpx_viewer.db
 *   node switch-db.cjs gpx_viewerAs.db
 *   node switch-db.cjs gpx_viewerLen.db
 */

const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const SERVER_URL = 'http://localhost:3001';
const DB_PATH = path.join(__dirname, 'gpx_viewer.db');

// Database disponibili
const AVAILABLE_DATABASES = [
    'gpx_viewer.db',
    'gpx_viewerAs.db',
    'gpx_viewerLen.db'
];

// Leggi il database target dalla riga di comando
const targetDb = process.argv[2];

if (!targetDb) {
    console.log('=== SWITCH DATABASE ===');
    console.log('\nUsage: node switch-db.cjs <database_name>');
    console.log('\nDatabase disponibili:');
    AVAILABLE_DATABASES.forEach((db, i) => {
        const exists = fs.existsSync(path.join(__dirname, db));
        console.log(`  ${i + 1}. ${db} ${exists ? '✓' : '❌'}`);
    });
    console.log('\nEsempio: node switch-db.cjs gpx_viewerAs.db');
    process.exit(1);
}

// Valida il database
if (!AVAILABLE_DATABASES.includes(targetDb)) {
    console.error(`❌ Database non valido: ${targetDb}`);
    console.log('Database disponibili:', AVAILABLE_DATABASES.join(', '));
    process.exit(1);
}

const dbPath = path.join(__dirname, targetDb);
if (!fs.existsSync(dbPath)) {
    console.error(`❌ Database non trovato: ${targetDb}`);
    process.exit(1);
}

function makeRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, SERVER_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch {
                    resolve(body);
                }
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

async function switchAndRestart() {
    try {
        // 1. Chiama API per cambiare database
        console.log(`\n📡 Chiedo switch a ${targetDb}...`);
        const result = await makeRequest('POST', '/api/switch-db', { dbName: targetDb });
        
        console.log('Risposta:', result);
        
        if (result.needsRestart) {
            console.log('\n⚠️ Il server deve essere riavviato per applicare le modifiche');
        }

        // 2. Leggi il PID del server se esiste
        const pidFile = path.join(__dirname, 'server.pid');
        
        // Prova a trovare e killare il processo del server
        console.log('\n🔄 Riavvio del server...');
        
        // Windows: trova processo sulla porta 3001
        exec('netstat -ano | findstr :3001', (error, stdout) => {
            if (error || !stdout) {
                console.log('Nessun processo trovato sulla porta 3001');
                startServer();
                return;
            }

            // Estrai PID
            const lines = stdout.trim().split('\n');
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 5 && parts[1].includes('3001')) {
                    const pid = parts[4];
                    console.log(`Kill PID: ${pid}`);
                    
                    exec(`taskkill /PID ${pid} /F`, (killErr) => {
                        if (killErr) {
                            console.log('Processo non trovato, tento avvio diretto');
                        }
                        setTimeout(() => startServer(), 1000);
                    });
                    break;
                }
            }
        });

    } catch (error) {
        console.error('❌ Errore:', error.message);
        process.exit(1);
    }
}

function startServer() {
    console.log('🚀 Avvio server...');
    
    // Copia il database target in gpx_viewer.db
    const targetDbPath = path.join(__dirname, targetDb);
    const defaultDbPath = path.join(__dirname, 'gpx_viewer.db');
    
    if (targetDb !== 'gpx_viewer.db') {
        console.log(`📋 Copio ${targetDb} → gpx_viewer.db`);
        fs.copyFileSync(targetDbPath, defaultDbPath);
    }
    
    // Avvia il server
    const serverProcess = exec('npm run server', {
        cwd: __dirname,
        stdio: 'inherit'
    });
    
    // Salva PID
    fs.writeFileSync(path.join(__dirname, 'server.pid'), serverProcess.pid.toString());
    
    console.log(`\n✅ Server avviato con database: ${targetDb}`);
    console.log(`   URL: http://localhost:3001`);
}

switchAndRestart();
