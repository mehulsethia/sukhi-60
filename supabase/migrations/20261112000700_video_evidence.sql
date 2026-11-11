-- Video evidence: short clips recorded in the app or picked from the gallery.
-- Videos are uploaded straight from the browser to the private evidence bucket (route
-- bodies are capped at ~4.5 MB); the server reviews still frames taken from the clip.
alter type public.evidence_kind add value if not exists 'video';

alter table public.documents drop constraint documents_mime_type_check;
alter table public.documents add constraint documents_mime_type_check check (mime_type in (
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
  'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'text/plain',
  'video/mp4', 'video/webm', 'video/quicktime'));

alter table public.documents drop constraint documents_size_bytes_check;
alter table public.documents add constraint documents_size_bytes_check check (size_bytes > 0 and size_bytes <= 52428800);

update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf','audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav','video/mp4','video/webm','video/quicktime']
 where id = 'evidence';
