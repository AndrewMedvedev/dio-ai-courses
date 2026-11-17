import { Component, Suspense, type ReactNode } from 'react';

interface PageLoadBoundaryProps {
  pathname: string;
  children: ReactNode;
}

/** Keep navigation available when a page chunk fails to download. */
export class PageLoadBoundary extends Component<
  PageLoadBoundaryProps,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previous: PageLoadBoundaryProps) {
    if (this.state.failed && previous.pathname !== this.props.pathname) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (!this.state.failed) {
      return (
        <Suspense
          fallback={
            <p role="status" className="tw:p-[24px] tw:text-(--muted)">
              Загружаем страницу…
            </p>
          }
        >
          {this.props.children}
        </Suspense>
      );
    }
    return (
      <section role="alert" className="tw:p-[24px] tw:text-(--text)">
        <p>
          Не удалось загрузить страницу. Проверьте соединение и обновите её.
        </p>
        <button
          type="button"
          className="tw:rounded-[12px] tw:border tw:border-solid tw:border-(--line) tw:bg-(--surface) tw:px-[16px] tw:py-[10px] tw:text-(--text) tw:cursor-pointer"
          onClick={() => window.location.reload()}
        >
          Обновить страницу
        </button>
      </section>
    );
  }
}
