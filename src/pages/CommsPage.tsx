import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Conversations } from '../components/conversations/Conversations';
import { TopLevelTab } from '../components/conversations/ConversationsSidebar';

interface CommsPageProps {
  darkMode?: boolean;
}

export const CommsPage: React.FC<CommsPageProps> = ({ darkMode = true }) => {
  const [searchParams] = useSearchParams();
  const shouldCompose = searchParams.get('compose') === 'true';
  const recipientId = searchParams.get('recipientId') || undefined;
  const chatWith = searchParams.get('chatWith') || undefined;
  const chatName = searchParams.get('chatName') || undefined;
  const chatAvatar = searchParams.get('chatAvatar') || undefined;
  const tab = searchParams.get('tab') as TopLevelTab | null;

  return (
    <Conversations
      darkMode={darkMode}
      initialShowCompose={shouldCompose}
      initialRecipientId={recipientId}
      initialChatWith={chatWith}
      initialChatName={chatName}
      initialChatAvatar={chatAvatar}
      initialTab={tab || undefined}
    />
  );
};

export default CommsPage;
