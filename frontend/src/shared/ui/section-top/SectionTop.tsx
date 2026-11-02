import type { ReactNode } from "react";

interface SectionTopProps {
  label?: ReactNode;
  title?: ReactNode;
}

// Повторяемый заголовок секции с номером и заголовком
export function SectionTop({ label, title }: SectionTopProps) {
  return (
    <div className="section-top tw:grid tw:grid-cols-[72px_1fr] tw:gap-[16px] tw:pb-[16px] tw:[.lesson-view_&]:grid-cols-[1fr] tw:[.course-details-view_&]:grid-cols-[1fr] tw:max-760:grid-cols-[1fr] tw:[.creator-view_&]:grid-cols-[1fr] tw:[.profile-view_&]:grid-cols-[1fr] tw:[.courses-tab_&]:grid-cols-[1fr] tw:[.models-page_&]:grid-cols-[1fr] tw:[.organizations-page_&]:grid-cols-[1fr] tw:[.lesson-view_&]:gap-[8px] tw:[.course-details-view_&]:gap-[8px] tw:max-760:gap-[8px] tw:[.creator-view_&]:gap-[8px] tw:[.profile-view_&]:gap-[8px] tw:[.courses-tab_&]:gap-[8px] tw:[.models-page_&]:gap-[8px] tw:[.organizations-page_&]:gap-[8px] tw:[align-items:end] tw:[border-bottom:1px_solid_var(--line-strong)] tw:[.is-course-edit-layout_>_&]:pr-[56px] tw:[.page.is-inner-page_&]:mb-[8px] tw:[.models-page_&]:[align-items:start] tw:[.organizations-page_&]:[align-items:start]">
      <span className="tw:text-(--eyebrow) tw:text-[1rem] tw:[font-family:'Unbounded',_sans-serif] tw:[.page.is-inner-page_.section-top_&]:text-[0.82rem] tw:[.page.is-inner-page_.section-top_&]:tracking-[0.12em] tw:[.organizations-page_.section-top_&]:min-w-[0]">
        {label}
      </span>
      <h2 className="tw:text-[clamp(1.4rem,_2.7vw,_2.2rem)] tw:[font-family:'Unbounded',_sans-serif] tw:[.page.is-inner-page_main_&]:text-[clamp(1.42rem,_2.4vw,_2rem)] tw:[.page.is-inner-page_main_&]:leading-[1.28] tw:[.page.is-inner-page_main_&]:tracking-[-0.016em] tw:[.organizations-page_.section-top_&]:min-w-[0]">
        {title}
      </h2>
    </div>
  );
}
