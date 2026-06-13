'use strict';

process.env.DB_FILE = ':memory:';
process.env.SEED_ON_START = 'false';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createApp } = require('../src/app');
const { getDb, resetAll } = require('../src/db');
const { seed } = require('../src/seed');
const store = require('../src/data/store');

getDb();
const app = createApp();

async function login(username, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username, password });
  assert.equal(res.status, 200);
  return res.body.data.token;
}

test.beforeEach(() => {
  resetAll();
  seed({ force: true });
});

test('种子数据：工单列表非空，包含 3 条', async () => {
  const token = await login('viewer', 'viewer123');
  const res = await request(app)
    .get('/api/work-orders')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 3);
});

test('工单详情：包含基本字段与 overdue 标记', async () => {
  const token = await login('viewer', 'viewer123');
  const list = await request(app)
    .get('/api/work-orders')
    .set('Authorization', `Bearer ${token}`);
  const id = list.body.data[0].id;

  const res = await request(app)
    .get(`/api/work-orders/${id}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.data.title);
  assert.ok(res.body.data.type);
  assert.ok(res.body.data.priority);
  assert.ok(res.body.data.status);
  assert.equal(typeof res.body.data.overdue, 'boolean');
  assert.equal(typeof res.body.data.createdAt, 'string');
});

test('operator 可以创建工单，初始状态为 pending', async () => {
  const token = await login('operator', 'operator123');
  const res = await request(app)
    .post('/api/work-orders')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: '测试工单',
      type: 'other',
      priority: 'normal',
      description: '这是一个测试工单',
    });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.title, '测试工单');
  assert.equal(res.body.data.status, 'pending');
  assert.equal(res.body.data.priority, 'normal');
  assert.ok(res.body.data.reporterId);
});

test('viewer 不能创建工单，返回 403', async () => {
  const token = await login('viewer', 'viewer123');
  const res = await request(app)
    .post('/api/work-orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'test', type: 'other' });
  assert.equal(res.status, 403);
});

test('派单：admin 可以把 pending 工单派给 operator', async () => {
  const adminToken = await login('admin', 'admin123');
  const opToken = await login('operator', 'operator123');

  const createRes = await request(app)
    .post('/api/work-orders')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: '待派单测试', type: 'other' });
  const woId = createRes.body.data.id;

  const opUserRes = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${opToken}`);
  const opUserId = opUserRes.body.data.id;

  const res = await request(app)
    .post(`/api/work-orders/${woId}/assign`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ assigneeId: opUserId });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'assigned');
  assert.equal(res.body.data.assigneeId, opUserId);
});

test('状态流转：正常流程 pending → assigned → processing → reviewing → closed', async () => {
  const adminToken = await login('admin', 'admin123');
  const opToken = await login('operator', 'operator123');

  const opUserRes = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${opToken}`);
  const opUserId = opUserRes.body.data.id;

  const createRes = await request(app)
    .post('/api/work-orders')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: '流程测试工单', type: 'other', priority: 'high' });
  const woId = createRes.body.data.id;

  await request(app)
    .post(`/api/work-orders/${woId}/assign`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ assigneeId: opUserId });

  const r1 = await request(app)
    .post(`/api/work-orders/${woId}/transition`)
    .set('Authorization', `Bearer ${opToken}`)
    .send({ status: 'processing', remark: '开始处理' });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.data.status, 'processing');

  const r2 = await request(app)
    .post(`/api/work-orders/${woId}/transition`)
    .set('Authorization', `Bearer ${opToken}`)
    .send({ status: 'reviewing', remark: '处理完毕，申请复核' });
  assert.equal(r2.status, 200);
  assert.equal(r2.body.data.status, 'reviewing');

  const r3 = await request(app)
    .post(`/api/work-orders/${woId}/transition`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'closed', remark: '复核通过' });
  assert.equal(r3.status, 200);
  assert.equal(r3.body.data.status, 'closed');
});

test('状态机校验：pending 不能直接到 closed，返回 400', async () => {
  const adminToken = await login('admin', 'admin123');

  const createRes = await request(app)
    .post('/api/work-orders')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: '乱跳测试', type: 'other' });
  const woId = createRes.body.data.id;

  const res = await request(app)
    .post(`/api/work-orders/${woId}/transition`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'closed' });
  assert.equal(res.status, 400);
  assert.match(res.body.error.message, /不允许/);
});

test('状态机校验：closed 不能改回 processing，返回 400', async () => {
  const adminToken = await login('admin', 'admin123');
  const opToken = await login('operator', 'operator123');

  const opUserRes = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${opToken}`);
  const opUserId = opUserRes.body.data.id;

  const createRes = await request(app)
    .post('/api/work-orders')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: '回退测试', type: 'other' });
  const woId = createRes.body.data.id;

  await request(app)
    .post(`/api/work-orders/${woId}/assign`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ assigneeId: opUserId });
  await request(app)
    .post(`/api/work-orders/${woId}/transition`)
    .set('Authorization', `Bearer ${opToken}`)
    .send({ status: 'processing' });
  await request(app)
    .post(`/api/work-orders/${woId}/transition`)
    .set('Authorization', `Bearer ${opToken}`)
    .send({ status: 'reviewing' });
  await request(app)
    .post(`/api/work-orders/${woId}/transition`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'closed' });

  const res = await request(app)
    .post(`/api/work-orders/${woId}/transition`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'processing' });
  assert.equal(res.status, 400);
});

test('复核打回：reviewing 可以打回 processing', async () => {
  const adminToken = await login('admin', 'admin123');
  const opToken = await login('operator', 'operator123');

  const opUserRes = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${opToken}`);
  const opUserId = opUserRes.body.data.id;

  const createRes = await request(app)
    .post('/api/work-orders')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: '打回测试', type: 'other' });
  const woId = createRes.body.data.id;

  await request(app)
    .post(`/api/work-orders/${woId}/assign`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ assigneeId: opUserId });
  await request(app)
    .post(`/api/work-orders/${woId}/transition`)
    .set('Authorization', `Bearer ${opToken}`)
    .send({ status: 'processing' });
  await request(app)
    .post(`/api/work-orders/${woId}/transition`)
    .set('Authorization', `Bearer ${opToken}`)
    .send({ status: 'reviewing' });

  const res = await request(app)
    .post(`/api/work-orders/${woId}/transition`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'processing', remark: '复核不通过，重新处理' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'processing');
});

test('作废：admin 可以作废未关闭的工单', async () => {
  const adminToken = await login('admin', 'admin123');

  const createRes = await request(app)
    .post('/api/work-orders')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: '作废测试', type: 'other' });
  const woId = createRes.body.data.id;

  const res = await request(app)
    .post(`/api/work-orders/${woId}/transition`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'cancelled', remark: '重复工单，作废' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'cancelled');
});

test('流转历史：可以查询工单的状态变更日志', async () => {
  const adminToken = await login('admin', 'admin123');
  const opToken = await login('operator', 'operator123');

  const opUserRes = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${opToken}`);
  const opUserId = opUserRes.body.data.id;

  const createRes = await request(app)
    .post('/api/work-orders')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: '日志测试', type: 'other' });
  const woId = createRes.body.data.id;

  await request(app)
    .post(`/api/work-orders/${woId}/assign`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ assigneeId: opUserId });

  const logsRes = await request(app)
    .get(`/api/work-orders/${woId}/logs`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(logsRes.status, 200);
  assert.ok(logsRes.body.total >= 2);
  const logs = logsRes.body.data;
  assert.equal(logs[0].toStatus, 'pending');
  assert.equal(logs[logs.length - 1].toStatus, 'assigned');
});

test('权限：operator 只能推进指派给自己的工单', async () => {
  const adminToken = await login('admin', 'admin123');

  const adminUserRes = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${adminToken}`);
  const adminUserId = adminUserRes.body.data.id;

  const createRes = await request(app)
    .post('/api/work-orders')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: '权限测试', type: 'other' });
  const woId = createRes.body.data.id;

  await request(app)
    .post(`/api/work-orders/${woId}/assign`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ assigneeId: adminUserId });

  const opToken = await login('operator', 'operator123');
  const res = await request(app)
    .post(`/api/work-orders/${woId}/transition`)
    .set('Authorization', `Bearer ${opToken}`)
    .send({ status: 'processing' });
  assert.equal(res.status, 403);
  assert.match(res.body.error.message, /只能操作指派给自己/);
});

test('权限：viewer 不能流转工单', async () => {
  const adminToken = await login('admin', 'admin123');
  const viewerToken = await login('viewer', 'viewer123');

  const list = await request(app)
    .get('/api/work-orders')
    .set('Authorization', `Bearer ${adminToken}`);
  const woId = list.body.data[0].id;

  const res = await request(app)
    .post(`/api/work-orders/${woId}/transition`)
    .set('Authorization', `Bearer ${viewerToken}`)
    .send({ status: 'processing' });
  assert.equal(res.status, 403);
});

test('超时检查：admin 可以触发超时检查并升级优先级', async () => {
  const db = getDb();
  const adminToken = await login('admin', 'admin123');

  const createRes = await request(app)
    .post('/api/work-orders')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: '超时测试', type: 'other', priority: 'normal' });
  const woId = createRes.body.data.id;

  db.prepare("UPDATE work_orders SET created_at = datetime('now', '-25 hours') WHERE id = ?").run(woId);

  const res = await request(app)
    .post('/api/work-orders/check-overdue')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.data.updatedCount >= 1);

  const updated = store.getWorkOrderById(woId);
  assert.equal(updated.priority, 'high');
  assert.ok(updated.escalatedAt);
  assert.equal(updated.originalPriority, 'normal');
});

test('列表查询：支持 onlyOverdue 过滤', async () => {
  const db = getDb();
  const adminToken = await login('admin', 'admin123');

  const createRes = await request(app)
    .post('/api/work-orders')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: '超时过滤测试', type: 'other', priority: 'normal' });
  const woId = createRes.body.data.id;

  db.prepare("UPDATE work_orders SET created_at = datetime('now', '-25 hours') WHERE id = ?").run(woId);

  const res = await request(app)
    .get('/api/work-orders?onlyOverdue=true')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.data.some((wo) => wo.id === woId));
  assert.ok(res.body.data.every((wo) => wo.overdue === true));
});

test('更新工单：只有 admin 可以更新基本信息', async () => {
  const adminToken = await login('admin', 'admin123');
  const opToken = await login('operator', 'operator123');

  const createRes = await request(app)
    .post('/api/work-orders')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: '更新测试', type: 'other' });
  const woId = createRes.body.data.id;

  const opRes = await request(app)
    .put(`/api/work-orders/${woId}`)
    .set('Authorization', `Bearer ${opToken}`)
    .send({ title: '被 operator 修改' });
  assert.equal(opRes.status, 403);

  const adminRes = await request(app)
    .put(`/api/work-orders/${woId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: '被 admin 修改', description: '新增描述' });
  assert.equal(adminRes.status, 200);
  assert.equal(adminRes.body.data.title, '被 admin 修改');
  assert.equal(adminRes.body.data.description, '新增描述');
});

test('非法工单类型返回 400', async () => {
  const token = await login('operator', 'operator123');
  const res = await request(app)
    .post('/api/work-orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'test', type: '非法类型' });
  assert.equal(res.status, 400);
});

test('关联不存在的管段返回 400', async () => {
  const token = await login('operator', 'operator123');
  const res = await request(app)
    .post('/api/work-orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'test', type: 'pipe_damage', pipeId: 99999 });
  assert.equal(res.status, 400);
});
