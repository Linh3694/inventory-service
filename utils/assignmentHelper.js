/**
 * Helper function để ensure fullname luôn có giá trị
 * Nếu User.fullname = null, dùng userName từ assignmentHistory
 */
const ensureFullnameInHistory = (documents) => {
  if (!Array.isArray(documents)) {
    documents = [documents];
  }

  documents.forEach(doc => {
    if (doc && doc.assignmentHistory && Array.isArray(doc.assignmentHistory)) {
      doc.assignmentHistory.forEach(history => {
        if (!history.fullname && history.userName) {
          history.fullname = history.userName;
        }
      });
    }
  });

  return documents;
};

module.exports = {
  ensureFullnameInHistory,
};

