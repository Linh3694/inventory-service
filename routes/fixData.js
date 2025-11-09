/**
 * Data fix endpoint - fix assignment history issues
 * POST /api/inventory/fix-data
 */

const express = require('express');
const router = express.Router();

const Laptop = require('../models/Laptop');
const Monitor = require('../models/Monitor');
const Printer = require('../models/Printer');
const Projector = require('../models/Projector');
const Phone = require('../models/Phone');
const Tool = require('../models/Tool');

const MODELS = {
  laptop: Laptop,
  monitor: Monitor,
  printer: Printer,
  projector: Projector,
  phone: Phone,
  tool: Tool
};

/**
 * Fix assignment history - comprehensive fix
 */
router.post('/fix-assignment-history', async (req, res) => {
  try {
    console.log('🔧 Starting comprehensive assignment history fix...\n');

    let totalDevices = 0;
    let fixedDevices = 0;
    const issues = [];

    for (const [deviceType, Model] of Object.entries(MODELS)) {
      console.log(`Processing ${deviceType}s...`);
      
      const devices = await Model.find({});
      totalDevices += devices.length;

      for (const device of devices) {
        if (!device.assignmentHistory || device.assignmentHistory.length === 0) {
          continue;
        }

        let needsFix = false;
        const fixes = [];

        // **FIX 1: Remove null user entries**
        const beforeCount = device.assignmentHistory.length;
        device.assignmentHistory = device.assignmentHistory.filter(
          entry => entry.user !== null && entry.user !== undefined
        );
        if (device.assignmentHistory.length < beforeCount) {
          needsFix = true;
          fixes.push(`Removed ${beforeCount - device.assignmentHistory.length} null user entries`);
        }

        // **FIX 2: Ensure all closed entries have endDate**
        for (let i = 0; i < device.assignmentHistory.length - 1; i++) {
          const entry = device.assignmentHistory[i];
          if (!entry.endDate) {
            const nextEntry = device.assignmentHistory[i + 1];
            entry.endDate = nextEntry?.startDate || new Date();
            needsFix = true;
            fixes.push(`Entry ${i}: Added endDate`);
          }
        }

        // **FIX 3: Reconcile last entry with assigned array**
        if (device.assignmentHistory.length > 0) {
          const lastEntry = device.assignmentHistory[device.assignmentHistory.length - 1];
          const lastIdx = device.assignmentHistory.length - 1;

          if (device.assigned && device.assigned.length > 0) {
            // Device has assigned user(s)
            const currentUserId = device.assigned[0];
            
            // Case A: Last entry is open (no endDate) but user doesn't match assigned
            if (!lastEntry.endDate && lastEntry.user?.toString() !== currentUserId.toString()) {
              lastEntry.user = currentUserId;
              needsFix = true;
              fixes.push(`Entry ${lastIdx}: Fixed user to match assigned`);
            }
            
            // Case B: Last entry is closed but device still has assigned user
            if (lastEntry.endDate && lastEntry.user?.toString() !== currentUserId.toString()) {
              // Create implicit open entry by removing endDate
              lastEntry.endDate = null;
              lastEntry.user = currentUserId;
              needsFix = true;
              fixes.push(`Entry ${lastIdx}: Reopened for current assigned user`);
            }
          } else {
            // Device has NO assigned user - last entry must be closed
            if (!lastEntry.endDate) {
              lastEntry.endDate = new Date();
              needsFix = true;
              fixes.push(`Entry ${lastIdx}: Closed (device has no assigned user)`);
            }
          }
        }

        // **Update device status based on assignment state**
        if (device.assigned && device.assigned.length > 0) {
          // Has assigned user
          if (!device.status || device.status === 'Standby') {
            if (device.assignmentHistory[device.assignmentHistory.length - 1]?.document) {
              device.status = 'Active';
              fixes.push('Status: Updated to Active (has document)');
            } else {
              device.status = 'PendingDocumentation';
              fixes.push('Status: Updated to PendingDocumentation (awaiting document)');
            }
            needsFix = true;
          }
        } else {
          // No assigned user
          if (device.status !== 'Standby' && device.status !== 'Broken') {
            device.status = 'Standby';
            fixes.push('Status: Updated to Standby (no assigned user)');
            needsFix = true;
          }
        }

        if (needsFix) {
          await device.save();
          fixedDevices++;
          
          if (fixes.length > 0) {
            issues.push({
              deviceType,
              deviceId: device._id,
              deviceName: device.name,
              fixes: fixes,
              status: device.status,
              assignedUserCount: device.assigned?.length || 0
            });
          }
        }
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ FIX COMPLETE');
    console.log('='.repeat(70));

    return res.status(200).json({
      message: 'Assignment history fix completed',
      summary: {
        totalDevices,
        fixedDevices,
        issuesFixed: issues.length
      },
      issues: issues.slice(0, 50), // Return first 50 for display
      totalIssuesFixed: issues.length,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('❌ Error fixing assignment history:', error);
    return res.status(500).json({
      message: 'Error fixing assignment history',
      error: error.message
    });
  }
});

/**
 * Verify data integrity
 */
router.get('/verify-data', async (req, res) => {
  try {
    const issues = [];
    let totalChecked = 0;

    for (const [deviceType, Model] of Object.entries(MODELS)) {
      const devices = await Model.find({}).lean();

      for (const device of devices) {
        totalChecked++;

        if (!device.assignmentHistory || device.assignmentHistory.length === 0) {
          continue;
        }

        // Check each entry
        device.assignmentHistory.forEach((entry, idx) => {
          const entryIssues = [];

          // Issue: null user
          if (!entry.user) {
            entryIssues.push('null user');
          }

          // Issue: document but no user
          if (entry.document && !entry.user) {
            entryIssues.push('document without user');
          }

          // Issue: endDate but no user
          if (entry.endDate && !entry.user) {
            entryIssues.push('endDate but no user');
          }

          if (entryIssues.length > 0) {
            issues.push({
              deviceType,
              deviceId: device._id,
              deviceName: device.name,
              entryIndex: idx,
              issues: entryIssues
            });
          }
        });
      }
    }

    return res.status(200).json({
      message: 'Data verification complete',
      summary: {
        totalDevicesChecked: totalChecked,
        issuesFound: issues.length
      },
      status: issues.length === 0 ? 'healthy' : 'has_issues',
      issues: issues.slice(0, 50),
      totalIssues: issues.length,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('Error verifying data:', error);
    return res.status(500).json({
      message: 'Error verifying data',
      error: error.message
    });
  }
});

module.exports = router;

