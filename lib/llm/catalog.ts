import data from './free-llm-apis.json';

// Free LLM APIs from https://github.com/mnfst/awesome-free-llm-apis (CC0).
// Refresh the list with `npm run update-models`.

interface RawModel { id: string | null; modality: string; rateLimit: string }
interface RawProvider { name: string; category: string; url: string; baseUrl: string; description: string; footnoteRef: number | null; models: RawModel[] }

export interface CatalogProvider {
  id: string;
  vendor: string;
  url: string;          // where to get a key
  baseUrl: string;      // OpenAI-compatible base URL
  envKey?: string;      // key to read from .env.local
  extraEnv?: string;    // second value some providers need (Cloudflare account ID)
  keyless: boolean;     // works with no key at all
  smart: string;        // model for summaries, briefs, planning
  fast: string;         // model for quick jobs
  cap: number;          // requests per day when the list states one
  trains: boolean;      // the list says prompts may be used or logged
  description: string;
}

// How AssistAnt uses each listed provider. Gemini, Groq and OpenRouter already have their own entries.
const PLAN: Record<string, { id: string; env?: string; extra?: string; base?: string; keyless?: boolean; smart: string[]; fast: string[] }> = {
  'Mistral AI': { id: 'mistral', env: 'MISTRAL_API_KEY', smart: ['mistral-medium-3-5', 'mistral-large-2512'], fast: ['ministral-8b-2512', 'mistral-small-2603'] },
  'NVIDIA NIM': { id: 'nvidia', env: 'NVIDIA_API_KEY', smart: ['nvidia/nemotron-3-ultra-550b-a55b'], fast: ['openai/gpt-oss-20b'] },
  'Cohere': { id: 'cohere', env: 'COHERE_API_KEY', base: 'https://api.cohere.ai/compatibility/v1', smart: ['command-a-03-2025'], fast: ['command-r7b-12-2024'] },
  'Z AI (Zhipu AI)': { id: 'zai', env: 'ZAI_API_KEY', smart: ['glm-4.7-flash'], fast: ['glm-4.5-flash', 'glm-4.7-flash'] },
  'Cloudflare Workers AI': { id: 'cloudflare', env: 'CLOUDFLARE_API_TOKEN', extra: 'CLOUDFLARE_ACCOUNT_ID', base: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1', smart: ['@cf/openai/gpt-oss-120b'], fast: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast'] },
  'Gonka Broker': { id: 'gonka', env: 'GONKA_API_KEY', smart: ['deepseek-ai/DeepSeek-V4-Flash-0731'], fast: ['zai-org/GLM-5.3-Flash'] },
  'ModelScope': { id: 'modelscope', env: 'MODELSCOPE_API_KEY', smart: ['Qwen/Qwen3.5-35B-A3B'], fast: ['Qwen/Qwen3.5-27B'] },
  'SiliconFlow': { id: 'siliconflow', env: 'SILICONFLOW_API_KEY', smart: ['XingChenAGI/Xing4.0-29B'], fast: ['XingChenAGI/Xing4.0-29B'] },
  'Kilo Code': { id: 'kilo', env: 'KILO_API_KEY', keyless: true, smart: ['kilo-auto/free'], fast: ['kilo-auto/free'] },
  'LLM7.io': { id: 'llm7', env: 'LLM7_API_KEY', keyless: true, smart: ['gpt-oss:20b'], fast: ['gpt-oss:20b'] },
  'OVHcloud AI Endpoints': { id: 'ovh', env: 'OVH_AI_TOKEN', keyless: true, smart: ['gpt-oss-120b'], fast: ['gpt-oss-20b'] },
};

const raw = data as unknown as { lastUpdated: string; providers: RawProvider[]; footnotes: { id: number; text: string }[] };

const isText = (m: RawModel) => !!m.id && /text|multimodal|llm/i.test(m.modality) && !/embedding|code\)/i.test(m.modality);

// Use the planned model if the list still has it; otherwise the first text model it lists now.
function pickModel(p: RawProvider, wanted: string[]): string | null {
  const ids = new Set(p.models.map((m) => m.id));
  for (const w of wanted) if (ids.has(w)) return w;
  return p.models.find(isText)?.id ?? null;
}

function dailyCap(p: RawProvider): number {
  for (const m of p.models) {
    const hit = m.rateLimit.match(/([\d,]+)\s*RPD/i);
    if (hit) return Number(hit[1].replace(/,/g, ''));
  }
  return 0;
}

export const CATALOG_UPDATED = raw.lastUpdated;

export const CATALOG: CatalogProvider[] = raw.providers.flatMap((p) => {
  const plan = PLAN[p.name];
  if (!plan) return [];
  const smart = pickModel(p, plan.smart), fast = pickModel(p, plan.fast);
  if (!smart || !fast) return [];
  const note = raw.footnotes.find((f) => f.id === p.footnoteRef)?.text || '';
  return [{
    id: plan.id, vendor: p.name.replace(/ \(.*\)$/, ''), url: p.url, baseUrl: plan.base || p.baseUrl,
    envKey: plan.env, extraEnv: plan.extra, keyless: !!plan.keyless, smart, fast, cap: dailyCap(p),
    trains: /train|improve|log/i.test(p.description + ' ' + note), description: p.description,
  }];
});

// Order inside each line: providers with a key first (more reliable), keyless gateways last.
export const CATALOG_ORDER = Object.values(PLAN).map((p) => p.id).filter((id) => CATALOG.some((c) => c.id === id));
