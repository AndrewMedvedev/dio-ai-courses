// Принятие приглашения на курс по ссылке из письма: /courses/invitations/accept/:token
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import SectionTop from "../components/SectionTop";
import { COURSE_ROLE_LABEL } from "../components/course/CourseInviteDialog";
import "../components/course/course-invite.css";
import { useSessionStore } from "../stores/sessionStore";
import { useStudentStore } from "../stores/studentStore";
import { acceptCourseInvitation, isTokenExpired } from "../utils/api";
import { getErrorMessage } from "../utils/errors";

function describeError(error) {
  if (error?.status === 404) {
    return {
      title: "Приглашение недействительно",
      text: "Возможно, оно уже использовано или истёк срок действия. Попросите отправить новое приглашение.",
    };
  }
  if (error?.status === 409) {
    return {
      title: "Вы уже участник курса",
      text: "Этот курс уже есть в вашем списке — откройте его в каталоге или в профиле.",
    };
  }
  return {
    title: "Не удалось принять приглашение",
    text: getErrorMessage(error, "Попробуйте ещё раз чуть позже."),
  };
}

export default function CourseInvitationAcceptPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const accessToken = useSessionStore((state) => state.accessToken);
  const refreshToken = useSessionStore((state) => state.refreshToken);
  const expiresAt = useSessionStore((state) => state.expiresAt);
  const loadMyCourses = useStudentStore((state) => state.loadMyCourses);
  const isAuthenticated = Boolean(
    accessToken && expiresAt && (!isTokenExpired(expiresAt) || refreshToken),
  );
  const [state, setState] = useState({ status: "idle", member: null, error: null });
  const startedFor = useRef("");

  const accept = async () => {
    setState({ status: "accepting", member: null, error: null });
    try {
      const member = await acceptCourseInvitation(token);
      setState({ status: "done", member, error: null });
      loadMyCourses?.().catch(() => {});
    } catch (error) {
      setState({ status: "error", member: null, error });
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !token || startedFor.current === token) return;
    startedFor.current = token;
    accept();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, token]);

  const loginPath = `/login?redirect=${encodeURIComponent(location.pathname)}`;
  const courseId = state.member?.course_id || state.member?.courseId;
  const errorInfo = state.status === "error" ? describeError(state.error) : null;
  const needsLogin =
    !isAuthenticated || (state.status === "error" && state.error?.status === 401);

  return (
    <section className="container section course-details-view course-invite-accept">
      <SectionTop label="Приглашение" title="Приглашение на курс" />
      <article className="glass-card course-invite-accept-card" aria-live="polite">
        {needsLogin ? (
          <>
            <h2>Войдите, чтобы принять приглашение</h2>
            <p>
              Приглашение привязано к вашему аккаунту. Если аккаунта ещё нет — сначала
              зарегистрируйтесь по ссылке из письма «Приглашаем вас в систему», затем
              вернитесь к этому письму.
            </p>
            <div className="course-invite-accept-actions">
              <button
                type="button"
                className="btn btn-solid"
                onClick={() => navigate(loginPath)}
              >
                Войти
              </button>
            </div>
          </>
        ) : state.status === "done" ? (
          <>
            <h2>Вы присоединились к курсу</h2>
            <p>
              Ваша роль —{" "}
              <strong>
                {COURSE_ROLE_LABEL[state.member?.role] || state.member?.role || "участник"}
              </strong>
              . Курс уже появился в вашем списке.
            </p>
            <div className="course-invite-accept-actions">
              {courseId ? (
                <button
                  type="button"
                  className="btn btn-solid"
                  onClick={() => navigate(`/course/${courseId}`, { replace: true })}
                >
                  Перейти к курсу
                </button>
              ) : null}
              <Link className="btn btn-outline" to="/courses">
                Каталог курсов
              </Link>
            </div>
          </>
        ) : errorInfo ? (
          <>
            <h2>{errorInfo.title}</h2>
            <p>{errorInfo.text}</p>
            <div className="course-invite-accept-actions">
              {state.error?.status !== 404 && state.error?.status !== 409 ? (
                <button type="button" className="btn btn-solid" onClick={accept}>
                  Повторить
                </button>
              ) : null}
              <Link className="btn btn-outline" to="/courses">
                Каталог курсов
              </Link>
            </div>
          </>
        ) : (
          <>
            <h2>Принимаем приглашение…</h2>
            <p>Это займёт пару секунд.</p>
          </>
        )}
      </article>
    </section>
  );
}
