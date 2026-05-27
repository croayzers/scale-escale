import { AppState } from '../core/AppState.js';
import { CloudApi } from '../services/CloudApi.js';
import { SubscriptionManager } from '../services/SubscriptionManager.js';

const FEEDBACK_TYPES = [
  '🐛 Error o fallo técnico',
  '📐 Fallo en el plano o escena',
  '📄 Problema con exportación',
  '📦 Problema con elementos o catálogo',
  '💳 Consulta sobre suscripción',
  '⚡ Problema de rendimiento o carga',
  '✨ Sugerencia de mejora',
  '💡 Idea o nueva funcionalidad',
  '❓ Pregunta o duda general',
];

let _state = 'idle'; // idle | sending | success | error
let _autoTriggered = false;
let _lastType = '';
let _lastMessage = '';

function modal() { return document.getElementById('feedback-modal'); }
function typeEl()  { return document.getElementById('feedback-type'); }
function bodyEl()  { return document.getElementById('feedback-body'); }
function submitEl(){ return document.getElementById('feedback-submit'); }

function buildMeta() {
  const company = AppState.company;
  return {
    company: company.name || '',
    name:    company.authDisplayName || '',
    email:   company.authEmail || company.email || '',
    plan:    SubscriptionManager.currentPlan()?.name || '',
    logo:    company.logoFileName || company.logoRelativePath || '',
  };
}

function setState(s) {
  _state = s;
  const root = modal();
  if (!root) return;
  root.querySelectorAll('[data-feedback-state]').forEach(el => {
    el.hidden = !el.dataset.feedbackState.split(',').includes(s);
  });
}

function resetForm() {
  const t = typeEl(), b = bodyEl();
  if (t) t.value = '';
  if (b) b.value = '';
  setState('idle');
}

export function open(opts = {}) {
  const root = modal();
  if (!root) return;
  resetForm();
  if (opts.autoTriggered) {
    root.querySelector('[data-feedback-auto-msg]')?.removeAttribute('hidden');
  } else {
    root.querySelector('[data-feedback-auto-msg]')?.setAttribute('hidden', '');
  }
  root.classList.add('visible');
}

export function close() {
  modal()?.classList.remove('visible');
}

function openMailtoFallback() {
  const subject = encodeURIComponent(`[E-scale] ${_lastType || 'Feedback'}`);
  const meta    = buildMeta();
  const footer  = [
    meta.company ? `Empresa: ${meta.company}` : '',
    meta.name    ? `Nombre:  ${meta.name}`    : '',
    meta.email   ? `Email:   ${meta.email}`   : '',
    meta.plan    ? `Plan:    ${meta.plan}`     : '',
  ].filter(Boolean).join('\n');
  const body = encodeURIComponent(
    (_lastMessage || '') + (footer ? `\n\n---\n${footer}` : '')
  );
  window.open(`mailto:Rafa27x26@gmail.com?subject=${subject}&body=${body}`, '_self');
}

async function submit() {
  const type    = typeEl()?.value?.trim();
  const message = bodyEl()?.value?.trim();
  if (!type)    { typeEl()?.focus();  return; }
  if (!message) { bodyEl()?.focus();  return; }

  _lastType    = type;
  _lastMessage = message;

  setState('sending');
  try {
    const result = await CloudApi.sendFeedback({ type, message, meta: buildMeta() });
    if (result?.skipped) {
      setState('error');
      return;
    }
    setState('success');
  } catch {
    setState('error');
  }
}

export function init() {
  const root = modal();
  if (!root) return;

  // Populate type select
  const sel = typeEl();
  if (sel && !sel.options.length) {
    sel.innerHTML = '<option value="">Selecciona el tipo de consulta…</option>' +
      FEEDBACK_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
  }

  root.addEventListener('click', e => {
    if (e.target === root) close();
  });
  document.getElementById('feedback-close')?.addEventListener('click', close);
  document.getElementById('feedback-cancel')?.addEventListener('click', close);
  submitEl()?.addEventListener('click', submit);
  document.getElementById('feedback-retry')?.addEventListener('click', resetForm);
  document.getElementById('feedback-mailto')?.addEventListener('click', openMailtoFallback);
  document.getElementById('feedback-done')?.addEventListener('click', close);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && root.classList.contains('visible')) close();
  });

  // Auto-trigger after export (with 1.5s delay so the download starts first)
  document.addEventListener('escale:export-done', () => {
    if (_autoTriggered) return;
    _autoTriggered = true;
    setTimeout(() => { _autoTriggered = false; open({ autoTriggered: true }); }, 1500);
  });
}

export const FeedbackModal = { init, open, close };
