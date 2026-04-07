const { Pool } = require('pg');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is required to connect to PostgreSQL. Create a .env file (see .env.example).');
}

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined
});

async function query(text, params = []) {
    return pool.query(text, params);
}

async function withTransaction(callback) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function initSchema() {
    await query(`
        CREATE TABLE IF NOT EXISTS tracks (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            coordinates JSONB NOT NULL,
            elevation JSONB,
            photo_folder_path TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS routes (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            start_lat DOUBLE PRECISION NOT NULL,
            start_lng DOUBLE PRECISION NOT NULL,
            end_lat DOUBLE PRECISION NOT NULL,
            end_lng DOUBLE PRECISION NOT NULL,
            distance TEXT,
            coordinates JSONB NOT NULL,
            elevation JSONB,
            waypoints JSONB,
            ascent INTEGER,
            descent INTEGER,
            min_ele INTEGER,
            max_ele INTEGER,
            photo_folder_path TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

async function closePool() {
    await pool.end();
}

module.exports = {
    pool,
    query,
    withTransaction,
    initSchema,
    closePool
};
