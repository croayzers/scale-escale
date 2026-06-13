-- Añade campo cliente a org_floor_plans para metadatos por plano
ALTER TABLE escale.org_floor_plans
  ADD COLUMN IF NOT EXISTS cliente TEXT;
