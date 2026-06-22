-- ============================================================================
-- E-SCALE · QR dinamicos · origen fisico del escaneo (columna src)
-- ----------------------------------------------------------------------------
-- Anade a escale.qr_scan_events la columna `src`: el ORIGEN FISICO del escaneo
-- (ej. 'entrada', 'folleto', 'pantalla'). Lo aporta quien genera el QR poniendo
-- ?src=<origen> al final del enlace corto /q/:code; el redirector serverless lo
-- sanea (string, trim, minusculas, max 40 chars) y lo persiste en cada evento.
-- Puede ir null (escaneo sin origen declarado / enlace sin ?src=).
--
-- NO toca RLS ni grants: la tabla ya esta cubierta por la migracion
-- 20260622_qr_codes.sql (politica tenant + grants a authenticated y default
-- privileges). Idempotente y seguro de re-ejecutar.
-- ============================================================================

-- Origen fisico del escaneo (opcional). Capturado de ?src= en el enlace corto.
alter table escale.qr_scan_events
  add column if not exists src text;

-- Indice para agregaciones por origen dentro de un QR (bySrc en handleStats).
create index if not exists idx_escale_qr_scan_events_src
  on escale.qr_scan_events(qr_id, src);
