'use strict';

// 手动重置并写入种子数据：node scripts/seed.js
const { getDb, resetAll } = require('../src/db');
const { seed } = require('../src/seed');

getDb();
resetAll();
const result = seed({ force: true });
// eslint-disable-next-line no-console
console.log('种子数据已重置:', result);
process.exit(0);
