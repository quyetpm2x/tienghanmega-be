// Field đa ngôn ngữ dùng chung cho các model có nội dung admin nhập tay theo
// từng ngôn ngữ (Course, Teacher, Material, FAQ...) — vi bắt buộc vì là ngôn
// ngữ vận hành chính, ko không bắt buộc (có thể bổ sung sau).
function i18nField({ required = false } = {}) {
  return {
    vi: { type: String, required, default: required ? undefined : '', trim: true },
    ko: { type: String, default: '', trim: true },
  };
}

module.exports = { i18nField };
