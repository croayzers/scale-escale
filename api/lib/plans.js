const PLAN_MAP = {
  free: 'free_lite',
  free_lite: 'free_lite',
  'free lite': 'free_lite',
  pro: 'pro',
  premium: 'premium'
};

const PLAN_NAMES = {
  free_lite: 'Free Lite',
  pro: 'PRO',
  premium: 'Premium'
};

function normalizePlanCode(value) {
  const raw = String(value || '').trim().toLowerCase();
  return PLAN_MAP[raw] || 'free_lite';
}

function planName(value) {
  return PLAN_NAMES[normalizePlanCode(value)] || 'Free Lite';
}

function requiredPlanForFeature(featureKey) {
  return {
    ownLogo: 'pro',
    pdfExport: 'pro',
    emailPdfToOwner: 'pro',
    emailPdfToClient: 'premium',
    supplierExcelImport: 'pro',
    crmIntegration: 'premium',
    erpIntegration: 'premium',
    sharepointIntegration: 'premium',
    companyReporting: 'pro'
  }[featureKey] || 'pro';
}

module.exports = {
  normalizePlanCode,
  planName,
  requiredPlanForFeature
};
