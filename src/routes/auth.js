'use strict';

const express = require('express');
const store = require('../data/store');
const { verifyPassword } = require('../utils/password');
const { signToken, authRequired } = require('../auth');
const { sendData, sendError, requireString, HttpError } = require('../utils/http');

const router = express.Router();

/** POST /api/auth/login —— 用户名密码登录，返回 JWT。 */
router.post('/login', (req, res) => {
  try {
    const username = requireString(req.body, 'username');
    const password = requireString(req.body, 'password');

    const row = store.getUserByUsername(username);
    if (!row || !verifyPassword(password, row.password_hash)) {
      return sendError(res, 401, '用户名或密码错误');
    }
    if (!row.active) {
      return sendError(res, 403, '账号已被禁用');
    }
    const user = store.mapUser(row);
    const token = signToken(user);
    return sendData(res, 200, { token, user });
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err.status, err.message, err.details);
    throw err;
  }
});

/** GET /api/auth/me —— 返回当前登录用户信息。 */
router.get('/me', authRequired, (req, res) => {
  const user = store.getUserById(req.user.id);
  if (!user) return sendError(res, 404, '用户不存在');
  return sendData(res, 200, user);
});

module.exports = router;
