/** Agree to the community guidelines before the club feed and chats (once per member). */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { useAuth } from '../../contexts/AuthContext';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';
import { acceptTerms, hasAcceptedTerms, loadTerms } from '../terms';

const accepted = new Set<string>();

const TermsSheet: React.FC<{ onAccept: () => Promise<void>; onLeave: () => void }> = ({ onAccept, onLeave }) => {
  const [terms, setTerms] = useState<{ title: string; html: string } | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { loadTerms().then(setTerms).catch(() => setTerms(null)); }, []);
  const html = useMemo(() => (terms?.html ? DOMPurify.sanitize(terms.html) : ''), [terms?.html]);
  const agree = async () => {
    setBusy(true); setErr(null);
    try { await onAccept(); } catch { setErr(navigator.onLine ? 'Couldn\'t save that. Try again.' : 'No signal. Try again when you\'re back online.'); setBusy(false); }
  };
  return (
    <>
      <div className="m-veil" style={{ background: 'rgba(2,4,10,.82)' }} />
      <div className="m-sheet" role="dialog" aria-modal="true" aria-labelledby="m-terms-t">
        <span className="m-grab" />
        <span style={{ width: 48, height: 48, borderRadius: 15, background: 'rgba(10,132,255,.16)', color: 'var(--m-blue-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '6px 0 12px' }}><Icon name="club" size={24} /></span>
        <p id="m-terms-t" style={{ margin: '0 0 6px', fontSize: 21, fontWeight: 700 }}>Community guidelines</p>
        <p className="m-mut" style={{ margin: '0 0 14px', fontSize: 14.5, lineHeight: 1.5 }}>
          Before you post or chat, please agree to the Terms of Service. Be respectful: abusive or objectionable posts aren't allowed, and anything reported goes to your club's admins.
        </p>
        <div className="m-card" style={{ overflow: 'hidden' }}>
          <button className="m-li" aria-expanded={open} onClick={() => setOpen(o => !o)} disabled={!terms}>
            <Icon name="doc" size={20} />
            <span style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>{terms === undefined ? 'Loading the terms…' : terms ? terms.title : 'Terms of Service'}</span>
            {terms && <Icon name={open ? 'down' : 'chevron'} size={18} />}
          </button>
          {open && html && <div className="m-terms-body" style={{ borderTop: '1px solid var(--m-line)' }} dangerouslySetInnerHTML={{ __html: html }} />}
        </div>
        {err && <p style={{ color: 'var(--m-red-ink)', fontSize: 14, margin: '12px 0 0' }}>{err}</p>}
        <button className="m-btn m-btn-p" style={{ width: '100%', marginTop: 16 }} disabled={busy} onClick={() => void agree()}>{busy ? 'Saving…' : 'Agree and continue'}</button>
        <button className="m-btn" style={{ width: '100%', marginTop: 10 }} onClick={onLeave}>Not now</button>
      </div>
    </>
  );
};

export const TermsGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { tap } = useMobile();
  const navigate = useNavigate();
  const id = user?.id;
  const [ok, setOk] = useState<boolean | null>(() => (id && accepted.has(id) ? true : null));
  useEffect(() => {
    if (!id || accepted.has(id)) { setOk(true); return; }
    let live = true;
    hasAcceptedTerms(id).then(a => { if (a) accepted.add(id); if (live) setOk(a); });
    return () => { live = false; };
  }, [id]);
  return (
    <>
      {children}
      {ok === false && id && (
        <TermsSheet
          onAccept={async () => { await acceptTerms(id); accepted.add(id); tap('success'); setOk(true); }}
          onLeave={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
        />
      )}
    </>
  );
};
