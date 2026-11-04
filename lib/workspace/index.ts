import type { Workspace } from './types';
import { demo } from './demo';
import { notion, notionReady } from './notion';
import { PUBLIC_DEMO } from '../visitor';

export function workspace(): Workspace {
  // The public demo always runs on fake data, whatever the environment holds.
  if (PUBLIC_DEMO) return demo;
  return process.env.WORKSPACE === 'notion' && notionReady() ? notion : demo;
}
