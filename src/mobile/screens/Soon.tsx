import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlfieSails } from '../icons';
import { SubHeader } from '../ui';
import { useMobile } from '../MobileContext';

/** Placeholder for phone screens still being built (each phase replaces some of these). */
export const Soon: React.FC<{ title: string; what: string }> = ({ title, what }) => {
  const navigate = useNavigate();
  const { light } = useMobile();
  return (
    <div className="m-stack">
      <SubHeader title={title} />
      <div className="m-card" style={{ padding: '32px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
        <AlfieSails size={44} light={light} />
        <div className="m-disp" style={{ fontSize: 21, fontWeight: 700 }}>{title} is on its way</div>
        <div className="m-mut" style={{ fontSize: 14, lineHeight: 1.5 }}>{what}</div>
        <button className="m-btn m-btn-g" onClick={() => navigate('/')}>Back to Home</button>
      </div>
    </div>
  );
};
