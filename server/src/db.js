import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool(config.db);

// Tiny helper so callers don't have to remember to destructure rows.
export async function q(sql, params) {
  const [rows] = await pool.execute(sql, params || []);
  return rows;
}

export async function one(sql, params) {
  const rows = await q(sql, params);
  return rows[0] || null;
}

// Verify connectivity at boot. Throws on first failure so the process exits.
export async function pingDb() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}
