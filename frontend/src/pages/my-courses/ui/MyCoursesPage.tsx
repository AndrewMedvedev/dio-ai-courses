import { useEffect, useState } from 'react';
import { fetchMyCoursesPage, type LearningCourse } from '@/entities/course';
import { CourseCatalog } from '@/widgets/course-catalog';
import { useTrainingStore } from '@/features/create-course-chat';
import { useSessionStore } from '@/entities/session';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '@/shared/lib/errors';

interface MyCoursesPageProps {
  openCourse: (courseId: string) => void;
  openCreator: () => void;
  canCreateCourse: boolean;
  canReadCourse: boolean;
}

export function MyCoursesPage({
  openCourse,
  openCreator,
  canCreateCourse,
  canReadCourse,
}: MyCoursesPageProps) {
  const navigate = useNavigate();
  const owner = useSessionStore((state) => String(state.user?.id || ''));
  const trainingCourse = useTrainingStore((state) => state.courses[owner]);
  const [page, setPage] = useState(1);
  const [courses, setCourses] = useState<LearningCourse[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const pageSize = 6;

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError('');
    void fetchMyCoursesPage(
      { page, size: pageSize },
      { signal: controller.signal },
    )
      .then((response) => {
        if (controller.signal.aborted) return;
        setCourses(response.items);
        setTotalPages(response.total_pages || 1);
        setTotal(response.total);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setCourses([]);
        setError(
          getErrorMessage(cause, 'Не удалось загрузить ваши курсы.') ||
            'Не удалось загрузить ваши курсы.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [page]);

  return (
    <CourseCatalog
      title="Мои курсы"
      intro="Ваши курсы и сохранённый прогресс обучения."
      emptyMessage="Здесь появятся курсы, которые вы создали или к которым присоединились."
      showCreateCta={false}
      coursesData={
        trainingCourse && page === 1
          ? [
              {
                id: 'training-example',
                title: trainingCourse.title,
                difficulty: 'beginner',
                tags: ['python', 'backend'],
                badge: 'Пробный курс',
              },
              ...courses,
            ]
          : courses
      }
      openCourse={(id) => {
        if (id === 'training-example')
          void navigate('/quick-start/training?training=creator&lesson=1');
        else openCourse(id);
      }}
      openCreator={openCreator}
      canCreateCourse={canCreateCourse}
      canReadCourse={canReadCourse}
      isLoading={isLoading}
      error={error}
      page={page}
      pageSize={pageSize}
      totalPages={totalPages}
      totalItems={total}
      onPageChange={setPage}
    />
  );
}
