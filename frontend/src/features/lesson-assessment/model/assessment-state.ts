import { create } from 'zustand';
import { usePersistenceScope } from '@/entities/session';
import { useLocalState } from '@/shared/lib/storage';
import type {
  AssessmentResult,
  LessonTest,
  PracticeAssignment,
  TestAnswers,
} from './types';

type Operation = 'generate' | 'check';
interface AssessmentState {
  test: LessonTest | null;
  assignment: PracticeAssignment | null;
  practiceId: string | null;
  answers: TestAnswers;
  questionIndex: number;
  solution: string;
  entryMode: 'text' | 'file' | null;
  result: AssessmentResult | null;
  operation: Operation | null;
  error: string;
}
const EMPTY: AssessmentState = {
  test: null,
  assignment: null,
  practiceId: null,
  answers: {},
  questionIndex: 0,
  solution: '',
  entryMode: null,
  result: null,
  operation: null,
  error: '',
};
const usePendingAssessments = create<{
  operations: Record<string, Operation | undefined>;
}>(() => ({ operations: {} }));

export function useAssessmentState(
  kind: 'test' | 'practice',
  moduleId?: string,
  lessonId?: string,
) {
  const scope = usePersistenceScope();
  const key = `lesson-assessment:${scope}:${moduleId}:${lessonId}:${kind}:v1`;
  const [state, setState] = useLocalState(key, EMPTY);
  const pending = usePendingAssessments((value) => value.operations[key]);
  const setField = <K extends keyof AssessmentState>(
    field: K,
    value:
      | AssessmentState[K]
      | ((previous: AssessmentState[K]) => AssessmentState[K]),
  ) => {
    setState((previous) => ({
      ...previous,
      [field]: typeof value === 'function' ? value(previous[field]) : value,
    }));
  };
  const start = (operation: Operation) => {
    if (usePendingAssessments.getState().operations[key]) return false;
    usePendingAssessments.setState((previous) => ({
      operations: { ...previous.operations, [key]: operation },
    }));
    setState((previous) => ({ ...previous, operation, error: '' }));
    return true;
  };
  const finish = () => {
    setField('operation', null);
    usePendingAssessments.setState((previous) => ({
      operations: { ...previous.operations, [key]: undefined },
    }));
  };
  return {
    state,
    setField,
    key,
    start,
    finish,
    isLoading: pending === 'generate',
    isChecking: pending === 'check',
    error:
      state.error ||
      (state.operation && !pending
        ? 'Страница была обновлена во время запроса. Результат не получен; запрос автоматически не повторяется.'
        : ''),
  };
}
