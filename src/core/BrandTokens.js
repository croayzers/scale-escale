export const ESCALE_BRAND_TOKENS = {
  appName: 'E-scale',
  legalName: 'E_scale',
  logoGlyph: 'E',
  fonts: {
    display: "'Fraunces', serif",
    body: "'Inter Tight', system-ui, sans-serif",
    mono: "'JetBrains Mono', monospace"
  },
  colors: {
    ink: '#0A0A0B',
    paper: '#F5F3EE',
    paperAlt: '#EBE7DF',
    line: '#1A1A1C',
    muted: '#6A6A6E',
    primary: '#2563EB',
    secondary: '#D4FF3A',
    logoFrom: '#273449',
    logoTo: '#1A2235',
    logoBorder: 'rgba(255,255,255,0.14)',
    logoInk: '#FFFFFF'
  },
  radii: {
    shell: '28px',
    panel: '14px',
    chip: '12px'
  }
};

export const PLAN_VISUAL_TOKENS = {
  free_lite: {
    code: 'free_lite',
    label: 'Lite',
    icon: 'zap',
    accent: '#2563EB',
    border: '#3B82F6',
    fill: '#F3F7FF',
    surface: 'rgba(37,99,235,0.08)',
    shadow: 'rgba(37,99,235,0.18)',
    badgeText: '#FFFFFF',
    badgeBg: 'linear-gradient(180deg, #4C8DFF 0%, #2563EB 100%)',
    buttonText: 'Plan actual'
  },
  pro: {
    code: 'pro',
    label: 'PRO',
    icon: 'zap',
    accent: '#FFB000',
    border: '#F59E0B',
    fill: '#FFF7DB',
    surface: 'rgba(245,158,11,0.1)',
    shadow: 'rgba(245,158,11,0.22)',
    badgeText: '#FFFFFF',
    badgeBg: 'linear-gradient(180deg, #FFCA5C 0%, #FF9A1F 100%)',
    buttonText: 'Actualizar a PRO'
  },
  premium: {
    code: 'premium',
    label: 'PRO Unlimited',
    icon: 'crown',
    accent: '#1D4ED8',
    border: '#1D4ED8',
    fill: '#EEF4FF',
    surface: 'rgba(29,78,216,0.08)',
    shadow: 'rgba(29,78,216,0.18)',
    badgeText: '#FFFFFF',
    badgeBg: 'linear-gradient(180deg, #2B66F6 0%, #1D4ED8 100%)',
    buttonText: 'Contactar'
  }
};

function setCssVar(root, key, value) {
  if (!root || value === undefined || value === null) return;
  root.style.setProperty(key, String(value));
}

export function getPlanVisual(planCode = 'free_lite') {
  return PLAN_VISUAL_TOKENS[planCode] || PLAN_VISUAL_TOKENS.free_lite;
}

export function applyBrandTheme(company = {}, root = document.documentElement) {
  const primary = company?.colorPrimary || ESCALE_BRAND_TOKENS.colors.primary;
  const secondary = company?.colorSecondary || ESCALE_BRAND_TOKENS.colors.secondary;

  setCssVar(root, '--brand-display-font', ESCALE_BRAND_TOKENS.fonts.display);
  setCssVar(root, '--brand-body-font', ESCALE_BRAND_TOKENS.fonts.body);
  setCssVar(root, '--brand-mono-font', ESCALE_BRAND_TOKENS.fonts.mono);
  setCssVar(root, '--brand-ink', ESCALE_BRAND_TOKENS.colors.ink);
  setCssVar(root, '--brand-paper', ESCALE_BRAND_TOKENS.colors.paper);
  setCssVar(root, '--brand-paper-alt', ESCALE_BRAND_TOKENS.colors.paperAlt);
  setCssVar(root, '--brand-line', ESCALE_BRAND_TOKENS.colors.line);
  setCssVar(root, '--brand-muted', ESCALE_BRAND_TOKENS.colors.muted);
  setCssVar(root, '--brand-primary', primary);
  setCssVar(root, '--brand-secondary', secondary);
  setCssVar(root, '--brand-logo-from', ESCALE_BRAND_TOKENS.colors.logoFrom);
  setCssVar(root, '--brand-logo-to', ESCALE_BRAND_TOKENS.colors.logoTo);
  setCssVar(root, '--brand-logo-border', ESCALE_BRAND_TOKENS.colors.logoBorder);
  setCssVar(root, '--brand-logo-ink', ESCALE_BRAND_TOKENS.colors.logoInk);
  setCssVar(root, '--brand-shell-radius', ESCALE_BRAND_TOKENS.radii.shell);
  setCssVar(root, '--brand-panel-radius', ESCALE_BRAND_TOKENS.radii.panel);
  setCssVar(root, '--brand-chip-radius', ESCALE_BRAND_TOKENS.radii.chip);

  Object.values(PLAN_VISUAL_TOKENS).forEach(plan => {
    const prefix = `--plan-${plan.code.replace('_lite', '-lite')}`;
    setCssVar(root, `${prefix}-accent`, plan.accent);
    setCssVar(root, `${prefix}-border`, plan.border);
    setCssVar(root, `${prefix}-fill`, plan.fill);
    setCssVar(root, `${prefix}-surface`, plan.surface);
    setCssVar(root, `${prefix}-shadow`, plan.shadow);
    setCssVar(root, `${prefix}-badge-bg`, plan.badgeBg);
    setCssVar(root, `${prefix}-badge-text`, plan.badgeText);
  });

  setCssVar(root, '--inventory-orbit-start', PLAN_VISUAL_TOKENS.pro.accent);
  setCssVar(root, '--inventory-orbit-end', '#FFE082');
}

window.ESCALE_BRAND_TOKENS = ESCALE_BRAND_TOKENS;
window.ESCALE_PLAN_VISUAL_TOKENS = PLAN_VISUAL_TOKENS;
