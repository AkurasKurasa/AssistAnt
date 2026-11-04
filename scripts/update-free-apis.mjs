// Pulls the latest free LLM API list from github.com/mnfst/awesome-free-llm-apis (CC0)
// and saves it to lib/llm/free-llm-apis.json. Run with: npm run update-models
import fs from 'node:fs';
import path from 'node:path';

const URL = 'https://raw.githubusercontent.com/mnfst/awesome-free-llm-apis/main/data.json';
const OUT = path.join(process.cwd(), 'lib', 'llm', 'free-llm-apis.json');

const res = await fetch(URL);
if (!res.ok) { console.error(`Couldn't download the list (${res.status}).`); process.exit(1); }
const data = await res.json();
if (!Array.isArray(data.providers) || !data.providers.length) { console.error('The download didn’t look like the provider list. Nothing was changed.'); process.exit(1); }

const before = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')).lastUpdated : 'none';
fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');
console.log(`Updated the free model list: ${before} → ${data.lastUpdated}, ${data.providers.length} providers.`);
console.log('Restart AssistAnt to use it.');
