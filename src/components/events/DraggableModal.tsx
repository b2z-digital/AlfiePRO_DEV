import React, { useState, useEffect, useRef } from 'react';
import { X, GripVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface DraggableModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  modalType: string; // 'row_settings', 'column_settings', 'widget_settings'
  darkMode?: boolean;
  maxWidth?: string;
  onPositionChange?: (position: 'left' | 'right' | 'center') => void;
}

type ModalPosition = 'left' | 'right' | 'center';

export const DraggableModal: React.FC<DraggableModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  modalType,
  darkMode = false,
  maxWidth = '600px',
  onPositionChange
}) => {
  const { user } = useAuth();
  const [position, setPosition] = useState<ModalPosition>('right');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);
  const [isSnapping, setIsSnapping] = useState(false);

  // Load saved position preference
  useEffect(() => {
    if (isOpen && user) {
      loadPosition();
    }
  }, [isOpen, user, modalType]);

  // Notify parent when position changes
  useEffect(() => {
    if (isOpen && onPositionChange) {
      onPositionChange(position);
    }
  }, [position, isOpen, onPositionChange]);

  const loadPosition = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_modal_preferences')
        .select('position')
        .eq('user_id', user.id)
        .eq('modal_type', modalType)
        .maybeSingle();

      if (!error && data) {
        setPosition(data.position as ModalPosition);
      }
    } catch (err) {
      console.error('Error loading modal position:', err);
    }
  };

  const savePosition = async (newPosition: ModalPosition) => {
    if (!user) return;

    try {
      await supabase
        .from('user_modal_preferences')
        .upsert({
          user_id: user.id,
          modal_type: modalType,
          position: newPosition,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,modal_type'
        });
    } catch (err) {
      console.error('Error saving modal position:', err);
    }
  };

  const snapToLeft = () => {
    setIsSnapping(true);
    setPosition('left');
    setOffset({ x: 0, y: 0 });
    savePosition('left');
    setTimeout(() => setIsSnapping(false), 300);
  };

  const snapToRight = () => {
    setIsSnapping(true);
    setPosition('right');
    setOffset({ x: 0, y: 0 });
    savePosition('right');
    setTimeout(() => setIsSnapping(false), 300);
  };

  const snapToCenter = () => {
    setIsSnapping(true);
    setPosition('center');
    setOffset({ x: 0, y: 0 });
    savePosition('center');
    setTimeout(() => setIsSnapping(false), 300);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.modal-drag-handle')) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      const newOffset = {
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      };
      setOffset(newOffset);

      // Detect snap zones (left 100px or right 100px of screen)
      const snapZone = 100;
      if (e.clientX < snapZone && position !== 'left') {
        setPosition('left');
      } else if (e.clientX > window.innerWidth - snapZone && position !== 'right') {
        setPosition('right');
      }
    }
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      // Save the final position
      savePosition(position);
      // Reset offset when snapping
      if (position === 'left' || position === 'right') {
        setOffset({ x: 0, y: 0 });
      }
    }
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart, position]);

  if (!isOpen) return null;

  const getPositionStyles = () => {
    const baseStyles: React.CSSProperties = {
      maxWidth,
      height: '100vh',
      overflowY: 'auto',
      transition: isSnapping ? 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : isDragging ? 'none' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    };

    if (position === 'center') {
      return {
        ...baseStyles,
        position: 'fixed' as const,
        top: '50%',
        left: '50%',
        transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
        zIndex: 9999
      };
    }

    if (position === 'left') {
      return {
        ...baseStyles,
        position: 'fixed' as const,
        top: 0,
        left: 0,
        width: '100%',
        transform: isDragging ? `translate(${offset.x}px, ${offset.y}px)` : 'none',
        zIndex: 9999
      };
    }

    // right (default)
    return {
      ...baseStyles,
      position: 'fixed' as const,
      top: 0,
      right: 0,
      width: '100%',
      transform: isDragging ? `translate(${offset.x}px, ${offset.y}px)` : 'none',
      zIndex: 9999
    };
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[9998]"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        style={getPositionStyles()}
        className={`shadow-2xl ${
          darkMode
            ? 'bg-slate-900 border-slate-700'
            : 'bg-white border-slate-200'
        } border ${position === 'center' ? 'rounded-xl' : ''}`}
        onMouseDown={handleMouseDown}
      >
        {/* Header with drag handle */}
        <div className={`sticky top-0 z-10 flex items-center justify-between p-4 border-b ${
          darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center gap-2 flex-1">
            <div className="modal-drag-handle cursor-move p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
              <GripVertical size={20} className={darkMode ? 'text-slate-400' : 'text-slate-600'} />
            </div>
            <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              {title}
            </h3>
          </div>

          {/* Snap buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={snapToLeft}
              className={`p-2 rounded transition-colors ${
                position === 'left'
                  ? 'bg-cyan-500 text-white'
                  : darkMode
                  ? 'text-slate-400 hover:bg-slate-800'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title="Snap to left"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={snapToCenter}
              className={`p-2 rounded transition-colors ${
                position === 'center'
                  ? 'bg-cyan-500 text-white'
                  : darkMode
                  ? 'text-slate-400 hover:bg-slate-800'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title="Center"
            >
              <div className="w-2 h-2 rounded-full bg-current" />
            </button>
            <button
              onClick={snapToRight}
              className={`p-2 rounded transition-colors ${
                position === 'right'
                  ? 'bg-cyan-500 text-white'
                  : darkMode
                  ? 'text-slate-400 hover:bg-slate-800'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title="Snap to right"
            >
              <ChevronRight size={18} />
            </button>
            <button
              onClick={onClose}
              className={`ml-2 p-2 rounded transition-colors ${
                darkMode
                  ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {children}
        </div>
      </div>
    </>
  );
};
