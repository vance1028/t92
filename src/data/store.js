'use strict';

const { getDb } = require('../db');
const { hashPassword } = require('../utils/password');

/**
 * 数据仓储层：所有 SQL 都集中在这里，路由层只调用这些方法。
 * 对外返回的对象统一用 camelCase 字段，便于前端消费。
 */

/* ----------------------------- 行 -> API 映射 ----------------------------- */

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    active: !!row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPipe(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    district: row.district,
    type: row.type,
    material: row.material,
    diameterMm: row.diameter_mm,
    lengthM: row.length_m,
    status: row.status,
    installedAt: row.installed_at,
    remark: row.remark,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStation(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    district: row.district,
    capacityM3h: row.capacity_m3h,
    pumpCount: row.pump_count,
    status: row.status,
    location: row.location,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* --------------------------------- 用户 --------------------------------- */

function getUserByUsername(username) {
  return getDb().prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function getUserById(id) {
  return mapUser(getDb().prepare('SELECT * FROM users WHERE id = ?').get(id));
}

/** 内部使用：返回包含 password_hash 的原始行。 */
function getRawUserById(id) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function listUsers() {
  return getDb()
    .prepare('SELECT * FROM users ORDER BY id ASC')
    .all()
    .map(mapUser);
}

function createUser({ username, password, name, role = 'viewer', active = true }) {
  const info = getDb()
    .prepare(
      `INSERT INTO users (username, password_hash, name, role, active)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(username, hashPassword(password), name, role, active ? 1 : 0);
  return getUserById(info.lastInsertRowid);
}

function updateUser(id, fields) {
  const sets = [];
  const params = [];
  if (fields.name !== undefined) { sets.push('name = ?'); params.push(fields.name); }
  if (fields.role !== undefined) { sets.push('role = ?'); params.push(fields.role); }
  if (fields.active !== undefined) { sets.push('active = ?'); params.push(fields.active ? 1 : 0); }
  if (fields.password !== undefined) { sets.push('password_hash = ?'); params.push(hashPassword(fields.password)); }
  if (sets.length === 0) return getUserById(id);
  sets.push("updated_at = datetime('now')");
  params.push(id);
  getDb().prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return getUserById(id);
}

function deleteUser(id) {
  return getDb().prepare('DELETE FROM users WHERE id = ?').run(id).changes > 0;
}

/* ------------------------------- 排水管段 ------------------------------- */

function listPipes({ district, type, status, keyword } = {}) {
  const where = [];
  const params = [];
  if (district) { where.push('district = ?'); params.push(district); }
  if (type) { where.push('type = ?'); params.push(type); }
  if (status) { where.push('status = ?'); params.push(status); }
  if (keyword) {
    where.push('(code LIKE ? OR remark LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDb()
    .prepare(`SELECT * FROM pipe_segments ${clause} ORDER BY id DESC`)
    .all(...params)
    .map(mapPipe);
}

function getPipeById(id) {
  return mapPipe(getDb().prepare('SELECT * FROM pipe_segments WHERE id = ?').get(id));
}

function getPipeByCode(code) {
  return mapPipe(getDb().prepare('SELECT * FROM pipe_segments WHERE code = ?').get(code));
}

function createPipe(data) {
  const info = getDb()
    .prepare(
      `INSERT INTO pipe_segments
        (code, district, type, material, diameter_mm, length_m, status, installed_at, remark)
       VALUES (@code, @district, @type, @material, @diameterMm, @lengthM, @status, @installedAt, @remark)`,
    )
    .run({
      code: data.code,
      district: data.district,
      type: data.type,
      material: data.material,
      diameterMm: data.diameterMm,
      lengthM: data.lengthM,
      status: data.status,
      installedAt: data.installedAt,
      remark: data.remark,
    });
  return getPipeById(info.lastInsertRowid);
}

function updatePipe(id, data) {
  const allowed = {
    district: 'district',
    type: 'type',
    material: 'material',
    diameterMm: 'diameter_mm',
    lengthM: 'length_m',
    status: 'status',
    installedAt: 'installed_at',
    remark: 'remark',
  };
  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(allowed)) {
    if (data[key] !== undefined) { sets.push(`${col} = ?`); params.push(data[key]); }
  }
  if (sets.length === 0) return getPipeById(id);
  sets.push("updated_at = datetime('now')");
  params.push(id);
  getDb().prepare(`UPDATE pipe_segments SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return getPipeById(id);
}

function deletePipe(id) {
  return getDb().prepare('DELETE FROM pipe_segments WHERE id = ?').run(id).changes > 0;
}

/* -------------------------------- 泵站 -------------------------------- */

function listStations({ district, status, keyword } = {}) {
  const where = [];
  const params = [];
  if (district) { where.push('district = ?'); params.push(district); }
  if (status) { where.push('status = ?'); params.push(status); }
  if (keyword) {
    where.push('(code LIKE ? OR name LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDb()
    .prepare(`SELECT * FROM pump_stations ${clause} ORDER BY id DESC`)
    .all(...params)
    .map(mapStation);
}

function getStationById(id) {
  return mapStation(getDb().prepare('SELECT * FROM pump_stations WHERE id = ?').get(id));
}

function getStationByCode(code) {
  return mapStation(getDb().prepare('SELECT * FROM pump_stations WHERE code = ?').get(code));
}

function createStation(data) {
  const info = getDb()
    .prepare(
      `INSERT INTO pump_stations
        (code, name, district, capacity_m3h, pump_count, status, location)
       VALUES (@code, @name, @district, @capacityM3h, @pumpCount, @status, @location)`,
    )
    .run({
      code: data.code,
      name: data.name,
      district: data.district,
      capacityM3h: data.capacityM3h,
      pumpCount: data.pumpCount,
      status: data.status,
      location: data.location,
    });
  return getStationById(info.lastInsertRowid);
}

function updateStation(id, data) {
  const allowed = {
    name: 'name',
    district: 'district',
    capacityM3h: 'capacity_m3h',
    pumpCount: 'pump_count',
    status: 'status',
    location: 'location',
  };
  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(allowed)) {
    if (data[key] !== undefined) { sets.push(`${col} = ?`); params.push(data[key]); }
  }
  if (sets.length === 0) return getStationById(id);
  sets.push("updated_at = datetime('now')");
  params.push(id);
  getDb().prepare(`UPDATE pump_stations SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return getStationById(id);
}

function deleteStation(id) {
  return getDb().prepare('DELETE FROM pump_stations WHERE id = ?').run(id).changes > 0;
}

/* -------------------------------- 计数 -------------------------------- */

function countUsers() {
  return getDb().prepare('SELECT COUNT(*) AS n FROM users').get().n;
}

module.exports = {
  mapUser,
  getUserByUsername,
  getUserById,
  getRawUserById,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  countUsers,
  listPipes,
  getPipeById,
  getPipeByCode,
  createPipe,
  updatePipe,
  deletePipe,
  listStations,
  getStationById,
  getStationByCode,
  createStation,
  updateStation,
  deleteStation,
};
