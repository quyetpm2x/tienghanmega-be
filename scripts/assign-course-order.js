require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');
const Course = require('../src/models/Course');

// One-time: gán order tuần tự (1..N) cho TẤT CẢ khoá học theo đúng thứ tự đang hiển thị
// hiện tại trên trang admin (khoá đã ghim theo order lên trước, còn lại theo slug tăng
// dần — giống hệt logic sort trong courseController.getAll) — không đổi thứ tự nhìn
// thấy, chỉ biến thứ tự ngầm định thành số tường minh để chỉnh tay dễ hơn.
async function run() {
  await connectDB();
  console.log('Connected to MongoDB');

  const courses = await Course.find().sort({ slug: 1 });
  courses.sort((a, b) => {
    const ao = a.order;
    const bo = b.order;
    if (ao != null && bo != null) return ao - bo;
    if (ao != null) return -1;
    if (bo != null) return 1;
    return 0;
  });

  let changed = 0;
  for (let i = 0; i < courses.length; i++) {
    const c = courses[i];
    const newOrder = i + 1;
    if (c.order !== newOrder) {
      console.log(`  ${String(newOrder).padStart(2, ' ')}. ${c.title} (order ${c.order ?? 'null'} -> ${newOrder})`);
      c.order = newOrder;
      await c.save();
      changed++;
    }
  }

  console.log(`Done. ${courses.length} courses processed, ${changed} updated.`);
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
