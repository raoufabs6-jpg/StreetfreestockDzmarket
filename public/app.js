// AKMA Automation – frontend (vanilla JS, hash router)
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const dzd = (n) => `${Math.round(n || 0).toLocaleString('fr-DZ')} DZD`;
const api = async (url, opts = {}) => {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || res.statusText), { body });
  return body;
};

const WILAYAS = ['Adrar','Chlef','Laghouat','Oum El Bouaghi','Batna','Béjaïa','Biskra','Béchar','Blida','Bouira','Tamanrasset','Tébessa','Tlemcen','Tiaret','Tizi Ouzou','Alger','Djelfa','Jijel','Sétif','Saïda','Skikda','Sidi Bel Abbès','Annaba','Guelma','Constantine','Médéa','Mostaganem',"M'Sila",'Mascara','Ouargla','Oran','El Bayadh','Illizi','Bordj Bou Arréridj','Boumerdès','El Tarf','Tindouf','Tissemsilt','El Oued','Khenchela','Souk Ahras','Tipaza','Mila','Aïn Defla','Naâma','Aïn Témouchent','Ghardaïa','Relizane','Timimoun','Bordj Badji Mokhtar','Ouled Djellal','Béni Abbès','In Salah','In Guezzam','Touggourt','Djanet',"El M'Ghair",'El Meniaa'];

// ---------------------------------------------------------------- live updates
let listeners = new Set();
const es = new EventSource('/api/events');
es.onmessage = (e) => listeners.forEach((fn) => fn(JSON.parse(e.data)));
const onLive = (fn) => (listeners.add(fn), () => listeners.delete(fn));
let cleanup = () => {};

api('/api/health').then((h) => ($('#provider').textContent = `AI: ${h.provider}`)).catch(() => {});

// ---------------------------------------------------------------- router
async function route() {
  cleanup();
  cleanup = () => {};
  const [, page, id] = location.hash.split('/');
  document.querySelectorAll('[data-nav]').forEach((a) =>
    a.classList.toggle('active', a.dataset.nav === (page === 'new' ? 'new' : page ? '' : 'dashboard'))
  );
  if (page === 'new') return renderForm();
  if (page === 'client' && id) return renderClient(id);
  return renderDashboard();
}
window.addEventListener('hashchange', route);
route();

// ================================================================ FORM
function renderForm() {
  app.replaceChildren($('#tpl-form').content.cloneNode(true));
  $('#wilayas').innerHTML = WILAYAS.map((w) => `<option value="${esc(w)}">`).join('');
  const form = $('#client-form');

  $('#fill-demo').onclick = () => {
    const demo = {
      businessName: 'Street Free Stock DZ', industry: 'Streetwear', wilaya: 'Alger', budget: 80000,
      description: 'Oversized tees, hoodies and cargo pants designed in Algiers. Limited drops every month, cash on delivery to 58 wilayas.',
      targetAudience: 'Young men & women 18-28 in Algiers, Oran and Constantine, into hip-hop and football culture',
      contactName: 'Raouf', email: 'raouf@example.com', phone: '0555 00 00 00', tone: 'bold',
    };
    for (const [k, v] of Object.entries(demo)) form.elements[k].value = v;
    form.querySelectorAll('[name=channels]').forEach((c) => (c.checked = ['instagram', 'tiktok', 'ouedkniss'].includes(c.value)));
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    form.querySelectorAll('.err').forEach((n) => n.remove());
    form.querySelectorAll('.invalid').forEach((n) => n.classList.remove('invalid'));
    const fd = new FormData(form);
    const data = Object.fromEntries([...fd.keys()].map((k) => [k, ['goals', 'channels'].includes(k) ? fd.getAll(k) : fd.get(k)]));
    data.goals ??= [];
    data.channels ??= [];
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Submitting…';
    try {
      const rec = await api('/api/clients', { method: 'POST', body: JSON.stringify(data) });
      location.hash = `#/client/${rec.id}`;
    } catch (err) {
      for (const [field, msg] of Object.entries(err.body?.errors || {})) {
        const input = form.elements[field];
        input?.classList.add('invalid');
        input?.insertAdjacentHTML('afterend', `<small class="err">${esc(msg)}</small>`);
      }
      if (!err.body?.errors) alert(err.message);
      btn.disabled = false;
      btn.textContent = 'Run automation ⚡';
    }
  };
}

// ================================================================ DASHBOARD
async function renderDashboard() {
  const draw = async () => {
    const [stats, clients] = await Promise.all([api('/api/stats'), api('/api/clients')]);
    app.innerHTML = `
      <section class="hero row">
        <div><h1>Dashboard</h1><p>All client briefs processed by the AKMA automation pipeline.</p></div>
        <a class="primary btn" href="#/new">＋ New client</a>
      </section>
      <section class="stats">
        ${stat('Clients', stats.total)}
        ${stat('Completed', stats.completed)}
        ${stat('In progress', stats.running)}
        ${stat('Avg. readiness', stats.avgReadiness + '/100')}
        ${stat('Budgets managed', dzd(stats.totalBudget))}
      </section>
      ${clients.length ? `
      <div class="card table-wrap"><table>
        <thead><tr><th>Business</th><th>Industry</th><th>Wilaya</th><th>Budget</th><th>Readiness</th><th>Status</th><th></th></tr></thead>
        <tbody>${clients.map(row).join('')}</tbody>
      </table></div>` : `
      <div class="card empty">
        <p>No clients yet.</p><a class="primary btn" href="#/new">Submit the first client form →</a>
      </div>`}`;
  };
  await draw();
  let t;
  cleanup = onLive(() => { clearTimeout(t); t = setTimeout(draw, 250); });
}
const stat = (label, value) => `<div class="card stat"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
const badge = (s) => `<span class="badge ${esc(s)}">${esc(s)}</span>`;
const row = (c) => `
  <tr onclick="location.hash='#/client/${c.id}'">
    <td><b>${esc(c.businessName)}</b><br><small>${new Date(c.createdAt).toLocaleString()}</small></td>
    <td>${esc(c.industry)}</td><td>${esc(c.wilaya || '—')}</td><td>${dzd(c.budget)}</td>
    <td>${c.readinessScore != null ? meter(c.readinessScore) : '—'}</td>
    <td>${c.status === 'running' ? `<div class="progress"><i style="width:${c.progress}%"></i></div>` : badge(c.status)}</td>
    <td>›</td>
  </tr>`;
const meter = (v) => `<div class="meter"><i style="width:${v}%;background:${v >= 70 ? 'var(--ok)' : v >= 45 ? 'var(--warn)' : 'var(--bad)'}"></i><span>${v}</span></div>`;

// ================================================================ CLIENT DETAIL
async function renderClient(id) {
  let tab = 'analysis';
  let rec;
  const draw = () => {
    const r = rec.results || {};
    app.innerHTML = `
      <section class="hero row">
        <div>
          <a href="#/" class="back">← Dashboard</a>
          <h1>${esc(rec.client.businessName)}</h1>
          <p>${esc(rec.client.industry)} · ${esc(rec.client.wilaya || 'Algeria')} · ${dzd(rec.client.budget)}/month · ${badge(rec.status)}</p>
        </div>
        <div class="btns">
          <button class="ghost" id="rerun" ${rec.status === 'running' ? 'disabled' : ''}>↻ Re-run</button>
          <button class="ghost" id="export" ${rec.status !== 'completed' ? 'disabled' : ''}>⬇ Export JSON</button>
          <button class="ghost danger" id="del">Delete</button>
        </div>
      </section>
      ${pipeline(rec)}
      ${r.core ? coreCard(r.core) : ''}
      ${rec.status === 'completed' || r.analysis || r.marketing || r.content ? `
        <div class="tabs">
          ${[['analysis', '🧠 AI Analysis'], ['marketing', '📈 Marketing Plan'], ['content', '🎬 Content']]
            .map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'active' : ''}" ${r[k] ? '' : 'disabled'}>${l}</button>`).join('')}
        </div>
        <div class="tab-body">${r[tab] ? { analysis: analysisView, marketing: marketingView, content: contentView }[tab](r[tab]) : '<div class="card muted">Generating…</div>'}</div>` : ''}
      <details class="card log"><summary>Workflow log (${rec.log.length})</summary>
        <ul>${rec.log.map((l) => `<li><time>${new Date(l.at).toLocaleTimeString()}</time> ${esc(l.message)}</li>`).join('')}</ul>
      </details>`;

    app.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; draw(); }));
    $('#rerun').onclick = async () => { await api(`/api/clients/${id}/rerun`, { method: 'POST' }); };
    $('#del').onclick = async () => {
      if (!confirm('Delete this client and all generated deliverables?')) return;
      await api(`/api/clients/${id}`, { method: 'DELETE' });
      location.hash = '#/';
    };
    $('#export').onclick = () => {
      const blob = new Blob([JSON.stringify(rec, null, 2)], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `akma-${rec.client.businessName}.json` });
      a.click();
    };
    app.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => {
      navigator.clipboard?.writeText(b.dataset.copy);
      b.textContent = '✓';
      setTimeout(() => (b.textContent = '⧉'), 1000);
    }));
  };

  try { rec = await api(`/api/clients/${id}`); } catch {
    app.innerHTML = `<div class="card empty"><p>Client not found.</p><a href="#/" class="btn primary">Back to dashboard</a></div>`;
    return;
  }
  draw();
  cleanup = onLive(async (s) => { if (s.id === id) { rec = await api(`/api/clients/${id}`); draw(); } });
}

// ---- pipeline diagram (mirrors the AKMA flow chart)
function pipeline(rec) {
  const s = Object.fromEntries(rec.steps.map((x) => [x.key, x]));
  const node = (k, icon) => `<div class="node ${s[k].status}"><span class="ic">${icon}</span>${esc(s[k].label)}<em>${s[k].status}</em></div>`;
  const arrow = (k) => `<div class="arrow ${s[k].status !== 'pending' ? 'lit' : ''}"></div>`;
  return `
    <section class="card pipeline">
      ${node('form', '📝')}${arrow('workflow')}
      ${node('workflow', '⚙️')}${arrow('ai')}
      ${node('ai', '🤖')}
      <div class="fork ${s.ai.status === 'done' ? 'lit' : ''}"></div>
      <div class="branches">${node('analysis', '🧠')}${node('marketing', '📈')}${node('content', '🎬')}</div>
      <div class="fork join ${s.dashboard.status === 'done' ? 'lit' : ''}"></div>
      ${node('dashboard', '📊')}
    </section>`;
}

function coreCard(c) {
  return `
    <section class="card core">
      <div class="gauge" style="--v:${c.readinessScore}"><b>${c.readinessScore}</b><span>readiness</span></div>
      <div>
        <h3>AI Analysis · ${esc(c.businessStage)} <small class="src">${esc(c._source || '')}</small></h3>
        <p>${esc(c.summary)}</p>
        <div class="bars">${Object.entries(c.scores || {}).map(([k, v]) => `<label>${esc(k)}${meter(v)}</label>`).join('')}</div>
      </div>
    </section>`;
}

const list = (arr) => `<ul>${(arr || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;

function analysisView(a) {
  const sw = a.swot || {};
  return `
    <div class="grid2">
      <div class="card swot s"><h4>Strengths</h4>${list(sw.strengths)}</div>
      <div class="card swot w"><h4>Weaknesses</h4>${list(sw.weaknesses)}</div>
      <div class="card swot o"><h4>Opportunities</h4>${list(sw.opportunities)}</div>
      <div class="card swot t"><h4>Threats</h4>${list(sw.threats)}</div>
    </div>
    <div class="grid2">
      <div class="card"><h4>👤 Persona · ${esc(a.persona?.name)} (${esc(a.persona?.age)}, ${esc(a.persona?.location)})</h4>
        <p>${esc(a.persona?.description)}</p>
        <div class="grid2 tight"><div><b>Motivations</b>${list(a.persona?.motivations)}</div><div><b>Objections</b>${list(a.persona?.objections)}</div></div>
      </div>
      <div class="card"><h4>📡 Channel fit</h4>
        ${(a.recommendedChannels || []).map((c) => `<label class="chan">${esc(c.channel)} ${c.active ? '<small class="badge completed">active</small>' : ''}${meter(c.fit)}</label>`).join('')}
      </div>
    </div>
    <div class="card"><h4>💡 Key insights</h4>${list(a.insights)}</div>`;
}

function marketingView(m) {
  const alloc = m.budget?.allocation || [];
  const colors = ['#7c5cff', '#22d3ee', '#f472b6', '#facc15', '#34d399', '#fb923c', '#60a5fa'];
  let acc = 0;
  const conic = alloc.map((a, i) => `${colors[i % colors.length]} ${acc}% ${(acc += a.percent)}%`).join(',');
  return `
    <div class="card"><h4>🎯 ${esc(m.objective)}</h4><p>${esc(m.strategy)}</p></div>
    <div class="grid2">
      <div class="card"><h4>💰 Budget allocation · ${esc(m.budget?.label)}</h4>
        <div class="donut-wrap"><div class="donut" style="background:conic-gradient(${conic || '#333 0 100%'})"></div>
          <ul class="legend">${alloc.map((a, i) => `<li><i style="background:${colors[i % colors.length]}"></i>${esc(a.item)} <b>${esc(a.label)}</b> <small>${a.percent}%</small></li>`).join('')}</ul>
        </div>
      </div>
      <div class="card"><h4>📊 KPIs (30 days)</h4>
        <table class="kpi">${(m.kpis || []).map((k) => `<tr><td>${esc(k.metric)}</td><td><b>${esc(k.target)}</b></td></tr>`).join('')}</table>
      </div>
    </div>
    <div class="weeks">${(m.weeks || []).map((w) => `<div class="card week"><small>Week ${esc(w.week)}</small><h4>${esc(w.theme)}</h4>${list(w.actions)}</div>`).join('')}</div>`;
}

function contentView(c) {
  const copyBtn = (t) => `<button class="copy" data-copy="${esc(t)}" title="Copy">⧉</button>`;
  return `
    <div class="grid2">
      <div class="card"><h4>✍️ Captions <small>(${esc(c.tone)})</small></h4>
        <ol class="captions">${(c.captions || []).map((t) => `<li>${esc(t)} ${copyBtn(t)}</li>`).join('')}</ol>
        <h4>🇩🇿 Darija</h4><ul class="captions">${(c.darija || []).map((t) => `<li>${esc(t)} ${copyBtn(t)}</li>`).join('')}</ul>
      </div>
      <div class="card"><h4>📣 Ad copy</h4>
        <div class="ad"><b>${esc(c.adCopy?.headline)}</b><p>${esc(c.adCopy?.primaryText)}</p><span class="cta">${esc(c.adCopy?.cta)}</span></div>
        <h4># Hashtags ${copyBtn((c.hashtags || []).join(' '))}</h4>
        <div class="tags">${(c.hashtags || []).map((h) => `<span>${esc(h)}</span>`).join('')}</div>
        <h4>🎥 Reel / video ideas</h4>
        <ul>${(c.reelIdeas || []).map((r) => `<li><span class="badge">${esc(r.format)}</span> ${esc(r.idea)}</li>`).join('')}</ul>
      </div>
    </div>
    <div class="card"><h4>🗓 7-day content calendar</h4>
      <div class="calendar">${(c.calendar || []).map((d) => `<div><b>${esc(d.day)}</b><small>${esc(d.time)} · ${esc(d.format)}</small><p>${esc(d.topic)}</p></div>`).join('')}</div>
    </div>`;
}
