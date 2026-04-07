const { spawnSync } = require('child_process');
const path = require('path');

const outputFile = process.argv[2] || path.join(process.cwd(), `cammini_${Date.now()}.dump`);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error('DATABASE_URL mancante');
}

const result = spawnSync('pg_dump', ['--format=custom', '--file', outputFile, databaseUrl], {
    stdio: 'inherit',
    shell: true
});

if (result.status !== 0) {
    process.exit(result.status || 1);
}

console.log(`Dump creato: ${outputFile}`);
