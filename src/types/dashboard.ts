export type WidgetSize = '1x1' | '2x1' | '1x2' | '2x2' | '3x1' | '1x3' | '3x2' | '2x3';

export interface WidgetPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetConfig {
  id: string;
  type: string;
  position: WidgetPosition;
  settings?: Record<string, any>;
  colorTheme?: WidgetColorTheme;
  rowId?: string;
  columnSpan?: number;
  columnIndex?: number;
}

export interface DashboardRow {
  id: string;
  columns: number;
  widgetIds: string[];
  order: number;
  height?: 'default' | 'compact';
}

export interface DashboardLayout {
  widgets: WidgetConfig[];
  rows: DashboardRow[];
  version: number;
}

export interface WidgetDefinition {
  id: string;
  type: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  defaultSize: WidgetSize;
  minSize?: WidgetSize;
  maxSize?: WidgetSize;
  component: React.ComponentType<WidgetProps>;
  category: 'overview' | 'finance' | 'membership' | 'race' | 'communication' | 'analytics';
  requiredPermissions?: string[];
  preview?: string;
  associationOnly?: boolean;
}

export type WidgetColorTheme = 'default' | 'purple' | 'blue' | 'green' | 'orange' | 'pink' | 'red' | 'indigo' | 'teal' | 'amber';

export interface WidgetThemeColors {
  background: string;
  border: string;
  accentText: string;
  accentBg: string;
}

export interface WidgetProps {
  widgetId: string;
  isEditMode?: boolean;
  onRemove?: () => void;
  onConfigure?: () => void;
  settings?: Record<string, any>;
  colorTheme?: WidgetColorTheme;
}

export interface DashboardState {
  layout: DashboardLayout;
  isEditMode: boolean;
  isDragging: boolean;
}
