-- Evitar orgs duplicadas con el mismo billing_email
-- Primero eliminar duplicados: conservar la más reciente por email
DELETE FROM public.organizations
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY billing_email ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST) AS rn
    FROM public.organizations
    WHERE billing_email IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- Añadir constraint único
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_billing_email_unique UNIQUE (billing_email);
