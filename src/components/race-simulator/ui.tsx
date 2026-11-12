// Shared look for the race simulator: a dark, on-the-water screen whatever the app theme.
// Panels float over the water with a blurred glass background, like the design board.
import React from 'react';
import { AlfieMark } from '../brand/AlfieMark';

export const C = {
  bg: '#060B16',
  head: '#070D1B',
  text: '#F1F4FA',
  mute: 'rgba(235,240,255,.68)',
  faint: 'rgba(235,240,255,.5)',
  blue: '#4DA3FF',
  blueSoft: '#9CCBFF',
  orange: '#FF9F43',
  orangeSoft: '#FFCB96',
  green: '#34D399',
  red: '#F87171',
  line: 'rgba(255,255,255,.08)',
};

export function cx(...a: (string | false | null | undefined)[]) { return a.filter(Boolean).join(' '); }

/** A floating glass panel. */
export function Hud({ className, style, children, as = 'div', ...rest }: React.HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' | 'aside' }) {
  const Tag = as as 'div';
  return (
    <Tag
      className={cx('box-border rounded-[18px] border border-white/[0.08] bg-[rgba(7,13,27,0.82)] shadow-[0_12px_32px_rgba(0,0,0,0.35)] backdrop-blur-[14px]', className)}
      style={style}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Small uppercase label. */
export function Cap({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cx('m-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-[rgba(235,240,255,0.66)]', className)}>{children}</p>;
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; quiet?: boolean; small?: boolean; icon?: boolean };
export function Btn({ primary, quiet, small, icon, className, children, type = 'button', ...rest }: BtnProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border text-[13.5px] font-semibold text-[#F1F4FA] transition-[background,border-color,box-shadow,transform] duration-150 enabled:hover:-translate-y-px enabled:active:translate-y-0 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45',
        small ? 'h-9 px-3' : 'h-10 px-3.5',
        icon && (small ? 'w-9 px-0' : 'w-10 px-0'),
        primary
          ? 'border-[rgba(150,200,255,0.5)] bg-[radial-gradient(130%_150%_at_50%_-30%,#6CB8FF_0%,#2286FF_42%,#0B5FD3_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_10px_24px_-8px_rgba(24,120,255,0.75)] hover:border-[rgba(185,220,255,0.7)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_14px_30px_-8px_rgba(24,120,255,0.85)]'
          : quiet
            ? 'border-transparent bg-transparent text-[#A9D2FF] hover:bg-white/[0.06]'
            : 'border-white/[0.14] bg-gradient-to-b from-white/[0.1] to-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] hover:border-white/25 hover:from-white/[0.16] hover:to-white/[0.06]',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Segmented control. */
export function Seg<T extends string | number>({ value, options, onChange, label, className, size = 'md' }: {
  value: T; options: { value: T; label: React.ReactNode; title?: string }[]; onChange: (v: T) => void; label: string; className?: string; size?: 'sm' | 'md';
}) {
  return (
    <div role="group" aria-label={label} className={cx('flex flex-wrap gap-[3px] rounded-xl bg-black/30 p-[3px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]', className)}>
      {options.map(o => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'cursor-pointer rounded-[9px] border-0 font-medium transition-colors',
            size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-8 px-3 text-[13px]',
            o.value === value ? 'bg-white/10 text-white' : 'bg-transparent text-[rgba(235,240,255,0.72)] hover:text-white',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Rounded tile with the Alfie spectrum edge, for section icons. */
export function Tile({ size = 34, children }: { size?: number; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center text-[#F1F4FA]"
      style={{
        width: size, height: size, borderRadius: '30%', border: '1px solid transparent',
        background: 'linear-gradient(#141A28,#141A28) padding-box,linear-gradient(135deg,#2E7BFF,#8A4DFF 38%,#FF3E9A 70%,#FF8A2B) border-box',
      }}
    >
      {children}
    </span>
  );
}

export function Chip({ tone = 'plain', children, className }: { tone?: 'plain' | 'warn' | 'blue' | 'good'; children: React.ReactNode; className?: string }) {
  const tones = {
    plain: 'bg-white/[0.07] text-[rgba(235,240,255,0.85)] border-transparent',
    warn: 'bg-[rgba(255,159,67,0.14)] text-[#FFCB96] border-[rgba(255,159,67,0.4)]',
    blue: 'bg-[rgba(42,147,255,0.16)] text-[#A9D2FF] border-[rgba(77,163,255,0.45)]',
    good: 'bg-[rgba(52,211,153,0.14)] text-[#A7F3D0] border-[rgba(52,211,153,0.4)]',
  };
  return <span className={cx('inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-semibold', tones[tone], className)}>{children}</span>;
}

/** Alfie, the coach: the same orb as Ask Alfie, so tips and rulings read as coming from Alfie. */
export function AlfieOrb({ size = 32, title }: { size?: number; title?: string }) {
  return <AlfieMark size={size} title={title} />;
}

/** Coach icon (compass rose). */
export function CoachGlyph({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </svg>
  );
}

export function WarnGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFB067" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-px shrink-0">
      <path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17.5v.01" />
    </svg>
  );
}

export function InfoGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9CCBFF" strokeWidth={2} strokeLinecap="round" aria-hidden="true" className="mt-0.5 shrink-0">
      <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.01" />
    </svg>
  );
}

/** 075 → "ENE". */
export function compassName(deg: number): string {
  const n = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return n[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

/** "0:06", "2:30", "-0:04" */
export function clock(s: number): string {
  const neg = s < 0;
  const a = Math.abs(s);
  const m = Math.floor(a / 60), sec = Math.floor(a % 60);
  return `${neg ? '−' : ''}${m}:${String(sec).padStart(2, '0')}`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * The frame every Sailing Academy screen shares, so they all sit the same way at every width: the
 * home screen's margins (16 px on a phone up to 64 px on a wide screen, and the full width between
 * them, like the rest of AlfiePRO), one header (back, a title, a line about it, and anything for
 * the right-hand side, which drops below on a narrow screen), and the same space between sections.
 * `after` is for anything laid over the whole screen (a rule sheet).
 */
export function Page({ onBack, backLabel = 'Sailing Academy', backAria, lead, kicker, title, text, side, after, rootRef, children }: {
  onBack: () => void; backLabel?: string; backAria?: string;
  /** Something before the title (an icon tile). */
  lead?: React.ReactNode;
  kicker?: React.ReactNode; title: React.ReactNode; text?: React.ReactNode;
  /** Chips or a button, on the right of the header. */
  side?: React.ReactNode;
  after?: React.ReactNode;
  rootRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}) {
  return (
    <div ref={rootRef} className="sim-page min-h-full text-[14px] text-[#F1F4FA]" style={{ fontFamily: "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <div className="flex flex-col gap-6 px-4 pb-16 pt-5 sm:px-6 sm:pt-7 lg:px-10 xl:px-16">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Btn onClick={onBack} aria-label={backAria ?? `Back to the ${backLabel}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            {backLabel}
          </Btn>
          {lead}
          <div className="min-w-0 flex-[1_1_300px]">
            {kicker && <Cap className="mb-1">{kicker}</Cap>}
            <h1 className="m-0 font-display text-[clamp(24px,2.3vw,32px)] font-bold leading-[1.12] tracking-[-0.02em]">{title}</h1>
            {text && <p className="m-0 mt-1 max-w-[80ch] text-[14px] leading-snug" style={{ color: C.mute }}>{text}</p>}
          </div>
          {side && <div className="flex flex-wrap items-center gap-2">{side}</div>}
        </header>
        {children}
      </div>
      {after}
    </div>
  );
}
