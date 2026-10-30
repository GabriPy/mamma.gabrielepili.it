import { z } from 'zod';
import { config, aiConfigured } from './config.js';
import { HttpError } from './lib/http.js';

const CATEGORIES = ['Primi', 'Secondi', 'Contorni', 'Dolci', 'Colazioni', 'Conserve', 'Altro'];

const SYSTEM_PROMPT = `Sei il cuoco di casa di "Ghibiri Home", una famiglia italiana. Scrivi ricette pratiche, casalinghe e realizzabili con ingredienti comuni.

REGOLE:
- Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza testo prima o dopo, senza markdown e senza blocchi di codice.
- Usa la lingua italiana.
- Ingredienti in unità metriche (g, kg, ml, L, pz, cucchiai, q.b.) con quantità realistiche per le porzioni richieste.
- Massimo 15 ingredienti e massimo 10 passaggi brevi e chiari.
- Rispetta rigorosamente allergie, intolleranze e ingredienti da evitare indicati nella richiesta.
- Non inventare procedure pericolose: per carni, pesce e uova indica cotture sicure e temperature adeguate.
- Non citare marchi commerciali.
- Il titolo deve essere diverso da quelli di eventuali ricette di partenza e appetitoso ma semplice.

SCHEMA JSON:
{
  "title": "string",
  "description": "string (massimo 300 caratteri)",
  "category": "uno tra: Primi, Secondi, Contorni, Dolci, Colazioni, Conserve, Altro",
  "servings": numero intero,
  "prepMinutes": numero intero,
  "ingredients": [{"name": "string", "quantity": "string", "unit": "string"}],
  "steps": ["string", "string"],
  "tips": "string (facoltativo, massimo 300 caratteri)"
}`;

const generatedSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(600).optional().default(''),
  category: z.string().trim().max(40).optional().default('Altro'),
  servings: z.coerce.number().int().min(1).max(30).optional().default(4),
  prepMinutes: z.coerce.number().int().min(0).max(600).optional().default(30),
  ingredients: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        quantity: z.union([z.string(), z.number()]).optional().default(''),
        unit: z.union([z.string(), z.number()]).optional().default(''),
      }),
    )
    .min(1)
    .max(25),
  steps: z.array(z.string().trim().min(1).max(800)).min(1).max(15),
  tips: z.string().trim().max(600).optional().default(''),
});

export function aiStatus() {
  return {
    configured: aiConfigured(),
    baseUrl: config.ai.baseUrl || null,
    model: config.ai.model || null,
    keySet: Boolean(config.ai.apiKey),
    timeoutMs: config.ai.timeoutMs,
    local: isLocalProvider(),
  };
}

function isLocalProvider() {
  try {
    const host = new URL(config.ai.baseUrl).hostname;
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  } catch {
    return false;
  }
}

function providerHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (config.ai.apiKey) headers.Authorization = `Bearer ${config.ai.apiKey}`;
  return headers;
}

async function providerFetch(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.ai.timeoutMs);
  try {
    const response = await fetch(`${config.ai.baseUrl}${path}`, {
      ...options,
      headers: { ...providerHeaders(), ...(options.headers || {}) },
      signal: controller.signal,
    });
    const raw = await response.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }
    if (!response.ok) {
      const detail = data?.error?.message || data?.message || '';
      const fail = (message, code) => {
        const error = new HttpError(502, message, code);
        error.providerStatus = response.status;
        return error;
      };
      if (response.status === 401 || response.status === 403) {
        throw fail('La chiave API del servizio AI non è valida o non ha i permessi necessari.', 'ai_auth');
      }
      if (response.status === 404) {
        throw fail('Endpoint AI non trovato: controlla AI_BASE_URL (di solito termina con /v1).', 'ai_endpoint');
      }
      if (response.status === 429) {
        throw new HttpError(429, 'Il servizio AI ha troppe richieste o credito esaurito. Riprova fra poco.', 'ai_rate');
      }
      throw fail(
        `Il servizio AI ha risposto con un errore (${response.status})${detail ? `: ${String(detail).slice(0, 240)}` : ''}.`,
        'ai_error',
      );
    }
    return data;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new HttpError(504, 'Il servizio AI non ha risposto in tempo. Riprova.', 'ai_timeout');
    }
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, 'Non riesco a raggiungere il servizio AI. Controlla la connessione e AI_BASE_URL.', 'ai_unreachable');
  } finally {
    clearTimeout(timer);
  }
}

export async function checkProvider() {
  if (!aiConfigured()) {
    throw new HttpError(503, 'Generazione AI non configurata. Imposta AI_BASE_URL e AI_MODEL nel file .env.', 'ai_not_configured');
  }
  const started = Date.now();
  const data = await providerFetch('/models', { method: 'GET' });
  const models = Array.isArray(data?.data) ? data.data.map((m) => m.id).filter(Boolean) : [];
  return {
    ok: true,
    elapsedMs: Date.now() - started,
    models: models.length,
    modelAvailable: models.length ? models.includes(config.ai.model) : null,
  };
}

function extractContent(payload) {
  const content = payload?.choices?.[0]?.message?.content ?? payload?.message?.content ?? payload?.response;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('\n');
  }
  return typeof content === 'string' ? content : '';
}

function parseJsonObject(text) {
  let value = String(text || '').trim();
  value = value.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new HttpError(502, 'Il servizio AI ha restituito una risposta non leggibile. Riprova.', 'ai_bad_response');
  }
  try {
    return JSON.parse(value.slice(start, end + 1));
  } catch {
    throw new HttpError(502, 'Il servizio AI ha restituito un JSON non valido. Riprova.', 'ai_bad_json');
  }
}

function normalizeCategory(value) {
  const text = String(value || '').trim().toLowerCase();
  return CATEGORIES.find((category) => category.toLowerCase() === text) || 'Altro';
}

const UNIT_MAP = {
  g: 'g',
  gr: 'g',
  grammi: 'g',
  grammo: 'g',
  kg: 'kg',
  chili: 'kg',
  chilogrammi: 'kg',
  ml: 'ml',
  millilitri: 'ml',
  l: 'L',
  lt: 'L',
  litri: 'L',
  pz: 'pz',
  pezzi: 'pz',
  pezzo: 'pz',
  bt: 'bt',
  bottiglia: 'bt',
  bottiglie: 'bt',
  conf: 'conf',
  confezione: 'conf',
  confezioni: 'conf',
  rotolo: 'rotoli',
  rotoli: 'rotoli',
  cucchiaio: 'cucchiai',
  cucchiai: 'cucchiai',
  cucchiaino: 'cucchiaini',
  cucchiaini: 'cucchiaini',
  pizzico: 'q.b.',
  qb: 'q.b.',
  'q.b.': 'q.b.',
};

function normalizeUnit(value) {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return '';
  return UNIT_MAP[key] || String(value).trim().slice(0, 20);
}

function normalizeIngredient(raw) {
  let quantity = raw.quantity === undefined || raw.quantity === null ? '' : String(raw.quantity).trim();
  let unit = normalizeUnit(raw.unit);
  const inline = quantity.match(/^([\d.,/]+)\s*(g|gr|kg|ml|l|lt|pz|bt|conf|rotoli|cucchiai|cucchiaini)$/i);
  if (inline && !unit) {
    quantity = inline[1];
    unit = normalizeUnit(inline[2]);
  }
  if (/q\.?\s*b\.?/i.test(quantity) || /q\.?\s*b\.?/i.test(unit)) {
    quantity = '';
    unit = 'q.b.';
  }
  return {
    name: String(raw.name || '').trim().slice(0, 120),
    quantity: quantity.slice(0, 20),
    unit: unit.slice(0, 20),
  };
}

function normalizeRecipe(raw) {
  const prepared = {
    ...raw,
    servings:
      typeof raw?.servings === 'string' ? Number.parseInt(raw.servings, 10) || 4 : raw?.servings,
    prepMinutes:
      typeof raw?.prepMinutes === 'string' ? Number.parseInt(raw.prepMinutes, 10) || 30 : raw?.prepMinutes,
    steps: Array.isArray(raw?.steps)
      ? raw.steps
      : typeof raw?.steps === 'string'
        ? raw.steps
            .split(/\n+/)
            .map((step) => step.replace(/^\s*\d+[.)]\s*/, '').trim())
            .filter(Boolean)
        : raw?.steps,
  };
  const parsed = generatedSchema.safeParse(prepared);
  if (!parsed.success) {
    throw new HttpError(502, 'Il servizio AI ha restituito una ricetta incompleta. Riprova.', 'ai_invalid_recipe');
  }
  const data = parsed.data;
  return {
    title: data.title,
    description: data.description,
    category: normalizeCategory(data.category),
    servings: data.servings,
    prepMinutes: data.prepMinutes,
    ingredients: data.ingredients.map(normalizeIngredient).filter((ingredient) => ingredient.name),
    steps: data.steps
      .map((step) => step.replace(/^\s*\d+[.)]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 12),
    tips: data.tips,
  };
}

function buildMessages(input) {
  const payload = {
    richiesta: input.prompt?.trim() || 'una ricetta semplice e di stagione per la famiglia',
    porzioni: input.servings ?? null,
    tempo_massimo_minuti: input.maxMinutes ?? null,
    categoria_preferita: input.category || null,
    vegetariana: Boolean(input.vegetarian),
    da_evitare: input.avoid?.trim() || null,
    variante: Math.random().toString(36).slice(2, 9),
  };

  if (input.mode === 'similar' && input.seed) {
    payload.ricetta_di_partenza = {
      titolo: input.seed.title,
      descrizione: input.seed.description || '',
      categoria: input.seed.category || '',
      porzioni: input.seed.servings || null,
      ingredienti: input.seed.ingredients || [],
      passaggi: input.seed.steps || [],
    };
    payload.istruzione = 'Crea una VARIANTE della ricetta di partenza: stesso spirito e stessa famiglia di sapori, ma cambia almeno due ingredienti o la tecnica. Titolo nuovo.';
  } else {
    payload.istruzione = 'Crea una ricetta nuova, diversa da quelle classiche già ovvie.';
  }

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Prepara una ricetta seguendo questa richiesta:\n${JSON.stringify(payload)}` },
  ];
}

function responseFormat() {
  if (config.ai.jsonMode === 'object') return { type: 'json_object' };
  return null;
}

async function chatCompletion(payload, useFormat) {
  const body = { ...payload };
  if (useFormat) {
    const format = responseFormat();
    if (format) body.response_format = format;
  }
  return providerFetch('/chat/completions', { method: 'POST', body: JSON.stringify(body) });
}

export async function generateRecipe(input) {
  if (!aiConfigured()) {
    throw new HttpError(503, 'Generazione AI non configurata. Imposta AI_BASE_URL e AI_MODEL nel file .env.', 'ai_not_configured');
  }
  if (input.mode === 'similar' && !input.seed?.title) {
    throw new HttpError(400, 'Serve una ricetta di partenza per generarne una simile.', 'missing_seed');
  }

  const started = Date.now();
  const payload = {
    model: config.ai.model,
    messages: buildMessages(input),
    temperature: config.ai.temperature,
    max_tokens: config.ai.maxTokens,
  };

  let data;
  let formatUsed = config.ai.jsonMode !== 'off';
  try {
    data = await chatCompletion(payload, formatUsed);
  } catch (err) {
    // Alcuni provider non accettano response_format: riprovo una volta senza.
    if (formatUsed && err?.providerStatus && [400, 422].includes(err.providerStatus)) {
      formatUsed = false;
      data = await chatCompletion(payload, false);
    } else {
      throw err;
    }
  }

  const content = extractContent(data);
  if (!content.trim()) {
    throw new HttpError(502, 'Il servizio AI non ha restituito testo. Riprova.', 'ai_empty');
  }
  const recipe = normalizeRecipe(parseJsonObject(content));
  return {
    recipe,
    meta: {
      model: config.ai.model,
      provider: 'openai-compatible',
      jsonMode: formatUsed ? config.ai.jsonMode : 'off',
      elapsedMs: Date.now() - started,
    },
  };
}
