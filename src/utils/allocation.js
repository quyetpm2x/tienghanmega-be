// Chia một số tiền nguyên đồng theo tỉ lệ trọng số — phương pháp phần dư lớn nhất
// (Hamilton). Dùng cho: chia chiết khấu gói theo giá niêm yết từng khoá, chia tiền
// đã nộp và công nợ gói về từng khoá để dựng báo cáo.
//
// Vì sao không chia số thực rồi làm tròn từng phần: làm tròn độc lập làm tổng lệch
// vài đồng. Ở đây mỗi phần lấy phần nguyên trước, phần dư (luôn < số phần tử) được
// cộng từng đồng vào các phần có phần thập phân lớn nhất — tổng luôn khít, và với
// total ≤ Σweights thì không phần nào vượt trọng số của nó (không khoá nào âm giá).
function allocate(total, weights) {
  if (!Number.isInteger(total) || total < 0) {
    throw new RangeError('allocate: total phải là số nguyên ≥ 0');
  }
  if (!Array.isArray(weights) || weights.some(w => !Number.isFinite(w) || w < 0)) {
    throw new RangeError('allocate: weights phải là mảng số ≥ 0');
  }
  const n = weights.length;
  if (n === 0) return [];
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (total === 0 || sumW === 0) return weights.map(() => 0);

  const raw = weights.map(w => (total * w) / sumW);
  const shares = raw.map(r => Math.floor(r));
  let rest = total - shares.reduce((a, b) => a + b, 0);

  // Hoà phần thập phân thì ưu tiên phần tử đứng sau (thường là khoá được thêm cuối).
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => (b.frac - a.frac) || (b.i - a.i));
  for (let k = 0; rest > 0; k++, rest--) shares[order[k % n].i] += 1;
  return shares;
}

module.exports = { allocate };
