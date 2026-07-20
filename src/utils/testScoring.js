// So sánh 2 tập chỉ số đáp án (không quan tâm thứ tự) — dùng để chấm câu hỏi
// nhiều đáp án đúng: đúng toàn bộ khi và chỉ khi chọn đúng hết, không thiếu
// không thừa (không có điểm một phần).
function sameIndexSet(a = [], b = []) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

// Xác định đáp án đúng (theo vị trí đã xáo, tức optionOrder) + điểm của 1 câu
// trả lời — ưu tiên dùng snapshot đã "chụp" lúc học sinh bắt đầu làm bài
// (answer.answerIndices/points, xem models/TestAttempt.js) để việc chấm điểm
// không bị ảnh hưởng nếu admin sửa câu hỏi/đề sau khi học sinh đã bắt đầu.
// Attempt tạo TRƯỚC khi có snapshot (answerIndices rỗng hoặc points không phải
// số) sẽ fallback về tra cứu trực tiếp liveQuestion/livePoints như cách chấm cũ.
function resolveGrading(answer, liveQuestion, livePoints) {
  const hasSnapshot = typeof answer.points === 'number' && Array.isArray(answer.answerIndices) && answer.answerIndices.length > 0;
  if (hasSnapshot) {
    return {
      correctIndices: answer.answerIndices.map(ai => answer.optionOrder.indexOf(ai)),
      points: answer.points,
    };
  }
  return {
    correctIndices: liveQuestion ? liveQuestion.answerIndices.map(ai => answer.optionOrder.indexOf(ai)) : [],
    points: livePoints || 0,
  };
}

module.exports = { sameIndexSet, resolveGrading };
