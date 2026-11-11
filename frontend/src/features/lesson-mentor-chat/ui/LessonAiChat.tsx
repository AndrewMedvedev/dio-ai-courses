import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createAgentConversationKey,
  useAgentStore,
} from '@/entities/agent-chat';
import {
  AiChatPanel,
  ChatComposer,
  ChatEmpty,
  ChatIconButton,
  ChatMessage,
  ChatNotice,
  ChatQuickReplies,
  ChatThread,
  ChatTyping,
  IconDownload,
} from '@/shared/ui/ai-chat';

const QUICK_PROMPTS = [
  'Объяснить проще',
  'Привести пример',
  'Составить краткий конспект',
  'Помочь с практическим заданием',
];

export interface LessonAiChatProps {
  courseId: string;
  lessonId?: string;
  lessonTitle?: string;
  contentBlocks?: unknown[];
  onDownloadSummary?: () => void;
  panelId: string;
  focusOnOpen?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onAssistantResponse?: () => void;
}

/** Чат с ИИ-наставником по материалам урока — в общей панели ИИ-чата справа. */
export function LessonAiChat({
  courseId,
  lessonId,
  lessonTitle,
  contentBlocks = [],
  onDownloadSummary,
  panelId,
  isOpen,
  onClose,
  onAssistantResponse,
}: LessonAiChatProps) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const latestAssistantMessageRef = useRef<string | null>(null);
  const didObserveMessagesRef = useRef(false);
  const conversationKey = useMemo(
    () => createAgentConversationKey('mentor', courseId, lessonId),
    [courseId, lessonId],
  );
  const conversation = useAgentStore(
    (state) => state.conversations[conversationKey],
  );
  const initializeConversation = useAgentStore(
    (state) => state.initializeConversation,
  );
  const sendAgentMessage = useAgentStore((state) => state.sendMessage);
  const cancelRequest = useAgentStore((state) => state.cancelRequest);
  const messages = useMemo(
    () => conversation?.messages || [],
    [conversation?.messages],
  );
  const isSending = conversation?.status === 'loading';

  useEffect(() => {
    initializeConversation({
      key: conversationKey,
      agent: 'mentor',
      courseId,
    });
    return () => cancelRequest(conversationKey);
  }, [cancelRequest, conversationKey, courseId, initializeConversation]);

  // Ответ пришёл, пока чат закрыт, — кнопка открытия подсвечивается.
  useEffect(() => {
    const latestAssistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === 'assistant');
    const latestAssistantMessageId = latestAssistantMessage?.id || null;

    if (!didObserveMessagesRef.current) {
      didObserveMessagesRef.current = true;
      latestAssistantMessageRef.current = latestAssistantMessageId;
      return;
    }

    if (
      latestAssistantMessageId &&
      latestAssistantMessageId !== latestAssistantMessageRef.current
    ) {
      latestAssistantMessageRef.current = latestAssistantMessageId;
      if (!isOpen) onAssistantResponse?.();
    }
  }, [isOpen, messages, onAssistantResponse]);

  const sendMessage = async (value: string = inputValue) => {
    const prompt = value.trim();
    if (!prompt || isSending || !courseId) return;

    setInputValue('');
    try {
      await sendAgentMessage({
        key: conversationKey,
        agent: 'mentor',
        courseId,
        content: prompt,
        contentBlocks,
      });
    } catch {
      // Публичная ошибка уже сохранена в store; технические детали не логируем.
    }
  };

  return (
    <AiChatPanel
      id={panelId}
      open={isOpen}
      onClose={onClose}
      tag="Урок"
      title={lessonTitle || 'Материалы урока'}
      initialFocusRef={inputRef}
      className="lesson-page-ai-chat"
      headerActions={
        onDownloadSummary ? (
          <ChatIconButton
            label="Сохранить конспект урока в PDF"
            onClick={onDownloadSummary}
          >
            <IconDownload />
          </ChatIconButton>
        ) : null
      }
    >
      <ChatThread
        busy={isSending}
        scrollKey={`${messages.length}:${isSending}:${isOpen}`}
        centered={messages.length === 0 && !isSending}
        label="Переписка с ИИ по уроку"
      >
        {messages.length === 0 && !isSending ? (
          <ChatEmpty
            title="Чем помочь по этому уроку?"
            text="Спросите о сложном месте или выберите быстрый запрос."
          >
            <ChatQuickReplies
              className="tw:justify-center"
              options={QUICK_PROMPTS}
              onPick={(prompt) => {
                void sendMessage(prompt);
                inputRef.current?.focus({ preventScroll: true });
              }}
              disabled={isSending || !courseId}
              label="Быстрые запросы"
            />
          </ChatEmpty>
        ) : null}
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            role={message.role}
            text={message.text}
          />
        ))}
        {isSending ? <ChatTyping label="Готовлю ответ…" /> : null}
        {conversation?.error ? (
          <ChatNotice tone="error">{conversation.error}</ChatNotice>
        ) : null}
      </ChatThread>
      <ChatComposer
        value={inputValue}
        onChange={setInputValue}
        onSubmit={() => sendMessage()}
        busy={isSending}
        onStop={() => cancelRequest(conversationKey)}
        disabled={!courseId}
        textareaRef={inputRef}
        placeholder={
          isSending ? 'Можно написать следующий вопрос…' : 'Спросите про урок…'
        }
        ariaLabel="Сообщение для ИИ"
      />
    </AiChatPanel>
  );
}
