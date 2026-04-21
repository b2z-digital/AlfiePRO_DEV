import React, { useState } from 'react';
import { Eye, EyeOff, Check, X } from 'lucide-react';

interface PasswordInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  showRequirements?: boolean;
  confirmValue?: string;
  isConfirmField?: boolean;
}

export function validatePassword(password: string): { valid: boolean; checks: { label: string; met: boolean }[] } {
  const checks = [
    { label: 'At least 6 characters', met: password.length >= 6 },
    { label: 'No leading or trailing spaces', met: password.length === 0 || password === password.trim() },
  ];
  return { valid: checks.every(c => c.met) && password.length >= 6, checks };
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  id,
  label,
  value,
  onChange,
  placeholder = 'Enter your password',
  autoFocus = false,
  showRequirements = false,
  confirmValue,
  isConfirmField = false,
}) => {
  const [show, setShow] = useState(false);

  const { checks } = validatePassword(value);
  const hasStartedTyping = value.length > 0;
  const passwordsMatch = confirmValue !== undefined && value === confirmValue;
  const passwordsMismatch = confirmValue !== undefined && hasStartedTyping && confirmValue.length > 0 && value !== confirmValue;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-300 mb-2">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          minLength={6}
          autoFocus={autoFocus}
          autoComplete={isConfirmField ? 'new-password' : 'new-password'}
          className="w-full px-4 py-3 pr-12 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors"
          tabIndex={-1}
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      {showRequirements && hasStartedTyping && (
        <div className="mt-2 space-y-1">
          {checks.map((check, i) => (
            <div key={i} className="flex items-center gap-1.5">
              {check.met ? (
                <Check size={13} className="text-emerald-400 shrink-0" />
              ) : (
                <X size={13} className="text-red-400 shrink-0" />
              )}
              <span className={`text-xs ${check.met ? 'text-emerald-400' : 'text-red-400'}`}>
                {check.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {isConfirmField && hasStartedTyping && (
        <div className="flex items-center gap-1.5 mt-2">
          {passwordsMatch ? (
            <Check size={13} className="text-emerald-400 shrink-0" />
          ) : passwordsMismatch ? (
            <X size={13} className="text-red-400 shrink-0" />
          ) : null}
          {(passwordsMatch || passwordsMismatch) && (
            <span className={`text-xs ${passwordsMatch ? 'text-emerald-400' : 'text-red-400'}`}>
              {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
