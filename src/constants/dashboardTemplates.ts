import { DashboardTemplate } from '../types/dashboardTemplates';
import { v4 as uuidv4 } from 'uuid';

export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  {
    id: 'a1111111-1111-1111-1111-111111111111',
    name: 'Race Management',
    description: 'Perfect for Race Officers - focuses on events, weather, and race results',
    icon: 'Calendar',
    rowConfigs: [
      { row: 0, height: 'compact' },
      { row: 1, height: 'default' },
      { row: 3, height: 'default' },
    ],
    defaultLayouts: {
      lg: [
        { type: 'event-count', row: 0, col: 0, width: 4, height: 1, settings: {}, colorTheme: 'purple', position: { x: 0, y: 0, w: 4, h: 1 } },
        { type: 'event-websites', row: 0, col: 4, width: 4, height: 1, settings: {}, colorTheme: 'red', position: { x: 4, y: 0, w: 4, h: 1 } },
        { type: 'tasks-count', row: 0, col: 8, width: 4, height: 1, settings: {}, colorTheme: 'blue', position: { x: 8, y: 0, w: 4, h: 1 } },
        { type: 'upcoming-events', row: 1, col: 0, width: 6, height: 2, settings: {}, colorTheme: 'default', position: { x: 0, y: 1, w: 6, h: 2 } },
        { type: 'recent-results', row: 1, col: 6, width: 6, height: 2, settings: {}, colorTheme: 'default', position: { x: 6, y: 1, w: 6, h: 2 } },
        { type: 'members-by-class', row: 3, col: 0, width: 4, height: 2, settings: {}, colorTheme: 'default', position: { x: 0, y: 3, w: 4, h: 2 } },
        { type: 'event-participation', row: 3, col: 4, width: 4, height: 2, settings: {}, colorTheme: 'default', position: { x: 4, y: 3, w: 4, h: 2 } },
        { type: 'weather', row: 3, col: 8, width: 4, height: 2, settings: {}, colorTheme: 'default', position: { x: 8, y: 3, w: 4, h: 2 } },
      ],
      md: [
        { id: uuidv4(), type: 'event-count', row: 0, col: 0, width: 4, height: 1, settings: {} },
        { id: uuidv4(), type: 'event-websites', row: 0, col: 4, width: 4, height: 1, settings: {} },
        { id: uuidv4(), type: 'tasks-count', row: 0, col: 8, width: 4, height: 1, settings: {} },
        { id: uuidv4(), type: 'upcoming-events', row: 1, col: 0, width: 6, height: 2, settings: {} },
        { id: uuidv4(), type: 'recent-results', row: 1, col: 6, width: 6, height: 2, settings: {} },
        { id: uuidv4(), type: 'members-by-class', row: 3, col: 0, width: 6, height: 2, settings: {} },
        { id: uuidv4(), type: 'event-participation', row: 3, col: 6, width: 6, height: 2, settings: {} },
        { id: uuidv4(), type: 'weather', row: 5, col: 0, width: 12, height: 2, settings: {} },
      ],
      sm: [
        { id: uuidv4(), type: 'event-count', row: 0, col: 0, width: 4, height: 1, settings: {} },
        { id: uuidv4(), type: 'event-websites', row: 1, col: 0, width: 4, height: 1, settings: {} },
        { id: uuidv4(), type: 'tasks-count', row: 2, col: 0, width: 4, height: 1, settings: {} },
        { id: uuidv4(), type: 'upcoming-events', row: 3, col: 0, width: 4, height: 2, settings: {} },
        { id: uuidv4(), type: 'recent-results', row: 5, col: 0, width: 4, height: 2, settings: {} },
        { id: uuidv4(), type: 'members-by-class', row: 7, col: 0, width: 4, height: 2, settings: {} },
        { id: uuidv4(), type: 'event-participation', row: 9, col: 0, width: 4, height: 2, settings: {} },
        { id: uuidv4(), type: 'weather', row: 11, col: 0, width: 4, height: 2, settings: {} },
      ]
    }
  },
  {
    id: 'b2222222-2222-2222-2222-222222222222',
    name: 'Finance Management',
    description: 'Perfect for Treasurers - focuses on financial health and transactions',
    icon: 'DollarSign',
    defaultLayouts: {
      lg: [
        { id: uuidv4(), type: 'financial-health', row: 0, col: 0, width: 6, height: 2, settings: {} },
        { id: uuidv4(), type: 'membership-status', row: 0, col: 6, width: 6, height: 2, settings: {} },
        { id: uuidv4(), type: 'activity-feed', row: 2, col: 0, width: 6, height: 2, settings: {} },
        { id: uuidv4(), type: 'members-count', row: 2, col: 6, width: 3, height: 1, settings: {} },
        { id: uuidv4(), type: 'tasks-count', row: 3, col: 6, width: 3, height: 1, settings: {} },
      ],
      md: [
        { id: uuidv4(), type: 'financial-health', row: 0, col: 0, width: 6, height: 2, settings: {} },
        { id: uuidv4(), type: 'membership-status', row: 0, col: 6, width: 6, height: 2, settings: {} },
        { id: uuidv4(), type: 'activity-feed', row: 2, col: 0, width: 12, height: 2, settings: {} },
      ],
      sm: [
        { id: uuidv4(), type: 'financial-health', row: 0, col: 0, width: 4, height: 2, settings: {} },
        { id: uuidv4(), type: 'membership-status', row: 2, col: 0, width: 4, height: 2, settings: {} },
        { id: uuidv4(), type: 'activity-feed', row: 4, col: 0, width: 4, height: 2, settings: {} },
      ]
    }
  },
  {
    id: 'c3333333-3333-3333-3333-333333333333',
    name: 'Membership Management',
    description: 'Perfect for Membership Officers - focuses on members and engagement',
    icon: 'Users',
    defaultLayouts: {
      lg: [
        { id: uuidv4(), type: 'members-count', row: 0, col: 0, width: 3, height: 1, settings: {} },
        { id: uuidv4(), type: 'membership-status', row: 0, col: 3, width: 6, height: 2, settings: {} },
        { id: uuidv4(), type: 'member-engagement', row: 0, col: 9, width: 3, height: 1, settings: {} },
        { id: uuidv4(), type: 'activity-feed', row: 1, col: 0, width: 3, height: 3, settings: {} },
        { id: uuidv4(), type: 'boat-class-distribution', row: 2, col: 3, width: 6, height: 2, settings: {} },
        { id: uuidv4(), type: 'upcoming-events', row: 1, col: 9, width: 3, height: 3, settings: {} },
      ],
      md: [
        { id: uuidv4(), type: 'members-count', row: 0, col: 0, width: 6, height: 1, settings: {} },
        { id: uuidv4(), type: 'member-engagement', row: 0, col: 6, width: 6, height: 1, settings: {} },
        { id: uuidv4(), type: 'membership-status', row: 1, col: 0, width: 6, height: 2, settings: {} },
        { id: uuidv4(), type: 'activity-feed', row: 1, col: 6, width: 6, height: 2, settings: {} },
      ],
      sm: [
        { id: uuidv4(), type: 'members-count', row: 0, col: 0, width: 4, height: 1, settings: {} },
        { id: uuidv4(), type: 'membership-status', row: 1, col: 0, width: 4, height: 2, settings: {} },
        { id: uuidv4(), type: 'activity-feed', row: 3, col: 0, width: 4, height: 2, settings: {} },
      ]
    }
  },
  {
    id: 'd4444444-4444-4444-4444-444444444444',
    name: 'Club Secretary',
    description: 'Perfect for Club Secretaries - focuses on applications, communications, and administrative tasks',
    icon: 'Clipboard',
    rowConfigs: [
      { row: 0, height: 'compact' },
      { row: 1, height: 'default' },
    ],
    defaultLayouts: {
      lg: [
        { type: 'pending-applications', row: 0, col: 0, width: 4, height: 1, settings: {}, colorTheme: 'amber', position: { x: 0, y: 0, w: 4, h: 1 } },
        { type: 'unread-communications', row: 0, col: 4, width: 4, height: 1, settings: {}, colorTheme: 'blue', position: { x: 4, y: 0, w: 4, h: 1 } },
        { type: 'membership-renewals', row: 0, col: 8, width: 4, height: 1, settings: {}, colorTheme: 'orange', position: { x: 8, y: 0, w: 4, h: 1 } },
        { type: 'recent-applications', row: 1, col: 0, width: 4, height: 2, settings: {}, colorTheme: 'default', position: { x: 0, y: 1, w: 4, h: 2 } },
        { type: 'latest-news', row: 1, col: 4, width: 4, height: 2, settings: {}, colorTheme: 'default', position: { x: 4, y: 1, w: 4, h: 2 } },
        { type: 'upcoming-meetings', row: 1, col: 8, width: 4, height: 2, settings: {}, colorTheme: 'default', position: { x: 8, y: 1, w: 4, h: 2 } },
      ],
      md: [
        { id: uuidv4(), type: 'pending-applications', row: 0, col: 0, width: 4, height: 1, settings: {} },
        { id: uuidv4(), type: 'unread-communications', row: 0, col: 4, width: 4, height: 1, settings: {} },
        { id: uuidv4(), type: 'membership-renewals', row: 0, col: 8, width: 4, height: 1, settings: {} },
        { id: uuidv4(), type: 'recent-applications', row: 1, col: 0, width: 6, height: 2, settings: {} },
        { id: uuidv4(), type: 'latest-news', row: 1, col: 6, width: 6, height: 2, settings: {} },
        { id: uuidv4(), type: 'upcoming-meetings', row: 3, col: 0, width: 12, height: 2, settings: {} },
      ],
      sm: [
        { id: uuidv4(), type: 'pending-applications', row: 0, col: 0, width: 4, height: 1, settings: {} },
        { id: uuidv4(), type: 'unread-communications', row: 1, col: 0, width: 4, height: 1, settings: {} },
        { id: uuidv4(), type: 'membership-renewals', row: 2, col: 0, width: 4, height: 1, settings: {} },
        { id: uuidv4(), type: 'recent-applications', row: 3, col: 0, width: 4, height: 2, settings: {} },
        { id: uuidv4(), type: 'latest-news', row: 5, col: 0, width: 4, height: 2, settings: {} },
        { id: uuidv4(), type: 'upcoming-meetings', row: 7, col: 0, width: 4, height: 2, settings: {} },
      ]
    }
  },
  {
    id: 'e5555555-5555-5555-5555-555555555555',
    name: 'Full Overview',
    description: 'Perfect for Commodores and Admins - comprehensive view of all club activities',
    icon: 'LayoutGrid',
    defaultLayouts: {
      lg: [
        { id: uuidv4(), type: 'members-count', row: 0, col: 0, width: 3, height: 1, settings: {} },
        { id: uuidv4(), type: 'event-count', row: 0, col: 3, width: 3, height: 1, settings: {} },
        { id: uuidv4(), type: 'tasks-count', row: 0, col: 6, width: 3, height: 1, settings: {} },
        { id: uuidv4(), type: 'financial-health', row: 0, col: 9, width: 3, height: 2, settings: {} },
        { id: uuidv4(), type: 'upcoming-events', row: 1, col: 0, width: 6, height: 2, settings: {} },
        { id: uuidv4(), type: 'weather', row: 1, col: 6, width: 3, height: 1, settings: {} },
        { id: uuidv4(), type: 'recent-results', row: 3, col: 0, width: 6, height: 2, settings: {} },
        { id: uuidv4(), type: 'membership-status', row: 3, col: 6, width: 6, height: 2, settings: {} },
        { id: uuidv4(), type: 'activity-feed', row: 2, col: 6, width: 3, height: 1, settings: {} },
      ],
      md: [
        { id: uuidv4(), type: 'members-count', row: 0, col: 0, width: 4, height: 1, settings: {} },
        { id: uuidv4(), type: 'event-count', row: 0, col: 4, width: 4, height: 1, settings: {} },
        { id: uuidv4(), type: 'tasks-count', row: 0, col: 8, width: 4, height: 1, settings: {} },
        { id: uuidv4(), type: 'upcoming-events', row: 1, col: 0, width: 6, height: 2, settings: {} },
        { id: uuidv4(), type: 'financial-health', row: 1, col: 6, width: 6, height: 2, settings: {} },
        { id: uuidv4(), type: 'recent-results', row: 3, col: 0, width: 6, height: 2, settings: {} },
        { id: uuidv4(), type: 'membership-status', row: 3, col: 6, width: 6, height: 2, settings: {} },
      ],
      sm: [
        { id: uuidv4(), type: 'members-count', row: 0, col: 0, width: 4, height: 1, settings: {} },
        { id: uuidv4(), type: 'event-count', row: 1, col: 0, width: 4, height: 1, settings: {} },
        { id: uuidv4(), type: 'upcoming-events', row: 2, col: 0, width: 4, height: 2, settings: {} },
        { id: uuidv4(), type: 'financial-health', row: 4, col: 0, width: 4, height: 2, settings: {} },
        { id: uuidv4(), type: 'recent-results', row: 6, col: 0, width: 4, height: 2, settings: {} },
      ]
    }
  }
];

export const ROLE_TO_TEMPLATE_MAP: Record<string, string> = {
  'commodore': 'full',
  'vice_commodore': 'full',
  'rear_commodore': 'full',
  'treasurer': 'finance',
  'secretary': 'secretary',
  'race_officer': 'race',
  'sailing_master': 'race',
  'membership_officer': 'membership',
  'social_secretary': 'membership',
  'safety_officer': 'race',
};

export function getTemplateForRole(roleName: string): string {
  const normalizedRole = roleName.toLowerCase().replace(/\s+/g, '_');
  return ROLE_TO_TEMPLATE_MAP[normalizedRole] || 'full';
}
