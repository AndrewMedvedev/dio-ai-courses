// Страница генерации курса с интерактивным чатом
import { SectionTop } from "@/shared/ui/section-top";
import { CreatorChatView } from "@/features/create-course-chat";

export function CreatorPage() {
  return (
    <section
      className="container section creator-view tw:relative tw:z-[1] tw:w-[min(1360px,_96vw)] tw:max-w-[100%] tw:mt-[8px] tw:m-[0_auto] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)]"
      id="creator-tab"
    >
      <SectionTop label="Создание" title="Создание курса" />
      <CreatorChatView />
    </section>
  );
}
