import 'dotenv/config';

const required = (name, def) => {
  const v = process.env[name] ?? def;
  if (v === undefined) {
    console.error(`[config] missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
};

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  publicOrigin: process.env.PUBLIC_ORIGIN || 'http://localhost:5173',

  db: {
    host: required('DB_HOST', 'localhost'),
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: required('DB_USER', 'orblood'),
    password: process.env.DB_PASSWORD || '',
    database: required('DB_NAME', 'orblood'),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4'
  },

  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },

  uploads: {
    dir: process.env.UPLOAD_DIR || './uploads',
    publicBase: process.env.PUBLIC_UPLOADS_BASE || '/uploads',
    maxBytes: parseInt(process.env.UPLOAD_MAX_BYTES || (5 * 1024 * 1024), 10)
  },

  voice: {
    username: process.env.EXPRESSTURN_USERNAME || '',
    password: process.env.EXPRESSTURN_PASSWORD || '',
    urls: (process.env.EXPRESSTURN_URLS || '').split(',').map(s => s.trim()).filter(Boolean)
  }
};
