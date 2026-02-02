import { RaceEvent } from '../types/race';

export function generateICalFile(events: RaceEvent[], clubName: string): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  let ical = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Race Calendar//NONSGML v1.0//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${clubName} - Race Calendar`,
    'X-WR-TIMEZONE:UTC',
    `X-WR-CALDESC:Race events for ${clubName}`,
  ].join('\r\n');

  events.forEach(event => {
    const eventDate = new Date(event.date);
    const startDate = formatICalDate(eventDate);

    const endDate = event.endDate
      ? formatICalDate(new Date(event.endDate))
      : formatICalDate(new Date(eventDate.getTime() + (6 * 60 * 60 * 1000)));

    const eventName = event.isSeriesEvent
      ? `${event.roundName} - ${event.eventName || event.clubName}`
      : event.eventName || event.clubName;

    const description = [
      `Race Format: ${event.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}`,
      `Race Class: ${event.raceClass}`,
      `Venue: ${event.venue}`,
      event.entryFee ? `Entry Fee: $${event.entryFee}` : '',
      event.noticeOfRaceUrl ? `Notice of Race: ${event.noticeOfRaceUrl}` : '',
      event.sailingInstructionsUrl ? `Sailing Instructions: ${event.sailingInstructionsUrl}` : '',
      event.livestreamUrl ? `Livestream: ${event.livestreamUrl}` : '',
    ].filter(Boolean).join('\\n');

    const uid = `${event.id}@racecalendar.app`;

    ical += '\r\n' + [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${timestamp}`,
      `DTSTART:${startDate}`,
      `DTEND:${endDate}`,
      `SUMMARY:${escapeICalText(eventName)}`,
      `DESCRIPTION:${escapeICalText(description)}`,
      `LOCATION:${escapeICalText(event.venue)}`,
      event.cancelled ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
      `CATEGORIES:${event.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'},${event.raceClass}`,
      'END:VEVENT',
    ].join('\r\n');
  });

  ical += '\r\nEND:VCALENDAR';

  return ical;
}

function formatICalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function downloadICalFile(icalContent: string, filename: string): void {
  const blob = new Blob([icalContent], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export function getGoogleCalendarUrl(icalContent: string): string {
  const blob = new Blob([icalContent], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(url)}`;
}
