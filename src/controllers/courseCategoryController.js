const CourseCategory = require('../models/CourseCategory');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

const DEFAULTS = [
  { key: 'intro',        label: { vi: 'Nhập Môn',       ko: '입문' },     color: '#f59e0b', bg: '#fef3c7', order: 0 },
  { key: 'beginner',     label: { vi: 'Sơ - Trung Cấp', ko: '초중급' },   color: '#c0392b', bg: '#fee2e2', order: 1 },
  { key: 'conversation', label: { vi: 'Giao Tiếp',      ko: '회화' },     color: '#10b981', bg: '#d1fae5', order: 2 },
  { key: 'topik',        label: { vi: 'TOPIK II',       ko: 'TOPIK II' }, color: '#6366f1', bg: '#ede9fe', order: 3 },
  { key: 'bundle',       label: { vi: 'Lộ Trình',       ko: '코스' },     color: '#E67E22', bg: '#fff3e0', order: 4 },
];
const PROTECTED = DEFAULTS.map(d => d.key);

// Public: dùng cho trang chủ / trang khoá học công khai
exports.getPublic = async (req, res) => {
  let cats = await CourseCategory.find().sort({ order: 1, createdAt: 1 });
  if (cats.length === 0) cats = await CourseCategory.insertMany(DEFAULTS);
  success(res, cats);
};

// Admin: tất cả — tự seed 5 danh mục mặc định nếu chưa có
exports.getAll = async (req, res) => {
  let cats = await CourseCategory.find().sort({ order: 1, createdAt: 1 });
  if (cats.length === 0) cats = await CourseCategory.insertMany(DEFAULTS);
  success(res, cats);
};

// `label` có thể tới dạng string thuần (client cũ) hoặc { vi, ko } — chuẩn hoá về { vi, ko }.
function normalizeLabel(label) {
  if (typeof label === 'string') return { vi: label.trim(), ko: '' };
  return { vi: (label?.vi || '').trim(), ko: (label?.ko || '').trim() };
}

exports.create = async (req, res, next) => {
  const { color } = req.body;
  const label = normalizeLabel(req.body.label);
  if (!label.vi) return next(new AppError('Tên danh mục không được để trống', 400));
  const key = label.vi.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    + '_' + Date.now();
  const count = await CourseCategory.countDocuments();
  const bg = color ? color + '22' : '#6366f122';
  const cat = await CourseCategory.create({ key, label, color: color || '#6366f1', bg, order: count });
  success(res, cat, 'Thêm danh mục thành công', 201);
};

exports.update = async (req, res, next) => {
  const { color } = req.body;
  const label = normalizeLabel(req.body.label);
  if (!label.vi) return next(new AppError('Tên danh mục không được để trống', 400));
  const bg = color ? color + '22' : undefined;
  const cat = await CourseCategory.findByIdAndUpdate(
    req.params.id,
    { label, ...(color ? { color, bg } : {}) },
    { new: true, runValidators: true }
  );
  if (!cat) return next(new AppError('Không tìm thấy danh mục', 404));
  success(res, cat, 'Cập nhật thành công');
};

exports.remove = async (req, res, next) => {
  const cat = await CourseCategory.findById(req.params.id);
  if (!cat) return next(new AppError('Không tìm thấy danh mục', 404));
  if (PROTECTED.includes(cat.key)) return next(new AppError('Không thể xoá danh mục mặc định', 400));
  await cat.deleteOne();
  success(res, null, 'Đã xoá danh mục');
};
