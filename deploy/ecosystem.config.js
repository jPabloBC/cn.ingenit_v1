module.exports = {
  apps: [
    {
      name: 'streamer',
      script: 'server.js',
      cwd: '/var/www/cn.ingenit_v1/remote-playwright',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        PORT: 4000,
        // set STREAMER_SIGNING_KEY in host env or PM2 ecosystem file when deploying
        // STREAMER_SIGNING_KEY: 'your-signing-key-here'
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
}
