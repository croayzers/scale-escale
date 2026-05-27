export const PLAN_CATALOG = {
  free_lite: {
    code: 'free_lite',
    name: 'Free Lite',
    monthlyPriceEur: 0,
    audience: 'particular',
    stripe_price_monthly: null,
    stripe_price_yearly:  null,
    ui: {
      forceEscaleBranding: true,
      showUpgradePopup: true
    },
    features: {
      ownLogo: false,
      pdfExport: false,
      emailPdfToOwner: false,
      emailPdfToClient: false,
      supplierExcelImport: false,
      crmIntegration: false,
      erpIntegration: false,
      sharepointIntegration: false,
      companyReporting: false
    }
  },
  pro: {
    code: 'pro',
    name: 'PRO',
    monthlyPriceEur: 34,
    audience: 'freelance',
    stripe_price_monthly: 'price_1TZqIGJXIT1cvBSGaokiITj1',
    stripe_price_yearly:  'price_1TZqOvJXIT1cvBSG8h9NReP9',
    ui: {
      forceEscaleBranding: false,
      showUpgradePopup: true
    },
    features: {
      ownLogo: true,
      pdfExport: true,
      emailPdfToOwner: true,
      emailPdfToClient: false,
      supplierExcelImport: true,
      crmIntegration: false,
      erpIntegration: false,
      sharepointIntegration: false,
      companyReporting: true
    }
  },
  premium: {
    code: 'premium',
    name: 'PRO Unlimited',
    monthlyPriceEur: 120,
    audience: 'teams',
    stripe_price_monthly: 'price_1TZqLAJXIT1cvBSGJKY9zsGF',
    stripe_price_yearly:  'price_1TZqMIJXIT1cvBSGOTV5f61x',
    ui: {
      forceEscaleBranding: false,
      showUpgradePopup: true
    },
    features: {
      ownLogo: true,
      pdfExport: true,
      emailPdfToOwner: true,
      emailPdfToClient: false,
      supplierExcelImport: true,
      crmIntegration: false,
      erpIntegration: false,
      sharepointIntegration: false,
      companyReporting: true
    }
  }
};

export function getPlanDefinition(planCode) {
  return PLAN_CATALOG[planCode] || PLAN_CATALOG.free_lite;
}
