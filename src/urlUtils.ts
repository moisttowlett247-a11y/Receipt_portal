/**
 * Portal URL & Routing Helpers
 *
 * Handles base path resolution for both local development (or container hosts)
 * and GitHub Pages repo path deployments (e.g. /Receipt_portal/ or /Receipt_portal/admin).
 */

/**
 * Returns the base pathname prefix of the current application.
 * e.g. on GitHub Pages "https://moisttowlett247-a11y.github.io/Receipt_portal/" -> "/Receipt_portal"
 * e.g. on dev root "https://localhost:3000/" -> ""
 */
export function getAppBasePath(): string {
  if (typeof window === 'undefined') return '';
  const pathname = window.location.pathname;
  const hostname = window.location.hostname.toLowerCase();

  // Check for case-insensitive /receipt_portal prefix (e.g. GitHub Pages repo root)
  const ghRepoMatch = pathname.match(/^(\/[^\/]*receipt_portal[^\/]*)/i);
  if (ghRepoMatch && ghRepoMatch[1]) {
    // Preserve exact case from URL, or default to standard /Receipt_portal
    return ghRepoMatch[1].replace(/\/+$/, '');
  }

  // If on github.io domain and repository is known
  if (hostname.endsWith('github.io')) {
    const firstSegment = pathname.split('/')[1];
    if (firstSegment && !['admin', 'qbo', 'api'].includes(firstSegment.toLowerCase())) {
      return `/${firstSegment}`;
    }
    return '/Receipt_portal';
  }

  // Also check if stored GitHub config points to a repository name
  try {
    const saved = localStorage.getItem('receipt_processor_gh_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.repo && pathname.toLowerCase().startsWith(`/${parsed.repo.toLowerCase()}`)) {
        return `/${parsed.repo}`;
      }
    }
  } catch {}

  return '';
}

/**
 * Constructs an absolute or relative portal path that respects repository prefixes.
 *
 * @param targetPath - '/' for client portal, '/admin' for admin portal
 * @returns Fully qualified pathname e.g. "/Receipt_portal/" or "/Receipt_portal/admin"
 */
export function buildPortalUrl(targetPath: '/' | '/admin'): string {
  const base = getAppBasePath();
  if (targetPath === '/admin') {
    return base ? `${base}/admin` : '/admin';
  }
  // Client portal
  return base ? `${base}/` : '/';
}

/**
 * Returns whether the current URL points to the Admin Console.
 * Accurately checks pathname endings, query flags, and hash states.
 */
export function isCurrentRouteAdmin(): boolean {
  if (typeof window === 'undefined') return false;

  const path = window.location.pathname.toLowerCase().replace(/\/+$/, '');
  const hash = window.location.hash.toLowerCase();
  const search = window.location.search.toLowerCase();

  // Check URL query parameters (supports ?p=admin or ?p=/admin or ?p=Receipt_portal/admin from GitHub Pages 404.html redirect)
  const searchParams = new URLSearchParams(window.location.search);
  const pParam = searchParams.get('p') ? searchParams.get('p')!.toLowerCase() : '';

  if (
    pParam.endsWith('/admin') ||
    pParam === 'admin' ||
    pParam.includes('/admin') ||
    pParam.includes('admin')
  ) {
    return true;
  }

  return (
    path.endsWith('/admin') ||
    path.includes('/admin/') ||
    path.includes('/qbo') ||
    hash === '#admin' ||
    hash === '#/admin' ||
    hash === '#qbo' ||
    hash === '#/qbo' ||
    search.includes('p=admin') ||
    search.includes('admin=true') ||
    search.includes('portal=admin') ||
    search.includes('view=admin') ||
    search.includes('tab=qbo') ||
    search.includes('qbo=true')
  );
}
