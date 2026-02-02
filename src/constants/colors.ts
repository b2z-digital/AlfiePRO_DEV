export const defaultColorScheme = {
  bg: 'bg-gray-50',
  text: 'text-gray-800',
  darkBg: 'dark:bg-gray-900',
  darkText: 'dark:text-gray-200'
};

// Boat class colors - consistent pill/badge styling
export const boatTypeColors: Record<string, { bg: string; text: string; darkBg: string; darkText: string; gradient?: string }> = {
  'DF65': {
    bg: 'bg-emerald-500',
    text: 'text-white',
    darkBg: 'bg-emerald-600',
    darkText: 'text-white',
    gradient: 'from-emerald-500 to-emerald-600'
  },
  'DF95': {
    bg: 'bg-amber-500',
    text: 'text-white',
    darkBg: 'bg-amber-600',
    darkText: 'text-white',
    gradient: 'from-amber-500 to-amber-600'
  },
  '10R': {
    bg: 'bg-rose-500',
    text: 'text-white',
    darkBg: 'bg-rose-600',
    darkText: 'text-white',
    gradient: 'from-rose-500 to-pink-500'
  },
  'IOM': {
    bg: 'bg-sky-500',
    text: 'text-white',
    darkBg: 'bg-sky-600',
    darkText: 'text-white',
    gradient: 'from-sky-500 to-blue-500'
  },
  'Marblehead': {
    bg: 'bg-indigo-500',
    text: 'text-white',
    darkBg: 'bg-indigo-600',
    darkText: 'text-white',
    gradient: 'from-indigo-500 to-indigo-600'
  },
  'A Class': {
    bg: 'bg-pink-500',
    text: 'text-white',
    darkBg: 'bg-pink-600',
    darkText: 'text-white',
    gradient: 'from-pink-500 to-pink-600'
  },
  'RC Laser': {
    bg: 'bg-orange-500',
    text: 'text-white',
    darkBg: 'bg-orange-600',
    darkText: 'text-white',
    gradient: 'from-orange-500 to-orange-600'
  }
};

// Race format colors - consistent throughout app
export const raceFormatColors = {
  'Scratch': {
    bg: 'bg-blue-500',
    text: 'text-white',
    darkBg: 'bg-blue-600',
    darkText: 'text-white',
    gradient: 'from-blue-500 to-blue-600'
  },
  'Handicap': {
    bg: 'bg-purple-500',
    text: 'text-white',
    darkBg: 'bg-purple-600',
    darkText: 'text-white',
    gradient: 'from-purple-500 to-purple-600'
  }
};

// Event type colors
export const eventTypeColors = {
  'Club Event': {
    bg: 'bg-slate-500',
    text: 'text-white',
    darkBg: 'bg-slate-600',
    darkText: 'text-white'
  },
  'State Event': {
    bg: 'bg-amber-500',
    text: 'text-white',
    darkBg: 'bg-amber-600',
    darkText: 'text-white'
  },
  'National Event': {
    bg: 'bg-blue-500',
    text: 'text-white',
    darkBg: 'bg-blue-600',
    darkText: 'text-white'
  }
};

// Utility function to get boat class styling
export const getBoatClassBadge = (boatClass: string, darkMode = false) => {
  const colors = boatTypeColors[boatClass] || {
    bg: 'bg-slate-500',
    text: 'text-white',
    darkBg: 'bg-slate-600',
    darkText: 'text-white',
    gradient: 'from-slate-500 to-slate-600'
  };

  return {
    className: `inline-flex items-center px-2 py-1 rounded-md text-xs font-bold ${darkMode ? colors.darkBg : colors.bg} ${darkMode ? colors.darkText : colors.text} shadow-sm`,
    gradient: colors.gradient
  };
};

// Utility function to get race format styling
export const getRaceFormatBadge = (format: string, darkMode = false) => {
  const colors = raceFormatColors[format as keyof typeof raceFormatColors] || raceFormatColors['Scratch'];

  return {
    className: `inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${darkMode ? colors.darkBg : colors.bg} ${darkMode ? colors.darkText : colors.text}`,
    gradient: colors.gradient
  };
};

// Utility function to get event type label and styling
export const getEventTypeBadge = (event: any, darkMode = false) => {
  let label = 'Club Event';
  let colors = eventTypeColors['Club Event'];

  if (event.isPublicEvent) {
    // Check if it's a state or national event
    if (event.state_association_id || event.stateAssociationId) {
      label = 'State Event';
      colors = eventTypeColors['State Event'];
    } else if (event.national_association_id || event.nationalAssociationId) {
      label = 'National Event';
      colors = eventTypeColors['National Event'];
    }
  }

  return {
    label,
    className: `inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${darkMode ? colors.darkBg : colors.bg} ${darkMode ? colors.darkText : colors.text}`
  };
};