/**
 * PM2 process config — keeps the Spendes API alive on this PC, auto-restarting it
 * the instant it crashes (the server exits on an uncaught exception / failed boot,
 * and PM2 brings it straight back). Runs the TypeScript directly via tsx — no build
 * step needed.
 *
 * One-time setup (run in spendes_backend/):
 *   npm i -g pm2
 *   # stop any manually-running `npm run start:dev` first (Ctrl-C in that window), then:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save                         # remember the process list
 *
 * Day to day:
 *   pm2 status                       # see it running + how many times it restarted
 *   pm2 logs spendes-api             # tail logs
 *   pm2 restart spendes-api          # after you change code
 *   pm2 stop spendes-api  |  pm2 delete spendes-api
 *
 * Survive a Windows reboot (e.g. a Windows Update restart):
 *   npm i -g pm2-windows-startup  &&  pm2-startup install  &&  pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'spendes-api',
      script: 'src/server.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx', // run TS on the fly, no build
      cwd: __dirname,
      autorestart: true,
      max_restarts: 100,
      restart_delay: 3000, // wait 3s between restarts so a crash loop doesn't spin hot
      watch: false, // PM2 restarts on CRASH, not on file change (stable for testing)
      env: { NODE_ENV: 'development' },
    },

    // --- ngrok (optional, but recommended — keep the tunnel alive too) ----------
    // IMPORTANT: a free ngrok URL CHANGES on every restart, which breaks the app
    // (the API URL is baked into the build/.env). Reserve your one free **static
    // domain** in the ngrok dashboard, put it below, and uncomment this block.
    // {
    //   name: 'ngrok',
    //   script: 'ngrok',
    //   args: 'http 3000 --url=https://YOUR-STATIC-DOMAIN.ngrok-free.app',
    //   interpreter: 'none', // ngrok is a binary, not a node script
    //   autorestart: true,
    //   restart_delay: 5000,
    //   watch: false,
    // },
  ],
};
