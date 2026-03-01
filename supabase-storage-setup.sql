-- Crear el bucket de almacenamiento para los modelos 3D y texturas
insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do nothing;

-- Política de Seguridad: Permitir a cualquiera VER (Descargar) los archivos
create policy "Public Access to Assets"
on storage.objects for select
to public
using ( bucket_id = 'assets' );

-- Política de Seguridad: Permitir a cualquiera SUBIR (Insertar) archivos anónimamente (Para Prototipo)
create policy "Public Upload to Assets"
on storage.objects for insert
to public
with check ( bucket_id = 'assets' );
