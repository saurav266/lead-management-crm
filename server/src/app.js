import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { env } from './env.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.routes.js';
import employeeRoutes from './routes/employees.routes.js';
import leadRoutes from './routes/leads.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import syncRoutes from './routes/sync.routes.js';

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());
  if (env.corsOrigin) {
    app.use(cors({ origin: env.corsOrigin, credentials: true }));
  }

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRoutes);
  app.use('/api/employees', employeeRoutes);
  app.use('/api/leads', leadRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/sync', syncRoutes);

  // Serve the built client (production single-process deploy).
  const clientDist = path.resolve(process.cwd(), '../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);

  return app;
}
