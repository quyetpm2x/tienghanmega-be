require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/database');

const Admin = require('../models/Admin');
const Course = require('../models/Course');
const Teacher = require('../models/Teacher');
const Schedule = require('../models/Schedule');
const Class = require('../models/Class');
const Student = require('../models/Student');
const Revenue = require('../models/Revenue');
const Registration = require('../models/Registration');
const TeacherSession = require('../models/TeacherSession');

// ── Data ─────────────────────────────────────────────────────────────────────

const admins = [
  { username: 'admin', password: 'mega@2026', name: 'Quản Trị Viên' },
];

const courses = [
  { slug:1, title:'Sơ Cấp 1', desc:'Khóa học dành cho người mới bắt đầu, giúp học viên làm quen với bảng chữ cái Hangeul, luyện tập phát âm và các chủ đề tiếng Hàn cơ bản cùng thầy cô Việt - Hàn.', level:'Sơ cấp', duration:'3 tháng', students:2100, rating:4.9, price:'1.990.000', cat:'beginner', bg:'linear-gradient(135deg,#fee2e2,#c0392b)', char:'한', instructor:'Cô Quỳnh Thư', accent:'#c0392b', accentLight:'#fee2e2', schedule:{ time:'19:30 – 21:30', days:'Thứ 2, 4, 6, Chủ nhật' }, content:['Làm quen bảng chữ cái Hangeul, cấu tạo câu, chỉnh sửa phát âm và ngữ điệu','Tìm hiểu 15 bài khoá tiếng Hàn sơ cấp, kết hợp 4 kĩ năng nghe - nói - đọc - viết','Thực hành nghe - nói, chuẩn hóa phát âm cùng thầy cô người Hàn'], classInfo:{ sessions:'35 buổi', duration:'2h/buổi', size:'6 – 10 học viên', teacher:'Việt - Hàn' }, commitment:{ target:'Giao tiếp cơ bản', result:'80/200 TOPIK I sau khoá học', refund:false } },
  { slug:2, title:'Sơ Cấp 2', desc:'Khóa học giúp bạn củng cố nền tảng Sơ Cấp 1, mở rộng vốn từ vựng và ngữ pháp. Phát triển kỹ năng giao tiếp trôi chảy trong các tình huống cụ thể.', level:'Sơ cấp', duration:'3 tháng', students:1800, rating:4.8, price:'1.990.000', cat:'beginner', bg:'linear-gradient(135deg,#fff3e0,#E67E22)', char:'국', instructor:'Thầy Hongsik', accent:'#E67E22', accentLight:'#fff3e0', schedule:{ time:'19:30 – 21:30 hoặc 21:30 – 23:30', days:'Thứ 2,4,6 hoặc 3,5,7' }, content:['Rèn luyện kỹ năng phản xạ giao tiếp sơ cấp','Thực hành 15 bài khóa giáo trình THTH cuốn 2, kết hợp 4 kĩ năng nghe - nói - đọc - viết','Làm quen với đề thi TOPIK I','Học bổ trợ MIỄN PHÍ lớp SC1'], freeBonus:'Học bổ trợ MIỄN PHÍ lớp SC1', classInfo:{ sessions:'33 buổi', duration:'2h/buổi', size:'6 – 10 học viên', teacher:'Việt - Hàn' }, commitment:{ target:'Giao tiếp A2', result:'140/200 TOPIK I sau khoá học', refund:false } },
  { slug:3, title:'Trung Cấp 3', desc:'Khóa học giúp bạn nâng cao ngữ pháp, tăng cường vốn từ vựng và rèn luyện kỹ năng NGHE - NÓI - VIẾT. Tạo nền tảng vững chắc để làm quen với đề thi TOPIK II.', level:'Trung cấp', duration:'3 tháng', students:1200, rating:4.8, price:'1.990.000', cat:'beginner', bg:'linear-gradient(135deg,#dbeafe,#1E3A5F)', char:'어', instructor:'Cô Dahyun', accent:'#1E3A5F', accentLight:'#dbeafe', schedule:{ time:'19:30 – 21:30 hoặc 21:30 – 23:30', days:'Thứ 2,4,6 hoặc 3,5,7' }, content:['Rèn luyện phản xạ giao tiếp trung cấp qua tin tức, video','Thực hành 15 bài khóa giáo trình THTH cuốn 3, kết hợp 4 kĩ năng nghe - nói - đọc - viết','Làm quen với đề thi TOPIK II','Học bổ trợ MIỄN PHÍ lớp SC2'], freeBonus:'Học bổ trợ MIỄN PHÍ lớp SC2', classInfo:{ sessions:'33 buổi', duration:'2h/buổi', size:'6 – 10 học viên', teacher:'Việt - Hàn' }, commitment:{ target:'Giao tiếp B1', result:'100/200 MEGA TEST nội bộ tại MEGA', refund:false } },
  { slug:4, title:'TOPIK II Cấp 3–4', desc:'Khóa học giúp bạn nắm vững ngữ pháp và từ vựng Trung - Cao Cấp thông dụng trong bài thi TOPIK, những mẹo làm bài hiệu quả để tự tin đạt TOPIK II cấp 3–4.', level:'TOPIK', duration:'2.5 tháng', students:980, rating:4.9, price:'3.500.000', cat:'topik', bg:'linear-gradient(135deg,#ede9fe,#6366f1)', char:'시', instructor:'Cô Dahyun', accent:'#6366f1', accentLight:'#ede9fe', schedule:{ time:'19:30 – 21:30 hoặc 21:30 – 23:30', days:'Thứ 2,4,6 hoặc 3,5,7' }, content:['Tổng ôn kiến thức trung cấp toàn diện','Luyện tập chuyên sâu từng dạng đề thi và các mẹo làm bài','Nạp ngay 150 ngữ pháp và 2000 từ vựng trung - cao cấp','Học bổ trợ MIỄN PHÍ lớp TC3'], freeBonus:'Học bổ trợ MIỄN PHÍ lớp TC3', classInfo:{ sessions:'30 buổi', duration:'2h/buổi', size:'6 – 10 học viên', teacher:'Việt Nam' }, commitment:{ target:'TOPIK II Cấp 3', result:'TOPIK II Cấp 3 — học lại MIỄN PHÍ nếu chưa đạt', refund:true } },
  { slug:5, title:'Giao Tiếp Ứng Dụng', desc:'Khóa học giúp bạn rèn luyện phản xạ giao tiếp trong đời sống thường nhật và công việc, chỉnh sửa ngữ điệu và chuẩn hóa phát âm. Mở rộng vốn từ vựng giao tiếp thực chiến.', level:'Giao tiếp', duration:'2 tháng', students:650, rating:4.8, price:'1.990.000', cat:'conversation', bg:'linear-gradient(135deg,#d1fae5,#10b981)', char:'말', instructor:'Thầy Hongsik', accent:'#10b981', accentLight:'#d1fae5', schedule:{ time:'19:30 – 21:30 hoặc 21:30 – 23:30', days:'Thứ 2,4,6 hoặc 3,5,7' }, content:['Rèn luyện phản xạ giao tiếp sơ - trung cấp qua tin tức, video, phóng sự thực tế','Thực hành kỹ năng: Nghe - Nói và Nghe - Dịch hội thoại','Chuẩn hóa phát âm, ngữ điệu chuẩn bản ngữ','Học bổ trợ MIỄN PHÍ lớp SC2'], freeBonus:'Học bổ trợ MIỄN PHÍ lớp SC2', classInfo:{ sessions:'24 buổi', duration:'2h/buổi', size:'6 học viên', teacher:'Việt - Hàn' }, commitment:{ target:'Giao tiếp tự nhiên', result:'Giao tiếp tự nhiên, chuẩn phát âm bản ngữ', refund:false } },
  { slug:6, title:'Ôn thi THPT Quốc Gia', desc:'Khóa học dành cho học sinh lựa chọn môn tiếng Hàn để thi tốt nghiệp THPTQG. Tổng ôn sơ - trung cấp, rèn luyện kỹ năng làm đề hướng tới mục tiêu đạt 8–10 điểm.', level:'Ôn thi THPT', duration:'2 tháng', students:420, rating:4.9, price:'2.490.000', cat:'topik', bg:'linear-gradient(135deg,#fee2e2,#dc2626)', char:'학', instructor:'Cô Quỳnh Thư', accent:'#dc2626', accentLight:'#fee2e2', schedule:{ time:'19:30 – 21:30', days:'Thứ 2,4,6 hoặc 3,5,7' }, content:['Tổng ôn kiến thức trình độ Sơ - Trung cấp','Làm quen với đề thi tiếng Hàn tốt nghiệp THPTQG','Rèn luyện kỹ năng làm đề, các mẹo xử lý bài nhanh - hiệu quả','Học bổ trợ MIỄN PHÍ lớp SC2'], freeBonus:'Học bổ trợ MIỄN PHÍ lớp SC2', classInfo:{ sessions:'25 buổi', duration:'2h/buổi', size:'6 – 10 học viên', teacher:'Việt Nam' }, commitment:{ target:'Đạt 8+ điểm', result:'8 ĐIỂM bài thi tốt nghiệp THPTQG', refund:false } },
  { slug:7, title:'Lộ Trình Về Đích', desc:'Giúp học viên làm chủ tiếng Hàn từ con số 0 tới TOPIK II cấp 3,4 với học phí tối ưu. Nhóm nhỏ 10 học viên, nâng cao chất lượng học và đảm bảo đầu ra.', level:'Bundle', duration:'12 tháng', students:320, rating:5.0, price:'2.990.000', cat:'bundle', bg:'linear-gradient(135deg,#fbf7e4,#f6c937)', char:'길', instructor:'Thầy Hongsik', accent:'#E67E22', accentLight:'#fff3e0', schedule:{ time:'19:30 – 21:30', days:'Thứ 2, 4, 6, Chủ nhật' }, content:['SC1 (35 buổi): Thành thạo Hangeul, khắc phục lỗi phát âm và ngữ điệu','SC2 (33 buổi): Giao tiếp cơ bản, thành thạo 4 kĩ năng LSRW','TC3 (33 buổi): Giao tiếp linh hoạt, làm chủ 2000+ từ vựng thông dụng','TOPIK II (25 buổi): 150 ngữ pháp, 3000+ từ vựng, chinh phục TOPIK II'], freeBonus:'Học gia sư 1-1 MIỄN PHÍ nếu cần bổ sung', classInfo:{ sessions:'126 buổi', duration:'2h/buổi', size:'10 học viên', teacher:'Việt - Hàn' }, commitment:{ target:'Từ 0 → TOPIK II Cấp 3,4', result:'TOPIK II Cấp 3,4 — chỉ 12K/giờ học', refund:false } },
];

const teachers = [
  { name:'Cô Quỳnh Thư',   nat:'vn', cert:'Cử nhân Ngôn ngữ Hàn Quốc',    credentials:['5 năm kinh nghiệm giảng dạy tiếng Hàn','Chứng chỉ giảng dạy KoFLA chuẩn quốc tế','Chuyên gia ôn thi THPT Quốc Gia tiếng Hàn','Cựu học viên chương trình Samsung – KF Korea','Phương pháp phát âm chuẩn bản ngữ'], spec:'Sơ cấp, Ôn thi THPTQG', color:'#c0392b', src:'/assets/giang-vien/gv-quynh-thu.svg', classes:['SC1-A','SC2-A','THPT-A','SC1-C'], salary:15000000, phone:'0901 999 001', rating:4.9, startDate:'2024-09-01', totalPaidSalary:285000000, totalSessions:324, monthSessions:18, adminNote:'Giảng viên nhiệt tình, được học sinh yêu thích.' },
  { name:'Thầy Hongsik',   nat:'kr', cert:'Chứng Chỉ Tiếng Việt C1',        credentials:['Cử nhân chuyên ngành tiếng Việt tại Đại học KHXH và Nhân Văn TP HCM','Giao tiếp thành thạo tiếng Việt','4 năm kinh nghiệm giảng dạy tiếng Hàn tại Việt Nam','3 năm kinh nghiệm giảng dạy tiếng Việt cho người Hàn','Cử nhân tại ĐH SungKyunkwan'], spec:'Giao tiếp, Chuẩn phát âm', color:'#c0392b', src:'/assets/giang-vien/gv-hongsik.svg', classes:['SC1-B','GT-A'], salary:20000000, phone:'0912 999 002', rating:4.8, startDate:'2025-01-15', totalPaidSalary:300000000, totalSessions:270, monthSessions:20, adminNote:'Phát âm chuẩn, phương pháp giảng dạy giao tiếp tốt.' },
  { name:'Cô Nông Sen',    nat:'vn', cert:'Cử nhân Ngôn ngữ Hàn Quốc',    credentials:['4 năm kinh nghiệm giảng dạy tiếng Hàn','Chuyên gia phát âm và hội thoại tự nhiên','Tốt nghiệp khoa Hàn Quốc học ĐH KHXH–NV','Phương pháp giảng dạy tương tác, vui vẻ','Đã dạy hơn 500 học viên sơ cấp'], spec:'Sơ cấp, Hội thoại', color:'#E67E22', src:'/assets/giang-vien/gv-nong-sen.svg', classes:['SC1-C'], salary:13000000, phone:'0934 999 004', rating:4.8, startDate:'2025-06-01', totalPaidSalary:130000000, totalSessions:120, monthSessions:12 },
  { name:'Cô Phương Linh', nat:'vn', cert:'TOPIK II Cấp 4',               credentials:['6 năm kinh nghiệm giảng dạy tiếng Hàn','Chuyên sâu ngữ pháp trung & cao cấp','Tốt nghiệp Đại học Ngoại ngữ – ĐH Đà Nẵng','Giảng viên đội ngũ MEGA từ năm 2020','Phương pháp phân tích ngữ pháp hệ thống'], spec:'Trung cấp, Ngữ pháp', color:'#6366f1', src:'/assets/giang-vien/gv-phuong-linh.svg', classes:[], salary:14000000, phone:'0945 999 005', rating:4.7, startDate:'2025-08-01' },
  { name:'Cô Thanh Chúc',  nat:'vn', cert:'TOPIK II Cấp 3',               credentials:['4 năm kinh nghiệm giảng dạy tiếng Hàn','Chuyên gia phát âm chuẩn bản ngữ Hàn Quốc','Giảng dạy theo giáo trình KoFLA chuẩn quốc tế','Thành thạo luyện âm Hangeul từ con số 0','Giảng viên được yêu thích nhất khối sơ cấp'], spec:'Sơ cấp, Phát âm chuẩn', color:'#10b981', src:'/assets/giang-vien/gv-thanh-chuc.svg', classes:[], salary:13500000, phone:'0956 999 006', rating:4.8, startDate:'2025-07-01' },
  { name:'Cô Mỹ Hạnh',     nat:'vn', cert:'TOPIK II Cấp 5',               credentials:['7 năm kinh nghiệm giảng dạy TOPIK','Chuyên gia chiến lược làm bài thi TOPIK','Tỉ lệ học viên đạt chứng chỉ TOPIK: 95%','Tác giả tài liệu luyện thi TOPIK tại MEGA','Từng học tập và làm việc tại Seoul, Hàn Quốc'], spec:'TOPIK I & II, Giao tiếp', color:'#6366f1', src:'/assets/giang-vien/gv-my-hanh.svg' },
  { name:'Cô Thảo Linh',   nat:'vn', cert:'TOPIK I Cấp 2',                credentials:['3 năm kinh nghiệm giảng dạy tiếng Hàn','Chuyên dạy sơ cấp cho người mới bắt đầu','Phương pháp học vui vẻ, dễ nhớ, dễ hiểu','Tốt nghiệp khoa Hàn Quốc học ĐH KHXH–NV','Giảng viên năng động, tận tâm tại MEGA'], spec:'Sơ cấp, Phát âm', color:'#E67E22', src:'/assets/giang-vien/gv-thao-linh.svg' },
  { name:'Cô Đinh Sang',   nat:'vn', cert:'TOPIK II Cấp 4',               credentials:['5 năm kinh nghiệm giảng dạy tiếng Hàn','Chuyên gia ngữ pháp trung & cao cấp','Luyện thi TOPIK II Cấp 3–4 chuyên sâu','Tốt nghiệp Đại học Ngoại ngữ Hà Nội','Phương pháp phân tích cấu trúc câu tiếng Hàn'], spec:'Trung cấp, TOPIK', color:'#1E3A5F', src:'/assets/giang-vien/gv-dinh-sang.svg' },
  { name:'Cô Nguyễn Nga',  nat:'vn', cert:'TOPIK II Cấp 5',               credentials:['6 năm kinh nghiệm dạy tiếng Hàn','Chuyên gia luyện thi TOPIK II toàn diện','Từng học và thực tập tại Seoul, Hàn Quốc','95% học viên đạt chứng chỉ sau khoá học','Tác giả bộ đề mock test TOPIK tại MEGA'], spec:'TOPIK II, Ôn thi', color:'#c0392b', src:'/assets/giang-vien/gv-nguyen-nga.svg' },
  { name:'Cô Thu Trang',   nat:'vn', cert:'TOPIK II Cấp 3',               credentials:['4 năm kinh nghiệm giảng dạy giao tiếp','Phương pháp học tiếng Hàn qua tình huống thực','Chuyên gia luyện phản xạ nói tự nhiên','Kinh nghiệm thông dịch tại công ty Hàn Quốc','Giảng viên giao tiếp thực chiến tại MEGA'], spec:'Giao tiếp, Sơ cấp', color:'#10b981', src:'/assets/giang-vien/gv-thu-trang.svg' },
  { name:'Cô Ánh Linh',    nat:'vn', cert:'TOPIK II Cấp 4',               credentials:['5 năm kinh nghiệm giảng dạy tiếng Hàn','Dạy từ sơ cấp đến luyện thi TOPIK II','Chứng chỉ giảng dạy quốc tế KoFLA','Phương pháp kết hợp ngữ pháp và hội thoại','Học viên yêu thích qua nhiều năm giảng dạy'], spec:'Sơ & Trung cấp, Ngữ pháp', color:'#c0392b', src:'/assets/giang-vien/gv-anh-linh.svg' },
];

const schedules = [
  { month:'Tháng 5/2025', courses:[
    { name:'Sơ Cấp 1', date:'05/05', days:'T2–T4–T6', time:'19:30–21:30', slots:7 },
    { name:'Trung Cấp 3', date:'07/05', days:'T3–T5–T7', time:'19:30–21:30', slots:5 },
    { name:'Giao Tiếp Ứng Dụng', date:'10/05', days:'T2–T4–T6', time:'21:30–23:30', slots:3 },
  ]},
  { month:'Tháng 6/2025', courses:[
    { name:'TOPIK II Cấp 3–4', date:'02/06', days:'T2–T4–T6', time:'19:30–21:30', slots:6 },
    { name:'Sơ Cấp 2', date:'04/06', days:'T3–T5–T7', time:'19:30–21:30', slots:8 },
    { name:'Ôn thi THPT Quốc Gia', date:'09/06', days:'T2–T4–T6', time:'19:30–21:30', slots:4 },
  ]},
];

const classes = [
  { name:'SC1-A',    course:'Sơ Cấp 1',          teacher:'Cô Quỳnh Thư',              days:'T2, T4, T6', time:'19:30–21:30', capacity:10, enrolled:10, startDate:'2026-02-03', endDate:'2026-05-02', status:'active',   color:'#c0392b' },
  { name:'SC1-B',    course:'Sơ Cấp 1',          teacher:'Thầy Hongsik',               days:'T3, T5, T7', time:'21:30–23:30', capacity:10, enrolled:8,  startDate:'2026-02-10', endDate:'2026-05-10', status:'active',   color:'#c0392b' },
  { name:'SC2-A',    course:'Sơ Cấp 2',          teacher:'Cô Quỳnh Thư',              days:'T2, T4, T6', time:'21:30–23:30', capacity:10, enrolled:6,  startDate:'2026-02-03', endDate:'2026-05-02', status:'active',   color:'#E67E22' },
  { name:'TC3-A',    course:'Trung Cấp 3',        teacher:'Cô Dahyun',                 days:'T3, T5, T7', time:'19:30–21:30', capacity:10, enrolled:9,  startDate:'2026-01-15', endDate:'2026-04-15', status:'active',   color:'#1E3A5F' },
  { name:'TOPIK2-A', course:'TOPIK II Cấp 3–4',  teacher:'Cô Dahyun',                 days:'T7, CN',     time:'08:00–10:00', capacity:8,  enrolled:5,  startDate:'2026-03-01', endDate:'2026-05-15', status:'active',   color:'#6366f1' },
  { name:'GT-A',     course:'Giao Tiếp Ứng Dụng',teacher:'Thầy Hongsik',               days:'T2, T4, T6', time:'21:30–23:30', capacity:10, enrolled:7,  startDate:'2026-02-17', endDate:'2026-05-16', status:'active',   color:'#10b981' },
  { name:'LDVD-A',   course:'Lộ Trình Về Đích',  teacher:'Cô Dahyun & Thầy Hongsik',  days:'T2–CN',      time:'Linh hoạt',   capacity:10, enrolled:4,  startDate:'2026-01-01', endDate:'2027-01-01', status:'active',   color:'#f6c937' },
  { name:'THPT-A',   course:'Ôn thi THPT',        teacher:'Cô Quỳnh Thư',              days:'T7, CN',     time:'10:00–12:00', capacity:8,  enrolled:6,  startDate:'2026-03-15', endDate:'2026-05-31', status:'active',   color:'#dc2626' },
  { name:'SC1-C',    course:'Sơ Cấp 1',          teacher:'Cô Nông Sen',               days:'T2, T4, T6', time:'19:30–21:30', capacity:10, enrolled:3,  startDate:'2026-05-15', endDate:'2026-08-15', status:'upcoming', color:'#c0392b' },
  { name:'TC3-B',    course:'Trung Cấp 3',        teacher:'Cô Dahyun',                 days:'T3, T5, T7', time:'19:30–21:30', capacity:10, enrolled:0,  startDate:'2026-05-20', endDate:'2026-08-20', status:'upcoming', color:'#1E3A5F' },
  { name:'SC1-X',    course:'Sơ Cấp 1',          teacher:'Cô Phương Linh',            days:'T2, T4, T6', time:'19:30–21:30', capacity:10, enrolled:10, startDate:'2025-10-01', endDate:'2026-01-01', status:'closed',   color:'#c0392b' },
  { name:'SC2-X',    course:'Sơ Cấp 2',          teacher:'Cô Thanh Chúc',             days:'T3, T5, T7', time:'21:30–23:30', capacity:10, enrolled:8,  startDate:'2025-10-15', endDate:'2026-01-15', status:'closed',   color:'#E67E22' },
];

const revenues = [
  { month:'Tháng 1/2026', shortMonth:'T1', revenue:42500000, target:45000000, collected:38000000, breakdown:{ beginner:18000000, intermediate:12000000, topik:8500000, conversation:4000000 } },
  { month:'Tháng 2/2026', shortMonth:'T2', revenue:58200000, target:55000000, collected:52000000, breakdown:{ beginner:25000000, intermediate:15200000, topik:10000000, conversation:8000000 } },
  { month:'Tháng 3/2026', shortMonth:'T3', revenue:71400000, target:65000000, collected:65000000, breakdown:{ beginner:30000000, intermediate:18000000, topik:14000000, conversation:9400000 } },
  { month:'Tháng 4/2026', shortMonth:'T4', revenue:63800000, target:70000000, collected:55000000, breakdown:{ beginner:27000000, intermediate:17000000, topik:12000000, conversation:7800000 } },
];

const registrations = [
  { name:'Nguyễn Thúy Hằng', phone:'0901111222', course:'Sơ Cấp 1',          level:'Sơ cấp',  time:'T2,T4,T6 19:30', source:'Facebook', status:'new' },
  { name:'Lê Văn Hoàng',     phone:'0912222333', course:'TOPIK II Cấp 3–4',  level:'TOPIK',   time:'T7, CN',         source:'Zalo',     status:'new' },
  { name:'Trần Thị Linh',    phone:'0923333444', course:'Lộ Trình Về Đích',  level:'Bundle',  time:'Linh hoạt',      source:'Website',  status:'contacted' },
  { name:'Phạm Quang Trung', phone:'0934444555', course:'Sơ Cấp 2',          level:'Sơ cấp',  time:'T3,T5,T7 21:30', source:'TikTok',   status:'new' },
  { name:'Vũ Thị Minh',      phone:'0945555666', course:'Giao Tiếp',         level:'Giao tiếp',time:'T2,T4,T6 21:30', source:'Facebook', status:'enrolled' },
];

// ── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  await connectDB();
  console.log('Connected to MongoDB');

  // Clear all collections
  await Promise.all([
    Admin.deleteMany({}),
    Course.deleteMany({}),
    Teacher.deleteMany({}),
    Schedule.deleteMany({}),
    Class.deleteMany({}),
    Student.deleteMany({}),
    Revenue.deleteMany({}),
    Registration.deleteMany({}),
    TeacherSession.deleteMany({}),
  ]);
  console.log('Cleared existing data');

  // Insert
  await Admin.create(admins);
  await Course.insertMany(courses);
  await Teacher.insertMany(teachers);
  await Schedule.insertMany(schedules);
  const insertedClasses = await Class.insertMany(classes);
  await Revenue.insertMany(revenues);
  await Registration.insertMany(registrations);

  // Build classId map
  const classMap = {};
  insertedClasses.forEach(c => { classMap[c.name] = c._id; });

  // Students — assign classId from inserted classes
  const studentData = [
    { name:'Nguyễn Thu Hà',    phone:'0901234567', email:'thuha@gmail.com',      className:'SC1-A',    level:'Sơ cấp 1',         startDate:'2026-02-03', tuitionStatus:'paid',    amount:1990000 },
    { name:'Trần Minh Khôi',   phone:'0912345678', email:'minhkhoi@gmail.com',   className:'SC1-A',    level:'Sơ cấp 1',         startDate:'2026-02-03', tuitionStatus:'partial', amount:1000000 },
    { name:'Lê Phương Anh',    phone:'0923456789', email:'phuonganh@gmail.com',  className:'SC1-A',    level:'Sơ cấp 1',         startDate:'2026-02-03', tuitionStatus:'paid',    amount:1990000 },
    { name:'Phạm Hoàng Nam',   phone:'0934567890', email:'hoangnam@gmail.com',   className:'SC1-A',    level:'Sơ cấp 1',         startDate:'2026-02-03', tuitionStatus:'unpaid',  amount:0 },
    { name:'Vũ Ngọc Bích',     phone:'0945678901', email:'ngocbich@gmail.com',   className:'SC1-A',    level:'Sơ cấp 1',         startDate:'2026-02-03', tuitionStatus:'paid',    amount:1990000 },
    { name:'Đặng Quỳnh Như',   phone:'0956789012', email:'quynhnhu@gmail.com',   className:'SC1-A',    level:'Sơ cấp 1',         startDate:'2026-02-03', tuitionStatus:'paid',    amount:1990000 },
    { name:'Bùi Thanh Tùng',   phone:'0967890123', email:'thanhtung@gmail.com',  className:'SC1-A',    level:'Sơ cấp 1',         startDate:'2026-02-03', tuitionStatus:'paid',    amount:1990000 },
    { name:'Hoàng Lan Anh',    phone:'0978901234', email:'lananh@gmail.com',     className:'SC1-A',    level:'Sơ cấp 1',         startDate:'2026-02-03', tuitionStatus:'partial', amount:1000000 },
    { name:'Ngô Việt Hùng',    phone:'0989012345', email:'viethung@gmail.com',   className:'SC1-A',    level:'Sơ cấp 1',         startDate:'2026-02-03', tuitionStatus:'paid',    amount:1990000 },
    { name:'Dương Thị Mai',    phone:'0990123456', email:'thaimai@gmail.com',    className:'SC1-A',    level:'Sơ cấp 1',         startDate:'2026-02-03', tuitionStatus:'paid',    amount:1990000 },
    { name:'Trịnh Xuân Phong', phone:'0901234560', email:'xuanphong@gmail.com',  className:'SC1-B',    level:'Sơ cấp 1',         startDate:'2026-02-10', tuitionStatus:'paid',    amount:1990000 },
    { name:'Lý Thu Thảo',      phone:'0912345670', email:'thuthao@gmail.com',    className:'SC1-B',    level:'Sơ cấp 1',         startDate:'2026-02-10', tuitionStatus:'paid',    amount:1990000 },
    { name:'Nguyễn Văn Đức',   phone:'0923456780', email:'vanduc@gmail.com',     className:'SC1-B',    level:'Sơ cấp 1',         startDate:'2026-02-10', tuitionStatus:'unpaid',  amount:0 },
    { name:'Phan Thị Lan',     phone:'0934567800', email:'thilan@gmail.com',     className:'SC1-B',    level:'Sơ cấp 1',         startDate:'2026-02-10', tuitionStatus:'paid',    amount:1990000 },
    { name:'Cao Minh Tài',     phone:'0945678900', email:'minhtai@gmail.com',    className:'SC1-B',    level:'Sơ cấp 1',         startDate:'2026-02-10', tuitionStatus:'paid',    amount:1990000 },
    { name:'Đỗ Hải Yến',       phone:'0956789000', email:'haiyen@gmail.com',     className:'SC1-B',    level:'Sơ cấp 1',         startDate:'2026-02-10', tuitionStatus:'partial', amount:1000000 },
    { name:'Lưu Thị Hoa',      phone:'0967890100', email:'thihoa@gmail.com',     className:'SC1-B',    level:'Sơ cấp 1',         startDate:'2026-02-10', tuitionStatus:'paid',    amount:1990000 },
    { name:'Phùng Quốc Hưng',  phone:'0978901200', email:'quochung@gmail.com',   className:'SC1-B',    level:'Sơ cấp 1',         startDate:'2026-02-10', tuitionStatus:'paid',    amount:1990000 },
    { name:'Vương Mỹ Hạnh',    phone:'0901234501', email:'myhanh@gmail.com',     className:'SC2-A',    level:'Sơ cấp 2',         startDate:'2026-02-03', tuitionStatus:'paid',    amount:1990000 },
    { name:'Tô Minh Tuấn',     phone:'0912345601', email:'minhtuan@gmail.com',   className:'SC2-A',    level:'Sơ cấp 2',         startDate:'2026-02-03', tuitionStatus:'paid',    amount:1990000 },
    { name:'Trần Bích Ngọc',   phone:'0923456701', email:'bichngoc@gmail.com',   className:'SC2-A',    level:'Sơ cấp 2',         startDate:'2026-02-03', tuitionStatus:'paid',    amount:1990000 },
    { name:'Lê Quang Vinh',    phone:'0934567801', email:'quangvinh@gmail.com',  className:'SC2-A',    level:'Sơ cấp 2',         startDate:'2026-02-03', tuitionStatus:'unpaid',  amount:0 },
    { name:'Nguyễn Cẩm Tú',    phone:'0945678901', email:'camtu@gmail.com',      className:'SC2-A',    level:'Sơ cấp 2',         startDate:'2026-02-03', tuitionStatus:'paid',    amount:1990000 },
    { name:'Đinh Trọng Nghĩa', phone:'0956789001', email:'trongnghia@gmail.com', className:'SC2-A',    level:'Sơ cấp 2',         startDate:'2026-02-03', tuitionStatus:'partial', amount:1000000 },
    { name:'Hoàng Thị Yến',    phone:'0901234511', email:'thiyeni@gmail.com',    className:'TC3-A',    level:'Trung cấp 3',       startDate:'2026-01-15', tuitionStatus:'paid',    amount:1990000 },
    { name:'Nguyễn Bảo Long',  phone:'0912345611', email:'baolong@gmail.com',    className:'TC3-A',    level:'Trung cấp 3',       startDate:'2026-01-15', tuitionStatus:'paid',    amount:1990000 },
    { name:'Phan Ngọc Trâm',   phone:'0923456711', email:'ngoctram@gmail.com',   className:'TC3-A',    level:'Trung cấp 3',       startDate:'2026-01-15', tuitionStatus:'paid',    amount:1990000 },
    { name:'Bùi Khánh Linh',   phone:'0934567811', email:'khanhlinh@gmail.com',  className:'TC3-A',    level:'Trung cấp 3',       startDate:'2026-01-15', tuitionStatus:'partial', amount:1000000 },
    { name:'Đặng Minh Châu',   phone:'0945678911', email:'minhchau@gmail.com',   className:'TC3-A',    level:'Trung cấp 3',       startDate:'2026-01-15', tuitionStatus:'paid',    amount:1990000 },
    { name:'Vũ Tiến Dũng',     phone:'0956789011', email:'tiendung@gmail.com',   className:'TC3-A',    level:'Trung cấp 3',       startDate:'2026-01-15', tuitionStatus:'unpaid',  amount:0 },
    { name:'Lê Thanh Hà',      phone:'0967890111', email:'thanhha@gmail.com',    className:'TC3-A',    level:'Trung cấp 3',       startDate:'2026-01-15', tuitionStatus:'paid',    amount:1990000 },
    { name:'Trương Nhật Minh', phone:'0978901211', email:'nhatminh@gmail.com',   className:'TC3-A',    level:'Trung cấp 3',       startDate:'2026-01-15', tuitionStatus:'paid',    amount:1990000 },
    { name:'Lý Thị Phương',    phone:'0989012311', email:'thiphuong@gmail.com',  className:'TC3-A',    level:'Trung cấp 3',       startDate:'2026-01-15', tuitionStatus:'paid',    amount:1990000 },
    { name:'Phạm Anh Tú',      phone:'0901234522', email:'anhtu@gmail.com',      className:'TOPIK2-A', level:'TOPIK II Cấp 3–4',  startDate:'2026-03-01', tuitionStatus:'paid',    amount:3500000 },
    { name:'Trần Hải Đăng',    phone:'0912345622', email:'haidang@gmail.com',    className:'TOPIK2-A', level:'TOPIK II Cấp 3–4',  startDate:'2026-03-01', tuitionStatus:'paid',    amount:3500000 },
    { name:'Nguyễn Lan Hương', phone:'0923456722', email:'lanhuong@gmail.com',   className:'TOPIK2-A', level:'TOPIK II Cấp 3–4',  startDate:'2026-03-01', tuitionStatus:'partial', amount:2000000 },
    { name:'Đỗ Thành Đạt',     phone:'0934567822', email:'thanhdat@gmail.com',   className:'TOPIK2-A', level:'TOPIK II Cấp 3–4',  startDate:'2026-03-01', tuitionStatus:'paid',    amount:3500000 },
    { name:'Cao Thị Hằng',     phone:'0945678922', email:'thihang@gmail.com',    className:'TOPIK2-A', level:'TOPIK II Cấp 3–4',  startDate:'2026-03-01', tuitionStatus:'paid',    amount:3500000 },
    { name:'Lê Văn Thành',     phone:'0956789033', email:'vanthanh@gmail.com',   className:'GT-A',     level:'Giao tiếp',         startDate:'2026-02-17', tuitionStatus:'paid',    amount:1990000 },
    { name:'Phạm Thị Diệu',    phone:'0967890133', email:'thidieu@gmail.com',    className:'GT-A',     level:'Giao tiếp',         startDate:'2026-02-17', tuitionStatus:'paid',    amount:1990000 },
    { name:'Nguyễn Mạnh Dũng', phone:'0978901233', email:'manhdung@gmail.com',   className:'GT-A',     level:'Giao tiếp',         startDate:'2026-02-17', tuitionStatus:'paid',    amount:1990000 },
    { name:'Trần Khánh Chi',   phone:'0989012333', email:'khanhchi@gmail.com',   className:'GT-A',     level:'Giao tiếp',         startDate:'2026-02-17', tuitionStatus:'unpaid',  amount:0 },
    { name:'Bùi Hồng Ngân',    phone:'0901234433', email:'hongngan@gmail.com',   className:'GT-A',     level:'Giao tiếp',         startDate:'2026-02-17', tuitionStatus:'paid',    amount:1990000 },
    { name:'Hoàng Đức Long',   phone:'0912345533', email:'duclong@gmail.com',    className:'GT-A',     level:'Giao tiếp',         startDate:'2026-02-17', tuitionStatus:'partial', amount:1000000 },
    { name:'Vũ Phương Thảo',   phone:'0923456633', email:'phuongthao@gmail.com', className:'GT-A',     level:'Giao tiếp',         startDate:'2026-02-17', tuitionStatus:'paid',    amount:1990000 },
    { name:'Phan Thị Thu',     phone:'0934567844', email:'thithu@gmail.com',     className:'LDVD-A',   level:'Lộ trình về đích',  startDate:'2026-01-01', tuitionStatus:'paid',    amount:2990000 },
    { name:'Bùi Đức Huy',      phone:'0945678944', email:'duchuy@gmail.com',     className:'LDVD-A',   level:'Lộ trình về đích',  startDate:'2026-01-01', tuitionStatus:'paid',    amount:2990000 },
    { name:'Cao Hoàng Anh',    phone:'0956789044', email:'hoanganh@gmail.com',   className:'LDVD-A',   level:'Lộ trình về đích',  startDate:'2026-01-01', tuitionStatus:'partial', amount:2000000 },
    { name:'Lê Ngọc Sơn',      phone:'0967890144', email:'ngocson@gmail.com',    className:'LDVD-A',   level:'Lộ trình về đích',  startDate:'2026-01-01', tuitionStatus:'paid',    amount:2990000 },
    { name:'Trần Thị Thùy',    phone:'0901234555', email:'thithuy@gmail.com',    className:'THPT-A',   level:'Ôn thi THPT',       startDate:'2026-03-15', tuitionStatus:'paid',    amount:2990000 },
    { name:'Nguyễn Đức Anh',   phone:'0912345655', email:'ducanh@gmail.com',     className:'THPT-A',   level:'Ôn thi THPT',       startDate:'2026-03-15', tuitionStatus:'paid',    amount:2990000 },
    { name:'Lê Ngọc Hân',      phone:'0923456755', email:'ngochan@gmail.com',    className:'THPT-A',   level:'Ôn thi THPT',       startDate:'2026-03-15', tuitionStatus:'paid',    amount:2990000 },
    { name:'Đinh Thị Thanh',   phone:'0934567855', email:'thithanh@gmail.com',   className:'THPT-A',   level:'Ôn thi THPT',       startDate:'2026-03-15', tuitionStatus:'unpaid',  amount:0 },
    { name:'Vũ Minh Tú',       phone:'0945678955', email:'minhtu@gmail.com',     className:'THPT-A',   level:'Ôn thi THPT',       startDate:'2026-03-15', tuitionStatus:'paid',    amount:2990000 },
    { name:'Phạm Quỳnh Chi',   phone:'0956789055', email:'quynhchi@gmail.com',   className:'THPT-A',   level:'Ôn thi THPT',       startDate:'2026-03-15', tuitionStatus:'partial', amount:1500000 },
    { name:'Đỗ Thị Hương',     phone:'0967890166', email:'thithuong@gmail.com',  className:'SC1-C',    level:'Sơ cấp 1',          startDate:'2026-05-15', tuitionStatus:'unpaid',  amount:0 },
    { name:'Nguyễn Hoài Nam',  phone:'0978901266', email:'hoainam@gmail.com',    className:'SC1-C',    level:'Sơ cấp 1',          startDate:'2026-05-15', tuitionStatus:'unpaid',  amount:0 },
    { name:'Lê Bảo Châu',      phone:'0989012366', email:'baochau@gmail.com',    className:'SC1-C',    level:'Sơ cấp 1',          startDate:'2026-05-15', tuitionStatus:'unpaid',  amount:0 },
  ];

  const studentsWithClassId = studentData.map(s => ({
    ...s,
    classId: classMap[s.className] || null,
  }));
  await Student.insertMany(studentsWithClassId);

  // Attendance
  const sessionData = [
    { teacherName:'Cô Quỳnh Thư',  date:'2026-04-07', className:'SC1-A',    status:'taught',  note:'' },
    { teacherName:'Cô Quỳnh Thư',  date:'2026-04-07', className:'SC2-A',    status:'taught',  note:'' },
    { teacherName:'Cô Quỳnh Thư',  date:'2026-04-09', className:'SC1-A',    status:'taught',  note:'' },
    { teacherName:'Cô Quỳnh Thư',  date:'2026-04-09', className:'SC2-A',    status:'taught',  note:'' },
    { teacherName:'Cô Quỳnh Thư',  date:'2026-04-11', className:'SC1-A',    status:'taught',  note:'' },
    { teacherName:'Cô Quỳnh Thư',  date:'2026-04-12', className:'THPT-A',   status:'absent',  note:'Nghỉ bệnh' },
    { teacherName:'Cô Quỳnh Thư',  date:'2026-04-14', className:'SC1-A',    status:'taught',  note:'' },
    { teacherName:'Cô Quỳnh Thư',  date:'2026-04-16', className:'SC1-A',    status:'absent',  note:'Dạy bù thứ 7' },
    { teacherName:'Cô Quỳnh Thư',  date:'2026-04-18', className:'SC2-A',    status:'taught',  note:'' },
    { teacherName:'Cô Quỳnh Thư',  date:'2026-04-19', className:'THPT-A',   status:'taught',  note:'' },
    { teacherName:'Thầy Hongsik',   date:'2026-04-07', className:'GT-A',     status:'taught',  note:'' },
    { teacherName:'Thầy Hongsik',   date:'2026-04-08', className:'SC1-B',    status:'taught',  note:'' },
    { teacherName:'Thầy Hongsik',   date:'2026-04-09', className:'GT-A',     status:'taught',  note:'' },
    { teacherName:'Thầy Hongsik',   date:'2026-04-10', className:'SC1-B',    status:'taught',  note:'' },
    { teacherName:'Thầy Hongsik',   date:'2026-04-11', className:'GT-A',     status:'taught',  note:'' },
    { teacherName:'Thầy Hongsik',   date:'2026-04-12', className:'SC1-B',    status:'absent',  note:'Về Hàn Quốc thăm gia đình' },
    { teacherName:'Thầy Hongsik',   date:'2026-04-14', className:'GT-A',     status:'taught',  note:'' },
    { teacherName:'Cô Dahyun',      date:'2026-04-08', className:'TC3-A',    status:'taught',  note:'' },
    { teacherName:'Cô Dahyun',      date:'2026-04-10', className:'TC3-A',    status:'taught',  note:'' },
    { teacherName:'Cô Dahyun',      date:'2026-04-11', className:'TOPIK2-A', status:'taught',  note:'' },
    { teacherName:'Cô Dahyun',      date:'2026-04-12', className:'TC3-A',    status:'absent',  note:'Nghỉ phép' },
    { teacherName:'Cô Dahyun',      date:'2026-04-13', className:'TOPIK2-A', status:'taught',  note:'' },
    { teacherName:'Cô Nông Sen',    date:'2026-04-14', className:'SC1-C',    status:'taught',  note:'' },
    { teacherName:'Cô Nông Sen',    date:'2026-04-16', className:'SC1-C',    status:'taught',  note:'' },
    { teacherName:'Cô Nông Sen',    date:'2026-04-18', className:'SC1-C',    status:'absent',  note:'Nghỉ đột xuất' },
  ];
  await TeacherSession.insertMany(sessionData);

  console.log('Seed completed successfully!');
  console.log('Admin login: username=admin, password=mega@2026');
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
