import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ShieldCheck, Check, X, FileText, Image as ImageIcon, Calendar, User, Tag, Receipt, MessageSquare, Percent, Loader2, ChevronLeft, Inbox,
} from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';
import { decideApproval } from '../../utils/expenseApprovals';
import { FinanceAttachment, formatFileSize, openAttachment } from '../../utils/financeAttachments';

interface ListItem {
  id: string;
  status: 'pending' | 'approved' | 'declined';
  created_at: string;
  decided_at: string | null;
  requested_by_name: string | null;
  comment: string | null;
  description: string;
  amount: number;
  payee: string | null;
  organisation: string | null;
}

interface Detail {
  approval: {
    id: string; status: 'pending' | 'approved' | 'declined' | 'cancelled'; approver_name: string | null; approver_position: string | null;
    requested_by_name: string | null; comment: string | null; created_at: string; decided_at: string | null;
  };
  is_approver: boolean;
  organisation: string | null;
  transaction: {
    description: string; amount: number; date: string; payee: string | null; reference: string | null; notes: string | null;
    payment_status: string; tax_amount: number | null; tax_type: string | null; expense_number: string | null; category: string | null;
  } | null;
  attachments: FinanceAttachment[];
  history: { status: string; approver_name: string | null; comment: string | null; created_at: string; decided_at: string | null }[];
}

const money = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Math.abs(Number(n) || 0));
const day = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const longDay = (d?: string | null) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '');
const tone = (s: string) => (s === 'approved' ? 'a-light-g' : s === 'declined' ? 'a-light-r' : s === 'pending' ? 'a-light-a' : '');
const label = (s: string) => (s === 'approved' ? 'Approved' : s === 'declined' ? 'Declined' : s === 'pending' ? 'Waiting for you' : 'Withdrawn');

const Row = ({ icon, name, children }: { icon: React.ReactNode; name: string; children: React.ReactNode }) => (
  <div className="a-ir"><span className="a-ir-l">{icon}{name}</span><span className="a-ir-v">{children}</span></div>
);

/** Expenses sent to you for approval (linked from the notification and email) */
export const ApprovalsPage: React.FC = () => {
  const { approvalId } = useParams<{ approvalId?: string }>();
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const [items, setItems] = useState<ListItem[] | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [comment, setComment] = useState('');
  const [deciding, setDeciding] = useState<'approve' | 'decline' | null>(null);

  const loadList = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_expense_approvals');
    if (error) console.error('Loading approvals failed', error);
    setItems(Array.isArray(data) ? (data as ListItem[]) : []);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    setDetailError(null);
    const { data, error } = await supabase.rpc('get_expense_approval', { p_approval_id: id });
    if (error) {
      setDetail(null);
      setDetailError("This approval couldn't be found, or it wasn't sent to you.");
    } else {
      setDetail(data as Detail);
    }
    setComment('');
    setLoadingDetail(false);
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => {
    if (approvalId) loadDetail(approvalId);
    else { setDetail(null); setDetailError(null); }
  }, [approvalId, loadDetail]);

  const decide = async (approve: boolean) => {
    if (!detail) return;
    if (!approve && !comment.trim()) {
      addNotification('error', 'Please add a short reason so they know what to change');
      return;
    }
    setDeciding(approve ? 'approve' : 'decline');
    try {
      await decideApproval(detail.approval.id, approve, comment, detail.organisation);
      addNotification('success', approve ? 'Expense approved' : 'Expense declined');
      await Promise.all([loadDetail(detail.approval.id), loadList()]);
    } catch (e: any) {
      addNotification('error', e?.message || 'Could not save your decision');
    } finally {
      setDeciding(null);
    }
  };

  const pending = (items || []).filter((i) => i.status === 'pending');
  const done = (items || []).filter((i) => i.status !== 'pending');
  const tx = detail?.transaction;
  const ap = detail?.approval;

  const listRow = (i: ListItem) => (
    <button
      key={i.id}
      type="button"
      onClick={() => navigate(`/approvals/${i.id}`)}
      className={`a-lnk w-full text-left bg-transparent border-0 cursor-pointer ${approvalId === i.id ? 'a-lnk-on' : ''}`}
    >
      <span className="flex-1 min-w-0">
        <span className="block a-ink text-[14px] font-medium truncate">{i.description}</span>
        <span className="block a-dim text-xs mt-0.5 truncate">{[i.organisation, i.payee].filter(Boolean).join(' · ')}</span>
        <span className="flex items-center gap-1.5 a-dim text-xs mt-1"><span className={`a-light ${tone(i.status)}`} />{label(i.status)} · {day(i.decided_at || i.created_at)}</span>
      </span>
      <span className="a-num a-ink text-[14px] font-semibold">{money(i.amount)}</span>
    </button>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-[22px] p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-24 lg:pl-9">
        <div className="flex flex-wrap items-center gap-4">
          <span className="a-tile a-tile-rim" style={{ width: 52, height: 52 }}><ShieldCheck size={24} /></span>
          <div className="flex-1 min-w-[220px]">
            <h1 className="a-display a-ink m-0 text-[30px] font-bold leading-[1.1]">Approvals</h1>
            <p className="a-mute mt-1 text-[14.5px]">Expenses sent to you to approve before they're paid</p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)] items-start">
          {/* List */}
          <div className={`flex flex-col gap-4 ${approvalId ? 'hidden lg:flex' : ''}`}>
            <div className="a-grp">
              <div className="a-lnk a-grp-head">
                <span className="a-ink text-sm font-semibold flex-1">Waiting for you</span>
                <span className="a-cnt">{pending.length}</span>
              </div>
              {items === null ? (
                <div className="a-lnk justify-center a-dim text-sm"><Loader2 size={16} className="animate-spin" /> Loading…</div>
              ) : pending.length ? pending.map(listRow) : (
                <div className="a-lnk a-dim text-sm">Nothing to approve right now.</div>
              )}
            </div>
            {done.length > 0 && (
              <div className="a-grp">
                <div className="a-lnk a-grp-head"><span className="a-ink text-sm font-semibold flex-1">Recently decided</span></div>
                {done.map(listRow)}
              </div>
            )}
          </div>

          {/* Detail */}
          <div className={approvalId ? '' : 'hidden lg:block'}>
            {!approvalId ? (
              <div className="a-card a-empty py-16 px-6">
                <span className="a-tile" style={{ width: 56, height: 56 }}><Inbox size={24} /></span>
                <div className="a-display a-ink text-lg font-semibold">Choose an expense</div>
                <p className="a-mute m-0 text-sm">Pick one from the list to see its details and attachments.</p>
              </div>
            ) : loadingDetail && !detail ? (
              <div className="a-card flex items-center justify-center gap-3 py-16 a-mute"><Loader2 size={18} className="animate-spin" /> Loading…</div>
            ) : detailError || !detail || !tx || !ap ? (
              <div className="a-card a-empty py-16 px-6">
                <span className="a-tile" style={{ width: 56, height: 56 }}><ShieldCheck size={24} /></span>
                <div className="a-display a-ink text-lg font-semibold">Not available</div>
                <p className="a-mute m-0 text-sm">{detailError || 'This expense may have been deleted.'}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="lg:hidden"><button type="button" className="a-btn a-btn-sm" onClick={() => navigate('/approvals')}><ChevronLeft size={15} />All approvals</button></div>

                <div className="a-amt-hero" style={{ ['--amt-glow' as any]: 'rgba(255,107,107,0.14)' }}>
                  <div className="flex justify-center flex-wrap gap-2.5">
                    {detail.organisation && <span className="a-lb-fmt">{detail.organisation}</span>}
                    <span className="a-lb-fmt"><span className={`a-light ${tone(ap.status)}`} />{ap.status === 'pending' && !detail.is_approver ? 'Waiting for approval' : label(ap.status)}</span>
                  </div>
                  <div className="a-ink text-[17px] font-semibold mt-4">{tx.description}</div>
                  <div className="a-big a-txt-r mt-1.5" style={{ fontSize: 48 }}>{money(tx.amount)}</div>
                  <p className="a-dim text-[13px] mt-2">
                    Sent by {ap.requested_by_name || 'a finance admin'} on {day(ap.created_at)}
                    {!detail.is_approver && ap.approver_name ? ` to ${ap.approver_name}` : ''}
                  </p>
                </div>

                <div className="a-grp">
                  <Row icon={<User size={15} />} name="Payee">{tx.payee || <span className="a-dim">—</span>}</Row>
                  <Row icon={<Calendar size={15} />} name="Date">{longDay(tx.date)}</Row>
                  {tx.category && <Row icon={<Tag size={15} />} name="Category">{tx.category}</Row>}
                  {(Number(tx.tax_amount) || 0) > 0 && (
                    <Row icon={<Percent size={15} />} name="GST">{money(Number(tx.tax_amount))} {tx.tax_type === 'excluded' ? 'added on top' : 'included'}</Row>
                  )}
                  {(tx.expense_number || tx.reference) && (
                    <Row icon={<Receipt size={15} />} name="Reference"><span className="a-mono a-mute">{[tx.expense_number, tx.reference].filter(Boolean).join(' · ')}</span></Row>
                  )}
                  {tx.notes && <Row icon={<MessageSquare size={15} />} name="Notes"><span className="a-mute">{tx.notes}</span></Row>}
                </div>

                <div className="a-grp">
                  <div className="a-lnk a-grp-head"><span className="a-ink text-sm font-semibold flex-1">Attachments</span><span className="a-dim text-xs">{detail.attachments.length || 'None'}</span></div>
                  {detail.attachments.length === 0 && <div className="a-lnk a-dim text-sm">No invoice or receipt was attached.</div>}
                  {detail.attachments.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="a-lnk w-full text-left bg-transparent border-0 cursor-pointer"
                      onClick={() => openAttachment(a).catch(() => addNotification('error', `Couldn't open ${a.file_name}`))}
                    >
                      <span className="a-dim flex">{(a.mime_type || '').startsWith('image/') ? <ImageIcon size={16} /> : <FileText size={16} />}</span>
                      <span className="flex-1 min-w-0 a-ink text-sm truncate">{a.file_name}</span>
                      <span className="a-dim text-xs">{formatFileSize(a.file_size)}</span>
                    </button>
                  ))}
                </div>

                {ap.status === 'pending' && detail.is_approver ? (
                  <div className="a-card flex flex-col gap-3" style={{ padding: 18 }}>
                    <label className="a-cap" htmlFor="approval-comment">Comment</label>
                    <textarea
                      id="approval-comment"
                      rows={3}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Optional when approving. Say what needs changing if you decline."
                      className="a-field w-full"
                      style={{ height: 'auto', padding: '10px 14px', color: 'inherit', resize: 'vertical' }}
                    />
                    <div className="flex gap-2.5">
                      <button type="button" className="a-btn flex-1" style={{ height: 46 }} disabled={!!deciding} onClick={() => decide(false)}>
                        {deciding === 'decline' ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}Decline
                      </button>
                      <button type="button" className="a-btn a-btn-p" style={{ height: 46, flex: 1.4 }} disabled={!!deciding} onClick={() => decide(true)}>
                        {deciding === 'approve' ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}Approve
                      </button>
                    </div>
                  </div>
                ) : ap.status !== 'pending' ? (
                  <div className="a-note">
                    <span className={`flex ${ap.status === 'approved' ? 'a-txt-g' : 'a-txt-r'}`}>{ap.status === 'approved' ? <Check size={17} /> : <X size={17} />}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block a-ink text-[13.5px] font-medium">{label(ap.status)}{ap.approver_name ? ` by ${ap.approver_name}` : ''} on {day(ap.decided_at)}</span>
                      {ap.comment && <span className="block a-mute text-[13px] mt-0.5 italic">“{ap.comment}”</span>}
                    </span>
                  </div>
                ) : null}

                {detail.history.length > 0 && (
                  <div className="a-grp">
                    <div className="a-lnk a-grp-head"><span className="a-ink text-sm font-semibold flex-1">Earlier</span></div>
                    {detail.history.map((h, i) => (
                      <div key={i} className="a-lnk">
                        <span className={`a-light ${tone(h.status)}`} />
                        <span className="flex-1 min-w-0">
                          <span className="block a-ink text-[13.5px]">{label(h.status)}{h.approver_name ? ` · ${h.approver_name}` : ''}</span>
                          {h.comment && <span className="block a-dim text-xs mt-0.5 italic">“{h.comment}”</span>}
                        </span>
                        <span className="a-dim text-xs">{day(h.decided_at || h.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApprovalsPage;
