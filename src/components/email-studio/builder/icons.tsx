import React from 'react';
import {
  CalendarCheck, CalendarDays, Columns2, Heading, IdCard, Image, LayoutPanelTop, Minus, MoveVertical, Newspaper, PanelTop, Quote,
  RectangleHorizontal, Share2, Star, Tag, Timer, Trophy, Tv, Type,
} from 'lucide-react';
import type { BlockType } from '../../../lib/emailStudio/types';

export const BlockIcon: React.FC<{ type: BlockType; size?: number }> = ({ type, size = 18 }) => {
  const p = { size, strokeWidth: 1.8 };
  switch (type) {
    case 'news': return <Newspaper {...p} />;
    case 'results': return <Trophy {...p} />;
    case 'events': return <CalendarCheck {...p} />;
    case 'classifieds': return <Tag {...p} />;
    case 'videos': return <Tv {...p} />;
    case 'membership': return <IdCard {...p} />;
    case 'calendar': return <CalendarDays {...p} />;
    case 'countdown': return <Timer {...p} />;
    case 'header': return <PanelTop {...p} />;
    case 'hero': return <LayoutPanelTop {...p} />;
    case 'heading': return <Heading {...p} />;
    case 'text': return <Type {...p} />;
    case 'button': return <RectangleHorizontal {...p} />;
    case 'image': return <Image {...p} />;
    case 'columns': return <Columns2 {...p} />;
    case 'quote': return <Quote {...p} />;
    case 'social': return <Share2 {...p} />;
    case 'logos': return <Star {...p} />;
    case 'divider': return <Minus {...p} />;
    case 'spacer': return <MoveVertical {...p} />;
    default: return <Type {...p} />;
  }
};
