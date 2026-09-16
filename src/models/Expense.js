const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  // Ngày chi là mốc DUY NHẤT; `month` chỉ là bản sao do backend suy ra để truy vấn nhanh
  // (utils/expenseInput.js) — không nhận giá trị từ client nữa.
  month:    { type: String, required: true },           // YYYY-MM, tự tính từ paidAt
  category: { type: String, default: 'other' },
  amount:   { type: Number, required: true, min: 1 },
  note:     { type: String, default: '' },
  paidAt:   { type: Date, required: true },
}, { timestamps: true });

module.exports = mongoose.model('Expense', expenseSchema);
