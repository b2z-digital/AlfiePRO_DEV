import {
  DollarSign,
  Wind,
  Users,
  Bell,
  Zap,
  Trophy,
  UserCheck,
  Calendar,
  TrendingUp,
  TrendingDown,
  Award,
  MessageSquare,
  Target,
  Activity,
  CheckSquare,
  Globe,
  Image,
  Newspaper,
  Receipt,
  UserPlus,
  AlertCircle,
  PieChart,
  BarChart3,
  Clock,
  Building2
} from 'lucide-react';
import { WidgetDefinition } from '../../types/dashboard';
import { FinancialHealthWidget } from './widgets/FinancialHealthWidget';
import { WeatherWidget } from './widgets/WeatherWidget';
import { MembershipStatusWidget } from './widgets/MembershipStatusWidget';
import { ActivityFeedWidget } from './widgets/ActivityFeedWidget';
import { QuickActionsWidget } from './widgets/QuickActionsWidget';
import { BoatClassDistributionWidget } from './widgets/BoatClassDistributionWidget';
import { MemberEngagementWidget } from './widgets/MemberEngagementWidget';
import { UpcomingEventsWidget } from './widgets/UpcomingEventsWidget';
import { RecentResultsWidget } from './widgets/RecentResultsWidget';
import { EventCountWidget } from './widgets/EventCountWidget';
import { MembersCountWidget } from './widgets/MembersCountWidget';
import { ClubsCountWidget } from './widgets/ClubsCountWidget';
import { TasksCountWidget } from './widgets/TasksCountWidget';
import { QuickEventSetupWidget } from './widgets/QuickEventSetupWidget';
import { EventWebsitesWidget } from './widgets/EventWebsitesWidget';
import { MediaCenterWidget } from './widgets/MediaCenterWidget';
import { LatestNewsWidget } from './widgets/LatestNewsWidget';
import { CommunicationsWidget } from './widgets/CommunicationsWidget';
import { GrossIncomeWidget } from './widgets/GrossIncomeWidget';
import { NetIncomeWidget } from './widgets/NetIncomeWidget';
import { TotalExpensesWidget } from './widgets/TotalExpensesWidget';
import { MembershipIncomeWidget } from './widgets/MembershipIncomeWidget';
import { PendingInvoicesWidget } from './widgets/PendingInvoicesWidget';
import { RecentTransactionsWidget } from './widgets/RecentTransactionsWidget';
import { FinancialPositionWidget } from './widgets/FinancialPositionWidget';
import { MembershipOverviewWidget } from './widgets/MembershipOverviewWidget';
import { ApplicationsRenewalsWidget } from './widgets/ApplicationsRenewalsWidget';
import { RemittanceStatusWidget } from './widgets/RemittanceStatusWidget';
import { ActiveMembersWidget } from './widgets/ActiveMembersWidget';
import { PendingRenewalsWidget } from './widgets/PendingRenewalsWidget';
import { NewMembersWidget } from './widgets/NewMembersWidget';
import { MembershipTypesWidget } from './widgets/MembershipTypesWidget';
import { MembersByClassWidget } from './widgets/MembersByClassWidget';
import { EventParticipationWidget } from './widgets/EventParticipationWidget';
import { MemberRetentionWidget } from './widgets/MemberRetentionWidget';
import { UpcomingMeetingsWidget } from './widgets/UpcomingMeetingsWidget';
import { MeetingsCountWidget } from './widgets/MeetingsCountWidget';
import { PendingEventsWidget } from './widgets/PendingEventsWidget';
import { PendingApplicationsWidget } from './widgets/PendingApplicationsWidget';
import { UnreadCommunicationsWidget } from './widgets/UnreadCommunicationsWidget';
import { RecentApplicationsWidget } from './widgets/RecentApplicationsWidget';
import { MembershipRenewalsWidget } from './widgets/MembershipRenewalsWidget';
import { MembershipTypesLargeWidget } from './widgets/MembershipTypesLargeWidget';
import { MembersByClassLargeWidget } from './widgets/MembersByClassLargeWidget';

export const WIDGET_REGISTRY: WidgetDefinition[] = [
  {
    id: 'event-count',
    type: 'event-count',
    name: 'Event Count',
    description: 'Quick stat showing upcoming event count and next event timing',
    icon: Calendar,
    defaultSize: '1x1',
    component: EventCountWidget,
    category: 'overview'
  },
  {
    id: 'pending-events',
    type: 'pending-events',
    name: 'Pending Events',
    description: 'Events awaiting approval or review',
    icon: Clock,
    defaultSize: '1x1',
    component: PendingEventsWidget,
    category: 'overview'
  },
  {
    id: 'pending-applications',
    type: 'pending-applications',
    name: 'Pending Applications',
    description: 'Membership applications awaiting review',
    icon: UserCheck,
    defaultSize: '1x1',
    component: PendingApplicationsWidget,
    category: 'membership',
    requiredPermissions: ['admin', 'membership']
  },
  {
    id: 'unread-communications',
    type: 'unread-communications',
    name: 'Unread Messages',
    description: 'Count of unread messages and notifications',
    icon: MessageSquare,
    defaultSize: '1x1',
    component: UnreadCommunicationsWidget,
    category: 'communication'
  },
  {
    id: 'recent-applications',
    type: 'recent-applications',
    name: 'Recent Applications',
    description: 'Latest membership applications with quick review',
    icon: Users,
    defaultSize: '2x2',
    component: RecentApplicationsWidget,
    category: 'membership',
    requiredPermissions: ['admin', 'membership']
  },
  {
    id: 'membership-renewals',
    type: 'membership-renewals',
    name: 'Renewals Due Soon',
    description: 'Members with renewals due in the next 60 days',
    icon: AlertCircle,
    defaultSize: '1x1',
    component: MembershipRenewalsWidget,
    category: 'membership',
    requiredPermissions: ['admin', 'membership']
  },
  {
    id: 'members-count',
    type: 'members-count',
    name: 'Members Count',
    description: 'Active member count and participation rate overview',
    icon: Users,
    defaultSize: '1x1',
    component: MembersCountWidget,
    category: 'membership'
  },
  {
    id: 'clubs-count',
    type: 'clubs-count',
    name: 'Member Clubs',
    description: 'Total clubs in association and active subscription rate',
    icon: Building2,
    defaultSize: '1x1',
    component: ClubsCountWidget,
    category: 'membership',
    associationOnly: true
  },
  {
    id: 'tasks-count',
    type: 'tasks-count',
    name: 'Tasks Count',
    description: 'Active tasks and completion tracking',
    icon: CheckSquare,
    defaultSize: '1x1',
    component: TasksCountWidget,
    category: 'overview'
  },
  {
    id: 'meetings-count',
    type: 'meetings-count',
    name: 'Meetings Count',
    description: 'Quick count of upcoming club meetings',
    icon: Calendar,
    defaultSize: '1x1',
    component: MeetingsCountWidget,
    category: 'overview'
  },
  {
    id: 'financial-health',
    type: 'financial-health',
    name: 'Financial Health',
    description: 'View your club\'s financial overview including income, expenses, and outstanding payments',
    icon: DollarSign,
    defaultSize: '1x1',
    component: FinancialHealthWidget,
    category: 'finance',
    requiredPermissions: ['admin', 'treasurer']
  },
  {
    id: 'gross-income',
    type: 'gross-income',
    name: 'Gross Income',
    description: 'Total income from all sources with 30-day trend comparison',
    icon: DollarSign,
    defaultSize: '1x1',
    component: GrossIncomeWidget,
    category: 'finance',
    requiredPermissions: ['admin', 'treasurer']
  },
  {
    id: 'net-income',
    type: 'net-income',
    name: 'Net Income',
    description: 'Net income after expenses and taxes with trend analysis',
    icon: TrendingUp,
    defaultSize: '1x1',
    component: NetIncomeWidget,
    category: 'finance',
    requiredPermissions: ['admin', 'treasurer']
  },
  {
    id: 'total-expenses',
    type: 'total-expenses',
    name: 'Total Expenses',
    description: 'Total expenses for the current period with trend tracking',
    icon: TrendingDown,
    defaultSize: '1x1',
    component: TotalExpensesWidget,
    category: 'finance',
    requiredPermissions: ['admin', 'treasurer']
  },
  {
    id: 'membership-income',
    type: 'membership-income',
    name: 'Membership Income',
    description: 'Collected membership fees and pending payments overview',
    icon: Users,
    defaultSize: '1x1',
    component: MembershipIncomeWidget,
    category: 'finance',
    requiredPermissions: ['admin', 'treasurer', 'membership']
  },
  {
    id: 'pending-invoices',
    type: 'pending-invoices',
    name: 'Pending Invoices',
    description: 'Track draft invoices and invoices awaiting payment',
    icon: Receipt,
    defaultSize: '1x1',
    component: PendingInvoicesWidget,
    category: 'finance',
    requiredPermissions: ['admin', 'treasurer']
  },
  {
    id: 'recent-transactions',
    type: 'recent-transactions',
    name: 'Recent Transactions',
    description: 'Latest financial transactions with quick view of income and expenses',
    icon: Receipt,
    defaultSize: '2x2',
    component: RecentTransactionsWidget,
    category: 'finance',
    requiredPermissions: ['admin', 'treasurer']
  },
  {
    id: 'financial-position',
    type: 'financial-position',
    name: 'Financial Position',
    description: 'Interactive chart showing income, expenses, and net position over time',
    icon: TrendingUp,
    defaultSize: '3x3',
    component: FinancialPositionWidget,
    category: 'finance',
    requiredPermissions: ['admin', 'treasurer']
  },
  {
    id: 'weather',
    type: 'weather',
    name: 'Weather & Conditions',
    description: 'Current weather conditions and wind speed at your venue',
    icon: Wind,
    defaultSize: '1x2',
    component: WeatherWidget,
    category: 'overview'
  },
  {
    id: 'membership-status',
    type: 'membership-status',
    name: 'Membership Status',
    description: 'Track expiring memberships, unpaid fees, and pending applications',
    icon: Users,
    defaultSize: '1x1',
    component: MembershipStatusWidget,
    category: 'membership',
    requiredPermissions: ['admin', 'membership']
  },
  {
    id: 'active-members',
    type: 'active-members',
    name: 'Active Members',
    description: 'Quick count of currently active club members',
    icon: UserCheck,
    defaultSize: '1x1',
    component: ActiveMembersWidget,
    category: 'membership',
    requiredPermissions: ['admin', 'membership']
  },
  {
    id: 'pending-renewals',
    type: 'pending-renewals',
    name: 'Pending Renewals',
    description: 'Members with expiring memberships in the next 30 days',
    icon: Calendar,
    defaultSize: '1x1',
    component: PendingRenewalsWidget,
    category: 'membership',
    requiredPermissions: ['admin', 'membership']
  },
  {
    id: 'new-members',
    type: 'new-members',
    name: 'New This Month',
    description: 'Members who joined this month',
    icon: UserPlus,
    defaultSize: '1x1',
    component: NewMembersWidget,
    category: 'membership',
    requiredPermissions: ['admin', 'membership']
  },
  {
    id: 'membership-overview',
    type: 'membership-overview',
    name: 'Membership Overview',
    description: 'Summary of total, active, and new members with key statistics',
    icon: Users,
    defaultSize: '2x2',
    component: MembershipOverviewWidget,
    category: 'membership',
    requiredPermissions: ['admin', 'membership']
  },
  {
    id: 'membership-types',
    type: 'membership-types',
    name: 'Membership Types',
    description: 'Distribution of members across different membership categories',
    icon: PieChart,
    defaultSize: '2x1',
    component: MembershipTypesWidget,
    category: 'membership',
    requiredPermissions: ['admin', 'membership']
  },
  {
    id: 'membership-types-large',
    type: 'membership-types-large',
    name: 'Membership Types (Large)',
    description: 'Large detailed view of membership type distribution with percentages and totals',
    icon: PieChart,
    defaultSize: '2x2',
    component: MembershipTypesLargeWidget,
    category: 'membership',
    requiredPermissions: ['admin', 'membership']
  },
  {
    id: 'members-by-class',
    type: 'members-by-class',
    name: 'Members by Class',
    description: 'Bar chart showing member distribution across boat classes',
    icon: BarChart3,
    defaultSize: '2x1',
    component: MembersByClassWidget,
    category: 'race',
    requiredPermissions: ['admin', 'race_officer']
  },
  {
    id: 'members-by-class-large',
    type: 'members-by-class-large',
    name: 'Members by Class (Large)',
    description: 'Large detailed bar chart with boat class distribution, totals, and percentages',
    icon: BarChart3,
    defaultSize: '2x2',
    component: MembersByClassLargeWidget,
    category: 'race',
    requiredPermissions: ['admin', 'race_officer']
  },
  {
    id: 'event-participation',
    type: 'event-participation',
    name: 'Event Participation',
    description: 'Member participation in single events vs pointscore series',
    icon: Activity,
    defaultSize: '2x1',
    component: EventParticipationWidget,
    category: 'race',
    requiredPermissions: ['admin', 'race_officer']
  },
  {
    id: 'member-retention',
    type: 'member-retention',
    name: 'Member Retention',
    description: 'Year-over-year member renewal and retention rates',
    icon: Users,
    defaultSize: '2x1',
    component: MemberRetentionWidget,
    category: 'membership',
    requiredPermissions: ['admin', 'membership']
  },
  {
    id: 'applications-renewals',
    type: 'applications-renewals',
    name: 'Applications & Renewals',
    description: 'Track pending membership applications and upcoming renewals',
    icon: AlertCircle,
    defaultSize: '1x2',
    component: ApplicationsRenewalsWidget,
    category: 'membership',
    requiredPermissions: ['admin', 'membership']
  },
  {
    id: 'remittance-status',
    type: 'remittance-status',
    name: 'Association Remittances',
    description: 'Monitor association fees owed and payment status',
    icon: DollarSign,
    defaultSize: '1x2',
    component: RemittanceStatusWidget,
    category: 'membership',
    requiredPermissions: ['admin', 'treasurer', 'membership']
  },
  {
    id: 'activity-feed',
    type: 'activity-feed',
    name: 'Recent Activity',
    description: 'Stay updated with recent club notifications and member activities',
    icon: Bell,
    defaultSize: '2x1',
    component: ActivityFeedWidget,
    category: 'communication'
  },
  {
    id: 'quick-actions',
    type: 'quick-actions',
    name: 'Quick Actions',
    description: 'Fast access to common tasks like creating races and sending messages',
    icon: Zap,
    defaultSize: '1x1',
    component: QuickActionsWidget,
    category: 'overview'
  },
  {
    id: 'boat-class-distribution',
    type: 'boat-class-distribution',
    name: 'Boat Class Distribution',
    description: 'Visual breakdown of boat classes in your club',
    icon: Trophy,
    defaultSize: '1x2',
    component: BoatClassDistributionWidget,
    category: 'analytics'
  },
  {
    id: 'member-engagement',
    type: 'member-engagement',
    name: 'Member Engagement',
    description: 'Track member participation rates and engagement metrics',
    icon: UserCheck,
    defaultSize: '1x2',
    component: MemberEngagementWidget,
    category: 'analytics'
  },
  {
    id: 'upcoming-events',
    type: 'upcoming-events',
    name: 'Upcoming Events',
    description: 'Full list of your next scheduled races and events with details',
    icon: Calendar,
    defaultSize: '3x2',
    component: UpcomingEventsWidget,
    category: 'race'
  },
  {
    id: 'recent-results',
    type: 'recent-results',
    name: 'Recent Results',
    description: 'Latest race results and competition outcomes with top finishers',
    icon: TrendingUp,
    defaultSize: '3x2',
    component: RecentResultsWidget,
    category: 'race'
  },
  {
    id: 'quick-event-setup',
    type: 'quick-event-setup',
    name: 'Quick Event Setup',
    description: 'Quickly create single events or series with shortcuts',
    icon: Calendar,
    defaultSize: '1x1',
    component: QuickEventSetupWidget,
    category: 'race',
    requiredPermissions: ['admin', 'race_officer']
  },
  {
    id: 'event-websites',
    type: 'event-websites',
    name: 'Event Websites',
    description: 'Manage and view your event websites and registration pages',
    icon: Globe,
    defaultSize: '2x1',
    component: EventWebsitesWidget,
    category: 'race',
    requiredPermissions: ['admin', 'race_officer']
  },
  {
    id: 'media-center',
    type: 'media-center',
    name: 'Media Center',
    description: 'Quick access to your photo and video library with upload stats',
    icon: Image,
    defaultSize: '1x1',
    component: MediaCenterWidget,
    category: 'communication'
  },
  {
    id: 'latest-news',
    type: 'latest-news',
    name: 'Latest News',
    description: 'Recent news articles and announcements from your club',
    icon: Newspaper,
    defaultSize: '2x1',
    component: LatestNewsWidget,
    category: 'communication'
  },
  {
    id: 'communications',
    type: 'communications',
    name: 'Communications Hub',
    description: 'Central hub for notifications, messages, and member communications',
    icon: MessageSquare,
    defaultSize: '1x1',
    component: CommunicationsWidget,
    category: 'communication'
  },
  {
    id: 'upcoming-meetings',
    type: 'upcoming-meetings',
    name: 'Upcoming Meetings',
    description: 'View upcoming club meetings with quick access to details',
    icon: Calendar,
    defaultSize: '1x2',
    component: UpcomingMeetingsWidget,
    category: 'overview'
  }
];

export function getWidgetDefinition(type: string): WidgetDefinition | undefined {
  return WIDGET_REGISTRY.find(w => w.type === type);
}

export function getWidgetsByCategory(category: string): WidgetDefinition[] {
  return WIDGET_REGISTRY.filter(w => w.category === category);
}

export function getAllCategories(): string[] {
  return Array.from(new Set(WIDGET_REGISTRY.map(w => w.category)));
}
