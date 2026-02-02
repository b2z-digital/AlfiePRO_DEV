/**
 * Generates an .ics calendar file for a task
 * Works with Google Calendar, Apple Calendar, Outlook, and other calendar apps
 */
export function generateICSFile(
  title: string,
  description: string | null,
  dueDate: string | null,
  location?: string
): string {
  if (!dueDate) {
    throw new Error('Task must have a due date to add to calendar');
  }

  // Convert date to ICS format (YYYYMMDDTHHMMSSZ)
  const formatICSDate = (date: Date): string => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const year = date.getUTCFullYear();
    const month = pad(date.getUTCMonth() + 1);
    const day = pad(date.getUTCDate());
    const hours = pad(date.getUTCHours());
    const minutes = pad(date.getUTCMinutes());
    const seconds = pad(date.getUTCSeconds());
    return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
  };

  // Escape special characters for ICS format
  const escapeICS = (text: string): string => {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  };

  const dueDateTime = new Date(dueDate);
  const startDateTime = new Date(dueDateTime);

  // Set start time to 9 AM on the due date
  startDateTime.setHours(9, 0, 0, 0);

  // Set end time to 10 AM (1 hour duration)
  const endDateTime = new Date(startDateTime);
  endDateTime.setHours(10, 0, 0, 0);

  const now = new Date();

  // Build ICS content
  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Alfie App//Task Manager//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${Date.now()}-${Math.random().toString(36).substr(2, 9)}@alfieapp.com`,
    `DTSTAMP:${formatICSDate(now)}`,
    `DTSTART:${formatICSDate(startDateTime)}`,
    `DTEND:${formatICSDate(endDateTime)}`,
    `SUMMARY:${escapeICS(title)}`,
  ];

  if (description) {
    icsContent.push(`DESCRIPTION:${escapeICS(description)}`);
  }

  if (location) {
    icsContent.push(`LOCATION:${escapeICS(location)}`);
  }

  icsContent.push(
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'TRIGGER:-PT24H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Task Reminder',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  );

  return icsContent.join('\r\n');
}

/**
 * Downloads an .ics file
 */
export function downloadICSFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = window.URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(link.href);
}

/**
 * Exports a task to calendar
 */
export function exportTaskToCalendar(
  title: string,
  description: string | null,
  dueDate: string | null,
  location?: string
): void {
  try {
    const icsContent = generateICSFile(title, description, dueDate, location);
    const filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.ics`;
    downloadICSFile(icsContent, filename);
  } catch (error) {
    throw error;
  }
}
