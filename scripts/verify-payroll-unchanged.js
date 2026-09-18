// Chụp ảnh lương MỌI giảng viên theo MỌI kỳ. Chạy TRƯỚC và SAU di trú rồi diff hai file —
// phải giống hệt từng đồng. Đây là tiêu chí nghiệm thu của đợt gom khoá học của lớp.
// CHỈ ĐỌC, không ghi gì.
//
//   node scripts/verify-payroll-unchanged.js --env-file=.env.development > /tmp/before.json
//   node scripts/migrate-class-phase-teachers.js --env-file=.env.development --apply
//   node scripts/verify-payroll-unchanged.js --env-file=.env.development > /tmp/after.json
//   diff /tmp/before.json /tmp/after.json     # PHẢI RỖNG
require('../src/config/timezone');   // PHẢI đứng trước mọi require khác
const path = require('path');

const argValue = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const envFile = argValue('env-file');
if (!envFile) {
  console.error('Thiếu --env-file=<file env> (VD: --env-file=.env.development)');
  process.exit(1);
}
require('dotenv').config({ path: path.resolve(process.cwd(), envFile) });
if (!process.env.MONGODB_URI) {
  console.error(`Không có MONGODB_URI trong ${envFile}`);
  process.exit(1);
}

const mongoose = require('mongoose');
const Class = require('../src/models/Class');
const Teacher = require('../src/models/Teacher');
const TeacherSession = require('../src/models/TeacherSession');
const TeacherBonus = require('../src/models/TeacherBonus');
const PayrollSettings = require('../src/models/PayrollSettings');
const { buildTeacherLedger, payPeriodLabel, todayDateStr, DEFAULT_PAY_PERIOD_START_DAY } = require('../src/utils/teacherLedger');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.error(`Database đích: ${mongoose.connection.name}  ·  CHỈ ĐỌC`);

  const today = todayDateStr();
  const startDay = (await PayrollSettings.findOne().lean())?.startDay || DEFAULT_PAY_PERIOD_START_DAY;
  const [teachers, classes, overrides, bonuses] = await Promise.all([
    Teacher.find().select('_id name').sort({ _id: 1 }).lean(),
    Class.find().lean(),
    TeacherSession.find().lean(),
    TeacherBonus.find().lean(),
  ]);

  const out = {};
  for (const t of teachers) {
    const items = buildTeacherLedger({
      teacherId: t._id, classes, overrides,
      bonuses: bonuses.filter(b => String(b.teacherId) === String(t._id)),
      // Hoa hồng giới thiệu không liên quan tới lịch lớp — bỏ ra cho diff khỏi nhiễu.
      commissions: [], todayStr: today,
    });
    const byPeriod = {};
    for (const it of items) {
      const p = payPeriodLabel(it.date, startDay);
      byPeriod[p] = (byPeriod[p] || 0) + it.amount;
    }
    out[`${t.name} (${t._id})`] = Object.fromEntries(Object.entries(byPeriod).sort());
  }

  console.log(JSON.stringify(out, null, 2));
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
