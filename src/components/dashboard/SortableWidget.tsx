import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Palette, Check, TriangleAlert as AlertTriangle } from 'lucide-react';
import { WidgetConfig } from '../../types/dashboard';
import { getWidgetDefinition } from './WidgetRegistry';
import { WidgetColorTheme } from '../../types/dashboard';
import { WIDGET_THEME_OPTIONS } from '../../utils/widgetThemes';

class WidgetErrorBoundary extends React.Component<
  { children: React.ReactNode; widgetType: string },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; widgetType: string }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.error(`Widget "${this.props.widgetType}" crashed:`, error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="a-card h-full flex items-center justify-center p-4">
          <div className="text-center">
            <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto mb-2" />
            <p className="a-dim text-[12px]">Widget failed to load</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  // Check top-level colorTheme first, fallback to settings.colorTheme for backwards compatibility
  const currentTheme = widget.colorTheme || (widget.settings?.colorTheme as WidgetColorTheme) || 'default';

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
        <WidgetErrorBoundary widgetType={widget.type}>
          <WidgetComponent
            widgetId={widget.id}
            isEditMode={isEditMode}
            onRemove={onRemove}
            settings={widget.settings}
            colorTheme={currentTheme}
          />
        </WidgetErrorBoundary>
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
            className="a-em-wb absolute -top-2 -left-2 z-[60] pointer-events-auto cursor-grab active:cursor-grabbing"
            title="Drag to reorder"
          >
            <GripVertical size={16} />
          </div>
          <div className="absolute -top-2 right-10 z-[60]">
            <button
              ref={buttonRef}
              onClick={() => setShowThemePicker(!showThemePicker)}
              className="a-em-wb pointer-events-auto"
              title="Change widget color"
            >
              <Palette size={16} />
            </button>
          </div>
          {showThemePicker && createPortal(
            <div
              ref={dropdownRef}
              className="a-pop fixed min-w-[220px] z-[9999]"
              style={{ padding: 10, top: `${dropdownPosition.top}px`, left: `${dropdownPosition.left}px` }}
            >
              <div className="a-cap mb-2 px-1">Widget colour</div>
              <div className="grid grid-cols-2 gap-2">
                {WIDGET_THEME_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleThemeSelect(option.value)}
                    className="a-pop-item flex items-center gap-2 p-2 rounded-lg text-left"
                  >
                    <div className={`w-6 h-6 rounded ${option.preview} flex-shrink-0`} />
                    <span className="a-ink text-[12.5px] flex-1">{option.label}</span>
                    {currentTheme === option.value && (
                      <Check size={14} className="a-txt-g flex-shrink-0" />
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
