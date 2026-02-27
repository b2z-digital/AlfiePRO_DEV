import imageCompression from 'browser-image-compression';

type ImagePreset = 'avatar' | 'logo' | 'thumbnail' | 'photo' | 'cover' | 'banner';

const PRESETS: Record<ImagePreset, { maxSizeMB: number; maxWidthOrHeight: number }> = {
  avatar: { maxSizeMB: 0.3, maxWidthOrHeight: 400 },
  logo: { maxSizeMB: 0.5, maxWidthOrHeight: 500 },
  thumbnail: { maxSizeMB: 0.3, maxWidthOrHeight: 400 },
  photo: { maxSizeMB: 0.8, maxWidthOrHeight: 1920 },
  cover: { maxSizeMB: 1, maxWidthOrHeight: 1920 },
  banner: { maxSizeMB: 0.8, maxWidthOrHeight: 1920 },
};

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

export async function compressImage(
  file: File,
  preset: ImagePreset = 'photo'
): Promise<File> {
  if (!isImageFile(file)) return file;

  if (file.type === 'image/svg+xml') return file;

  const config = PRESETS[preset];

  if (file.size <= config.maxSizeMB * 1024 * 1024) return file;

  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: config.maxSizeMB,
      maxWidthOrHeight: config.maxWidthOrHeight,
      useWebWorker: true,
      fileType: 'image/jpeg',
    });
    return compressed;
  } catch (err) {
    console.warn('Image compression failed, using original:', err);
    return file;
  }
}

export async function compressImageCustom(
  file: File,
  maxSizeMB: number,
  maxWidthOrHeight: number
): Promise<File> {
  if (!isImageFile(file)) return file;

  if (file.type === 'image/svg+xml') return file;

  if (file.size <= maxSizeMB * 1024 * 1024) return file;

  try {
    const compressed = await imageCompression(file, {
      maxSizeMB,
      maxWidthOrHeight,
      useWebWorker: true,
      fileType: 'image/jpeg',
    });
    return compressed;
  } catch (err) {
    console.warn('Image compression failed, using original:', err);
    return file;
  }
}
