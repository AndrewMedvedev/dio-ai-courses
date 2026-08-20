import { useMemo, useState } from "react";

const quickPrompts = [
  "Сделай описание понятнее",
  "Добавь учебные цели",
  "Сделай блок практичнее",
];

function buildSuggestion(block, prompt) {
  const title = block.title.trim() || "Новый блок";
  const description = block.description?.trim() || "Описание блока пока пустое.";

  if (prompt.toLowerCase().includes("цели")) {
    return {
      title,
      description: `${description}\n\nЦели блока:\n- Понять ключевые понятия темы.\n- Разобрать примеры из практики.\n- Закрепить материал через задания.`,
    };
  }

  if (prompt.toLowerCase().includes("практич")) {
    return {
      title,
      description: `${description}\n\nПрактический фокус: после теории студент выполняет мини-задание, получает критерии самопроверки и связывает результат с реальным рабочим сценарием.`,
    };
  }

  return {
    title: title.replace(/^Блок\s*\d+\.?\s*/i, "").trim() || title,
    description: `В этом блоке студент последовательно разбирает тему, видит примеры применения и закрепляет материал через практику. ${description}`,
  };
}

export default function BlockAiEditor({ block, onApply }) {
  const [messages, setMessages] = useState(() => [
    {
      id: "initial",
      role: "assistant",
      text: "Опиши, как улучшить этот блок: сделать описание яснее, добавить цели, усилить практику или изменить тон.",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [draft, setDraft] = useState(null);

  const canApply = useMemo(
    () =>
      draft &&
      (draft.title !== block.title || draft.description !== (block.description || "")),
    [block.description, block.title, draft],
  );

  const submitPrompt = (value = inputValue) => {
    const prompt = value.trim();
    if (!prompt) {
      return;
    }

    const suggestion = buildSuggestion(block, prompt);
    setDraft(suggestion);
    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: "user",
        text: prompt,
      },
      {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: "Подготовил вариант. Проверь черновик ниже и примени, если подходит.",
      },
    ]);
    setInputValue("");
  };

  return (
    <div className="block-ai-editor">
      <div className="block-ai-editor-head">
        <div>
          <span>ИИ-редактор</span>
          <strong>{block.title}</strong>
        </div>
      </div>

      <div className="block-ai-messages">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`block-ai-message ${message.role === "user" ? "is-user" : "is-assistant"}`}
          >
            {message.text}
          </div>
        ))}
      </div>

      <div className="block-ai-quick">
        {quickPrompts.map((prompt) => (
          <button key={prompt} type="button" onClick={() => submitPrompt(prompt)}>
            {prompt}
          </button>
        ))}
      </div>

      {draft && (
        <div className="block-ai-draft">
          <label>
            <span>Название</span>
            <input
              value={draft.title}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, title: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Описание</span>
            <textarea
              value={draft.description}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
            />
          </label>
          <button
            type="button"
            className="btn btn-solid block-ai-apply"
            disabled={!canApply}
            onClick={() =>
              onApply({
                title: draft.title,
                description: draft.description,
              })
            }
          >
            Применить к блоку
          </button>
        </div>
      )}

      <div className="block-ai-composer">
        <textarea
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          placeholder="Например: перепиши описание проще и добавь практический результат"
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) {
              return;
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submitPrompt();
            }
          }}
        />
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => submitPrompt()}
          disabled={!inputValue.trim()}
        >
          Отправить
        </button>
      </div>
    </div>
  );
}
