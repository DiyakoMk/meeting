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
  // Per-role allow / deny lists for the few permissions that make sense
  // per-channel (sendMessages mostly, but also managePins / manageMessages
  // in case you want a Mod role that can pin only in one specific channel).
  // Stored as JSON dicts of { role_id: ["sendMessages", ...] }. Allow grants
  // the perm inside this channel only; deny strips it inside this channel
  // only; deny wins on the same role. NULL = no overrides.
  await ensureCol('text_channels',  'permission_allow', 'JSON NULL');
  await ensureCol('text_channels',  'permission_deny',  'JSON NULL');
  await ensureCol('voice_channels', 'permission_allow', 'JSON NULL');
  await ensureCol('voice_channels', 'permission_deny',  'JSON NULL');

  // Customization packs. unlocked_packs is a JSON array of pack ids the
  // user owns ('rainbow', 'aurora', etc). Server / channel / category
  // each carry a small string `custom_style` column that names the pack
  // applied to that surface (NULL = stock look). We use custom_style
  // instead of style because text_channels and voice_channels already
  // own a `style` column for the orb skin (glow/indigo/fire/etc).
  await ensureCol('users',             'unlocked_packs', "JSON NULL");
  await ensureCol('servers',           'style_name',     "VARCHAR(40) NULL");
  await ensureCol('servers',           'style_pin',      "VARCHAR(40) NULL"); await ensureCol('servers', 'style_cover', "VARCHAR(40) NULL"); await ensureCol('servers', 'style_emblem', "VARCHAR(40) NULL");
  await ensureCol('server_categories', 'custom_style',   "VARCHAR(40) NULL");
  await ensureCol('text_channels',     'custom_style',   "VARCHAR(40) NULL");
  await ensureCol('voice_channels',    'custom_style',   "VARCHAR(40) NULL");
  // Voice bitrate (Opus kbps). 64 is the conventional default we'd
  // pick on a fresh row; leaving it nullable so existing rows aren't
  // forced to be backfilled before the column is read.
  await ensureCol('voice_channels',    'bitrate',        "INT NULL");

  // Migrate server_roles primary key from (id) to (server_id, id) so the
  // role id stays unique only within a server. Original schema treated id
  // as globally unique, which broke saveRoles on every server after the
  // first one (duplicate-key INSERT). Detect the old shape and rebuild.
  // STATISTICS uses SEQ_IN_INDEX in both MySQL and MariaDB; ORDINAL_POSITION
  // exists only in MySQL 8+. Use SEQ_IN_INDEX for portability.
  const [pkRows] = await root.query(
    `SELECT COLUMN_NAME, SEQ_IN_INDEX FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'server_roles' AND INDEX_NAME = 'PRIMARY'
      ORDER BY SEQ_IN_INDEX`,
    [config.db.database]);
  const pkCols = pkRows.map(r => r.COLUMN_NAME);
  if (pkCols.length === 1 && pkCols[0] === 'id'){
    console.log('[init-db] migrating server_roles primary key to (server_id, id)');
    await root.query('SET FOREIGN_KEY_CHECKS = 0');
    // server_role_members had FK -> server_roles(id); drop FKs first.
    const [fks] = await root.query(
      `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'server_role_members' AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
      [config.db.database]);
    for (const fk of fks){
      await root.query('ALTER TABLE `server_role_members` DROP FOREIGN KEY `' + fk.CONSTRAINT_NAME + '`');
    }
    // Backfill server_id on server_role_members if missing, then rebuild key.
    const [srmCols] = await root.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'server_role_members'`,
      [config.db.database]);
    const srmHasServer = srmCols.some(c => c.COLUMN_NAME === 'server_id');
    if (!srmHasServer){
      await root.query('ALTER TABLE `server_role_members` ADD COLUMN `server_id` VARCHAR(40) NULL FIRST');
      await root.query(`UPDATE server_role_members srm
        JOIN server_roles sr ON sr.id = srm.role_id
        SET srm.server_id = sr.server_id`);
      await root.query('ALTER TABLE `server_role_members` MODIFY `server_id` VARCHAR(40) NOT NULL');
    }
    await root.query('ALTER TABLE `server_role_members` DROP PRIMARY KEY, ADD PRIMARY KEY (`server_id`, `role_id`, `user_id`)');
    // Rebuild server_roles primary key.
    await root.query('ALTER TABLE `server_roles` DROP PRIMARY KEY, ADD PRIMARY KEY (`server_id`, `id`)');
    // Re-add the FKs with the new composite target.
    await root.query(`ALTER TABLE \`server_role_members\`
      ADD CONSTRAINT \`fk_srm_role\` FOREIGN KEY (\`server_id\`, \`role_id\`)
      REFERENCES \`server_roles\` (\`server_id\`, \`id\`) ON DELETE CASCADE`);
    await root.query(`ALTER TABLE \`server_role_members\`
      ADD CONSTRAINT \`fk_srm_user\` FOREIGN KEY (\`user_id\`)
      REFERENCES \`users\` (\`id\`) ON DELETE CASCADE`);
    await root.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('[init-db] server_roles migration done');
  }

  await root.end();
  console.log(`[init-db] schema applied to ${config.db.database}`);
  process.exit(0);
})().catch(e => {
  console.error('[init-db] failed:', e);
  process.exit(1);
});
