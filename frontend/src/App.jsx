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
import OrganizationsPage from "./pages/OrganizationsPage";
import ModelsPage from "./pages/ModelsPage";
import AuthPage from "./pages/AuthPage";
import { points, steps, tracks } from "./utils/data";
import { profileTabItems } from "./utils/platformData";
import { getErrorMessage } from "./utils/errors";
import { getRouteState } from "./utils/routeState";
import { useRouteScrollRestoration } from "./hooks/useRouteScrollRestoration";
import { useTeacherGroups } from "./hooks/useTeacherGroups";
import {
  COURSE_PERMISSIONS,
  ORGANIZATION_PERMISSIONS,
  usePermissionStore,
} from "./stores/permissionStore";
import { useSessionStore } from "./stores/sessionStore";
import { resolveTheme, useThemeStore } from "./stores/themeStore";
import { useUiLayoutStore } from "./stores/uiLayoutStore";
import {
  archiveCourse as archiveCourseApi,
  fetchCoursesPage,
  getCourse,
  getLessonBasicInfo,
  getModuleBasicInfo,
  isUuid,
  publishCourse as publishCourseApi,
  setCourseInviteOnly as setCourseInviteOnlyApi,
  updateCourse as updateCourseApi,
  updateLesson as updateLessonApi,
  updateModule as updateModuleApi,
} from "./utils/api";
import {
  createEmptyCourseBlock,
  getSelectedBlock,
  getSelectedCourse,
  getSelectedLesson,
  getSelectedPractice,
  mergeCourse,
  mergeCoursePage,
  mergeLesson,
  mergeModule,
  moveItem,
} from "./course/courseState";
import {
  getBlockProgress,
  getCourseProgress,
  getLessonSequence,
  getOverallProgress,
} from "./course/courseProgress";
import { useAppPermissions } from "./hooks/useAppPermissions";

function getCourseRouteTarget(pathname) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "course") return { type: "", id: "" };

  const contentTypeIndex = segments[2] === "edit" ? 3 : 2;
  const contentIdIndex = segments[2] === "edit" ? 4 : 3;
  return {
    type: segments[contentTypeIndex] || "course",
    id: segments[contentIdIndex] || "",
  };
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const setPermissionsFromIdentity = usePermissionStore(
    (state) => state.setPermissionsFromIdentity,
  );
  const resetPermissions = usePermissionStore(
    (state) => state.resetPermissions,
  );
  const {
    accessToken,
    refreshToken,
    arePermissionsLoaded,
    canCreateCourse,
    canReadCourse,
    canOpenCourse,
    canBrowseCourses,
    canViewCourseInfo,
    canUpdateCourse,
    canDeleteCourse,
    canCreateOrganization,
    canReadOrganization,
    canReadOwnOrganization,
    canUpdateOrganization,
    canDeleteOrganization,
    canManageOrganizations,
    canCreateModel,
    canDeleteModel,
    canManageModels,
  } = useAppPermissions();
  const loadIdentity = useSessionStore((state) => state.loadIdentity);
  const loadCurrentUser = useSessionStore((state) => state.loadCurrentUser);
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const activeProfileTab = useUiLayoutStore((state) => state.activeProfileTab);
  const setActiveProfileTab = useUiLayoutStore(
    (state) => state.setActiveProfileTab,
  );
  const coursesPage = useUiLayoutStore((state) => state.coursesPage);
  const setCoursesPage = useUiLayoutStore((state) => state.setCoursesPage);
  const [initialRouteState] = useState(() =>
    getRouteState(window.location.pathname),
  );

  const resolvedTheme = resolveTheme(theme);
  const [editableCourses, setEditableCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [coursesError, setCoursesError] = useState("");
  const [coursesPageSize] = useState(9);
  const [coursesTotalPages, setCoursesTotalPages] = useState(1);
  const [coursesTotal, setCoursesTotal] = useState(0);
  const coursesPageRequestRef = useRef(0);
  const courseRequestRef = useRef(0);
  const loadedCourseDetailsRef = useRef(new Set());
  const moduleRequestRef = useRef(0);
  const loadedModuleDetailsRef = useRef(new Set());
  const lessonRequestRef = useRef(0);
  const loadedLessonDetailsRef = useRef(new Set());
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
  const [completedLessons, setCompletedLessons] = useState({});
  const [completedPractices, setCompletedPractices] = useState({});
  const {
    teacherGroups,
    activeTeacherGroup,
    setActiveTeacherGroupId,
    teacherLeaderboard,
  } = useTeacherGroups(editableCourses, "");

  useRouteScrollRestoration();

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    if (!accessToken || !refreshToken) {
      resetPermissions();
      return;
    }

    loadIdentity().then((identity) => {
      setPermissionsFromIdentity(identity);
    });
    loadCurrentUser();
  }, [
    accessToken,
    refreshToken,
    loadIdentity,
    loadCurrentUser,
    resetPermissions,
    setPermissionsFromIdentity,
  ]);

  useEffect(() => {
    if (!canBrowseCourses) {
      setEditableCourses([]);
      setCoursesError("");
      return undefined;
    }

    const requestId = coursesPageRequestRef.current + 1;
    coursesPageRequestRef.current = requestId;
    const controller = new AbortController();
    setCoursesLoading(true);
    setCoursesError("");

    fetchCoursesPage(
      { page: coursesPage, size: coursesPageSize },
      { signal: controller.signal },
    )
      .then((response) => {
        if (coursesPageRequestRef.current !== requestId) return;
        setEditableCourses((prev) => mergeCoursePage(prev, response.items));
        setCoursesTotalPages(response.total_pages || 1);
        setCoursesTotal(response.total || response.items.length);
        if (!selectedCourseId && response.items[0]?.id) {
          setSelectedCourseId(response.items[0].id);
        }
      })
      .catch((error) => {
        if (
          controller.signal.aborted ||
          coursesPageRequestRef.current !== requestId
        ) {
          return;
        }
        setCoursesError(getErrorMessage(error, "Не удалось загрузить курсы."));
        setEditableCourses([]);
        setCoursesTotalPages(1);
        setCoursesTotal(0);
      })
      .finally(() => {
        if (coursesPageRequestRef.current === requestId) {
          setCoursesLoading(false);
        }
      });

    return () => controller.abort();
  }, [canBrowseCourses, coursesPage, coursesPageSize]);

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

  useEffect(() => {
    const courseFromState = editableCourses.find(
      (course) => course.id === selectedCourseId,
    );
    const hasLoadedBlocks = Boolean(courseFromState?.blocks?.length);

    if (
      !canViewCourseInfo ||
      !selectedCourseId ||
      hasLoadedBlocks ||
      loadedCourseDetailsRef.current.has(selectedCourseId)
    ) {
      return;
    }

    loadedCourseDetailsRef.current.add(selectedCourseId);
    const requestId = courseRequestRef.current + 1;
    courseRequestRef.current = requestId;
    setCoursesLoading(true);
    setCoursesError("");

    getCourse(selectedCourseId)
      .then((nextCourse) => {
        if (courseRequestRef.current !== requestId) return;
        setEditableCourses((prev) => mergeCourse(prev, nextCourse));
      })
      .catch((error) => {
        if (courseRequestRef.current === requestId) {
          setCoursesError(getErrorMessage(error, "Не удалось загрузить курс."));
        }
      })
      .finally(() => {
        if (courseRequestRef.current === requestId) {
          setCoursesLoading(false);
        }
      });
  }, [canViewCourseInfo, editableCourses, selectedCourseId]);

  const selectedCourse = getSelectedCourse(editableCourses, selectedCourseId);
  const selectedBlock = getSelectedBlock(selectedCourse, selectedBlockId);
  const selectedLesson = getSelectedLesson(selectedBlock, selectedLessonId);
  const selectedPractice = getSelectedPractice(
    selectedBlock,
    selectedPracticeId,
  );

  useEffect(() => {
    if (!canViewCourseInfo || !selectedCourse.id) {
      return;
    }

    const target = getCourseRouteTarget(location.pathname);

    if (target.type === "block" && target.id) {
      const block = selectedCourse.blocks.find((item) => item.id === target.id);
      const shouldLoadBlock =
        block &&
        isUuid(block.id) &&
        !block.lessons?.length &&
        !loadedModuleDetailsRef.current.has(block.id);

      if (!shouldLoadBlock) return;

      loadedModuleDetailsRef.current.add(block.id);
      const requestId = moduleRequestRef.current + 1;
      moduleRequestRef.current = requestId;
      setCoursesError("");

      getModuleBasicInfo(block.id)
        .then((loadedBlock) => {
          if (moduleRequestRef.current !== requestId) return;
          setEditableCourses((prev) =>
            prev.map((course) =>
              course.id === selectedCourse.id
                ? mergeModule(course, loadedBlock)
                : course,
            ),
          );
          setSelectedBlockId(loadedBlock.id);
          setSelectedLessonId(loadedBlock.lessons?.[0]?.id ?? null);
          setSelectedPracticeId(loadedBlock.practice?.[0]?.id ?? null);
        })
        .catch((error) => {
          if (moduleRequestRef.current === requestId) {
            setCoursesError(
              getErrorMessage(error, "Не удалось загрузить уроки модуля."),
            );
          }
        });
    }

    if (target.type === "lesson" && target.id) {
      const blockWithLesson = selectedCourse.blocks.find((block) =>
        (block.lessons || []).some((lesson) => lesson.id === target.id),
      );

      if (blockWithLesson) {
        if (selectedBlockId !== blockWithLesson.id) {
          setSelectedBlockId(blockWithLesson.id);
        }
        if (selectedLessonId !== target.id) {
          setSelectedLessonId(target.id);
        }
        return;
      }

      const modulesToLoad = selectedCourse.blocks.filter(
        (block) =>
          isUuid(block.id) &&
          !block.lessons?.length &&
          !loadedModuleDetailsRef.current.has(block.id),
      );

      if (modulesToLoad.length === 0) return;

      modulesToLoad.forEach((block) =>
        loadedModuleDetailsRef.current.add(block.id),
      );
      const requestId = moduleRequestRef.current + 1;
      moduleRequestRef.current = requestId;
      setCoursesError("");

      Promise.all(modulesToLoad.map((block) => getModuleBasicInfo(block.id)))
        .then((loadedBlocks) => {
          if (moduleRequestRef.current !== requestId) return;
          setEditableCourses((prev) =>
            prev.map((course) => {
              if (course.id !== selectedCourse.id) return course;
              return loadedBlocks.reduce(
                (nextCourse, loadedBlock) =>
                  mergeModule(nextCourse, loadedBlock),
                course,
              );
            }),
          );

          const parentBlock = loadedBlocks.find((block) =>
            (block.lessons || []).some((lesson) => lesson.id === target.id),
          );
          if (parentBlock) {
            setSelectedBlockId(parentBlock.id);
            setSelectedLessonId(target.id);
            setSelectedPracticeId(parentBlock.practice?.[0]?.id ?? null);
          }
        })
        .catch((error) => {
          if (moduleRequestRef.current === requestId) {
            setCoursesError(
              getErrorMessage(error, "Не удалось загрузить уроки модулей."),
            );
          }
        });
    }
  }, [
    canViewCourseInfo,
    location.pathname,
    selectedBlockId,
    selectedCourse,
    selectedLessonId,
  ]);

  useEffect(() => {
    if (!canViewCourseInfo || !selectedCourse.id || !selectedLessonId) {
      return;
    }

    const lesson = selectedCourse.blocks
      .flatMap((block) => block.lessons || [])
      .find((item) => item.id === selectedLessonId);
    const shouldLoadLesson =
      lesson &&
      isUuid(lesson.id) &&
      !loadedLessonDetailsRef.current.has(lesson.id) &&
      !lesson.contentBlocks?.length &&
      !lesson.content_blocks?.length &&
      !lesson.markdown &&
      !lesson.content;

    if (!shouldLoadLesson) return;

    loadedLessonDetailsRef.current.add(lesson.id);
    const requestId = lessonRequestRef.current + 1;
    lessonRequestRef.current = requestId;
    setCoursesError("");

    getLessonBasicInfo(lesson.id)
      .then((loadedLesson) => {
        if (lessonRequestRef.current !== requestId || !loadedLesson) return;
        setEditableCourses((prev) =>
          prev.map((course) =>
            course.id === selectedCourse.id
              ? mergeLesson(course, loadedLesson)
              : course,
          ),
        );
      })
      .catch((error) => {
        if (lessonRequestRef.current === requestId) {
          setCoursesError(getErrorMessage(error, "Не удалось загрузить урок."));
        }
      });
  }, [canViewCourseInfo, selectedCourse, selectedLessonId]);

  const lessonSequence = getLessonSequence(selectedCourse);
  const currentLessonIndex = lessonSequence.findIndex(
    (item) => item.lessonId === selectedLesson.id,
  );
  const hasPrevLesson = currentLessonIndex > 0;
  const hasNextLesson =
    currentLessonIndex >= 0 && currentLessonIndex < lessonSequence.length - 1;

  const {
    completedLessonsInBlock,
    completedPracticesInBlock,
    totalItemsInBlock,
    completedInBlock,
    blockProgressPercent,
  } = getBlockProgress(selectedBlock, completedLessons, completedPractices);
  const {
    totalLessonsCount,
    totalPracticesCount,
    completedLessonsCount,
    completedPracticesCount,
    overallProgressPercent,
  } = getOverallProgress(editableCourses, completedLessons, completedPractices);
  const profileActiveCourse = selectedCourse || editableCourses[0];
  const {
    total: profileActiveCourseTotal,
    completed: profileActiveCourseCompleted,
    progress: profileActiveCourseProgress,
  } = getCourseProgress(
    profileActiveCourse,
    completedLessons,
    completedPractices,
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
    if (!canCreateCourse) {
      return;
    }

    navigate("/creator");
  };

  const openCourse = async (courseId) => {
    if (!canBrowseCourses || !courseId) {
      return;
    }

    const requestId = courseRequestRef.current + 1;
    courseRequestRef.current = requestId;
    setCoursesLoading(true);
    setCoursesError("");

    try {
      const localCourse = editableCourses.find(
        (course) => course.id === courseId,
      );
      const nextCourse =
        localCourse && !isUuid(courseId)
          ? localCourse
          : await getCourse(courseId);
      if (courseRequestRef.current !== requestId) return;
      setEditableCourses((prev) => mergeCourse(prev, nextCourse));
      setSelectedCourseId(nextCourse.id);
      setSelectedBlockId(nextCourse.blocks?.[0]?.id ?? null);
      setSelectedLessonId(nextCourse.blocks?.[0]?.lessons?.[0]?.id ?? null);
      setSelectedPracticeId(nextCourse.blocks?.[0]?.practice?.[0]?.id ?? null);
      navigate(`/course/${nextCourse.id}`);
    } catch (error) {
      if (courseRequestRef.current === requestId) {
        setCoursesError(getErrorMessage(error, "Не удалось загрузить курс."));
      }
    } finally {
      if (courseRequestRef.current === requestId) {
        setCoursesLoading(false);
      }
    }
  };

  const updateCourseStatus = async (courseId, action) => {
    if (!courseId) {
      return null;
    }
    if (action !== "archive" && !canUpdateCourse) {
      return null;
    }
    if (action === "archive" && !canDeleteCourse) {
      return null;
    }

    const statusAction = {
      publish: publishCourseApi,
      invite_only: setCourseInviteOnlyApi,
      archive: archiveCourseApi,
    }[action];

    if (!statusAction) {
      return null;
    }

    try {
      const result = await statusAction(courseId);
      const nextStatus =
        result?.status ||
        (action === "publish"
          ? "published"
          : action === "invite_only"
            ? "invite_only"
            : "archived");
      setEditableCourses((prev) =>
        prev.map((course) =>
          course.id === courseId ? { ...course, status: nextStatus } : course,
        ),
      );
      return nextStatus;
    } catch (error) {
      setCoursesError(
        getErrorMessage(error, "Не удалось изменить статус курса."),
      );
      throw error;
    }
  };

  const deleteCourse = async (courseId) => {
    if (!canDeleteCourse) {
      return;
    }

    await updateCourseStatus(courseId, "archive");

    if (selectedCourse?.id === courseId) {
      setIsCourseEditMode(false);
      navigate("/courses");
    }
  };

  const openBlock = async (blockId) => {
    if (!canOpenCourse || !blockId || !selectedCourse.id) return;
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
        setCoursesError(getErrorMessage(error, "Не удалось загрузить модуль."));
      }
    }
  };

  const openBlockInEditMode = async (blockId) => {
    if (!canUpdateCourse) {
      return;
    }

    await openBlock(blockId);
    navigate(`/course/${selectedCourse.id}/edit/block/${blockId}`);
  };

  const openBlockPage = async (blockId) => {
    await openBlock(blockId);
  };

  const openBlockPageInEditMode = async (blockId) => {
    if (!canUpdateCourse) {
      return;
    }

    await openBlock(blockId);
    navigate(`/course/${selectedCourse.id}/edit/block/${blockId}`);
  };

  const openLesson = async (lessonId) => {
    if (!canOpenCourse || !lessonId || !selectedCourse.id) return;
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
        setCoursesError(getErrorMessage(error, "Не удалось загрузить урок."));
      }
    }
  };

  const openLessonInEditMode = async (lessonId) => {
    if (!canUpdateCourse) {
      return;
    }

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
    if (!canOpenCourse) {
      return;
    }

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
    if (!canUpdateCourse) {
      return;
    }

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
    if (!canUpdateCourse) {
      return;
    }

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
          setCoursesError(getErrorMessage(error, "Не удалось сохранить курс."));
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
            getErrorMessage(error, "Не удалось сохранить модуль."),
          );
        });
    }
  };

  const insertCourseBlock = (index) => {
    if (!canUpdateCourse) {
      return null;
    }

    const { id: blockId, block: newBlock } = createEmptyCourseBlock(
      selectedCourse.id,
    );

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
          setCoursesError(getErrorMessage(error, "Не удалось сохранить урок."));
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

  const createManualCourse = async ({ courseId }) => {
    if (!canCreateCourse || !courseId) {
      return;
    }

    const course = await getCourse(courseId);
    const firstBlock = course.blocks?.[0];

    setEditableCourses((prev) => mergeCourse(prev, course));
    setSelectedCourseId(course.id);
    setSelectedBlockId(firstBlock?.id ?? null);
    setSelectedLessonId(firstBlock?.lessons?.[0]?.id ?? null);
    setSelectedPracticeId(firstBlock?.practice?.[0]?.id ?? null);
    setIsCourseEditMode(true);
    navigate(`/course/${course.id}/edit`);
  };

  return (
    <div
      className={`page ${location.pathname === "/" ? "is-home-page" : "is-inner-page"}`}
      data-theme={resolvedTheme}
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
        theme={resolvedTheme}
        canCreateCourse={canCreateCourse}
        canReadCourse={canBrowseCourses}
        canManageOrganizations={canManageOrganizations}
        canManageModels={canManageModels}
        toggleTheme={toggleTheme}
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
                    canCreateCourse={canCreateCourse}
                    canReadCourse={canBrowseCourses}
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
                    canCreateCourse={canCreateCourse}
                    canReadCourse={canBrowseCourses}
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

              <Route
                element={
                  <ProtectedRoute permission={COURSE_PERMISSIONS.UPDATE} />
                }
              >
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
                      canReadCourse={canOpenCourse}
                      canUpdateCourse={canUpdateCourse}
                      canDeleteCourse={canDeleteCourse}
                      deleteCourse={deleteCourse}
                      updateCourseStatus={updateCourseStatus}
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
              <Route
                path="/course/:courseId"
                element={<CourseViewer localCourse={selectedCourse} />}
              />
              <Route
                path="/course/:courseId/block/:blockId"
                element={<CourseViewer localCourse={selectedCourse} />}
              />
              <Route
                path="/course/:courseId/lesson/:lessonId"
                element={<CourseViewer localCourse={selectedCourse} />}
              />
              <Route
                path="/course/:courseId/practice/:practiceId"
                element={<CourseViewer localCourse={selectedCourse} />}
              />
              <Route
                element={
                  <ProtectedRoute
                    permissions={Object.values(ORGANIZATION_PERMISSIONS)}
                    requireAll={false}
                  />
                }
              >
                <Route
                  path="/organizations"
                  element={
                    <OrganizationsPage
                      canCreateOrganization={canCreateOrganization}
                      canReadOrganization={canReadOrganization}
                      canReadOwnOrganization={canReadOwnOrganization}
                      canUpdateOrganization={canUpdateOrganization}
                      canDeleteOrganization={canDeleteOrganization}
                    />
                  }
                />
              </Route>
              <Route element={<ProtectedRoute />}>
                <Route
                  path="/models"
                  element={
                    <ModelsPage
                      canCreateModel={canCreateModel}
                      canDeleteModel={canDeleteModel}
                    />
                  }
                />
              </Route>
              <Route
                element={
                  <ProtectedRoute permission={COURSE_PERMISSIONS.CREATE} />
                }
              >
                <Route path="/creator" element={<CreatorPage />} />
                <Route
                  path="/manual-course-builder"
                  element={
                    <ManualCourseBuilderPage
                      onCreateCourse={createManualCourse}
                    />
                  }
                />
              </Route>
              <Route element={<ProtectedRoute />}>
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
                      teacherLeaderboard={teacherLeaderboard}
                      openCreator={openCreator}
                      canCreateCourse={canCreateCourse}
                      canUpdateCourse={canUpdateCourse}
                      canDeleteCourse={canDeleteCourse}
                    />
                  }
                />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </>
        )}
      </main>
      <Footer canCreateCourse={canCreateCourse} canReadCourse={canReadCourse} />
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
