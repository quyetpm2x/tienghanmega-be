const ExpenseCategory = require('../models/ExpenseCategory');
const { success } = require('../utils/response');
const AppError = require('../utils/AppError');

const DEFAULTS = [
  { key: 'salary',    label: 'Lương giảng viên',      color: '#E67E22', bg: '#fff3e0', order: 0 },
  { key: 'rent',      label: 'Thuê mặt bằng',         color: '#1E3A5F', bg: '#dbeafe', order: 1 },
  { key: 'marketing', label: 'Marketing & Quảng cáo', color: '#6366f1', bg: '#ede9fe', order: 2 },
  { key: 'utilities', label: 'Vận hành & Tiện ích',   color: '#10b981', bg: '#d1fae5', order: 3 },
  { key: 'other',     label: 'Khác',                  color: '#7F8C8D', bg: '#F0F2F5', order: 4 },
];

exports.getAll = async (req, res) => {
  let cats = await ExpenseCategory.find().sort({ order: 1, createdAt: 1 });
  if (cats.length === 0) {
    cats = await ExpenseCategory.insertMany(DEFAULTS);
  }
  // 'other' always last
  const otherIdx = cats.findIndex(c => c.key === 'other');
  if (otherIdx > -1) cats.push(cats.splice(otherIdx, 1)[0]);
  success(res, cats);
};

exports.create = async (req, res) => {
  const { label, color } = req.body;
  if (!label?.trim()) throw new AppError('Tên loại chi phí không được để trống', 400);
  const key = label.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    + '_' + Date.now();
  const count = await ExpenseCategory.countDocuments();
  const bg = color ? color + '22' : '#6366f122';
  const cat = await ExpenseCategory.create({ key, label: label.trim(), color: color || '#6366f1', bg, order: count });
  success(res, cat, 'Thêm loại chi phí thành công', 201);
};

exports.remove = async (req, res, next) => {
  const PROTECTED = ['salary', 'rent', 'marketing', 'utilities', 'other'];
  const cat = await ExpenseCategory.findById(req.params.id);
  if (!cat) return next(new AppError('Không tìm thấy loại chi phí', 404));
  if (PROTECTED.includes(cat.key)) return next(new AppError('Không thể xoá loại mặc định', 400));
  await cat.deleteOne();
  success(res, null, 'Đã xoá loại chi phí');
};
