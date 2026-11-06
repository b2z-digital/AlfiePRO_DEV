/**
 * App-wide fallback for images that fail to load.
 *
 * 1. External images get one retry without a Referer header. Many hosts block
 *    hot-linked images by referrer (Google profile photos, club websites used by
 *    scraped news), and load fine without it.
 * 2. If an image still fails:
 *    - avatars (inside an avatar/face wrapper or a small round frame) are hidden
 *      and their wrapper shows the person's initials from the image alt text;
 *    - any other image is hidden, so no broken-image icon or alt text shows.
 * Purely visual: it only toggles data attributes that CSS reads.
 */
const AVATAR_WRAPPERS = '.a-pl-face, .a-av, .a-settings-avatar, .pl__face, [class*="avatar" i]';

const initialsOf = (label: string) =>
  label
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');

const isAvatar = (img: HTMLImageElement) => {
  if (img.closest(AVATAR_WRAPPERS)) return true;
  const parent = img.parentElement;
  if (!parent) return false;
  const round = img.classList.contains('rounded-full') || parent.classList.contains('rounded-full');
  const box = parent.getBoundingClientRect();
  return round && box.width > 0 && box.width <= 120;
};

const markBroken = (img: HTMLImageElement) => {
  if (isAvatar(img) && img.parentElement) {
    img.setAttribute('data-alfie-broken', 'avatar');
    const label = img.getAttribute('alt') || img.getAttribute('title') || img.parentElement.getAttribute('title') || '';
    const ini = initialsOf(label);
    if (ini) img.parentElement.setAttribute('data-alfie-initials', ini);
  } else {
    img.setAttribute('data-alfie-broken', 'img');
  }
};

export function installBrokenImageFallback() {
  if (typeof document === 'undefined' || (window as any).__alfieBrokenImages) return;
  (window as any).__alfieBrokenImages = true;

  document.addEventListener(
    'error',
    (event) => {
      const img = event.target as HTMLImageElement | null;
      if (!img || img.tagName !== 'IMG') return;
      const src = img.getAttribute('src') || '';
      if (!src) return;

      let external = false;
      try {
        external = /^https?:/i.test(src) && new URL(src, window.location.href).origin !== window.location.origin;
      } catch {
        external = false;
      }

      if (external && img.getAttribute('data-alfie-retry') !== src && img.referrerPolicy !== 'no-referrer') {
        img.setAttribute('data-alfie-retry', src);
        img.referrerPolicy = 'no-referrer';
        img.setAttribute('src', src); // re-request without the Referer header
        return;
      }
      markBroken(img);
    },
    true
  );

  document.addEventListener(
    'load',
    (event) => {
      const img = event.target as HTMLImageElement | null;
      if (!img || img.tagName !== 'IMG' || !img.hasAttribute('data-alfie-broken')) return;
      img.removeAttribute('data-alfie-broken');
      img.parentElement?.removeAttribute('data-alfie-initials');
    },
    true
  );
}
