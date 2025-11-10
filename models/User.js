const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    frappeUserId: { type: String, index: true },
    fullname: { type: String, trim: true }, // Standard field for user's full name
    email: { type: String, trim: true, lowercase: true, index: true },
    avatarUrl: { type: String, trim: true },
    role: { type: String, trim: true },
    roles: [{ type: String, trim: true }],
    name: { type: String, trim: true },
    department: { type: String, trim: true },
    designation: { type: String, trim: true },
    mobileNo: { type: String, trim: true },
    phone: { type: String, trim: true },
    jobTitle: { type: String, trim: true }, // Added for consistency
  },
  { timestamps: true }
);

userSchema.index({ email: 1 });
userSchema.index({ frappeUserId: 1 });

userSchema.statics.updateFromFrappe = async function updateFromFrappe(frappeUser) {
  if (!frappeUser || typeof frappeUser !== 'object') {
    throw new Error('Invalid Frappe user payload');
  }

  const frappeUserId = frappeUser.name || frappeUser.user || frappeUser.email;
  const fullName =
    frappeUser.full_name ||
    frappeUser.fullname ||
    frappeUser.fullName ||
    [frappeUser.first_name, frappeUser.middle_name, frappeUser.last_name].filter(Boolean).join(' ') ||
    frappeUser.name;

  const email = frappeUser.email || frappeUser.user_id || frappeUser.username || undefined;
  const avatarUrl = frappeUser.user_image || frappeUser.avatar || frappeUser.avatar_url || undefined;

  const roles = Array.isArray(frappeUser.roles)
    ? frappeUser.roles.map((r) => (typeof r === 'string' ? r : r?.role)).filter(Boolean)
    : Array.isArray(frappeUser.roles_list)
    ? frappeUser.roles_list
    : undefined;

  const update = {
    frappeUserId,
    fullname: fullName, // Only use lowercase 'fullname'
    email,
    avatarUrl,
    role: frappeUser.role || undefined,
    roles,
    name: frappeUser.name,
    department: frappeUser.department || undefined,
    designation: frappeUser.designation || undefined,
    mobileNo: frappeUser.mobile_no || undefined,
    phone: frappeUser.phone || undefined,
    jobTitle: frappeUser.job_title || frappeUser.jobTitle || frappeUser.designation || undefined,
    updatedAt: new Date(),
  };

  const query = email ? { email } : { frappeUserId };
  const options = { upsert: true, new: true, setDefaultsOnInsert: true };
  const doc = await this.findOneAndUpdate(query, update, options);
  return doc;
};

module.exports = mongoose.model('User', userSchema);


