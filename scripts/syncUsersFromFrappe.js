const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });

const User = require('../models/User');

async function connectDB() {
  const uri =
    process.env.MONGODB_URI ||
    `mongodb://${process.env.MONGODB_HOST || 'localhost'}:${process.env.MONGODB_PORT || '27017'}/${process.env.MONGODB_DATABASE || 'inventory_service'}`;

  const options = {
    autoIndex: true,
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    family: 4,
  };

  try {
    await mongoose.connect(uri, options);
    console.log('✅ MongoDB connected\n');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
}

async function fetchUserFromFrappe(email) {
  try {
    const frappeUrl = process.env.FRAPPE_URL || 'http://localhost:8000';
    const apiToken = process.env.FRAPPE_API_TOKEN;

    if (!apiToken) {
      throw new Error('FRAPPE_API_TOKEN not configured');
    }

    const response = await axios.get(`${frappeUrl}/api/method/frappe.client.get`, {
      params: {
        doctype: 'User',
        name: email,
      },
      headers: {
        Authorization: `token ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.data && response.data.message) {
      return response.data.message;
    }

    return null;
  } catch (error) {
    console.error(`❌ Error fetching user from Frappe (${email}):`, error.message);
    return null;
  }
}

async function syncUsersFromFrappe(userIds = null) {
  let totalSynced = 0;
  let totalErrors = 0;

  if (userIds && userIds.length > 0) {
    // Sync specific users
    console.log(`🔄 Syncing ${userIds.length} specific users from Frappe...\n`);

    for (const userId of userIds) {
      try {
        const user = await User.findById(userId);

        if (!user) {
          console.log(`   ⚠️  User not found in MongoDB: ${userId}`);
          continue;
        }

        const email = user.email || user.frappeUserId;
        console.log(`   📡 Fetching from Frappe: ${email}`);

        const frappeUser = await fetchUserFromFrappe(email);

        if (frappeUser) {
          const fullName =
            frappeUser.full_name ||
            frappeUser.fullname ||
            frappeUser.fullName ||
            [frappeUser.first_name, frappeUser.middle_name, frappeUser.last_name]
              .filter(Boolean)
              .join(' ') ||
            frappeUser.name;

          user.fullname = fullName;
          user.fullName = fullName;
          await user.save();
          console.log(`   ✅ Synced: ${email} -> ${fullName}`);
          totalSynced++;
        } else {
          console.log(`   ❌ User not found in Frappe: ${email}`);
          totalErrors++;
        }
      } catch (error) {
        console.error(`   ❌ Error syncing ${userId}:`, error.message);
        totalErrors++;
      }
    }
  } else {
    // Sync all users without fullname
    console.log('🔄 Syncing all users without fullname from Frappe...\n');

    try {
      const users = await User.find({ $or: [{ fullname: null }, { fullname: '' }] });
      console.log(`Found ${users.length} users without fullname\n`);

      for (const user of users) {
        try {
          const email = user.email || user.frappeUserId;
          console.log(`   📡 Fetching from Frappe: ${email}`);

          const frappeUser = await fetchUserFromFrappe(email);

          if (frappeUser) {
            const fullName =
              frappeUser.full_name ||
              frappeUser.fullname ||
              frappeUser.fullName ||
              [frappeUser.first_name, frappeUser.middle_name, frappeUser.last_name]
                .filter(Boolean)
                .join(' ') ||
              frappeUser.name;

            user.fullname = fullName;
            user.fullName = fullName;
            await user.save();
            console.log(`   ✅ Synced: ${email} -> ${fullName}`);
            totalSynced++;
          } else {
            console.log(`   ❌ User not found in Frappe: ${email}`);
            totalErrors++;
          }
        } catch (error) {
          console.error(`   ❌ Error syncing ${user._id}:`, error.message);
          totalErrors++;
        }

        // Add delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error('❌ Error fetching users without fullname:', error.message);
      totalErrors++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary:');
  console.log(`   ✅ Total synced: ${totalSynced}`);
  console.log(`   ❌ Total errors: ${totalErrors}`);
  console.log('='.repeat(50));

  return { totalSynced, totalErrors };
}

async function main() {
  try {
    await connectDB();

    // Get user IDs from command line arguments
    const userIds = process.argv.slice(2);

    if (userIds.length > 0) {
      console.log('🚀 Starting to sync users from Frappe...\n');
      const result = await syncUsersFromFrappe(userIds);

      if (result.totalErrors === 0) {
        console.log('\n✅ All syncs completed successfully!');
      } else {
        console.log('\n⚠️  Completed with some errors. Please check the logs above.');
      }
    } else {
      console.log('📋 Usage:');
      console.log('  node scripts/syncUsersFromFrappe.js <USER_ID_1> <USER_ID_2> ...');
      console.log('  node scripts/syncUsersFromFrappe.js                          (sync all users without fullname)');
    }

    await mongoose.disconnect();
    console.log('\n🔌 MongoDB disconnected');
    process.exit(userIds.length === 0 ? 0 : 0);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();

