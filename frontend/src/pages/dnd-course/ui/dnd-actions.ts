import { createContext, useContext } from 'react';

import type { XY } from '../model/types';

export interface PickFilesOptions {
  position?: XY | null;
  attachToLessonId?: string | null;
  replaceMaterialId?: string;
}

/** Действия страницы, которые нужны узлам холста, списку и инспектору. */
export interface DndActionsValue {
  pickFiles: (options?: PickFilesOptions) => void;
  requestDelete: (id: string) => void;
  previewLesson: (lessonId: string) => void;
}

export const DndActionsContext = createContext<DndActionsValue>({
  pickFiles: () => {},
  requestDelete: () => {},
  previewLesson: () => {},
});

export const useDndActions = () => useContext(DndActionsContext);
