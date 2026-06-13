'use strict';

const store = require('./data/store');

/**
 * 写入初始种子数据：一个管理员、一个运维、一个只读账号，
 * 外加若干排水管段与泵站，方便本地起步与「功能迭代」类任务直接有数据可用。
 *
 * 幂等：若库中已存在用户则跳过，避免重复播种。
 */
function seed({ force = false } = {}) {
  if (!force && store.countUsers() > 0) {
    return { skipped: true };
  }

  store.createUser({ username: 'admin', password: 'admin123', name: '系统管理员', role: 'admin' });
  store.createUser({ username: 'operator', password: 'operator123', name: '运维员·张工', role: 'operator' });
  store.createUser({ username: 'viewer', password: 'viewer123', name: '值班观察员', role: 'viewer' });

  const pipes = [
    { code: 'YS-DX-001', district: '东湖区', type: 'rain', material: '钢筋混凝土', diameterMm: 1200, lengthM: 320.5, status: 'normal', installedAt: '2018-06-01', remark: '主干雨水管，汛期重点监控' },
    { code: 'WS-XH-014', district: '西湖区', type: 'sewage', material: 'HDPE', diameterMm: 800, lengthM: 156.0, status: 'warning', installedAt: '2015-09-12', remark: '局部沉降，已列入巡检计划' },
    { code: 'HL-NG-027', district: '南岗区', type: 'combined', material: '球墨铸铁', diameterMm: 1000, lengthM: 210.8, status: 'maintenance', installedAt: '2012-03-20', remark: '清淤检修中' },
  ];
  for (const p of pipes) store.createPipe(p);

  const stations = [
    { code: 'PZ-001', name: '滨江一号泵站', district: '东湖区', capacityM3h: 5400, pumpCount: 4, status: 'running', location: '滨江路与解放大道交叉口' },
    { code: 'PZ-002', name: '新城排涝泵站', district: '南岗区', capacityM3h: 3200, pumpCount: 3, status: 'standby', location: '新城北路 88 号' },
  ];
  for (const s of stations) store.createStation(s);

  const adminUser = store.getUserByUsername('admin');
  const operatorUser = store.getUserByUsername('operator');
  const firstPipe = store.getPipeByCode('YS-DX-001');
  const firstStation = store.getStationByCode('PZ-001');

  const wo1 = store.createWorkOrder({
    title: '东湖区滨江路积水点紧急处置',
    type: 'flooding',
    priority: 'urgent',
    description: '昨晚暴雨后滨江路与解放大道交叉口积水约 30cm，影响交通，请尽快处置。',
    reporterId: adminUser.id,
    pipeId: firstPipe.id,
  });
  store.assignWorkOrder(wo1.id, operatorUser.id, adminUser.id);

  const wo2 = store.createWorkOrder({
    title: '西湖区 WS-XH-014 管段破损排查',
    type: 'pipe_damage',
    priority: 'high',
    description: '巡检发现 WS-XH-014 管段局部沉降疑似破损，需进一步确认并安排维修。',
    reporterId: operatorUser.id,
    pipeId: store.getPipeByCode('WS-XH-014').id,
  });

  store.createWorkOrder({
    title: '新城排涝泵站异响排查',
    type: 'pump_fault',
    priority: 'normal',
    description: '二号泵运行时有异响，建议安排检修。',
    reporterId: operatorUser.id,
    stationId: firstStation.id,
  });

  return { skipped: false, users: 3, pipes: pipes.length, stations: stations.length, workOrders: 3 };
}

module.exports = { seed };
