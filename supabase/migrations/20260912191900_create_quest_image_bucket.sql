-- The private bucket quest photos are uploaded into.
--
-- Separate from the schema migration because this writes to Supabase's own
-- `storage` schema rather than `public`.
--
-- `public = false` is the column that matters: nothing in the bucket is
-- reachable by URL. Writes happen with the secret key from a Route Handler,
-- and reads later happen through short-lived signed URLs minted server-side.
-- No policies are attached to storage.objects, so the publishable key that
-- ships in the browser bundle can do neither.
--
-- file_size_limit and allowed_mime_types mirror MAX_IMAGE_BYTES and the
-- accepted types in lib/image-capture.ts. They are belt-and-braces: a request
-- that somehow skipped the application checks still cannot park a video here.
--
-- Written as an upsert because the bucket may already have been created by
-- hand in the dashboard. Re-running reconciles its settings instead of
-- failing, and never flips it public.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sidequest-images',
  'sidequest-images',
  false,
  12582912, -- 12 MiB, matching MAX_IMAGE_BYTES
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
