import type { SetStateAction } from 'react';
import { usePersistenceScope } from '@/entities/session';
import { useLocalState } from '@/shared/lib/storage';
import {
  stripUiFields,
  type EditorBlockFields,
  type EditorBlockPayload,
  type EditorBlockWithId,
} from './block-editor';

interface BlockReference {
  key: string;
  blockId: string;
  index: number;
  content: EditorBlockPayload;
}

export interface EditorProposal {
  blockId: string;
  block: EditorBlockFields;
  content: string;
}

interface AiEditorDraft {
  target: BlockReference | null;
  input: string;
  open: boolean;
  proposal: {
    target: BlockReference;
    block: EditorBlockFields;
    content: string;
  } | null;
}

function resolveBlock(
  blocks: EditorBlockWithId[],
  reference: BlockReference | null,
): EditorBlockWithId | undefined {
  if (!reference) return undefined;
  const matches = (block: EditorBlockWithId) =>
    JSON.stringify(stripUiFields(block)) === JSON.stringify(reference.content);
  const byId = blocks.find((block) => block.id === reference.blockId);
  if (byId) return matches(byId) ? byId : undefined;
  const atIndex = blocks[reference.index];
  if (atIndex && matches(atIndex)) return atIndex;
  return undefined;
}

export function useAiEditorDraft(
  courseId: string,
  lessonId: string,
  blocks: EditorBlockWithId[],
) {
  const scope = usePersistenceScope();
  const key = `ai-editor-draft:${scope}:${courseId}:${lessonId}`;
  const [draft, setDraft] = useLocalState<AiEditorDraft>(key, {
    target: null,
    input: '',
    open: false,
    proposal: null,
  });
  const activeBlock = resolveBlock(blocks, draft.target);
  const proposalBlock = resolveBlock(blocks, draft.proposal?.target ?? null);

  // UI-id блоков пересоздаются после загрузки: восстанавливаем ссылку по содержимому.
  const setActiveBlockId = (blockId: string, nextBlocks = blocks) => {
    const index = nextBlocks.findIndex((block) => block.id === blockId);
    const target =
      index < 0
        ? null
        : {
            key:
              activeBlock?.id === blockId && draft.target
                ? draft.target.key
                : crypto.randomUUID(),
            blockId,
            index,
            content: stripUiFields(nextBlocks[index]),
          };
    setDraft((current) => ({ ...current, target }));
  };
  const setProposal = (proposal: EditorProposal | null) => {
    const index = proposal
      ? blocks.findIndex((block) => block.id === proposal.blockId)
      : -1;
    setDraft((current) => ({
      ...current,
      proposal:
        proposal && index >= 0
          ? {
              target: {
                key: draft.target?.key || crypto.randomUUID(),
                blockId: blocks[index].id,
                index,
                content: stripUiFields(blocks[index]),
              },
              block: proposal.block,
              content: proposal.content,
            }
          : null,
    }));
  };
  return {
    key,
    activeBlockId: activeBlock?.id || '',
    setActiveBlockId,
    conversationId: draft.target?.key || 'none',
    aiInput: draft.input,
    setAiInput: (value: SetStateAction<string>) =>
      setDraft((current) => ({
        ...current,
        input: typeof value === 'function' ? value(current.input) : value,
      })),
    isAiOpen: draft.open,
    setIsAiOpen: (value: SetStateAction<boolean>) =>
      setDraft((current) => ({
        ...current,
        open: typeof value === 'function' ? value(current.open) : value,
      })),
    proposal:
      draft.proposal && proposalBlock
        ? { ...draft.proposal, blockId: proposalBlock.id }
        : null,
    setProposal,
    hasStaleProposal: Boolean(draft.proposal && !proposalBlock),
    staleProposalContent:
      draft.proposal && !proposalBlock ? draft.proposal.content : '',
  };
}
