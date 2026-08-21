import './db/index.js'; // ensures schema + admin seed run before serving traffic
import { createApp } from './app.js';
import { env } from './env.js';
import { startScheduledSync } from './services/syncService.js';

const app = createApp();

app.listen(env.port, () => {
  console.log(`CRM server listening on http://localhost:${env.port}`);
  startScheduledSync();
});
