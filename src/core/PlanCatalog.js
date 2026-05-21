export const PLAN_CATALOG = {
  free_lite: {
    code: 'free_lite',
    name: 'Free Lite',
    monthlyPriceEur: 0,
    audience: 'particular',
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
    name: 'Premium',
    monthlyPriceEur: 120,
    audience: 'company',
    ui: {
      forceEscaleBranding: false,
      showUpgradePopup: true
    },
    features: {
      ownLogo: true,
      pdfExport: true,
      emailPdfToOwner: true,
      emailPdfToClient: true,
      supplierExcelImport: true,
      crmIntegration: true,
      erpIntegration: true,
      sharepointIntegration: true,
      companyReporting: true
    }
  }
};

export function getPlanDefinition(planCode) {
  return PLAN_CATALOG[planCode] || PLAN_CATALOG.free_lite;
}
