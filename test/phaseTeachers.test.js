const test = require('node:test');
const assert = require('node:assert/strict');
const { effectiveAssignments } = require('../src/utils/classAssignment');
const { rateAt } = require('../src/utils/classRate');
const { validatePhases } = require('../src/utils/classPhase');

const withTeachers = {
  ratePerSession: 200000,
  phases: [{
    courseTitle: 'TOPIK I', days: 'T3,T5', time: '13:00', fromDate: '2026-07-21', toDate: '2026-08-31',
    teachers: [
      { teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-07-21', toDate: '2026-08-10', rate: 190000 },
      { teacherId: 'T2', teacherName: 'CÔ B', fromDate: '2026-08-11', toDate: '2026-08-31', rate: null },
    ],
  }, {
    courseTitle: 'GIAO TIẾP', days: 'T2,T4', time: '19:30', fromDate: '2026-09-01', toDate: null,
    teachers: [{ teacherId: 'T2', teacherName: 'CÔ B', fromDate: '2026-09-01', toDate: null, rate: 250000 }],
  }],
};

test('effectiveAssignments trải phẳng teachers của mọi khoá', () => {
  assert.deepEqual(effectiveAssignments(withTeachers), [
    { teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-07-21', toDate: '2026-08-10' },
    { teacherId: 'T2', teacherName: 'CÔ B', fromDate: '2026-08-11', toDate: '2026-08-31' },
    { teacherId: 'T2', teacherName: 'CÔ B', fromDate: '2026-09-01', toDate: null },
  ]);
});

test('rateAt lấy lương của đúng đoạn giảng viên trong khoá', () => {
  assert.equal(rateAt(withTeachers, '2026-08-01', 'T1'), 190000);
  assert.equal(rateAt(withTeachers, '2026-09-10', 'T2'), 250000);
});

test('rate null thì rơi về ratePerSession mặc định của lớp', () => {
  assert.equal(rateAt(withTeachers, '2026-08-20', 'T2'), 200000);
});

test('hỏi lương cho giảng viên KHÔNG dạy khoảng đó: không lấy nhầm mức của người khác', () => {
  assert.equal(rateAt(withTeachers, '2026-08-01', 'T2'), 200000,
    'T2 không dạy 01/08 — phải rơi về mức mặc định, không lấy 190000 của T1');
});

test('lớp CŨ chưa có phases.teachers: fallback y hệt hành vi hiện tại', () => {
  const old = {
    teacherId: 'T1', teacher: 'CÔ A', startDate: '2026-07-21', ratePerSession: 200000,
    teacherAssignments: [{ teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-07-21', toDate: null }],
    rateHistory: [{ rate: 300000, fromDate: '2026-09-01', toDate: null, teacherIds: [] }],
  };
  assert.equal(effectiveAssignments(old).length, 1);
  assert.equal(rateAt(old, '2026-08-01', 'T1'), 200000);
  assert.equal(rateAt(old, '2026-09-10', 'T1'), 300000);
});

test('lớp có phases nhưng khoá CHƯA khai giảng viên: vẫn fallback về mảng phẳng cũ', () => {
  const mixed = {
    teacherId: 'T1', teacher: 'CÔ A', startDate: '2026-07-21', ratePerSession: 200000,
    phases: [{ courseTitle: 'A', days: 'T3', fromDate: '2026-07-21', toDate: null, teachers: [] }],
    teacherAssignments: [{ teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-07-21', toDate: null }],
  };
  assert.equal(effectiveAssignments(mixed).length, 1);
  assert.equal(effectiveAssignments(mixed)[0].teacherId, 'T1');
});

test('hai đoạn giảng viên chồng ngày trong cùng khoá: chặn', () => {
  const bad = [{ courseTitle: 'A', days: 'T3', fromDate: '2026-07-21', toDate: '2026-08-31', teachers: [
    { teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-07-21', toDate: '2026-08-15' },
    { teacherId: 'T2', teacherName: 'CÔ B', fromDate: '2026-08-10', toDate: '2026-08-31' },
  ] }];
  assert.throws(() => validatePhases(bad), /chồng/i);
});

// Đoạn phụ trách vượt ra ngoài khoảng ngày của khoá nay chỉ là CẢNH BÁO ở giao diện, không
// chặn — admin có thể cố ý. Buổi nằm ngoài mọi khoá của lớp vốn đã không sinh ra nên không
// đẻ tiền lạ; cái phải giữ là "một thời điểm một giảng viên", kiểm ở các test dưới.
test('đoạn giảng viên vượt ra ngoài khoảng ngày của khoá: CHO LƯU (chỉ cảnh báo ở giao diện)', () => {
  const ok = [{ courseTitle: 'A', days: 'T3', fromDate: '2026-07-21', toDate: '2026-08-31', teachers: [
    { teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-07-01', toDate: '2026-08-31' },
  ] }];
  assert.doesNotThrow(() => validatePhases(ok));
});

test('đoạn giảng viên để mở trong khoá ĐÃ đóng: CHO LƯU', () => {
  const ok = [{ courseTitle: 'A', days: 'T3', fromDate: '2026-07-21', toDate: '2026-08-31', teachers: [
    { teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-07-21', toDate: null },
  ] }];
  assert.doesNotThrow(() => validatePhases(ok));
});

test('nhưng vượt khoảng mà ĐÂM vào giảng viên của khoá khác thì vẫn chặn', () => {
  // Đây là cái giá của việc nới lỏng: phải kiểm chồng ngày trên TOÀN BỘ các khoá, nếu không
  // hai người ở hai khoá khác nhau cùng nhận một ngày và không biết tính cho ai.
  const bad = [
    { courseTitle: 'A', days: 'T3', fromDate: '2026-07-21', toDate: '2026-08-31', teachers: [
      { teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-07-21', toDate: '2026-09-30' },
    ] },
    { courseTitle: 'B', days: 'T5', fromDate: '2026-09-01', toDate: '2026-10-31', teachers: [
      { teacherId: 'T2', teacherName: 'CÔ B', fromDate: '2026-09-01', toDate: '2026-10-31' },
    ] },
  ];
  assert.throws(() => validatePhases(bad), /chồng ngày/i);
});

test('vượt khoảng sang vùng KHÔNG có ai thì cho lưu', () => {
  const ok = [
    { courseTitle: 'A', days: 'T3', fromDate: '2026-07-21', toDate: '2026-08-31', teachers: [
      { teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-07-21', toDate: '2026-09-30' },
    ] },
    { courseTitle: 'B', days: 'T5', fromDate: '2026-10-01', toDate: '2026-10-31', teachers: [
      { teacherId: 'T2', teacherName: 'CÔ B', fromDate: '2026-10-01', toDate: '2026-10-31' },
    ] },
  ];
  assert.doesNotThrow(() => validatePhases(ok));
});

test('đoạn giảng viên để mở trong khoá CÒN mở: cho phép', () => {
  const ok = [{ courseTitle: 'A', days: 'T3', fromDate: '2026-07-21', toDate: null, teachers: [
    { teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-07-21', toDate: null },
  ] }];
  assert.doesNotThrow(() => validatePhases(ok));
});

test('khoảng hở không có ai phụ trách: CHO PHÉP', () => {
  const ok = [{ courseTitle: 'A', days: 'T3', fromDate: '2026-07-21', toDate: '2026-08-31', teachers: [
    { teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-07-21', toDate: '2026-08-10' },
    { teacherId: 'T2', teacherName: 'CÔ B', fromDate: '2026-08-20', toDate: '2026-08-31' },
  ] }];
  assert.doesNotThrow(() => validatePhases(ok));
});

test('mã thứ không hợp lệ bị chặn — nếu không lớp sẽ im lặng về 0 buổi', () => {
  const bad = [{ courseTitle: 'A', days: 'T3,T9', fromDate: '2026-07-21', toDate: null, teachers: [] }];
  assert.throws(() => validatePhases(bad), /T9/);
});

test('mọi mã thứ hợp lệ đều được chấp nhận', () => {
  const ok = [{ courseTitle: 'A', days: 'T2,T3,T4,T5,T6,T7,CN', fromDate: '2026-07-21', toDate: null, teachers: [] }];
  assert.doesNotThrow(() => validatePhases(ok));
});

const { classFieldsFromPhases, effectivePhases } = require('../src/utils/classPhase');

test('classFieldsFromPhases lấy khoá ĐANG CHẠY hôm nay', () => {
  const f = classFieldsFromPhases(withTeachers.phases, '2026-09-10');
  assert.equal(f.course, 'GIAO TIẾP');
  assert.equal(f.days, 'T2,T4');
  assert.equal(f.teacher, 'CÔ B');
  assert.equal(f.teacherId, 'T2');
  assert.equal(f.startDate, '2026-07-21', 'ngày khai giảng = khoá sớm nhất');
  assert.equal(f.endDate, '', 'khoá cuối còn mở → lớp chưa có ngày kết thúc');
});

test('classFieldsFromPhases: hôm nay rơi vào quãng nghỉ giữa hai khoá thì lấy khoá gần nhất', () => {
  const phases = [
    { courseTitle: 'A', days: 'T3', fromDate: '2026-07-21', toDate: '2026-08-31', teachers: [] },
    { courseTitle: 'B', days: 'T5', fromDate: '2026-10-01', toDate: '2026-11-30', teachers: [] },
  ];
  assert.equal(classFieldsFromPhases(phases, '2026-09-15').course, 'B', 'lấy khoá bắt đầu muộn nhất');
  assert.equal(classFieldsFromPhases(phases, '2026-11-30').endDate, '2026-11-30');
});

test('classFieldsFromPhases: khoá đang chạy nhưng khoảng đó không ai phụ trách', () => {
  const phases = [{ courseTitle: 'A', days: 'T3', fromDate: '2026-07-21', toDate: null, teachers: [
    { teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-07-21', toDate: '2026-08-10', rate: null },
  ] }];
  const f = classFieldsFromPhases(phases, '2026-09-10');
  assert.equal(f.teacher, '', 'lớp tạm thời không có giảng viên phụ trách');
  assert.equal(f.teacherId, null);
});

test('classFieldsFromPhases với mảng rỗng trả null', () => {
  assert.equal(classFieldsFromPhases([], '2026-09-10'), null);
});

const { openEndedPhase } = require('../src/utils/classPhase');

test('openEndedPhase tìm khoá còn để ngỏ ngày kết thúc', () => {
  assert.equal(openEndedPhase(withTeachers.phases)?.courseTitle, 'GIAO TIẾP', 'khoá cuối còn mở');
  assert.equal(openEndedPhase(withTeachers)?.courseTitle, 'GIAO TIẾP', 'nhận cả đối tượng lớp');
});

test('lớp CHƯA di trú (phases rỗng) mà thiếu ngày kết thúc vẫn bị bắt — đây là nhóm nguy hiểm nhất', () => {
  // Script di trú BỎ QUA lớp thiếu dữ liệu nên chúng ở lại mãi với phases rỗng, trong khi
  // effectivePhases vẫn suy ra một khoá để ngỏ và sinh buổi tới hôm nay, mãi mãi.
  const chuaDiTru = { course: 'A', days: 'T3', startDate: '2026-07-21', endDate: '', phases: [] };
  assert.ok(openEndedPhase(chuaDiTru), 'phải bắt được, không được trả null');
  assert.equal(openEndedPhase({ ...chuaDiTru, endDate: '2026-09-30' }), null, 'có ngày kết thúc thì thôi');
});

test('lớp thiếu ngày bắt đầu hoặc thứ học: KHÔNG chặn oan', () => {
  // scheduledDatesOfClass bỏ qua khoá thiếu hai thứ này nên chúng không phát sinh lương.
  assert.equal(openEndedPhase({ course: 'A', days: 'T3', startDate: '', endDate: '', phases: [] }), null);
  assert.equal(openEndedPhase({ course: 'A', days: '', startDate: '2026-07-21', endDate: '', phases: [] }), null);
});

test('openEndedPhase trả null khi mọi khoá đã có ngày kết thúc', () => {
  const closed = withTeachers.phases.map(p => ({ ...p, toDate: p.toDate || '2026-12-31' }));
  assert.equal(openEndedPhase(closed), null);
});

test('openEndedPhase với lớp chưa có khoá nào: null, không chặn nhầm', () => {
  assert.equal(openEndedPhase([]), null);
  assert.equal(openEndedPhase(undefined), null);
});

test('khoá SUY RA của lớp chưa di trú phải mang theo giảng viên của lớp', () => {
  // Nếu không, khối "Khoá học của lớp" báo "chưa có giảng viên nào" + cảnh báo khoảng trống
  // trong khi thẻ lớp bên ngoài vẫn hiện đúng tên người dạy.
  const chuaDiTru = {
    course: 'TOPIK I', days: 'T3,T5,T6', time: '13:00 - 15:00',
    startDate: '2026-07-21', endDate: '', ratePerSession: 190000,
    teacher: 'CÔ THẢO LINH', teacherId: 'T1',
    teacherAssignments: [{ teacherId: 'T1', teacherName: 'CÔ THẢO LINH', fromDate: '2026-07-21', toDate: null }],
  };
  const p = effectivePhases(chuaDiTru)[0];
  assert.equal(p.teachers.length, 1, 'phải có đúng một đoạn giảng viên');
  assert.equal(p.teachers[0].teacherName, 'CÔ THẢO LINH');
  assert.equal(p.teachers[0].fromDate, '2026-07-21');
  assert.equal(p.teachers[0].rate, null, 'ăn theo lương/buổi mặc định của lớp');
});

test('lớp chưa di trú từng đổi giáo viên: khoá suy ra giữ nguyên cả lịch sử', () => {
  const c = {
    course: 'A', days: 'T3', startDate: '2026-07-21', endDate: '2026-09-30',
    teacher: 'CÔ B', teacherId: 'T2',
    teacherAssignments: [
      { teacherId: 'T1', teacherName: 'CÔ A', fromDate: '2026-07-21', toDate: '2026-08-31' },
      { teacherId: 'T2', teacherName: 'CÔ B', fromDate: '2026-09-01', toDate: null },
    ],
  };
  const p = effectivePhases(c)[0];
  assert.deepEqual(p.teachers.map(a => [a.teacherName, a.fromDate, a.toDate]), [
    ['CÔ A', '2026-07-21', '2026-08-31'],
    ['CÔ B', '2026-09-01', '2026-09-30'],
  ], 'đoạn còn mở được đóng theo ngày kết thúc của lớp');
});

test('lớp chưa di trú KHÔNG có giảng viên: khoá suy ra không có đoạn nào, cảnh báo là đúng', () => {
  const c = { course: 'A', days: 'T3', startDate: '2026-07-21', endDate: '' };
  assert.deepEqual(effectivePhases(c)[0].teachers, []);
});
