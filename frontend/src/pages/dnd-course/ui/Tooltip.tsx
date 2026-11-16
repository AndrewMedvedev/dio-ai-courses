import { TooltipLayer } from '@/shared/ui/tooltip-layer';

export function DndTooltipLayer() {
  return (
    <TooltipLayer
      scope=".dnd-builder"
      placement="vertical"
      className="dnd-tooltip"
    />
  );
}
