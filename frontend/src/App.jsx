import { useEffect, useRef, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import Header from "./components/Header";
import Footer from "./components/Footer";
import Breadcrumbs from "./components/Breadcrumbs";
import ProtectedRoute from "./components/ProtectedRoute";
import HomePage from "./pages/HomePage";
import CoursesPage from "./pages/CoursesPage";
import CoursePage from "./pages/CoursePage";
import CourseViewer from "./components/course/CourseViewer";
import BlockPage from "./pages/BlockPage";
import LessonPage from "./pages/LessonPage";
import PracticePage from "./pages/PracticePage";
import CreatorPage from "./pages/CreatorPage";
import ManualCourseBuilderPage from "./pages/ManualCourseBuilderPage";
import ProfilePage from "./pages/ProfilePage";
import AuthPage from "./pages/AuthPage";
import { points, steps, tracks } from "./utils/data";
import { profileTabItems } from "./utils/platformData";
import { getRouteState } from "./utils/routeState";
import { useTeacherGroups } from "./hooks/useTeacherGroups";
import { buildManualCourse } from "./utils/manualCourseFactory";
import {
  COURSE_PERMISSIONS,
  usePermissionStore,
} from "./stores/permissionStore";
import { useSessionStore } from "./stores/sessionStore";
import {
  fetchCoursesPage,
  getCourse,
  getLessonBasicInfo,
  getModuleBasicInfo,
  isUuid,
  updateCourse as updateCourseApi,
  updateLesson as updateLessonApi,
  updateModule as updateModuleApi,
} from "./utils/api";

const EMPTY_COURSE = {
  id: "",
  title: "Курс не выбран",
  description: "",
  category: "",
  duration: "",
  level: "",
  format: "",
  learningObjectives: [],
  blocks: [],
};

const mergeCourse = (courses, nextCourse) => {
  if (!nextCourse?.id) return courses;
  return courses.some((course) => course.id === nextCourse.id)
    ? courses.map((course) =>
        course.id === nextCourse.id
          ? {
              ...course,
              ...nextCourse,
              blocks: nextCourse.blocks?.length
                ? nextCourse.blocks
                : course.blocks,
            }
          : course,
      )
    : [...courses, nextCourse];
};

const mergeModule = (course, nextModule) => ({
  ...course,
  blocks: (course.blocks || []).map((block) =>
    block.id === nextModule.id
      ? {
          ...block,
          ...nextModule,
          lessons: nextModule.lessons?.length
            ? nextModule.lessons
            : block.lessons,
          practice: block.practice || [],
        }
      : block,
  ),
});

const mergeLesson = (course, nextLesson) => ({
  ...course,
  blocks: (course.blocks || []).map((block) => ({
    ...block,
    lessons: (block.lessons || []).map((lesson) =>
      lesson.id === nextLesson.id ? { ...lesson, ...nextLesson } : lesson,
    ),
  })),
});

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const loadPermissions = usePermissionStore((state) => state.loadPermissions);
  const resetPermissions = usePermissionStore(
    (state) => state.resetPermissions,
  );
  const hasPermission = usePermissionStore((state) => state.hasPermission);
  const arePermissionsLoaded = usePermissionStore((state) => state.isLoaded);
  const accessToken = useSessionStore((state) => state.accessToken);
  const refreshToken = useSessionStore((state) => state.refreshToken);
  const loadIdentity = useSessionStore((state) => state.loadIdentity);
  const loadCurrentUser = useSessionStore((state) => state.loadCurrentUser);
  const [initialRouteState] = useState(() =>
    getRouteState(window.location.pathname),
  );

  const [theme, setTheme] = useState("light");
  const [editableCourses, setEditableCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [coursesError, setCoursesError] = useState("");
  const [coursesPage, setCoursesPage] = useState(1);
  const [coursesPageSize] = useState(9);
  const [coursesTotalPages, setCoursesTotalPages] = useState(1);
  const [coursesTotal, setCoursesTotal] = useState(0);
  const courseRequestRef = useRef(0);
  const moduleRequestRef = useRef(0);
  const lessonRequestRef = useRef(0);
  const [isCourseEditMode, setIsCourseEditMode] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState(
    initialRouteState.courseId,
  );
  const [selectedBlockId, setSelectedBlockId] = useState(
    initialRouteState.blockId,
  );
  const [selectedLessonId, setSelectedLessonId] = useState(
    initialRouteState.lessonId,
  );
  const [selectedPracticeId, setSelectedPracticeId] = useState(
    initialRouteState.practiceId,
  );
  const [activeProfileTab, setActiveProfileTab] = useState("overview");
  const [completedLessons, setCompletedLessons] = useState({});
  const [completedPractices, setCompletedPractices] = useState({});
  const {
    teacherGroups,
    activeTeacherGroup,
    setActiveTeacherGroupId,
    activeTeacherCourse,
    teacherGroupName,
    setTeacherGroupName,
    teacherCourseId,
    setTeacherCourseId,
    teacherStudentName,
    setTeacherStudentName,
    createTeacherGroup,
    addStudentToActiveGroup,
    adjustStudentProgress,
    simulateStudyTick,
    teacherLeaderboard,
  } = useTeacherGroups(editableCourses, "");
  const isAuthenticated = Boolean(accessToken && refreshToken);
  const canReadCourse = true;
  const canUpdateCourse =
    isAuthenticated &&
    arePermissionsLoaded &&
    hasPermission(COURSE_PERMISSIONS.UPDATE);
  const canDeleteCourse =
    isAuthenticated &&
    arePermissionsLoaded &&
    hasPermission(COURSE_PERMISSIONS.DELETE);
  const protectedElement = (element) => (
    <ProtectedRoute>{element}</ProtectedRoute>
  );

  useEffect(() => {
    if (!accessToken || !refreshToken) {
      resetPermissions();
      return;
    }

    loadIdentity();
    loadCurrentUser();
    loadPermissions();
  }, [
    accessToken,
    refreshToken,
    loadIdentity,
    loadCurrentUser,
    loadPermissions,
    resetPermissions,
  ]);

  useEffect(() => {
    if (!canReadCourse) {
      setEditableCourses([]);
      setCoursesError("");
      return undefined;
    }

    const requestId = courseRequestRef.current + 1;
    courseRequestRef.current = requestId;
    const controller = new AbortController();
    setCoursesLoading(true);
    setCoursesError("");

    fetchCoursesPage(
      { page: coursesPage, size: coursesPageSize },
      { signal: controller.signal },
    )
      .then((response) => {
        if (courseRequestRef.current !== requestId) return;
        setEditableCourses(response.items);
        setCoursesTotalPages(response.total_pages || 1);
        setCoursesTotal(response.total || response.items.length);
        if (!selectedCourseId && response.items[0]?.id) {
          setSelectedCourseId(response.items[0].id);
        }
      })
      .catch((error) => {
        if (
          controller.signal.aborted ||
          courseRequestRef.current !== requestId
        ) {
          return;
        }
        setCoursesError(
          error.userMessage || error.message || "Не удалось загрузить курсы.",
        );
        setEditableCourses([]);
        setCoursesTotalPages(1);
        setCoursesTotal(0);
      })
      .finally(() => {
        if (courseRequestRef.current === requestId) {
          setCoursesLoading(false);
        }
      });

    return () => controller.abort();
  }, [canReadCourse, coursesPage, coursesPageSize]);

  useEffect(() => {
    if (!location.pathname.startsWith("/course")) {
      return;
    }

    const routeState = getRouteState(location.pathname, editableCourses);
    setSelectedCourseId(routeState.courseId);
    setSelectedBlockId(routeState.blockId);
    setSelectedLessonId(routeState.lessonId);
    setSelectedPracticeId(routeState.practiceId);
  }, [editableCourses, location.pathname]);

  const selectedCourse =
    editableCourses.find((course) => course.id === selectedCourseId) ||
    editableCourses[0] ||
    EMPTY_COURSE;
  const selectedBlock = (selectedCourse.blocks || []).find(
    (block) => block.id === selectedBlockId,
  ) ||
    selectedCourse.blocks?.[0] || {
      id: "",
      title: "Модуль не выбран",
      lessons: [],
      practice: [],
      learningObjectives: [],
    };
  const selectedLesson = (selectedBlock.lessons || []).find(
    (lesson) => lesson.id === selectedLessonId,
  ) ||
    selectedBlock.lessons?.[0] || {
      id: "",
      title: "Урок не выбран",
      duration: "",
      summary: "",
      content: "",
      markdown: "",
      contentBlocks: [],
    };
  const selectedPractice =
    selectedBlock.practice?.find(
      (practice) => practice.id === selectedPracticeId,
    ) ||
    selectedBlock.practice?.[0] ||
    null;
  const lessonSequence = selectedCourse.blocks.flatMap((block) =>
    block.lessons.map((lesson) => ({
      blockId: block.id,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
    })),
  );
  const currentLessonIndex = lessonSequence.findIndex(
    (item) => item.lessonId === selectedLesson.id,
  );
  const hasPrevLesson = currentLessonIndex > 0;
  const hasNextLesson =
    currentLessonIndex >= 0 && currentLessonIndex < lessonSequence.length - 1;

  const completedLessonsInBlock = selectedBlock.lessons.filter(
    (lesson) => completedLessons[lesson.id],
  ).length;
  const completedPracticesInBlock = (selectedBlock.practice || []).filter(
    (practice) => completedPractices[practice.id],
  ).length;
  const totalItemsInBlock =
    selectedBlock.lessons.length + (selectedBlock.practice || []).length;
  const completedInBlock = completedLessonsInBlock + completedPracticesInBlock;
  const blockProgressPercent = totalItemsInBlock
    ? Math.round((completedInBlock / totalItemsInBlock) * 100)
    : 0;
  const totalLessonsCount = editableCourses.reduce(
    (total, course) =>
      total +
      course.blocks.reduce((sum, block) => sum + block.lessons.length, 0),
    0,
  );
  const totalPracticesCount = editableCourses.reduce(
    (total, course) =>
      total +
      course.blocks.reduce((sum, block) => sum + block.practice.length, 0),
    0,
  );
  const completedLessonsCount =
    Object.values(completedLessons).filter(Boolean).length;
  const completedPracticesCount =
    Object.values(completedPractices).filter(Boolean).length;
  const totalProgressItems = totalLessonsCount + totalPracticesCount;
  const overallProgressPercent = totalProgressItems
    ? Math.round(
        ((completedLessonsCount + completedPracticesCount) /
          totalProgressItems) *
          100,
      )
    : 0;
  const profileActiveCourse = selectedCourse || editableCourses[0];
  const profileActiveCourseTotal = profileActiveCourse.blocks.reduce(
    (total, block) => total + block.lessons.length + block.practice.length,
    0,
  );
  const profileActiveCourseCompleted = profileActiveCourse.blocks.reduce(
    (total, block) =>
      total +
      block.lessons.filter((lesson) => completedLessons[lesson.id]).length +
      block.practice.filter((practice) => completedPractices[practice.id])
        .length,
    0,
  );
  const profileActiveCourseProgress = Math.round(
    (profileActiveCourseCompleted / Math.max(1, profileActiveCourseTotal)) *
      100,
  );

  useEffect(() => {
    if (location.pathname.includes("/edit") && canUpdateCourse) {
      setIsCourseEditMode(true);
    }
  }, [canUpdateCourse, location.pathname]);

  useEffect(() => {
    if (!canUpdateCourse && isCourseEditMode) {
      setIsCourseEditMode(false);
    }
  }, [canUpdateCourse, isCourseEditMode]);
  const profileUpcomingTopics = profileActiveCourse.blocks
    .slice(0, 3)
    .map((block) => block.title);

  const openCourses = () => {
    navigate("/courses");
  };

  const changeCoursesPage = (page) => {
    const nextPage = Math.min(Math.max(1, page), coursesTotalPages || 1);
    setCoursesPage(nextPage);
  };

  const openCreator = () => {
    navigate("/creator");
  };

  const openCourse = async (courseId) => {
    if (!canReadCourse || !courseId) {
      return;
    }

    const requestId = courseRequestRef.current + 1;
    courseRequestRef.current = requestId;
    setCoursesLoading(true);
    setCoursesError("");

    try {
      const nextCourse = await getCourse(courseId);
      if (courseRequestRef.current !== requestId) return;
      setEditableCourses((prev) => mergeCourse(prev, nextCourse));
      setSelectedCourseId(nextCourse.id);
      setSelectedBlockId(nextCourse.blocks?.[0]?.id ?? null);
      setSelectedLessonId(nextCourse.blocks?.[0]?.lessons?.[0]?.id ?? null);
      setSelectedPracticeId(nextCourse.blocks?.[0]?.practice?.[0]?.id ?? null);
      navigate(`/course/${nextCourse.id}`);
    } catch (error) {
      if (courseRequestRef.current === requestId) {
        setCoursesError(
          error.userMessage || error.message || "Не удалось загрузить курс.",
        );
      }
    } finally {
      if (courseRequestRef.current === requestId) {
        setCoursesLoading(false);
      }
    }
  };

  const deleteCourse = (courseId) => {
    if (!canDeleteCourse) {
      return;
    }

    setEditableCourses((prev) =>
      prev.filter((course) => course.id !== courseId),
    );

    if (selectedCourse?.id === courseId) {
      setIsCourseEditMode(false);
      navigate("/courses");
    }
  };

  const openBlock = async (blockId) => {
    if (!blockId || !selectedCourse.id) return;
    const requestId = moduleRequestRef.current + 1;
    moduleRequestRef.current = requestId;
    setCoursesError("");

    const fallbackBlock =
      selectedCourse.blocks.find((block) => block.id === blockId) ||
      selectedCourse.blocks[0];
    setSelectedBlockId(blockId);

    try {
      const loadedBlock = isUuid(blockId)
        ? await getModuleBasicInfo(blockId)
        : fallbackBlock;
      if (moduleRequestRef.current !== requestId) return;
      const nextBlock = loadedBlock || fallbackBlock;
      setEditableCourses((prev) =>
        prev.map((course) =>
          course.id === selectedCourse.id
            ? mergeModule(course, nextBlock)
            : course,
        ),
      );
      setSelectedLessonId(nextBlock.lessons?.[0]?.id ?? null);
      setSelectedPracticeId(nextBlock.practice?.[0]?.id ?? null);
      navigate(`/course/${selectedCourse.id}/block/${nextBlock.id}`);
    } catch (error) {
      if (moduleRequestRef.current === requestId) {
        setCoursesError(
          error.userMessage || error.message || "Не удалось загрузить модуль.",
        );
      }
    }
  };

  const openBlockInEditMode = async (blockId) => {
    await openBlock(blockId);
    navigate(`/course/${selectedCourse.id}/edit/block/${blockId}`);
  };

  const openBlockPage = async (blockId) => {
    await openBlock(blockId);
  };

  const openBlockPageInEditMode = async (blockId) => {
    await openBlock(blockId);
    navigate(`/course/${selectedCourse.id}/edit/block/${blockId}`);
  };

  const openLesson = async (lessonId) => {
    if (!lessonId || !selectedCourse.id) return;
    const requestId = lessonRequestRef.current + 1;
    lessonRequestRef.current = requestId;
    setCoursesError("");

    const nextBlock = selectedCourse.blocks.find((block) =>
      (block.lessons || []).some((lesson) => lesson.id === lessonId),
    );
    if (nextBlock) {
      setSelectedBlockId(nextBlock.id);
      setSelectedPracticeId(nextBlock.practice?.[0]?.id ?? null);
    }
    setSelectedLessonId(lessonId);

    try {
      const loadedLesson = isUuid(lessonId)
        ? await getLessonBasicInfo(lessonId)
        : nextBlock?.lessons.find((lesson) => lesson.id === lessonId);
      if (lessonRequestRef.current !== requestId || !loadedLesson) return;
      setEditableCourses((prev) =>
        prev.map((course) =>
          course.id === selectedCourse.id
            ? mergeLesson(course, loadedLesson)
            : course,
        ),
      );
      navigate(`/course/${selectedCourse.id}/lesson/${lessonId}`);
    } catch (error) {
      if (lessonRequestRef.current === requestId) {
        setCoursesError(
          error.userMessage || error.message || "Не удалось загрузить урок.",
        );
      }
    }
  };

  const openLessonInEditMode = async (lessonId) => {
    await openLesson(lessonId);
    navigate(`/course/${selectedCourse.id}/edit/lesson/${lessonId}`);
  };

  const openLessonBySequenceIndex = (index) => {
    const target = lessonSequence[index];
    if (!target) {
      return;
    }

    openLesson(target.lessonId);
  };

  const openPrevLesson = () => {
    if (!hasPrevLesson) {
      return;
    }
    openLessonBySequenceIndex(currentLessonIndex - 1);
  };

  const openNextLesson = () => {
    if (!hasNextLesson) {
      return;
    }
    openLessonBySequenceIndex(currentLessonIndex + 1);
  };

  const openPractice = (practiceId) => {
    const nextBlock = selectedCourse.blocks.find((block) =>
      (block.practice || []).some((practice) => practice.id === practiceId),
    );
    if (nextBlock) {
      setSelectedBlockId(nextBlock.id);
      setSelectedLessonId(nextBlock.lessons[0]?.id ?? null);
    }
    setSelectedPracticeId(practiceId);
    navigate(`/course/${selectedCourse.id}/practice/${practiceId}`);
  };

  const openPracticeInEditMode = (practiceId) => {
    const nextBlock = selectedCourse.blocks.find((block) =>
      (block.practice || []).some((practice) => practice.id === practiceId),
    );
    if (nextBlock) {
      setSelectedBlockId(nextBlock.id);
      setSelectedLessonId(nextBlock.lessons[0]?.id ?? null);
    }
    setSelectedPracticeId(practiceId);
    navigate(`/course/${selectedCourse.id}/edit/practice/${practiceId}`);
  };

  const openCourseInEditMode = () => {
    navigate(`/course/${selectedCourse.id}/edit`);
  };

  const toggleLessonComplete = (lessonId) => {
    setCompletedLessons((prev) => ({
      ...prev,
      [lessonId]: !prev[lessonId],
    }));
  };

  const togglePracticeComplete = (practiceId) => {
    setCompletedPractices((prev) => ({
      ...prev,
      [practiceId]: !prev[practiceId],
    }));
  };

  const updateCourse = (changes) => {
    if (!canUpdateCourse) {
      return;
    }

    setEditableCourses((prev) =>
      prev.map((course) =>
        course.id === selectedCourse.id ? { ...course, ...changes } : course,
      ),
    );

    if (isUuid(selectedCourse.id)) {
      updateCourseApi(selectedCourse.id, changes)
        .then((savedCourse) => {
          if (savedCourse) {
            setEditableCourses((prev) => mergeCourse(prev, savedCourse));
          }
        })
        .catch((error) => {
          setCoursesError(
            error.userMessage || error.message || "Не удалось сохранить курс.",
          );
        });
    }
  };

  const updateCourseBlock = (blockId, changes) => {
    if (!canUpdateCourse) {
      return;
    }

    setEditableCourses((prev) =>
      prev.map((course) =>
        course.id === selectedCourse.id
          ? {
              ...course,
              blocks: course.blocks.map((block) =>
                block.id === blockId ? { ...block, ...changes } : block,
              ),
            }
          : course,
      ),
    );

    if (isUuid(selectedCourse.id) && isUuid(blockId)) {
      updateModuleApi(selectedCourse.id, blockId, changes)
        .then((savedModule) => {
          if (savedModule) {
            setEditableCourses((prev) =>
              prev.map((course) =>
                course.id === selectedCourse.id
                  ? mergeModule(course, savedModule)
                  : course,
              ),
            );
          }
        })
        .catch((error) => {
          setCoursesError(
            error.userMessage ||
              error.message ||
              "Не удалось сохранить модуль.",
          );
        });
    }
  };

  const insertCourseBlock = (index) => {
    if (!canUpdateCourse) {
      return null;
    }

    const suffix = Date.now().toString(36);
    const blockId = `${selectedCourse.id}-block-${suffix}`;
    const lessonId = `${blockId}-lesson-1`;
    const newBlock = {
      id: blockId,
      title: "Новый блок",
      description: "",
      duration: "2 недели",
      lessons: [
        {
          id: lessonId,
          title: "Новый урок",
          duration: "20 минут",
          summary: "",
          content: "",
          markdown: "Новый текстовый блок.",
          contentBlocks: [
            {
              content_type: "text",
              ai_generated: false,
              md_content: "Новый текстовый блок.",
            },
          ],
        },
      ],
      practice: [],
    };

    setEditableCourses((prev) =>
      prev.map((course) => {
        if (course.id !== selectedCourse.id) {
          return course;
        }

        const safeIndex = Math.min(Math.max(index, 0), course.blocks.length);
        return {
          ...course,
          blocks: [
            ...course.blocks.slice(0, safeIndex),
            newBlock,
            ...course.blocks.slice(safeIndex),
          ],
        };
      }),
    );

    return blockId;
  };

  const updateLesson = (lessonId, changes) => {
    if (!canUpdateCourse) {
      return;
    }

    setEditableCourses((prev) =>
      prev.map((course) =>
        course.id === selectedCourse.id
          ? {
              ...course,
              blocks: course.blocks.map((block) => ({
                ...block,
                lessons: block.lessons.map((lesson) =>
                  lesson.id === lessonId ? { ...lesson, ...changes } : lesson,
                ),
              })),
            }
          : course,
      ),
    );

    if (isUuid(selectedCourse.id) && isUuid(lessonId)) {
      updateLessonApi(selectedCourse.id, lessonId, changes)
        .then((savedLesson) => {
          if (savedLesson) {
            setEditableCourses((prev) =>
              prev.map((course) =>
                course.id === selectedCourse.id
                  ? mergeLesson(course, savedLesson)
                  : course,
              ),
            );
          }
        })
        .catch((error) => {
          setCoursesError(
            error.userMessage || error.message || "Не удалось сохранить урок.",
          );
        });
    }
  };

  const updatePractice = (practiceId, changes) => {
    if (!canUpdateCourse) {
      return;
    }

    setEditableCourses((prev) =>
      prev.map((course) =>
        course.id === selectedCourse.id
          ? {
              ...course,
              blocks: course.blocks.map((block) => ({
                ...block,
                practice: block.practice.map((practice) =>
                  practice.id === practiceId
                    ? { ...practice, ...changes }
                    : practice,
                ),
              })),
            }
          : course,
      ),
    );
  };

  const moveItem = (items, itemId, direction) => {
    const currentIndex = items.findIndex((item) => item.id === itemId);
    const nextIndex = currentIndex + direction;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= items.length) {
      return items;
    }

    const nextItems = [...items];
    [nextItems[currentIndex], nextItems[nextIndex]] = [
      nextItems[nextIndex],
      nextItems[currentIndex],
    ];
    return nextItems;
  };

  const moveBlock = (blockId, direction) => {
    if (!canUpdateCourse) {
      return;
    }

    setEditableCourses((prev) =>
      prev.map((course) =>
        course.id === selectedCourse.id
          ? { ...course, blocks: moveItem(course.blocks, blockId, direction) }
          : course,
      ),
    );
  };

  const moveLesson = (blockId, lessonId, direction) => {
    if (!canUpdateCourse) {
      return;
    }

    setEditableCourses((prev) =>
      prev.map((course) =>
        course.id === selectedCourse.id
          ? {
              ...course,
              blocks: course.blocks.map((block) =>
                block.id === blockId
                  ? {
                      ...block,
                      lessons: moveItem(block.lessons, lessonId, direction),
                    }
                  : block,
              ),
            }
          : course,
      ),
    );
  };

  const movePractice = (blockId, practiceId, direction) => {
    if (!canUpdateCourse) {
      return;
    }

    setEditableCourses((prev) =>
      prev.map((course) =>
        course.id === selectedCourse.id
          ? {
              ...course,
              blocks: course.blocks.map((block) =>
                block.id === blockId
                  ? {
                      ...block,
                      practice: moveItem(block.practice, practiceId, direction),
                    }
                  : block,
              ),
            }
          : course,
      ),
    );
  };

  const deleteBlock = (blockId) => {
    if (!canUpdateCourse) {
      return;
    }

    const remainingBlocks = selectedCourse.blocks.filter(
      (block) => block.id !== blockId,
    );

    if (remainingBlocks.length === 0) {
      return;
    }

    setEditableCourses((prev) =>
      prev.map((course) =>
        course.id === selectedCourse.id
          ? { ...course, blocks: remainingBlocks }
          : course,
      ),
    );

    if (selectedBlock.id === blockId) {
      navigate(`/course/${selectedCourse.id}`);
    }
  };

  const deleteLesson = (blockId, lessonId) => {
    if (!canUpdateCourse) {
      return;
    }

    const block = selectedCourse.blocks.find((item) => item.id === blockId);

    if (!block || block.lessons.length <= 1) {
      return;
    }

    setEditableCourses((prev) =>
      prev.map((course) =>
        course.id === selectedCourse.id
          ? {
              ...course,
              blocks: course.blocks.map((item) =>
                item.id === blockId
                  ? {
                      ...item,
                      lessons: item.lessons.filter(
                        (lesson) => lesson.id !== lessonId,
                      ),
                    }
                  : item,
              ),
            }
          : course,
      ),
    );

    if (selectedLesson.id === lessonId) {
      navigate(`/course/${selectedCourse.id}/block/${blockId}`);
    }
  };

  const deletePractice = (blockId, practiceId) => {
    if (!canUpdateCourse) {
      return;
    }

    const block = selectedCourse.blocks.find((item) => item.id === blockId);

    if (!block || (block.practice || []).length <= 1) {
      return;
    }

    setEditableCourses((prev) =>
      prev.map((course) =>
        course.id === selectedCourse.id
          ? {
              ...course,
              blocks: course.blocks.map((item) =>
                item.id === blockId
                  ? {
                      ...item,
                      practice: (item.practice || []).filter(
                        (practice) => practice.id !== practiceId,
                      ),
                    }
                  : item,
              ),
            }
          : course,
      ),
    );

    if (selectedPractice?.id === practiceId) {
      navigate(`/course/${selectedCourse.id}/block/${blockId}`);
    }
  };

  const createManualCourse = async ({ title, modules, lessons, blocks }) => {
    const courseId = `manual-course-${Date.now()}`;
    const nextCourse = buildManualCourse({
      title,
      modules,
      lessons,
      blocks,
      courseId,
    });

    const applyCourse = (course) => {
      setEditableCourses((prev) => [...prev, course]);
      setSelectedCourseId(course.id);
      setSelectedBlockId(course.blocks[0].id);
      setSelectedLessonId(course.blocks[0].lessons[0].id);
      setSelectedPracticeId(course.blocks[0].practice[0]?.id ?? null);
      setIsCourseEditMode(true);
      navigate(`/course/${course.id}`);
    };

    applyCourse(nextCourse);
  };

  return (
    <div
      className={`page ${location.pathname === "/" ? "is-home-page" : "is-inner-page"}`}
      data-theme={theme}
    >
      <div className="aim-grid" aria-hidden="true">
        <div className="aim-grid-plane" />
      </div>
      <svg
        className="liquid-filter-defs"
        xmlns="http://www.w3.org/2000/svg"
        width="0"
        height="0"
        aria-hidden="true"
      >
        <defs>
          <filter
            id="glass-distortion"
            x="0%"
            y="0%"
            width="100%"
            height="100%"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.008 0.008"
              numOctaves="2"
              seed="92"
              result="noise"
            />
            <feGaussianBlur in="noise" stdDeviation="2" result="blurred" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="blurred"
              scale="77"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      <Header
        theme={theme}
        toggleTheme={() =>
          setTheme((prev) => (prev === "light" ? "dark" : "light"))
        }
      />

      <main>
        {!arePermissionsLoaded ? (
          <section className="container section">
            <article className="glass-card">
              <p className="course-details-text">
                Настраиваем доступный функционал...
              </p>
            </article>
          </section>
        ) : (
          <>
            <Breadcrumbs
              selectedCourse={selectedCourse}
              selectedBlock={selectedBlock}
              selectedLesson={selectedLesson}
              selectedPractice={selectedPractice}
            />
            <Routes>
              <Route
                path="/"
                element={
                  <HomePage
                    tracks={tracks}
                    points={points}
                    steps={steps}
                    openCreator={openCreator}
                    openCourses={openCourses}
                  />
                }
              />
              <Route
                path="/courses"
                element={
                  <CoursesPage
                    coursesData={editableCourses}
                    completedLessons={completedLessons}
                    completedPractices={completedPractices}
                    openCourse={openCourse}
                    openCreator={openCreator}
                    deleteCourse={deleteCourse}
                    canReadCourse={canReadCourse}
                    canDeleteCourse={canDeleteCourse}
                    isLoading={coursesLoading}
                    error={coursesError}
                    page={coursesPage}
                    pageSize={coursesPageSize}
                    totalPages={coursesTotalPages}
                    totalItems={coursesTotal}
                    onPageChange={changeCoursesPage}
                  />
                }
              />

              <Route element={<ProtectedRoute />}>
                <Route
                  path="/course/:courseId/edit"
                  element={
                    <CoursePage
                      selectedCourse={selectedCourse}
                      selectedCourseLeaderboard={[]}
                      completedLessons={completedLessons}
                      completedPractices={completedPractices}
                      openCourses={openCourses}
                      openBlock={openBlockInEditMode}
                      openLesson={openLessonInEditMode}
                      openPractice={openPracticeInEditMode}
                      isCourseEditMode={isCourseEditMode}
                      setIsCourseEditMode={setIsCourseEditMode}
                      canReadCourse={canReadCourse}
                      canUpdateCourse={canUpdateCourse}
                      canDeleteCourse={canDeleteCourse}
                      deleteCourse={deleteCourse}
                      updateCourse={updateCourse}
                      updateCourseBlock={updateCourseBlock}
                      insertCourseBlock={insertCourseBlock}
                      moveBlock={moveBlock}
                      deleteBlock={deleteBlock}
                    />
                  }
                />
                <Route
                  path="/course/:courseId/edit/block/:blockId"
                  element={
                    <BlockPage
                      selectedCourse={selectedCourse}
                      selectedBlock={selectedBlock}
                      completedLessons={completedLessons}
                      completedPractices={completedPractices}
                      openCourse={openCourseInEditMode}
                      openLesson={openLessonInEditMode}
                      openPractice={openPracticeInEditMode}
                      isCourseEditMode={isCourseEditMode}
                      updateCourseBlock={updateCourseBlock}
                      updateLesson={updateLesson}
                      updatePractice={updatePractice}
                      moveLesson={moveLesson}
                      movePractice={movePractice}
                      deleteLesson={deleteLesson}
                      deletePractice={deletePractice}
                    />
                  }
                />
                <Route
                  path="/course/:courseId/edit/lesson/:lessonId"
                  element={
                    <LessonPage
                      selectedCourse={selectedCourse}
                      selectedBlock={selectedBlock}
                      selectedLesson={selectedLesson}
                      completedLessons={completedLessons}
                      completedPractices={completedPractices}
                      openBlock={openBlockInEditMode}
                      openBlockPage={openBlockPageInEditMode}
                      openLesson={openLessonInEditMode}
                      openPractice={openPracticeInEditMode}
                      isCourseEditMode={isCourseEditMode}
                      updateLesson={updateLesson}
                    />
                  }
                />
                <Route
                  path="/course/:courseId/edit/practice/:practiceId"
                  element={
                    <PracticePage
                      selectedCourse={selectedCourse}
                      selectedBlock={selectedBlock}
                      selectedPractice={selectedPractice}
                      completedLessons={completedLessons}
                      completedPractices={completedPractices}
                      togglePracticeComplete={togglePracticeComplete}
                      openBlock={openBlockInEditMode}
                      openBlockPage={openBlockPageInEditMode}
                      openLesson={openLessonInEditMode}
                      openPractice={openPracticeInEditMode}
                      isCourseEditMode={isCourseEditMode}
                      updatePractice={updatePractice}
                    />
                  }
                />
              </Route>
              <Route path="/login" element={<AuthPage mode="login" />} />
              <Route path="/register" element={<AuthPage mode="register" />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/course/:courseId" element={<CourseViewer />} />
                <Route
                  path="/course/:courseId/block/:blockId"
                  element={<CourseViewer />}
                />
                <Route
                  path="/course/:courseId/lesson/:lessonId"
                  element={<CourseViewer />}
                />
                <Route
                  path="/course/:courseId/practice/:practiceId"
                  element={<CourseViewer />}
                />
                <Route path="/creator" element={<CreatorPage />} />
                <Route
                  path="/manual-course-builder"
                  element={
                    <ManualCourseBuilderPage
                      onCreateCourse={createManualCourse}
                    />
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <ProfilePage
                      profileTabItems={profileTabItems}
                      activeProfileTab={activeProfileTab}
                      setActiveProfileTab={setActiveProfileTab}
                      profileActiveCourse={profileActiveCourse}
                      profileActiveCourseProgress={profileActiveCourseProgress}
                      profileActiveCourseTotal={profileActiveCourseTotal}
                      profileActiveCourseCompleted={
                        profileActiveCourseCompleted
                      }
                      profileUpcomingTopics={profileUpcomingTopics}
                      completedLessonsCount={completedLessonsCount}
                      completedPracticesCount={completedPracticesCount}
                      overallProgressPercent={overallProgressPercent}
                      totalContentCount={
                        totalLessonsCount + totalPracticesCount
                      }
                      coursesData={editableCourses}
                      openCourse={openCourse}
                      openBlock={openBlock}
                      teacherGroups={teacherGroups}
                      activeTeacherGroup={activeTeacherGroup}
                      setActiveTeacherGroupId={setActiveTeacherGroupId}
                      activeTeacherCourse={activeTeacherCourse}
                      teacherGroupName={teacherGroupName}
                      setTeacherGroupName={setTeacherGroupName}
                      teacherCourseId={teacherCourseId}
                      setTeacherCourseId={setTeacherCourseId}
                      teacherStudentName={teacherStudentName}
                      setTeacherStudentName={setTeacherStudentName}
                      createTeacherGroup={createTeacherGroup}
                      addStudentToActiveGroup={addStudentToActiveGroup}
                      adjustStudentProgress={adjustStudentProgress}
                      simulateStudyTick={simulateStudyTick}
                      teacherLeaderboard={teacherLeaderboard}
                      openCreator={openCreator}
                    />
                  }
                />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
