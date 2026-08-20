import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SectionTop from "../components/SectionTop";
import { uploadDocument, isAuthenticated } from "../utils/api";

const MAX_FILE_SIZE_BYTES = 30 * 1024 * 1024;

const AI_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const AI_IMAGE_MAX_SIZE = 50 * 1024 * 1024;

function createBlockDraft(file, index) {
  return {
    id: `manual-block-${Date.now()}-${index}`,
    file,
    blockNumber: index + 1,
    status:
      file.size > MAX_FILE_SIZE_BYTES ? "error" : "uploading",
    selected: false,
    markdown: "",
    proposal: null,
    error:
      file.size > MAX_FILE_SIZE_BYTES
        ? "Файл больше 30 МБ. Его нельзя отправить на backend."
        : "",
  };
}

function buildBlockAiDraft(markdown, prompt) {
  const lowerPrompt = prompt.toLowerCase();

  if (lowerPrompt.includes("схем")) {
    return `${markdown}\n\n\`\`\`mermaid\nflowchart TD\n  A[Начало] --> B[Шаг]\n\`\`\``;
  }
  if (lowerPrompt.includes("таблиц")) {
    return `${markdown}\n\n| Поле | Описание |\n| --- | --- |\n| Значение | Текст |`;
  }
  if (lowerPrompt.includes("код")) {
    return `${markdown}\n\n\`\`\`js\n// код\n\`\`\``;
  }

  return `${markdown}\n\n> Итог: материал блока связывает теорию с практическим результатом.`;
}

export default function ManualCourseBuilderPage({ onCreateCourse }) {
  const fileInputRef = useRef(null);

  const [blocks, setBlocks] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  const [lessons, setLessons] = useState([]);
  const [selectedLessonIds, setSelectedLessonIds] = useState([]);

  const [modules, setModules] = useState([]);
  const [courseTitle, setCourseTitle] = useState("");

  const [editingBlockId, setEditingBlockId] = useState(null);
  const [chatBlockId, setChatBlockId] = useState(null);
  const chatBoxRef = useRef(null);

  const [aiInput, setAiInput] = useState("");
  const [aiImage, setAiImage] = useState(null);
  const aiImageInputRef = useRef(null);

  const readyBlocks = blocks.filter((block) => block.status === "ready");
  const selectedBlocks = readyBlocks.filter((block) => block.selected);
  const activeChatBlock =
    blocks.find((block) => block.id === chatBlockId) || null;

  const hasBlocks = blocks.length > 0;
  const hasLessons = lessons.length > 0;
  const hasModules = modules.length > 0;
  const canCreateLesson = selectedBlocks.length > 0;
  const canCreateModule = selectedLessonIds.length > 0;

  const uploadBlock = async (blockDraft) => {
    if (blockDraft.status === "error") {
      return;
    }

    if (!isAuthenticated()) {
      setBlocks((prev) =>
        prev.map((block) =>
          block.id === blockDraft.id
            ? {
                ...block,
                status: "error",
                error: "Необходимо войти в аккаунт (страница /login).",
              }
            : block,
        ),
      );
      return;
    }

    try {
      const markdown = await uploadDocument(blockDraft.file);

      setBlocks((prev) =>
        prev.map((block) =>
          block.id === blockDraft.id
            ? {
                ...block,
                status: "ready",
                markdown,
              }
            : block,
        ),
      );
    } catch {
      setBlocks((prev) =>
        prev.map((block) =>
          block.id === blockDraft.id
            ? {
                ...block,
                status: "error",
                error: "Не удалось обработать материал.",
              }
            : block,
        ),
      );
    }
  };

  const handleFiles = async (fileList) => {
    const pickedFiles = Array.from(fileList || []);

    if (pickedFiles.length === 0) {
      return;
    }

    const startIndex = blocks.length;
    const drafts = pickedFiles.map((file, index) =>
      createBlockDraft(file, startIndex + index),
    );

    setBlocks((prev) => [...prev, ...drafts]);

    drafts.forEach((draft) => {
      if (draft.status !== "error") {
        uploadBlock(draft);
      }
    });
  };

  const toggleBlockSelection = (blockId) => {
    setBlocks((prev) =>
      prev.map((block) =>
        block.id === blockId
          ? { ...block, selected: !block.selected }
          : block,
      ),
    );
  };

  const updateBlockMarkdown = (blockId, markdown) => {
    setBlocks((prev) =>
      prev.map((block) =>
        block.id === blockId ? { ...block, markdown } : block,
      ),
    );
  };

  const toggleBlockEditing = (blockId) => {
    setEditingBlockId((current) => (current === blockId ? null : blockId));
  };

  const toggleBlockChat = (blockId) => {
    setChatBlockId((current) => (current === blockId ? null : blockId));
    setAiInput("");
    setAiImage(null);
  };

  const closeBlockAiEditor = () => {
    setChatBlockId(null);
    setAiInput("");
    setAiImage(null);
  };

  const attachAiImage = (event) => {
    const [file] = Array.from(event.target.files || []);
    event.target.value = "";

    if (
      !file ||
      !AI_IMAGE_TYPES.has(file.type) ||
      file.size > AI_IMAGE_MAX_SIZE
    ) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAiImage({ name: file.name, src: String(reader.result) });
    };
    reader.readAsDataURL(file);
  };

  const askBlockAi = () => {
    const prompt = aiInput.trim();
    if (!prompt || !activeChatBlock) {
      return;
    }

    const proposal = buildBlockAiDraft(activeChatBlock.markdown, prompt);

    setBlocks((prev) =>
      prev.map((block) =>
        block.id === activeChatBlock.id ? { ...block, proposal } : block,
      ),
    );
    setAiInput("");
    setAiImage(null);
  };

  const applyBlockProposal = (blockId) => {
    setBlocks((prev) =>
      prev.map((block) => {
        if (block.id !== blockId || !block.proposal) {
          return block;
        }
        return { ...block, markdown: block.proposal, proposal: null };
      }),
    );
  };

  const rejectBlockProposal = (blockId) => {
    setBlocks((prev) =>
      prev.map((block) =>
        block.id === blockId ? { ...block, proposal: null } : block,
      ),
    );
  };

  useEffect(() => {
    if (!chatBlockId) {
      return undefined;
    }

    const chatBox = chatBoxRef.current;
    if (!chatBox) {
      return undefined;
    }

    const clampChatToBlock = () => {
      const blockEl = document.getElementById(chatBlockId);
      if (!blockEl || !chatBox) {
        return;
      }

      const blockRect = blockEl.getBoundingClientRect();
      const chatHeight = chatBox.offsetHeight;
      const pinnedTop = 100 + chatBox.offsetTop;
      const gap = 16;

      const naturalBottom = pinnedTop + chatHeight;
      const maxBottom = blockRect.bottom - gap;
      const translateY = Math.min(0, maxBottom - naturalBottom);

      chatBox.style.transform =
        translateY < 0 ? `translateY(${translateY}px)` : "";
    };

    clampChatToBlock();
    window.addEventListener("scroll", clampChatToBlock, { passive: true });
    window.addEventListener("resize", clampChatToBlock);

    return () => {
      window.removeEventListener("scroll", clampChatToBlock);
      window.removeEventListener("resize", clampChatToBlock);
      chatBox.style.transform = "";
    };
  }, [chatBlockId]);

  const mergeSelectedBlocksIntoLesson = () => {
    if (!canCreateLesson) {
      return;
    }

    const selected = selectedBlocks.map((block) => block.id);
    const lessonNumber = lessons.length + 1;

    const lesson = {
      id: `manual-lesson-${Date.now()}`,
      title: `Урок ${lessonNumber}`,
      blockIds: selected,
    };

    setLessons((prev) => [...prev, lesson]);
    setBlocks((prev) =>
      prev.map((block) => ({ ...block, selected: false })),
    );
  };

  const toggleLessonSelection = (lessonId) => {
    setSelectedLessonIds((prev) =>
      prev.includes(lessonId)
        ? prev.filter((id) => id !== lessonId)
        : [...prev, lessonId],
    );
  };

  const selectAllLessons = () => {
    if (selectedLessonIds.length === lessons.length) {
      setSelectedLessonIds([]);
      return;
    }

    setSelectedLessonIds(lessons.map((lesson) => lesson.id));
  };

  const mergeSelectedLessonsIntoModule = () => {
    if (!canCreateModule) {
      return;
    }

    const moduleNumber = modules.length + 1;

    const nextModule = {
      id: `manual-module-${Date.now()}`,
      title: `Модуль ${moduleNumber}`,
      lessonIds: [...selectedLessonIds],
    };

    setModules((prev) => [...prev, nextModule]);
    setSelectedLessonIds([]);
  };

  const createCourse = () => {
    if (modules.length === 0) {
      return;
    }

    onCreateCourse({
      title: courseTitle,
      modules,
      lessons,
      blocks,
    });
  };

  const renderDropzone = (compact = false) => (
    <>
      <button
        type="button"
        className={`manual-dropzone ${
          compact ? "manual-dropzone-compact" : "manual-dropzone-start"
        } ${isDragging ? "is-dragging" : ""}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
      >
        <span>+</span>
        <strong>
          {compact ? "Добавить ещё материал" : "Перетащите материалы сюда"}
        </strong>
        <small>
          {compact
            ? "Можно добавить несколько материалов"
            : "или нажмите, чтобы выбрать файлы"}
        </small>
        {!compact && <small>После загрузки материалы превращаются в блоки.</small>}
      </button>

      <input
        ref={fileInputRef}
        className="manual-file-input"
        type="file"
        multiple
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </>
  );

  return (
    <section
      className={`container section manual-builder-view ${hasBlocks ? "has-sidebar" : ""}`}
    >
      <SectionTop
        label="AI-редактор"
        title="Создать курс самостоятельно"
        text={
          hasBlocks
            ? "Соберите структуру курса из обработанных материалов."
            : "Загрузите материалы курса, чтобы начать сборку."
        }
      />

      <div className="manual-builder-flow">
        {/* =====================================================
            ИНСТРУКЦИЯ
        ====================================================== */}
        <article className="glass-card manual-instruction-card">
          <div className="manual-instruction-icon">i</div>
          <div>
            <span className="manual-instruction-label">Как создать курс</span>
            <h3>Соберите курс из своих материалов за три шага</h3>
            <ol>
              <li>Загрузите лекции, конспекты или документы — они превратятся в готовые блоки.</li>
              <li>Отметьте нужные блоки и объедините их в уроки.</li>
              <li>Сгруппируйте уроки в модули, укажите название курса и нажмите «Завершить». Дальше вы сможете добавить цели и доработать материалы в редакторе.</li>
            </ol>
          </div>
        </article>

        <div className="manual-builder-shell">
        <div
          className={`manual-builder-layout ${hasBlocks ? "has-sidebar" : ""}`}
        >
          {hasBlocks && (
          <aside className="manual-sidebar">
        {/* =====================================================
            УРОКИ
        ====================================================== */}
        {hasLessons && (
          <article className="glass-card manual-section-card manual-lessons-section">
            <div className="manual-card-head">
              <div>
                <span>Шаг 2</span>
                <h3>Уроки</h3>
              </div>
              <strong>{lessons.length}</strong>
            </div>

            <div className="manual-selection-toolbar">
              <span>{selectedLessonIds.length} выбрано</span>
              <button
                type="button"
                className="btn btn-outline"
                onClick={selectAllLessons}
              >
                {selectedLessonIds.length === lessons.length
                  ? "Снять выбор"
                  : "Выбрать все"}
              </button>
              <button
                type="button"
                className="btn btn-solid"
                onClick={mergeSelectedLessonsIntoModule}
                disabled={!canCreateModule}
              >
                Объединить в модуль
              </button>
            </div>

            <div className="manual-lessons-list">
              {lessons.map((lesson) => (
                <label
                  className={`manual-lesson-card ${
                    selectedLessonIds.includes(lesson.id) ? "is-selected" : ""
                  }`}
                  key={lesson.id}
                >
                  <input
                    type="checkbox"
                    checked={selectedLessonIds.includes(lesson.id)}
                    onChange={() => toggleLessonSelection(lesson.id)}
                  />
                  <div>
                    <strong>{lesson.title}</strong>
                    <small>
                      {lesson.blockIds.length} {lesson.blockIds.length === 1 ? "блок" : "блоков"}
                    </small>
                  </div>
                </label>
              ))}
            </div>
          </article>
        )}

        {/* =====================================================
            МОДУЛИ + КНОПКА СОЗДАТЬ КУРС
        ====================================================== */}
        {hasModules && (
          <article className="glass-card manual-section-card manual-modules-section">
            <div className="manual-card-head manual-modules-head">
              <div>
                <span>Шаг 3</span>
                <h3>Модули</h3>
              </div>
              <button
                type="button"
                className="btn btn-solid"
                onClick={createCourse}
              >
                Завершить
              </button>
            </div>

            <div className="course-editor-grid manual-course-title-field">
              <label className="course-editor-field course-editor-field-wide">
                <span>Название курса</span>
                <input
                  value={courseTitle}
                  onChange={(event) => setCourseTitle(event.target.value)}
                  placeholder="Например: Основы Python для аналитиков"
                />
              </label>
            </div>

            <div className="manual-modules-list">
              {modules.map((module) => {
                const moduleLessons = lessons.filter((lesson) =>
                  module.lessonIds.includes(lesson.id),
                );

                return (
                  <article className="manual-module-item" key={module.id}>
                    <div className="manual-module-badge">
                      {module.title.replace("Модуль ", "")}
                    </div>
                    <div>
                      <strong>{module.title}</strong>
                      <span>
                        {moduleLessons.length} {moduleLessons.length === 1 ? "урок" : "урока"}
                      </span>
                      {moduleLessons.length > 0 && (
                        <ul>
                          {moduleLessons.map((lesson) => (
                            <li key={lesson.id}>{lesson.title}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </article>
        )}

        <div className="manual-sidebar-dropzone">{renderDropzone(true)}</div>

          </aside>
          )}

          <main className="manual-content">

        {/* =====================================================
            МАТЕРИАЛЫ → БЛОКИ
        ====================================================== */}
        {!hasBlocks && (
          <article className="glass-card manual-start-card">
            {renderDropzone()}
          </article>
        )}

        {hasBlocks && (
          <article className="glass-card manual-section-card">
            <div className="manual-card-head">
              <div>
                <span>Шаг 1</span>
                <h3>Блоки</h3>
              </div>
              <strong>{readyBlocks.length} готово</strong>
            </div>

            <div className="manual-blocks-list">
              {blocks.map((block) => (
                <article
                  className={`manual-block-preview-card ${
                    block.selected ? "is-selected" : ""
                  } ${block.status === "error" ? "has-error" : ""}`}
                  id={block.id}
                  key={block.id}
                >
                  <div className="manual-block-preview-head">
                    <label className="manual-block-select">
                      <input
                        type="checkbox"
                        checked={block.selected}
                        disabled={block.status !== "ready"}
                        onChange={() => toggleBlockSelection(block.id)}
                      />
                      <strong>Блок {block.blockNumber}</strong>
                    </label>
                    <div className="manual-block-head-side">
                      <span className="manual-block-status">
                        {block.status === "uploading" && "Обработка материала..."}
                        {block.status === "ready" && "Материал обработан"}
                        {block.status === "error" && block.error}
                      </span>
                      {block.status === "ready" && (
                        <div className="manual-block-actions">
                          <button
                            type="button"
                            className={`btn btn-outline ${
                              editingBlockId === block.id ? "is-active" : ""
                            }`}
                            onClick={() => toggleBlockEditing(block.id)}
                          >
                            {editingBlockId === block.id
                              ? "Готово"
                              : "Редактировать"}
                          </button>
                          <button
                            type="button"
                            className={`btn btn-outline ${
                              chatBlockId === block.id ? "is-active" : ""
                            }`}
                            onClick={() => toggleBlockChat(block.id)}
                          >
                            ИИ-редактор
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {block.status === "uploading" && (
                    <div className="manual-preview-empty">
                      <strong>Материал обрабатывается...</strong>
                      <p>Ожидаем ответ backend.</p>
                    </div>
                  )}

                  {block.status === "error" && (
                    <div className="manual-preview-empty">
                      <strong>Не удалось обработать материал</strong>
                      <p>{block.error}</p>
                    </div>
                  )}

                  {block.status === "ready" && block.proposal ? (
                    <div className="manual-block-proposal">
                      <div className="manual-block-proposal-head">
                        <span>Предложено ИИ</span>
                        <div className="manual-block-proposal-actions">
                          <button
                            type="button"
                            className="btn btn-solid"
                            onClick={() => applyBlockProposal(block.id)}
                          >
                            Применить
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => rejectBlockProposal(block.id)}
                          >
                            Не применять
                          </button>
                        </div>
                      </div>
                      <div className="lesson-markdown manual-lesson-preview">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {block.proposal}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ) : block.status === "ready" &&
                    (editingBlockId === block.id ? (
                      <textarea
                        className="manual-block-editor"
                        value={block.markdown}
                        onChange={(event) =>
                          updateBlockMarkdown(block.id, event.target.value)
                        }
                      />
                    ) : (
                      <div className="lesson-markdown manual-lesson-preview">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {block.markdown}
                        </ReactMarkdown>
                      </div>
                    ))}
                </article>
              ))}
            </div>
          </article>
        )}

          </main>
        </div>

        <aside className="manual-ai-panel">
          {hasBlocks && (
            <div className="manual-merge-wrap">
              <span className="manual-merge-count">
                {selectedBlocks.length} выбрано
              </span>
              <button
                type="button"
                className="btn btn-solid manual-merge-lesson-btn"
                onClick={mergeSelectedBlocksIntoLesson}
                disabled={!canCreateLesson}
              >
                Объединить в урок
              </button>
            </div>
          )}
          {chatBlockId && activeChatBlock && (
            <div className="manual-ai-chat-box" ref={chatBoxRef}>
              <aside className="lesson-ai-editor">
                <div className="lesson-ai-editor-head">
                  <span>ИИ-редактор</span>
                  <strong>Блок {activeChatBlock.blockNumber}</strong>
                  <button
                    type="button"
                    onClick={closeBlockAiEditor}
                    aria-label="Закрыть ИИ-редактор"
                    title="Закрыть ИИ-редактор"
                  >
                    −
                  </button>
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
                    placeholder="Напишите, что нужно изменить"
                    onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing) {
                        return;
                      }
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        askBlockAi();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="lesson-ai-send"
                    onClick={askBlockAi}
                    disabled={!aiInput.trim() && !aiImage}
                    aria-label="Отправить"
                    title="Отправить"
                  >
                    ↑
                  </button>
                </div>
              </aside>
            </div>
          )}
        </aside>
        </div>
      </div>
    </section>
  );
}