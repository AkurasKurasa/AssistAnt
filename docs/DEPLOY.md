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
3. Don't add any API keys or Notion values in Render. The demo ignores them anyway.
4. Open the `onrender.com` URL. You should see the "Public demo" banner, and **Sources** should list only Kilo, LLM7 and OVH.

Free-tier limits: the service sleeps after about 15 idle minutes (the first visit afterwards takes 30–60 s), and visitor data resets whenever it restarts.

## Notebook

`AssistAnt.ipynb` rebuilds the backend as a Python multi-agent team (LangGraph, MCP, ChromaDB RAG, MemorySaver and InMemoryStore, PDF output). Open it in Colab, optionally add `GEMINI_API_KEY` under Colab Secrets, then choose **Runtime → Run all**. Without a key, it uses the keyless gateways and then plain rules.
