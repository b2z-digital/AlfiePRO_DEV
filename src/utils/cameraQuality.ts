/** Phone camera quality. Data use is for the phone's upload while streaming. */
export type CameraQuality = 'high' | 'standard' | 'saver';

export const CAMERA_QUALITY: Record<CameraQuality, { label: string; detail: string; maxBitrate: number; scaleDown: number; gbPerHour: string }> = {
  high:     { label: 'High',       detail: '1080p',           maxBitrate: 6_000_000, scaleDown: 1,   gbPerHour: '≈2.7 GB/hr' },
  standard: { label: 'Standard',   detail: '720p',            maxBitrate: 2_500_000, scaleDown: 1.5, gbPerHour: '≈1.1 GB/hr' },
  saver:    { label: 'Data saver', detail: '540p',            maxBitrate: 1_000_000, scaleDown: 2,   gbPerHour: '≈0.45 GB/hr' },
};

export const isCameraQuality = (v: unknown): v is CameraQuality => v === 'high' || v === 'standard' || v === 'saver';
