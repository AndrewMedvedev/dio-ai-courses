import { Fragment, useEffect, useRef, useState, type ChangeEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  createAgentConversationKey,
  useAgentStore,
} from "@/entities/agent-chat";
import { useSessionStore } from "@/entities/session";
import { convertDocumentToMarkdown } from "@/features/upload-document";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { FloatingWindow } from "@/shared/ui/floating-window";
import { autosizeTextarea } from "@/shared/lib/dom";
import { attachmentsApi } from "@/shared/api";
import type { RawApiRecord } from "@/shared/api";
import { getMediaId, getMediaUrl, MEDIA_FOLDERS } from "@/shared/lib/media";
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
  normalizeContentBlocks,
  safeMarkdownUrl,
  stripUiFields,
  templates,
  type EditorBlockFields,
  type EditorBlockPayload,
  type EditorBlockType,
  type EditorBlockWithId,
  type EditorQuestion,
} from "../model/block-editor";
import {
  getUploadedImageId,
  getUserId,
  readFileAsBase64,
  readImageUrlAsBase64,
} from "../lib/image-files";
import { markdownComponents } from "./markdown-components";

const IMAGE_MAX_SIZE_BYTES = 15 * 1024 * 1024;
const MAX_AI_REFERENCE_IMAGES = 2;

interface AiReferenceImage {
  id: string;
  file: File;
  name: string;
  previewUrl: string;
}

interface ImageUploadPreview {
  blockId: string;
  previewUrl: string;
  name: string;
}

interface Proposal {
  blockId: string;
  block: EditorBlockFields;
  content: string;
}

/** Поля блока, которые редактируются текстом. */
type BlockTextField =
  | "md_content"
  | "url"
  | "description"
  | "language"
  | "code"
  | "explanation"
  | "title"
  | "formula";

/** Урок в редакторе: блоки или (у старых уроков) один Markdown. */
export interface EditableLesson {
  id: string;
  contentBlocks?: unknown;
  content_blocks?: unknown;
  markdown?: string;
  content?: string;
}

export interface LessonContentChange {
  contentBlocks: EditorBlockPayload[];
  markdown: string;
  content: string;
}

export interface LessonContentEditorProps {
  courseId: string;
  lesson: EditableLesson;
  onChange: (change: LessonContentChange) => void;
  contentLabel?: string;
  blocksLabel?: string;
  showInsertControls?: boolean;
  /** ИИ-редактор блока в плавающем окне (перетаскивается и растягивается). */
  floatingAiEditor?: boolean;
}

const errorMessage = (error: unknown) => (error as Error | null)?.message;

/** Редактор контента урока: блоки, вставка, импорт файлов и ИИ-редактор блока. */
export function LessonContentEditor({
  courseId,
  lesson,
  onChange,
  contentLabel = "Теория",
  blocksLabel = "",
  showInsertControls = true,
  // ИИ-редактор блока в плавающем окне (перетаскивается и растягивается).
  floatingAiEditor = false,
}: LessonContentEditorProps) {
  const [blocks, setBlocks] = useState(() =>
    normalizeContentBlocks(
      lesson.contentBlocks || lesson.content_blocks,
      lesson.markdown || lesson.content || "",
    ),
  );
  const [activeBlockId, setActiveBlockId] = useState("");
  const [insertIndex, setInsertIndex] = useState<number | null>(null);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiReferenceImages, setAiReferenceImages] = useState<
    AiReferenceImage[]
  >([]);
  const [aiReferenceError, setAiReferenceError] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [proposalError, setProposalError] = useState("");
  const [blockLimitError, setBlockLimitError] = useState("");
  const [blockToDelete, setBlockToDelete] = useState<EditorBlockWithId | null>(
    null,
  );
  const aiTextareaRef = useRef<HTMLTextAreaElement | null>(null);
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
  const user = useSessionStore((state) => state.user);
  const loadCurrentUser = useSessionStore((state) => state.loadCurrentUser);
  const currentUserId = getUserId(user);
  const isAiSending = aiConversation?.status === "loading";
  const aiError =
    proposalError || aiReferenceError || aiConversation?.error || "";
  const [uploadingImageBlockId, setUploadingImageBlockId] = useState("");
  const [imageUploadError, setImageUploadError] = useState("");
  const [imageUploadPreview, setImageUploadPreview] =
    useState<ImageUploadPreview | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiImageInputRef = useRef<HTMLInputElement>(null);
  const aiMessagesRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef(new Map<string, HTMLDivElement>());
  const aiReferenceImagesRef = useRef<AiReferenceImage[]>([]);
  const imageUploadPreviewRef = useRef<ImageUploadPreview | null>(null);

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
    setAiReferenceImages((current) => {
      current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      return [];
    });
    setAiReferenceError("");
    setImageUploadPreview((current) => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
    setImageUploadError("");
    setUploadingImageBlockId("");
    setProposal(null);
    setProposalError("");
    setBlockLimitError("");
  }, [lesson.id]);

  useEffect(
    () => () => cancelAgentRequest(aiConversationKey),
    [aiConversationKey, cancelAgentRequest],
  );

  useEffect(() => {
    aiReferenceImagesRef.current = aiReferenceImages;
  }, [aiReferenceImages]);

  useEffect(() => {
    imageUploadPreviewRef.current = imageUploadPreview;
  }, [imageUploadPreview]);

  useEffect(
    () => () => {
      aiReferenceImagesRef.current.forEach((image) =>
        URL.revokeObjectURL(image.previewUrl),
      );
      const preview = imageUploadPreviewRef.current;
      if (preview?.previewUrl) URL.revokeObjectURL(preview.previewUrl);
    },
    [],
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
    if (!user) {
      loadCurrentUser();
    }
  }, [loadCurrentUser, user]);

  useEffect(() => {
    const container = aiMessagesRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [aiConversation?.messages, isAiSending]);

  useEffect(() => {
    autosizeTextarea(aiTextareaRef.current, 160);
  }, [aiInput, isAiOpen, activeBlockId]);

  const commitBlocks = (
    nextBlocks: EditorBlockWithId[],
    nextActiveId: string | undefined = activeBlockId,
  ) => {
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

  const updateBlock = (blockId: string, changes: EditorBlockFields) => {
    commitBlocks(
      blocks.map((block) =>
        block.id === blockId ? { ...block, ...changes } : block,
      ),
      blockId,
    );
  };

  const updateQuestion = (
    blockId: string,
    questionIndex: number,
    changes: Partial<EditorQuestion>,
  ) => {
    const target = blocks.find((block) => block.id === blockId);
    if (!target) return;

    const questions = [...(target.questions || [])];
    questions[questionIndex] = { ...questions[questionIndex], ...changes };
    updateBlock(blockId, { questions });
  };

  const addQuestion = (blockId: string) => {
    const target = blocks.find((block) => block.id === blockId);
    if (!target) return;
    updateBlock(blockId, {
      questions: [...(target.questions || []), { question: "", answer: "" }],
    });
  };

  const removeQuestion = (blockId: string, questionIndex: number) => {
    const target = blocks.find((block) => block.id === blockId);
    if (!target) return;
    const questions = (target.questions || []).filter(
      (_, index) => index !== questionIndex,
    );
    updateBlock(blockId, {
      questions: questions.length ? questions : [{ question: "", answer: "" }],
    });
  };

  const insertBlockAt = (index: number, type: EditorBlockType) => {
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

  const deleteBlock = (blockId: string) => {
    const targetIndex = blocks.findIndex((block) => block.id === blockId);
    const nextBlocks = blocks.filter((block) => block.id !== blockId);
    const nextActive = nextBlocks[Math.max(0, targetIndex - 1)]?.id;
    commitBlocks(nextBlocks, nextActive);
    setIsAiOpen(false);
    setProposal(null);
  };

  const moveBlock = (blockId: string, direction: number) => {
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

  const uploadCourseImageFile = async (file: File) => {
    if (!currentUserId) {
      throw new Error(
        "Не удалось определить пользователя для загрузки изображения.",
      );
    }

    const uploadResult = await attachmentsApi.uploadAttachment(
      file,
      MEDIA_FOLDERS.COURSE_IMAGES,
      currentUserId,
      {
        folder: MEDIA_FOLDERS.COURSE_IMAGES,
        maxSizeBytes: IMAGE_MAX_SIZE_BYTES,
        allowedMimeTypes: allowedImageTypes,
      },
    );
    const imageId = getUploadedImageId(uploadResult as RawApiRecord);
    if (!imageId) {
      throw new Error("Хранилище не вернуло идентификатор изображения.");
    }
    return imageId;
  };

  const importFiles = async (event: ChangeEvent<HTMLInputElement>) => {
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
    const importedContent: {
      type: string;
      data: string | EditorBlockFields;
    }[] = [];
    for (const file of files) {
      if (importedContent.length >= availableSlots) {
        break;
      }
      if (
        allowedImageTypes.has(file.type) ||
        (file.type === "" && allowedImageExtension.test(file.name))
      ) {
        try {
          const imageId = await uploadCourseImageFile(file);
          importedContent.push({ type: "image", data: { image_id: imageId } });
        } catch (error) {
          setBlockLimitError(
            errorMessage(error) ||
              "Не удалось загрузить изображение в хранилище.",
          );
        }
        continue;
      }

      if (!allowedTextExtension.test(file.name)) {
        continue;
      }

      let text = "";
      if (/\.(pdf|docx|pptx|xlsx|html)$/i.test(file.name)) {
        const converted = await convertDocumentToMarkdown(file);
        text =
          typeof converted === "string"
            ? converted
            : (converted as { markdown?: string } | null)?.markdown || "";
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
    const activeBlock = blocks.find((block) => block.id === activeBlockId);
    const isImageBlock = activeBlock?.content_type === "image";
    if (!prompt || isAiSending) {
      return;
    }
    if (!activeBlock || activeBlock.content_type === "video") {
      return;
    }

    const currentBlock = stripUiFields(activeBlock);
    setProposalError("");
    setAiReferenceError("");
    setAiInput("");

    try {
      const currentImageBase64 = isImageBlock
        ? await readImageUrlAsBase64(
            getMediaUrl(
              currentUserId,
              MEDIA_FOLDERS.COURSE_IMAGES,
              activeBlock.image_id,
            ),
          )
        : null;
      const referenceImageBase64 = isImageBlock
        ? await Promise.all(
            aiReferenceImages.map((image) => readFileAsBase64(image.file)),
          )
        : [];
      const images = [currentImageBase64, ...referenceImageBase64].filter(
        (image): image is string => Boolean(image),
      );
      const response = await sendAgentMessage({
        key: aiConversationKey,
        agent: "editor",
        courseId,
        content: prompt,
        contentBlocks: blocks
          .filter((block) => block.id !== activeBlock.id)
          .map(stripUiFields),
        editorPayload: {
          content_type: activeBlock.content_type,
          content_block: JSON.stringify(currentBlock),
          images: isImageBlock && images.length > 0 ? images : undefined,
        },
        emptyResponseMessage: "",
        responseDisplayMessage: (agentResponse) =>
          agentResponse?.parsedContent &&
          typeof agentResponse.parsedContent === "object" &&
          !Array.isArray(agentResponse.parsedContent)
            ? isImageBlock
              ? "Изображение обновлено. Результат уже сохранён в хранилище."
              : "Правка готова. Проверьте предложенный вариант и примените его, если он подходит."
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

      const parsedContent = response.parsedContent as RawApiRecord;
      const proposedBlock: EditorBlockFields = {
        ...parsedContent,
        content_type: activeBlock.content_type,
        ai_generated: true,
      };
      if (isImageBlock) {
        const imageId = getMediaId(
          parsedContent.image_id || parsedContent.imageId,
        );
        if (!imageId) {
          setProposalError("ИИ не вернул идентификатор готового изображения.");
          return;
        }
        updateBlock(activeBlock.id, { image_id: imageId, ai_generated: true });
        setAiReferenceImages((current) => {
          current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
          return [];
        });
        return;
      }
      setProposal({
        blockId: activeBlock.id,
        block: proposedBlock,
        content: blockToMarkdown(proposedBlock),
      });
    } catch (rawError) {
      const error = rawError as { status?: number; message?: string } | null;
      if (!error?.status) {
        setProposalError(error?.message || "Не удалось отправить запрос ИИ.");
      }
      // Публичная сетевая ошибка API хранится в Zustand-store.
    }
  };

  const addAiReferenceFiles = (files: FileList | File[] | null) => {
    const selectedFiles = Array.from(files || []);
    if (selectedFiles.length === 0) return;

    const nextImages: AiReferenceImage[] = [];
    const errors: string[] = [];
    let slotsLeft = MAX_AI_REFERENCE_IMAGES - aiReferenceImages.length;

    selectedFiles.forEach((file) => {
      if (slotsLeft <= 0) {
        errors.push(
          `Можно приложить не более ${MAX_AI_REFERENCE_IMAGES} референсов.`,
        );
        return;
      }
      if (!allowedImageTypes.has(file.type)) {
        errors.push(
          `${file.name || "Файл"}: выберите изображение PNG, JPEG, WebP или GIF.`,
        );
        return;
      }
      if (file.size > IMAGE_MAX_SIZE_BYTES) {
        errors.push(`${file.name}: файл больше 15 МБ.`);
        return;
      }
      nextImages.push({
        id: `ai-ref-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        file,
        name: file.name,
        previewUrl: URL.createObjectURL(file),
      });
      slotsLeft -= 1;
    });

    setAiReferenceError([...new Set(errors)].join(" "));
    if (nextImages.length > 0) {
      setAiReferenceImages((current) => [...current, ...nextImages]);
    }
  };

  const attachAiImages = (event: ChangeEvent<HTMLInputElement>) => {
    addAiReferenceFiles(event.target.files);
    event.target.value = "";
  };

  const removeAiReferenceImage = (imageId: string) => {
    setAiReferenceImages((current) =>
      current.filter((image) => {
        if (image.id === imageId) {
          URL.revokeObjectURL(image.previewUrl);
          return false;
        }
        return true;
      }),
    );
    setAiReferenceError("");
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

  const scrollToBlock = (blockId: string) => {
    window.requestAnimationFrame(() => {
      blockRefs.current.get(blockId)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    });
  };

  const selectBlock = (blockId: string) => {
    setActiveBlockId(blockId);
    setInsertIndex(null);
    setIsAiOpen(false);
    setAiInput("");
    setAiReferenceImages((current) => {
      current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      return [];
    });
    setAiReferenceError("");
    setProposal(null);
    scrollToBlock(blockId);
  };

  const renderTextAreaField = (
    block: EditorBlockWithId,
    field: BlockTextField,
    label: string,
    placeholder: string,
    rows = 5,
  ) => (
    <label className="lesson-block-field lesson-block-field-wide tw:grid tw:gap-[6px] tw:col-[1_/_-1] tw:[.lesson-editor-block.is-mermaid_&_textarea]:[font-family:'JetBrains_Mono',_'Fira_Code',_monospace] tw:[.lesson-editor-block.is-mermaid_&_textarea]:text-[0.86rem]">
      <span className="tw:text-(--muted) tw:text-[0.72rem] tw:font-[800] tw:tracking-[0.07em] tw:uppercase">
        {label}
      </span>
      <textarea
        className="tw:text-(--text) tw:border-[currentcolor] tw:w-[100%] tw:border-none tw:rounded-[0] tw:p-[13px_14px] tw:text-[0.96rem] tw:leading-[1.45] tw:min-h-[138px] tw:resize-y tw:dark:text-(--heading) tw:[background:rgba(255,_255,_255,_0.08)] tw:dark:border-[rgba(var(--accent-rgb),_0.5)] tw:[border-width:0] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[.lesson-editor-block.is-program\_code_.lesson-block-field_&]:text-[0.86rem] tw:[font-family:inherit] tw:[outline:none] tw:dark:[background:rgba(24,_24,_24,_0.74)] tw:[.lesson-editor-block.is-program\_code_.lesson-block-field_&]:[font-family:'JetBrains_Mono',_'Fira_Code',_monospace]"
        value={block[field] || ""}
        onChange={(event) =>
          updateBlock(block.id, { [field]: event.target.value })
        }
        placeholder={placeholder}
        rows={rows}
      />
    </label>
  );

  const renderInputField = (
    block: EditorBlockWithId,
    field: BlockTextField,
    label: string,
    placeholder: string,
  ) => (
    <label className="lesson-block-field tw:grid tw:gap-[6px] tw:[.lesson-editor-block.is-mermaid_&_textarea]:[font-family:'JetBrains_Mono',_'Fira_Code',_monospace] tw:[.lesson-editor-block.is-mermaid_&_textarea]:text-[0.86rem]">
      <span className="tw:text-(--muted) tw:text-[0.72rem] tw:font-[800] tw:tracking-[0.07em] tw:uppercase">
        {label}
      </span>
      <input
        className="tw:text-(--text) tw:border-[rgba(var(--accent-rgb),_0.34)] tw:w-[100%] tw:border-solid tw:rounded-[10px] tw:p-[10px_11px] tw:text-[0.96rem] tw:leading-[1.45] tw:dark:text-(--heading) tw:[background:rgba(255,_255,_255,_0.12)] tw:dark:border-[rgba(var(--accent-rgb),_0.52)] tw:[border-width:1px] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:[outline:none] tw:dark:[background:rgba(24,_24,_24,_0.75)]"
        value={block[field] || ""}
        onChange={(event) =>
          updateBlock(block.id, { [field]: event.target.value })
        }
        placeholder={placeholder}
      />
    </label>
  );

  const uploadImageBlockFile = async (
    block: EditorBlockWithId,
    file: File | undefined,
  ) => {
    if (!file) return;
    setImageUploadError("");

    if (block.image_id) {
      setImageUploadError(
        "В image-блоке может быть только одно изображение. Удалите текущее перед новой загрузкой.",
      );
      return;
    }

    if (!allowedImageTypes.has(file.type)) {
      setImageUploadError("Выберите изображение PNG, JPEG, WebP или GIF.");
      return;
    }
    if (file.size > IMAGE_MAX_SIZE_BYTES) {
      setImageUploadError("Максимальный размер изображения — 15 МБ.");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setImageUploadPreview((current) => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return { blockId: block.id, previewUrl, name: file.name };
    });
    setUploadingImageBlockId(block.id);

    try {
      const imageId = await uploadCourseImageFile(file);
      updateBlock(block.id, { image_id: imageId, ai_generated: false });
      setImageUploadPreview((current) => {
        if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
        return null;
      });
    } catch (error) {
      setImageUploadError(
        errorMessage(error) || "Не удалось загрузить изображение в хранилище.",
      );
    } finally {
      setUploadingImageBlockId("");
    }
  };

  const renderImageBlockFields = (block: EditorBlockWithId) => {
    const currentImageUrl = getMediaUrl(
      currentUserId,
      MEDIA_FOLDERS.COURSE_IMAGES,
      block.image_id,
    );
    const activePreview =
      imageUploadPreview?.blockId === block.id ? imageUploadPreview : null;
    const previewUrl = activePreview?.previewUrl || currentImageUrl;
    const isUploading = uploadingImageBlockId === block.id;
    const canUploadImage = !isUploading && !block.image_id;

    return (
      <div className="lesson-block-field lesson-block-field-wide lesson-image-block-editor tw:grid tw:gap-[10px] tw:col-[1_/_-1] tw:[.lesson-editor-block.is-mermaid_&_textarea]:[font-family:'JetBrains_Mono',_'Fira_Code',_monospace] tw:[.lesson-editor-block.is-mermaid_&_textarea]:text-[0.86rem] tw:[&_small]:text-(--muted) tw:[&_small]:text-[0.78rem]">
        <span>Итоговое изображение блока</span>
        <label
          className={`lesson-image-block-dropzone tw:grid tw:min-h-[220px] tw:border-dashed tw:border-[rgba(var(--accent-rgb),_0.42)] tw:rounded-[16px] tw:p-[14px] tw:cursor-pointer tw:[place-items:center] tw:[border-width:1px] tw:hover:border-[rgba(var(--accent-rgb),_0.7)] tw:[background:rgba(var(--accent-rgb),_0.07)] tw:[&.is-disabled]:cursor-default tw:[transition:border-color_160ms_ease,_background_160ms_ease] tw:[&.is-disabled:hover]:border-[rgba(var(--accent-rgb),_0.42)] tw:hover:[background:rgba(var(--accent-rgb),_0.1)] tw:[&.is-disabled:hover]:[background:rgba(var(--accent-rgb),_0.07)] tw:[&_input]:hidden ${previewUrl ? "has-image" : ""} ${!canUploadImage ? "is-disabled" : ""}`}
          onDragOver={(event) => {
            if (canUploadImage) event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (!canUploadImage) {
              setImageUploadError(
                "В image-блоке уже есть изображение. Удалите его перед новой загрузкой.",
              );
              return;
            }
            const [file] = Array.from(event.dataTransfer.files || []);
            uploadImageBlockFile(block, file);
          }}
        >
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={!canUploadImage}
            onChange={(event) => {
              const [file] = Array.from(event.target.files || []);
              event.target.value = "";
              if (!canUploadImage) {
                setImageUploadError(
                  "В image-блоке уже есть изображение. Удалите его перед новой загрузкой.",
                );
                return;
              }
              uploadImageBlockFile(block, file);
            }}
          />
          {previewUrl ? (
            <div className="lesson-image-block-preview tw:grid tw:gap-[6px] tw:w-[min(100%,_640px)] tw:[&_img]:block tw:[&_img]:max-w-[100%] tw:[&_img]:max-h-[360px] tw:[&_img]:rounded-[14px] tw:[&_img]:object-contain tw:[&_img]:[background:rgba(var(--accent-rgb),_0.06)] tw:[&_small]:text-(--muted) tw:[&_small]:text-[0.78rem]">
              <img src={previewUrl} alt="Предпросмотр изображения блока" />
              {activePreview && <small>{activePreview.name}</small>}
            </div>
          ) : (
            <div className="lesson-image-block-empty tw:grid tw:gap-[6px] tw:text-(--text) tw:text-center tw:[&_small]:text-(--muted) tw:[&_small]:text-[0.78rem]">
              <strong>
                {isUploading ? "Загружаем..." : "Перетащите изображение сюда"}
              </strong>
              <small>
                или нажмите, чтобы выбрать файл. PNG, JPEG, WebP или GIF до 15
                МБ.
              </small>
            </div>
          )}
        </label>
        <div className="lesson-image-block-actions tw:flex tw:items-center tw:justify-between tw:flex-wrap tw:gap-[8px]">
          <small>
            В блоке хранится одно изображение. Чтобы загрузить другое, сначала
            удалите текущее.
          </small>
          {block.image_id && (
            <button
              type="button"
              className="btn btn-outline tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
              disabled={isUploading}
              onClick={() => {
                setImageUploadError("");
                updateBlock(block.id, { image_id: "", ai_generated: false });
              }}
            >
              Удалить изображение
            </button>
          )}
        </div>
        {imageUploadError && (
          <p className="lesson-ai-error">{imageUploadError}</p>
        )}
      </div>
    );
  };

  const renderBlockFields = (block: EditorBlockWithId) => {
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
        return renderImageBlockFields(block);
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
          <div className="lesson-block-field lesson-block-field-wide lesson-quiz-editor tw:grid tw:gap-[10px] tw:col-[1_/_-1] tw:[.lesson-editor-block.is-mermaid_&_textarea]:[font-family:'JetBrains_Mono',_'Fira_Code',_monospace] tw:[.lesson-editor-block.is-mermaid_&_textarea]:text-[0.86rem]">
            <span className="tw:text-(--muted) tw:text-[0.72rem] tw:font-[800] tw:tracking-[0.07em] tw:uppercase">
              Вопросы
            </span>
            {(block.questions || []).map((question, questionIndex) => (
              <div
                className="lesson-quiz-question tw:grid tw:gap-[10px] tw:rounded-[12px] tw:p-[12px] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.22)] tw:[background:rgba(var(--accent-rgb),_0.05)]"
                key={`question-${questionIndex}`}
              >
                <label className="tw:grid tw:gap-[6px]">
                  <span className="tw:text-(--muted) tw:text-[0.72rem] tw:font-[800] tw:tracking-[0.07em] tw:uppercase">
                    Вопрос {questionIndex + 1}
                  </span>
                  <input
                    className="tw:text-(--text) tw:border-[rgba(var(--accent-rgb),_0.34)] tw:w-[100%] tw:border-solid tw:rounded-[10px] tw:p-[10px_11px] tw:text-[0.96rem] tw:leading-[1.45] tw:dark:text-(--heading) tw:[background:rgba(255,_255,_255,_0.12)] tw:dark:border-[rgba(var(--accent-rgb),_0.52)] tw:[border-width:1px] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:[outline:none] tw:dark:[background:rgba(24,_24,_24,_0.75)]"
                    value={question.question || ""}
                    onChange={(event) =>
                      updateQuestion(block.id, questionIndex, {
                        question: event.target.value,
                      })
                    }
                    placeholder="Введите вопрос"
                  />
                </label>
                <label className="tw:grid tw:gap-[6px]">
                  <span className="tw:text-(--muted) tw:text-[0.72rem] tw:font-[800] tw:tracking-[0.07em] tw:uppercase">
                    Варианты ответа
                  </span>
                  <textarea
                    className="tw:text-(--text) tw:border-[currentcolor] tw:w-[100%] tw:border-none tw:rounded-[0] tw:p-[13px_14px] tw:text-[0.96rem] tw:leading-[1.45] tw:min-h-[138px] tw:resize-y tw:dark:text-(--heading) tw:[background:rgba(255,_255,_255,_0.08)] tw:dark:border-[rgba(var(--accent-rgb),_0.5)] tw:[border-width:0] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:[outline:none] tw:dark:[background:rgba(24,_24,_24,_0.74)]"
                    value={(question.options || []).join("\n")}
                    onChange={(event) =>
                      updateQuestion(block.id, questionIndex, {
                        options: event.target.value
                          .split(/\r?\n/)
                          .filter(Boolean),
                      })
                    }
                    placeholder="Каждый вариант с новой строки"
                  />
                </label>
                <label className="tw:grid tw:gap-[6px]">
                  <span className="tw:text-(--muted) tw:text-[0.72rem] tw:font-[800] tw:tracking-[0.07em] tw:uppercase">
                    Ответ
                  </span>
                  <textarea
                    className="tw:text-(--text) tw:border-[currentcolor] tw:w-[100%] tw:border-none tw:rounded-[0] tw:p-[13px_14px] tw:text-[0.96rem] tw:leading-[1.45] tw:min-h-[138px] tw:resize-y tw:dark:text-(--heading) tw:[background:rgba(255,_255,_255,_0.08)] tw:dark:border-[rgba(var(--accent-rgb),_0.5)] tw:[border-width:0] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:[outline:none] tw:dark:[background:rgba(24,_24,_24,_0.74)]"
                    value={question.answer || ""}
                    onChange={(event) =>
                      updateQuestion(block.id, questionIndex, {
                        answer: event.target.value,
                      })
                    }
                    placeholder="Введите правильный ответ"
                  />
                </label>
                <label className="tw:grid tw:gap-[6px]">
                  <span className="tw:text-(--muted) tw:text-[0.72rem] tw:font-[800] tw:tracking-[0.07em] tw:uppercase">
                    Пояснение
                  </span>
                  <textarea
                    className="tw:text-(--text) tw:border-[currentcolor] tw:w-[100%] tw:border-none tw:rounded-[0] tw:p-[13px_14px] tw:text-[0.96rem] tw:leading-[1.45] tw:min-h-[138px] tw:resize-y tw:dark:text-(--heading) tw:[background:rgba(255,_255,_255,_0.08)] tw:dark:border-[rgba(var(--accent-rgb),_0.5)] tw:[border-width:0] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:[outline:none] tw:dark:[background:rgba(24,_24,_24,_0.74)]"
                    value={question.explanation || ""}
                    onChange={(event) =>
                      updateQuestion(block.id, questionIndex, {
                        explanation: event.target.value,
                      })
                    }
                    placeholder="Почему этот ответ верный"
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:text-[0.96rem] tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                  onClick={() => removeQuestion(block.id, questionIndex)}
                >
                  Удалить вопрос
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:text-[0.96rem] tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
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

  const renderInsertControl = (index: number) => (
    <div
      className={`lesson-insert-control tw:grid tw:gap-[8px] ${insertIndex === index ? "is-open" : ""}`}
    >
      <button
        type="button"
        className={`lesson-insert-line tw:w-[100%] tw:border-dashed tw:border-[rgba(var(--accent-rgb),_0.35)] tw:rounded-[999px] tw:text-(--muted) tw:p-[7px_10px] tw:leading-[1.45] tw:text-[0.96rem] tw:font-[800] tw:cursor-pointer tw:opacity-[0.68] tw:[border-width:1px] tw:hover:border-[rgba(var(--accent-rgb),_0.72)] tw:[&.is-active]:border-[rgba(var(--accent-rgb),_0.72)] tw:[background:transparent] tw:hover:text-(--ink-accent) tw:[&.is-active]:text-(--ink-accent) tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:hover:opacity-[1] tw:[&.is-active]:opacity-[1] tw:hover:[background:rgba(var(--accent-rgb),_0.12)] tw:[&.is-active]:[background:rgba(var(--accent-rgb),_0.12)] tw:[.lesson-insert-control:not(.is-open)_&]:py-[5px] ${insertIndex === index ? "is-active" : ""}`}
        onClick={() =>
          setInsertIndex((current) => (current === index ? null : index))
        }
      >
        {insertIndex === index ? "Скрыть" : "Вставить здесь"}
      </button>
      {insertIndex === index && (
        <div className="lesson-editor-palette lesson-insert-palette tw:grid tw:grid-cols-[repeat(auto-fit,_minmax(140px,_1fr))] tw:gap-[8px] tw:p-[10px] tw:rounded-[12px] tw:max-760:grid-cols-[1fr] tw:[border:1px_dashed_rgba(var(--accent-rgb),_0.38)] tw:[background:rgba(var(--accent-rgb),_0.05)]">
          {blockTypes.map((type) => (
            <button
              className="tw:min-h-[64px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.3)] tw:rounded-[12px] tw:text-(--text) tw:p-[10px] tw:grid tw:gap-[4px] tw:text-left tw:cursor-pointer tw:[border-width:1px] tw:hover:border-[rgba(var(--accent-rgb),_0.68)] tw:dark:border-[rgba(var(--accent-rgb),_0.42)] tw:[background:rgba(var(--accent-rgb),_0.08)] tw:[font:inherit] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:dark:hover:border-[rgba(var(--accent-rgb),_0.42)] tw:hover:[background:rgba(var(--accent-rgb),_0.13)] tw:dark:[background:rgba(var(--accent-rgb),_0.14)] tw:dark:hover:[background:rgba(var(--accent-rgb),_0.14)]"
              key={type.id}
              type="button"
              onClick={() => insertBlockAt(index, type.id)}
            >
              <strong className="tw:text-(--heading) tw:text-[0.86rem]">
                {type.label}
              </strong>
              <span className="tw:text-(--muted) tw:text-[0.76rem] tw:leading-[1.25]">
                {type.hint}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const renderAiEditor = (
    block: EditorBlockWithId,
    { floating = false }: { floating?: boolean } = {},
  ) => (
    <aside
      className={`lesson-ai-editor tw:static tw:flex-[1_1_auto] tw:min-h-[0] tw:flex tw:flex-col tw:gap-[10px] tw:p-[0] tw:border-none tw:border-[currentcolor] tw:top-[16px] tw:rounded-[14px] tw:[border-width:0] tw:dark:border-[rgba(255,_255,_255,_0.2)] tw:[background:none] tw:[box-shadow:none] tw:[-webkit-backdrop-filter:none] tw:[backdrop-filter:none] tw:[.lesson-editor-block-row_>_&]:top-[auto] tw:[.page_.dnd-builder_.dnd-inspector_.lesson-editor-block-row.has-ai_>_&]:left-[auto] tw:[.page_.dnd-builder_.dnd-inspector_.lesson-editor-block-row.has-ai_>_&]:right-[auto] tw:[.page_.dnd-builder_.dnd-inspector_.lesson-editor-block-row.has-ai_>_&]:w-[auto] tw:[.page_.dnd-builder_.dnd-inspector_.lesson-editor-block-row.has-ai_>_&]:max-h-[none] tw:[.lesson-editor-block-row_>_&]:max-h-[none] tw:[.page_.dnd-builder_.dnd-inspector_.lesson-editor-block-row.has-ai_>_&]:overflow-visible tw:[.lesson-editor-block-row_>_&]:overflow-visible tw:[.lesson-editor-block-row_>_&]:m-[0] tw:min-1000:[.page_.dnd-builder_.dnd-inspector_.lesson-editor-block-row.has-ai_>_&]:absolute tw:min-1180:[.lesson-editor-block-row.has-ai_>_&]:absolute tw:min-1180:[.lesson-editor-block-row.has-ai_>_&]:min-h-[min(520px,_calc(100vh_-_48px))] tw:min-1000:[.page_.dnd-builder_.dnd-inspector_.lesson-editor-block-row.has-ai_>_&]:gap-[12px] tw:min-1000:[.page_.dnd-builder_.dnd-inspector_.lesson-editor-block-row.has-ai_>_&]:p-[16px_16px_18px] tw:min-1000:[.page_.dnd-builder_.dnd-inspector_.lesson-editor-block-row.has-ai_>_&]:border-[currentcolor] tw:dark:[background:linear-gradient(_145deg,_rgba(255,_255,_255,_0.13),_rgba(255,_255,_255,_0.055)_)] tw:dark:[box-shadow:0_16px_40px_rgba(0,_0,_0,_0.22),_var(--glass-inset)] tw:min-1000:[.page_.dnd-builder_.dnd-inspector_.lesson-editor-block-row.has-ai_>_&]:top-[0] tw:min-1180:[.lesson-editor-block-row.has-ai_>_&]:top-[0] tw:min-1000:[.page_.dnd-builder_.dnd-inspector_.lesson-editor-block-row.has-ai_>_&]:rounded-[0] tw:min-1000:[.page_.dnd-builder_.dnd-inspector_.lesson-editor-block-row.has-ai_>_&]:left-[0] tw:min-1180:[.lesson-editor-block-row.has-ai_>_&]:left-[calc(100%_+_clamp(52px,_4vw,_64px))] tw:min-1180:[.lesson-editor-block-row.has-ai_>_&]:right-[auto] tw:min-1000:[.page_.dnd-builder_.dnd-inspector_.lesson-editor-block-row.has-ai_>_&]:w-(--dnd-ai-w) tw:min-1180:[.lesson-editor-block-row.has-ai_>_&]:w-[clamp(340px,_80%,_450px)] tw:min-1180:[.lesson-editor-block-row.has-ai_>_&]:max-h-[calc(100vh_-_32px)] tw:min-1000:[.page_.dnd-builder_.dnd-inspector_.lesson-editor-block-row.has-ai_>_&]:overflow-hidden tw:min-1180:[.lesson-editor-block-row.has-ai_>_&]:overflow-y-auto tw:min-1000:[.page_.dnd-builder_.dnd-inspector_.lesson-editor-block-row.has-ai_>_&]:bottom-[0] tw:min-1000:[.page_.dnd-builder_.dnd-inspector_.lesson-editor-block-row.has-ai_>_&]:z-[3] tw:min-1180:[.lesson-editor-block-row.has-ai_>_&]:z-[5] tw:min-1000:[.page_.dnd-builder_.dnd-inspector_.lesson-editor-block-row.has-ai_>_&]:m-[0] tw:min-1000:[.page_.dnd-builder_.dnd-inspector_.lesson-editor-block-row.has-ai_>_&]:[border-right:1px_solid_var(--dnd-border)] tw:min-1000:[.page_.dnd-builder_.dnd-inspector_.lesson-editor-block-row.has-ai_>_&]:[background:var(--dnd-panel-2)] tw:min-1000:[.page_.dnd-builder_.dnd-inspector_.lesson-editor-block-row.has-ai_>_&]:[box-shadow:none] tw:min-1180:[.lesson-editor-block-row.has-ai_>_&]:[box-shadow:0_18px_42px_rgba(0,_0,_0,_0.18),_var(--glass-inset)] tw:min-1000:[.page_.dnd-builder_.dnd-inspector_.lesson-editor-block-row.has-ai_>_&]:animate-dnd-ai-panel-in tw:motion-reduce:[.page_.dnd-builder_.dnd-inspector_&]:animate-none tw:dark:min-1180:[.lesson-editor-block-row.has-ai_>_&]:[box-shadow:0_16px_40px_rgba(0,_0,_0,_0.22),_var(--glass-inset)] ${floating ? "is-floating" : ""}`}
    >
      {!floating && (
        <div className="lesson-ai-editor-head tw:grid tw:grid-cols-[minmax(0,_1fr)_auto] tw:gap-[10px] tw:[align-items:start] tw:min-1000:[.page_.dnd-builder_.dnd-inspector_.lesson-editor-block-row.has-ai_>_.lesson-ai-editor_&_span::after]:[content:'_·_блок_'_counter(dnd-block)]">
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
      )}
      <div
        className="lesson-ai-messages tw:flex-[1_1_auto] tw:max-h-[none] tw:min-h-[80px] tw:overflow-y-auto tw:flex tw:flex-col tw:gap-[8px] tw:p-[3px_2px_3px_0] tw:[overscroll-behavior-y:contain] tw:[scrollbar-width:thin] tw:[scrollbar-color:rgba(var(--accent-rgb),_0.58)_transparent] tw:min-1000:[.page_.dnd-builder_.dnd-inspector_.lesson-editor-block-row.has-ai_>_.lesson-ai-editor_&]:flex-[1] tw:min-1000:[.page_.dnd-builder_.dnd-inspector_.lesson-editor-block-row.has-ai_>_.lesson-ai-editor_&]:min-h-[0]"
        ref={aiMessagesRef}
        aria-live="polite"
        aria-busy={isAiSending}
      >
        {(aiConversation?.messages || []).length === 0 && (
          <div className="lesson-ai-message is-assistant tw:w-[fit-content] tw:max-w-[90%] tw:grid tw:gap-[4px] tw:self-start tw:border-solid tw:border-[rgba(255,_255,_255,_0.58)] tw:rounded-[12px_12px_12px_4px] tw:text-(--text) tw:p-[9px_10px] tw:text-[0.84rem] tw:leading-[1.45] tw:wrap-anywhere tw:[border-width:1px] tw:dark:border-[rgba(255,_255,_255,_0.14)] tw:[background:rgba(255,_255,_255,_0.3)] tw:dark:[background:rgba(255,_255,_255,_0.08)]">
            <p className="tw:m-[0] tw:whitespace-pre-wrap">
              Опишите, что нужно изменить. Я подготовлю правку, а история
              диалога останется здесь.
            </p>
          </div>
        )}
        {(aiConversation?.messages || []).map((message) => (
          <div
            key={message.id}
            className={`lesson-ai-message tw:w-[fit-content] tw:max-w-[90%] tw:grid tw:gap-[4px] tw:self-start tw:border-solid tw:border-[rgba(255,_255,_255,_0.58)] tw:rounded-[12px_12px_12px_4px] tw:text-(--text) tw:p-[9px_10px] tw:text-[0.84rem] tw:leading-[1.45] tw:wrap-anywhere tw:[&.is-thinking]:flex tw:[&.is-thinking]:gap-[8px] tw:[&.is-user]:self-end tw:[border-width:1px] tw:[&.is-user]:border-[rgba(var(--accent-rgb),_0.46)] tw:dark:border-[rgba(255,_255,_255,_0.14)] tw:[&.is-user]:rounded-[12px_12px_4px_12px] tw:[background:rgba(255,_255,_255,_0.3)] tw:[&.is-thinking]:items-center tw:dark:[.page_&.is-user]:border-[rgba(var(--accent-rgb),_0.4)] tw:dark:[&.is-user]:border-[rgba(255,_255,_255,_0.14)] tw:[&.is-user]:[background:rgba(var(--accent-rgb),_0.18)] tw:dark:[background:rgba(255,_255,_255,_0.08)] tw:dark:[.page_&.is-user]:[background:rgba(var(--accent-rgb),_0.18)] tw:dark:[&.is-user]:[background:rgba(255,_255,_255,_0.08)] tw:dark:[.page_&.is-user]:[&.is-user]:[&&&&]:border-[rgba(var(--accent-rgb),_0.4)] tw:dark:[.page_&.is-user]:[&.is-user]:[&&&&]:[background:rgba(var(--accent-rgb),_0.18)] is-${message.role}`}
          >
            <p className="tw:m-[0] tw:whitespace-pre-wrap">{message.text}</p>
            {message.role === "user" && (
              <span className="chat-message-status tw:block tw:mt-[2px] tw:text-(--muted) tw:text-[0.66rem] tw:font-[700] tw:leading-[1.2] tw:text-right">
                ✓ Отправлено
              </span>
            )}
          </div>
        ))}
        {isAiSending && (
          <div className="lesson-ai-message is-assistant is-thinking tw:w-[fit-content] tw:max-w-[90%] tw:flex tw:gap-[8px] tw:self-start tw:border-solid tw:border-[rgba(255,_255,_255,_0.58)] tw:rounded-[12px_12px_12px_4px] tw:text-(--text) tw:p-[9px_10px] tw:text-[0.84rem] tw:leading-[1.45] tw:wrap-anywhere tw:items-center tw:[border-width:1px] tw:dark:border-[rgba(255,_255,_255,_0.14)] tw:[background:rgba(255,_255,_255,_0.3)] tw:dark:[background:rgba(255,_255,_255,_0.08)]">
            <span
              className="chat-thinking-dots tw:inline-flex tw:items-center tw:gap-[3px] tw:flex-[0_0_auto]"
              aria-hidden="true"
            >
              <i className="tw:w-[5px] tw:h-[5px] tw:rounded-[50%] tw:opacity-[0.35] tw:[background:currentColor] tw:motion-reduce:opacity-[0.65] tw:animate-chat-thinking-pulse tw:motion-reduce:animate-none tw:[&:nth-child(2)]:[animation-delay:160ms] tw:[&:nth-child(3)]:[animation-delay:320ms]" />
              <i className="tw:w-[5px] tw:h-[5px] tw:rounded-[50%] tw:opacity-[0.35] tw:[background:currentColor] tw:motion-reduce:opacity-[0.65] tw:animate-chat-thinking-pulse tw:motion-reduce:animate-none tw:[&:nth-child(2)]:[animation-delay:160ms] tw:[&:nth-child(3)]:[animation-delay:320ms]" />
              <i className="tw:w-[5px] tw:h-[5px] tw:rounded-[50%] tw:opacity-[0.35] tw:[background:currentColor] tw:motion-reduce:opacity-[0.65] tw:animate-chat-thinking-pulse tw:motion-reduce:animate-none tw:[&:nth-child(3)]:[animation-delay:320ms] tw:[&:nth-child(2)]:[animation-delay:160ms]" />
            </span>
            <span>ИИ получил сообщение и готовит правку…</span>
          </div>
        )}
      </div>
      {block.content_type === "image" && aiReferenceImages.length > 0 && (
        <div className="lesson-ai-reference-grid tw:grid tw:grid-cols-[repeat(auto-fill,_minmax(58px,_72px))] tw:gap-[8px]">
          {aiReferenceImages.map((image) => (
            <div
              className="lesson-ai-reference-preview tw:relative tw:aspect-[1] tw:overflow-hidden tw:rounded-[10px] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.24)] tw:[background:rgba(255,_255,_255,_0.22)] tw:[&_img]:w-[100%] tw:[&_img]:h-[100%] tw:[&_img]:object-cover tw:[&_button]:absolute tw:[&_button]:top-[4px] tw:[&_button]:right-[4px] tw:[&_button]:w-[24px] tw:[&_button]:h-[24px] tw:[&_button]:[border:0] tw:[&_button]:rounded-[50%] tw:[&_button]:[background:rgba(0,_0,_0,_0.58)] tw:[&_button]:text-[#fff] tw:[&_button]:text-[1rem] tw:[&_button]:leading-[1] tw:[&_button]:cursor-pointer"
              key={image.id}
            >
              <img src={image.previewUrl} alt={image.name} />
              <button
                type="button"
                onClick={() => removeAiReferenceImage(image.id)}
                aria-label={`Удалить ${image.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {aiError && <p className="lesson-ai-error">{aiError}</p>}
      <div
        className={`lesson-ai-composer tw:grid tw:grid-cols-[minmax(0,_1fr)_34px] tw:gap-[7px] tw:mt-[auto] tw:p-[7px] tw:border-solid tw:border-[rgba(255,_255,_255,_0.58)] tw:rounded-[13px] tw:[&.has-attach]:grid-cols-[34px_minmax(0,_1fr)_34px] tw:[align-items:end] tw:[border-width:1px] tw:dark:border-[rgba(255,_255,_255,_0.16)] tw:[background:rgba(255,_255,_255,_0.3)] tw:dark:[background:rgba(255,_255,_255,_0.07)] ${block.content_type === "image" ? "has-attach" : ""}`}
      >
        {block.content_type === "image" && (
          <>
            <input
              ref={aiImageInputRef}
              className="lesson-ai-image-input tw:hidden"
              type="file"
              accept="image/*"
              multiple
              onChange={attachAiImages}
            />
            <button
              type="button"
              className="lesson-ai-attach tw:w-[34px] tw:h-[34px] tw:p-[0] tw:rounded-[50%] tw:text-(--ink-accent) tw:text-[1.15rem] tw:leading-[1] tw:cursor-pointer tw:[border:1px_solid_rgba(var(--accent-rgb),_0.42)] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:[background:transparent]"
              onClick={() => aiImageInputRef.current?.click()}
              aria-label="Прикрепить референсы до 15 МБ"
              title="Прикрепить референсы до 15 МБ"
            >
              +
            </button>
          </>
        )}
        <textarea
          className="tw:w-[100%] tw:resize-y tw:border-none tw:border-[currentcolor] tw:rounded-[11px] tw:text-(--text) tw:p-[8px_9px] tw:min-h-[74px] tw:max-h-[160px] tw:placeholder:text-(--muted) tw:placeholder:opacity-[0.9] tw:[border-width:0] tw:[background:transparent] tw:dark:text-(--heading) tw:[font:inherit] tw:[outline:none]"
          ref={(element) => {
            aiTextareaRef.current = element;
            autosizeTextarea(element, 160);
          }}
          rows={2}
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
          className="lesson-ai-send tw:w-[34px] tw:h-[34px] tw:p-[0] tw:rounded-[50%] tw:text-(--ink-accent) tw:text-[1.15rem] tw:leading-[1] tw:cursor-pointer tw:[border:1px_solid_rgba(var(--accent-rgb),_0.42)] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:disabled:cursor-not-allowed tw:[background:rgba(var(--accent-rgb),_0.18)] tw:disabled:opacity-[0.45]"
          onClick={askAi}
          disabled={isAiSending || !aiInput.trim()}
          aria-label="Отправить сообщение"
          title="Отправить"
        >
          ↑
        </button>
      </div>
    </aside>
  );

  const activeAiBlock = blocks.find((block) => block.id === activeBlockId);

  return (
    <div className="lesson-content-editor tw:mt-[14px] tw:pt-[14px] tw:grid tw:gap-[12px] tw:[border-top:1px_solid_rgba(var(--accent-rgb),_0.24)] tw:[.page_.dnd-builder_&:focus-visible]:[outline:2px_solid_var(--dnd-focus)] tw:[.page_.dnd-builder_&:focus-visible]:[outline-offset:2px]">
      <div className="lesson-content-editor-head tw:grid tw:grid-cols-[minmax(0,_1fr)] tw:gap-[12px] tw:max-760:grid-cols-[1fr] tw:[align-items:start] tw:[.page_.dnd-builder_&:focus-visible]:[outline:2px_solid_var(--dnd-focus)] tw:[.page_.dnd-builder_&:focus-visible]:[outline-offset:2px]">
        <div className="tw:[.page_.dnd-builder_&:focus-visible]:[outline:2px_solid_var(--dnd-focus)] tw:[.page_.dnd-builder_&:focus-visible]:[outline-offset:2px]">
          <span className="tw:block tw:text-(--muted) tw:text-[0.72rem] tw:font-[800] tw:tracking-[0.07em] tw:uppercase tw:[.page_.dnd-builder_&:focus-visible]:[outline:2px_solid_var(--dnd-focus)] tw:[.page_.dnd-builder_&:focus-visible]:[outline-offset:2px]">
            {contentLabel}
          </span>
          <strong className="tw:block tw:mt-[4px] tw:text-(--heading) tw:[.page_.dnd-builder_&:focus-visible]:[outline:2px_solid_var(--dnd-focus)] tw:[.page_.dnd-builder_&:focus-visible]:[outline-offset:2px]">
            {blocksLabel}
          </strong>
        </div>
        <input
          ref={fileInputRef}
          className="knowledge-file-input tw:hidden tw:text-[0.96rem] tw:leading-[1.45] tw:[.page.is-inner-page_.dnd-builder_&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[.page.is-inner-page_.dnd-builder_&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:[.page.is-inner-page_.dnd-builder_&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[.page.is-inner-page_.dnd-builder_&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[.page_.dnd-builder_&:focus-visible]:[outline:2px_solid_var(--dnd-focus)] tw:[.page_.dnd-builder_&:focus-visible]:[outline-offset:2px]"
          type="file"
          multiple
          accept=".pdf,.docx,.pptx,.xlsx,.md,.markdown,.html,.txt,.json,.sql,.js,.jsx,.ts,.tsx,.py,.csv,.png,.jpg,.jpeg,.webp,.gif"
          onChange={importFiles}
        />
      </div>

      {blockLimitError && (
        <p className="lesson-editor-limit-error tw:m-[0] tw:p-[9px_11px] tw:rounded-[10px] tw:text-[var(--danger-text,_#a94f60)] tw:text-[0.82rem] tw:leading-[1.4] tw:[border:1px_solid_rgba(var(--danger-rgb,_190,_80,_100),_0.32)] tw:[background:rgba(var(--danger-rgb,_190,_80,_100),_0.07)]">
          {blockLimitError}
        </p>
      )}

      <div className="lesson-content-editor-layout tw:grid tw:grid-cols-[minmax(0,_1fr)] tw:gap-[12px] tw:[align-items:start] tw:[.page_.dnd-builder_&:focus-visible]:[outline:2px_solid_var(--dnd-focus)] tw:[.page_.dnd-builder_&:focus-visible]:[outline-offset:2px]">
        <div className="lesson-editor-blocks tw:grid tw:gap-[10px] tw:[.page_.dnd-builder_&:focus-visible]:[outline:2px_solid_var(--dnd-focus)] tw:[.page_.dnd-builder_&:focus-visible]:[outline-offset:2px] tw:min-1000:[.page_.dnd-builder_.dnd-inspector_&]:[counter-reset:dnd-block]">
          {showInsertControls &&
            blocks.length < MAX_CONTENT_BLOCKS &&
            renderInsertControl(0)}
          {blocks.map((block, index) => {
            const isActive = activeBlockId === block.id;
            const canUseAiEditor = block.content_type !== "video";
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
                  className={`lesson-editor-block-row tw:min-w-[0] tw:[&.has-ai]:relative tw:[&.has-ai]:block tw:min-1000:[.page_.dnd-builder_.dnd-inspector_&.has-ai]:static tw:min-1000:[.page_.dnd-builder_.dnd-inspector_&.has-ai]:block tw:max-1100:[&.has-ai]:grid-cols-[1fr] tw:[.page_.dnd-builder_&:focus-visible]:[outline:2px_solid_var(--dnd-focus)] tw:[.page_.dnd-builder_&:focus-visible]:[outline-offset:2px] tw:min-1000:[.page_.dnd-builder_.dnd-inspector_&]:[counter-increment:dnd-block] ${!floatingAiEditor && isActive && isAiOpen && canUseAiEditor ? "has-ai" : ""}`}
                >
                  <article
                    className={`lesson-editor-block tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.3)] tw:rounded-[13px] tw:p-[0] tw:grid tw:gap-[0] tw:overflow-hidden tw:[border-width:1px] tw:dark:border-[rgba(var(--accent-rgb),_0.42)] tw:[&.is-active]:border-[rgba(var(--accent-rgb),_0.78)] tw:[background:rgba(255,_255,_255,_0.16)] tw:[transition:border-color_0.16s_ease,_box-shadow_0.16s_ease] tw:[&.is-preview]:cursor-pointer tw:[&.is-preview:hover]:border-[rgba(var(--accent-rgb),_0.72)] tw:[&.is-preview:focus-within]:border-[rgba(var(--accent-rgb),_0.72)] tw:dark:[&.is-active]:border-[rgba(var(--accent-rgb),_0.42)] tw:dark:[background:var(--surface)] tw:[&.is-active]:[box-shadow:0_0_0_2px_rgba(var(--accent-rgb),_0.12)] tw:[&.is-preview:hover]:[box-shadow:0_0_0_2px_rgba(var(--accent-rgb),_0.1)] tw:[&.is-preview:focus-within]:[box-shadow:0_0_0_2px_rgba(var(--accent-rgb),_0.1)] tw:[.page_.dnd-builder_&:focus-visible]:[outline:2px_solid_var(--dnd-focus)] tw:[.page_.dnd-builder_&:focus-visible]:[outline-offset:2px] tw:[&.is-active_>_textarea]:min-h-[380px] tw:[&.is-active_>_textarea]:p-[18px_20px] tw:[&.is-active_>_textarea]:text-[1rem] tw:[&.is-code_textarea]:[font-family:'JetBrains_Mono',_'Fira_Code',_monospace] tw:[&.is-code_textarea]:text-[0.86rem] tw:[&.is-mermaid_textarea]:[font-family:'JetBrains_Mono',_'Fira_Code',_monospace] tw:[&.is-mermaid_textarea]:text-[0.86rem] tw:[&.is-table_textarea]:[font-family:'JetBrains_Mono',_'Fira_Code',_monospace] tw:[&.is-table_textarea]:text-[0.86rem] is-${block.type} ${isActive ? "is-active" : "is-preview"}`}
                  >
                    {proposal && proposal.blockId === block.id ? (
                      <div className="lesson-block-proposal tw:grid">
                        <div className="lesson-block-proposal-head tw:flex tw:items-center tw:justify-between tw:gap-[12px] tw:p-[12px_14px] tw:[border-bottom:1px_solid_rgba(var(--accent-rgb),_0.2)] tw:[background:rgba(var(--accent-soft-rgb),_0.08)]">
                          <span className="tw:text-(--ink-accent) tw:text-[0.76rem] tw:font-[800] tw:tracking-[0.05em] tw:uppercase">
                            Предложено ИИ
                          </span>
                          <div className="lesson-block-proposal-actions tw:flex tw:gap-[8px] tw:[&_.btn]:p-[7px_14px] tw:[&_.btn]:text-[0.8rem]">
                            <button
                              type="button"
                              className="btn btn-solid tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[7px_14px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:[&&]:text-[0.96rem] tw:hover:[transform:translateY(-1px)]"
                              onClick={applyProposal}
                            >
                              Применить
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[7px_14px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:[&&]:text-[0.96rem] tw:hover:[transform:translateY(-1px)]"
                              onClick={rejectProposal}
                            >
                              Не применять
                            </button>
                          </div>
                        </div>
                        <div className="lesson-markdown lesson-proposal-preview tw:p-[clamp(20px,_2.6vw,_32px)] tw:mt-[18px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.38)] tw:rounded-[18px] tw:w-[100%] tw:min-w-[0] tw:max-w-[100%] tw:overflow-x-clip tw:overflow-y-visible tw:[border-width:1px] tw:[background:linear-gradient(145deg,_rgba(255,_255,_255,_0.35),_rgba(255,_255,_255,_0.12))] tw:dark:[background:linear-gradient(145deg,_rgba(255,_255,_255,_0.07),_rgba(255,_255,_255,_0.025))] tw:dark:[box-shadow:none] tw:[.lesson-editor-block-select_&_>_:first-child]:mt-[0] tw:[.lesson-editor-block-select_&_>_:last-child]:mb-[0] tw:[&_>_:first-child]:mt-[0] tw:[&_>_:last-child]:mb-[0] tw:[&_p]:max-w-[100%] tw:[&_p]:text-(--muted) tw:[&_p]:leading-[1.5] tw:[&_p]:wrap-anywhere tw:dark:[.page_&_p]:text-[#e9decb] tw:[.page.is-inner-page_&_p]:text-(--text) tw:[.page.is-inner-page_&_p]:text-[clamp(1rem,_1.15vw,_1.08rem)] tw:[.page.is-inner-page_&_p]:leading-[1.82] tw:[.page.is-inner-page_&_p]:tracking-[0.014em] tw:[.page.is-inner-page_&_p]:m-[0_0_18px] tw:[.generated-course-learning-grid_&_pre]:[border:1px_solid_rgba(255,_255,_255,_0.14)] tw:[.generated-course-learning-grid_&_pre]:[background:#0b1020] tw:[.generated-course-learning-grid_&_pre]:text-[#f8fafc] tw:dark:[.page_.generated-course-learning-grid_&&&_pre]:border-[rgba(247,_220,_168,_0.28)] tw:dark:[.page_.generated-course-learning-grid_&&&_pre]:[background:#050816] tw:dark:[.page_.generated-course-learning-grid_&&&_pre]:text-[#f8fafc] tw:[&_pre]:m-[10px_0] tw:[&_pre]:p-[12px] tw:[&_pre]:rounded-[12px] tw:[&_pre]:[background:rgba(0,_0,_0,_0.08)] tw:[&_pre]:overflow-x-auto tw:dark:[.page_&_pre]:[background:rgba(10,_10,_10,_0.72)] tw:dark:[.page_&_pre]:[border:1px_solid_rgba(var(--accent-rgb),_0.32)] tw:dark:[.page_&_pre]:text-[#f2e7d4] tw:[.page.is-inner-page_&_pre]:w-[100%] tw:[.page.is-inner-page_&_pre]:max-w-[100%] tw:[.page.is-inner-page_&_pre]:m-[24px_0] tw:[.page.is-inner-page_&_pre]:p-[20px] tw:[.page.is-inner-page_&_pre]:[border:1px_solid_rgba(91,_111,_138,_0.44)] tw:[.page.is-inner-page_&_pre]:rounded-[14px] tw:[.page.is-inner-page_&_pre]:[background:#202631] tw:[.page.is-inner-page_&_pre]:text-[#d8dee9] tw:[.page.is-inner-page_&_pre]:[box-shadow:0_14px_32px_rgba(31,_38,_49,_0.16),_inset_0_1px_0_rgba(255,_255,_255,_0.05)] tw:[.page.is-inner-page_&_pre]:overflow-x-auto tw:[.page.is-inner-page_&_pre]:overflow-y-hidden tw:[.page.is-inner-page_&_pre]:[overscroll-behavior-inline:contain] tw:[.page.is-inner-page_&_pre]:[tab-size:4] tw:[&_h2]:m-[0_0_10px] tw:[&_h2]:[font-family:'Unbounded',_sans-serif] tw:[&_h2]:text-[0.98rem] tw:[&_h2]:text-(--heading) tw:[.page.is-inner-page_&_h2]:[font-family:'Unbounded',_sans-serif] tw:[.page.is-inner-page_&_h2]:m-[34px_0_16px] tw:[.page.is-inner-page_&_h2]:text-(--heading) tw:[.page.is-inner-page_&_h2]:text-[clamp(1.3rem,_2vw,_1.65rem)] tw:[.page.is-inner-page_&_h2]:leading-[1.38] tw:[.page.is-inner-page_&_ul]:m-[14px_0_22px] tw:[.page.is-inner-page_&_ul]:pl-[28px] tw:[&_li]:max-w-[100%] tw:[&_li]:text-(--muted) tw:[&_li]:leading-[1.5] tw:[&_li]:wrap-anywhere tw:dark:[.page_&_li]:text-[#e9decb] tw:[.page.is-inner-page_&_li]:text-(--text) tw:[.page.is-inner-page_&_li]:text-[clamp(1rem,_1.15vw,_1.08rem)] tw:[.page.is-inner-page_&_li]:leading-[1.82] tw:[.page.is-inner-page_&_li]:tracking-[0.014em] tw:[.page.is-inner-page_&_li]:pl-[5px] tw:[.page.is-inner-page_&_li::marker]:text-(--info-text) tw:[.page.is-inner-page_&_li::marker]:font-[800] tw:[&_h3]:m-[0_0_10px] tw:[&_h3]:[font-family:'Unbounded',_sans-serif] tw:[&_h3]:text-[0.98rem] tw:[&_h3]:text-(--heading) tw:[&_:not(pre)_>_code]:rounded-[7px] tw:[&_:not(pre)_>_code]:[background:rgba(var(--accent-rgb),_0.14)] tw:[&_:not(pre)_>_code]:p-[2px_5px] tw:[&_:not(pre)_>_code]:text-(--ink-accent) tw:[&_:not(pre)_>_code]:whitespace-normal tw:[&_:not(pre)_>_code]:wrap-anywhere tw:dark:[.page_&_td]:text-[#e9decb] tw:dark:[.page_&_:not(pre)_>_code]:[background:rgba(255,_255,_255,_0.09)] tw:dark:[.page_&_:not(pre)_>_code]:text-[#f7dca8] tw:[&_table]:w-[100%] tw:[&_table]:[border-collapse:collapse] tw:[&_table]:m-[12px_0] tw:[&_th]:[border:1px_solid_rgba(var(--accent-rgb),_0.36)] tw:[&_th]:p-[8px_10px] tw:[&_th]:text-left tw:[&_th]:text-[0.86rem] tw:[&_th]:text-(--text) tw:[&_td]:[border:1px_solid_rgba(var(--accent-rgb),_0.36)] tw:[&_td]:p-[8px_10px] tw:[&_td]:text-left tw:[&_td]:text-[0.86rem] tw:[&_td]:text-(--text) tw:[&_th]:[background:rgba(var(--accent-rgb),_0.12)] tw:dark:[.page_&_table]:[background:rgba(12,_12,_12,_0.42)] tw:dark:[.page_&_th]:border-[rgba(var(--accent-rgb),_0.5)] tw:dark:[.page_&_td]:border-[rgba(var(--accent-rgb),_0.5)] tw:dark:[.page_&_th]:[background:rgba(var(--accent-rgb),_0.22)] tw:dark:[.page_&_th]:text-[#fff2df] tw:[&_a]:text-(--ink-accent) tw:[&_a]:font-[700] tw:[&_img]:block tw:[&_img]:max-w-[100%] tw:[&_img]:h-[auto] tw:[&_img]:m-[12px_0] tw:[&_img]:[border:1px_solid_rgba(var(--accent-rgb),_0.28)] tw:[&_img]:rounded-[12px] tw:[&_img]:[background:rgba(255,_255,_255,_0.34)] tw:[.content-preview-image-trigger_&_img]:m-[0] tw:dark:[.page_&_img]:border-[rgba(var(--accent-rgb),_0.46)] tw:dark:[.page_&_img]:[background:rgba(255,_255,_255,_0.08)] tw:[.page.is-inner-page_&_h3]:[font-family:'Unbounded',_sans-serif] tw:[.page.is-inner-page_&_h4]:[font-family:'Unbounded',_sans-serif] tw:[.page.is-inner-page_&_h3]:m-[28px_0_13px] tw:[.page.is-inner-page_&_h3]:text-(--ink-accent) tw:[.page.is-inner-page_&_h3]:text-[clamp(1.08rem,_1.5vw,_1.28rem)] tw:[.page.is-inner-page_&_h3]:leading-[1.45] tw:[.page.is-inner-page_&_h4]:m-[24px_0_11px] tw:[.page.is-inner-page_&_h4]:text-(--info-text) tw:[.page.is-inner-page_&_h4]:text-[1.04rem] tw:[.page.is-inner-page_&_h4]:leading-[1.48] tw:[.page.is-inner-page_&_ol]:m-[14px_0_22px] tw:[.page.is-inner-page_&_ol]:pl-[28px] tw:[.page.is-inner-page_&_li_+_li]:mt-[8px] tw:[.page.is-inner-page_&_em]:text-(--info-text) tw:[.page.is-inner-page_&_a]:text-[#456fa8] tw:[.page.is-inner-page_&_a]:[text-decoration-thickness:1.5px] tw:[.page.is-inner-page_&_a]:[text-underline-offset:3px] tw:[.page.is-inner-page_&_blockquote]:m-[22px_0] tw:[.page.is-inner-page_&_blockquote]:[border-left:4px_solid_#c98245] tw:[.page.is-inner-page_&_blockquote]:rounded-[0_12px_12px_0] tw:[.page.is-inner-page_&_blockquote]:[background:rgba(201,_130,_69,_0.11)] tw:[.page.is-inner-page_&_blockquote]:p-[14px_18px] tw:[.page.is-inner-page_&_blockquote_p]:m-[0] tw:[.page.is-inner-page_&_blockquote_p]:text-[#79502f] tw:[.page.is-inner-page_&_blockquote_strong]:text-[#9a5f2d] tw:[.page.is-inner-page_&_hr]:h-[1px] tw:[.page.is-inner-page_&_hr]:m-[30px_0] tw:[.page.is-inner-page_&_hr]:[border:0] tw:[.page.is-inner-page_&_hr]:[background:linear-gradient(_90deg,_transparent,_rgba(var(--accent-rgb),_0.7),_transparent_)] tw:[.page.is-inner-page_&_table]:w-[100%] tw:[.page.is-inner-page_&_table]:max-w-[100%] tw:[.page.is-inner-page_&_table]:m-[22px_0] tw:[.page.is-inner-page_&_table]:[border-collapse:separate] tw:[.page.is-inner-page_&_table]:[border-spacing:0] tw:[.page.is-inner-page_&_table]:[table-layout:fixed] tw:[.page.is-inner-page_&_th]:p-[12px_14px] tw:[.page.is-inner-page_&_th]:text-[0.96rem] tw:[.page.is-inner-page_&_th]:leading-[1.58] tw:[.page.is-inner-page_&_th]:wrap-anywhere tw:[.page.is-inner-page_&_th]:[word-break:normal] tw:[.page.is-inner-page_&_td]:p-[12px_14px] tw:[.page.is-inner-page_&_td]:text-[0.96rem] tw:[.page.is-inner-page_&_td]:leading-[1.58] tw:[.page.is-inner-page_&_td]:wrap-anywhere tw:[.page.is-inner-page_&_td]:[word-break:normal] tw:[.page.is-inner-page_&_th]:text-(--ink-accent) tw:[.page.is-inner-page_&_th]:[background:rgba(var(--accent-rgb),_0.16)] tw:dark:[.page.is-inner-page_&_h3]:text-[#e5c07b] tw:dark:[.page.is-inner-page_&_h4]:text-[#8fc7ff] tw:dark:[.page.is-inner-page_&_em]:text-[#8fc7ff] tw:dark:[.page.is-inner-page_&_a]:text-[#8fc7ff] tw:dark:[.page.is-inner-page_&_blockquote_p]:text-[#e5c5a7] tw:dark:[.page.is-inner-page_&_blockquote]:[border-left-color:#d0935f] tw:dark:[.page.is-inner-page_&_blockquote]:[background:rgba(208,_147,_95,_0.12)] tw:dark:[.page.is-inner-page_&_blockquote_strong]:text-[#e0a66c] tw:dark:[.page.is-inner-page_&&&_pre]:border-[rgba(143,_155,_170,_0.3)] tw:dark:[.page.is-inner-page_&&&_pre]:[background:#171c24]">
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
                        <div className="lesson-editor-block-head tw:p-[12px_14px] tw:flex tw:justify-between tw:gap-[10px] tw:items-center tw:max-760:items-stretch tw:[border-bottom:1px_solid_rgba(var(--accent-rgb),_0.2)] tw:[background:rgba(var(--accent-rgb),_0.06)] tw:max-760:grid-cols-[1fr] tw:dark:[border-bottom-color:rgba(var(--accent-rgb),_0.32)] tw:dark:[background:rgba(var(--accent-rgb),_0.12)] tw:[&_div]:flex tw:[&_div]:flex-wrap tw:[&_div]:gap-[6px] tw:[&_select]:min-w-[150px] tw:[&_select]:[border:1px_solid_rgba(var(--accent-rgb),_0.34)] tw:[&_select]:rounded-[10px] tw:[&_select]:[background:rgba(var(--accent-rgb),_0.08)] tw:[&_select]:text-(--text) tw:[&_select]:p-[7px_9px] tw:[&_select]:[font-style:inherit] tw:[&_select]:[font-variant:inherit] tw:[&_select]:[font-weight:inherit] tw:[&_select]:[font-stretch:inherit] tw:[&_select]:leading-[inherit] tw:[&_select]:[font-family:inherit] tw:[&_select]:text-[0.82rem] tw:dark:[.page_&_select]:text-(--heading) tw:dark:[.page_&_select]:[background:rgba(24,_24,_24,_0.74)] tw:dark:[.page_&_select]:border-[rgba(var(--accent-rgb),_0.5)]">
                          <strong>{getBlockTitle(block)}</strong>
                          <div className="tw:flex tw:flex-wrap tw:gap-[6px]">
                            <button
                              className="tw:rounded-[999px] tw:text-(--ink-accent) tw:p-[6px_9px] tw:leading-[1.45] tw:text-[0.96rem] tw:font-[800] tw:cursor-pointer tw:[border:1px_solid_rgba(var(--accent-rgb),_0.34)] tw:[background:rgba(var(--accent-rgb),_0.08)] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:max-760:flex-[1_1_auto] tw:[.lesson-editor-block-head_&:disabled]:cursor-not-allowed tw:[.lesson-editor-block-head_&:disabled]:opacity-[0.45]"
                              type="button"
                              onClick={() => moveBlock(block.id, -1)}
                              disabled={index === 0}
                            >
                              Выше
                            </button>
                            <button
                              className="tw:rounded-[999px] tw:text-(--ink-accent) tw:p-[6px_9px] tw:leading-[1.45] tw:text-[0.96rem] tw:font-[800] tw:cursor-pointer tw:[border:1px_solid_rgba(var(--accent-rgb),_0.34)] tw:[background:rgba(var(--accent-rgb),_0.08)] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:max-760:flex-[1_1_auto] tw:[.lesson-editor-block-head_&:disabled]:cursor-not-allowed tw:[.lesson-editor-block-head_&:disabled]:opacity-[0.45]"
                              type="button"
                              onClick={() => moveBlock(block.id, 1)}
                              disabled={index === blocks.length - 1}
                            >
                              Ниже
                            </button>
                            {canUseAiEditor && (
                              <button
                                type="button"
                                className={`tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.34)] tw:rounded-[999px] tw:text-(--ink-accent) tw:p-[6px_9px] tw:leading-[1.45] tw:text-[0.96rem] tw:font-[800] tw:cursor-pointer tw:[border-width:1px] tw:[.lesson-editor-block-head_&.is-active]:border-[rgba(var(--accent-rgb),_0.72)] tw:[background:rgba(var(--accent-rgb),_0.08)] tw:[.lesson-editor-block-head_&.is-active]:text-(--heading) tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:disabled:cursor-not-allowed tw:max-760:flex-[1_1_auto] tw:disabled:opacity-[0.45] tw:[.lesson-editor-block-head_&.is-active]:[background:rgba(var(--accent-rgb),_0.2)] ${isAiOpen ? "is-active" : ""}`}
                                onClick={() => {
                                  setIsAiOpen((current) => !current);
                                  scrollToBlock(block.id);
                                }}
                              >
                                ИИ-редактор
                              </button>
                            )}
                            <button
                              className="tw:rounded-[999px] tw:text-(--ink-accent) tw:p-[6px_9px] tw:leading-[1.45] tw:text-[0.96rem] tw:font-[800] tw:cursor-pointer tw:[border:1px_solid_rgba(var(--accent-rgb),_0.34)] tw:[background:rgba(var(--accent-rgb),_0.08)] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:disabled:cursor-not-allowed tw:max-760:flex-[1_1_auto] tw:disabled:opacity-[0.45]"
                              type="button"
                              onClick={() => setActiveBlockId("")}
                            >
                              Готово
                            </button>
                            <button
                              className="tw:rounded-[999px] tw:text-(--ink-accent) tw:p-[6px_9px] tw:leading-[1.45] tw:text-[0.96rem] tw:font-[800] tw:cursor-pointer tw:[border:1px_solid_rgba(var(--accent-rgb),_0.34)] tw:[background:rgba(var(--accent-rgb),_0.08)] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:disabled:cursor-not-allowed tw:max-760:flex-[1_1_auto] tw:disabled:opacity-[0.45]"
                              type="button"
                              onClick={() => setBlockToDelete(block)}
                            >
                              Удалить
                            </button>
                          </div>
                        </div>
                        <div className="lesson-block-fields tw:grid tw:grid-cols-[repeat(2,_minmax(0,_1fr))] tw:gap-[12px] tw:p-[14px]">
                          {renderBlockFields(block)}
                        </div>
                      </>
                    ) : (
                      <div
                        className="lesson-editor-block-select tw:w-[100%] tw:min-w-[0] tw:text-[inherit] tw:p-[14px] tw:text-left tw:cursor-pointer tw:[border:0] tw:[background:transparent] tw:[outline:none] tw:[.page_.dnd-builder_&:focus-visible]:[outline:2px_solid_var(--dnd-focus)] tw:[.page_.dnd-builder_&:focus-visible]:[outline-offset:2px]"
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
                        <div className="lesson-editor-preview-head tw:grid tw:gap-[3px] tw:mb-[10px] tw:[.page_.dnd-builder_&:focus-visible]:[outline:2px_solid_var(--dnd-focus)] tw:[.page_.dnd-builder_&:focus-visible]:[outline-offset:2px]">
                          <span className="tw:text-(--muted) tw:text-[0.72rem] tw:font-[800] tw:tracking-[0.07em] tw:uppercase tw:[.page_.dnd-builder_&:focus-visible]:[outline:2px_solid_var(--dnd-focus)] tw:[.page_.dnd-builder_&:focus-visible]:[outline-offset:2px]">
                            {blockTypes.find((type) => type.id === block.type)
                              ?.label || "Блок"}
                          </span>
                          <strong className="tw:text-(--heading) tw:[.page_.dnd-builder_&:focus-visible]:[outline:2px_solid_var(--dnd-focus)] tw:[.page_.dnd-builder_&:focus-visible]:[outline-offset:2px]">
                            {getBlockTitle(block)}
                          </strong>
                        </div>
                        <div className="lesson-markdown tw:mt-[18px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.38)] tw:rounded-[18px] tw:p-[clamp(20px,_2.6vw,_32px)] tw:w-[100%] tw:min-w-[0] tw:max-w-[100%] tw:overflow-x-clip tw:overflow-y-visible tw:[border-width:1px] tw:[background:linear-gradient(145deg,_rgba(255,_255,_255,_0.35),_rgba(255,_255,_255,_0.12))] tw:dark:[background:linear-gradient(145deg,_rgba(255,_255,_255,_0.07),_rgba(255,_255,_255,_0.025))] tw:dark:[box-shadow:none] tw:[.page_.dnd-builder_&:focus-visible]:[outline:2px_solid_var(--dnd-focus)] tw:[.page_.dnd-builder_&:focus-visible]:[outline-offset:2px] tw:[.lesson-editor-block-select_&_>_:first-child]:mt-[0] tw:[.lesson-editor-block-select_&_>_:last-child]:mb-[0] tw:[&_>_:first-child]:mt-[0] tw:[&_>_:last-child]:mb-[0] tw:[&_p]:max-w-[100%] tw:[&_p]:text-(--muted) tw:[&_p]:leading-[1.5] tw:[&_p]:wrap-anywhere tw:dark:[.page_&_p]:text-[#e9decb] tw:[.page.is-inner-page_&_p]:text-(--text) tw:[.page.is-inner-page_&_p]:text-[clamp(1rem,_1.15vw,_1.08rem)] tw:[.page.is-inner-page_&_p]:leading-[1.82] tw:[.page.is-inner-page_&_p]:tracking-[0.014em] tw:[.page.is-inner-page_&_p]:m-[0_0_18px] tw:[.generated-course-learning-grid_&_pre]:[border:1px_solid_rgba(255,_255,_255,_0.14)] tw:[.generated-course-learning-grid_&_pre]:[background:#0b1020] tw:[.generated-course-learning-grid_&_pre]:text-[#f8fafc] tw:dark:[.page_.generated-course-learning-grid_&&&_pre]:border-[rgba(247,_220,_168,_0.28)] tw:dark:[.page_.generated-course-learning-grid_&&&_pre]:[background:#050816] tw:dark:[.page_.generated-course-learning-grid_&&&_pre]:text-[#f8fafc] tw:[&_pre]:m-[10px_0] tw:[&_pre]:p-[12px] tw:[&_pre]:rounded-[12px] tw:[&_pre]:[background:rgba(0,_0,_0,_0.08)] tw:[&_pre]:overflow-x-auto tw:dark:[.page_&_pre]:[background:rgba(10,_10,_10,_0.72)] tw:dark:[.page_&_pre]:[border:1px_solid_rgba(var(--accent-rgb),_0.32)] tw:dark:[.page_&_pre]:text-[#f2e7d4] tw:[.page.is-inner-page_&_pre]:w-[100%] tw:[.page.is-inner-page_&_pre]:max-w-[100%] tw:[.page.is-inner-page_&_pre]:m-[24px_0] tw:[.page.is-inner-page_&_pre]:p-[20px] tw:[.page.is-inner-page_&_pre]:[border:1px_solid_rgba(91,_111,_138,_0.44)] tw:[.page.is-inner-page_&_pre]:rounded-[14px] tw:[.page.is-inner-page_&_pre]:[background:#202631] tw:[.page.is-inner-page_&_pre]:text-[#d8dee9] tw:[.page.is-inner-page_&_pre]:[box-shadow:0_14px_32px_rgba(31,_38,_49,_0.16),_inset_0_1px_0_rgba(255,_255,_255,_0.05)] tw:[.page.is-inner-page_&_pre]:overflow-x-auto tw:[.page.is-inner-page_&_pre]:overflow-y-hidden tw:[.page.is-inner-page_&_pre]:[overscroll-behavior-inline:contain] tw:[.page.is-inner-page_&_pre]:[tab-size:4] tw:[&_h2]:m-[0_0_10px] tw:[&_h2]:[font-family:'Unbounded',_sans-serif] tw:[&_h2]:text-[0.98rem] tw:[&_h2]:text-(--heading) tw:[.page.is-inner-page_&_h2]:[font-family:'Unbounded',_sans-serif] tw:[.page.is-inner-page_&_h2]:m-[34px_0_16px] tw:[.page.is-inner-page_&_h2]:text-(--heading) tw:[.page.is-inner-page_&_h2]:text-[clamp(1.3rem,_2vw,_1.65rem)] tw:[.page.is-inner-page_&_h2]:leading-[1.38] tw:[.page.is-inner-page_&_ul]:m-[14px_0_22px] tw:[.page.is-inner-page_&_ul]:pl-[28px] tw:[&_li]:max-w-[100%] tw:[&_li]:text-(--muted) tw:[&_li]:leading-[1.5] tw:[&_li]:wrap-anywhere tw:dark:[.page_&_li]:text-[#e9decb] tw:[.page.is-inner-page_&_li]:text-(--text) tw:[.page.is-inner-page_&_li]:text-[clamp(1rem,_1.15vw,_1.08rem)] tw:[.page.is-inner-page_&_li]:leading-[1.82] tw:[.page.is-inner-page_&_li]:tracking-[0.014em] tw:[.page.is-inner-page_&_li]:pl-[5px] tw:[.page.is-inner-page_&_li::marker]:text-(--info-text) tw:[.page.is-inner-page_&_li::marker]:font-[800] tw:[&_h3]:m-[0_0_10px] tw:[&_h3]:[font-family:'Unbounded',_sans-serif] tw:[&_h3]:text-[0.98rem] tw:[&_h3]:text-(--heading) tw:[&_:not(pre)_>_code]:rounded-[7px] tw:[&_:not(pre)_>_code]:[background:rgba(var(--accent-rgb),_0.14)] tw:[&_:not(pre)_>_code]:p-[2px_5px] tw:[&_:not(pre)_>_code]:text-(--ink-accent) tw:[&_:not(pre)_>_code]:whitespace-normal tw:[&_:not(pre)_>_code]:wrap-anywhere tw:dark:[.page_&_td]:text-[#e9decb] tw:dark:[.page_&_:not(pre)_>_code]:[background:rgba(255,_255,_255,_0.09)] tw:dark:[.page_&_:not(pre)_>_code]:text-[#f7dca8] tw:[&_table]:w-[100%] tw:[&_table]:[border-collapse:collapse] tw:[&_table]:m-[12px_0] tw:[&_th]:[border:1px_solid_rgba(var(--accent-rgb),_0.36)] tw:[&_th]:p-[8px_10px] tw:[&_th]:text-left tw:[&_th]:text-[0.86rem] tw:[&_th]:text-(--text) tw:[&_td]:[border:1px_solid_rgba(var(--accent-rgb),_0.36)] tw:[&_td]:p-[8px_10px] tw:[&_td]:text-left tw:[&_td]:text-[0.86rem] tw:[&_td]:text-(--text) tw:[&_th]:[background:rgba(var(--accent-rgb),_0.12)] tw:dark:[.page_&_table]:[background:rgba(12,_12,_12,_0.42)] tw:dark:[.page_&_th]:border-[rgba(var(--accent-rgb),_0.5)] tw:dark:[.page_&_td]:border-[rgba(var(--accent-rgb),_0.5)] tw:dark:[.page_&_th]:[background:rgba(var(--accent-rgb),_0.22)] tw:dark:[.page_&_th]:text-[#fff2df] tw:[&_a]:text-(--ink-accent) tw:[&_a]:font-[700] tw:[&_img]:block tw:[&_img]:max-w-[100%] tw:[&_img]:h-[auto] tw:[&_img]:m-[12px_0] tw:[&_img]:[border:1px_solid_rgba(var(--accent-rgb),_0.28)] tw:[&_img]:rounded-[12px] tw:[&_img]:[background:rgba(255,_255,_255,_0.34)] tw:[.content-preview-image-trigger_&_img]:m-[0] tw:dark:[.page_&_img]:border-[rgba(var(--accent-rgb),_0.46)] tw:dark:[.page_&_img]:[background:rgba(255,_255,_255,_0.08)] tw:[.page.is-inner-page_&_h3]:[font-family:'Unbounded',_sans-serif] tw:[.page.is-inner-page_&_h4]:[font-family:'Unbounded',_sans-serif] tw:[.page.is-inner-page_&_h3]:m-[28px_0_13px] tw:[.page.is-inner-page_&_h3]:text-(--ink-accent) tw:[.page.is-inner-page_&_h3]:text-[clamp(1.08rem,_1.5vw,_1.28rem)] tw:[.page.is-inner-page_&_h3]:leading-[1.45] tw:[.page.is-inner-page_&_h4]:m-[24px_0_11px] tw:[.page.is-inner-page_&_h4]:text-(--info-text) tw:[.page.is-inner-page_&_h4]:text-[1.04rem] tw:[.page.is-inner-page_&_h4]:leading-[1.48] tw:[.page.is-inner-page_&_ol]:m-[14px_0_22px] tw:[.page.is-inner-page_&_ol]:pl-[28px] tw:[.page.is-inner-page_&_li_+_li]:mt-[8px] tw:[.page.is-inner-page_&_em]:text-(--info-text) tw:[.page.is-inner-page_&_a]:text-[#456fa8] tw:[.page.is-inner-page_&_a]:[text-decoration-thickness:1.5px] tw:[.page.is-inner-page_&_a]:[text-underline-offset:3px] tw:[.page.is-inner-page_&_blockquote]:m-[22px_0] tw:[.page.is-inner-page_&_blockquote]:[border-left:4px_solid_#c98245] tw:[.page.is-inner-page_&_blockquote]:rounded-[0_12px_12px_0] tw:[.page.is-inner-page_&_blockquote]:[background:rgba(201,_130,_69,_0.11)] tw:[.page.is-inner-page_&_blockquote]:p-[14px_18px] tw:[.page.is-inner-page_&_blockquote_p]:m-[0] tw:[.page.is-inner-page_&_blockquote_p]:text-[#79502f] tw:[.page.is-inner-page_&_blockquote_strong]:text-[#9a5f2d] tw:[.page.is-inner-page_&_hr]:h-[1px] tw:[.page.is-inner-page_&_hr]:m-[30px_0] tw:[.page.is-inner-page_&_hr]:[border:0] tw:[.page.is-inner-page_&_hr]:[background:linear-gradient(_90deg,_transparent,_rgba(var(--accent-rgb),_0.7),_transparent_)] tw:[.page.is-inner-page_&_table]:w-[100%] tw:[.page.is-inner-page_&_table]:max-w-[100%] tw:[.page.is-inner-page_&_table]:m-[22px_0] tw:[.page.is-inner-page_&_table]:[border-collapse:separate] tw:[.page.is-inner-page_&_table]:[border-spacing:0] tw:[.page.is-inner-page_&_table]:[table-layout:fixed] tw:[.page.is-inner-page_&_th]:p-[12px_14px] tw:[.page.is-inner-page_&_th]:text-[0.96rem] tw:[.page.is-inner-page_&_th]:leading-[1.58] tw:[.page.is-inner-page_&_th]:wrap-anywhere tw:[.page.is-inner-page_&_th]:[word-break:normal] tw:[.page.is-inner-page_&_td]:p-[12px_14px] tw:[.page.is-inner-page_&_td]:text-[0.96rem] tw:[.page.is-inner-page_&_td]:leading-[1.58] tw:[.page.is-inner-page_&_td]:wrap-anywhere tw:[.page.is-inner-page_&_td]:[word-break:normal] tw:[.page.is-inner-page_&_th]:text-(--ink-accent) tw:[.page.is-inner-page_&_th]:[background:rgba(var(--accent-rgb),_0.16)] tw:dark:[.page.is-inner-page_&_h3]:text-[#e5c07b] tw:dark:[.page.is-inner-page_&_h4]:text-[#8fc7ff] tw:dark:[.page.is-inner-page_&_em]:text-[#8fc7ff] tw:dark:[.page.is-inner-page_&_a]:text-[#8fc7ff] tw:dark:[.page.is-inner-page_&_blockquote_p]:text-[#e5c5a7] tw:dark:[.page.is-inner-page_&_blockquote]:[border-left-color:#d0935f] tw:dark:[.page.is-inner-page_&_blockquote]:[background:rgba(208,_147,_95,_0.12)] tw:dark:[.page.is-inner-page_&_blockquote_strong]:text-[#e0a66c] tw:dark:[.page.is-inner-page_&&&_pre]:border-[rgba(143,_155,_170,_0.3)] tw:dark:[.page.is-inner-page_&&&_pre]:[background:#171c24]">
                          {block.content_type === "image" ? (
                            block.image_id ? (
                              <img
                                className="lesson-image-block-preview-img tw:block tw:max-w-[100%] tw:max-h-[360px] tw:rounded-[14px] tw:object-contain tw:[background:rgba(var(--accent-rgb),_0.06)]"
                                src={getMediaUrl(
                                  currentUserId,
                                  MEDIA_FOLDERS.COURSE_IMAGES,
                                  block.image_id,
                                )}
                                alt="Изображение блока"
                              />
                            ) : (
                              "Блок пока пуст."
                            )
                          ) : (
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={markdownComponents}
                              urlTransform={safeMarkdownUrl}
                            >
                              {blockToMarkdown(block) || "Блок пока пуст."}
                            </ReactMarkdown>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                  {!floatingAiEditor &&
                    isActive &&
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
      {floatingAiEditor && (
        <FloatingWindow
          open={
            Boolean(activeAiBlock) &&
            isAiOpen &&
            activeAiBlock?.content_type !== "video"
          }
          eyebrow="ИИ-редактор блока"
          title={activeAiBlock ? getBlockTitle(activeAiBlock) : ""}
          subtitle="Опишите правку — предложение появится в блоке, его можно применить или отклонить."
          onClose={() => setIsAiOpen(false)}
          storageKey="block-ai-editor"
          defaultSize={{ width: 420, height: 560 }}
        >
          {activeAiBlock
            ? renderAiEditor(activeAiBlock, { floating: true })
            : null}
        </FloatingWindow>
      )}
      <ConfirmDialog
        open={Boolean(blockToDelete)}
        danger
        eyebrow="Удаление блока"
        title="Удалить блок?"
        description={
          blockToDelete
            ? `Блок «${getBlockTitle(blockToDelete)}» пропадёт из урока. Изменение сохранится на сервере только после кнопки «Сохранить».`
            : ""
        }
        confirmLabel="Удалить блок"
        busyLabel="Удаляем..."
        onCancel={() => setBlockToDelete(null)}
        onConfirm={() => {
          if (blockToDelete) deleteBlock(blockToDelete.id);
          setBlockToDelete(null);
        }}
      />
    </div>
  );
}
