const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  month:    { type: String, required: true },           // YYYY-MM
  category: {
    type: String,
    enum: ['salary', 'rent', 'marketing', 'utilities', 'other'],
    default: 'other',
  },
  amount:   { type: Number, required: true, min: 1 },
  note:     { type: String, default: '' },
  paidAt:   { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('Expense', expenseSchema);
