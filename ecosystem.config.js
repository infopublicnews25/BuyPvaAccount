module.exports = {
  apps: [{
    name: 'buypvaaccount',
    script: 'backend/server.js',
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    min_uptime: '10s',
    // Allow more automatic recovery attempts (prevents PM2 giving up after repeated crashes)
    max_restarts: 200,
    restart_delay: 2000,
    exp_backoff_restart_delay: 1000,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err-0.log',
    out_file: './logs/out-0.log',
    log_file: './logs/combined-0.log',
    time: true
  }]
};