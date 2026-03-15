import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Conversations } from '../components/conversations/Conversations';

interface CommsPageProps {
  darkMode?: boolean;
}

export const CommsPage: React.FC<CommsPageProps> = ({ darkMode = true }) => {
  const [searchParams] = useSearchParams();
  const shouldCompose = searchParams.get('compose') === 'true';

  return (
    <div className="h-full -m-4 sm:-m-6 lg:-m-8">
      <Conversations
        darkMode={darkMode}
        initialShowCompose={shouldCompose}
      />
    </div>
  );
};

export default CommsPage;
