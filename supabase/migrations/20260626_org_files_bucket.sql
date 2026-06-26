-- Bucket de Supabase Storage para archivos de la organización (PDFs e imágenes)
-- Ejecutar en el SQL Editor de Supabase

-- 1. Crear el bucket (si no existe)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'org-files',
  'org-files',
  false,
  20971520, -- 20 MB
  ARRAY['image/jpeg','image/png','image/gif','image/webp','image/svg+xml','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS: solo miembros de la org pueden leer sus archivos
-- El path sigue el patrón: {company_id}/{uuid_filename}

CREATE POLICY "Miembros de org pueden leer sus archivos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'org-files'
  AND (storage.foldername(name))[1] IN (
    SELECT company_id::text
    FROM public.company_members
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Miembros de org pueden subir archivos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'org-files'
  AND (storage.foldername(name))[1] IN (
    SELECT company_id::text
    FROM public.company_members
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Miembros de org pueden eliminar sus archivos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'org-files'
  AND (storage.foldername(name))[1] IN (
    SELECT company_id::text
    FROM public.company_members
    WHERE user_id = auth.uid()
  )
);
