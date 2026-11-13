import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TrainingRecord {
  title: string;
  answers: string[];
  completed: boolean;
}
interface TrainingState {
  courses: Record<string, TrainingRecord>;
  save: (owner: string, answers: string[]) => void;
  complete: (owner: string) => void;
}
export const useTrainingStore = create<TrainingState>()(
  persist(
    (set) => ({
      courses: {},
      save: (owner, answers) =>
        set((state) => ({
          courses: {
            ...state.courses,
            [owner]: {
              title: answers[0] || 'Основы Python для начинающих',
              answers,
              completed: false,
            },
          },
        })),
      complete: (owner) =>
        set((state) => {
          const course = state.courses[owner];
          return course
            ? {
                courses: {
                  ...state.courses,
                  [owner]: { ...course, completed: true },
                },
              }
            : state;
        }),
    }),
    {
      name: 'aicolab-training-course-v1',
      partialize: (state) => ({ courses: state.courses }),
    },
  ),
);
