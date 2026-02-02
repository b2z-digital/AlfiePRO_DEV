import { WidgetConfig, WidgetColorTheme } from './dashboard';

export type TemplateId = 'race' | 'finance' | 'membership' | 'full' | 'custom';

export interface TemplateWidgetConfig extends Omit<WidgetConfig, 'id' | 'rowId'> {
  colorTheme?: WidgetColorTheme;
}

export interface TemplateRowConfig {
  row: number;
  height?: 'default' | 'compact';
}

export interface DashboardTemplate {
  id: TemplateId;
  name: string;
  description: string;
  icon: string;
  defaultLayouts: {
    lg: TemplateWidgetConfig[];
    md: TemplateWidgetConfig[];
    sm: TemplateWidgetConfig[];
  };
  rowConfigs?: TemplateRowConfig[];
}

export interface ClubDashboardTemplate {
  id: string;
  club_id: string;
  template_id: TemplateId;
  name: string;
  description: string;
  layouts: {
    lg: WidgetConfig[];
    md: WidgetConfig[];
    sm: WidgetConfig[];
  };
  assigned_roles: string[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type CommitteeRole = 'commodore' | 'treasurer' | 'secretary' | 'race_officer' | 'membership_officer' | 'social_secretary';
