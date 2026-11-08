import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ShieldCheck, Users, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { ApprovalSetup, FinanceOrg, getApprovalSetup, saveApprovalSettings } from '../../utils/expenseApprovals';

interface ExpenseApprovalSettingsProps {
  associationId?: string;
  associationType?: 'state' | 'national';
  onOpenCommittee?: () => void;
}

/** Settings › Finance › Expense approvals */
export const ExpenseApprovalSettings: React.FC<ExpenseApprovalSettingsProps> = ({ associationId, associationType, onOpenCommittee }) => {
  const { currentClub } = useAuth();
  const { addNotification } = useNotifications();
  const org: FinanceOrg = useMemo(
    () => (associationId && associationType ? { associationId, associationType } : { clubId: currentClub?.clubId }),
    [associationId, associationType, currentClub?.clubId],
  );

  const [setup, setSetup] = useState<ApprovalSetup | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [positionId, setPositionId] = useState<string>('');

  useEffect(() => {
    let live = true;
    setLoading(true);
    getApprovalSetup(org).then((s) => {
      if (!live) return;
      setSetup(s);
      setEnabled(!!s?.enabled);
      setPositionId(s?.default_position_id || '');
      setLoading(false);
    });
    return () => { live = false; };
  }, [org]);

  const approvers = setup?.approvers || [];
  const dirty = !!setup && (enabled !== setup.enabled || (positionId || null) !== (setup.default_position_id || null));
  const canTurnOn = approvers.length > 0;

  const save = async () => {
    if (enabled && !positionId && approvers.length) {
      addNotification('error', 'Choose who approves expenses by default');
      return;
    }
    setSaving(true);
    try {
      await saveApprovalSettings(org, enabled, positionId || null);
      setSetup((s) => (s ? { ...s, enabled, default_position_id: positionId || null } : s));
      addNotification('success', enabled ? 'Expense approvals are on' : 'Expense approvals are off');
    } catch (e: any) {
      addNotification('error', e?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="a-card flex items-center justify-center gap-3 py-16 a-mute">
        <Loader2 size={18} className="animate-spin" /> Loading…
      </div>
    );
  }

  if (!setup) {
    return <div className="a-card p-8 a-mute">Only finance admins can change expense approvals.</div>;
  }

  return (
    <div className="flex flex-col gap-4 max-w-[760px]">
      <section className="a-card" style={{ padding: 22 }}>
        <div className="flex items-start gap-4">
          <span className="a-tile" style={{ width: 46, height: 46 }}><ShieldCheck size={21} /></span>
          <div className="flex-1 min-w-0">
            <h2 className="a-display a-ink text-[20px] font-semibold">Expense approvals</h2>
            <p className="a-mute text-[14px] mt-1 leading-relaxed">
              Every expense entered is sent to someone else on the committee to approve before it can be marked paid,
              like a two-signature bank account. They get a notification and an email, and can approve or decline with a comment.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Expenses need approval"
            className="a-sw mt-1"
            disabled={!canTurnOn && !enabled}
            onClick={() => setEnabled((v) => !v)}
          />
        </div>

        {!canTurnOn && (
          <div className="a-note mt-5">
            <span className="a-txt-b flex"><Users size={17} /></span>
            <span className="flex-1 min-w-0">
              <span className="block a-ink text-[13.5px] font-medium">Add your committee first</span>
              <span className="block a-dim text-xs mt-0.5">Approvers come from your committee positions, and need an AlfiePRO account to sign in and approve.</span>
            </span>
            {onOpenCommittee && <button type="button" className="a-btn a-btn-sm" onClick={onOpenCommittee}>Open committee</button>}
          </div>
        )}

        {canTurnOn && (
          <div className="mt-5 flex flex-col gap-2">
            <label className="a-cap" htmlFor="approval-default">Sent to by default</label>
            <select
              id="approval-default"
              className="a-pick w-full"
              value={positionId}
              onChange={(e) => setPositionId(e.target.value)}
            >
              <option value="">Choose a committee position…</option>
              {approvers.map((a) => (
                <option key={a.position_id} value={a.position_id}>{a.position_title} · {a.name}</option>
              ))}
            </select>
            <p className="a-dim text-xs">
              Whoever enters an expense can send it to someone else on the committee instead. You can never approve your own expense:
              if you are the default approver, your expenses go to the next person.
            </p>
          </div>
        )}
      </section>

      <section className="a-card" style={{ padding: 22 }}>
        <p className="a-cap mb-3">How it works</p>
        <ol className="flex flex-col gap-3 text-[14px] a-mute">
          {[
            ['Enter the expense', 'Attach the supplier invoice and choose who approves it. It is saved as Awaiting payment.'],
            ['They approve or decline', 'The approver gets a notification and email, opens the expense and its attachments, and approves or declines with a comment.'],
            ['Mark it paid', 'Once approved, the expense can be marked Paid. Declined expenses can be changed and sent again.'],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="a-tile a-tile-sm flex-shrink-0" style={{ width: 28, height: 28, fontSize: 13, fontWeight: 600 }}>{i + 1}</span>
              <span><span className="a-ink font-medium">{t}.</span> {d}</span>
            </li>
          ))}
        </ol>
        <p className="a-dim text-xs mt-4">
          Imported bank transactions and automatic payments (such as remittances) are recorded as they are and don't need approval.
          Changing the amount of an approved expense sends it back for approval.
        </p>
      </section>

      <div className="flex justify-end gap-2.5">
        {dirty && (
          <button type="button" className="a-btn" onClick={() => { setEnabled(!!setup.enabled); setPositionId(setup.default_position_id || ''); }} disabled={saving}>
            Discard
          </button>
        )}
        <button type="button" className="a-btn a-btn-p" onClick={save} disabled={!dirty || saving}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
};

export default ExpenseApprovalSettings;
