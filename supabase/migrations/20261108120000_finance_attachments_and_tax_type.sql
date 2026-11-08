-- Finance fixes reported 8 Nov 2026 (NSWRYA):
-- 1. Attachments (supplier invoices, receipts) on club and association transactions.
-- 2. tax_type on club transactions, so GST included/excluded is kept the way
--    association transactions already keep it.

-- ── 1. tax_type on club transactions ─────────────────────────────────────
alter table public.transactions
  add column if not exists tax_type text not null default 'none';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_tax_type_check') then
    alter table public.transactions
      add constraint transactions_tax_type_check check (tax_type in ('none', 'included', 'excluded'));
  end if;
end $$;

-- ── 2. Attachments ────────────────────────────────────────────────────────
create table if not exists public.finance_attachments (
  id uuid primary key default gen_random_uuid(),
  transaction_table text not null check (transaction_table in ('transactions', 'association_transactions')),
  transaction_id uuid not null,
  file_name text not null,
  file_path text not null unique,
  file_size bigint,
  mime_type text,
  uploaded_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists finance_attachments_txn_idx
  on public.finance_attachments (transaction_table, transaction_id);

alter table public.finance_attachments enable row level security;

-- Who may add or remove attachments: whoever may change the transaction
-- (club admins; association admins), mirroring those tables' policies.
create or replace function public.can_manage_finance_transaction(p_table text, p_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- p_id comes from a storage path, so only a well-formed uuid is looked up
  with ids as (
    select case when p_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then p_id::uuid end as id
  )
  select case p_table
    when 'transactions' then exists (
      select 1 from ids, public.transactions t
      join public.user_clubs uc on uc.club_id = t.club_id
      where t.id = ids.id and uc.user_id = auth.uid() and uc.role = 'admin'::club_role
    )
    when 'association_transactions' then exists (
      select 1 from ids, public.association_transactions t
      where t.id = ids.id
        and (
          public.is_association_admin(t.association_id, t.association_type)
          or (t.association_type = 'state' and public.is_state_admin_for_association(t.association_id))
          or (t.association_type = 'national' and public.is_national_admin_for_association(t.association_id))
        )
    )
    else false
  end;
$$;

revoke all on function public.can_manage_finance_transaction(text, text) from public, anon;
grant execute on function public.can_manage_finance_transaction(text, text) to authenticated;

-- Seeing an attachment follows seeing its transaction (the parent's own RLS applies here)
drop policy if exists "View attachments of visible transactions" on public.finance_attachments;
create policy "View attachments of visible transactions"
  on public.finance_attachments for select to authenticated
  using (
    (transaction_table = 'transactions'
      and exists (select 1 from public.transactions t where t.id = finance_attachments.transaction_id))
    or (transaction_table = 'association_transactions'
      and exists (select 1 from public.association_transactions t where t.id = finance_attachments.transaction_id))
  );

drop policy if exists "Finance admins can add attachments" on public.finance_attachments;
create policy "Finance admins can add attachments"
  on public.finance_attachments for insert to authenticated
  with check (public.can_manage_finance_transaction(transaction_table, transaction_id::text));

drop policy if exists "Finance admins can remove attachments" on public.finance_attachments;
create policy "Finance admins can remove attachments"
  on public.finance_attachments for delete to authenticated
  using (public.can_manage_finance_transaction(transaction_table, transaction_id::text));

-- Rows go with their transaction
create or replace function public.delete_finance_attachments_for_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.finance_attachments
  where transaction_table = TG_TABLE_NAME and transaction_id = old.id;
  return old;
end;
$$;

drop trigger if exists finance_attachments_cleanup on public.transactions;
create trigger finance_attachments_cleanup
  after delete on public.transactions
  for each row execute function public.delete_finance_attachments_for_transaction();

drop trigger if exists finance_attachments_cleanup on public.association_transactions;
create trigger finance_attachments_cleanup
  after delete on public.association_transactions
  for each row execute function public.delete_finance_attachments_for_transaction();

-- Private storage: <transaction_table>/<transaction_id>/<file>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'finance-attachments', 'finance-attachments', false, 15728640,
  array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
    'text/csv', 'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

-- Readable when its record is visible, and always by the finance admins of the
-- transaction (an upload or a removal reads the object back before its record exists / after it's gone)
drop policy if exists "Finance attachments: read when the record is visible" on storage.objects;
create policy "Finance attachments: read when the record is visible"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'finance-attachments'
    and (
      exists (select 1 from public.finance_attachments a where a.file_path = storage.objects.name)
      or public.can_manage_finance_transaction((storage.foldername(name))[1], (storage.foldername(name))[2])
    )
  );

drop policy if exists "Finance attachments: upload for finance admins" on storage.objects;
create policy "Finance attachments: upload for finance admins"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'finance-attachments'
    and public.can_manage_finance_transaction((storage.foldername(name))[1], (storage.foldername(name))[2])
  );

drop policy if exists "Finance attachments: delete for finance admins" on storage.objects;
create policy "Finance attachments: delete for finance admins"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'finance-attachments'
    and public.can_manage_finance_transaction((storage.foldername(name))[1], (storage.foldername(name))[2])
  );
