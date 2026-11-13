-- Checkout creates a random public order reference inside a SECURITY DEFINER function.
-- Supabase keeps most extensions in `extensions`, outside the function's old `public`-only path.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Keep built-ins first, then the trusted extension schema, then application tables.
alter function public.place_order(uuid, jsonb, jsonb, text)
  set search_path = pg_catalog, extensions, public;
