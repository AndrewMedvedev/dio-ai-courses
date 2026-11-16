// Страница генерации курса с интерактивным чатом
import {
  CreatorChatView,
  CreatorTrainingView,
} from '@/features/create-course-chat';
import { useSearchParams } from 'react-router-dom';

export function CreatorPage() {
  const [search] = useSearchParams();
  const training = search.get('training') === 'creator';
  return (
    <section
      className="container section creator-view tw:relative tw:z-[1] tw:w-[min(1360px,_96vw)] tw:max-w-[100%] tw:mt-[8px] tw:m-[0_auto] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)]"
      id="creator-tab"
    >
      <h1 className="tw:sr-only">Создание курса</h1>
      {training ? <CreatorTrainingView /> : <CreatorChatView />}
    </section>
  );
}
