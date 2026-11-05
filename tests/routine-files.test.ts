import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// Git on Windows (core.autocrlf=true) checks routines out with CRLF line endings.
const home = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-crlf-'));
afterAll(() => { process.chdir(home); fs.rmSync(tmp, { recursive: true, force: true }); });

describe('routine files', () => {
  it('parse the same with CRLF line endings as with LF', async () => {
    fs.mkdirSync(path.join(tmp, 'routines'));
    fs.writeFileSync(path.join(tmp, 'routines', 'groceries.md'), '---\r\nname: Groceries\r\nflow: groceries\r\ntriggers: grocer, shopping\r\n---\r\nAdd items.\r\n');
    process.chdir(tmp);
    const { loadRoutines, matchRoutine } = await import('../lib/engine/routines');
    expect(loadRoutines()[0]).toMatchObject({ name: 'Groceries', flow: 'groceries', body: 'Add items.' });
    expect(matchRoutine('add eggs to my grocery list')?.slug).toBe('groceries');
  });
});
