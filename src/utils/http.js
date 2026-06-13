'use strict';

/**
 * 通用响应与校验辅助。
 * 成功统一为 { data, ... }，失败统一为 { error: { message, details } }。
 */

function sendData(res, status, data, extra = {}) {
  return res.status(status).json({ data, ...extra });
}

function sendError(res, status, message, details) {
  const error = { message };
  if (details !== undefined) error.details = details;
  return res.status(status).json({ error });
}

/** 抛出带 HTTP 状态码的校验错误，交由路由的 try/catch 统一处理。 */
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** 要求字段为非空字符串，返回去除首尾空白后的值。 */
function requireString(body, field, { max = 255 } = {}) {
  const v = body[field];
  if (typeof v !== 'string' || v.trim() === '') {
    throw new HttpError(400, `字段 ${field} 不能为空`);
  }
  const trimmed = v.trim();
  if (trimmed.length > max) {
    throw new HttpError(400, `字段 ${field} 长度不能超过 ${max}`);
  }
  return trimmed;
}

/** 可选字符串字段，缺省返回 null。 */
function optionalString(body, field, { max = 1000 } = {}) {
  const v = body[field];
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') {
    throw new HttpError(400, `字段 ${field} 必须是字符串`);
  }
  const trimmed = v.trim();
  if (trimmed.length > max) {
    throw new HttpError(400, `字段 ${field} 长度不能超过 ${max}`);
  }
  return trimmed;
}

/** 数字字段校验，支持 min/max 与是否必填。 */
function parseNumber(body, field, { required = false, min, max, integer = false } = {}) {
  const v = body[field];
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError(400, `字段 ${field} 不能为空`);
    return null;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) throw new HttpError(400, `字段 ${field} 必须是数字`);
  if (integer && !Number.isInteger(n)) throw new HttpError(400, `字段 ${field} 必须是整数`);
  if (min !== undefined && n < min) throw new HttpError(400, `字段 ${field} 不能小于 ${min}`);
  if (max !== undefined && n > max) throw new HttpError(400, `字段 ${field} 不能大于 ${max}`);
  return n;
}

/** 枚举字段校验。 */
function parseEnum(body, field, allowed, { required = false, fallback } = {}) {
  const v = body[field];
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError(400, `字段 ${field} 不能为空`);
    return fallback === undefined ? null : fallback;
  }
  if (!allowed.includes(v)) {
    throw new HttpError(400, `字段 ${field} 只能是 ${allowed.join(' / ')} 之一`);
  }
  return v;
}

/** 解析路径参数中的正整数 id。 */
function parseId(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new HttpError(400, 'id 非法');
  }
  return n;
}

module.exports = {
  sendData,
  sendError,
  HttpError,
  requireString,
  optionalString,
  parseNumber,
  parseEnum,
  parseId,
};
