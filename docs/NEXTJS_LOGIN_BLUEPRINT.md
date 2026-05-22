# Next.js Login Blueprint

Este repositorio sigue siendo una app HTML/JS, no un proyecto Next.js. Para no mezclar arquitecturas, este bloque deja un ejemplo listo para copiar en un frontend `Next.js App Router` futuro.

Archivos de ejemplo:

- [Login.tsx](</X:/App/E_scale/docs/examples/next-app/components/Login.tsx>)
- [PlanBadge.tsx](</X:/App/E_scale/docs/examples/next-app/components/PlanBadge.tsx>)
- [supabase-browser.ts](</X:/App/E_scale/docs/examples/next-app/lib/supabase-browser.ts>)
- [.env.local.example](</X:/App/E_scale/docs/examples/next-app/.env.local.example>)

## Qué hace el componente

- muestra botones `Continuar con Google`, `Continuar con Microsoft` y `Continuar con correo`
- usa `supabase.auth.signInWithOAuth(...)` para Google y Microsoft
- manda el `redirectTo` a `/dashboard`
- permite seleccionar `Lite`, `PRO` o `Premium`
- si no existen todavía `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`, no rompe la UI: entra en modo fallback

## Reglas de negocio sugeridas

Para evitar piratería y mantener una UX limpia:

1. `Lite`
   - el usuario escribe correo
   - guardas ese correo como lead comercial
   - continúas dentro de la app sin OAuth obligatorio

2. `PRO` y `Premium`
   - el usuario se identifica con Google, Microsoft o correo
   - una API segura del servidor comprueba si ese correo pertenece a una licencia activa
   - si coincide, resuelves el plan real y devuelves `free_lite`, `pro` o `premium`

3. La comprobación de licencia por correo debe hacerse **solo en servidor**
   - no expongas tablas de billing o membresía al navegador
   - desde el cliente llama a una ruta propia, por ejemplo `/api/license/resolve`

## Variables de entorno en Next.js

En el frontend Next.js necesitas:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-or-publishable-key
```

Comprobación rápida:

1. crea `.env.local`
2. copia esos dos valores
3. reinicia `next dev`
4. si `process.env.NEXT_PUBLIC_SUPABASE_URL` o `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` están vacíos, el cliente no podrá iniciar OAuth

Referencia oficial de Supabase para Next.js:
- [Build a User Management App with Next.js](https://supabase.com/docs/guides/with-nextjs)

## Google OAuth

Para usar Google con Supabase necesitas:

1. una cuenta de Google con acceso a [Google Cloud](https://console.cloud.google.com/)
2. crear un proyecto
3. crear un OAuth Client de tipo `Web application`
4. añadir como callback de Supabase:
   - `https://<project-ref>.supabase.co/auth/v1/callback`
5. en local, añadir tu origen web:
   - `http://localhost:3000`
6. pegar `Client ID` y `Client Secret` en `Supabase > Auth > Providers > Google`

Referencia oficial:
- [Supabase: Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)

## Microsoft OAuth

Para usar Microsoft con Supabase necesitas:

1. una cuenta Microsoft con acceso a [Azure Portal](https://portal.azure.com/)
2. ir a `Microsoft Entra ID`
3. `App registrations` -> `New registration`
4. añadir Redirect URI web:
   - `https://<project-ref>.supabase.co/auth/v1/callback`
5. crear un `Client secret`
6. pegar `Application (client) ID` y `Client secret value` en `Supabase > Auth > Providers > Azure`

Referencia oficial:
- [Supabase: Login with Azure (Microsoft)](https://supabase.com/docs/guides/auth/social-login/auth-azure)

## Redirects

El `redirectTo` del componente apunta a:

```ts
${window.location.origin}/dashboard
```

Además asegúrate de permitir esa URL en Supabase Auth:

- `http://localhost:3000/dashboard`
- `https://tu-dominio.com/dashboard`

Referencia oficial:
- [Supabase Auth overview](https://supabase.com/docs/guides/auth)

## Cómo mostrar la versión arriba a la derecha

Una vez que tu backend resuelva el plan, puedes pintar un badge como:

```tsx
<PlanBadge plan="pro" className="fixed right-4 top-4" />
```

Valores esperados:

- `free_lite` -> `Version Lite`
- `pro` -> `Version PRO`
- `premium` -> `Version Premium`

## Lo importante mientras no tengas keys

No necesitas todavía las credenciales de Google ni Microsoft para construir la UI.

El componente ya está preparado para:

- renderizar correctamente
- dejar entrar a `Lite`
- lanzar callbacks propios para verificar correo en `PRO/Premium`
- no romper nada hasta que más adelante pegues las claves reales
