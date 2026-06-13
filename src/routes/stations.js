'use strict';

const express = require('express');
const store = require('../data/store');
const { authRequired, requireRole } = require('../auth');
const {
  sendData,
  sendError,
  requireString,
  optionalString,
  parseNumber,
  parseEnum,
  parseId,
  HttpError,
} = require('../utils/http');

const router = express.Router();

const STATION_STATUS = ['running', 'standby', 'fault', 'maintenance']; // 运行 / 备用 / 故障 / 检修

router.use(authRequired);

/** GET /api/stations —— 泵站列表，支持 district / status / keyword 过滤。 */
router.get('/', (req, res) => {
  const stations = store.listStations({
    district: req.query.district,
    status: req.query.status,
    keyword: req.query.keyword,
  });
  return sendData(res, 200, stations, { total: stations.length });
});

/** GET /api/stations/:id —— 泵站详情。 */
router.get('/:id', (req, res) => {
  try {
    const id = parseId(req.params.id);
    const station = store.getStationById(id);
    if (!station) return sendError(res, 404, '泵站不存在');
    return sendData(res, 200, station);
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

/** POST /api/stations —— 新建泵站。 */
router.post('/', requireRole('admin', 'operator'), (req, res) => {
  try {
    const data = parseStationBody(req.body, { isCreate: true });
    if (store.getStationByCode(data.code)) {
      return sendError(res, 409, '泵站编号已存在');
    }
    const station = store.createStation(data);
    return sendData(res, 201, station);
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

/** PUT /api/stations/:id —— 更新泵站（编号不可改）。 */
router.put('/:id', requireRole('admin', 'operator'), (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!store.getStationById(id)) return sendError(res, 404, '泵站不存在');
    const data = parseStationBody(req.body, { isCreate: false });
    const station = store.updateStation(id, data);
    return sendData(res, 200, station);
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

/** DELETE /api/stations/:id —— 删除泵站（仅管理员）。 */
router.delete('/:id', requireRole('admin'), (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!store.getStationById(id)) return sendError(res, 404, '泵站不存在');
    store.deleteStation(id);
    return sendData(res, 200, { id });
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

function parseStationBody(body, { isCreate }) {
  const data = {};

  if (isCreate) {
    data.code = requireString(body, 'code', { max: 64 });
    data.name = requireString(body, 'name', { max: 128 });
    data.district = requireString(body, 'district', { max: 64 });
    data.status = parseEnum(body, 'status', STATION_STATUS, { fallback: 'standby' });
  } else {
    if (body.name !== undefined) data.name = requireString(body, 'name', { max: 128 });
    if (body.district !== undefined) data.district = requireString(body, 'district', { max: 64 });
    if (body.status !== undefined) data.status = parseEnum(body, 'status', STATION_STATUS, { required: true });
  }

  if (isCreate || body.capacityM3h !== undefined) data.capacityM3h = parseNumber(body, 'capacityM3h', { min: 0 });
  if (isCreate || body.pumpCount !== undefined) {
    const n = parseNumber(body, 'pumpCount', { min: 0, integer: true });
    data.pumpCount = n === null ? 0 : n;
  }
  if (isCreate || body.location !== undefined) data.location = optionalString(body, 'location', { max: 255 });

  return data;
}

module.exports = router;
