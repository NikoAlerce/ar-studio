-- Tabla principal de Proyectos AR
-- NOTA: Si la tabla ya existe, ejecuta los ALTER TABLE de abajo en su lugar.

create table if not exists
  public.projects (
    id text not null,
    name text default 'Proyecto sin nombre',
    thumbnail text null,
    scene_data jsonb null,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone null default now(),
    constraint projects_pkey primary key (id)
  ) tablespace pg_default;

-- Si la tabla ya existía sin las columnas name y thumbnail:
-- ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS name TEXT DEFAULT 'Proyecto sin nombre';
-- ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS thumbnail TEXT;
