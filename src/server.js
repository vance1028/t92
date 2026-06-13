'use strict';

const { createApp } = require('./app');
const { getDb } = require('./db');
const { seed } = require('./seed');

const PORT = process.env.PORT || 6147;

function main() {
  // 触发数据库初始化（建表）。
  getDb();

  // 空库时自动写入种子数据，便于首次启动即可登录。
  if (process.env.SEED_ON_START !== 'false') {
    const result = seed();
    if (!result.skipped) {
      // eslint-disable-next-line no-console
      console.log('已写入种子数据：默认管理员 admin / admin123');
    }
  }

  const app = createApp();
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`城市排水管网防汛运维管理平台 API 已启动: http://localhost:${PORT}`);
  });
}

main();
