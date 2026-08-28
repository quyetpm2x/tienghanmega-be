// Nhãn tiếng Việt cho các field hay bị trùng (unique index) — dùng để dịch lỗi
// MongoDB E11000 thô (VD: "E11000 duplicate key error ... username_1 dup key...")
// thành thông báo dễ hiểu cho người dùng cuối, áp dụng chung cho MỌI model có
// field unique (Account.username cho cả giáo viên lẫn học sinh, CourseCategory.key...).
const DUPLICATE_FIELD_LABELS = { username: 'Tài khoản', email: 'Email', key: 'Mã' };

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  if (err.code === 11000) {
    statusCode = 400;
    const field = Object.keys(err.keyValue || {})[0];
    const value = field ? err.keyValue[field] : '';
    const label = DUPLICATE_FIELD_LABELS[field] || field || 'Dữ liệu';
    message = `${label} "${value}" đã được sử dụng, vui lòng chọn giá trị khác`;
  }

  // Lỗi từ multer (upload file) — mặc định statusCode 500 + message tiếng Anh
  // ("File too large"...), dịch lại cho rõ và trả đúng 400.
  if (err.name === 'MulterError') {
    statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') message = 'File vượt quá dung lượng cho phép';
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
