const test = require('node:test');
const assert = require('node:assert/strict');

// Kiểm tra phần RÁP NỐI của GET /admin/revenue/series (gộp 3 nguồn bucket, tính tổng, chặn
// tham số sai) — phần thuật toán gom nhóm đã có test riêng ở revenueModel.test.js.
// Không mở kết nối Mongo: thay `find()` của từng model bằng stub chainable trước khi nạp
// controller, vì controller `require` model ở thời điểm nạp module.
const EnrollmentPackage = require('../src/models/EnrollmentPackage');
const Enrollment = require('../src/models/Enrollment');
const Payment = require('../src/models/Payment');
const Expense = require('../src/models/Expense');
const Student = require('../src/models/Student');

// Trả về object bắt được mọi phép nối chuỗi (.select/.sort/...) và kết thúc ở .lean().
const query = rows => {
  const chain = new Proxy({}, {
    get: (_, prop) => (prop === 'lean' ? () => Promise.resolve(rows) : () => chain),
  });
  return chain;
};

const DATA = {
  packages: [
    // Chốt 01/09 (cọc), đóng nốt 20/09 → doanh thu trọn gói thuộc ngày 01/09.
    { _id: 'p1', studentId: 's1', netTotal: 5500000, paidAdjustment: 0, createdAt: '2026-09-01T03:00:00Z' },
    // Chốt 14/09 — cùng tuần ISO với 18/09.
    { _id: 'p2', studentId: 's1', netTotal: 2000000, paidAdjustment: 0, createdAt: '2026-09-14T03:00:00Z' },
  ],
  enrollments: [
    { packageId: 'p1', className: 'A', courseCategory: 'topik', netPrice: 5500000, startDate: '2026-09-01' },
    { packageId: 'p2', className: 'B', courseCategory: 'beginner', netPrice: 2000000, startDate: '2026-09-14' },
  ],
  payments: [
    { packageId: 'p1', amount: 500000, paidAt: '2026-09-01T03:00:00Z' },
    { packageId: 'p1', amount: 5000000, paidAt: '2026-09-20T03:00:00Z' },
    { packageId: 'p2', amount: 2000000, paidAt: '2026-09-14T03:00:00Z' },
  ],
  expenses: [{ category: 'rent', amount: 6800000, paidAt: '2026-09-18T03:00:00Z' }],
  students: [{ _id: 's1', createdAt: '2026-08-20T03:00:00Z' }],
};

EnrollmentPackage.find = () => query(DATA.packages.map(p => ({ ...p })));
Enrollment.find = () => query(DATA.enrollments);
Payment.find = () => query(DATA.payments);
Expense.find = () => query(DATA.expenses);
Student.find = () => query(DATA.students);

const ctrl = require('../src/controllers/revenueController');

// Gọi controller và trả về `data` của success(), hoặc lỗi được đẩy qua next().
async function call(query_) {
  let payload = null, err = null;
  const res = { status: () => res, json: body => { payload = body; return res; } };
  await ctrl.getSeries({ query: query_ }, res, e => { err = e; });
  return { data: payload && payload.data, err };
}

test('series grain=day: doanh thu vào ngày chốt, tiền mặt vào ngày đóng thật', async () => {
  const { data } = await call({ grain: 'day', from: '2026-09-01', to: '2026-09-30' });
  const byKey = Object.fromEntries(data.buckets.map(b => [b.key, b]));

  assert.equal(byKey['2026-09-01'].revenue, 5500000);   // trọn gói vào ngày chốt
  assert.equal(byKey['2026-09-01'].cashIn, 500000);     // nhưng két chỉ nhận 500k hôm đó
  assert.equal(byKey['2026-09-20'].revenue, 0);         // ngày đóng nốt không sinh doanh thu
  assert.equal(byKey['2026-09-20'].cashIn, 5000000);
  assert.equal(byKey['2026-09-18'].expenses.rent, 6800000);
  assert.deepEqual(byKey['2026-09-01'].start, '2026-09-01');
  assert.deepEqual(byKey['2026-09-01'].end, '2026-09-01');
});

test('series: tổng luôn bằng tổng các bucket', async () => {
  const { data } = await call({ grain: 'day' });
  const sum = (f) => data.buckets.reduce((s, b) => s + (f(b) || 0), 0);
  assert.equal(data.totals.revenue, sum(b => b.revenue));
  assert.equal(data.totals.cashIn, sum(b => b.cashIn));
  assert.equal(data.totals.expenses, sum(b => b.expenses.total));
  assert.equal(data.totals.revenue, 7500000);
});

test('học phí đóng bằng paidAdjustment vẫn vào tiền mặt, gán vào kỳ chốt và đánh dấu riêng', async () => {
  // Tiền cũ nhập tay không có ngày đóng thật để gom. Nếu bỏ qua thì "tiền mặt thực thu"
  // bằng 0 suốt giai đoạn dữ liệu cũ dù sổ ghi đã thu đủ — vô dụng. Nên gán vào kỳ chốt và
  // tách ra ở `cashNoRecord` để biểu đồ đánh dấu được phần suy ra.
  const saved = { packages: DATA.packages, enrollments: DATA.enrollments, payments: DATA.payments };
  DATA.packages = [{ _id: 'legacy', studentId: 's1', netTotal: 3000000, paidAdjustment: 3000000, createdAt: '2026-09-01T03:00:00Z' }];
  DATA.enrollments = [{ packageId: 'legacy', className: 'C', courseCategory: 'topik', netPrice: 3000000, startDate: '2026-09-10' }];
  DATA.payments = [];
  try {
    const { data } = await call({ grain: 'day' });
    const byKey = Object.fromEntries(data.buckets.map(x => [x.key, x]));
    // Ngày chốt = ngày ĐỒNG TIỀN ĐẦU TIÊN về = ngày tạo gói (01/09), chứ không phải ngày khai
    // giảng 10/09. Doanh thu và tiền mặt vì thế rơi vào CÙNG một ngày — trước đây bị tách đôi.
    assert.equal(byKey['2026-09-01'].revenue, 3000000);
    assert.equal(byKey['2026-09-01'].collected, 3000000);
    assert.equal(byKey['2026-09-01'].hasEstimated, true);
    assert.equal(byKey['2026-09-01'].cashIn, 3000000);
    assert.equal(byKey['2026-09-01'].cashNoRecord, 3000000);
    assert.equal(byKey['2026-09-10'], undefined);
    assert.equal(data.totals.cashIn, 3000000);
  } finally {
    Object.assign(DATA, saved);
  }
});

test('gói đóng một phần qua Payment, một phần nhập tay: chỉ phần nhập tay là cashNoRecord', async () => {
  const saved = { packages: DATA.packages, enrollments: DATA.enrollments, payments: DATA.payments };
  // Gói 5tr: 2tr có bản ghi ngày 03/09, 3tr còn lại nhập tay.
  DATA.packages = [{ _id: 'mix', studentId: 's1', netTotal: 5000000, paidAdjustment: 3000000, createdAt: '2026-09-01T03:00:00Z' }];
  DATA.enrollments = [{ packageId: 'mix', className: 'E', courseCategory: 'topik', netPrice: 5000000, startDate: '2026-09-01' }];
  DATA.payments = [{ packageId: 'mix', amount: 2000000, paidAt: '2026-09-03T03:00:00Z' }];
  try {
    const { data } = await call({ grain: 'day' });
    const byKey = Object.fromEntries(data.buckets.map(b => [b.key, b]));
    // Đồng tiền đầu tiên là phần nhập tay ở ngày tạo gói 01/09 — SỚM HƠN khoản có chứng từ
    // ngày 03/09 — nên gói chốt 01/09 và mang cờ ước lượng.
    assert.equal(byKey['2026-09-01'].hasEstimated, true);
    assert.equal(byKey['2026-09-01'].revenue, 5000000);
    assert.equal(byKey['2026-09-01'].collected, 5000000);
    // Tiền mặt vẫn tách làm hai, mỗi phần về đúng mốc ngày của nó:
    assert.equal(byKey['2026-09-01'].cashIn, 3000000);       // phần nhập tay → ngày tạo gói
    assert.equal(byKey['2026-09-01'].cashNoRecord, 3000000);
    assert.equal(byKey['2026-09-03'].cashIn, 2000000);       // khoản có chứng từ → ngày đóng thật
    assert.equal(byKey['2026-09-03'].cashNoRecord, 0);
    assert.equal(byKey['2026-09-03'].revenue, 0);            // ngày đóng sau không sinh doanh thu
    assert.equal(data.totals.cashIn, data.totals.collected); // tổng vẫn khớp
  } finally {
    Object.assign(DATA, saved);
  }
});

test('cashIn không bị kẹp trần netTotal như collected — đóng dư vẫn đếm nguyên số thật', async () => {
  const saved = { packages: DATA.packages, enrollments: DATA.enrollments, payments: DATA.payments };
  DATA.packages = [{ _id: 'over', studentId: 's1', netTotal: 1000000, paidAdjustment: 0, createdAt: '2026-09-10T03:00:00Z' }];
  DATA.enrollments = [{ packageId: 'over', className: 'D', courseCategory: 'topik', netPrice: 1000000, startDate: '2026-09-10' }];
  DATA.payments = [{ packageId: 'over', amount: 1500000, paidAt: '2026-09-10T03:00:00Z' }];
  try {
    const { data } = await call({ grain: 'day' });
    const b = data.buckets.find(x => x.key === '2026-09-10');
    assert.equal(b.collected, 1000000);   // paymentState kẹp min(paid, netTotal)
    assert.equal(b.cashIn, 1500000);      // két thì nhận đủ 1,5tr
    assert.equal(b.cashNoRecord, 0);      // đóng dư không phải "thiếu chứng từ" nên không cộng thêm
  } finally {
    Object.assign(DATA, saved);
  }
});

test('series grain=week: 14/09 và 18/09 rơi cùng một tuần ISO', async () => {
  const { data } = await call({ grain: 'week' });
  const w38 = data.buckets.find(b => b.key === '2026-W38');
  assert.deepEqual({ start: w38.start, end: w38.end }, { start: '2026-09-14', end: '2026-09-20' });
  assert.equal(w38.revenue, 2000000);            // gói chốt 14/09
  assert.equal(w38.cashIn, 7000000);             // 2tr (14/09) + 5tr (20/09)
  assert.equal(w38.expenses.total, 6800000);     // thuê mặt bằng 18/09
});

test('series grain=month cho cùng tổng với grain=day — chỉ khác cách chia bucket', async () => {
  const [day, month] = await Promise.all([call({ grain: 'day' }), call({ grain: 'month' })]);
  assert.deepEqual(day.data.totals, month.data.totals);
  assert.deepEqual(month.data.buckets.map(b => b.key), ['2026-09']);
});

test('series: grain lạ và ngày sai định dạng bị chặn ở 400, không chạm dữ liệu', async () => {
  const bad = await call({ grain: 'quarter' });
  assert.equal(bad.data, null);
  assert.equal(bad.err.statusCode, 400);

  const badDate = await call({ grain: 'day', from: '18/09/2026' });
  assert.equal(badDate.err.statusCode, 400);
});

test('series: bộ lọc from/to cắt đúng theo ngày', async () => {
  const { data } = await call({ grain: 'day', from: '2026-09-15', to: '2026-09-30' });
  assert.equal(data.totals.revenue, 0);          // hai gói đều chốt trước 15/09
  assert.equal(data.totals.cashIn, 5000000);     // chỉ còn khoản đóng nốt 20/09
  assert.equal(data.totals.expenses, 6800000);
});

// ── Thứ tự ưu tiên mốc ngày cho tiền không có bản ghi thanh toán ──────────────────────────
const withPkg = async (pkg, extra = {}) => {
  const saved = { packages: DATA.packages, enrollments: DATA.enrollments, payments: DATA.payments, students: DATA.students };
  DATA.packages = [pkg];
  DATA.enrollments = [{ packageId: pkg._id, className: 'Z', courseCategory: 'topik', netPrice: pkg.netTotal, startDate: '2026-09-25' }];
  DATA.payments = extra.payments || [];
  if (extra.students) DATA.students = extra.students;
  try {
    const { data } = await call({ grain: 'day' });
    return Object.fromEntries(data.buckets.map(b => [b.key, b]));
  } finally {
    Object.assign(DATA, saved);
  }
};

test('mốc #2: có lịch sử ghi nhận thì tiền về đúng ngày admin ghi, không phải ngày tạo gói', async () => {
  const byKey = await withPkg({
    _id: 'h', studentId: 's1', netTotal: 4000000, paidAdjustment: 4000000,
    createdAt: '2026-09-01T03:00:00Z',
    // Hai lần ghi nhận khác ngày → tiền phải tách làm hai, không dồn một cục.
    adjustmentHistory: [
      { from: 0, to: 1000000, changedAt: '2026-09-05T03:00:00Z' },
      { from: 1000000, to: 4000000, changedAt: '2026-09-12T03:00:00Z' },
    ],
  });
  assert.equal(byKey['2026-09-05'].cashIn, 1000000);
  assert.equal(byKey['2026-09-12'].cashIn, 3000000);
  assert.equal(byKey['2026-09-01'], undefined);   // không rơi về ngày tạo gói nữa
});

test('mốc #3: không có lịch sử ghi nhận thì dùng ngày tạo gói', async () => {
  const byKey = await withPkg({
    _id: 'c', studentId: 's1', netTotal: 2000000, paidAdjustment: 2000000,
    createdAt: '2026-09-08T03:00:00Z',
  });
  assert.equal(byKey['2026-09-08'].cashIn, 2000000);
  assert.equal(byKey['2026-09-08'].cashNoRecord, 2000000);
});

test('mốc #4: gói MIGRATE bỏ qua createdAt (= ngày chạy script) và lùi về ngày thêm học sinh', async () => {
  // Đây là cái bẫy: mọi gói migrate có cùng createdAt, dùng thẳng sẽ dồn toàn bộ tiền lịch
  // sử của trung tâm vào đúng một ngày và vẽ ra một cột khổng lồ vô nghĩa.
  const byKey = await withPkg({
    _id: 'm', studentId: 's1', netTotal: 2000000, paidAdjustment: 2000000,
    createdAt: '2026-09-16T03:00:00Z', migratedAt: '2026-09-16T03:00:00Z',
  }, { students: [{ _id: 's1', createdAt: '2026-03-04T03:00:00Z' }] });
  assert.equal(byKey['2026-09-16'], undefined);
  assert.equal(byKey['2026-03-04'].cashIn, 2000000);
});

test('nấc cuối là ngày chốt — hết mốc vẫn không được làm mất tiền', async () => {
  // Gói migrate (bỏ createdAt) mà học sinh cũng không tra được: lùi tới ngày chốt, tức ngày
  // khai giảng 25/09. Kém chính xác nhưng tiền phải còn nguyên — hụt tổng mới là lỗi nặng.
  const byKey = await withPkg({
    _id: 'n', studentId: 'không-tra-được', netTotal: 2000000, paidAdjustment: 2000000,
    migratedAt: '2026-09-16T03:00:00Z',
  });
  assert.equal(byKey['2026-09-25'].cashIn, 2000000);
  assert.equal(byKey['2026-09-25'].cashNoRecord, 2000000);
  assert.equal(Object.values(byKey).reduce((s, b) => s + b.cashIn, 0), 2000000);
});

// ── /daily: hai bảng chi tiết theo ngày ───────────────────────────────────────────────────
const Student2 = require('../src/models/Student');
Student2.find = () => query(DATA.students);

async function callDaily(q) {
  let payload = null, err = null;
  const res = { status: () => res, json: body => { payload = body; return res; } };
  await ctrl.getDaily({ query: q }, res, e => { err = e; });
  return { data: payload && payload.data, err };
}

test('/daily: bảng doanh thu gom theo NGÀY CHỐT, bảng tiền mặt theo NGÀY TIỀN VỀ', async () => {
  const { data } = await callDaily({ from: '2026-09-01', to: '2026-09-30' });

  // p1 chốt 01/09 (5,5tr), p2 chốt 14/09 (2tr) — mỗi ngày một dòng.
  assert.deepEqual(data.revenue.map(r => [r.date, r.amount]), [['2026-09-14', 2000000], ['2026-09-01', 5500000]]);
  assert.equal(data.revenue.find(r => r.date === '2026-09-01').items[0].className, 'A');

  // Tiền thì tách theo ngày đóng thật: 500k (01/09), 2tr (14/09), 5tr (20/09).
  assert.deepEqual(data.cash.map(r => [r.date, r.amount]),
    [['2026-09-20', 5000000], ['2026-09-14', 2000000], ['2026-09-01', 500000]]);
  assert.equal(data.cash[0].items[0].kind, 'payment');
  assert.equal(data.cash[0].items[0].dateEstimated, false);
});

test('/daily: tổng hai bảng khớp đúng tổng của /series cùng khoảng — bảng và cột không lệch', async () => {
  const range = { from: '2026-09-01', to: '2026-09-30' };
  const [daily, series] = await Promise.all([callDaily(range), call({ grain: 'day', ...range })]);
  assert.equal(daily.data.totals.revenue, series.data.totals.revenue);
  assert.equal(daily.data.totals.cash, series.data.totals.cash != null ? series.data.totals.cash : series.data.totals.cashIn);

  // Và khớp tới từng ngày, không chỉ tổng.
  const cashByDay = Object.fromEntries(series.data.buckets.map(b => [b.key, b.cashIn]));
  for (const row of daily.data.cash) assert.equal(row.amount, cashByDay[row.date]);
});

test('/daily: dòng suy ra được đánh dấu để bảng khớp hoa văn kẻ chéo của biểu đồ', async () => {
  const saved = { packages: DATA.packages, enrollments: DATA.enrollments, payments: DATA.payments };
  DATA.packages = [{ _id: 'lg', studentId: 's1', netTotal: 3000000, paidAdjustment: 3000000, createdAt: '2026-09-04T03:00:00Z' }];
  DATA.enrollments = [{ packageId: 'lg', className: 'C', courseCategory: 'topik', netPrice: 3000000, startDate: '2026-09-10' }];
  DATA.payments = [];
  try {
    const { data } = await callDaily({ from: '2026-09-01', to: '2026-09-30' });
    // Cả doanh thu lẫn tiền đều ở ngày tạo gói 04/09 (đồng tiền đầu tiên), không phải ngày
    // khai giảng 10/09 — hai bảng nói cùng một ngày.
    const rev = data.revenue.find(r => r.date === '2026-09-04');
    assert.equal(rev.items[0].dateEstimated, true);
    assert.equal(rev.estimatedAmount, 3000000);
    assert.equal(data.revenue.find(r => r.date === '2026-09-10'), undefined);
    const cash = data.cash.find(r => r.date === '2026-09-04');
    assert.equal(cash.items[0].dateEstimated, true);
    assert.equal(cash.items[0].kind, 'legacy');
    assert.equal(cash.estimatedAmount, 3000000);
  } finally {
    Object.assign(DATA, saved);
  }
});

test('/daily: thiếu from/to bị chặn ở 400 thay vì quét cả lịch sử', async () => {
  assert.equal((await callDaily({})).err.statusCode, 400);
  assert.equal((await callDaily({ from: '2026-09-01' })).err.statusCode, 400);
  assert.equal((await callDaily({ from: '01/09/2026', to: '2026-09-30' })).err.statusCode, 400);
});

// ── Đóng thêm cho khoá cũ: chỉ tăng thực thu, KHÔNG sinh doanh thu mới ────────────────────
test('đóng thêm cho gói cũ không tính doanh thu, chỉ cộng vào thực thu', async () => {
  // Quy tắc nghiệp vụ do chủ trung tâm chốt. Doanh thu ghi nhận TRỌN GÓI đúng một lần vào
  // ngày chốt; mọi lần đóng sau đó chỉ là dòng tiền. Nếu ai đó lỡ tính doanh thu theo từng
  // lần đóng thì test này vỡ ngay.
  const saved = { packages: DATA.packages, enrollments: DATA.enrollments, payments: DATA.payments };
  DATA.packages = [{ _id: 'tu', studentId: 's1', netTotal: 10980000, paidAdjustment: 0, createdAt: '2026-09-18T03:00:00Z' }];
  DATA.enrollments = [{ packageId: 'tu', className: 'LỘ TRÌNH T08', courseCategory: 'topik', netPrice: 10980000, startDate: '2026-09-20' }];
  DATA.payments = [
    { packageId: 'tu', amount: 5000000, paidAt: '2026-09-18T03:00:00Z' },
    { packageId: 'tu', amount: 3000000, paidAt: '2026-09-25T03:00:00Z' },   // đóng thêm cho chính khoá đó
  ];
  try {
    const { data } = await callDaily({ from: '2026-09-01', to: '2026-09-30' });
    // Doanh thu: đúng MỘT dòng, nguyên giá gói, ở ngày chốt.
    assert.deepEqual(data.revenue.map(r => [r.date, r.amount]), [['2026-09-18', 10980000]]);
    // Ngày đóng thêm không có doanh thu…
    assert.equal(data.revenue.find(r => r.date === '2026-09-25'), undefined);
    // …nhưng có tiền.
    assert.deepEqual(data.cash.map(r => [r.date, r.amount]),
      [['2026-09-25', 3000000], ['2026-09-18', 5000000]]);
    assert.equal(data.totals.revenue, 10980000);
    assert.equal(data.totals.cash, 8000000);
  } finally {
    Object.assign(DATA, saved);
  }
});

test('nhập BÙ khoản đóng SỚM HƠN lần đầu thì dời ngày chốt — doanh thu chuyển ngày, không nhân đôi', async () => {
  // Hệ quả của quy tắc "chốt = lần đóng sớm nhất": ghi bổ sung một khoản có ngày lùi về
  // trước sẽ kéo cả doanh thu của gói sang ngày đó. Tổng vẫn đúng, chỉ đổi chỗ.
  const saved = { packages: DATA.packages, enrollments: DATA.enrollments, payments: DATA.payments };
  DATA.packages = [{ _id: 'bu', studentId: 's1', netTotal: 10980000, paidAdjustment: 0, createdAt: '2026-09-18T03:00:00Z' }];
  DATA.enrollments = [{ packageId: 'bu', className: 'LỘ TRÌNH T08', courseCategory: 'topik', netPrice: 10980000, startDate: '2026-09-20' }];
  DATA.payments = [
    { packageId: 'bu', amount: 5000000, paidAt: '2026-09-18T03:00:00Z' },
    { packageId: 'bu', amount: 1000000, paidAt: '2026-09-10T03:00:00Z' },
  ];
  try {
    const { data } = await callDaily({ from: '2026-09-01', to: '2026-09-30' });
    assert.deepEqual(data.revenue.map(r => [r.date, r.amount]), [['2026-09-10', 10980000]]);
    assert.equal(data.totals.revenue, 10980000);   // không nhân đôi
  } finally {
    Object.assign(DATA, saved);
  }
});

// ── Danh sách khoản thu dùng chung nguồn với biểu đồ và bảng "Tiền đã nhận" ───────────────
const Revenue = require('../src/models/Revenue');
Revenue.find = () => query([]);

async function callList(fn, q) {
  let payload = null, err = null;
  const res = { status: () => res, json: body => { payload = body; return res; } };
  await fn({ query: q }, res, e => { err = e; });
  return { data: payload && payload.data, err };
}

test('khoản nhập tay trong Danh sách khoản thu mang ĐÚNG ngày như bảng Tiền đã nhận', async () => {
  // Bug đã gặp: bảng này gán cứng ngày THÊM HỌC SINH cho dòng nhập tay, nên lọc ngày 18/09
  // vẫn hiện một dòng đề ngày 01/08 — vừa sai ngày, vừa đá nhau với bảng mới.
  const saved = { packages: DATA.packages, enrollments: DATA.enrollments, payments: DATA.payments, students: DATA.students };
  DATA.packages = [{ _id: 'mt', studentId: 'sb', netTotal: 2690000, paidAdjustment: 1500000, createdAt: '2026-09-18T03:00:00Z' }];
  DATA.enrollments = [{ packageId: 'mt', className: 'Giao Tiếp T09', courseCategory: 'conversation', netPrice: 2690000, startDate: '2026-09-20' }];
  DATA.payments = [];
  DATA.students = [{ _id: 'sb', name: 'Bể Thị Nhung', createdAt: '2026-08-01T03:00:00Z' }];
  try {
    const range = { from: '2026-09-18', to: '2026-09-18' };
    const [pay, daily] = await Promise.all([callList(ctrl.getPaymentList, range), callDaily(range)]);
    const line = pay.data.items[0].items[0];
    assert.equal(line.kind, 'manual');
    assert.equal(line.dateEstimated, true);
    assert.equal(line.date, '2026-09-18');                 // ngày tạo gói, KHÔNG phải 01/08
    assert.equal(line.date, daily.data.cash[0].date);       // và khớp bảng "Tiền đã nhận"
    assert.equal(line.amount, daily.data.cash[0].items[0].amount);
  } finally {
    Object.assign(DATA, saved);
  }
});

test('ba bảng cũ khớp nhau: đã đóng và công nợ của DS doanh thu == Bảng công nợ', async () => {
  const range = { from: '2026-09-01', to: '2026-09-30' };
  const [closed, debts] = await Promise.all([
    callList(ctrl.getClosedStudentList, range),
    callList(ctrl.getDebtList, range),
  ]);
  // Bảng công nợ là tập con (chỉ gói còn nợ) nên chỉ so phần còn nợ.
  assert.equal(debts.data.totalRemaining, closed.data.totalRemaining);
  // Và doanh thu của DS doanh thu phải bằng đúng tổng của bảng theo ngày.
  const daily = await callDaily(range);
  assert.equal(closed.data.totalContract, daily.data.totals.revenue);
});

// ── /daily?dates= : lấy ngày N của NHIỀU tháng trong một bảng ─────────────────────────────
test('/daily nhận nhiều ngày rời rạc, chỉ trả đúng những ngày đó', async () => {
  const saved = { packages: DATA.packages, enrollments: DATA.enrollments, payments: DATA.payments };
  // Ba gói chốt ngày 03 của ba tháng khác nhau + một gói ngày 04/09 để chắc là bị loại.
  DATA.packages = [
    { _id: 'm7', studentId: 's1', netTotal: 1000000, paidAdjustment: 0, createdAt: '2026-07-03T03:00:00Z' },
    { _id: 'm8', studentId: 's1', netTotal: 2000000, paidAdjustment: 0, createdAt: '2026-08-03T03:00:00Z' },
    { _id: 'm9', studentId: 's1', netTotal: 3000000, paidAdjustment: 0, createdAt: '2026-09-03T03:00:00Z' },
    { _id: 'nn', studentId: 's1', netTotal: 9000000, paidAdjustment: 0, createdAt: '2026-09-04T03:00:00Z' },
  ];
  DATA.enrollments = DATA.packages.map(p => ({ packageId: p._id, className: 'L', courseCategory: 'topik', netPrice: p.netTotal, startDate: '2026-09-20' }));
  DATA.payments = [
    { packageId: 'm7', amount: 1000000, paidAt: '2026-07-03T03:00:00Z' },
    { packageId: 'm8', amount: 2000000, paidAt: '2026-08-03T03:00:00Z' },
    { packageId: 'm9', amount: 3000000, paidAt: '2026-09-03T03:00:00Z' },
    { packageId: 'nn', amount: 9000000, paidAt: '2026-09-04T03:00:00Z' },
  ];
  try {
    const { data } = await callDaily({ dates: '2026-09-03,2026-08-03,2026-07-03' });
    // Mỗi tháng một dòng, mới nhất trước; ngày 04/09 nằm trong khoảng bao ngoài nhưng bị loại.
    assert.deepEqual(data.revenue.map(r => [r.date, r.amount]),
      [['2026-09-03', 3000000], ['2026-08-03', 2000000], ['2026-07-03', 1000000]]);
    assert.deepEqual(data.cash.map(r => [r.date, r.amount]),
      [['2026-09-03', 3000000], ['2026-08-03', 2000000], ['2026-07-03', 1000000]]);
    assert.equal(data.totals.revenue, 6000000);
    assert.equal(data.revenue.find(r => r.date === '2026-09-04'), undefined);
  } finally {
    Object.assign(DATA, saved);
  }
});

test('/daily?dates= chặn ngày sai định dạng và danh sách quá dài', async () => {
  assert.equal((await callDaily({ dates: '03/09/2026' })).err.statusCode, 400);
  const tooMany = Array.from({ length: 32 }, (_, i) => `2026-09-${String(i % 28 + 1).padStart(2, '0')}`).join(',');
  assert.equal((await callDaily({ dates: tooMany })).err.statusCode, 400);
});

test('Danh sách khoản thu khớp ĐÚNG bảng "Tiền đã nhận theo ngày" — kể cả người chốt kỳ trước', async () => {
  // Bug đã gặp: học sinh chốt 04/09 nộp thêm 1tr ngày 18/09. Bản cũ lọc theo "nhóm gói CHỐT
  // trong kỳ" nên bỏ sót khoản đó, bảng ra 5tr trong khi bảng bên cạnh ra 6tr.
  const saved = { packages: DATA.packages, enrollments: DATA.enrollments, payments: DATA.payments, students: DATA.students };
  DATA.packages = [
    { _id: 'A', studentId: 'sa', netTotal: 10980000, paidAdjustment: 0, createdAt: '2026-09-18T03:00:00Z' },
    { _id: 'N', studentId: 'sn', netTotal: 2690000, paidAdjustment: 0, createdAt: '2026-09-04T03:00:00Z' },
  ];
  DATA.enrollments = [
    { packageId: 'A', className: 'LỘ TRÌNH T08', courseCategory: 'topik', netPrice: 10980000, startDate: '2026-09-20' },
    { packageId: 'N', className: 'Giao Tiếp T09', courseCategory: 'conversation', netPrice: 2690000, startDate: '2026-09-20' },
  ];
  DATA.payments = [
    { _id: 'x1', packageId: 'A', amount: 5000000, paidAt: '2026-09-18T03:00:00Z' },
    { _id: 'x2', packageId: 'N', amount: 500000, paidAt: '2026-09-04T03:00:00Z' },
    { _id: 'x3', packageId: 'N', amount: 1000000, paidAt: '2026-09-18T03:00:00Z' },
  ];
  DATA.students = [{ _id: 'sa', name: 'A', createdAt: '2026-09-01' }, { _id: 'sn', name: 'Nhung', createdAt: '2026-09-01' }];
  try {
    const range = { from: '2026-09-18', to: '2026-09-18' };
    const [pay, daily] = await Promise.all([callList(ctrl.getPaymentList, range), callDaily(range)]);
    assert.equal(pay.data.totalAmount, 6000000);
    assert.equal(pay.data.totalAmount, daily.data.totals.cash);
    // Gói chốt 04/09 vẫn có mặt vì tiền của nó VỀ trong kỳ; cột ngày chốt giữ nguyên 04/09.
    const nhung = pay.data.items.find(g => g.studentName === 'Nhung');
    assert.equal(nhung.amount, 1000000);
    assert.equal(nhung.items[0].closeDate, '2026-09-04');
    assert.equal(nhung.items[0].date, '2026-09-18');
  } finally {
    Object.assign(DATA, saved);
  }
});
