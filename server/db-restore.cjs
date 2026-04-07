const { spawnSync } = require('child_process');

const dumpFile = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error('DATABASE_URL mancante');
}
if (!dumpFile) {
    throw new Error('Specifica il file dump: npm run db:restore -- <file.dump>');
}

const result = spawnSync('pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--dbname', databaseUrl, dumpFile], {
    stdio: 'inherit',
    shell: true
});

if (result.status !== 0) {
    process.exit(result.status || 1);
}

console.log(`Restore completato da: ${dumpFile}`);
