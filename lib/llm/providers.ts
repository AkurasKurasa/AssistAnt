import { spawn } from 'node:child_process';
import { CATALOG, CATALOG_ORDER } from './catalog';
import { PUBLIC_DEMO } from '../visitor';

export type ProviderId = string;
export type CallTier = 'fast' | 'smart' | 'best';

export class RateLimitError extends Error {}

export interface Provider {
  id: ProviderId;
  vendor: string;
  name: string;
  short: string;
  cap: number;          // daily request limit we track (0 = none)
  paid?: boolean;
  sub?: boolean;        // uses your Claude subscription
  reset?: string;
  defaultOn?: boolean;  // false = off until you switch it on in Sources
  keyUrl?: string;      // where to get a key
  trains?: boolean;     // provider may use or log prompts
  keyless?: boolean;    // works without a key
  catalog?: boolean;    // comes from the free LLM API list
  setup: () => Promise<{ ok: boolean; why?: string }>;
  call: (prompt: string, system?: string, tier?: CallTier) => Promise<string>;
}

const TIMEOUT = 60_000;
const QUOTA = /quota|rate.?limit|exceeded|insufficient|credits|resource.?exhausted|limit reached/i;

async function post(url: string, body: unknown, headers: Record<string, string>): Promise<any> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
    if (r.status === 429) throw new RateLimitError('rate limited');
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 200);
      // Out of credits (402) or a quota message on a 400/403 is a limit too, not a broken provider.
      if (r.status === 402 || ((r.status === 400 || r.status === 403) && QUOTA.test(detail))) throw new RateLimitError(`${r.status} ${detail}`);
      throw new Error(`${r.status} ${detail}`);
    }
    return await r.json();
  } finally { clearTimeout(timer); }
}

function openAICompatible(url: string, key: string, model: string, extra: Record<string, string> = {}) {
  return async (prompt: string, system?: string) => {
    const messages = [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }];
    const j = await post(url, { model, messages, temperature: 0.3 }, { ...(key ? { authorization: `Bearer ${key}` } : {}), ...extra });
    return String(j.choices?.[0]?.message?.content ?? '').trim();
  };
}

function gemini(model: string) {
  return async (prompt: string, system?: string) => {
    const key = process.env.GEMINI_API_KEY!;
    const j = await post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    }, {});
    return String(j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '').trim();
  };
}

// ---------- Claude Code (your Pro/Max plan) ----------
let claudeCheck: { at: number; ok: boolean; why?: string } | null = null;

function claudeEnv(): NodeJS.ProcessEnv {
  // Claude Code prefers ANTHROPIC_API_KEY over your subscription login, so strip it.
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  return env;
}

function runClaude(args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { env: claudeEnv(), shell: process.platform === 'win32' });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Claude Code timed out')); }, TIMEOUT * 2);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(out.trim());
      if (/limit|usage|quota/i.test(err + out)) return reject(new RateLimitError('Claude plan limit reached'));
      reject(new Error((err || out || `exit ${code}`).slice(0, 200)));
    });
    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

async function claudeSetup() {
  if (process.env.CLAUDE_CODE_ENABLED === 'false') return { ok: false, why: 'Turned off in .env.local' };
  if (claudeCheck && Date.now() - claudeCheck.at < 60_000) return claudeCheck;
  try { await runClaude(['--version']); claudeCheck = { at: Date.now(), ok: true }; }
  catch { claudeCheck = { at: Date.now(), ok: false, why: 'Claude Code not found on this PC' }; }
  return claudeCheck;
}

const keyed = (name: string) => async () => (process.env[name] ? { ok: true } : { ok: false, why: `No API key yet · add ${name}` });

export const PROVIDERS: Record<string, Provider> = {
  claudesub: {
    id: 'claudesub', vendor: 'Claude', name: 'Pro/Max plan', short: 'claude · your plan', cap: 0, sub: true,
    setup: claudeSetup,
    call: (prompt, system) => runClaude(['-p', '--output-format', 'text'], (system ? system + '\n\n' : '') + prompt),
  },
  groq120: {
    id: 'groq120', vendor: 'Groq', name: 'gpt-oss-120b', short: 'groq 120b', cap: 1000, keyUrl: 'https://console.groq.com/keys', setup: keyed('GROQ_API_KEY'),
    call: (p, s) => openAICompatible('https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY!, 'openai/gpt-oss-120b')(p, s),
  },
  groq20: {
    id: 'groq20', vendor: 'Groq', name: 'gpt-oss-20b', short: 'groq 20b', cap: 1000, setup: keyed('GROQ_API_KEY'),
    call: (p, s) => openAICompatible('https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY!, 'openai/gpt-oss-20b')(p, s),
  },
  qwen: {
    id: 'qwen', vendor: 'Groq', name: 'qwen3.8-27b', short: 'groq qwen', cap: 1000, defaultOn: false, setup: keyed('GROQ_API_KEY'),
    call: (p, s) => openAICompatible('https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY!, 'qwen/qwen3.8-27b')(p, s),
  },
  flash: {
    id: 'flash', vendor: 'Google', name: 'Gemini Flash', short: 'gemini flash', cap: 20, reset: 'resets at Pacific midnight', keyUrl: 'https://aistudio.google.com/apikey', trains: true, setup: keyed('GEMINI_API_KEY'),
    call: (p, s) => gemini(process.env.GEMINI_FLASH_MODEL || 'gemini-3.8-flash')(p, s),
  },
  lite: {
    id: 'lite', vendor: 'Google', name: 'Gemini Flash-Lite', short: 'gemini lite', cap: 500, setup: keyed('GEMINI_API_KEY'),
    call: (p, s) => gemini(process.env.GEMINI_LITE_MODEL || 'gemini-3.5-flash-lite')(p, s),
  },
  openrouter: {
    id: 'openrouter', vendor: 'OpenRouter', name: 'Free models', short: 'openrouter', cap: 0,
    keyUrl: 'https://openrouter.ai/keys', trains: true, setup: keyed('OPENROUTER_API_KEY'),
    // openrouter/free is OpenRouter's router across its free models.
    call: (p, s) => openAICompatible('https://openrouter.ai/api/v1/chat/completions', process.env.OPENROUTER_API_KEY!, process.env.OPENROUTER_MODEL || 'openrouter/free')(p, s),
  },
  ollama: {
    id: 'ollama', vendor: 'Ollama', name: 'Local model', short: 'ollama', cap: 0,
    setup: async () => {
      try {
        const r = await fetch((process.env.OLLAMA_URL || 'http://localhost:11434') + '/api/tags', { signal: AbortSignal.timeout(1500) });
        return r.ok ? { ok: true } : { ok: false, why: 'Not running on this PC' };
      } catch { return { ok: false, why: 'Not running on this PC' }; }
    },
    call: async (prompt, system) => {
      const j = await post((process.env.OLLAMA_URL || 'http://localhost:11434') + '/api/chat', {
        model: process.env.OLLAMA_MODEL || 'llama3.2', stream: false,
        messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }],
      }, {});
      return String(j.message?.content ?? '').trim();
    },
  },
  claudeapi: {
    id: 'claudeapi', vendor: 'Claude API', name: 'Haiku', short: 'claude api', cap: 0, paid: true, defaultOn: false, setup: keyed('CLAUDE_API_KEY'),
    call: async (prompt, system) => {
      const j = await post('https://api.anthropic.com/v1/messages', {
        model: process.env.CLAUDE_API_MODEL || 'claude-haiku-5-5', max_tokens: 1024, ...(system ? { system } : {}),
        messages: [{ role: 'user', content: prompt }],
      }, { 'x-api-key': process.env.CLAUDE_API_KEY!, 'anthropic-version': '2023-06-01' });
      return String(j.content?.map((c: any) => c.text).join('') ?? '').trim();
    },
  },
};

// ---------- Free providers from the awesome-free-llm-apis list ----------
for (const c of CATALOG) {
  const baseUrl = () => c.baseUrl.replace('{account_id}', process.env[c.extraEnv || ''] || '');
  PROVIDERS[c.id] = {
    id: c.id, vendor: c.vendor, name: c.smart === c.fast ? c.smart : `${c.smart} / ${c.fast}`, short: c.id, cap: c.cap,
    catalog: true, keyless: c.keyless, trains: c.trains, keyUrl: c.url, defaultOn: !c.keyless,
    setup: async () => {
      if (c.keyless) return { ok: true };
      if (!process.env[c.envKey!]) return { ok: false, why: `No API key yet · add ${c.envKey}` };
      if (c.extraEnv && !process.env[c.extraEnv]) return { ok: false, why: `Add ${c.extraEnv} too` };
      return { ok: true };
    },
    // The public demo never sends a key, even if one is set on the host.
    call: (prompt, system, tier) => openAICompatible(baseUrl().replace(/\/$/, '') + '/chat/completions', PUBLIC_DEMO ? '' : process.env[c.envKey || ''] || '', tier === 'fast' ? c.fast : c.smart)(prompt, system),
  };
}

export const ORDER: ProviderId[] = ['claudesub', 'groq120', 'groq20', 'qwen', 'flash', 'lite', 'openrouter', ...CATALOG_ORDER, 'ollama', 'claudeapi'];
