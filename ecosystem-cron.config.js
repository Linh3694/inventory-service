module.exports = {
  apps: [{
    name: 'inventory-service-cron-sync-users',
    script: 'scripts/sync-users-cron.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    cron_restart: '0 1 * * *', // Chạy hàng ngày lúc 1:00 AM (01:00)
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/cron-sync-users-error.log',
    out_file: './logs/cron-sync-users-out.log',
    log_file: './logs/cron-sync-users.log',
    time: true
  }]
};

