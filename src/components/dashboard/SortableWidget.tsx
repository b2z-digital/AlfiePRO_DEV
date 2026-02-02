import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Palette, Check } from 'lucide-react';
import { WidgetConfig } from '../../types/dashboard';
import { getWidgetDefinition } from './WidgetRegistry';
import { WidgetColorTheme } from '../../types/dashboard';
import { WIDGET_THEME_OPTIONS } from '../../utils/widgetThemes';

interface SortableWidgetProps {
  widget: WidgetConfig;
  isEditMode: boolean;
  onRemove: () => void;
  onUpdateTheme?: (widgetId: string, theme: WidgetColorTheme) => void;
}

export const SortableWidget: React.FC<SortableWidgetProps> = ({
  widget,
  isEditMode,
  onRemove,
  onUpdateTheme
}) => {
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [isHoveringHandle, setIsHoveringHandle] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const currentTheme = (widget.settings?.colorTheme as WidgetColorTheme) || 'default';

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    setActivatorNodeRef
  } = useSortable({
    id: widget.id,
    disabled: !isEditMode
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const definition = getWidgetDefinition(widget.type);

  if (!definition) {
    return null;
  }

  const WidgetComponent = definition.component;

  useEffect(() => {
    if (showThemePicker && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        left: rect.left
      });
    }
  }, [showThemePicker]);

  useEffect(() => {
    if (!showThemePicker) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setShowThemePicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showThemePicker]);

  const handleThemeSelect = (theme: WidgetColorTheme) => {
    if (onUpdateTheme) {
      onUpdateTheme(widget.id, theme);
    }
    setShowThemePicker(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative h-full ${isEditMode && !isDragging && !isHoveringHandle ? 'animate-wobble' : ''}`}
    >
      <div className="relative">
        <WidgetComponent
          widgetId={widget.id}
          isEditMode={isEditMode}
          onRemove={onRemove}
          settings={widget.settings}
          colorTheme={currentTheme}
        />
      </div>
      {isEditMode && (
        <>
          <div
            className="absolute inset-0 cursor-grab active:cursor-grabbing z-10 pointer-events-none"
          />
          <div
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            onMouseEnter={() => setIsHoveringHandle(true)}
            onMouseLeave={() => setIsHoveringHandle(false)}
            className="absolute -top-2 -left-2 z-[60] bg-slate-700/90 hover:bg-slate-600 text-slate-300 rounded-full p-1.5 shadow-lg transition-colors pointer-events-auto cursor-grab active:cursor-grabbing"
            title="Drag to reorder"
          >
            <GripVertical size={16} />
          </div>
          <div className="absolute -top-2 right-10 z-[60]">
            <button
              ref={buttonRef}
              onClick={() => setShowThemePicker(!showThemePicker)}
              className="bg-indigo-600/90 hover:bg-indigo-500 text-white rounded-full p-1.5 shadow-lg transition-colors pointer-events-auto"
              title="Change widget color"
            >
              <Palette size={16} />
            </button>
          </div>
          {showThemePicker && createPortal(
            <div
              ref={dropdownRef}
              className="fixed bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-3 min-w-[200px] z-[9999]"
              style={{ top: `${dropdownPosition.top}px`, left: `${dropdownPosition.left}px` }}
            >
              <div className="text-xs text-slate-400 mb-2 font-semibold">Widget Color Theme</div>
              <div className="grid grid-cols-2 gap-2">
                {WIDGET_THEME_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleThemeSelect(option.value)}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-700 transition-colors text-left"
                  >
                    <div className={`w-6 h-6 rounded ${option.preview} flex-shrink-0`} />
                    <span className="text-xs text-white flex-1">{option.label}</span>
                    {currentTheme === option.value && (
                      <Check size={14} className="text-green-400 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>,
            document.body
          )}
        </>
      )}
    </div>
  );
};
