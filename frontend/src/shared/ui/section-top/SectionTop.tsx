import type { ReactNode } from "react";

interface SectionTopProps {
  label?: ReactNode;
  title?: ReactNode;
}

// Повторяемый заголовок секции с номером и заголовком
export function SectionTop({ label, title }: SectionTopProps) {
  return (
    <div className="section-top">
      <span>{label}</span>
      <h2>{title}</h2>
    </div>
  );
}
