import { useParams, useLocation } from 'react-router-dom';
import { useSubdomain } from '../contexts/SubdomainContext';

export const usePublicNavigation = () => {
  const { clubId: routeClubId } = useParams<{ clubId: string }>();
  const { clubId: contextClubId, isSubdomainMode: contextIsSubdomain } = useSubdomain();
  const location = useLocation();

  const isSubdomainMode = contextIsSubdomain || !location.pathname.startsWith('/club/');
  const clubId = contextClubId || routeClubId;

  const buildPublicUrl = (path: string) => {
    const url = isSubdomainMode ? path : `/club/${clubId}/public${path}`;
    console.log('🔗 buildPublicUrl:', {
      path,
      isSubdomainMode,
      contextClubId,
      routeClubId,
      clubId,
      result: url,
      currentPath: location.pathname
    });
    return url;
  };

  return {
    isSubdomainMode,
    buildPublicUrl,
    clubId
  };
};
