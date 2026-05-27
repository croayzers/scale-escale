import { PLAN_CATALOG, PLAN_COMPARE_ROWS } from '../core/PlanCatalog.js';
import { getPlanVisual } from '../core/BrandTokens.js';
import { SubscriptionManager } from '../services/SubscriptionManager.js';
import { AppState } from '../core/AppState.js';

const PLAN_ORDER = ['free_lite', 'pro', 'premium'];

let preferredPlanCode = 'pro';

function normalizePlanCode(planCode = 'pro') {
  const code = String(planCode || 'pro').toLowerCase();
  return PLAN_CATALOG[code] ? code : 'pro';
}

function modal() {
  return document.getElementById('plans-modal');
}

function formatPlanPrice(planCode) {
  const plan = PLAN_CATALOG[planCode];
  if (!plan || !plan.monthlyPriceEur) return 'Gratis';
  return `\u20ac${plan.monthlyPriceEur}`;
}

function formatCell(value) {
  if (value === 'check') return '<span class="plans-check" aria-label="Incluido">\u2713</span>';
  if (value === 'dash') return '<span class="plans-dash" aria-hidden="true">\u2014</span>';
  return `<span>${value}</span>`;
}

function cardButtonLabel(planCode, currentPlanCode) {
  if (planCode === 'free_lite') {
    return currentPlanCode === 'free_lite' ? 'Plan actual' : 'Volver a Lite';
  }
  if (currentPlanCode === planCode) return 'Gestionar plan';
  if (currentPlanCode === 'premium' && planCode === 'pro') return 'Gestionar plan';
  return getPlanVisual(planCode).buttonText;
}

function cardButtonState(planCode, currentPlanCode) {
  if (planCode === 'free_lite') return currentPlanCode === 'free_lite' ? 'current' : 'locked';
  if (currentPlanCode === planCode || (currentPlanCode === 'premium' && planCode === 'pro')) return 'current';
  return 'upgrade';
}

function renderCards(currentPlanCode) {
  return PLAN_ORDER.map(planCode => {
    const visual = getPlanVisual(planCode);
    const plan = PLAN_CATALOG[planCode];
    const state = cardButtonState(planCode, currentPlanCode);
    const buttonLabel = cardButtonLabel(planCode, currentPlanCode);
    const badgeText = planCode === 'free_lite' ? 'Lite' : plan.name;
    const eyebrow = planCode === 'pro'
      ? '<div class="plans-card-popular">M\u00e1s popular</div>'
      : '';
    const priceMarkup = planCode === 'free_lite'
      ? '<div class="plans-card-price">Gratis</div><div class="plans-card-subcopy">Gratis para siempre</div>'
      : planCode === 'premium'
        ? `<div class="plans-card-price">${formatPlanPrice(planCode)} <small>+ iva</small></div><div class="plans-card-subcopy">/ mes \u00b7 para equipos</div>`
        : `<div class="plans-card-price">${formatPlanPrice(planCode)} <small>+ iva</small></div><div class="plans-card-subcopy">/ mes \u00b7 facturado mensualmente</div>`;

    const highlightsHtml = (plan.highlights || []).map(h =>
      `<li class="plans-card-highlight-item">${h}</li>`
    ).join('');

    const paramsRows = [
      `<div class="plans-card-param"><span>C\u00f3digo</span><code>${planCode}</code></div>`,
      `<div class="plans-card-param"><span>Precio</span><code>${plan.monthlyPriceEur ? `\u20ac${plan.monthlyPriceEur}/mes` : 'Gratis'}</code></div>`,
      `<div class="plans-card-param"><span>Color</span><span class="plans-card-param-swatch" style="background:${visual.accent}"></span><code>${visual.accent}</code></div>`,
      plan.checkoutUrl
        ? `<div class="plans-card-param"><span>Checkout</span><a class="plans-card-param-url" href="${plan.checkoutUrl}" target="_blank" rel="noopener">Stripe \u2197</a></div>`
        : plan.stripe_price_monthly
          ? `<div class="plans-card-param"><span>Price ID</span><code>${plan.stripe_price_monthly}</code></div>`
          : ''
    ].filter(Boolean).join('');

    return `
      <section
        class="plans-card ${planCode === preferredPlanCode ? 'is-focused' : ''} ${state === 'current' ? 'is-current' : ''}"
        data-plan-card="${planCode}"
        data-plan-code="${planCode}"
      >
        ${eyebrow}
        <div class="plans-card-badge" data-plan-visual="${planCode}">
          <span class="plans-card-badge-icon">${visual.icon === 'crown' ? '\u265b' : '\u26a1'}</span>
          <span>${badgeText}</span>
        </div>
        ${priceMarkup}
        <ul class="plans-card-highlights" aria-label="Ventajas del plan ${plan.name}">
          ${highlightsHtml}
        </ul>
        <details class="plans-card-details">
          <summary class="plans-card-details-toggle">Ver par\u00e1metros</summary>
          <div class="plans-card-params">${paramsRows}</div>
        </details>
        <button
          type="button"
          class="plans-card-cta ${state === 'current' ? 'is-current' : ''}"
          data-plan-cta="${planCode}"
        >
          ${buttonLabel}
        </button>
      </section>
    `;
  }).join('');
}

function renderTable() {
  const labels = {
    free_lite: 'Lite',
    pro: 'PRO',
    premium: 'PRO Unlimited'
  };
  return PLAN_COMPARE_ROWS.map(row => `
    <div class="plans-table-row">
      <div class="plans-table-cell is-label">${row.label}</div>
      ${PLAN_ORDER.map(planCode => `
        <div class="plans-table-cell" data-plan-column="${planCode}" data-plan-label="${labels[planCode]}">
          ${formatCell(row.values[planCode])}
        </div>
      `).join('')}
    </div>
  `).join('');
}

function render() {
  const root = modal();
  if (!root) return;

  const currentPlanCode = SubscriptionManager.currentPlanCode();
  const currentPlan = SubscriptionManager.currentPlan();
  const cards = root.querySelector('#plans-modal-cards');
  const tableBody = root.querySelector('#plans-modal-table-body');
  const meta = root.querySelector('#plans-modal-meta');

  if (cards) cards.innerHTML = renderCards(currentPlanCode);
  if (tableBody) tableBody.innerHTML = renderTable();
  if (meta) meta.textContent = `Plan actual: ${currentPlan.name}`;

  if (window.lucide) lucide.createIcons();
}

function contactPremium() {
  const confirmed = window.confirm(
    '¿Quieres contactar con E-scale para contratar el Plan PRO Unlimited?\n\n' +
    'Se abrirá tu cliente de correo con un mensaje listo para enviar.'
  );
  if (!confirmed) return;

  const name    = AppState.company.authDisplayName || AppState.company.name || '';
  const email   = AppState.company.authEmail || AppState.company.email || '';
  const company = AppState.company.name || '';
  const logo    = AppState.company.logoFileName || AppState.company.logoRelativePath || '';

  const subject = encodeURIComponent('Solicitud de contratación — Plan PRO Unlimited E-scale');
  const body = encodeURIComponent(
    'Hola,\n\n' +
    'Me pongo en contacto porque estoy interesado/a en contratar el Plan PRO Unlimited de E-scale para mi equipo.\n\n' +
    'Mis datos de contacto:\n' +
    (name    ? `  Nombre:   ${name}\n`    : '') +
    (email   ? `  Email:    ${email}\n`   : '') +
    (company ? `  Empresa:  ${company}\n` : '') +
    (logo    ? `  Logo:     ${logo}\n`    : '') +
    '\nQuedo a vuestra disposición para cualquier consulta sobre usuarios, precios de equipo o condiciones del plan.\n\n' +
    'Un saludo.'
  );

  window.open(`mailto:Rafa27x26@gmail.com?subject=${subject}&body=${body}`, '_self');
}

async function handlePlanAction(planCode) {
  const currentPlanCode = SubscriptionManager.currentPlanCode();
  if (planCode === 'free_lite') {
    close();
    return;
  }

  if (currentPlanCode === planCode || (currentPlanCode === 'premium' && planCode === 'pro')) {
    await SubscriptionManager.openCustomerPortal();
    return;
  }

  if (planCode === 'premium') {
    const checkoutUrl = PLAN_CATALOG.premium.checkoutUrl;
    if (checkoutUrl) {
      window.open(checkoutUrl, '_blank', 'noopener');
    } else {
      contactPremium();
    }
    return;
  }

  await SubscriptionManager.openCheckout(planCode);
}

function bindActions() {
  const root = modal();
  if (!root || root.dataset.bound === 'true') return;
  root.dataset.bound = 'true';

  root.addEventListener('click', event => {
    const closeButton = event.target.closest('[data-plans-close]');
    if (closeButton || event.target === root) {
      close();
      return;
    }

    const cta = event.target.closest('[data-plan-cta]');
    if (cta) {
      void handlePlanAction(normalizePlanCode(cta.dataset.planCta));
      return;
    }

    const card = event.target.closest('[data-plan-card]');
    if (card && !event.target.closest('.plans-card-details')) {
      preferredPlanCode = normalizePlanCode(card.dataset.planCode);
      render();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && root.classList.contains('visible')) close();
  });
}

function open(planCode = 'pro') {
  preferredPlanCode = normalizePlanCode(planCode);
  render();
  const root = modal();
  if (!root) return;
  document.dispatchEvent(new CustomEvent('escale:scene-overlay-open', {
    detail: { kind: 'plans', key: preferredPlanCode }
  }));
  root.classList.add('visible');
}

function close() {
  modal()?.classList.remove('visible');
}

function init() {
  bindActions();
  document.addEventListener('escale:plan-changed', render);
}

export const PlansModal = {
  init,
  open,
  close,
  render
};
