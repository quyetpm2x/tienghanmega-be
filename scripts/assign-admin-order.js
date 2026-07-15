require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');
const Class = require('../src/models/Class');

// One-time: gán adminOrder tuần tự (1..N) cho TẤT CẢ lớp học theo đúng thứ tự đang
// hiển thị hiện tại trên trang admin (lớp đã ghim theo adminOrder lên trước, còn lại
// theo startDate giảm dần — giống hệt logic sort trong classController.getAll) — không
// đổi thứ tự nhìn thấy, chỉ biến thứ tự ngầm định thành số tường minh để chỉnh tay dễ hơn.
async function run() {
  await connectDB();
  console.log('Connected to MongoDB');

  const classes = await Class.find().sort({ startDate: -1 });
  classes.sort((a, b) => {
    const ao = a.adminOrder;
    const bo = b.adminOrder;
    if (ao != null && bo != null) return ao - bo;
    if (ao != null) return -1;
    if (bo != null) return 1;
    return 0;
  });

  let changed = 0;
  for (let i = 0; i < classes.length; i++) {
    const cls = classes[i];
    const newOrder = i + 1;
    if (cls.adminOrder !== newOrder) {
      console.log(`  ${String(newOrder).padStart(2, ' ')}. ${cls.name} (adminOrder ${cls.adminOrder ?? 'null'} -> ${newOrder})`);
      cls.adminOrder = newOrder;
      await cls.save();
      changed++;
    }
  }

  console.log(`Done. ${classes.length} classes processed, ${changed} updated.`);
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
