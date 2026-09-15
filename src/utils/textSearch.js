// So khớp tìm kiếm tiếng Việt: không phân biệt dấu (Thảo = thao), đ = d, hoa thường.
function normalizeText(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function matchesQuery(text, query) {
  const q = normalizeText(query);
  return !q || normalizeText(text).includes(q);
}

module.exports = { normalizeText, matchesQuery };
