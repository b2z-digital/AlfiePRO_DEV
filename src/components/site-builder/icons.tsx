import React from 'react';
import {
  Award, CalendarDays, Code2, Columns3, Heading, HelpCircle, Image, ImagesIcon, LayoutGrid, MapPin, Minus, MousePointerClick, MoveVertical,
  Newspaper, Sailboat, Square, Tag, Trophy, Type, UserPlus, Users, Video, type LucideIcon,
} from 'lucide-react';
import { moduleDef } from './model';

const MAP: Record<string, LucideIcon> = {
  heading: Heading, text: Type, button: MousePointerClick, image: Image, video: Video, divider: Minus, spacer: MoveVertical, code: Code2,
  cards: LayoutGrid, accordion: HelpCircle, gallery: ImagesIcon, logos: Award,
  races: CalendarDays, results: Trophy, news: Newspaper, classes: Sailboat, committee: Users, join: UserPlus, venues: MapPin, classifieds: Tag,
  columns: Columns3,
};

export const ModuleIcon: React.FC<{ type: string; size?: number }> = ({ type, size = 18 }) => {
  const Icon = MAP[moduleDef(type)?.icon || ''] || Square;
  return <Icon size={size} strokeWidth={1.8} />;
};

export const IconByName: React.FC<{ name: string; size?: number }> = ({ name, size = 18 }) => {
  const Icon = MAP[name] || Square;
  return <Icon size={size} strokeWidth={1.8} />;
};
