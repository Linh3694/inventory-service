/**
 * Helper function để ensure fullname luôn có giá trị trong assignmentHistory
 * Priority: user.fullname (populated) > fullnameSnapshot > userName (deprecated)
 * Adds 'fullname' field to history for easy frontend consumption
 */
const ensureFullnameInHistory = (documents) => {
  // Handle null/undefined input
  if (!documents) return documents;
  
  const isArray = Array.isArray(documents);
  const docs = isArray ? documents : [documents];

  docs.forEach(doc => {
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

  return isArray ? docs : docs[0];
};

module.exports = {
  ensureFullnameInHistory,
};

