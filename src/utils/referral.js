const Student = require('../models/Student');
const Teacher = require('../models/Teacher');

// Bỏ các ký tự dễ nhầm lẫn khi đọc/gõ tay: I, O, 0, 1.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const COMMISSION_RATE = 0.1; // 10% hoa hồng trên học phí khoá học của người được giới thiệu

function randomCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

async function codeTaken(code) {
  const [s, t] = await Promise.all([
    Student.exists({ referralCode: code }),
    Teacher.exists({ referralCode: code }),
  ]);
  return !!(s || t);
}

// Sinh 1 mã giới thiệu 5 ký tự (số + chữ hoa) duy nhất trên toàn hệ thống —
// dùng chung 1 "codespace" cho cả Student lẫn Teacher để khi có người nhập mã
// vào, chỉ cần tra cứu 1 lần mà không cần biết trước đó là mã của ai.
async function generateUniqueReferralCode() {
  let code = randomCode();
  let tries = 0;
  while (await codeTaken(code)) {
    code = randomCode();
    if (++tries > 30) throw new Error('Không thể sinh mã giới thiệu duy nhất, vui lòng thử lại');
  }
  return code;
}

// Tra cứu 1 mã giới thiệu thuộc về học sinh hay giảng viên nào — trả về
// { model: 'Student'|'Teacher', id } hoặc null nếu mã không tồn tại.
async function resolveReferrer(rawCode) {
  if (!rawCode) return null;
  const code = String(rawCode).trim().toUpperCase();
  if (!code) return null;
  const student = await Student.findOne({ referralCode: code }).select('_id');
  if (student) return { model: 'Student', id: student._id };
  const teacher = await Teacher.findOne({ referralCode: code }).select('_id');
  if (teacher) return { model: 'Teacher', id: teacher._id };
  return null;
}

// Toàn bộ học sinh đã dùng mã của 1 người giới thiệu (referrerModel+referrerId),
// kể cả người CHƯA đóng đủ học phí (chưa có ReferralCommission) — dùng chung
// cho trang "Mã giới thiệu & Hoa hồng" của cả học sinh lẫn giảng viên, và cho
// trang quản lý affiliate của admin. commissionStatus: 'paid' | 'pending'
// (đã đủ điều kiện, đang chờ hệ thống/admin trả) | 'not_eligible' (chưa đóng
// đủ học phí hoặc chưa ở trạng thái đang học nên chưa phát sinh hoa hồng).
async function buildMyReferrals(referrerModel, referrerId) {
  // require muộn: referral.js được nạp bởi service ghi dữ liệu, tránh vòng phụ thuộc.
  const ReferralCommission = require('../models/ReferralCommission');
  const { packagesWithState } = require('./enrollment');
  const { summarizePackages } = require('./packageMath');
  const referred = await Student.find({ referrerModel, referrerId })
    .select('name status createdAt')
    .sort({ createdAt: -1 })
    .lean();
  const [commissions, packagesByStudent] = await Promise.all([
    ReferralCommission.find({ referrerModel, referrerId }).lean(),
    packagesWithState(referred.map(s => s._id)),
  ]);
  const commissionByStudent = new Map(commissions.map(c => [String(c.referredStudentId), c]));
  return referred.map(s => {
    const c = commissionByStudent.get(String(s._id));
    const packages = packagesByStudent.get(String(s._id)) || [];
    // Chưa phát sinh thì ước tính 10% GIÁ NIÊM YẾT gói đầu tiên — gói thường là gói kích
    // hoạt hoa hồng (mỗi học sinh chỉ một lần).
    const estimateBase = packages[0] ? packages[0].listTotal : 0;
    return {
      studentId: s._id,
      name: s.name,
      status: s.status,
      tuitionStatus: summarizePackages(packages).tuitionStatus,
      commissionStatus: c ? c.status : 'not_eligible',
      amount: c ? c.amount : Math.round(estimateBase * COMMISSION_RATE),
      paidAt: c ? c.paidAt : null,
      createdAt: s.createdAt,
    };
  });
}

module.exports = { generateUniqueReferralCode, resolveReferrer, buildMyReferrals, COMMISSION_RATE };
