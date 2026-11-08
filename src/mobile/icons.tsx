import React from 'react';

/** Stroke icons drawn for the phone design board (24 px grid). */
const P: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  racing: 'M5 21V4M5 4h11l-2 4 2 4H5',
  tv: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8 22h8',
  me: 'M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10',
  club: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 19v-1a4 4 0 0 0-3-3.9M15.5 3.1a3.5 3.5 0 0 1 0 6.8',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5A8 8 0 1 1 21 12',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10.3 20a2 2 0 0 0 3.4 0',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4',
  back: 'M15 6l-6 6 6 6',
  chevron: 'M9 6l6 6-6 6',
  down: 'M6 9l6 6 6-6',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5l4.5 4.5L19 7',
  calendar: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 2v4M16 2v4',
  pin: 'M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4',
  wind: 'M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8',
  share: 'M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5',
  tag: 'M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z',
  news: 'M4 5h13v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2zM17 9h3v10a2 2 0 0 1-2 2M8 9h5M8 13h5',
  tasks: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  doc: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  video: 'M15 10l5-3v10l-5-3M3 7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  plus: 'M12 5v14M5 12h14',
  timer: 'M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16M12 10v4l2 2M9 2h6M12 2v4',
  sail: 'M12 3v15M12.5 4c4 3.5 6.5 8 7 13H12.5zM11 7c-2.5 3-4.3 6.5-5 10h5zM3 20h18l-2 1.5H5z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  image: 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M15 9h.01',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  send: 'M12 19V5M5 12l7-7 7 7',
  edit: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  upload: 'M12 15V3M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5',
  camera: 'M4 8a2 2 0 0 1 2-2h2l2-2h4l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  play: 'M7 4.5v15l12-7.5z',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  recall: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  sound: 'M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
  stopwatch: 'M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16M12 10v4l2 2M9 2h6M12 2v4',
};

export type IconName = keyof typeof P;

export const Icon: React.FC<{ name: IconName; size?: number; strokeWidth?: number; className?: string; style?: React.CSSProperties }> = ({
  name, size = 20, strokeWidth = 1.8, className, style,
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>
    <path d={P[name]} />
  </svg>
);

/** The Alfie sails mark, used in the centre button and empty states. */
export const AlfieSails: React.FC<{ size?: number; light?: boolean }> = ({ size = 24, light }) => (
  <svg width={size * 0.77} height={size} viewBox="0 0 130 202" aria-hidden="true">
    <path fill={light ? '#0A6FD6' : '#0A84FF'} d="M92.6.1s-33.4 35.9-46.9 76.9-18 123-18 123c53.9-26.1 87.1-5.1 101.7 1.4C76 145.2 92.6 0 92.6 0z" />
    <path fill={light ? '#2A93FF' : '#4DA3FF'} d="M45.4 35.4s-23.9 31.1-37.4 61.2-5.9 88.2-5.9 88.2c22.2-23.9 68.8-19.1 68.8-19.1C33.8 122.7 45.3 35.4 45.3 35.4z" />
  </svg>
);
