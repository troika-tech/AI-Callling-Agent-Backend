module.exports = {
  apps: [{
    name: 'calling-agent-api',
    script: './src/index.js',
    instances: 1,  // Single instance for t3.micro (1GB RAM)
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '400M',  // Reduced for t3.micro
    watch: false,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
