/**
 * What the Broadcast Studio reports to compact on-air controls (the scoring dock),
 * and the actions those controls can ask the studio to take. The studio stays the
 * engine; the dock only reads this snapshot and calls these actions.
 */

export type OnAirStatus = 'offline' | 'connecting' | 'testing' | 'live';

export interface OnAirCamera {
  id: string;
  name: string;
  type: string;
  status: string;
  isProgram: boolean;
  stream: MediaStream | null;
}

export interface OnAirSnapshot {
  sessionId: string | null;
  title: string | null;
  status: OnAirStatus;
  isPaused: boolean;
  isTest: boolean;
  startedAt: string | null;
  viewerCount: number;
  link: 'disconnected' | 'connecting' | 'connected' | 'error';
  /** Program picture: with overlays when they're being composited, otherwise the live camera */
  programStream: MediaStream | null;
  cameras: OnAirCamera[];
  autoRecord: boolean;
  recordingRace: number | null;
  recordingSince: string | null;
  uploading: boolean;
}

export interface OnAirControls {
  hold: () => Promise<void>;
  resume: () => Promise<void>;
  cutTo: (cameraId: string) => Promise<void>;
  showTitle: () => void;
}
