import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export const CHAT_DOCK_EVENT = 'ai-chat-panel:layout';

/** Reserve room for the panel while keeping at least 480px of readable content. */
export function useChatDockSpace() {
  const workspaceRef = useRef<HTMLElement>(null);
  const [panelWidth, setPanelWidth] = useState(0);
  const [reservedWidth, setReservedWidth] = useState(0);
  useLayoutEffect(() => {
    let activePanel = '';
    const onLayout = (event: Event) => {
      const { id, width } = (
        event as CustomEvent<{ id: string; width: number }>
      ).detail;
      if (width > 0) activePanel = id;
      if (id === activePanel) setPanelWidth(width);
    };
    window.addEventListener(CHAT_DOCK_EVENT, onLayout);
    return () => window.removeEventListener(CHAT_DOCK_EVENT, onLayout);
  }, []);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const measure = () => {
      const bounds = workspace.getBoundingClientRect();
      const tree = workspace.querySelector<HTMLElement>(
        '.course-nav-tree, .course-contents-toggle',
      );
      const columns = tree?.parentElement
        ? getComputedStyle(tree.parentElement).gridTemplateColumns
        : 'none';
      const treeWidth =
        tree && columns !== 'none' && columns.split(' ').length > 1
          ? tree.getBoundingClientRect().width + 24
          : 0;
      const padding = parseFloat(getComputedStyle(workspace).paddingLeft) * 2;
      const capacity = Math.max(0, bounds.width - padding - treeWidth - 480);
      const overlap = Math.max(
        0,
        panelWidth - (window.innerWidth - bounds.right),
      );
      setReservedWidth(Math.round(Math.min(capacity, overlap)));
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(workspace);
    const mutations = new MutationObserver(measure);
    mutations.observe(workspace, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    window.addEventListener('resize', measure);
    return () => {
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [panelWidth]);

  return { workspaceRef, reservedWidth };
}
