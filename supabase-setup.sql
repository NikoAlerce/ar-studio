-- Tabla principal de Proyectos AR
create table
  public.projects (
    id text not null,
    scene_data jsonb null,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone null default now(),
    constraint projects_pkey primary key (id)
  ) tablespace pg_default;
