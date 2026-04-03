/**
 * Deploy Script for Cammini App
 * 
 * Usage:
 *   1. Copy this project folder to the production server
 *   2. Run: npm install
 *   3. Run: node deploy.cjs
 *   4. Start the server: npm run server
 *   5. Access at: http://<server-ip>:3001
 */

const fs = require('fs');
const path = require('path');

console.log('=== Cammini App Deploy Script ===\n');

// Check if dist folder exists
const distPath = path.join(__dirname, 'dist');
if (!fs.existsSync(distPath)) {
    console.log('ERROR: dist folder not found!');
    console.log('Please run "npm run build" first.\n');
    process.exit(1);
}

console.log('✓ dist folder found');

// Check if node_modules exists
const nodeModulesPath = path.join(__dirname, 'node_modules');
if (!fs.existsSync(nodeModulesPath)) {
    console.log('ERROR: node_modules not found!');
    console.log('Please run "npm install" first.\n');
    process.exit(1);
}

console.log('✓ node_modules found');

// Check database
const dbPath = path.join(__dirname, 'gpx_viewer.db');
if (fs.existsSync(dbPath)) {
    console.log('✓ Database file found (gpx_viewer.db)');
    const stats = fs.statSync(dbPath);
    console.log(`  Size: ${(stats.size / 1024).toFixed(2)} KB`);
} else {
    console.log('⚠ No database file found (will be created on first run)');
}

console.log('\n=== Deployment Ready ===\n');
console.log('To start the server, run:');
console.log('  npm run server');
console.log('\nThe app will be available at:');
console.log('  http://localhost:3001');
console.log('  (or http://<server-ip>:3001 from other computers)\n');
console.log('=== Instructions for Production ===\n');
console.log('1. Copy this entire folder to the production computer');
console.log('2. On the production computer, run:');
console.log('   npm install');
console.log('3. Build the frontend:');
console.log('   npm run build');
console.log('4. Start the server:');
console.log('   npm run server');
console.log('5. Access the app at http://<production-ip>:3001\n');
console.log('NOTE: If you want to keep existing data, copy gpx_viewer.db to the production folder.');
