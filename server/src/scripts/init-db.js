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
  // Idempotent migrations for columns added after the initial schema.
  const ensureCol = async (table, column, definition) => {
    const [rows] = await root.query(
      `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [config.db.database, table, column]);
    if (rows[0].n === 0){
      await root.query('ALTER TABLE `' + table + '` ADD COLUMN ' + column + ' ' + definition);
      console.log('[init-db] added ' + table + '.' + column);
    }
  };
  await ensureCol('text_channels',     'visible_role_ids', 'JSON NULL');
  await ensureCol('voice_channels',    'visible_role_ids', 'JSON NULL');
  await ensureCol('server_categories', 'visible_role_ids', 'JSON NULL');
  await root.end();
  console.log(`[init-db] schema applied to ${config.db.database}`);
  process.exit(0);
})().catch(e => {
  console.error('[init-db] failed:', e);
  process.exit(1);
});
