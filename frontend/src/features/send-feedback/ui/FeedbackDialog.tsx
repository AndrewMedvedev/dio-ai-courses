import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '@/entities/session';
import { ApiError, requestJson } from '@/shared/api';
import { AppModal } from '@/shared/ui/app-modal';
import starEmpty from '../assets/star-empty.svg';
import starLow from '../assets/star-low.svg';
import starMid from '../assets/star-mid.svg';
import starHigh from '../assets/star-high.svg';

interface FeedbackDialogProps {
  onClose: () => void;
}

const MAX_COMMENT_LENGTH = 2000;
const FEEDBACK_TIMEOUT_MS = 20_000;
const RATING_LABELS = [
  '',
  'плохо',
  'не очень',
  'нормально',
  'хорошо',
  'отлично',
];
const BUTTON =
  'tw:min-h-[48px] tw:rounded-[999px] tw:px-[20px] tw:py-[12px] tw:font-[600] tw:text-[14px] tw:leading-[21px] tw:cursor-pointer tw:[font-family:inherit] tw:disabled:opacity-45 tw:disabled:cursor-wait tw:focus-visible:outline-2 tw:focus-visible:outline-offset-4 tw:focus-visible:outline-(--ink-accent)';
const PRIMARY = `${BUTTON} tw:border-0 tw:bg-(--contrast) tw:text-(--text-solid)`;
const SECONDARY = `${BUTTON} tw:border tw:border-solid tw:border-(--line) tw:bg-transparent tw:text-(--text)`;

export function FeedbackDialog({ onClose }: FeedbackDialogProps) {
  const formId = useId();
  const navigate = useNavigate();
  const accessToken = useSessionStore((state) => state.accessToken);
  const [rating, setRating] = useState(0);
  const [previewRating, setPreviewRating] = useState(0);
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState<{ rating?: string; comment?: string }>(
    {},
  );
  const [sendError, setSendError] = useState<{
    status?: number;
    message: string;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const inFlight = useRef(false);
  const firstRating = useRef<HTMLInputElement>(null);
  const commentInput = useRef<HTMLTextAreaElement>(null);
  const doneButton = useRef<HTMLButtonElement>(null);
  const needsLogin = !sent && (!accessToken || sendError?.status === 401);
  const rateLimited = sendError?.status === 429;
  const visibleRating = previewRating || rating;
  const star =
    visibleRating <= 2 ? starLow : visibleRating === 3 ? starMid : starHigh;
  const starColor =
    visibleRating <= 2
      ? 'tw:bg-(--feedback-low)'
      : visibleRating === 3
        ? 'tw:bg-(--feedback-mid)'
        : 'tw:bg-(--feedback-high)';

  useEffect(() => {
    if (sent) doneButton.current?.focus();
  }, [sent]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = document.getElementById(formId)?.closest('[role="dialog"]');
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialog) return;
      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href]',
        ),
      );
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', trapFocus);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', trapFocus);
    };
  }, [formId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || sent || rateLimited || needsLogin) return;
    const nextErrors = {
      rating: rating ? undefined : 'Выберите оценку от 1 до 5',
      comment: !comment.trim()
        ? 'Напишите комментарий'
        : comment.length > MAX_COMMENT_LENGTH
          ? 'Не больше 2000 символов'
          : undefined,
    };
    setErrors(nextErrors);
    if (nextErrors.rating || nextErrors.comment) {
      (nextErrors.rating ? firstRating.current : commentInput.current)?.focus();
      return;
    }
    inFlight.current = true;
    setSending(true);
    setSendError(null);
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            controller.abort();
            reject(
              new DOMException('Feedback request timed out', 'TimeoutError'),
            );
          }, FEEDBACK_TIMEOUT_MS);
        }),
        requestJson<unknown>(
          '/feedbacks',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating, comment: comment.trim() }),
            signal: controller.signal,
          },
          { clearOnUnauthorized: false },
        ),
      ]);
      setSent(true);
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      const status = apiError?.status;
      if (status === 422) setErrors(apiError?.validationErrors || {});
      setSendError({
        status,
        message: controller.signal.aborted
          ? 'Сервер не ответил за 20 секунд. Текст сохранён. Не удалось подтвердить отправку.'
          : status === 429
            ? 'Можно оставить не более 5 отзывов за сутки. Попробуйте позже.'
            : status === 401
              ? 'Сессия истекла. Войдите в аккаунт, чтобы отправить отзыв.'
              : status === 422
                ? 'Проверьте корректность заполнения полей.'
                : status && status < 500
                  ? apiError?.message ||
                    'Не удалось отправить отзыв. Попробуйте ещё раз.'
                  : 'Проверьте подключение и попробуйте ещё раз. Введённый текст сохранён.',
      });
    } finally {
      clearTimeout(timeoutId);
      inFlight.current = false;
      setSending(false);
    }
  }

  return (
    <AppModal
      open
      title="Обратная связь"
      description="Расскажите, что понравилось и что можно улучшить."
      busy={sending}
      onClose={onClose}
      initialFocusRef={firstRating}
      className="feedback-modal tw:border-(--line)! tw:[&_.app-modal-head]:pt-[28px] tw:[&_.app-modal-head_h2]:text-[24px] tw:[&_.app-modal-head_h2]:leading-[32px] tw:[&_.app-modal-head_p]:text-[14px] tw:[&_.app-modal-head_p]:leading-[21px] tw:[&_.app-modal-body]:pt-[8px] tw:[&_.app-modal-body]:pb-[24px] tw:[&_.app-modal-body]:[scrollbar-width:none] tw:[&_.app-modal-body::-webkit-scrollbar]:hidden tw:[&_.app-modal-foot]:gap-[12px] tw:[&_.app-modal-foot]:border-(--line) tw:[&_.app-modal-foot]:pt-[16px] tw:[&_.app-modal-foot]:pb-[28px] tw:max-480:[&_.app-modal-head]:px-[20px] tw:max-480:[&_.app-modal-body]:px-[20px] tw:max-480:[&_.app-modal-foot]:px-[20px] tw:max-480:[&_.app-modal-foot]:flex-col tw:max-480:[&_.app-modal-foot_button]:w-full tw:[&_.app-modal-close:disabled]:opacity-35"
      footer={
        sent ? (
          <button
            ref={doneButton}
            className={PRIMARY}
            type="button"
            onClick={onClose}
          >
            Готово
          </button>
        ) : needsLogin ? (
          <>
            <button className={SECONDARY} type="button" onClick={onClose}>
              Закрыть
            </button>
            <button
              className={PRIMARY}
              type="button"
              onClick={() => {
                onClose();
                void navigate('/login');
              }}
            >
              Войти
            </button>
          </>
        ) : rateLimited ? (
          <button className={SECONDARY} type="button" onClick={onClose}>
            Закрыть
          </button>
        ) : (
          <>
            <button
              className={SECONDARY}
              type="button"
              onClick={onClose}
              disabled={sending}
            >
              Отмена
            </button>
            <button
              className={PRIMARY}
              type="submit"
              form={formId}
              disabled={sending}
            >
              {sending
                ? 'Отправляем…'
                : sendError
                  ? 'Попробовать снова'
                  : 'Отправить отзыв'}
            </button>
          </>
        )
      }
    >
      <form
        id={formId}
        onSubmit={submit}
        noValidate
        className="tw:grid tw:gap-[20px] tw:[--feedback-low:#c13c32] tw:[--feedback-mid:#a66d00] tw:[--feedback-high:#2f7d4a] tw:dark:[--feedback-low:#ff9a8f] tw:dark:[--feedback-mid:#f0ca63] tw:dark:[--feedback-high:#86d4a0]"
      >
        {sent ? (
          <div role="status" className="tw:grid tw:gap-[20px]">
            <span
              aria-hidden="true"
              className="tw:grid tw:size-[64px] tw:place-items-center tw:rounded-full tw:bg-(--contrast) tw:text-(--text-solid) tw:text-[32px]"
            >
              ✓
            </span>
            <h3 className="tw:text-[24px] tw:leading-[32px]">
              Спасибо за обратную связь!
            </h3>
            <p className="tw:m-0 tw:text-(--muted) tw:text-[16px] tw:leading-[24px]">
              Ваш отзыв отправлен. Он поможет нам сделать AI Course Lab удобнее.
            </p>
          </div>
        ) : (
          <>
            {(sendError || needsLogin) && (
              <div
                role="alert"
                className="tw:grid tw:gap-[8px] tw:rounded-[12px] tw:p-[16px] tw:text-(--app-modal-danger) tw:bg-[rgba(180,35,24,0.05)] tw:dark:bg-[rgba(255,154,143,0.08)] tw:text-[14px] tw:leading-[21px]"
              >
                <strong>
                  {needsLogin
                    ? 'Необходимо войти заново'
                    : rateLimited
                      ? 'Достигнут лимит отзывов'
                      : 'Не удалось отправить отзыв'}
                </strong>
                <span>
                  {needsLogin
                    ? 'Войдите в аккаунт, чтобы отправить отзыв.'
                    : sendError?.message}
                </span>
              </div>
            )}
            <fieldset
              disabled={sending}
              className="tw:border-0 tw:p-0 tw:m-0 tw:min-w-0"
              aria-describedby={`${formId}-rating-hint`}
            >
              <legend className="tw:p-0 tw:text-[14px] tw:font-[600] tw:leading-[21px]">
                Как вам AI Course Lab?
              </legend>
              <div
                className="tw:flex tw:gap-[8px] tw:mt-[8px]"
                onMouseLeave={() => setPreviewRating(0)}
              >
                {[1, 2, 3, 4, 5].map((value) => {
                  const selected = value <= visibleRating;
                  const asset = selected ? star : starEmpty;
                  return (
                    <label
                      key={value}
                      className="tw:relative tw:grid tw:size-[44px] tw:place-items-center tw:cursor-pointer tw:rounded-[8px] tw:has-[:focus-visible]:outline-2 tw:has-[:focus-visible]:outline-offset-2 tw:has-[:focus-visible]:outline-(--ink-accent)"
                      onMouseEnter={() => !sending && setPreviewRating(value)}
                    >
                      <input
                        ref={value === 1 ? firstRating : undefined}
                        className="tw:sr-only"
                        type="radio"
                        name={`${formId}-rating`}
                        value={value}
                        checked={rating === value}
                        aria-label={`${value} из 5 — ${RATING_LABELS[value]}`}
                        aria-invalid={Boolean(errors.rating)}
                        onChange={() => {
                          setRating(value);
                          setPreviewRating(0);
                          setErrors((current) => ({
                            ...current,
                            rating: undefined,
                          }));
                        }}
                      />
                      <span
                        aria-hidden="true"
                        className={`tw:block tw:size-[32px] tw:[mask-size:32px_32px] tw:[mask-repeat:no-repeat] ${selected ? starColor : 'tw:bg-(--muted)'}`}
                        style={{
                          maskImage: `url(${asset})`,
                          WebkitMaskImage: `url(${asset})`,
                        }}
                      />
                    </label>
                  );
                })}
              </div>
              <p
                id={`${formId}-rating-hint`}
                aria-live="polite"
                className={`tw:mt-[8px] tw:mb-0 tw:text-[14px] tw:leading-[21px] ${errors.rating ? 'tw:text-(--app-modal-danger)' : 'tw:text-(--muted)'}`}
              >
                {errors.rating ||
                  (visibleRating
                    ? `${visibleRating} из 5 — ${RATING_LABELS[visibleRating]}`
                    : '1 — плохо · 5 — отлично')}
              </p>
            </fieldset>
            <div className="tw:grid tw:gap-[8px]">
              <label
                htmlFor={`${formId}-comment`}
                className="tw:text-[14px] tw:font-[600] tw:leading-[21px]"
              >
                Комментарий
              </label>
              <textarea
                ref={commentInput}
                id={`${formId}-comment`}
                value={comment}
                onChange={(event) => {
                  setComment(event.target.value);
                  setErrors((current) => ({ ...current, comment: undefined }));
                }}
                disabled={sending}
                maxLength={MAX_COMMENT_LENGTH}
                required
                aria-invalid={Boolean(errors.comment)}
                aria-describedby={`${formId}-comment-hint ${formId}-comment-count`}
                placeholder="Что понравилось или что стоит улучшить?"
                className={`tw:box-border tw:w-full tw:h-[clamp(72px,_20dvh,_144px)] tw:resize-none tw:[scrollbar-width:thin] tw:[scrollbar-color:var(--line-strong)_transparent] tw:supports-[selector(::-webkit-scrollbar)]:[scrollbar-width:auto] tw:supports-[selector(::-webkit-scrollbar)]:[scrollbar-color:auto] tw:[&::-webkit-scrollbar]:w-[6px] tw:[&::-webkit-scrollbar-track]:bg-transparent tw:[&::-webkit-scrollbar-thumb]:rounded-full tw:[&::-webkit-scrollbar-thumb]:bg-(--line-strong) tw:[&::-webkit-scrollbar-button]:hidden tw:rounded-[12px] tw:border tw:border-solid tw:p-[16px] tw:bg-(--app-modal-row) tw:text-(--text) tw:text-[16px] tw:leading-[24px] tw:[font-family:inherit] tw:placeholder:text-(--muted) tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-(--ink-accent) tw:max-480:h-[clamp(72px,_20dvh,_164px)] ${errors.comment ? 'tw:border-(--app-modal-danger)' : 'tw:border-(--line)'}`}
              />
              <div className="tw:flex tw:justify-between tw:gap-[12px] tw:text-[12px] tw:leading-[18px]">
                <span
                  id={`${formId}-comment-hint`}
                  aria-live="polite"
                  className={
                    errors.comment
                      ? 'tw:text-(--app-modal-danger)'
                      : 'tw:text-(--muted)'
                  }
                >
                  {errors.comment || 'Обязательное поле'}
                </span>
                <span
                  id={`${formId}-comment-count`}
                  className="tw:shrink-0 tw:text-(--muted)"
                >
                  {comment.length} / {MAX_COMMENT_LENGTH}
                </span>
              </div>
            </div>
            <p className="tw:m-0 tw:text-[12px] tw:leading-[18px] tw:text-(--muted)">
              Не указывайте пароли и другие конфиденциальные данные.
            </p>
          </>
        )}
      </form>
    </AppModal>
  );
}
