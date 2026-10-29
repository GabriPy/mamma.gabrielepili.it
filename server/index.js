import { config, smtpConfigured } from './config.js';
import { db, seed } from './db.js';
import { createApp } from './app.js';
import { startScheduler } from './reminders.js';
import { seedDemo } from './seed-demo.js';

seed();
if (config.seed.demo) seedDemo();

const app = createApp();

const server = app.listen(config.port, config.host, () => {
  const line = '─'.repeat(54);
  console.log(line);
  console.log('  🏡  Ghibiri Home');
  console.log(`  URL       ${config.appUrl}`);
  console.log(`  Ascolto   ${config.host}:${config.port}`);
  console.log(`  Dati      ${config.dataDir}`);
  console.log(`  Email     ${smtpConfigured() ? `SMTP ${config.smtp.host}` : 'non configurata (promemoria in coda)'}`);
  console.log(line);
});

startScheduler();

let closing = false;
function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`\n[${signal}] chiusura in corso...`);
  server.close(() => {
    try {
      db.close();
    } catch {
      /* già chiuso */
    }
    console.log('Server fermato.');
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 8000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
