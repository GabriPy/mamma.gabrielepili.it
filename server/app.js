import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { config, smtpConfigured } from './config.js';
import { authMiddleware } from './auth.js';
import { HttpError } from './lib/http.js';
import { db } from './db.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { eventsRouter } from './routes/events.js';
import { deadlinesRouter } from './routes/deadlines.js';
import { shoppingRouter } from './routes/shopping.js';
import { recipesRouter } from './routes/recipes.js';
import { plantsRouter } from './routes/plants.js';
import { attachmentsRouter } from './routes/attachments.js';
import { dashboardRouter } from './routes/dashboard.js';
import { searchRouter } from './routes/search.js';
import { settingsRouter } from './routes/settings.js';
import { backupRouter } from './routes/backup.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy:
        config.env === 'production'
          ? {
              useDefaults: false,
              directives: {
                'default-src': ["'self'"],
                'img-src': ["'self'", 'data:', 'blob:'],
                'style-src': ["'self'", "'unsafe-inline'"],
                'script-src': ["'self'"],
                'connect-src': ["'self'"],
                'font-src': ["'self'", 'data:'],
                'manifest-src': ["'self'"],
                'worker-src': ["'self'"],
                'object-src': ["'none'"],
                'base-uri': ["'self'"],
                'form-action': ["'self'"],
                'frame-ancestors': ["'none'"],
              },
            }
          : false,
      crossOriginEmbedderPolicy: false,
      hsts: config.cookieSecure ? { maxAge: 15552000, includeSubDomains: true } : false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  // Difesa CSRF: le richieste che modificano dati devono arrivare dalla stessa origine.
  app.use((req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    if (req.path.startsWith('/api/health')) return next();
    const origin = req.get('origin');
    if (!origin) return next();
    let originHost;
    try {
      originHost = new URL(origin).host;
    } catch {
      return res.status(403).json({ error: 'Origine non valida.' });
    }
    if (originHost !== req.get('host')) {
      return res.status(403).json({ error: 'Richiesta bloccata: origine non consentita.', code: 'bad_origin' });
    }
    next();
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'Troppi tentativi di accesso. Attendi qualche minuto.' },
  });

  app.use(authMiddleware);

  app.get('/api/health', (_req, res) => {
    let database = 'ok';
    try {
      db.prepare('SELECT 1').get();
    } catch {
      database = 'error';
    }
    res.status(database === 'ok' ? 200 : 503).json({
      status: database === 'ok' ? 'ok' : 'degraded',
      app: 'ghibiri-home',
      version: process.env.APP_VERSION || '1.0.0',
      time: new Date().toISOString(),
      database,
      email: smtpConfigured() ? 'configured' : 'not_configured',
      uptime: Math.round(process.uptime()),
    });
  });

  app.use('/api/auth/login', loginLimiter);
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/deadlines', deadlinesRouter);
  app.use('/api/shopping', shoppingRouter);
  app.use('/api/recipes', recipesRouter);
  app.use('/api/plants', plantsRouter);
  app.use('/api/attachments', attachmentsRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/backup', backupRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Endpoint non trovato.', code: 'not_found' });
  });

  const indexFile = path.join(config.publicDir, 'index.html');
  if (fs.existsSync(config.publicDir)) {
    app.use(
      '/assets',
      express.static(path.join(config.publicDir, 'assets'), { immutable: true, maxAge: '365d' }),
    );
    app.use(
      express.static(config.publicDir, {
        index: false,
        maxAge: '1h',
        setHeaders(res, filePath) {
          if (filePath.endsWith('sw.js') || filePath.endsWith('index.html') || filePath.endsWith('manifest.webmanifest')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
    );
  }

  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || !req.accepts('html')) return next();
    if (!fs.existsSync(indexFile)) {
      return res
        .status(503)
        .type('text/plain')
        .send('Interfaccia non compilata. Esegui "npm run build" oppure usa l’immagine Docker.');
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexFile);
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
    }
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `Il file supera il limite di ${config.maxUploadMb} MB.`
          : 'Caricamento del file non riuscito.';
      return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: message, code: 'upload_error' });
    }
    if (err?.code === 'unsupported_file') {
      return res.status(415).json({ error: err.message, code: 'unsupported_file' });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Richiesta non valida.', code: 'bad_json' });
    }
    console.error('[errore]', err);
    const message = config.env === 'production' ? 'Si è verificato un errore. Riprova.' : err.message;
    res.status(500).json({ error: message, code: 'internal_error' });
  });

  return app;
}
