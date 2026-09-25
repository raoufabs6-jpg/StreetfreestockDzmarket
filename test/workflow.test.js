import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'akma-'));
process.env.STEP_DELAY_MS = '0';
delete process.env.OPENAI_API_KEY;

const { createClient, validate } = await import('../src/workflow.js');
const { store } = await import('../src/store.js');

test('validation rejects missing required fields', () => {
  const errs = validate({ email: 'bad' });
  assert.ok(errs.businessName && errs.contactName && errs.email);
});

test('full pipeline produces all deliverables', async () => {
  const rec = createClient({
    businessName: 'Test Brand', contactName: 'Ali', email: 'ali@test.dz',
    budget: 60000, goals: ['sales'], channels: ['instagram', 'tiktok'], wilaya: 'Oran', industry: 'Streetwear',
  });
  for (let i = 0; i < 100 && !['completed', 'failed'].includes(store.get(rec.id).status); i++)
    await new Promise((r) => setTimeout(r, 20));
  const done = store.get(rec.id);
  assert.equal(done.status, 'completed');
  assert.ok(done.steps.every((s) => s.status === 'done'));
  const { core, analysis, marketing, content } = done.results;
  assert.ok(core.readinessScore >= 0 && core.readinessScore <= 100);
  assert.equal(analysis.swot.strengths.length > 0, true);
  const sum = marketing.budget.allocation.reduce((s, a) => s + a.amount, 0);
  assert.ok(Math.abs(sum - 60000) <= 5, `allocation sums to budget (got ${sum})`);
  assert.equal(content.calendar.length, 7);
  assert.equal(content.captions.length, 5);
});
