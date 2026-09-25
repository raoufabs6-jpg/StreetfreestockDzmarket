// Automation workflow: orchestrates the pipeline from the AKMA diagram.
//
//   Client Form → Automation Workflow → AI Analysis (core)
//                                   ┌───────┼────────┐
//                             Analysis  Marketing  Content   (run in parallel)
//                                   └───────┼────────┘
//                                       Dashboard
import { EventEmitter } from 'node:events';
import { store } from './store.js';
import { coreAnalysis, analysisReport, marketingPlan, contentPack, aiProvider } from './ai.js';

export const events = new EventEmitter();
events.setMaxListeners(100);

export const STEPS = [
  { key: 'form', label: 'Client Form' },
  { key: 'workflow', label: 'Automation Workflow' },
  { key: 'ai', label: 'AI Analysis' },
  { key: 'analysis', label: 'Analysis Report' },
  { key: 'marketing', label: 'Marketing Plan' },
  { key: 'content', label: 'Content' },
  { key: 'dashboard', label: 'Dashboard' },
];

const STEP_DELAY = Number(process.env.STEP_DELAY_MS ?? 600); // makes progress visible in the UI
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setStep(id, key, status, extra = {}) {
  const rec = store.update(id, (r) => ({
    steps: r.steps.map((s) => (s.key === key ? { ...s, status, at: new Date().toISOString(), ...extra } : s)),
  }));
  events.emit('update', rec);
  return rec;
}

function log(id, message) {
  const rec = store.update(id, (r) => ({ log: [...r.log, { at: new Date().toISOString(), message }] }));
  events.emit('update', rec);
}

const REQUIRED = ['businessName', 'contactName', 'email'];

export function validate(input) {
  const errors = {};
  for (const f of REQUIRED) if (!String(input[f] || '').trim()) errors[f] = 'Required';
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) errors.email = 'Invalid email';
  if (input.budget !== undefined && input.budget !== '' && !(Number(input.budget) >= 0))
    errors.budget = 'Must be a positive number';
  return errors;
}

export function sanitize(input) {
  const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
  const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => str(x, 40)).slice(0, 10);
  return {
    businessName: str(input.businessName, 80),
    contactName: str(input.contactName, 80),
    email: str(input.email, 120),
    phone: str(input.phone, 30),
    industry: str(input.industry, 60),
    wilaya: str(input.wilaya, 60),
    targetAudience: str(input.targetAudience, 300),
    description: str(input.description, 1500),
    budget: Number(input.budget) || 0,
    tone: str(input.tone, 20) || 'bold',
    goals: arr(input.goals),
    channels: arr(input.channels),
  };
}

export function createClient(input) {
  const client = sanitize(input);
  const now = new Date().toISOString();
  const rec = store.insert({
    id: `akma_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    provider: aiProvider(),
    client,
    steps: STEPS.map((s) => ({ ...s, status: 'pending' })),
    log: [],
    results: {},
  });
  // Fire and forget – the dashboard follows progress via SSE / polling.
  runWorkflow(rec.id).catch((err) => console.error('[workflow]', err));
  return rec;
}

export async function runWorkflow(id) {
  const rec = store.get(id);
  if (!rec) return;
  const { client } = rec;
  store.update(id, { status: 'running', results: {}, error: null });
  store.update(id, (r) => ({ steps: r.steps.map((s) => ({ ...s, status: 'pending' })) }));

  try {
    // 1. Client form received
    setStep(id, 'form', 'done');
    log(id, `Form received from ${client.contactName} (${client.businessName}).`);

    // 2. Automation workflow triggered
    setStep(id, 'workflow', 'running');
    await sleep(STEP_DELAY);
    log(id, `Workflow triggered · AI provider: ${aiProvider()}`);
    setStep(id, 'workflow', 'done');

    // 3. Core AI analysis
    setStep(id, 'ai', 'running');
    await sleep(STEP_DELAY);
    const core = await coreAnalysis(client);
    store.update(id, (r) => ({ results: { ...r.results, core } }));
    log(id, `AI analysis complete · readiness ${core.readinessScore}/100 (${core.businessStage}).`);
    setStep(id, 'ai', 'done');

    // 4. Three branches in parallel
    const branch = async (key, fn, label) => {
      setStep(id, key, 'running');
      await sleep(STEP_DELAY * (1 + Math.random()));
      try {
        const out = await fn(client, core);
        store.update(id, (r) => ({ results: { ...r.results, [key]: out } }));
        log(id, `${label} generated.`);
        setStep(id, key, 'done');
      } catch (err) {
        log(id, `${label} failed: ${err.message}`);
        setStep(id, key, 'error', { error: err.message });
        throw err;
      }
    };
    await Promise.all([
      branch('analysis', analysisReport, 'Analysis report'),
      branch('marketing', marketingPlan, 'Marketing plan'),
      branch('content', contentPack, 'Content pack'),
    ]);

    // 5. Dashboard ready
    setStep(id, 'dashboard', 'done');
    store.update(id, { status: 'completed', completedAt: new Date().toISOString() });
    log(id, 'All deliverables published to the dashboard ✅');
  } catch (err) {
    store.update(id, { status: 'failed', error: err.message });
    log(id, `Workflow failed: ${err.message}`);
  }
  events.emit('update', store.get(id));
}
