// PM2 Ecosystem Configuration for Hostinger Deployment
// Usage: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "myfng-local-ai",
      script: "npm",
      args: "run start",
      cwd: "/home/myfng/platform", // change if your deploy path differs
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        NEXTAUTH_URL: "https://gmb.myfng.in",
      },
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      watch: false,
      max_memory_restart: "1G",
      error_file: "./logs/error.log",
      out_file: "./logs/output.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
