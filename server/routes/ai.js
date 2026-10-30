import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { audit } from '../db.js';
import { HttpError, validate } from '../lib/http.js';
import { generateRecipe, aiStatus } from '../ai.js';

export const aiRouter = Router();
aiRouter.use(requireAuth);

const seedSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(1000).nullish(),
  category: z.string().max(40).nullish(),
  servings: z.coerce.number().int().min(1).max(50).nullish(),
  prepMinutes: z.coerce.number().int().min(0).max(1440).nullish(),
  ingredients: z
    .array(
      z.object({
        name: z.string().trim().max(120),
        quantity: z.string().max(20).nullish(),
        unit: z.string().max(20).nullish(),
      }),
    )
    .max(30)
    .default([]),
  steps: z.array(z.string().max(800)).max(20).default([]),
});

const generationSchema = z.object({
  mode: z.enum(['new', 'similar']).optional().default('new'),
  prompt: z.string().trim().max(1000).optional().default(''),
  servings: z.coerce.number().int().min(1).max(50).optional(),
  maxMinutes: z.coerce.number().int().min(5).max(300).optional(),
  category: z.string().trim().max(40).optional(),
  vegetarian: z.boolean().optional().default(false),
  avoid: z.string().trim().max(200).optional().default(''),
  seed: seedSchema.optional(),
});

/** Limite semplice in memoria: evita raffiche e costi involontari. */
const history = new Map();
function throttle(userId) {
  const now = Date.now();
  const recent = (history.get(userId) || []).filter((time) => now - time < 3600_000);
  if (recent.length >= 40) {
    throw new HttpError(429, 'Hai generato molte ricette nell’ultima ora. Riprova più tardi.', 'ai_quota');
  }
  if (recent.length && now - recent[recent.length - 1] < 2500) {
    throw new HttpError(429, 'Aspetta qualche secondo prima di generare un’altra ricetta.', 'ai_throttle');
  }
  recent.push(now);
  history.set(userId, recent);
  if (history.size > 200) {
    for (const [key, times] of history) {
      if (!times.some((time) => now - time < 3600_000)) history.delete(key);
    }
  }
}

/**
 * I lavori vivono in memoria: bastano a coprire i 20–120 secondi di un modello
 * locale e a evitare i timeout del proxy (Cloudflare chiude a 100 s).
 */
const jobs = new Map();

function cleanupJobs() {
  const cutoff = Date.now() - 15 * 60_000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}

aiRouter.get('/status', (req, res) => {
  res.json({ ai: aiStatus() });
});

aiRouter.post('/recipes/generate', (req, res) => {
  const input = validate(generationSchema, req.body);
  if (!aiStatus().configured) {
    throw new HttpError(503, 'Generazione AI non configurata. Imposta AI_BASE_URL e AI_MODEL nel file .env.', 'ai_not_configured');
  }
  if (input.mode === 'similar' && !input.seed?.title) {
    throw new HttpError(400, 'Serve una ricetta di partenza per generarne una simile.', 'missing_seed');
  }
  throttle(req.user.id);
  cleanupJobs();

  const jobId = crypto.randomUUID();
  const job = {
    id: jobId,
    userId: req.user.id,
    createdAt: Date.now(),
    status: 'running',
    result: null,
    error: null,
  };
  jobs.set(jobId, job);

  generateRecipe(input)
    .then((result) => {
      job.status = 'done';
      job.result = result;
      audit(req.user.id, 'ai_generate_recipe', null, null, { mode: input.mode, model: result.meta.model });
    })
    .catch((err) => {
      job.status = 'error';
      job.error = {
        status: err?.status || 502,
        code: err?.code || 'ai_error',
        message: err?.message || 'Generazione non riuscita.',
      };
    });

  res.status(202).json({ jobId, status: 'running' });
});

aiRouter.get('/recipes/jobs/:id', (req, res) => {
  const job = jobs.get(String(req.params.id));
  if (!job || job.userId !== req.user.id) {
    throw new HttpError(404, 'Generazione non trovata o scaduta. Riprova.', 'ai_job_not_found');
  }
  if (job.status === 'running') return res.json({ status: 'running' });
  if (job.status === 'error') return res.json({ status: 'error', error: job.error });
  res.json({ status: 'done', result: job.result });
});
