import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MemberNotificationComponentModern } from '../components/MemberNotificationComponentModern';

interface CommsPageProps {
  darkMode?: boolean;
}

export const CommsPage: React.FC<CommsPageProps> = ({ darkMode = true }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const shouldCompose = searchParams.get('compose') === 'true';

  return (
    <div className="h-full">
      <MemberNotificationComponentModern
        darkMode={darkMode}
        initialShowCompose={shouldCompose}
      />
    </div>
  );
};

export default CommsPage;
