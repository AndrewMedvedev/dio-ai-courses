import {
  CourseCatalog,
  type CourseCatalogProps,
} from '@/widgets/course-catalog';

export type { CatalogCourse } from '@/widgets/course-catalog';
export type CoursesPageProps = CourseCatalogProps;

export function CoursesPage(props: CoursesPageProps) {
  return <CourseCatalog {...props} />;
}
