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
    highlights: [
      '1 proyecto activo',
      'Hasta 50 elementos por plano',
      'Catálogo básico (2 categorías)',
      'Exportación PNG',
      '1 usuario'
    ],
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
    highlights: [
      'Proyectos ilimitados',
      'Elementos ilimitados',
      'Catálogo completo',
      'Exportación PDF',
      'Logo propio en documentos',
      'Inventario automático',
      'Compartir planning con clientes',
      '2 usuarios del equipo'
    ],
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
    checkoutUrl: 'https://buy.stripe.com/test_8x214o1mJ7BkdZW36S3Ru01',
    ui: {
      forceEscaleBranding: false,
      showUpgradePopup: true
    },
    highlights: [
      'Todo lo incluido en PRO',
      '1 licencia · hasta 10 personas',
      'Ahorro +200% al año vs. licencias individuales',
      'Usuarios del equipo ilimitados',
      'Edición simultánea en tiempo real',
      'Sincronización Cloud',
      'Historial de versiones'
    ],
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

export const PLAN_COMPARE_ROWS = [
  { label: 'Proyectos activos',          values: { free_lite: '1 proyecto',           pro: 'Ilimitados',   premium: 'Ilimitados' } },
  { label: 'Elementos por plano',        values: { free_lite: 'Hasta 50',              pro: 'Ilimitados',   premium: 'Ilimitados' } },
  { label: 'Catálogo de elementos',      values: { free_lite: 'Básico (2 cat.)',        pro: 'Completo',     premium: 'Completo'   } },
  { label: 'Exportación PNG',            values: { free_lite: 'check',                 pro: 'check',        premium: 'check'      } },
  { label: 'Exportación PDF',            values: { free_lite: 'dash',                  pro: 'check',        premium: 'check'      } },
  { label: 'Inventario automático',      values: { free_lite: 'dash',                  pro: 'check',        premium: 'check'      } },
  { label: 'Compartir planning',         values: { free_lite: 'dash',                  pro: 'check',        premium: 'check'      } },
  { label: 'Usuarios del equipo',        values: { free_lite: '1',                     pro: '2',            premium: 'Ilimitados' } },
  { label: 'Edición simultánea',         values: { free_lite: 'dash',                  pro: 'dash',         premium: 'check'      } },
  { label: 'Sincronización Cloud',       values: { free_lite: 'dash',                  pro: 'dash',         premium: 'check'      } },
  { label: 'Historial de versiones',     values: { free_lite: 'dash',                  pro: 'dash',         premium: 'check'      } },
  { label: 'Logo propio',                values: { free_lite: 'dash',                  pro: 'check',        premium: 'check'      } }
];

export function getPlanDefinition(planCode) {
  return PLAN_CATALOG[planCode] || PLAN_CATALOG.free_lite;
}
