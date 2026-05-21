# E-scale · Planificador 3D de Eventos

Planificador 3D de eventos basado en Three.js. Arquitectura modular ES Modules, sin build step.

## Ejecutar en local

ES Modules requieren servidor HTTP — no abre con doble click.

```bash
# Python 3
python3 -m http.server 8000

# Node.js
npx serve .
```

Abre `http://localhost:8000`.

## Desplegar en GitHub Pages

1. Sube el proyecto a un repo de GitHub.
2. `Settings → Pages → Source: Deploy from branch → main / root`.
3. Rutas relativas (`elements.json`, `styles/*.css`, `src/**/*.js`) funcionan tal cual.

## Estructura

```
e-scale/
├── index.html              Shell HTML
├── elements.json           Catálogo editable de elementos
├── styles/                 CSS modularizado
│   ├── base.css
│   ├── layout.css
│   └── components.css
└── src/
    ├── main.js             Bootstrap + wiring
    ├── core/
    │   ├── AppState.js     Estado central + history + mutaciones
    │   └── ElementLibrary.js   Carga elements.json + render botones
    ├── scene/
    │   ├── SceneManager.js     Three.js: escena, cámaras, render, cotas, plano
    │   ├── InteractionManager.js   Raycaster, drag, atajos, context menu
    │   └── SnapManager.js      Snap a rejilla + atajo S
    ├── models/             ↳ UN ARCHIVO POR TIPO 3D
    │   ├── index.js        ModelFactory (registry type→builder)
    │   ├── colors.js
    │   ├── chair.js
    │   ├── mesa.js         Estándar, Napoleón, Presi
    │   ├── buffet.js
    │   ├── carpa.js
    │   └── carpaHelpers.js
    ├── ui/
    │   └── UIManager.js    Stats, tooltip, panel detalle editable
    └── io/                 ↳ Carga/exportación + configuración
        ├── PlanManager.js      Plano IMG/PDF/DXF + calibración
        ├── CompanyManager.js   Datos empresa + logo (localStorage)
        └── ExportManager.js    Export PDF 3D / Plano cenital
```

## Añadir un nuevo elemento

1. **Si ya existe ese `type`**: añádelo a `elements.json`. Cero código.
2. **Si es un `type` nuevo** (ej. `arbol`):
   - Crea `src/models/arbol.js` exportando `createArbol(item)`.
   - Regístralo en `src/models/index.js`:
     ```js
     import { createArbol } from './arbol.js';
     const builders = { …, arbol: createArbol };
     ```
   - Añade su definición en `elements.json`.

## Estado de las entregas

- **Entrega 1:** núcleo arrancable. Mesa, Buffet, Carpa. Drag/zoom/rotación R/snap/cotas/click derecho/undo.
- **Entrega 2:** panel detalle editable, plano IMG/PDF/DXF + calibración, exportación PDF (3D y plano cenital), configuración de empresa con logo.
- **Entrega 3 (actual):** rotación en pasos de 15°, toggle de sombras solo en ISO, categoría **Estructuras**: 4 Paredes, Arbusto, Árbol, Cable con luces (largo auto = nº × separación). Todos con menú contextual y panel editable de propiedades.

## Atajos

| Acción | Atajo |
|---|---|
| Seleccionar | Click izq. |
| Mover | Arrastrar |
| Rotar | R + mover ratón |
| Duplicar | Ctrl + Click |
| Eliminar | Supr / Del |
| Toggle snap | S |
| Undo (3 niveles) | Ctrl + Z |
| Cancelar / deseleccionar | Esc |

## Preparacion SaaS

El repo ya incluye una base de planificacion para pasar de prototipo local a SaaS:

- hoja de ruta: [docs/SAAS_ROADMAP.md](/C:/Users/rafa2/Documents/GitHub/E_scale/docs/SAAS_ROADMAP.md)
- checklist de plataformas: [docs/PLATFORM_SETUP.md](/C:/Users/rafa2/Documents/GitHub/E_scale/docs/PLATFORM_SETUP.md)
- variables de entorno: [.env.example](/C:/Users/rafa2/Documents/GitHub/E_scale/.env.example)
- esquema inicial Supabase: [supabase/schema.sql](/C:/Users/rafa2/Documents/GitHub/E_scale/supabase/schema.sql)
- catalogo de planes: [src/core/PlanCatalog.js](/C:/Users/rafa2/Documents/GitHub/E_scale/src/core/PlanCatalog.js)
- configuracion base Vercel: [vercel.json](/C:/Users/rafa2/Documents/GitHub/E_scale/vercel.json)

### Integracion API

Ademas de la hoja de ruta, el proyecto ya incluye una primera capa tecnica para servicios externos:

- runtime config publica: `api/public-config.js`
- bootstrap y sync cloud: `api/app/*`
- billing Stripe: `api/billing/*`
- email transaccional Resend: `api/email/*`
- analitica PostHog: `api/analytics/capture.js`
- servicios frontend: `src/services/*`

La app sigue funcionando en local sin esos servicios. Cuando faltan claves o endpoints, hace fallback limpio a modo local.
