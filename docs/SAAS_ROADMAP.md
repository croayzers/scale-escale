# E-scale SaaS Roadmap

## Estado actual

Hoy el proyecto parte de una base valida para prototipo avanzado, pero no de una base SaaS todavia:

- frontend estatico en [index.html](/C:/Users/rafa2/Documents/GitHub/E_scale/index.html)
- arquitectura modular ES Modules sin build step
- servidor local simple en [server.py](/C:/Users/rafa2/Documents/GitHub/E_scale/server.py)
- configuracion de empresa en `localStorage`
- exportacion PDF en cliente
- dashboard temporal en Excel y API local en Python
- sin multiusuario real, sin autenticacion productiva, sin control de licencias, sin facturacion y sin backend cloud

La buena noticia es que el nucleo 3D ya existe. El salto no es "hacer otra app", sino envolver el motor actual con capas de producto, datos, pagos y permisos.

## Arquitectura objetivo

### Capa de producto

- `Frontend app`: Vercel
- `API + Auth + DB + Storage`: Supabase
- `Cobros y suscripciones`: Stripe + Stripe Tax
- `Emails transaccionales`: Resend
- `PDF servidor`: Vercel Function con Puppeteer o Browserless
- `Analitica`: PostHog
- `Soporte`: Crisp
- `Dominio`: Cloudflare o Namecheap

### Principio rector

Mantener el motor 3D actual y mover fuera del navegador lo que debe ser autoritativo:

- usuarios
- organizaciones
- logos
- planes
- permisos
- exportaciones
- envios email
- integraciones externas

## Planes de producto

### `Free Lite` - `0 EUR`

Publico:
- particular
- pareja / novia / familia
- planificacion puntual de un evento

Objetivo:
- adquisicion
- demostracion del valor
- viralidad y conversion

Experiencia:
- branding visible de E-scale
- pop-up de upgrade y ventajas
- sin exportaciones PDF
- sin logo propio
- sin conectores
- guardado basico de configuracion

### `PRO` - `34 EUR / mes`

Publico:
- freelance
- wedding planner
- decorador
- tecnico comercial pequeño

Objetivo:
- propuesta profesional
- entregables al cliente
- operativa con Excel

Experiencia:
- logo propio
- exportacion PDF
- envio del PDF al email del usuario
- importacion de precios de proveedores por Excel
- dashboard de actividad basico
- sin integraciones enterprise

### `Premium` - `120 EUR / mes`

Publico:
- empresa mediana o grande
- operaciones multiusuario
- equipos comerciales / produccion

Objetivo:
- integracion operativa
- reporting
- trazabilidad

Experiencia:
- todo lo de PRO
- envio por email al cliente final
- conectividad CRM / ERP
- conectividad SharePoint
- reportes de uso por empresa
- conectores e integraciones administrables

## Matriz de capacidades

| Capacidad | Free Lite | PRO | Premium |
|---|---:|---:|---:|
| Logo E-scale obligatorio | Si | No | No |
| Logo propio | No | Si | Si |
| Exportacion PDF | No | Si | Si |
| Email PDF al propio usuario | No | Si | Si |
| Email PDF al cliente final | No | No | Si |
| Precios proveedores por Excel | No | Si | Si |
| Dashboard empresa | Basico upsell | Si | Avanzado |
| SharePoint | No | No | Si |
| CRM / ERP | No | No | Si |
| Reportes por empresa | No | Basico | Avanzado |
| Soporte chat | Si | Si | Si |

## Modelo de tenancy

La unidad comercial y tecnica no debe ser el usuario, sino la organizacion.

### Entidades clave

- `user_profiles`
- `organizations`
- `organization_members`
- `subscription_tiers`
- `billing_customers`
- `feature_entitlements`
- `export_jobs`
- `export_inventory_lines`
- `provider_price_imports`
- `integration_connections`

### Roles recomendados

- `owner`
- `admin`
- `editor`
- `viewer`

## Reglas de licenciamiento

- el frontend puede mostrar o esconder UX por plan
- el backend debe ser quien decide si una accion esta permitida
- exportar, enviar emails, importar Excel o conectar SharePoint deben validarse en servidor
- Stripe nunca debe ser la unica fuente de verdad; Stripe actualiza, pero la autorizacion vive en tu BD

## Roadmap por fases

### Fase 0 - Fundacion tecnica

Objetivo:
- pasar de prototipo local a producto desplegable

Entregables:
- proyecto Vercel conectado a GitHub
- proyecto Supabase `dev`
- dominio decidido
- variables de entorno definidas
- plan catalogado en codigo y BD
- esquema inicial de Supabase
- decision de region UE

### Fase 1 - Auth y organizacion

Objetivo:
- tener cuentas reales y tenancy

Entregables:
- login por email magic link o password con Supabase
- tabla `organizations`
- relacion usuario-organizacion
- flujo alta:
  - Free Lite crea organizacion gratis
  - PRO / Premium pasan por checkout

### Fase 2 - Billing y licencias

Objetivo:
- activar monetizacion sin romper el flujo actual

Entregables:
- productos y precios en Stripe
- customer portal
- checkout para PRO y Premium
- webhooks:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`

### Fase 3 - Exportaciones y email

Objetivo:
- sacar la exportacion de la dependencia exclusiva del cliente

Entregables:
- `export_jobs` persistidos
- PDF generado en servidor
- envio con Resend
- logs de entrega
- plantillas email

Plan gating:
- Free Lite: bloqueado
- PRO: envio al propietario
- Premium: envio al propietario y al cliente

### Fase 4 - Datos comerciales y dashboard

Objetivo:
- convertir E-scale en herramienta operativa

Entregables:
- importacion de Excel de proveedores
- persistencia de inventario exportado
- reportes por empresa
- actividad mensual
- conversion Free -> PRO -> Premium

### Fase 5 - Integraciones enterprise

Objetivo:
- justificar Premium

Entregables:
- conector SharePoint
- conector CRM
- conector ERP
- cola de sincronizacion
- logs de integracion
- panel de estado de conectores

### Fase 6 - Analitica y soporte

Objetivo:
- entender uso real y reducir churn

Entregables:
- eventos PostHog
- funnel de conversion
- uso por feature y plan
- widget Crisp
- alertas de error en exportacion / pagos

## Backlog prioritario

1. estabilizar despliegue Vercel del frontend actual
2. mover empresa / logo / exports a modelo de organizacion
3. crear esquema Supabase y tablas de billing
4. integrar Supabase Auth
5. integrar Stripe Checkout + webhook
6. mover export PDF a servidor
7. integrar Resend
8. activar PostHog
9. activar Crisp
10. desarrollar SharePoint / CRM / ERP para Premium

## Decisiones de producto ya recomendadas

### Free Lite

No lo conviertas en demo vacia. Debe dejar experimentar valor, pero con restricciones claras:

- ver layout
- guardar empresa y lugar
- explorar catalogo
- ver inventario
- no exportar
- watermark / branding E-scale
- popup de upgrade no intrusivo

### PRO

Debe venderse como "profesionalizo mi entrega" y no como "tengo mas botones".

### Premium

Debe venderse como "integro operaciones y reporting", no como simple subida de precio.

## Riesgos

- dejar el control de permisos solo en frontend
- no modelar organizacion desde el principio
- generar PDFs solo en cliente cuando ya quieres automatizar envios
- mezclar datos reales con el Excel mock mas tiempo del debido
- retrasar webhooks de Stripe

## Resultado esperado tras esta hoja de ruta

Al finalizar Fase 3, E-scale ya puede vender:

- Free Lite para captacion
- PRO como primer plan serio de ingresos
- Premium como capa enterprise con integraciones

Y lo hara sin rehacer el corazon 3D, sino industrializando el producto alrededor del motor actual.
