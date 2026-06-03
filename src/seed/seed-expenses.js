require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const connectDB = require('../config/database');
const Expense   = require('../models/Expense');

const data = [
  // T1/2026
  { month:'2026-01', category:'salary',    amount:12000000, note:'Lương GV tháng 1',         paidAt: new Date('2026-01-05') },
  { month:'2026-01', category:'rent',      amount:5000000,  note:'Thuê mặt bằng T1',          paidAt: new Date('2026-01-03') },
  { month:'2026-01', category:'marketing', amount:2000000,  note:'Chạy ads Facebook T1',      paidAt: new Date('2026-01-10') },
  { month:'2026-01', category:'utilities', amount:800000,   note:'Điện, nước, internet T1',   paidAt: new Date('2026-01-15') },

  // T2/2026
  { month:'2026-02', category:'salary',    amount:15000000, note:'Lương GV tháng 2',         paidAt: new Date('2026-02-05') },
  { month:'2026-02', category:'rent',      amount:5000000,  note:'Thuê mặt bằng T2',          paidAt: new Date('2026-02-03') },
  { month:'2026-02', category:'marketing', amount:4500000,  note:'Chạy ads Tết + TikTok T2', paidAt: new Date('2026-02-08') },
  { month:'2026-02', category:'utilities', amount:900000,   note:'Điện, nước, internet T2',   paidAt: new Date('2026-02-15') },
  { month:'2026-02', category:'other',     amount:1200000,  note:'In ấn giáo trình mới',      paidAt: new Date('2026-02-20') },

  // T3/2026
  { month:'2026-03', category:'salary',    amount:16000000, note:'Lương GV tháng 3',         paidAt: new Date('2026-03-05') },
  { month:'2026-03', category:'rent',      amount:5000000,  note:'Thuê mặt bằng T3',          paidAt: new Date('2026-03-03') },
  { month:'2026-03', category:'marketing', amount:3500000,  note:'Chạy ads Google + Zalo T3', paidAt: new Date('2026-03-10') },
  { month:'2026-03', category:'utilities', amount:1000000,  note:'Điện, nước, internet T3',   paidAt: new Date('2026-03-15') },

  // T4/2026
  { month:'2026-04', category:'salary',    amount:14000000, note:'Lương GV tháng 4',         paidAt: new Date('2026-04-05') },
  { month:'2026-04', category:'rent',      amount:5000000,  note:'Thuê mặt bằng T4',          paidAt: new Date('2026-04-03') },
  { month:'2026-04', category:'marketing', amount:2500000,  note:'Chạy ads T4',               paidAt: new Date('2026-04-10') },
  { month:'2026-04', category:'utilities', amount:850000,   note:'Điện, nước, internet T4',   paidAt: new Date('2026-04-15') },

  // T5/2026
  { month:'2026-05', category:'salary',    amount:5000000,  note:'Lương GV tháng 5 (tạm ứng)', paidAt: new Date('2026-05-05') },
  { month:'2026-05', category:'rent',      amount:5000000,  note:'Thuê mặt bằng T5',            paidAt: new Date('2026-05-03') },
  { month:'2026-05', category:'utilities', amount:700000,   note:'Điện, nước, internet T5',     paidAt: new Date('2026-05-10') },
];

async function run() {
  await connectDB();
  await Expense.deleteMany({});
  console.log('Cleared existing expenses');
  const inserted = await Expense.insertMany(data);
  console.log(`Inserted ${inserted.length} expense records`);

  // Summary by month
  const byMonth = {};
  inserted.forEach(e => { byMonth[e.month] = (byMonth[e.month] || 0) + e.amount; });
  Object.entries(byMonth).sort().forEach(([m, total]) => {
    console.log(`  ${m}: ${total.toLocaleString('vi-VN')}đ`);
  });
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
