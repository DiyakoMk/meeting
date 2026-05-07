// One-shot helper: creates the database schema if it doesn't exist yet.
// Run with `npm run init-db` after pointing .env at a fresh MySQL.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(here, '..', 'schema.sql');

(async () => {
  const sql = fs.readFileSync(schemaPath, 'utf8');
  // Connect WITHOUT a database first, so we can CREATE DATABASE if missing.
  const root = await mysql.createConnection({
    host: config.db.host, port: config.db.port,
    user: config.db.user, password: config.db.password,
    multipleStatements: true
  });
  await root.query(`CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.query(`USE \`${config.db.database}\``);
  await root.query(sql);
  await root.end();
  console.log(`[init-db] schema applied to ${config.db.database}`);
  process.exit(0);
})().catch(e => {
  console.error('[init-db] failed:', e);
  process.exit(1);
});
