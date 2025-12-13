module.exports = {
  apps: [{
    name: 'buypvaaccount',
    script: 'backend/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err-0.log',
    out_file: './logs/out-0.log',
    log_file: './logs/combined-0.log',
    time: true
  }]
};