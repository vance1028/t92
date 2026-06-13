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

const PIPE_TYPES = ['rain', 'sewage', 'combined']; // 雨水 / 污水 / 合流
const PIPE_STATUS = ['normal', 'warning', 'maintenance', 'abandoned']; // 正常 / 预警 / 检修 / 废弃

// 所有接口都需要登录；写操作需要 admin / operator。
router.use(authRequired);

/** GET /api/pipes —— 管段列表，支持 district / type / status / keyword 过滤。 */
router.get('/', (req, res) => {
  const pipes = store.listPipes({
    district: req.query.district,
    type: req.query.type,
    status: req.query.status,
    keyword: req.query.keyword,
  });
  return sendData(res, 200, pipes, { total: pipes.length });
});

/** GET /api/pipes/:id —— 管段详情。 */
router.get('/:id', (req, res) => {
  try {
    const id = parseId(req.params.id);
    const pipe = store.getPipeById(id);
    if (!pipe) return sendError(res, 404, '管段不存在');
    return sendData(res, 200, pipe);
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

/** POST /api/pipes —— 新建管段。 */
router.post('/', requireRole('admin', 'operator'), (req, res) => {
  try {
    const data = parsePipeBody(req.body, { isCreate: true });
    if (store.getPipeByCode(data.code)) {
      return sendError(res, 409, '管段编号已存在');
    }
    const pipe = store.createPipe(data);
    return sendData(res, 201, pipe);
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

/** PUT /api/pipes/:id —— 更新管段（编号不可改）。 */
router.put('/:id', requireRole('admin', 'operator'), (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!store.getPipeById(id)) return sendError(res, 404, '管段不存在');
    const data = parsePipeBody(req.body, { isCreate: false });
    const pipe = store.updatePipe(id, data);
    return sendData(res, 200, pipe);
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

/** DELETE /api/pipes/:id —— 删除管段（仅管理员）。 */
router.delete('/:id', requireRole('admin'), (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!store.getPipeById(id)) return sendError(res, 404, '管段不存在');
    store.deletePipe(id);
    return sendData(res, 200, { id });
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

/**
 * 解析并校验管段请求体。
 * 创建时 code / district / type 必填；更新时各字段均为可选（仅校验传入的）。
 */
function parsePipeBody(body, { isCreate }) {
  const data = {};

  if (isCreate) {
    data.code = requireString(body, 'code', { max: 64 });
    data.district = requireString(body, 'district', { max: 64 });
    data.type = parseEnum(body, 'type', PIPE_TYPES, { required: true });
    data.status = parseEnum(body, 'status', PIPE_STATUS, { fallback: 'normal' });
  } else {
    if (body.district !== undefined) data.district = requireString(body, 'district', { max: 64 });
    if (body.type !== undefined) data.type = parseEnum(body, 'type', PIPE_TYPES, { required: true });
    if (body.status !== undefined) data.status = parseEnum(body, 'status', PIPE_STATUS, { required: true });
  }

  if (isCreate || body.material !== undefined) data.material = optionalString(body, 'material', { max: 64 });
  if (isCreate || body.diameterMm !== undefined) data.diameterMm = parseNumber(body, 'diameterMm', { min: 0, integer: true });
  if (isCreate || body.lengthM !== undefined) data.lengthM = parseNumber(body, 'lengthM', { min: 0 });
  if (isCreate || body.installedAt !== undefined) data.installedAt = optionalString(body, 'installedAt', { max: 32 });
  if (isCreate || body.remark !== undefined) data.remark = optionalString(body, 'remark', { max: 500 });

  return data;
}

module.exports = router;
