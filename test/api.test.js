'use strict';

// 用内存库跑测试：必须在 require 任何会加载 db.js 的模块之前设置。
process.env.DB_FILE = ':memory:';
process.env.SEED_ON_START = 'false';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createApp } = require('../src/app');
const { getDb, resetAll } = require('../src/db');
const { seed } = require('../src/seed');

getDb();
const app = createApp();

/** 登录并返回 token。 */
async function login(username, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username, password });
  assert.equal(res.status, 200, `登录应成功: ${JSON.stringify(res.body)}`);
  return res.body.data.token;
}

test.beforeEach(() => {
  resetAll();
  seed({ force: true });
});

test('健康检查返回 ok 且服务名为中文', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.service, '城市排水管网防汛运维管理平台');
});

test('正确的用户名密码可以登录并拿到 token 与用户信息', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'admin123' });
  assert.equal(res.status, 200);
  assert.ok(res.body.data.token, '应返回 token');
  assert.equal(res.body.data.user.username, 'admin');
  assert.equal(res.body.data.user.role, 'admin');
  assert.equal(res.body.data.user.name, '系统管理员');
});

test('错误密码登录返回 401', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'wrong' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.message, '用户名或密码错误');
});

test('缺少用户名返回 400', async () => {
  const res = await request(app).post('/api/auth/login').send({ password: 'x' });
  assert.equal(res.status, 400);
});

test('未携带 token 访问受保护接口返回 401', async () => {
  const res = await request(app).get('/api/pipes');
  assert.equal(res.status, 401);
});

test('GET /api/auth/me 返回当前用户', async () => {
  const token = await login('operator', 'operator123');
  const res = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.username, 'operator');
  assert.equal(res.body.data.name, '运维员·张工');
});

test('种子数据：管段与泵站列表非空', async () => {
  const token = await login('viewer', 'viewer123');
  const pipes = await request(app).get('/api/pipes').set('Authorization', `Bearer ${token}`);
  assert.equal(pipes.status, 200);
  assert.equal(pipes.body.total, 3);

  const stations = await request(app).get('/api/stations').set('Authorization', `Bearer ${token}`);
  assert.equal(stations.status, 200);
  assert.equal(stations.body.total, 2);
});

test('operator 可以新建管段，中文字段正确存取', async () => {
  const token = await login('operator', 'operator123');
  const res = await request(app)
    .post('/api/pipes')
    .set('Authorization', `Bearer ${token}`)
    .send({
      code: 'YS-NEW-100',
      district: '江北新区',
      type: 'rain',
      material: '钢筋混凝土',
      diameterMm: 1500,
      lengthM: 88.8,
      remark: '新建主干管，迎峰度汛重点',
    });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.code, 'YS-NEW-100');
  assert.equal(res.body.data.district, '江北新区');
  assert.equal(res.body.data.material, '钢筋混凝土');
  assert.equal(res.body.data.status, 'normal');
  assert.equal(res.body.data.diameterMm, 1500);
  assert.equal(res.body.data.remark, '新建主干管，迎峰度汛重点');
});

test('重复管段编号返回 409', async () => {
  const token = await login('admin', 'admin123');
  const res = await request(app)
    .post('/api/pipes')
    .set('Authorization', `Bearer ${token}`)
    .send({ code: 'YS-DX-001', district: '东湖区', type: 'rain' });
  assert.equal(res.status, 409);
});

test('非法 type 返回 400', async () => {
  const token = await login('admin', 'admin123');
  const res = await request(app)
    .post('/api/pipes')
    .set('Authorization', `Bearer ${token}`)
    .send({ code: 'X-1', district: '东湖区', type: '雨水' });
  assert.equal(res.status, 400);
});

test('管段过滤：按 status=warning 只返回预警管段', async () => {
  const token = await login('viewer', 'viewer123');
  const res = await request(app)
    .get('/api/pipes?status=warning')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.data[0].code, 'WS-XH-014');
});

test('管段关键字过滤 keyword 命中 remark', async () => {
  const token = await login('viewer', 'viewer123');
  const res = await request(app)
    .get('/api/pipes?keyword=清淤')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 1);
  assert.equal(res.body.data[0].code, 'HL-NG-027');
});

test('更新管段状态', async () => {
  const token = await login('operator', 'operator123');
  const list = await request(app).get('/api/pipes?status=warning').set('Authorization', `Bearer ${token}`);
  const id = list.body.data[0].id;
  const res = await request(app)
    .put(`/api/pipes/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'normal', remark: '已修复' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'normal');
  assert.equal(res.body.data.remark, '已修复');
});

test('viewer 无权新建管段，返回 403', async () => {
  const token = await login('viewer', 'viewer123');
  const res = await request(app)
    .post('/api/pipes')
    .set('Authorization', `Bearer ${token}`)
    .send({ code: 'V-1', district: '东湖区', type: 'rain' });
  assert.equal(res.status, 403);
});

test('viewer 无权删除管段（需要 admin），返回 403', async () => {
  const token = await login('operator', 'operator123');
  const list = await request(app).get('/api/pipes').set('Authorization', `Bearer ${token}`);
  const id = list.body.data[0].id;
  const res = await request(app)
    .delete(`/api/pipes/${id}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 403);
});

test('admin 可以删除管段', async () => {
  const token = await login('admin', 'admin123');
  const list = await request(app).get('/api/pipes').set('Authorization', `Bearer ${token}`);
  const id = list.body.data[0].id;
  const del = await request(app).delete(`/api/pipes/${id}`).set('Authorization', `Bearer ${token}`);
  assert.equal(del.status, 200);
  const after = await request(app).get(`/api/pipes/${id}`).set('Authorization', `Bearer ${token}`);
  assert.equal(after.status, 404);
});

test('泵站 CRUD：新建并查询', async () => {
  const token = await login('operator', 'operator123');
  const create = await request(app)
    .post('/api/stations')
    .set('Authorization', `Bearer ${token}`)
    .send({ code: 'PZ-100', name: '高新区排涝泵站', district: '高新区', capacityM3h: 4000, pumpCount: 3, status: 'running' });
  assert.equal(create.status, 201);
  assert.equal(create.body.data.name, '高新区排涝泵站');
  assert.equal(create.body.data.pumpCount, 3);

  const get = await request(app)
    .get(`/api/stations/${create.body.data.id}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(get.status, 200);
  assert.equal(get.body.data.code, 'PZ-100');
});

test('用户管理：admin 新建用户后可用其登录；普通用户访问用户管理被拒', async () => {
  const adminToken = await login('admin', 'admin123');

  const create = await request(app)
    .post('/api/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ username: 'wanggong', password: 'pass1234', name: '王工', role: 'operator' });
  assert.equal(create.status, 201);
  assert.equal(create.body.data.username, 'wanggong');

  const newLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: 'wanggong', password: 'pass1234' });
  assert.equal(newLogin.status, 200);

  // operator 无权访问用户管理
  const forbidden = await request(app)
    .get('/api/users')
    .set('Authorization', `Bearer ${newLogin.body.data.token}`);
  assert.equal(forbidden.status, 403);
});

test('admin 不能删除自己', async () => {
  const token = await login('admin', 'admin123');
  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  const res = await request(app)
    .delete(`/api/users/${me.body.data.id}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 400);
});

test('禁用账号无法登录', async () => {
  const adminToken = await login('admin', 'admin123');
  // 找到 viewer 用户
  const users = await request(app).get('/api/users').set('Authorization', `Bearer ${adminToken}`);
  const viewer = users.body.data.find((u) => u.username === 'viewer');
  // 禁用
  await request(app)
    .put(`/api/users/${viewer.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ active: false });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'viewer', password: 'viewer123' });
  assert.equal(res.status, 403);
});

test('不存在的接口返回 404', async () => {
  const res = await request(app).get('/api/not-exist');
  assert.equal(res.status, 404);
});
