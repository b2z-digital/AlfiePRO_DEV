import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Club } from '../../types/club';
import { usePublicNavigation } from '../../hooks/usePublicNavigation';
import { usePublishedPageSlugs, useSiteTheme, useSiteVisit } from '../../hooks/usePublicSite';
import { resolveMenu } from '../../utils/publicSite';
import { PublicSiteMenu } from './PublicSiteMenu';

interface PublicHeaderProps {
  club: Club | null;
  activePage?: string;
}

const getClubInitials = (clubName: string): string => {
  return clubName.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 3);
};

export const PublicHeader: React.FC<PublicHeaderProps> = ({ club, activePage = '' }) => {
  const { buildPublicUrl } = usePublicNavigation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const site = useSiteTheme(club?.website_theme);
  useSiteVisit(club?.id);
  const menuItems = resolveMenu(site.menu !== undefined ? site.menu : club?.website_menu);
  const publishedSlugs = usePublishedPageSlugs(club?.id, menuItems.some(i => i.kind === 'page' || i.children?.some(c => c.kind === 'page')));

  if (!club) return null;

  const clubInitials = getClubInitials(club.name);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white shadow-md">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex flex-col items-center gap-0.5 p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Menu"
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6 text-gray-700" />
              ) : (
                <>
                  <Menu className="w-6 h-6 text-gray-700" />
                  <span className="text-[10px] text-gray-700 font-semibold tracking-wider">MENU</span>
                </>
              )}
            </button>

            <Link
              to={buildPublicUrl('/')}
              className="absolute left-1/2 transform -translate-x-1/2 flex flex-col items-center cursor-pointer"
            >
              {club.logo ? (
                <img
                  src={club.logo}
                  alt={club.name}
                  className="h-16 w-auto object-contain max-w-[200px]"
                  draggable="false"
                />
              ) : (
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow-lg">
                    <span className="text-white font-bold text-base">{clubInitials}</span>
                  </div>
                  <span className="text-xs text-gray-600 mt-1 font-medium">{club.abbreviation || clubInitials}</span>
                </div>
              )}
            </Link>

            <a
              href="https://alfiepro.com.au"
              target="_blank"
              rel="noopener noreferrer"
              className="site-btn site-btn-p px-6 py-2.5 text-white font-semibold rounded-lg transition-colors text-sm tracking-wide"
            >
              MEMBERS
            </a>
          </div>
        </div>

        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        <div
          className={`fixed top-0 left-0 h-full w-[420px] max-w-full overflow-y-auto bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="bg-gray-100 px-6 py-7">
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center text-gray-900 font-semibold text-sm tracking-[0.2em] hover:text-gray-600 transition-colors"
            >
              CLOSE MENU
            </button>
          </div>

          <PublicSiteMenu
            items={menuItems}
            publishedSlugs={publishedSlugs}
            activePage={activePage}
            buildPublicUrl={buildPublicUrl}
            onNavigate={() => setMobileMenuOpen(false)}
          />
        </div>
      </nav>
    </>
  );
};
