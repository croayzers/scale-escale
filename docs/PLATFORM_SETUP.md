# Platform Setup Checklist

## 1. GitHub

- repositorio principal: `main`
- ramas recomendadas:
  - `main`
  - `develop`
  - `feature/*`
- proteger `main`
- exigir PR para cambios de billing, auth y permisos

## 2. Dominio

Recomendacion:

- `escale.app`
- `app.escale.app` -> frontend
- `api.escale.app` -> endpoints propios si mas adelante separas capa API

## 3. Vercel

Objetivo:
- servir el frontend estatico desde GitHub con deploy automatico

Configurar:

1. importar repo desde GitHub
2. framework preset:
   - `Other`
3. output:
   - raiz actual del repo
4. production branch:
   - `main`
5. preview deployments:
   - activados para PR

Entornos:

- `development`
- `preview`
- `production`

## 4. Supabase

Crear tres proyectos si el coste lo permite:

- `escale-dev`
- `escale-staging`
- `escale-prod`

Configurar:

- region UE
- Auth:
  - email magic link o email + password
  - redirect URLs de Vercel
- Storage buckets:
  - `company-logos`
  - `export-pdfs`
  - `provider-imports`
- SQL inicial:
  - usar [supabase/schema.sql](/C:/Users/rafa2/Documents/GitHub/E_scale/supabase/schema.sql)

## 5. Stripe

Productos recomendados:

- `E-scale PRO`
- `E-scale Premium`

Precios recomendados:

- `PRO monthly EUR 34`
- `Premium monthly EUR 120`

No crear precio Stripe para Free Lite salvo que luego quieras trials complejos.

Configurar:

- Stripe Tax
- Customer Portal
- Webhook endpoint
- metadata por checkout:
  - `organization_id`
  - `tier_code`

Eventos minimos a escuchar:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

## 6. Resend

Dominio:

- `mail.escale.app` o dominio principal verificado

Usos:

- verificacion / invitacion si algun dia no delegas eso en Supabase SMTP
- email de exportacion PRO
- email de exportacion cliente Premium
- emails de upgrade / onboarding

## 7. PDF server-side

Primera iteracion recomendada:

- Vercel Function con Puppeteer si el documento es simple

Escalado:

- Browserless si necesitas colas, sesiones o volumen

## 8. PostHog

Eventos iniciales:

- `signup_started`
- `signup_completed`
- `workspace_created`
- `plan_viewed`
- `upgrade_clicked`
- `checkout_started`
- `checkout_completed`
- `export_attempted`
- `export_blocked_by_plan`
- `export_completed`
- `excel_import_completed`
- `sharepoint_sync_started`
- `sharepoint_sync_failed`

## 9. Crisp

Activar en:

- marketing / landing
- app logged in

Usos:

- soporte en onboarding
- soporte de cobros
- soporte de exportacion

## 10. Plan gating

Todo debe existir en dos capas:

- `catalogo frontend`
- `entitlements backend`

### Frontend

- esconder o desactivar botones
- mostrar upgrade CTA

### Backend

- rechazar exportaciones no permitidas
- rechazar emails no permitidos
- rechazar integraciones Premium no contratadas

## 11. Migracion de datos desde estado actual

Datos actuales:

- empresa en `localStorage`
- logos locales / base64
- exportaciones actuales en cliente
- dashboard temporal en Excel

Ruta:

1. seguir usando el Excel mock solo como respaldo temporal
2. empezar a escribir en Supabase como fuente de verdad
3. mantener el Excel como export auxiliar o herramienta interna
4. retirar el Excel del camino critico cuando el dashboard cloud exista

## 12. Orden recomendado de implementacion

1. Vercel
2. Supabase schema
3. Supabase Auth
4. Organizations + memberships
5. Stripe Checkout + Portal
6. Stripe webhooks -> entitlements
7. Resend
8. Server-side PDF
9. PostHog
10. Crisp
11. Excel imports
12. SharePoint / CRM / ERP
