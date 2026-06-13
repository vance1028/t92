'use strict';

const express = require('express');
const store = require('../data/store');
const { authRequired, requireRole, ROLES } = require('../auth');
const {
  sendData,
  sendError,
  requireString,
  parseEnum,
  parseId,
  HttpError,
} = require('../utils/http');

const router = express.Router();

// 用户管理仅管理员可用。
router.use(authRequired, requireRole('admin'));

/** GET /api/users —— 用户列表。 */
router.get('/', (req, res) => {
  const users = store.listUsers();
  return sendData(res, 200, users, { total: users.length });
});

/** POST /api/users —— 新建用户。 */
router.post('/', (req, res) => {
  try {
    const username = requireString(req.body, 'username', { max: 64 });
    const password = requireString(req.body, 'password', { max: 128 });
    const name = requireString(req.body, 'name', { max: 64 });
    const role = parseEnum(req.body, 'role', ROLES, { fallback: 'viewer' });

    if (store.getUserByUsername(username)) {
      return sendError(res, 409, '用户名已存在');
    }
    const active = req.body.active === undefined ? true : !!req.body.active;
    const user = store.createUser({ username, password, name, role, active });
    return sendData(res, 201, user);
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

/** PUT /api/users/:id —— 更新用户（姓名/角色/启用状态/重置密码）。 */
router.put('/:id', (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!store.getUserById(id)) return sendError(res, 404, '用户不存在');

    const fields = {};
    if (req.body.name !== undefined) fields.name = requireString(req.body, 'name', { max: 64 });
    if (req.body.role !== undefined) fields.role = parseEnum(req.body, 'role', ROLES, { required: true });
    if (req.body.active !== undefined) fields.active = !!req.body.active;
    if (req.body.password !== undefined) fields.password = requireString(req.body, 'password', { max: 128 });

    const user = store.updateUser(id, fields);
    return sendData(res, 200, user);
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

/** DELETE /api/users/:id —— 删除用户（不允许删除自己）。 */
router.delete('/:id', (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === req.user.id) return sendError(res, 400, '不能删除当前登录的账号');
    if (!store.getUserById(id)) return sendError(res, 404, '用户不存在');
    store.deleteUser(id);
    return sendData(res, 200, { id });
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

module.exports = router;
