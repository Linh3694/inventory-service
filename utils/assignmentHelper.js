/**
 * Helper function để ensure fullname luôn có giá trị trong assignmentHistory
 * Priority: user.fullname (populated) > fullnameSnapshot > userName (deprecated)
 * Adds 'fullname' field to history for easy frontend consumption
 */
const ensureFullnameInHistory = (documents) => {
  if (!Array.isArray(documents)) {
    documents = [documents];
  }

  documents.forEach(doc => {
    if (doc && doc.assignmentHistory && Array.isArray(doc.assignmentHistory)) {
      doc.assignmentHistory.forEach(history => {
        // Priority order for fullname:
        // 1. Populated user.fullname (if user is populated)
        // 2. fullnameSnapshot (new field)
        // 3. userName (deprecated but kept for backward compatibility)
        if (!history.fullname) {
          history.fullname = history.user?.fullname || history.fullnameSnapshot || history.userName || 'Không xác định';
        }
      });
    }
  });

  return Array.isArray(arguments[0]) ? documents : documents[0];
};

module.exports = {
  ensureFullnameInHistory,
};

