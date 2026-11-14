// The Sailing Academy site's frame: the AlfiePRO Sailing Academy lockup, the top bar and the foot.
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../../Logo';

export const INK = { bg: '#060B16', panel: '#0B1426', panel2: '#0E1E3D', text: '#F1F4FA', mute: 'rgba(235,240,255,.8)', faint: 'rgba(235,240,255,.7)', line: 'rgba(255,255,255,.1)', blue: '#4DA3FF', button: '#1A66DB', orange: '#FF9F43', peach: '#FFCB96', green: '#34D399' };
export const DISPLAY = "'Bricolage Grotesque', 'Instrument Sans', system-ui, sans-serif";
export const BODY = "'Instrument Sans', system-ui, sans-serif";

export function Brand({ to, small = false }: { to: string; small?: boolean }) {
  return (
    <Link to={to} className="flex items-center gap-3 no-underline" style={{ color: '#fff' }} aria-label="AlfiePRO Sailing Academy home">
      <Logo className={small ? '!h-8 !w-8' : '!h-10 !w-10'} />
      <span className="flex flex-col leading-none">
        <span style={{ fontFamily: DISPLAY, fontSize: small ? 19 : 22 }}><span className="font-light">Alfie</span><span className="font-bold">PRO</span></span>
        <span className="mt-1 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: 'rgba(241,244,250,.82)' }}>Sailing Academy</span>
      </span>
    </Link>
  );
}

export function Wrap({ children, style, className = '' }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  return <div className={`mx-auto box-border w-full max-w-[1280px] px-5 md:px-14 ${className}`} style={style}>{children}</div>;
}

/** The site's pages: dark, with the Academy's type. */
export function Page({ children }: { children: ReactNode }) {
  return <div className="min-h-screen w-full" style={{ background: INK.bg, color: INK.text, fontFamily: BODY, fontSize: 17, lineHeight: 1.6 }}>{children}</div>;
}

export function Button({ to, onClick, children, kind = 'primary', big = false, disabled = false, type = 'button' }: { to?: string; onClick?: () => void; children: ReactNode; kind?: 'primary' | 'ghost' | 'light'; big?: boolean; disabled?: boolean; type?: 'button' | 'submit' }) {
  const style: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: big ? 62 : 52, padding: big ? '0 32px' : '0 24px', borderRadius: 999,
    fontSize: big ? 19 : 17, fontWeight: 700, textDecoration: 'none', cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? 0.7 : 1,
    ...(kind === 'primary' ? { background: INK.button, color: '#fff', border: 0 } : kind === 'light' ? { background: '#fff', color: INK.bg, border: 0 } : { background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,.3)' }),
  };
  return to ? <Link to={to} style={style}>{children}</Link> : <button type={type} onClick={onClick} disabled={disabled} style={style}>{children}</button>;
}

export function Header({ base, signedIn }: { base: string; signedIn: boolean }) {
  const home = base || '/';
  return (
    <Wrap className="flex items-center justify-between gap-8 py-8">
      <Brand to={home} />
      <nav aria-label="Main" className="hidden items-center gap-7 lg:flex">
        <a href={`${home}#see-it`} style={{ color: INK.text, textDecoration: 'none', fontWeight: 500 }}>See it</a>
        <a href={`${home}#how`} style={{ color: INK.text, textDecoration: 'none', fontWeight: 500 }}>How it works</a>
        <a href={`${home}#clubs`} style={{ color: INK.text, textDecoration: 'none', fontWeight: 500 }}>AlfiePRO clubs</a>
        <a href={`${home}#pricing`} style={{ color: INK.text, textDecoration: 'none', fontWeight: 500 }}>Pricing</a>
      </nav>
      <div className="flex items-center gap-3">
        {signedIn
          ? <><Link to={`${base}/plan`} style={{ color: INK.text, textDecoration: 'none', fontWeight: 600, padding: '12px 14px' }}>Your plan</Link><Button to={`${base}/sail`}>Open the Academy</Button></>
          : <><Link to={`${base}/start?signin=1`} style={{ color: INK.text, textDecoration: 'none', fontWeight: 600, padding: '12px 14px' }}>Sign in</Link><Button to={`${base}/start`}>Try it free</Button></>}
      </div>
    </Wrap>
  );
}

export function Footer() {
  return (
    <footer style={{ borderTop: `1px solid ${INK.line}`, padding: '56px 0 72px' }}>
      <Wrap className="flex flex-wrap items-center justify-between gap-6" style={{ fontSize: 15, color: INK.faint }}>
        <span><span style={{ fontFamily: DISPLAY, color: '#fff' }}><span className="font-light">Alfie</span><span className="font-bold">PRO</span></span> Sailing Academy · Part of AlfiePRO, the platform for radio yacht clubs</span>
        <span className="flex gap-6">
          <a href="https://app.alfiepro.com.au/privacy-policy" style={{ color: '#9CCBFF' }}>Privacy</a>
          <a href="https://app.alfiepro.com.au/terms-of-service" style={{ color: '#9CCBFF' }}>Terms</a>
          <a href="mailto:support@alfiepro.com.au" style={{ color: '#9CCBFF' }}>Contact</a>
        </span>
      </Wrap>
    </footer>
  );
}

export function Check({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={INK.green} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none', marginTop: 4 }}><path d="M5 12l5 5 9-10" /></svg>
      <span>{children}</span>
    </li>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[14px] font-bold uppercase tracking-[0.18em]" style={{ color: INK.orange }}>{children}</p>;
}

export function H2({ children, id }: { children: ReactNode; id?: string }) {
  return <h2 id={id} className="m-0 mt-3" style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 'clamp(34px, 4.2vw, 52px)', lineHeight: 1.08, letterSpacing: '-.025em' }}>{children}</h2>;
}
