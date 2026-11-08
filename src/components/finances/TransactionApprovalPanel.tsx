import React, { useEffect, useState } from 'react';
import { ShieldCheck, Loader2, Send } from 'lucide-react';
import {
  ApprovalSetup,
  ApprovalStatus,
  ApprovalSummary,
  approverChoices,
  sendForApproval,
  suggestedApprover,
} from '../../utils/expenseApprovals';
import type { FinanceTable } from '../../utils/financeAttachments';

interface TransactionApprovalPanelProps {
  table: FinanceTable;
  transactionId: string;
  approvalStatus: ApprovalStatus;
  isPaid: boolean;
  setup: ApprovalSetup | null;
  latest: ApprovalSummary | null;
  orgName?: string | null;
  onSent: (approverName: string) => void;
  onError: (message: string) => void;
}

const when = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/** Approval section of the transaction sheet (expenses only) */
export const TransactionApprovalPanel: React.FC<TransactionApprovalPanelProps> = ({
  table, transactionId, approvalStatus, isPaid, setup, latest, orgName, onSent, onError,
}) => {
  const choices = approverChoices(setup);
  const [approverId, setApproverId] = useState('');
  const [sending, setSending] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    const keep = latest && choices.some((c) => c.user_id === latest.approver_user_id) ? latest.approver_user_id : '';
    setApproverId(keep || suggestedApprover(setup)?.user_id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup, latest?.id]);

  const enabled = !!setup?.enabled;
  if (approvalStatus === 'not_required' && !(enabled && !isPaid)) return null;

  const send = async () => {
    if (!approverId) return;
    setSending(true);
    try {
      const r = await sendForApproval(table, transactionId, approverId, orgName);
      setPicking(false);
      onSent(r.approver_name);
    } catch (e: any) {
      onError(e?.message || 'Could not send for approval');
    } finally {
      setSending(false);
    }
  };

  const who = latest ? `${latest.approver_name || 'the approver'}${latest.approver_position ? ` (${latest.approver_position})` : ''}` : '';
  const tone = approvalStatus === 'approved' ? 'a-light-g' : approvalStatus === 'declined' ? 'a-light-r' : 'a-light-a';
  const headline =
    approvalStatus === 'pending' ? `Waiting for ${who || 'approval'}`
    : approvalStatus === 'approved' ? `Approved by ${who}`
    : approvalStatus === 'declined' ? `Declined by ${who}`
    : 'Not sent for approval';
  const sub =
    approvalStatus === 'pending' ? `Sent ${when(latest?.created_at)}${latest?.requested_by_name ? ` by ${latest.requested_by_name}` : ''}. It can be marked paid once approved.`
    : approvalStatus === 'approved' ? `${when(latest?.decided_at)}. It can now be marked paid.`
    : approvalStatus === 'declined' ? `${when(latest?.decided_at)}. Change what's needed and send it again.`
    : 'Expenses need approval before they can be marked paid.';

  const showPicker = enabled && !isPaid && (approvalStatus === 'not_required' || approvalStatus === 'declined' || picking);

  return (
    <div className="a-grp">
      <div className="a-lnk">
        <span className="a-tile a-tile-sm"><ShieldCheck size={15} /></span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 a-ink text-sm font-medium"><span className={`a-light ${tone}`} />{headline}</span>
          <span className="block a-dim text-xs mt-0.5">{sub}</span>
        </span>
        {enabled && approvalStatus === 'pending' && !picking && (
          <button type="button" className="a-btn a-btn-sm" onClick={() => setPicking(true)}>Change</button>
        )}
      </div>

      {latest?.comment && approvalStatus !== 'pending' && (
        <div className="a-lnk"><span className="a-mute text-[13.5px] italic">“{latest.comment}”</span></div>
      )}

      {showPicker && (
        choices.length === 0 ? (
          <div className="a-lnk a-dim text-xs">
            No one else on the committee has an AlfiePRO account to approve with. Add them in Settings › Committee.
          </div>
        ) : (
          <div className="a-lnk flex-wrap">
            <label className="sr-only" htmlFor={`approver-${transactionId}`}>Send to</label>
            <select
              id={`approver-${transactionId}`}
              className="a-pick flex-1 min-w-[180px]"
              style={{ height: 38 }}
              value={approverId}
              onChange={(e) => setApproverId(e.target.value)}
            >
              {choices.map((c) => <option key={c.user_id} value={c.user_id}>{c.position_title} · {c.name}</option>)}
            </select>
            <button type="button" className="a-btn a-btn-p a-btn-sm" style={{ height: 38 }} onClick={send} disabled={sending || !approverId}>
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {approvalStatus === 'declined' || picking ? 'Send again' : 'Send for approval'}
            </button>
            {picking && <button type="button" className="a-btn a-btn-sm" style={{ height: 38 }} onClick={() => setPicking(false)}>Cancel</button>}
          </div>
        )
      )}
    </div>
  );
};

export default TransactionApprovalPanel;
