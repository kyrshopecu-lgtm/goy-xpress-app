import process from 'node:process';

// Cloudflare Workers no define __dirname. El backend heredado solo usa DATA_FILE
// como respaldo cuando no hay DATABASE_URL; en producción usamos Neon.
if (!process.env.DATA_FILE) process.env.DATA_FILE = '/tmp/goy-xpress-data.json';
