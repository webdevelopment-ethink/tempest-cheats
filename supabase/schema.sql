-- ============================================================================
-- Project Tempest — Supabase schema
--
-- Run this once in your Supabase project:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste the entire contents of this file
--   3. Click "Run"
--
-- After this runs, only the service_role key (set on Railway as
-- SUPABASE_SERVICE_ROLE_KEY) can read/write these tables.  The anon
-- key cannot see anything (RLS denies all by default with no policies).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

create table if not exists public.keys (
  id                   bigserial primary key,
  product_id           text not null
                       check (product_id in ('arc-1-day','arc-7-day','arc-30-day')),
  -- AES-256-GCM ciphertext of the plaintext license key, base64-encoded,
  -- versioned (e.g. "v1:<base64>"). Never store plaintext here.
  key_code_encrypted   text not null,
  -- HMAC-SHA256(plaintext) hex string — used to detect duplicate uploads and
  -- look up a key by its plaintext value without ever storing the plaintext.
  key_fingerprint      text not null,
  status               text not null default 'available'
                       check (status in ('available','sold')),
  stripe_session_id    text unique,
  email                text,
  sold_at              timestamptz,
  created_at           timestamptz not null default now()
);

create unique index if not exists keys_fingerprint_uniq
  on public.keys (key_fingerprint);

create index if not exists keys_product_status_idx
  on public.keys (product_id, status);

create index if not exists keys_email_idx
  on public.keys (lower(email))
  where status = 'sold';

create table if not exists public.deliveries (
  stripe_session_id text primary key,
  key_id            bigint not null references public.keys(id),
  product_id        text not null,
  email             text not null,
  delivered_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- reserve_key() — atomic key reservation for the Stripe webhook
--
-- Picks the oldest available key for a product, marks it sold, and writes a
-- delivery row, all in one transaction.  Uses SELECT ... FOR UPDATE SKIP LOCKED
-- so two concurrent webhooks never hand out the same key.
--
-- If a delivery row already exists for this stripe_session_id we return that
-- one instead (idempotent — Stripe may retry webhooks).
-- ----------------------------------------------------------------------------

create or replace function public.reserve_key(
  p_product_id        text,
  p_email             text,
  p_stripe_session_id text
) returns table (
  key_id              bigint,
  key_code_encrypted  text,
  already_delivered   boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_key_id    bigint;
  v_existing_encrypted text;
  v_picked_id          bigint;
  v_picked_encrypted   text;
begin
  -- Idempotency: if this Stripe session already got a key, return it.
  select d.key_id, k.key_code_encrypted
    into v_existing_key_id, v_existing_encrypted
  from public.deliveries d
  join public.keys k on k.id = d.key_id
  where d.stripe_session_id = p_stripe_session_id;

  if found then
    key_id := v_existing_key_id;
    key_code_encrypted := v_existing_encrypted;
    already_delivered := true;
    return next;
    return;
  end if;

  -- Pick the oldest available key, locking the row so concurrent calls skip it.
  update public.keys
     set status            = 'sold',
         stripe_session_id = p_stripe_session_id,
         email             = p_email,
         sold_at           = now()
   where id = (
     select id from public.keys
      where product_id = p_product_id
        and status     = 'available'
      order by id asc
      limit 1
      for update skip locked
   )
  returning id, key_code_encrypted
       into v_picked_id, v_picked_encrypted;

  if v_picked_id is null then
    raise exception 'OUT_OF_STOCK' using errcode = 'P0001';
  end if;

  insert into public.deliveries (stripe_session_id, key_id, product_id, email)
  values (p_stripe_session_id, v_picked_id, p_product_id, p_email);

  key_id := v_picked_id;
  key_code_encrypted := v_picked_encrypted;
  already_delivered := false;
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- Row Level Security (RLS) — lock everything down
--
-- No policies are defined, so the anon and authenticated roles get nothing.
-- The service_role used by the Railway server bypasses RLS automatically.
-- ----------------------------------------------------------------------------

alter table public.keys       enable row level security;
alter table public.deliveries enable row level security;

revoke all on public.keys       from anon, authenticated;
revoke all on public.deliveries from anon, authenticated;
revoke execute on function public.reserve_key(text, text, text) from anon, authenticated;
