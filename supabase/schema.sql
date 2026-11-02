-- Reference schema for the Katende Philbert payment system.
-- Applied to Supabase project wygzleiabazmvezouvcl on 2026-11-02.
-- For a future CLI-managed migration, generate the migration filename with:
-- supabase migration new payment_system_schema
-- Then move/verify this SQL into that generated migration.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  phone text,
  created_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  price_ugx numeric(14,2),
  price_usd numeric(14,2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_at_least_one_price check (price_ugx is not null or price_usd is not null),
  constraint services_ugx_positive check (price_ugx is null or price_ugx > 0),
  constraint services_usd_positive check (price_usd is null or price_usd > 0)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (currency in ('UGX','USD')),
  status text not null default 'unpaid' check (status in ('unpaid','paid','cancelled','expired')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  service_id uuid references public.services(id),
  invoice_id uuid references public.invoices(id),
  tx_ref text not null unique,
  provider_transaction_id text unique,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (currency in ('UGX','USD')),
  status text not null default 'initiated' check (status in ('initiated','pending','successful','failed','cancelled','refunded')),
  payment_link text,
  payment_type text,
  provider_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint payments_one_source check (
    (service_id is not null and invoice_id is null) or
    (service_id is null and invoice_id is not null)
  )
);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  provider_transaction_id text not null,
  event_type text not null,
  event_status text,
  received_at timestamptz not null default now(),
  constraint payment_events_idempotency unique (payment_id, provider_transaction_id, event_type)
);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments(id),
  receipt_number text not null unique default ('KP-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  issued_at timestamptz not null default now()
);

create index payments_created_at_idx on public.payments(created_at desc);
create index payments_status_idx on public.payments(status);
create index payments_customer_id_idx on public.payments(customer_id);
create index payments_invoice_id_idx on public.payments(invoice_id);
create index payments_service_id_idx on public.payments(service_id);
create index invoices_status_idx on public.invoices(status);
create index payment_events_payment_id_idx on public.payment_events(payment_id);

alter table public.customers enable row level security;
alter table public.services enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.receipts enable row level security;

revoke all on public.customers, public.services, public.invoices, public.payments, public.payment_events, public.receipts from anon, authenticated;
grant all on public.customers, public.services, public.invoices, public.payments, public.payment_events, public.receipts to service_role;

create policy "Deny direct client access to customers" on public.customers
for all to anon, authenticated using (false) with check (false);
create policy "Deny direct client access to services" on public.services
for all to anon, authenticated using (false) with check (false);
create policy "Deny direct client access to invoices" on public.invoices
for all to anon, authenticated using (false) with check (false);
create policy "Deny direct client access to payments" on public.payments
for all to anon, authenticated using (false) with check (false);
create policy "Deny direct client access to payment events" on public.payment_events
for all to anon, authenticated using (false) with check (false);
create policy "Deny direct client access to receipts" on public.receipts
for all to anon, authenticated using (false) with check (false);

create or replace function public.confirm_payment(
  p_tx_ref text,
  p_provider_transaction_id text,
  p_provider_response jsonb,
  p_payment_type text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
begin
  select * into v_payment
  from public.payments
  where tx_ref = p_tx_ref
  for update;

  if not found then
    raise exception 'Payment reference not found';
  end if;

  if v_payment.status = 'successful' then
    return;
  end if;

  update public.payments
  set status = 'successful',
      provider_transaction_id = p_provider_transaction_id,
      provider_response = coalesce(p_provider_response, '{}'::jsonb),
      payment_type = coalesce(p_payment_type, payment_type),
      paid_at = now(),
      updated_at = now()
  where id = v_payment.id;

  if v_payment.invoice_id is not null then
    update public.invoices
    set status = 'paid', updated_at = now()
    where id = v_payment.invoice_id;
  end if;

  insert into public.receipts(payment_id)
  values (v_payment.id)
  on conflict (payment_id) do nothing;
end;
$$;

revoke all on function public.confirm_payment(text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.confirm_payment(text,text,jsonb,text) to service_role;
