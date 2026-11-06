# Running, testing and deploying AssistAnt

This repo is the **AssistAnt showcase**: a public app for demos, showing what AssistAnt does and guiding visitors through it. It is separate from the personal AssistAnt that holds real data.

| | Local development | Public showcase |
|---|---|---|
| Where | Your PC | Render (free) |
| Data | Fake sample data (any `.env.local` values are optional, for testing integrations) | Fake sample data, one private copy per visitor |
| Models | Whatever keys you add locally | Keyless free gateways only, then plain rules |
| Switch | `PUBLIC_DEMO` unset | `PUBLIC_DEMO=1` (set in `render.yaml`) |

## Local development

```bash
npm install
npm run dev                  # http://localhost:3000, runs on the sample data with nothing configured
```

## Tests

```bash
npm test            # vitest: visitor isolation, no keys in demo mode, local mode unchanged
npm run typecheck
npm run build
```

## Public demo on Render

1. Merge this branch into `main` and push.
2. In Render: **New → Blueprint**, pick the `AssistAnt` repo. Render reads `render.yaml` and creates the free `assistant-demo` web service.
3. Render asks for the provider keys listed in `render.yaml`. Fill in the free ones you have and leave the rest empty (you can add them later under **Environment**). Never add Notion values.
4. Open the `onrender.com` URL. You should see the "Public demo" banner, and **Sources** should list only Kilo, LLM7 and OVH.

### The access code (for a professor or reviewer)

Ordinary visitors only ever get the keyless models, so nobody can spend your quotas. To give one person the full model set:

1. In Render, open the service → **Environment** and copy the generated `DEMO_ACCESS_CODE`.
2. Send them `https://<your-service>.onrender.com/?code=<DEMO_ACCESS_CODE>`.
3. The code is swapped for a cookie and removed from the address bar. The banner then says **Showcase pass**, and **Sources** lists every provider with a key.

To revoke it, change `DEMO_ACCESS_CODE` in Render (old links and cookies stop working).

### Free keys worth adding

| Key | Where to get it |
|---|---|
| `GROQ_API_KEY` | https://console.groq.com/keys |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey |
| `OPENROUTER_API_KEY` | https://openrouter.ai/keys |
| `MISTRAL_API_KEY` | https://console.mistral.ai/api-keys |
| `NVIDIA_API_KEY` | https://build.nvidia.com |
| `COHERE_API_KEY` | https://dashboard.cohere.com/api-keys |

### FreeLLMAPI (optional)

[FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) is a self-hosted router: you add many providers' keys to it once and it serves them all behind one OpenAI-compatible endpoint. AssistAnt uses it when `FREELLMAPI_URL` and `FREELLMAPI_KEY` (its unified key) are set, early in every model chain.

- **Locally:** run it with Docker or its desktop app, then set `FREELLMAPI_URL=http://localhost:3001` and the unified key in `.env.local`. It also uses port 3001, so run AssistAnt on 3000.
- **On the showcase:** it needs an always-on host with a persistent disk, because it creates its unified key at first start and a wiped disk means a new key. Render's free tier wipes the disk on restart, so use a paid instance with a disk, or skip it and add the provider keys above directly.

Free-tier limits: the service sleeps after about 15 idle minutes (the first visit afterwards takes 30–60 s), and visitor data resets whenever it restarts.

## Notebook

`AssistAnt.ipynb` rebuilds the backend as a Python multi-agent team (LangGraph, MCP, ChromaDB RAG, MemorySaver and InMemoryStore, PDF output). Open it in Colab, optionally add `GEMINI_API_KEY` under Colab Secrets, then choose **Runtime → Run all**. Without a key, it uses the keyless gateways and then plain rules.
