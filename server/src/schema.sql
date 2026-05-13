-- ORBLOOD MySQL schema
-- Drop-in starter for a backend that talks to the in-page `backend` adapter.
-- Tables map 1:1 onto the snapshot payload returned by GET /me/snapshot.
-- Tested on MySQL 8.0 / MariaDB 10.6+ with utf8mb4.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------- USERS / AUTH ----------
CREATE TABLE IF NOT EXISTS users (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email           VARCHAR(190) NOT NULL UNIQUE,
  handle          VARCHAR(64)  NOT NULL UNIQUE,
  name            VARCHAR(120) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  phone           VARCHAR(40),
  bio             TEXT,
  base_color      VARCHAR(16),
  av_image        MEDIUMTEXT,    -- base64 data URL or external URL
  banner_image    MEDIUMTEXT,
  rank_label      VARCHAR(40)  DEFAULT 'EXPLORER',
  friends_only    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_tokens (
  token       CHAR(64)        NOT NULL,
  user_id     BIGINT UNSIGNED NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  DATETIME NOT NULL,
  PRIMARY KEY (token),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- SOCIAL ----------
CREATE TABLE IF NOT EXISTS friendships (
  user_id    BIGINT UNSIGNED NOT NULL,
  friend_id  BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, friend_id),
  FOREIGN KEY (user_id)   REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS friend_requests (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  from_id     BIGINT UNSIGNED NOT NULL,
  to_id       BIGINT UNSIGNED NOT NULL,
  status      ENUM('pending','accepted','rejected','cancelled') NOT NULL DEFAULT 'pending',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_from_to (from_id, to_id),
  FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (to_id)   REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS blocked_users (
  user_id    BIGINT UNSIGNED NOT NULL,
  blocked_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, blocked_id),
  FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- DMs ----------
CREATE TABLE IF NOT EXISTS dm_threads (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_a       BIGINT UNSIGNED NOT NULL,
  user_b       BIGINT UNSIGNED NOT NULL,    -- equals user_a for Saved Messages
  is_saved     TINYINT(1) NOT NULL DEFAULT 0,
  last_msg_at  DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_pair (user_a, user_b),
  FOREIGN KEY (user_a) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (user_b) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dm_messages (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  thread_id   BIGINT UNSIGNED NOT NULL,
  sender_id   BIGINT UNSIGNED NOT NULL,
  body        TEXT,
  payload_json JSON NULL,        -- replyTo, attachment, type, etc.
  status      ENUM('sent','delivered','read') NOT NULL DEFAULT 'sent',
  edited      TINYINT(1) NOT NULL DEFAULT 0,
  deleted     TINYINT(1) NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_thread_time (thread_id, created_at),
  FOREIGN KEY (thread_id) REFERENCES dm_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dm_pinned (
  thread_id   BIGINT UNSIGNED NOT NULL,
  message_id  BIGINT UNSIGNED NOT NULL,
  pinned_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (thread_id),
  FOREIGN KEY (thread_id) REFERENCES dm_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES dm_messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- SERVERS / WORLDS ----------
CREATE TABLE IF NOT EXISTS servers (
  id          VARCHAR(40)  NOT NULL,
  name        VARCHAR(80)  NOT NULL,
  initial     VARCHAR(4),
  description TEXT,
  base_color  VARCHAR(16),
  grad        VARCHAR(255),
  glow        VARCHAR(64),
  cover       MEDIUMTEXT,
  emblem_image MEDIUMTEXT,
  invite_key  VARCHAR(40) UNIQUE,
  is_private  TINYINT(1) NOT NULL DEFAULT 0,
  pinned_text TEXT,
  pinned_by   BIGINT UNSIGNED NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (pinned_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS server_members (
  server_id  VARCHAR(40) NOT NULL,
  user_id    BIGINT UNSIGNED NOT NULL,
  is_admin   TINYINT(1) NOT NULL DEFAULT 0,
  joined_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (server_id, user_id),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS server_categories (
  id         VARCHAR(40) NOT NULL,
  server_id  VARCHAR(40) NOT NULL,
  name       VARCHAR(80) NOT NULL,
  position   INT NOT NULL DEFAULT 0,
  pinned_text TEXT,
  pinned_by   BIGINT UNSIGNED NULL,
  visible_role_ids JSON NULL,
  PRIMARY KEY (id),
  KEY idx_server (server_id),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
  FOREIGN KEY (pinned_by) REFERENCES users(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS text_channels (
  id          VARCHAR(40) NOT NULL,
  server_id   VARCHAR(40) NOT NULL,
  category_id VARCHAR(40) NULL,
  name        VARCHAR(80) NOT NULL,
  style       VARCHAR(40),
  position    INT NOT NULL DEFAULT 0,
  pinned_msg_id BIGINT UNSIGNED NULL,
  -- JSON array of role ids that can see this channel; NULL = visible to everyone.
  visible_role_ids JSON NULL,
  PRIMARY KEY (id),
  KEY idx_server (server_id),
  FOREIGN KEY (server_id)   REFERENCES servers(id)            ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES server_categories(id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS voice_channels (
  id          VARCHAR(40) NOT NULL,
  server_id   VARCHAR(40) NOT NULL,
  category_id VARCHAR(40) NULL,
  name        VARCHAR(80) NOT NULL,
  style       VARCHAR(40),
  position    INT NOT NULL DEFAULT 0,
  -- JSON array of role ids that can see this channel; NULL = visible to everyone.
  visible_role_ids JSON NULL,
  PRIMARY KEY (id),
  KEY idx_server (server_id),
  FOREIGN KEY (server_id)   REFERENCES servers(id)            ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES server_categories(id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS voice_channel_members (
  channel_id VARCHAR(40)     NOT NULL,
  user_id    BIGINT UNSIGNED NOT NULL,
  joined_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (channel_id, user_id),
  FOREIGN KEY (channel_id) REFERENCES voice_channels(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)          ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Note: role ids like 'owner' / 'admin' / 'role-xxx' are unique per-server,
-- not globally unique. The PRIMARY KEY is composite on (server_id, id) so
-- two different servers can both have an 'owner' row. Previously this was
-- PRIMARY KEY (id), which silently broke saveRoles for every server after
-- the first one — INSERT failed with a duplicate-key error and the role
-- list looked empty until the user reloaded.
CREATE TABLE IF NOT EXISTS server_roles (
  id           VARCHAR(40) NOT NULL,
  server_id    VARCHAR(40) NOT NULL,
  name         VARCHAR(80) NOT NULL,
  color        VARCHAR(16),
  is_system    TINYINT(1) NOT NULL DEFAULT 0,
  position     INT NOT NULL DEFAULT 0,
  permissions  JSON NOT NULL,
  PRIMARY KEY (server_id, id),
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- server_role_members keys on (server_id, role_id, user_id) so the same
-- 'admin' role id in two different servers stays distinct.
CREATE TABLE IF NOT EXISTS server_role_members (
  server_id VARCHAR(40)     NOT NULL,
  role_id   VARCHAR(40)     NOT NULL,
  user_id   BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (server_id, role_id, user_id),
  FOREIGN KEY (server_id, role_id) REFERENCES server_roles(server_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- TEXT CHANNEL MESSAGES ----------
CREATE TABLE IF NOT EXISTS text_channel_messages (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  channel_id  VARCHAR(40)     NOT NULL,
  sender_id   BIGINT UNSIGNED NOT NULL,
  body        TEXT,
  payload_json JSON NULL,
  reply_to    BIGINT UNSIGNED NULL,
  edited      TINYINT(1) NOT NULL DEFAULT 0,
  deleted     TINYINT(1) NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_channel_time (channel_id, created_at),
  FOREIGN KEY (channel_id) REFERENCES text_channels(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id)  REFERENCES users(id)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- USER PREFERENCES ----------
CREATE TABLE IF NOT EXISTS user_marked_orbits (
  user_id    BIGINT UNSIGNED NOT NULL,
  channel_id VARCHAR(40)     NOT NULL,
  position   INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, channel_id),
  FOREIGN KEY (user_id)    REFERENCES users(id)          ON DELETE CASCADE,
  FOREIGN KEY (channel_id) REFERENCES voice_channels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_marked_text_channels (
  user_id    BIGINT UNSIGNED NOT NULL,
  channel_id VARCHAR(40)     NOT NULL,
  position   INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, channel_id),
  FOREIGN KEY (user_id)    REFERENCES users(id)         ON DELETE CASCADE,
  FOREIGN KEY (channel_id) REFERENCES text_channels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_marked_friends (
  user_id   BIGINT UNSIGNED NOT NULL,
  friend_id BIGINT UNSIGNED NOT NULL,
  position  INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, friend_id),
  FOREIGN KEY (user_id)   REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_pinned_servers (
  user_id   BIGINT UNSIGNED NOT NULL,
  server_id VARCHAR(40)     NOT NULL,
  position  INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, server_id),
  FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- NOTIFICATIONS ----------
CREATE TABLE IF NOT EXISTS notifications (
  id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id   BIGINT UNSIGNED NOT NULL,
  kind      VARCHAR(40)     NOT NULL,
  title     VARCHAR(255)    NOT NULL,
  description TEXT,
  payload_json JSON NULL,
  read_at   DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user_time (user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- HIDDEN DM THREADS ----------
-- Per-user "I deleted this conversation from my DM list / cleared my view".
-- The peer still sees the full history; we filter our own copy by
-- last_hidden_id so we only show messages newer than that. Sending /
-- receiving a new message naturally surfaces the thread again because the
-- new message id is bigger than last_hidden_id.

CREATE TABLE IF NOT EXISTS dm_thread_hidden (
  user_id        BIGINT UNSIGNED NOT NULL,
  thread_id      BIGINT UNSIGNED NOT NULL,
  last_hidden_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, thread_id),
  FOREIGN KEY (user_id)   REFERENCES users(id)      ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES dm_threads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- READ STATE ----------
-- Tracks the user's last-read message id per DM thread and per text channel,
-- so unread counts survive a reload. We compute the unread count as
-- `count of messages with id > last_read_id` server-side.

CREATE TABLE IF NOT EXISTS dm_read_state (
  user_id      BIGINT UNSIGNED NOT NULL,
  thread_id    BIGINT UNSIGNED NOT NULL,
  last_read_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, thread_id),
  FOREIGN KEY (user_id)   REFERENCES users(id)      ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES dm_threads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS text_channel_read_state (
  user_id      BIGINT UNSIGNED NOT NULL,
  channel_id   VARCHAR(40) NOT NULL,
  last_read_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, channel_id),
  FOREIGN KEY (user_id)    REFERENCES users(id)         ON DELETE CASCADE,
  FOREIGN KEY (channel_id) REFERENCES text_channels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
