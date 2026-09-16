const EnrollmentPackage = require('../models/EnrollmentPackage');
const { studentIndexUnionPipeline, splitUnionRows, moneyByStudent, buildIndexRows } = require('./studentIndexPipeline');

// Chỉ mục học sinh giữ tạm trong RAM của server.
//
// Vì sao cần: cụm Atlas đang dùng bị bóp khi đọc liên tục — cùng một truy vấn lúc nhanh 80ms,
// lúc 2–3 giây. Đổi trang / lọc / tìm kiếm không đổi dữ liệu nên không cần đọc lại; chỉ cần
// một lần dựng chỉ mục rồi dùng lại cho tới khi có thao tác GHI hoặc hết hạn.
//
// KHÔNG phải bản sao lưu trong database: chỉ nằm trong bộ nhớ tiến trình, mất khi restart, và
// mọi đường ghi đều gọi invalidateStudentIndex() nên không có chuyện lệch lâu dài. Hết hạn
// TTL là lưới an toàn cuối cho các thay đổi đi vòng qua code (script chạy thẳng vào database).
const TTL_MS = 60 * 1000;

let cache = null;         // { rows, at }
let inflight = null;      // gộp các yêu cầu đến cùng lúc thành MỘT lần dựng

async function buildIndexRowsFromDb() {
  const rows = await EnrollmentPackage.aggregate(studentIndexUnionPipeline({}));
  const { students, packages, paymentTotals, enrollments, accounts } = splitUnionRows(rows);
  return buildIndexRows({
    students,
    money: moneyByStudent(packages, paymentTotals),
    enrollments,
    accountedIds: new Set(accounts.map(a => String(a.studentId))),
  });
}

async function getStudentIndex() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  if (!inflight) {
    inflight = buildIndexRowsFromDb()
      .then(rows => { cache = { rows, at: Date.now() }; return rows; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

// Gọi sau MỌI thao tác ghi đụng tới học sinh / gói / ghi danh / khoản thu / tài khoản.
function invalidateStudentIndex() {
  cache = null;
}

module.exports = { getStudentIndex, invalidateStudentIndex, TTL_MS };
