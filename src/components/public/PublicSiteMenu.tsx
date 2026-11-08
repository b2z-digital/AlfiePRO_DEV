import React from 'react';
import { Link } from 'react-router-dom';
import { menuItemHref, SiteMenuItem } from '../../utils/publicSite';

interface Props {
  items: SiteMenuItem[];
  /** Published builder-page slugs; page items not in it are hidden (null = still loading) */
  publishedSlugs?: Set<string> | null;
  activePage?: string;
  buildPublicUrl: (path: string) => string;
  onNavigate: () => void;
}

const TOP = 'block py-4 text-center text-gray-900 font-medium text-sm tracking-[0.15em] uppercase hover:text-gray-600 transition-colors border-b border-gray-200';

const isActive = (item: SiteMenuItem, activePage?: string) => {
  if (!activePage) return false;
  if (item.kind === 'home') return activePage === 'home';
  if (item.kind === 'auto') return activePage === item.target;
  if (item.kind === 'page') return activePage === `page:${item.target}`;
  return false;
};

const ItemLink: React.FC<{ item: SiteMenuItem; className: string; buildPublicUrl: Props['buildPublicUrl']; onNavigate: () => void }> = ({ item, className, buildPublicUrl, onNavigate }) => {
  const target = menuItemHref(item);
  if (!target) return null;
  return target.internal ? (
    <Link to={buildPublicUrl(target.href)} className={className} onClick={onNavigate}>{item.label}</Link>
  ) : (
    <a href={target.href} target="_blank" rel="noopener noreferrer" className={className} onClick={onNavigate}>{item.label}</a>
  );
};

/** Items of the public site's slide-out menu, from the club's saved menu (or the default one). */
export const PublicSiteMenu: React.FC<Props> = ({ items: allItems, publishedSlugs, activePage, buildPublicUrl, onNavigate }) => {
  const live = (i: SiteMenuItem) => i.kind !== 'page' || (!!publishedSlugs && publishedSlugs.has(i.target || ''));
  // A draft page drops out of the menu; anything nested under it moves up a level
  const items = allItems.flatMap(i => (live(i)
    ? [i.children ? { ...i, children: i.children.filter(live) } : i]
    : (i.children || []).filter(live)));
  return (
  <nav className="space-y-0">
    {items.map(item => {
      if (item.kind === 'dropdown') {
        const kids = (item.children || []).filter(k => menuItemHref(k));
        if (kids.length === 0) return null;
        return (
          <div key={item.id} className="border-b border-gray-200 pb-1">
            <span className="site-menu-group uppercase">{item.label}</span>
            {kids.map(k => (
              <ItemLink key={k.id} item={k} buildPublicUrl={buildPublicUrl} onNavigate={onNavigate}
                className={`site-menu-sub uppercase ${isActive(k, activePage) ? 'bg-gray-50' : ''}`} />
            ))}
          </div>
        );
      }
      const kids = (item.children || []).filter(k => menuItemHref(k));
      return (
        <React.Fragment key={item.id}>
          <ItemLink item={item} buildPublicUrl={buildPublicUrl} onNavigate={onNavigate}
            className={`${TOP} ${isActive(item, activePage) ? 'bg-gray-50' : ''}`} />
          {kids.map(k => (
            <ItemLink key={k.id} item={k} buildPublicUrl={buildPublicUrl} onNavigate={onNavigate}
              className={`site-menu-sub uppercase ${isActive(k, activePage) ? 'bg-gray-50' : ''}`} />
          ))}
        </React.Fragment>
      );
    })}
  </nav>
  );
};
