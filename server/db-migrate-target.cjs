const { spawnSync } = require('child_process');
const path = require('path');

const targetUrl = process.env.TARGET_DATABASE_URL;
const sourceUrl = process.env.DATABASE_URL;
const dumpFile = path.join(process.cwd(), `cammini_transfer_${Date.now()}.dump`);

if (!sourceUrl) {
    throw new Error('DATABASE_URL mancante (sorgente)');
}
if (!targetUrl) {
    throw new Error('TARGET_DATABASE_URL mancante (destinazione)');
}

const dump = spawnSync('pg_dump', ['--format=custom', '--file', dumpFile, sourceUrl], {
    stdio: 'inherit',
    shell: true
});
if (dump.status !== 0) process.exit(dump.status || 1);

const restore = spawnSync('pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--dbname', targetUrl, dumpFile], {
    stdio: 'inherit',
    shell: true
});
if (restore.status !== 0) process.exit(restore.status || 1);

console.log(`Migrazione completata verso target. Dump intermedio: ${dumpFile}`);
