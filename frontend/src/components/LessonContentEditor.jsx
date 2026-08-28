import { Fragment, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  createAgentConversationKey,
  useAgentStore,
} from "../stores/agentStore";
import { convertDocumentToMarkdown } from "../utils/api";
import {
  allowedImageExtension,
  allowedImageTypes,
  allowedTextExtension,
  blockToMarkdown,
  blockTypes,
  createBlock,
  detectType,
  getBlockTitle,
  joinBlocks,
  MAX_CONTENT_BLOCKS,
  markdownComponents,
  normalizeContentBlocks,
  safeMarkdownUrl,
  stripUiFields,
  templates,
} from "../lesson/lessonEditorConfig";

export default function LessonContentEditor({
  courseId,
  lesson,
  onChange,
  contentLabel = "Теория",
  blocksLabel = "",
  showInsertControls = true,
}) {
  const [blocks, setBlocks] = useState(() =>
    normalizeContentBlocks(
      lesson.contentBlocks || lesson.content_blocks,
      lesson.markdown || lesson.content || "",
    ),
  );
  const [activeBlockId, setActiveBlockId] = useState("");
  const [insertIndex, setInsertIndex] = useState(null);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiImage, setAiImage] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [proposalError, setProposalError] = useState("");
  const [blockLimitError, setBlockLimitError] = useState("");
  const aiConversationKey = createAgentConversationKey(
    "editor",
    courseId,
    `${lesson.id}:${activeBlockId}`,
  );
  const aiConversation = useAgentStore(
    (state) => state.conversations[aiConversationKey],
  );
  const sendAgentMessage = useAgentStore((state) => state.sendMessage);
  const cancelAgentRequest = useAgentStore((state) => state.cancelRequest);
  const isAiSending = aiConversation?.status === "loading";
  const aiError = proposalError || aiConversation?.error || "";
  const fileInputRef = useRef(null);
  const aiImageInputRef = useRef(null);
  const aiMessagesRef = useRef(null);
  const blockRefs = useRef(new Map());

  useEffect(() => {
    const nextBlocks = normalizeContentBlocks(
      lesson.contentBlocks || lesson.content_blocks,
      lesson.markdown || lesson.content || "",
    );
    setBlocks(nextBlocks);
    setActiveBlockId("");
    setInsertIndex(null);
    setIsAiOpen(false);
    setAiInput("");
    setAiImage(null);
    setProposal(null);
    setProposalError("");
    setBlockLimitError("");
  }, [lesson.id]);

  useEffect(
    () => () => cancelAgentRequest(aiConversationKey),
    [aiConversationKey, cancelAgentRequest],
  );

  useEffect(() => {
    if (!activeBlockId) {
      return;
    }
    window.requestAnimationFrame(() => {
      blockRefs.current.get(activeBlockId)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    });
  }, [activeBlockId]);

  useEffect(() => {
    const container = aiMessagesRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [aiConversation?.messages, isAiSending]);

  const commitBlocks = (nextBlocks, nextActiveId = activeBlockId) => {
    const normalizedBlocks =
      nextBlocks.length > 0
        ? nextBlocks
        : [createBlock(templates.text, "text")];
    setBlocks(normalizedBlocks);
    setActiveBlockId(
      nextActiveId &&
        normalizedBlocks.some((block) => block.id === nextActiveId)
        ? nextActiveId
        : "",
    );
    onChange({
      contentBlocks: normalizedBlocks.map(stripUiFields),
      markdown: joinBlocks(normalizedBlocks),
      content: "",
    });
  };

  const updateBlock = (blockId, changes) => {
    commitBlocks(
      blocks.map((block) =>
        block.id === blockId ? { ...block, ...changes } : block,
      ),
      blockId,
    );
  };

  const updateQuestion = (blockId, questionIndex, changes) => {
    const target = blocks.find((block) => block.id === blockId);
    if (!target) return;

    const questions = [...(target.questions || [])];
    questions[questionIndex] = { ...questions[questionIndex], ...changes };
    updateBlock(blockId, { questions });
  };

  const addQuestion = (blockId) => {
    const target = blocks.find((block) => block.id === blockId);
    if (!target) return;
    updateBlock(blockId, {
      questions: [...(target.questions || []), { question: "", answer: "" }],
    });
  };

  const removeQuestion = (blockId, questionIndex) => {
    const target = blocks.find((block) => block.id === blockId);
    if (!target) return;
    const questions = (target.questions || []).filter(
      (_, index) => index !== questionIndex,
    );
    updateBlock(blockId, {
      questions: questions.length ? questions : [{ question: "", answer: "" }],
    });
  };

  const insertBlockAt = (index, type) => {
    if (blocks.length >= MAX_CONTENT_BLOCKS) {
      setBlockLimitError(
        `В уроке может быть не более ${MAX_CONTENT_BLOCKS} блоков.`,
      );
      setInsertIndex(null);
      return;
    }

    setBlockLimitError("");
    const safeIndex = Math.min(Math.max(index, 0), blocks.length);
    const newBlock = createBlock(templates[type], type);
    const nextBlocks = [
      ...blocks.slice(0, safeIndex),
      newBlock,
      ...blocks.slice(safeIndex),
    ];
    commitBlocks(nextBlocks, newBlock.id);
    setInsertIndex(null);
    setIsAiOpen(false);
    setProposal(null);
  };

  const deleteBlock = (blockId) => {
    const targetIndex = blocks.findIndex((block) => block.id === blockId);
    const nextBlocks = blocks.filter((block) => block.id !== blockId);
    const nextActive = nextBlocks[Math.max(0, targetIndex - 1)]?.id;
    commitBlocks(nextBlocks, nextActive);
    setIsAiOpen(false);
    setProposal(null);
  };

  const moveBlock = (blockId, direction) => {
    const currentIndex = blocks.findIndex((block) => block.id === blockId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= blocks.length) {
      return;
    }

    const nextBlocks = [...blocks];
    [nextBlocks[currentIndex], nextBlocks[nextIndex]] = [
      nextBlocks[nextIndex],
      nextBlocks[currentIndex],
    ];
    commitBlocks(nextBlocks, blockId);
  };

  const importFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
      return;
    }

    const availableSlots = Math.max(0, MAX_CONTENT_BLOCKS - blocks.length);
    if (availableSlots === 0) {
      setBlockLimitError(
        `В уроке может быть не более ${MAX_CONTENT_BLOCKS} блоков.`,
      );
      event.target.value = "";
      return;
    }

    setBlockLimitError(
      files.length > availableSlots
        ? `Будут добавлены только первые ${availableSlots} файлов: лимит — ${MAX_CONTENT_BLOCKS} блоков.`
        : "",
    );
    const importedContent = [];
    for (const file of files) {
      if (importedContent.length >= availableSlots) {
        break;
      }
      if (
        allowedImageTypes.has(file.type) ||
        (file.type === "" && allowedImageExtension.test(file.name))
      ) {
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
        importedContent.push({ type: "image", data: { image_url: dataUrl } });
        continue;
      }

      if (!allowedTextExtension.test(file.name)) {
        continue;
      }

      let text = "";
      if (/\.(pdf|docx|pptx|xlsx|html)$/i.test(file.name)) {
        const converted = await convertDocumentToMarkdown(file);
        text =
          typeof converted === "string" ? converted : converted?.markdown || "";
      } else {
        text = await file.text();
      }
      text = text.trim();
      if (text) {
        importedContent.push({ type: detectType(text), data: text });
      }
    }

    if (importedContent.length > 0) {
      const activeIndex = blocks.findIndex(
        (block) => block.id === activeBlockId,
      );
      const insertAt = activeIndex >= 0 ? activeIndex + 1 : blocks.length;
      const importedBlocks = importedContent.map((item) =>
        createBlock(item.data, item.type),
      );
      commitBlocks(
        [
          ...blocks.slice(0, insertAt),
          ...importedBlocks,
          ...blocks.slice(insertAt),
        ],
        importedBlocks[0]?.id,
      );
    }
    event.target.value = "";
  };

  const askAi = async () => {
    const prompt = aiInput.trim();
    if ((!prompt && !aiImage) || isAiSending) {
      return;
    }
    const activeBlock = blocks.find((block) => block.id === activeBlockId);
    if (
      !activeBlock ||
      activeBlock.content_type === "video" ||
      activeBlock.content_type === "image"
    ) {
      return;
    }
    const currentBlock = stripUiFields(activeBlock);
    setProposalError("");
    setAiInput("");
    setAiImage(null);

    try {
      const response = await sendAgentMessage({
        key: aiConversationKey,
        agent: "editor",
        courseId,
        content: prompt || "Измени блок с учётом прикреплённого изображения.",
        contentBlocks: blocks
          .filter((block) => block.id !== activeBlock.id)
          .map(stripUiFields),
        editorPayload: {
          content_type: activeBlock.content_type,
          content_block: JSON.stringify(currentBlock),
          images: aiImage ? [aiImage.src] : [],
        },
        emptyResponseMessage: "",
        responseDisplayMessage: (agentResponse) =>
          agentResponse?.parsedContent &&
          typeof agentResponse.parsedContent === "object" &&
          !Array.isArray(agentResponse.parsedContent)
            ? "Правка готова. Проверьте предложенный вариант и примените его, если он подходит."
            : "",
      });
      if (!response) return;
      if (
        !response.parsedContent ||
        typeof response.parsedContent !== "object" ||
        Array.isArray(response.parsedContent)
      ) {
        setProposalError(
          "ИИ вернул ответ в неподдерживаемом формате. Попробуйте уточнить запрос.",
        );
        return;
      }

      const proposedBlock = {
        ...response.parsedContent,
        content_type: activeBlock.content_type,
        ai_generated: true,
      };
      setProposal({
        blockId: activeBlock.id,
        block: proposedBlock,
        content: blockToMarkdown(proposedBlock),
      });
    } catch {
      // Публичная сетевая ошибка хранится в Zustand-store.
    }
  };

  const attachAiImage = (event) => {
    const [file] = Array.from(event.target.files || []);
    event.target.value = "";
    if (
      !file ||
      !allowedImageTypes.has(file.type) ||
      file.size > 50 * 1024 * 1024
    ) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAiImage({ name: file.name, src: String(reader.result) });
    };
    reader.readAsDataURL(file);
  };

  const applyProposal = () => {
    if (!proposal) {
      return;
    }
    const target = blocks.find((block) => block.id === proposal.blockId);
    if (!target) return;

    updateBlock(proposal.blockId, proposal.block);
    setProposal(null);
    setIsAiOpen(false);
  };

  const rejectProposal = () => {
    setProposal(null);
  };

  const scrollToBlock = (blockId) => {
    window.requestAnimationFrame(() => {
      blockRefs.current.get(blockId)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    });
  };

  const selectBlock = (blockId) => {
    setActiveBlockId(blockId);
    setInsertIndex(null);
    setIsAiOpen(false);
    setAiInput("");
    setAiImage(null);
    setProposal(null);
    scrollToBlock(blockId);
  };

  const renderTextAreaField = (block, field, label, placeholder, rows = 5) => (
    <label className="lesson-block-field lesson-block-field-wide">
      <span>{label}</span>
      <textarea
        value={block[field] || ""}
        onChange={(event) =>
          updateBlock(block.id, { [field]: event.target.value })
        }
        placeholder={placeholder}
        rows={rows}
      />
    </label>
  );

  const renderInputField = (block, field, label, placeholder) => (
    <label className="lesson-block-field">
      <span>{label}</span>
      <input
        value={block[field] || ""}
        onChange={(event) =>
          updateBlock(block.id, { [field]: event.target.value })
        }
        placeholder={placeholder}
      />
    </label>
  );

  const renderBlockFields = (block) => {
    switch (block.content_type) {
      case "text":
        return renderTextAreaField(
          block,
          "md_content",
          "Текст лекции",
          "Введите Markdown-контент",
          12,
        );
      case "video":
        return (
          <>
            {renderInputField(block, "url", "Ссылка на видео", "https://...")}
            {renderTextAreaField(
              block,
              "description",
              "Описание",
              "Кратко опишите видео",
              4,
            )}
          </>
        );
      case "image":
        return renderInputField(
          block,
          "image_url",
          "Ссылка на изображение",
          "https://... или data:image/...",
        );
      case "program_code":
        return (
          <>
            {renderInputField(block, "language", "Язык", "python")}
            {renderTextAreaField(
              block,
              "code",
              "Код",
              "Введите пример кода",
              10,
            )}
            {renderTextAreaField(
              block,
              "explanation",
              "Пояснение",
              "Что делает этот код",
              4,
            )}
          </>
        );
      case "mermaid":
        return (
          <>
            {renderInputField(
              block,
              "title",
              "Заголовок",
              "Название диаграммы",
            )}
            {renderTextAreaField(
              block,
              "md_content",
              "Код Mermaid",
              "flowchart TD\n  A --> B",
              9,
            )}
            {renderTextAreaField(
              block,
              "explanation",
              "Описание",
              "Поясните диаграмму",
              4,
            )}
          </>
        );
      case "quiz":
        return (
          <div className="lesson-block-field lesson-block-field-wide lesson-quiz-editor">
            <span>Вопросы</span>
            {(block.questions || []).map((question, questionIndex) => (
              <div
                className="lesson-quiz-question"
                key={`question-${questionIndex}`}
              >
                <label>
                  <span>Вопрос {questionIndex + 1}</span>
                  <input
                    value={question.question || ""}
                    onChange={(event) =>
                      updateQuestion(block.id, questionIndex, {
                        question: event.target.value,
                      })
                    }
                    placeholder="Введите вопрос"
                  />
                </label>
                <label>
                  <span>Ответ</span>
                  <textarea
                    value={question.answer || ""}
                    onChange={(event) =>
                      updateQuestion(block.id, questionIndex, {
                        answer: event.target.value,
                      })
                    }
                    placeholder="Введите правильный ответ"
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => removeQuestion(block.id, questionIndex)}
                >
                  Удалить вопрос
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => addQuestion(block.id)}
            >
              Добавить вопрос
            </button>
          </div>
        );
      case "math_formula":
      case "chemical_formula":
      case "musical_notation":
        return (
          <>
            {renderTextAreaField(
              block,
              "formula",
              "Формула / запись",
              "Введите формулу или нотацию",
              4,
            )}
            {renderTextAreaField(
              block,
              "explanation",
              "Пояснение",
              "Поясните значение",
              4,
            )}
          </>
        );
      default:
        return null;
    }
  };

  const renderInsertControl = (index) => (
    <div
      className={`lesson-insert-control ${insertIndex === index ? "is-open" : ""}`}
    >
      <button
        type="button"
        className={`lesson-insert-line ${insertIndex === index ? "is-active" : ""}`}
        onClick={() =>
          setInsertIndex((current) => (current === index ? null : index))
        }
      >
        {insertIndex === index ? "Скрыть" : "Вставить здесь"}
      </button>
      {insertIndex === index && (
        <div className="lesson-editor-palette lesson-insert-palette">
          {blockTypes.map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => insertBlockAt(index, type.id)}
            >
              <strong>{type.label}</strong>
              <span>{type.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const renderAiEditor = (block) => (
    <aside className="lesson-ai-editor">
      <div className="lesson-ai-editor-head">
        <span>ИИ-редактор</span>
        <button
          type="button"
          onClick={() => setIsAiOpen(false)}
          aria-label="Свернуть ИИ-редактор"
          title="Свернуть ИИ-редактор"
        >
          −
        </button>
      </div>
      <div
        className="lesson-ai-messages"
        ref={aiMessagesRef}
        aria-live="polite"
        aria-busy={isAiSending}
      >
        {(aiConversation?.messages || []).length === 0 && (
          <div className="lesson-ai-message is-assistant">
            <p>
              Опишите, что нужно изменить. Я подготовлю правку, а история
              диалога останется здесь.
            </p>
          </div>
        )}
        {(aiConversation?.messages || []).map((message) => (
          <div
            key={message.id}
            className={`lesson-ai-message is-${message.role}`}
          >
            <p>{message.text}</p>
            {message.role === "user" && (
              <span className="chat-message-status">✓ Отправлено</span>
            )}
          </div>
        ))}
        {isAiSending && (
          <div className="lesson-ai-message is-assistant is-thinking">
            <span className="chat-thinking-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>ИИ получил сообщение и готовит правку…</span>
          </div>
        )}
      </div>
      {aiImage && (
        <div className="lesson-ai-attachment">
          <img src={aiImage.src} alt="Прикрепленное изображение" />
          <span>{aiImage.name}</span>
          <button
            type="button"
            onClick={() => setAiImage(null)}
            aria-label="Удалить изображение"
          >
            ×
          </button>
        </div>
      )}
      {aiError && <p className="lesson-ai-error">{aiError}</p>}
      <div className="lesson-ai-composer">
        <input
          ref={aiImageInputRef}
          className="lesson-ai-image-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={attachAiImage}
        />
        <button
          type="button"
          className="lesson-ai-attach"
          onClick={() => aiImageInputRef.current?.click()}
          aria-label="Прикрепить изображение до 50 МБ"
          title="Прикрепить изображение до 50 МБ"
        >
          +
        </button>
        <textarea
          value={aiInput}
          onChange={(event) => setAiInput(event.target.value)}
          placeholder={
            isAiSending
              ? "Можно написать следующее сообщение — отправка после ответа"
              : "Напишите, что нужно изменить"
          }
          maxLength={10_000}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              askAi();
            }
          }}
        />
        <button
          type="button"
          className="lesson-ai-send"
          onClick={askAi}
          disabled={isAiSending || (!aiInput.trim() && !aiImage)}
          aria-label="Отправить сообщение"
          title="Отправить"
        >
          ↑
        </button>
      </div>
    </aside>
  );

  return (
    <div className="lesson-content-editor">
      <div className="lesson-content-editor-head">
        <div>
          <span>{contentLabel}</span>
          <strong>{blocksLabel}</strong>
        </div>
        <input
          ref={fileInputRef}
          className="knowledge-file-input"
          type="file"
          multiple
          accept=".pdf,.docx,.pptx,.xlsx,.md,.markdown,.html,.txt,.json,.sql,.js,.jsx,.ts,.tsx,.py,.csv,.png,.jpg,.jpeg,.webp,.gif"
          onChange={importFiles}
        />
      </div>

      {blockLimitError && (
        <p className="lesson-editor-limit-error">{blockLimitError}</p>
      )}

      <div className="lesson-content-editor-layout">
        <div className="lesson-editor-blocks">
          {showInsertControls &&
            blocks.length < MAX_CONTENT_BLOCKS &&
            renderInsertControl(0)}
          {blocks.map((block, index) => {
            const isActive = activeBlockId === block.id;
            const canUseAiEditor = !["video", "image"].includes(
              block.content_type,
            );
            return (
              <Fragment key={block.id}>
                <div
                  ref={(element) => {
                    if (element) {
                      blockRefs.current.set(block.id, element);
                    } else {
                      blockRefs.current.delete(block.id);
                    }
                  }}
                  className={`lesson-editor-block-row ${isActive && isAiOpen && canUseAiEditor ? "has-ai" : ""}`}
                >
                  <article
                    className={`lesson-editor-block is-${block.type} ${isActive ? "is-active" : "is-preview"}`}
                  >
                    {proposal && proposal.blockId === block.id ? (
                      <div className="lesson-block-proposal">
                        <div className="lesson-block-proposal-head">
                          <span>Предложено ИИ</span>
                          <div className="lesson-block-proposal-actions">
                            <button
                              type="button"
                              className="btn btn-solid"
                              onClick={applyProposal}
                            >
                              Применить
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={rejectProposal}
                            >
                              Не применять
                            </button>
                          </div>
                        </div>
                        <div className="lesson-markdown lesson-proposal-preview">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={markdownComponents}
                            urlTransform={safeMarkdownUrl}
                          >
                            {proposal.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    ) : isActive ? (
                      <>
                        <div className="lesson-editor-block-head">
                          <strong>{getBlockTitle(block)}</strong>
                          <div>
                            <button
                              type="button"
                              onClick={() => moveBlock(block.id, -1)}
                              disabled={index === 0}
                            >
                              Выше
                            </button>
                            <button
                              type="button"
                              onClick={() => moveBlock(block.id, 1)}
                              disabled={index === blocks.length - 1}
                            >
                              Ниже
                            </button>
                            {canUseAiEditor && (
                              <button
                                type="button"
                                className={isAiOpen ? "is-active" : ""}
                                onClick={() => {
                                  setIsAiOpen((current) => !current);
                                  scrollToBlock(block.id);
                                }}
                              >
                                ИИ-редактор
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setActiveBlockId("")}
                            >
                              Готово
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteBlock(block.id)}
                            >
                              Удалить
                            </button>
                          </div>
                        </div>
                        <div className="lesson-block-fields">
                          {renderBlockFields(block)}
                        </div>
                      </>
                    ) : (
                      <div
                        className="lesson-editor-block-select"
                        onClick={() => selectBlock(block.id)}
                        role="button"
                        tabIndex={0}
                        aria-label={`Редактировать блок ${index + 1}: ${getBlockTitle(block)}`}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            selectBlock(block.id);
                          }
                        }}
                      >
                        <div className="lesson-editor-preview-head">
                          <span>
                            {blockTypes.find((type) => type.id === block.type)
                              ?.label || "Блок"}
                          </span>
                          <strong>{getBlockTitle(block)}</strong>
                        </div>
                        <div className="lesson-markdown">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={markdownComponents}
                            urlTransform={safeMarkdownUrl}
                          >
                            {blockToMarkdown(block) || "Блок пока пуст."}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </article>
                  {isActive &&
                    isAiOpen &&
                    canUseAiEditor &&
                    renderAiEditor(block)}
                </div>
                {showInsertControls &&
                  blocks.length < MAX_CONTENT_BLOCKS &&
                  renderInsertControl(index + 1)}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
