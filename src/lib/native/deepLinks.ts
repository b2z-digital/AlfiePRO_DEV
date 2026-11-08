/**
 * Maps links into the app to web routes.
 *
 * Sources:
 *  - alfiepro://… links (the scheme the live Expo app registered; old emails and pushes use it)
 *  - https://app.alfiepro.com.au/… universal links (once associated domains are set up)
 *  - notification `route` values written by send-push-notification for the Expo app,
 *    e.g. "/(tabs)/calendar" or "/results/history"
 */

const LEGACY_ROUTES: Array<[RegExp, string | ((m: RegExpMatchArray) => string)]> = [
  [/^\/\(tabs\)\/?$/, '/'],
  [/^\/\(tabs\)\/(calendar|events)$/, '/calendar'],
  [/^\/calendar\/(event|meeting|venue)\/[^/]+$/, '/calendar'],
  [/^\/\(tabs\)\/classifieds(\/.*)?$/, '/classifieds'],
  [/^\/classifieds(\/.*)?$/, '/classifieds'],
  [/^\/\(tabs\)\/membership$/, '/my-membership'],
  [/^\/membership(-gate)?$/, '/my-membership'],
  [/^\/\(tabs\)\/notifications$/, '/comms'],
  [/^\/messages(\/.*)?$/, '/comms'],
  [/^\/community(\/.*)?$/, '/community'],
  [/^\/\(tabs\)\/news$/, '/news'],
  [/^\/news\/article\/([^/]+)$/, (m) => `/news/${m[1]}`],
  [/^\/news\/?$/, '/news'],
  [/^\/results\/history$/, '/my-results'],
  [/^\/results\/(event|series|national)\/[^/]+$/, '/results'],
  [/^\/\(tabs\)\/results$/, '/results'],
  [/^\/\(tabs\)\/(rigs|my-stats)$/, '/my-garage'],
  [/^\/boats\/[^/]+$/, '/my-garage'],
  [/^\/alfie-tv\/(home|index)?$/, '/alfie-tv'],
  [/^\/\(tabs\)\/tasks$/, '/tasks'],
  [/^\/\(tabs\)\/weather$/, '/weather'],
  [/^\/(wind-forecast|temperature-forecast|tides)$/, '/weather'],
  [/^\/\(tabs\)\/media$/, '/media'],
  [/^\/media(\/.*)?$/, '/media'],
  [/^\/\(tabs\)\/profile$/, '/settings'],
  [/^\/ask-alfie$/, '/'],
];

/** Turns a legacy Expo route or a web path into a web route. Unknown paths pass through. */
export function mapAppRoute(route: string): string {
  if (!route) return '/';
  const [path, query = ''] = route.split('?');
  const clean = path.replace(/\/+$/, '') || '/';
  for (const [re, target] of LEGACY_ROUTES) {
    const m = clean.match(re);
    if (m) {
      const to = typeof target === 'function' ? target(m) : target;
      return query && !to.includes('?') ? `${to}?${query}` : to;
    }
  }
  return query ? `${clean}?${query}` : clean;
}

export type ParsedAppLink =
  | { kind: 'auth-callback'; params: URLSearchParams }
  | { kind: 'route'; path: string };

/** Parses alfiepro://… and https://app.alfiepro.com.au/… links. */
export function parseAppUrl(url: string): ParsedAppLink | null {
  let path: string;
  let search = '';
  let hash = '';
  try {
    if (url.startsWith('alfiepro://')) {
      // alfiepro://auth/callback?code=… → host "auth", path "/callback"
      const rest = url.slice('alfiepro://'.length);
      const [beforeHash, h = ''] = rest.split('#');
      const [p, s = ''] = beforeHash.split('?');
      path = `/${p}`.replace(/\/{2,}/g, '/');
      search = s;
      hash = h;
    } else {
      const u = new URL(url);
      path = u.pathname;
      search = u.search.replace(/^\?/, '');
      hash = u.hash.replace(/^#/, '');
    }
  } catch {
    return null;
  }

  if (path.replace(/\/+$/, '') === '/auth/callback') {
    // PKCE returns ?code=…; errors may come in the query or the hash
    const params = new URLSearchParams(search || hash);
    return { kind: 'auth-callback', params };
  }
  return { kind: 'route', path: mapAppRoute(search ? `${path}?${search}` : path) };
}
