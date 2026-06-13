'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

/**
 * SQLite 连接管理。
 *
 * - 默认持久化到 data/app.db；
 * - 设置环境变量 DB_FILE=':memory:' 可用内存库（测试用，进程内不落盘）。
 *
 * 全程使用 better-sqlite3（同步 API），并开启外键约束。
 */

const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'app.db');

let db = null;

function getDb() {
  if (db) return db;

  if (DB_FILE !== ':memory:') {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  }

  db = new Database(DB_FILE);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

function initSchema(conn) {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name          TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'viewer',
      active        INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pipe_segments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      code         TEXT NOT NULL UNIQUE,
      district     TEXT NOT NULL,
      type         TEXT NOT NULL,
      material     TEXT,
      diameter_mm  INTEGER,
      length_m     REAL,
      status       TEXT NOT NULL DEFAULT 'normal',
      installed_at TEXT,
      remark       TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pump_stations (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      code         TEXT NOT NULL UNIQUE,
      name         TEXT NOT NULL,
      district     TEXT NOT NULL,
      capacity_m3h REAL,
      pump_count   INTEGER NOT NULL DEFAULT 0,
      status       TEXT NOT NULL DEFAULT 'standby',
      location     TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pipe_district ON pipe_segments(district);
    CREATE INDEX IF NOT EXISTS idx_pipe_status   ON pipe_segments(status);
    CREATE INDEX IF NOT EXISTS idx_station_district ON pump_stations(district);
    CREATE INDEX IF NOT EXISTS idx_station_status   ON pump_stations(status);
  `);
}

/** 清空所有业务数据（测试用）。 */
function resetAll() {
  const conn = getDb();
  conn.exec('DELETE FROM pipe_segments; DELETE FROM pump_stations; DELETE FROM users;');
  conn.exec("DELETE FROM sqlite_sequence WHERE name IN ('pipe_segments','pump_stations','users');");
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, resetAll, close, DB_FILE };
