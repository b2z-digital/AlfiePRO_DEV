-- Expense approvals (requested 8 Nov 2026): a club or association can require
-- that every expense entered is approved by someone else (e.g. the President)
-- before it can be marked paid. Off by default; nothing changes until it's on.

-- ── Settings ──────────────────────────────────────────────────────────────
alter table public.club_finance_settings
  add column if not exists expense_approval_enabled boolean not null default false,
  add column if not exists expense_default_approver_position_id uuid
    references public.committee_positions(id) on delete set null;

alter table public.association_finance_settings
  add column if not exists expense_approval_enabled boolean not null default false,
  add column if not exists expense_default_approver_position_id uuid
    references public.committee_positions(id) on delete set null;

-- ── Status on the transaction ────────────────────────────────────────────
alter table public.transactions
  add column if not exists approval_status text not null default 'not_required';
alter table public.association_transactions
  add column if not exists approval_status text not null default 'not_required';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_approval_status_check') then
    alter table public.transactions add constraint transactions_approval_status_check
      check (approval_status in ('not_required', 'pending', 'approved', 'declined'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'association_transactions_approval_status_check') then
    alter table public.association_transactions add constraint association_transactions_approval_status_check
      check (approval_status in ('not_required', 'pending', 'approved', 'declined'));
  end if;
end $$;

-- An expense waiting for (or refused) approval can't be marked paid
create or replace function public.guard_expense_paid_until_approved()
returns trigger
language plpgsql
as $$
begin
  if new.approval_status in ('pending', 'declined')
     and new.payment_status in ('paid', 'completed')
     and (tg_op = 'INSERT'
          or new.payment_status is distinct from old.payment_status
          or new.approval_status is distinct from old.approval_status) then
    raise exception 'This expense needs approval before it can be marked paid'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_expense_paid_until_approved on public.transactions;
create trigger guard_expense_paid_until_approved
  before insert or update of payment_status, approval_status on public.transactions
  for each row execute function public.guard_expense_paid_until_approved();

drop trigger if exists guard_expense_paid_until_approved on public.association_transactions;
create trigger guard_expense_paid_until_approved
  before insert or update of payment_status, approval_status on public.association_transactions
  for each row execute function public.guard_expense_paid_until_approved();

-- ── Requests and decisions ───────────────────────────────────────────────
create table if not exists public.finance_approvals (
  id uuid primary key default gen_random_uuid(),
  transaction_table text not null check (transaction_table in ('transactions', 'association_transactions')),
  transaction_id uuid not null,
  club_id uuid references public.clubs(id) on delete cascade,
  association_id uuid,
  association_type text check (association_type in ('state', 'national')),
  approver_user_id uuid not null,
  approver_name text,
  approver_position text,
  requested_by uuid not null default auth.uid(),
  requested_by_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  comment text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists finance_approvals_txn_idx on public.finance_approvals (transaction_table, transaction_id);
create index if not exists finance_approvals_approver_idx on public.finance_approvals (approver_user_id, status);

alter table public.finance_approvals enable row level security;

-- Rows are written only by the functions below
drop policy if exists "See approvals you're part of" on public.finance_approvals;
create policy "See approvals you're part of"
  on public.finance_approvals for select to authenticated
  using (
    approver_user_id = auth.uid()
    or requested_by = auth.uid()
    or public.can_manage_finance_transaction(transaction_table, transaction_id::text)
  );

-- Approvers can open the attachments of an expense sent to them
drop policy if exists "View attachments of visible transactions" on public.finance_attachments;
create policy "View attachments of visible transactions"
  on public.finance_attachments for select to authenticated
  using (
    (transaction_table = 'transactions'
      and exists (select 1 from public.transactions t where t.id = finance_attachments.transaction_id))
    or (transaction_table = 'association_transactions'
      and exists (select 1 from public.association_transactions t where t.id = finance_attachments.transaction_id))
    or exists (
      select 1 from public.finance_approvals ap
      where ap.transaction_table = finance_attachments.transaction_table
        and ap.transaction_id = finance_attachments.transaction_id
        and ap.approver_user_id = auth.uid()
    )
  );

-- ── Helpers ──────────────────────────────────────────────────────────────
-- Finance admin of a club or association (who may manage its transactions)
create or replace function public.can_manage_finance_org(p_club_id uuid, p_association_id uuid, p_association_type text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_club_id is not null then exists (
      select 1 from public.user_clubs uc
      where uc.club_id = p_club_id and uc.user_id = auth.uid() and uc.role = 'admin'::club_role
    )
    when p_association_id is not null then
      public.is_association_admin(p_association_id, p_association_type)
      or (p_association_type = 'state' and public.is_state_admin_for_association(p_association_id))
      or (p_association_type = 'national' and public.is_national_admin_for_association(p_association_id))
    else false
  end;
$$;

-- Committee members with an AlfiePRO account who can approve for this club/association
create or replace function public.expense_approvers_for(p_club_id uuid, p_association_id uuid, p_association_type text)
returns table (position_id uuid, position_title text, user_id uuid, name text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select
    cp.id,
    coalesce(nullif(cp.position_title, ''), nullif(cp.title, ''), 'Committee'),
    coalesce(cp.user_id, m.user_id),
    coalesce(nullif(trim(concat_ws(' ', m.first_name, m.last_name)), ''), nullif(cp.name, ''),
             nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Committee member'),
    coalesce(nullif(m.email, ''), nullif(cp.email, ''), p.email)
  from public.committee_positions cp
  left join public.members m on m.id = cp.member_id
  left join public.profiles p on p.id = coalesce(cp.user_id, m.user_id)
  where coalesce(cp.user_id, m.user_id) is not null
    and (
      (p_club_id is not null and cp.club_id = p_club_id)
      or (p_association_type = 'state' and cp.state_association_id = p_association_id)
      or (p_association_type = 'national' and cp.national_association_id = p_association_id)
    );
$$;
revoke all on function public.expense_approvers_for(uuid, uuid, text) from public, anon, authenticated;

-- Settings + people who can approve (for the settings card and the expense page)
create or replace function public.expense_approval_setup(p_club_id uuid, p_association_id uuid, p_association_type text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_enabled boolean := false;
  v_default uuid;
begin
  if not public.can_manage_finance_org(p_club_id, p_association_id, p_association_type) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  if p_club_id is not null then
    select s.expense_approval_enabled, s.expense_default_approver_position_id into v_enabled, v_default
    from public.club_finance_settings s where s.club_id = p_club_id;
  else
    select s.expense_approval_enabled, s.expense_default_approver_position_id into v_enabled, v_default
    from public.association_finance_settings s
    where s.association_id = p_association_id and s.association_type = p_association_type;
  end if;

  return jsonb_build_object(
    'enabled', coalesce(v_enabled, false),
    'default_position_id', v_default,
    'me', auth.uid(),
    'approvers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position_id', a.position_id, 'position_title', a.position_title,
        'user_id', a.user_id, 'name', a.name, 'email', a.email) order by a.position_title, a.name)
      from public.expense_approvers_for(p_club_id, p_association_id, p_association_type) a
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.set_expense_approval_settings(
  p_club_id uuid, p_association_id uuid, p_association_type text,
  p_enabled boolean, p_default_position_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_finance_org(p_club_id, p_association_id, p_association_type) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_default_position_id is not null and not exists (
    select 1 from public.expense_approvers_for(p_club_id, p_association_id, p_association_type) a
    where a.position_id = p_default_position_id
  ) then
    raise exception 'That committee position has no AlfiePRO account to approve with';
  end if;

  if p_club_id is not null then
    insert into public.club_finance_settings (club_id, expense_approval_enabled, expense_default_approver_position_id)
    values (p_club_id, p_enabled, p_default_position_id)
    on conflict (club_id) do update
      set expense_approval_enabled = excluded.expense_approval_enabled,
          expense_default_approver_position_id = excluded.expense_default_approver_position_id,
          updated_at = now();
  else
    insert into public.association_finance_settings (association_id, association_type, expense_approval_enabled, expense_default_approver_position_id)
    values (p_association_id, p_association_type, p_enabled, p_default_position_id)
    on conflict (association_id, association_type) do update
      set expense_approval_enabled = excluded.expense_approval_enabled,
          expense_default_approver_position_id = excluded.expense_default_approver_position_id,
          updated_at = now();
  end if;
end;
$$;

-- Send an expense to someone for approval (cancels any earlier open request)
create or replace function public.request_expense_approval(p_table text, p_transaction_id uuid, p_approver_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club uuid; v_assoc uuid; v_assoc_type text; v_type text; v_desc text; v_amount numeric; v_payee text;
  v_ap_user uuid; v_ap_name text; v_ap_email text; v_ap_position text;
  v_requester_name text;
  v_id uuid;
begin
  if not public.can_manage_finance_transaction(p_table, p_transaction_id::text) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_approver_user_id = auth.uid() then
    raise exception 'Someone else has to approve your expense';
  end if;

  if p_table = 'transactions' then
    select t.club_id, t.type, t.description, t.amount, t.payee into v_club, v_type, v_desc, v_amount, v_payee
    from public.transactions t where t.id = p_transaction_id;
  else
    select t.association_id, t.association_type, t.type, t.description, t.amount, t.payee
      into v_assoc, v_assoc_type, v_type, v_desc, v_amount, v_payee
    from public.association_transactions t where t.id = p_transaction_id;
  end if;
  if v_type is distinct from 'expense' then
    raise exception 'Only expenses can be sent for approval';
  end if;

  select a.user_id, a.name, a.email, a.position_title into v_ap_user, v_ap_name, v_ap_email, v_ap_position
  from public.expense_approvers_for(v_club, v_assoc, v_assoc_type) a
  where a.user_id = p_approver_user_id
  order by a.position_title
  limit 1;
  if v_ap_user is null then
    raise exception 'The approver must be a committee member with an AlfiePRO account';
  end if;

  select nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '') into v_requester_name
  from public.profiles p where p.id = auth.uid();

  update public.finance_approvals set status = 'cancelled', decided_at = now()
  where transaction_table = p_table and transaction_id = p_transaction_id and status = 'pending';

  insert into public.finance_approvals (transaction_table, transaction_id, club_id, association_id, association_type,
    approver_user_id, approver_name, approver_position, requested_by, requested_by_name)
  values (p_table, p_transaction_id, v_club, v_assoc, v_assoc_type,
    v_ap_user, v_ap_name, v_ap_position, auth.uid(), coalesce(v_requester_name, 'A finance admin'))
  returning id into v_id;

  if p_table = 'transactions' then
    update public.transactions
      set approval_status = 'pending',
          payment_status = case when payment_status = 'paid' then 'awaiting_payment' else payment_status end
    where id = p_transaction_id;
  else
    update public.association_transactions
      set approval_status = 'pending',
          payment_status = case when payment_status = 'completed' then 'pending' else payment_status end
    where id = p_transaction_id;
  end if;

  return jsonb_build_object(
    'id', v_id, 'approver_user_id', v_ap_user, 'approver_name', v_ap_name,
    'approver_email', v_ap_email, 'approver_position', v_ap_position,
    'requested_by_name', coalesce(v_requester_name, 'A finance admin'),
    'club_id', v_club, 'description', v_desc, 'amount', v_amount, 'payee', v_payee);
end;
$$;

-- Approve or decline (only the person it was sent to)
create or replace function public.decide_expense_approval(p_approval_id uuid, p_approve boolean, p_comment text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ap public.finance_approvals%rowtype;
  v_status text := case when p_approve then 'approved' else 'declined' end;
  v_req_name text; v_req_email text;
  v_desc text; v_amount numeric;
begin
  select * into v_ap from public.finance_approvals where id = p_approval_id for update;
  if v_ap.id is null or v_ap.approver_user_id is distinct from auth.uid() then
    raise exception 'This approval isn''t yours to decide' using errcode = '42501';
  end if;
  if v_ap.status <> 'pending' then
    raise exception 'This expense has already been %', v_ap.status;
  end if;
  if not p_approve and coalesce(trim(p_comment), '') = '' then
    raise exception 'Please add a short reason when declining';
  end if;

  update public.finance_approvals
    set status = v_status, comment = nullif(trim(p_comment), ''), decided_at = now()
  where id = p_approval_id;

  if v_ap.transaction_table = 'transactions' then
    update public.transactions set approval_status = v_status where id = v_ap.transaction_id
    returning description, amount into v_desc, v_amount;
  else
    update public.association_transactions set approval_status = v_status where id = v_ap.transaction_id
    returning description, amount into v_desc, v_amount;
  end if;

  select nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.email into v_req_name, v_req_email
  from public.profiles p where p.id = v_ap.requested_by;

  return jsonb_build_object(
    'id', v_ap.id, 'status', v_status, 'club_id', v_ap.club_id,
    'requested_by', v_ap.requested_by, 'requested_by_name', coalesce(v_req_name, v_ap.requested_by_name),
    'requested_by_email', v_req_email, 'approver_name', v_ap.approver_name,
    'description', v_desc, 'amount', v_amount);
end;
$$;

-- One approval with the expense it's for (approver, requester or finance admin)
create or replace function public.get_expense_approval(p_approval_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ap public.finance_approvals%rowtype;
  v_tx jsonb;
  v_org text;
begin
  select * into v_ap from public.finance_approvals where id = p_approval_id;
  if v_ap.id is null or not (
    v_ap.approver_user_id = auth.uid() or v_ap.requested_by = auth.uid()
    or public.can_manage_finance_transaction(v_ap.transaction_table, v_ap.transaction_id::text)
  ) then
    raise exception 'Not found' using errcode = '42501';
  end if;

  if v_ap.transaction_table = 'transactions' then
    select jsonb_build_object('id', t.id, 'description', t.description, 'amount', t.amount, 'date', t.date,
        'payee', t.payee, 'reference', t.reference, 'notes', t.notes, 'payment_status', t.payment_status,
        'payment_method', t.payment_method, 'tax_amount', t.tax_amount, 'tax_type', t.tax_type,
        'expense_number', t.expense_number, 'approval_status', t.approval_status, 'category', bc.name)
      into v_tx
    from public.transactions t left join public.budget_categories bc on bc.id = t.category_id
    where t.id = v_ap.transaction_id;
    select c.name into v_org from public.clubs c where c.id = v_ap.club_id;
  else
    select jsonb_build_object('id', t.id, 'description', t.description, 'amount', t.amount, 'date', t.date,
        'payee', t.payee, 'reference', t.reference, 'notes', t.notes, 'payment_status', t.payment_status,
        'payment_method', t.payment_method, 'tax_amount', t.tax_amount, 'tax_type', t.tax_type,
        'expense_number', null, 'approval_status', t.approval_status, 'category', bc.name)
      into v_tx
    from public.association_transactions t left join public.association_budget_categories bc on bc.id = t.category_id
    where t.id = v_ap.transaction_id;
    if v_ap.association_type = 'state' then
      select coalesce(nullif(s.short_name, ''), s.name) into v_org from public.state_associations s where s.id = v_ap.association_id;
    else
      select coalesce(nullif(n.short_name, ''), n.name) into v_org from public.national_associations n where n.id = v_ap.association_id;
    end if;
  end if;

  return jsonb_build_object(
    'approval', to_jsonb(v_ap),
    'is_approver', v_ap.approver_user_id = auth.uid(),
    'organisation', v_org,
    'transaction', v_tx,
    'attachments', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at)
      from public.finance_attachments a
      where a.transaction_table = v_ap.transaction_table and a.transaction_id = v_ap.transaction_id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('status', h.status, 'approver_name', h.approver_name,
          'requested_by_name', h.requested_by_name, 'comment', h.comment,
          'created_at', h.created_at, 'decided_at', h.decided_at) order by h.created_at desc)
      from public.finance_approvals h
      where h.transaction_table = v_ap.transaction_table and h.transaction_id = v_ap.transaction_id
        and h.id <> v_ap.id and h.status <> 'cancelled'
    ), '[]'::jsonb)
  );
end;
$$;

-- Approvals sent to me (the approvals page)
create or replace function public.my_expense_approvals()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(x order by (x->>'status') <> 'pending', x->>'created_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', ap.id, 'status', ap.status, 'created_at', ap.created_at, 'decided_at', ap.decided_at,
      'requested_by_name', ap.requested_by_name, 'comment', ap.comment,
      'description', coalesce(t.description, at.description),
      'amount', coalesce(t.amount, at.amount),
      'payee', coalesce(t.payee, at.payee),
      'organisation', coalesce(c.name, coalesce(nullif(s.short_name, ''), s.name), coalesce(nullif(n.short_name, ''), n.name))
    ) as x
    from public.finance_approvals ap
    left join public.transactions t on ap.transaction_table = 'transactions' and t.id = ap.transaction_id
    left join public.association_transactions at on ap.transaction_table = 'association_transactions' and at.id = ap.transaction_id
    left join public.clubs c on c.id = ap.club_id
    left join public.state_associations s on ap.association_type = 'state' and s.id = ap.association_id
    left join public.national_associations n on ap.association_type = 'national' and n.id = ap.association_id
    where ap.approver_user_id = auth.uid()
      and ap.status <> 'cancelled'
      and (ap.status = 'pending' or ap.decided_at > now() - interval '60 days')
      and (t.id is not null or at.id is not null)
    limit 100
  ) q;
$$;

-- Latest approval for each of these transactions (the sheet and the lists)
create or replace function public.expense_approvals_for(p_table text, p_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  from (
    select distinct on (ap.transaction_id) ap.id, ap.transaction_id, ap.status, ap.approver_user_id,
      ap.approver_name, ap.approver_position, ap.requested_by_name, ap.comment, ap.created_at, ap.decided_at
    from public.finance_approvals ap
    where ap.transaction_table = p_table and ap.transaction_id = any(p_ids) and ap.status <> 'cancelled'
      and public.can_manage_finance_transaction(ap.transaction_table, ap.transaction_id::text)
    order by ap.transaction_id, ap.created_at desc
  ) x;
$$;

-- Rows go with their transaction
create or replace function public.delete_finance_approvals_for_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.finance_approvals where transaction_table = tg_table_name and transaction_id = old.id;
  return old;
end;
$$;

drop trigger if exists finance_approvals_cleanup on public.transactions;
create trigger finance_approvals_cleanup after delete on public.transactions
  for each row execute function public.delete_finance_approvals_for_transaction();
drop trigger if exists finance_approvals_cleanup on public.association_transactions;
create trigger finance_approvals_cleanup after delete on public.association_transactions
  for each row execute function public.delete_finance_approvals_for_transaction();

revoke all on function public.can_manage_finance_org(uuid, uuid, text) from public, anon;
revoke all on function public.expense_approval_setup(uuid, uuid, text) from public, anon;
revoke all on function public.set_expense_approval_settings(uuid, uuid, text, boolean, uuid) from public, anon;
revoke all on function public.request_expense_approval(text, uuid, uuid) from public, anon;
revoke all on function public.decide_expense_approval(uuid, boolean, text) from public, anon;
revoke all on function public.get_expense_approval(uuid) from public, anon;
revoke all on function public.my_expense_approvals() from public, anon;
revoke all on function public.expense_approvals_for(text, uuid[]) from public, anon;
grant execute on function public.can_manage_finance_org(uuid, uuid, text) to authenticated;
grant execute on function public.expense_approval_setup(uuid, uuid, text) to authenticated;
grant execute on function public.set_expense_approval_settings(uuid, uuid, text, boolean, uuid) to authenticated;
grant execute on function public.request_expense_approval(text, uuid, uuid) to authenticated;
grant execute on function public.decide_expense_approval(uuid, boolean, text) to authenticated;
grant execute on function public.get_expense_approval(uuid) to authenticated;
grant execute on function public.my_expense_approvals() to authenticated;
grant execute on function public.expense_approvals_for(text, uuid[]) to authenticated;
