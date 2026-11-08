import { supabase } from './supabase';
import type { FinanceTable } from './financeAttachments';

/**
 * Expense approvals: when a club or association turns them on, every expense
 * entered is sent to someone else on the committee (e.g. the President), who
 * approves or declines it before it can be marked paid. The database enforces
 * the rules (see migration 20261108150000_expense_approvals.sql); this file
 * wraps the calls and sends the notifications and emails.
 */

export type ApprovalStatus = 'not_required' | 'pending' | 'approved' | 'declined';

export interface FinanceOrg {
  clubId?: string | null;
  associationId?: string | null;
  associationType?: 'state' | 'national' | null;
}

export interface Approver {
  position_id: string;
  position_title: string;
  user_id: string;
  name: string;
  email: string | null;
}

export interface ApprovalSetup {
  enabled: boolean;
  default_position_id: string | null;
  me: string;
  approvers: Approver[];
}

export interface ApprovalSummary {
  id: string;
  transaction_id: string;
  status: 'pending' | 'approved' | 'declined';
  approver_user_id: string;
  approver_name: string | null;
  approver_position: string | null;
  requested_by_name: string | null;
  comment: string | null;
  created_at: string;
  decided_at: string | null;
}

const orgArgs = (org: FinanceOrg) => ({
  p_club_id: org.associationId ? null : org.clubId || null,
  p_association_id: org.associationId || null,
  p_association_type: org.associationId ? org.associationType || null : null,
});

export async function getApprovalSetup(org: FinanceOrg): Promise<ApprovalSetup | null> {
  if (!org.clubId && !org.associationId) return null;
  const { data, error } = await supabase.rpc('expense_approval_setup', orgArgs(org));
  if (error) {
    console.error('Loading approval settings failed', error);
    return null;
  }
  const setup = data as ApprovalSetup | null;
  if (!setup || typeof setup !== 'object' || Array.isArray(setup)) return null;
  return { ...setup, approvers: Array.isArray(setup.approvers) ? setup.approvers : [] };
}

export async function saveApprovalSettings(org: FinanceOrg, enabled: boolean, defaultPositionId: string | null) {
  const { error } = await supabase.rpc('set_expense_approval_settings', {
    ...orgArgs(org),
    p_enabled: enabled,
    p_default_position_id: defaultPositionId,
  });
  if (error) throw error;
}

/** Who to suggest: the default position's holder unless that's you, else the first other person */
export function suggestedApprover(setup: ApprovalSetup | null): Approver | null {
  if (!setup) return null;
  const others = setup.approvers.filter((a) => a.user_id !== setup.me);
  return others.find((a) => a.position_id === setup.default_position_id) || others[0] || null;
}

/** Everyone but you, one entry per person (someone can hold two positions) */
export function approverChoices(setup: ApprovalSetup | null): Approver[] {
  if (!setup) return [];
  const seen = new Set<string>();
  return setup.approvers.filter((a) => {
    if (a.user_id === setup.me || seen.has(a.user_id)) return false;
    seen.add(a.user_id);
    return true;
  });
}

export async function latestApprovals(table: FinanceTable, ids: string[]): Promise<Record<string, ApprovalSummary>> {
  if (!ids.length) return {};
  const { data, error } = await supabase.rpc('expense_approvals_for', { p_table: table, p_ids: ids });
  if (error) {
    console.error('Loading approvals failed', error);
    return {};
  }
  const out: Record<string, ApprovalSummary> = {};
  (Array.isArray(data) ? (data as ApprovalSummary[]) : []).forEach((a) => { out[a.transaction_id] = a; });
  return out;
}

const money = (n: unknown) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Math.abs(Number(n) || 0));

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const approvalLink = (id: string) => `${window.location.origin}/approvals/${id}`;

async function notify(opts: {
  userId: string; email?: string | null; name?: string | null; subject: string; html: string;
  clubId?: string | null; orgName?: string | null; link: string;
}) {
  try {
    await supabase.functions.invoke('send-notification', {
      body: {
        recipients: [{ user_id: opts.userId, email: opts.email || undefined, name: opts.name || undefined }],
        subject: opts.subject,
        body: opts.html,
        type: 'expense_approval',
        club_id: opts.clubId || null,
        club_name: opts.orgName || undefined,
        send_email: !!opts.email,
        link_url: opts.link,
      },
    });
  } catch (e) {
    // The approval itself is saved; a missed email shouldn't undo it
    console.error('Approval notification failed', e);
  }
}

/** Sends an expense to someone for approval and lets them know (in-app + email). */
export async function sendForApproval(
  table: FinanceTable,
  transactionId: string,
  approverUserId: string,
  orgName?: string | null,
): Promise<{ id: string; approver_name: string }> {
  const { data, error } = await supabase.rpc('request_expense_approval', {
    p_table: table,
    p_transaction_id: transactionId,
    p_approver_user_id: approverUserId,
  });
  if (error) throw error;
  const r = data as {
    id: string; approver_user_id: string; approver_name: string; approver_email: string | null;
    requested_by_name: string; club_id: string | null; description: string; amount: number; payee: string | null;
  };
  const link = approvalLink(r.id);
  await notify({
    userId: r.approver_user_id,
    email: r.approver_email,
    name: r.approver_name,
    clubId: r.club_id,
    orgName,
    link,
    subject: `Expense to approve: ${r.description} (${money(r.amount)})`,
    html:
      `<p>${esc(r.requested_by_name)} has sent you an expense to approve${orgName ? ` for ${esc(orgName)}` : ''}.</p>` +
      `<p><strong>${esc(r.description)}</strong><br/>${money(r.amount)}${r.payee ? ` to ${esc(r.payee)}` : ''}</p>` +
      `<p>It can't be marked as paid until you approve it.</p>` +
      `<p><a href="${link}">Review and approve</a></p>`,
  });
  return { id: r.id, approver_name: r.approver_name };
}

/** Approve or decline, and tell the person who sent it. */
export async function decideApproval(approvalId: string, approve: boolean, comment: string, orgName?: string | null) {
  const { data, error } = await supabase.rpc('decide_expense_approval', {
    p_approval_id: approvalId,
    p_approve: approve,
    p_comment: comment,
  });
  if (error) throw error;
  const r = data as {
    requested_by: string; requested_by_name: string; requested_by_email: string | null; approver_name: string;
    club_id: string | null; description: string; amount: number;
  };
  const link = approvalLink(approvalId);
  await notify({
    userId: r.requested_by,
    email: r.requested_by_email,
    name: r.requested_by_name,
    clubId: r.club_id,
    orgName,
    link,
    subject: `${approve ? 'Approved' : 'Declined'}: ${r.description} (${money(r.amount)})`,
    html:
      `<p>${esc(r.approver_name)} has <strong>${approve ? 'approved' : 'declined'}</strong> the expense ` +
      `<strong>${esc(r.description)}</strong> (${money(r.amount)}).</p>` +
      (comment.trim() ? `<p>“${esc(comment.trim())}”</p>` : '') +
      (approve
        ? '<p>It can now be marked as paid.</p>'
        : '<p>Open the expense in Finances to change it and send it for approval again.</p>') +
      `<p><a href="${link}">View the expense</a></p>`,
  });
  return r;
}

export function approvalErrorMessage(e: unknown): string {
  const msg = (e as { message?: string })?.message || '';
  if (/needs approval before it can be marked paid/i.test(msg)) return 'This expense needs approval before it can be marked paid.';
  return msg || 'Something went wrong. Please try again.';
}
