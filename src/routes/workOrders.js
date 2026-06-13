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

const WORK_ORDER_TYPES = store.WORK_ORDER_TYPES;
const WORK_ORDER_STATUS = store.WORK_ORDER_STATUS;
const WORK_ORDER_PRIORITIES = store.WORK_ORDER_PRIORITIES;

router.use(authRequired);

/* ------------------------------ 列表 & 详情 ------------------------------ */

router.get('/', (req, res) => {
  try {
    const assigneeId = req.query.assigneeId ? parseNumber(req.query, 'assigneeId', { integer: true, min: 1 }) : undefined;
    const reporterId = req.query.reporterId ? parseNumber(req.query, 'reporterId', { integer: true, min: 1 }) : undefined;
    const onlyOverdue = req.query.onlyOverdue === 'true' || req.query.onlyOverdue === '1';

    const orders = store.listWorkOrders({
      status: req.query.status,
      priority: req.query.priority,
      type: req.query.type,
      assigneeId,
      reporterId,
      keyword: req.query.keyword,
      onlyOverdue,
    });

    const enriched = orders.map((wo) => ({
      ...wo,
      overdue: store.isWorkOrderOverdue(wo),
    }));

    return sendData(res, 200, enriched, { total: enriched.length });
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

router.get('/:id', (req, res) => {
  try {
    const id = parseId(req.params.id);
    const wo = store.getWorkOrderById(id);
    if (!wo) return sendError(res, 404, '工单不存在');
    const enriched = { ...wo, overdue: store.isWorkOrderOverdue(wo) };
    return sendData(res, 200, enriched);
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

/* -------------------------------- 创建 -------------------------------- */

router.post('/', requireRole('admin', 'operator'), (req, res) => {
  try {
    const data = parseWorkOrderBody(req.body, { isCreate: true });
    data.reporterId = req.user.id;

    if (data.pipeId && !store.getPipeById(data.pipeId)) {
      return sendError(res, 400, '关联的管段不存在');
    }
    if (data.stationId && !store.getStationById(data.stationId)) {
      return sendError(res, 400, '关联的泵站不存在');
    }

    const wo = store.createWorkOrder(data);
    return sendData(res, 201, wo);
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

/* -------------------------------- 更新 -------------------------------- */

router.put('/:id', requireRole('admin'), (req, res) => {
  try {
    const id = parseId(req.params.id);
    const wo = store.getWorkOrderById(id);
    if (!wo) return sendError(res, 404, '工单不存在');

    const data = parseWorkOrderBody(req.body, { isCreate: false });
    if (data.pipeId && !store.getPipeById(data.pipeId)) {
      return sendError(res, 400, '关联的管段不存在');
    }
    if (data.stationId && !store.getStationById(data.stationId)) {
      return sendError(res, 400, '关联的泵站不存在');
    }

    const updated = store.updateWorkOrder(id, data);
    return sendData(res, 200, updated);
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

/* -------------------------------- 派单 -------------------------------- */

router.post('/:id/assign', requireRole('admin', 'operator'), (req, res) => {
  try {
    const id = parseId(req.params.id);
    const wo = store.getWorkOrderById(id);
    if (!wo) return sendError(res, 404, '工单不存在');

    const assigneeId = parseNumber(req.body, 'assigneeId', { required: true, integer: true, min: 1 });
    const assignee = store.getUserById(assigneeId);
    if (!assignee) return sendError(res, 400, '处理人不存在');
    if (assignee.role !== 'operator' && assignee.role !== 'admin') {
      return sendError(res, 400, '处理人必须是 operator 或 admin 角色');
    }

    try {
      const result = store.assignWorkOrder(id, assigneeId, req.user.id);
      return sendData(res, 200, result);
    } catch (e) {
      return sendError(res, 400, e.message);
    }
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

/* ------------------------------ 状态流转 ------------------------------ */

router.post('/:id/transition', (req, res) => {
  try {
    const id = parseId(req.params.id);
    const wo = store.getWorkOrderById(id);
    if (!wo) return sendError(res, 404, '工单不存在');

    const toStatus = parseEnum(req.body, 'status', WORK_ORDER_STATUS, { required: true });
    const remark = optionalString(req.body, 'remark', { max: 500 });

    const isAdmin = req.user.role === 'admin';
    const isAssignee = wo.assigneeId === req.user.id;

    const operatorForwardStates = ['processing', 'reviewing'];
    if (!isAdmin) {
      if (req.user.role === 'viewer') {
        return sendError(res, 403, '当前角色无权执行此操作');
      }
      if (!isAssignee) {
        return sendError(res, 403, '只能操作指派给自己的工单');
      }
      if (!operatorForwardStates.includes(toStatus)) {
        return sendError(res, 403, '无权执行此状态变更');
      }
    }

    if (!store.canTransition(wo.status, toStatus)) {
      return sendError(res, 400, `不允许从 ${wo.status} 变更为 ${toStatus}`);
    }

    try {
      const result = store.transitionWorkOrder(id, toStatus, req.user.id, remark);
      return sendData(res, 200, result);
    } catch (e) {
      return sendError(res, 400, e.message);
    }
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

/* ------------------------------ 流转历史 ------------------------------ */

router.get('/:id/logs', (req, res) => {
  try {
    const id = parseId(req.params.id);
    const wo = store.getWorkOrderById(id);
    if (!wo) return sendError(res, 404, '工单不存在');
    const logs = store.listWorkOrderLogs(id);
    return sendData(res, 200, logs, { total: logs.length });
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

/* ------------------------------ 超时检查 ------------------------------ */

router.post('/check-overdue', requireRole('admin'), (req, res) => {
  const updated = store.checkAndEscalateOverdue();
  return sendData(res, 200, { updatedCount: updated.length, updates: updated });
});

/* ------------------------------ 请求体解析 ------------------------------ */

function parseWorkOrderBody(body, { isCreate }) {
  const data = {};

  if (isCreate) {
    data.title = requireString(body, 'title', { max: 256 });
    data.type = parseEnum(body, 'type', WORK_ORDER_TYPES, { required: true });
    data.priority = parseEnum(body, 'priority', WORK_ORDER_PRIORITIES, { fallback: 'normal' });
    data.description = optionalString(body, 'description', { max: 2000 });
  } else {
    if (body.title !== undefined) data.title = requireString(body, 'title', { max: 256 });
    if (body.type !== undefined) data.type = parseEnum(body, 'type', WORK_ORDER_TYPES, { required: true });
    if (body.priority !== undefined) {
      data.priority = parseEnum(body, 'priority', WORK_ORDER_PRIORITIES, { required: true });
    }
    if (body.description !== undefined) data.description = optionalString(body, 'description', { max: 2000 });
  }

  if (isCreate || body.pipeId !== undefined) {
    const v = body.pipeId;
    if (v === undefined || v === null || v === '') {
      data.pipeId = null;
    } else {
      data.pipeId = parseNumber(body, 'pipeId', { integer: true, min: 1 });
    }
  }

  if (isCreate || body.stationId !== undefined) {
    const v = body.stationId;
    if (v === undefined || v === null || v === '') {
      data.stationId = null;
    } else {
      data.stationId = parseNumber(body, 'stationId', { integer: true, min: 1 });
    }
  }

  return data;
}

module.exports = router;
