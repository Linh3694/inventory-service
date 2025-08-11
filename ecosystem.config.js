module.exports = {
  apps: [
    {
      name: 'inventory-service',
      script: 'app.js',
      instances: 1,
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      watch: false,
      max_memory_restart: '512M',
    },
  ],
};


