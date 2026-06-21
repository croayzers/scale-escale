// toolsRegistry.js — Registro de herramientas del Hub de E-scale.
// Ampliar es trivial: añade un objeto al array. Cada item:
//   { id, name, icon (nombre lucide), description, color, status }
//   status: 'available' (clicable) | 'soon' (gris, badge "Próximamente")
export const toolsRegistry = [
  {
    id: 'planos',
    name: 'Planos',
    icon: 'layout-template',
    description: 'Editor de planos 3D para eventos y montajes',
    color: '#2563eb',
    status: 'available',
  },
  {
    id: 'qr',
    name: 'Generador de QR',
    icon: 'qr-code',
    description: 'Crea códigos QR para enlaces, contactos y wifi',
    color: '#16a34a',
    status: 'available',
  },
  {
    id: 'cuestionario',
    name: 'Cuestionario',
    icon: 'clipboard-list',
    description: 'Formularios y encuestas para clientes',
    color: '#9333ea',
    status: 'soon',
  },
];

export default toolsRegistry;
