import { useParams } from 'react-router-dom';
import { CoursePreview } from './CoursePreview';

export function DragAndDropCoursePreviewPage() {
  const { courseId } = useParams();
  return <CoursePreview key={courseId} courseId={courseId ?? ''} />;
}
