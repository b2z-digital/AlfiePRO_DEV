export const defaultColorScheme = {
  bg: 'bg-gray-50',
  text: 'text-gray-800',
  darkBg: 'dark:bg-gray-900',
  darkText: 'dark:text-gray-200'
};

// Boat class colors - consistent pill/badge styling (matches mobile app)
export const boatTypeColors: Record<string, { bg: string; text: string; darkBg: string; darkText: string; gradient?: string }> = {
  'IOM': {
    bg: 'bg-sky-500',
    text: 'text-white',
    darkBg: 'bg-sky-500',
    darkText: 'text-white',
    gradient: 'from-sky-500 to-sky-600'
  },
  '10R': {
    bg: 'bg-purple-500',
    text: 'text-white',
    darkBg: 'bg-purple-500',
    darkText: 'text-white',
    gradient: 'from-purple-500 to-purple-600'
  },
  'DF95': {
    bg: 'bg-red-500',
    text: 'text-white',
    darkBg: 'bg-red-500',
    darkText: 'text-white',
    gradient: 'from-red-500 to-red-600'
  },
  'DF65': {
    bg: 'bg-orange-500',
    text: 'text-white',
    darkBg: 'bg-orange-500',
    darkText: 'text-white',
    gradient: 'from-orange-500 to-orange-600'
  },
  'Marblehead': {
    bg: 'bg-teal-500',
    text: 'text-white',
    darkBg: 'bg-teal-500',
    darkText: 'text-white',
    gradient: 'from-teal-500 to-teal-600'
  },
  'Footy': {
    bg: 'bg-yellow-600',
    text: 'text-white',
    darkBg: 'bg-yellow-600',
    darkText: 'text-white',
    gradient: 'from-yellow-600 to-yellow-700'
  },
  'RG65': {
    bg: 'bg-lime-600',
    text: 'text-white',
    darkBg: 'bg-lime-600',
    darkText: 'text-white',
    gradient: 'from-lime-600 to-lime-700'
  },
  '36R': {
    bg: 'bg-rose-500',
    text: 'text-white',
    darkBg: 'bg-rose-500',
    darkText: 'text-white',
    gradient: 'from-rose-500 to-rose-600'
  },
  'A Class': {
    bg: 'bg-slate-500',
    text: 'text-white',
    darkBg: 'bg-slate-500',
    darkText: 'text-white',
    gradient: 'from-slate-500 to-slate-600'
  },
  'RC Laser': {
    bg: 'bg-slate-500',
    text: 'text-white',
    darkBg: 'bg-slate-500',
    darkText: 'text-white',
    gradient: 'from-slate-500 to-slate-600'
  }
};

// Race format colors - consistent throughout app (matches mobile app)
export const raceFormatColors = {
  'Scratch': {
    bg: 'bg-green-600',
    text: 'text-white',
    darkBg: 'bg-green-600',
    darkText: 'text-white',
    gradient: 'from-green-600 to-green-700'
  },
  'Handicap': {
    bg: 'bg-amber-600',
    text: 'text-white',
    darkBg: 'bg-amber-600',
    darkText: 'text-white',
    gradient: 'from-amber-600 to-amber-700'
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