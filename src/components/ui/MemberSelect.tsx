import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { Avatar } from './Avatar';

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
}

interface MemberSelectProps {
  members: Member[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
}

export const MemberSelect: React.FC<MemberSelectProps> = ({
  members,
  value,
  onChange,
  placeholder = 'Select member',
  className = '',
  disabled = false,
  allowEmpty = true,
  emptyLabel = 'No owner'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedMember = members.find(m => m.id === value);

  const filteredMembers = members.filter(member =>
    `${member.first_name} ${member.last_name}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (memberId: string) => {
    onChange(memberId);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600
          focus:outline-none focus:ring-2 focus:ring-blue-500
          flex items-center justify-between gap-2
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-600/80 cursor-pointer'}
          transition-colors
        `}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {selectedMember ? (
            <>
              <Avatar
                firstName={selectedMember.first_name}
                lastName={selectedMember.last_name}
                imageUrl={selectedMember.avatar_url}
                size="xs"
              />
              <span className="truncate">
                {selectedMember.first_name} {selectedMember.last_name}
              </span>
            </>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </div>
        <ChevronDown
          size={16}
          className={`text-slate-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-slate-700 border border-slate-600 rounded-lg shadow-xl max-h-80 overflow-hidden">
          <div className="p-2 border-b border-slate-600">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search members..."
                className="w-full pl-9 pr-3 py-2 bg-slate-600 text-slate-200 rounded-lg border border-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>

          <div className="overflow-y-auto max-h-64">
            {allowEmpty && (
              <button
                type="button"
                onClick={() => handleSelect('')}
                className={`
                  w-full px-3 py-2 text-left hover:bg-slate-600 transition-colors
                  flex items-center gap-2
                  ${!value ? 'bg-slate-600' : ''}
                `}
              >
                <div className="w-6 h-6 rounded-full bg-slate-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-slate-400 text-xs">—</span>
                </div>
                <span className="text-slate-400 text-sm">{emptyLabel}</span>
              </button>
            )}

            {filteredMembers.length === 0 ? (
              <div className="px-3 py-6 text-center text-slate-400 text-sm">
                No members found
              </div>
            ) : (
              filteredMembers.map(member => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => handleSelect(member.id)}
                  className={`
                    w-full px-3 py-2 text-left hover:bg-slate-600 transition-colors
                    flex items-center gap-2
                    ${value === member.id ? 'bg-slate-600' : ''}
                  `}
                >
                  <Avatar
                    firstName={member.first_name}
                    lastName={member.last_name}
                    imageUrl={member.avatar_url}
                    size="xs"
                  />
                  <span className="text-slate-200 text-sm truncate">
                    {member.first_name} {member.last_name}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
