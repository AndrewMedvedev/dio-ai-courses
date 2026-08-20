import { useEffect, useRef, useState } from "react";
import { askMentorAgent } from "../utils/api";

const createId = () =>
  `lesson-chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function LessonAiChat({
  onDownloadSummary,
  initiallyExpanded = false,
}) {
  const [messages, setMessages] = useState(() => [
    {
      id: createId(),
      role: "assistant",
      text: "Привет! Я ИИ-помощник. Задайте вопрос по интересующей теме.",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(!initiallyExpanded);
  const [isSending, setIsSending] = useState(false);
  const [chatId, setChatId] = useState(null);
  const messagesRef = useRef(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const container = messagesRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    const prompt = inputValue.trim();
    if (!prompt || isSending) {
      return;
    }

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setMessages((current) => [
      ...current,
      { id: createId(), role: "user", text: prompt },
    ]);
    setInputValue("");
    setIsSending(true);

    try {
      const response = await askMentorAgent({
        message: prompt,
        chat_id: chatId,
      });
      if (requestRef.current !== requestId) return;
      if (response.chatId) {
        setChatId(response.chatId);
      }
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: "assistant",
          text: String(response.content ?? ""),
        },
      ]);
    } catch (error) {
      if (requestRef.current === requestId) {
        setMessages((current) => [
          ...current,
          {
            id: createId(),
            role: "assistant",
            text:
              error.userMessage ||
              error.message ||
              "Не удалось получить ответ. Попробуйте ещё раз.",
          },
        ]);
      }
    } finally {
      if (requestRef.current === requestId) {
        setIsSending(false);
      }
    }
  };

  return (
    <aside
      className={`lesson-page-ai-chat ${isCollapsed ? "is-collapsed" : ""}`}
      aria-label="Чат с ИИ"
    >
      <div className="lesson-ai-editor-head">
        <span>ИИ-чат</span>
        <strong>Задайте вопрос</strong>
        <div className="lesson-page-ai-chat-head-actions">
          <button
            type="button"
            className="lesson-page-ai-chat-download"
            onClick={onDownloadSummary}
            aria-label="Сохранить конспект урока в PDF"
            title="Сохранить конспект в PDF"
          >
            <span aria-hidden="true">⇩</span>
          </button>
          <button
            type="button"
            className="lesson-page-ai-chat-toggle"
            onClick={() => setIsCollapsed((current) => !current)}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? "Развернуть ИИ-чат" : "Свернуть ИИ-чат"}
            title={isCollapsed ? "Развернуть чат" : "Свернуть чат"}
          >
            <span aria-hidden="true">−</span>
          </button>
        </div>
      </div>

      <button
        type="button"
        className="lesson-page-ai-chat-rail"
        onClick={() => setIsCollapsed(false)}
        aria-label="Развернуть ИИ-чат"
      >
        <span aria-hidden="true">✦</span>
        <strong>ИИ-чат</strong>
      </button>

      <div
        className="lesson-page-ai-chat-messages"
        ref={messagesRef}
        aria-live="polite"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={`lesson-page-ai-chat-message is-${message.role}`}
          >
            {message.text}
          </div>
        ))}
      </div>

      <div className="lesson-ai-composer lesson-page-ai-chat-composer">
        <textarea
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          placeholder={
            isSending ? "ИИ отвечает..." : "Напишите сообщение для ИИ"
          }
          disabled={isSending}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) {
              return;
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              sendMessage();
            }
          }}
        />
        <button
          type="button"
          className="lesson-ai-send"
          onClick={sendMessage}
          disabled={!inputValue.trim() || isSending}
          aria-label="Отправить сообщение"
          title="Отправить"
        >
          ↑
        </button>
      </div>
    </aside>
  );
}
