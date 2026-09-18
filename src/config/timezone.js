// Ghim múi giờ cho tiến trình Node. Require file này SỚM (dòng đầu của entry point) —
// Node đọc lại process.env.TZ ở mỗi thao tác Date nên đặt muộn vẫn ăn, nhưng đặt sớm thì
// không phải suy nghĩ về thứ tự nữa.
//
// Vì sao cần: "hôm nay" của backend (utils/teacherLedger.js#todayDateStr) lấy theo giờ tiến
// trình. Máy chủ chạy UTC sẽ lệch một ngày với trình duyệt admin trong khung 00:00–07:00 giờ
// VN — cùng một buổi dạy được tính ở trang lương admin nhưng chưa tính ở cổng giảng viên.
// Tệ hơn: ngày 10 hằng tháng là mốc chia kỳ lương, lệch một ngày ở đó là lệch NGUYÊN MỘT KỲ.
//
// KHÔNG viết `process.env.TZ || 'Asia/Ho_Chi_Minh'`: rất nhiều image Docker/PaaS đặt sẵn
// TZ=UTC, và khi đó việc ghim âm thầm không làm gì cả. Ghim cứng, ai thật sự cần múi giờ
// khác thì đặt APP_TZ.
process.env.TZ = process.env.APP_TZ || 'Asia/Ho_Chi_Minh';

module.exports = {};
