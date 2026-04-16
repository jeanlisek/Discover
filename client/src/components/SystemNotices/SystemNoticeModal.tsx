import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info, AlertTriangle, AlertOctagon, X, ChevronLeft, ChevronRight } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { useSystemNoticeStore } from '../../store/systemNoticeStore.js';
import type { SystemNoticeDTO } from '../../store/systemNoticeStore.js';
import { useTranslation, isRtlLanguage } from '../../i18n/index.js';
import { runNoticeAction } from './noticeActions.js';

const ReactMarkdown = React.lazy(() =>
  import('react-markdown').then(m => ({ default: m.default }))
);

/** Safe rAF shim — falls back to setTimeout(0) in environments without rAF (e.g. jsdom). */
function scheduleFrame(cb: () => void): () => void {
  if (typeof requestAnimationFrame !== 'undefined') {
    const id = requestAnimationFrame(cb);
    return () => cancelAnimationFrame(id);
  }
  const id = setTimeout(cb, 0);
  return () => clearTimeout(id);
}

const SEVERITY_ICONS: Record<string, React.ElementType> = {
  info: Info,
  warn: AlertTriangle,
  critical: AlertOctagon,
};

const SEVERITY_ACCENT: Record<string, string> = {
  info:     'text-blue-500  dark:text-blue-400  bg-blue-50  dark:bg-blue-950',
  warn:     'text-amber-500 dark:text-amber-400 bg-amber-50 dark:bg-amber-950',
  critical: 'text-rose-600  dark:text-rose-400  bg-rose-50  dark:bg-rose-950',
};

interface Props {
  notices: SystemNoticeDTO[];
}

// Inner content shared between desktop and mobile layouts
interface ContentProps {
  notice: SystemNoticeDTO;
  title: string;
  body: string;
  ctaLabel: string | null;
  titleId: string;
  bodyId: string;
  isDark: boolean;
  onDismiss: () => void;
  onDismissAll: () => void;
  onCTA: () => void;
  // Pager
  total: number;
  currentPage: number;
  canPage: boolean;
  onPrev: () => void;
  onNext: () => void;
  onGoto: (i: number) => void;
}

function NoticeContent({ notice, title, body, ctaLabel, titleId, bodyId, isDark, onDismiss, onDismissAll, onCTA, total, currentPage, canPage, onPrev, onNext, onGoto }: ContentProps) {
  const { t } = useTranslation();

  const DefaultIcon = SEVERITY_ICONS[notice.severity] ?? Info;
  const LucideIcon: React.ElementType = notice.icon
    ? ((LucideIcons as Record<string, unknown>)[notice.icon] as React.ElementType) ?? DefaultIcon
    : DefaultIcon;

  return (
    <div className="flex flex-col relative">
      {/* Dismiss X button */}
      {notice.dismissible && (
        <button
          onClick={onDismissAll}
          className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Dismiss"
        >
          <X size={18} />
        </button>
      )}

      {/* Hero image (not inline) */}
      {notice.media && notice.media.placement !== 'inline' && (
        <div
          className="w-full overflow-hidden"
          style={{ aspectRatio: notice.media.aspectRatio ?? '16/9' }}
        >
          <img
            src={isDark && notice.media.srcDark ? notice.media.srcDark : notice.media.src}
            alt={t(notice.media.altKey)}
            className="w-full h-full object-cover"
            fetchPriority="high"
            decoding="async"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      )}

      <div className="p-8">
        {/* Severity icon (when no hero) */}
        {!notice.media && (
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${SEVERITY_ACCENT[notice.severity] ?? ''}`}>
            <LucideIcon size={28} />
          </div>
        )}

        {/* Title */}
        <h2
          id={titleId}
          className="text-xl font-semibold text-center text-slate-900 dark:text-slate-100 mb-3"
        >
          {title}
        </h2>

        {/* Body — markdown */}
        <div
          id={bodyId}
          className="text-sm leading-relaxed text-center text-slate-600 dark:text-slate-400 max-w-[340px] mx-auto mb-4"
        >
          <React.Suspense fallback={<p className="text-sm text-slate-500">{body}</p>}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeSanitize]}
              components={{
                a: ({ href, children }) => (
                  <a
                    href={href}
                    className="text-blue-600 dark:text-blue-400 underline hover:no-underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {children}
                  </a>
                ),
                ul: ({ children }) => <ul className="list-disc list-inside text-left">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside text-left">{children}</ol>,
              }}
            >
              {body}
            </ReactMarkdown>
          </React.Suspense>
        </div>

        {/* Inline image */}
        {notice.media?.placement === 'inline' && (
          <div
            className="w-full overflow-hidden rounded-lg mb-4 max-w-[340px] mx-auto"
            style={{ aspectRatio: notice.media.aspectRatio ?? '16/9' }}
          >
            <img
              src={isDark && notice.media.srcDark ? notice.media.srcDark : notice.media.src}
              alt={t(notice.media.altKey)}
              className="w-full h-full object-cover"
              decoding="async"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}

        {/* Highlights */}
        {notice.highlights && notice.highlights.length > 0 && (
          <ul className="max-w-[340px] mx-auto mb-4 space-y-2">
            {notice.highlights.map((h, i) => {
              const HIcon: React.ElementType | null = h.iconName
                ? ((LucideIcons as Record<string, unknown>)[h.iconName] as React.ElementType) ?? null
                : null;
              return (
                <li key={i} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  {HIcon
                    ? <HIcon size={16} className="text-blue-500 shrink-0" />
                    : <span className="text-blue-500 shrink-0">✓</span>
                  }
                  {t(h.labelKey)}
                </li>
              );
            })}
          </ul>
        )}

        {/* Pager — dots, arrows, counter (only when multiple notices) */}
        {total > 1 && (
          <div className="flex flex-col items-center gap-1 mb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={onPrev}
                disabled={!canPage || currentPage === 0}
                aria-label={t('system_notice.pager.prev')}
                className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} />
              </button>

              {Array.from({ length: total }, (_, i) => (
                <button
                  key={i}
                  onClick={() => { if (canPage) onGoto(i); }}
                  aria-label={t('system_notice.pager.goto').replace('{n}', String(i + 1))}
                  aria-current={i === currentPage ? 'true' : undefined}
                  disabled={!canPage && i !== currentPage}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i === currentPage
                      ? 'bg-blue-500 dark:bg-blue-400'
                      : 'bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500 disabled:cursor-not-allowed'
                  }`}
                />
              ))}

              <button
                onClick={onNext}
                disabled={!canPage || currentPage === total - 1}
                aria-label={t('system_notice.pager.next')}
                className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            <span className="text-xs text-slate-400 tabular-nums">
              {t('system_notice.pager.counter')
                .replace('{current}', String(currentPage + 1))
                .replace('{total}', String(total))}
            </span>
          </div>
        )}

        {/* CTA + dismiss link */}
        <div className="flex flex-col items-center gap-3 mt-2">
          {ctaLabel ? (
            <button
              id={`notice-cta-${notice.id}`}
              onClick={onCTA}
              className="w-full h-11 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
            >
              {ctaLabel}
            </button>
          ) : (
            <button
              id={`notice-cta-${notice.id}`}
              onClick={onDismissAll}
              className="w-full h-11 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
            >
              {t('common.ok')}
            </button>
          )}
          {notice.dismissible && ctaLabel && (
            <button
              onClick={onDismiss}
              className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              Not now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ModalRenderer({ notices }: Props) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(false);
  const [pageAnnouncement, setPageAnnouncement] = useState('');
  const navigate = useNavigate();
  const { dismiss } = useSystemNoticeStore();
  const { t, language } = useTranslation();

  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && (window.matchMedia?.('(max-width: 639px)')?.matches ?? false)
  );

  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false);

  const notice = notices[idx] ?? null;

  // Non-dismissible notices lock the pager so users must act before advancing.
  const canPage = notice?.dismissible !== false;

  const touchStartY = useRef<number | null>(null);
  // Keep a ref to the current notice id so dismiss/CTA handlers see the latest value
  const noticeIdRef = useRef<string | null>(null);
  noticeIdRef.current = notice?.id ?? null;

  // Page-slide animation refs.
  // isPageNavRef: set to true just before a user-initiated page change so the
  // grace-delay effect knows to run a slide instead of hide+show.
  // slideDirRef: 'right' = new content enters from the right (Next), 'left' = from the left (Prev).
  // contentWrapperRef: the div wrapping NoticeContent — we animate its transform directly.
  const isPageNavRef = useRef(false);
  const slideDirRef  = useRef<'left' | 'right'>('right');
  const contentWrapperRef = useRef<HTMLDivElement>(null);

  // Mobile breakpoint
  useEffect(() => {
    const mq = window.matchMedia?.('(max-width: 639px)');
    if (!mq) return;
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Dark mode observer
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    obs.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  // Clamp idx when notices array shrinks (e.g. after dismiss of the last page)
  useEffect(() => {
    if (notices.length > 0 && idx >= notices.length) {
      setIdx(notices.length - 1);
    }
  }, [notices.length, idx]);

  // Fires on every notice-id change. Branches on whether this is a user-initiated
  // page navigation (slide the content wrapper) or a modal appear/dismiss-advance
  // (grace-delay the whole modal).
  useEffect(() => {
    if (!notice) return;

    // ── Page navigation: slide new content in, keep modal visible ────────────
    if (isPageNavRef.current) {
      isPageNavRef.current = false;
      const el = contentWrapperRef.current;
      if (el && !prefersReducedMotion) {
        // The handler already set el.style.transform to the start position
        // synchronously before setIdx was called. Trigger the transition here.
        requestAnimationFrame(() => {
          el.style.transition = 'transform 260ms ease-out';
          el.style.transform = 'translateX(0)';
          const onEnd = () => {
            el.style.transition = '';
            el.style.transform = '';
            el.removeEventListener('transitionend', onEnd);
          };
          el.addEventListener('transitionend', onEnd);
        });
      }
      return;
    }

    // ── Modal appearing / dismiss-advance: grace delay ────────────────────────
    setVisible(false);
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    const cancel1 = scheduleFrame(() => {
      const cancel2 = scheduleFrame(() => {
        timerId = setTimeout(() => {
          if (!cancelled) setVisible(true);
        }, 500);
      });
      if (cancelled) cancel2();
    });
    return () => {
      cancelled = true;
      cancel1();
      if (timerId !== undefined) clearTimeout(timerId);
    };
  }, [notice?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ESC key — closes all modal notices (same as clicking X)
  useEffect(() => {
    if (!visible || !notice?.dismissible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismissAll();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [visible, notice?.dismissible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Arrow-key pager navigation
  useEffect(() => {
    if (!visible || notices.length <= 1) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (!canPage) return;
      // In RTL layouts the directional meaning of arrows is flipped
      const forward = isRtlLanguage(language) ? e.key === 'ArrowLeft' : e.key === 'ArrowRight';
      if (forward && idx < notices.length - 1) {
        triggerPageSlide('right');
        setIdx(idx + 1);
        announceIndex(idx + 1, notices.length);
      } else if (!forward && idx > 0) {
        triggerPageSlide('left');
        setIdx(idx - 1);
        announceIndex(idx - 1, notices.length);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [visible, idx, notices.length, canPage, language]); // eslint-disable-line react-hooks/exhaustive-deps

  // Body scroll lock
  useEffect(() => {
    if (visible && notice) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [visible, notice]);

  function announceIndex(newIdx: number, total: number) {
    setPageAnnouncement(
      t('system_notice.pager.position')
        .replace('{current}', String(newIdx + 1))
        .replace('{total}', String(total)),
    );
  }

  // Dismiss current notice. The store removes it from the array, and the next
  // notice naturally shifts into notices[idx]. The clamp effect handles the
  // edge case where idx was pointing at the last item.
  function handleDismissById(id: string) {
    setVisible(false);
    dismiss(id);
  }

  function handleDismiss() {
    const id = noticeIdRef.current;
    if (id) handleDismissById(id);
  }

  // Dismiss every notice in the current modal list — used by the X button and ESC.
  function handleDismissAll() {
    setVisible(false);
    notices.forEach(n => dismiss(n.id));
  }

  function handleCTA() {
    if (!notice) return;
    if (!notice.cta) {
      handleDismissAll();
      return;
    }
    if (notice.cta.kind === 'nav') {
      navigate(notice.cta.href);
      if (notice.dismissible !== false) handleDismissAll();
    } else {
      runNoticeAction(notice.cta.actionId, { navigate });
      const actionCta = notice.cta as { kind: 'action'; labelKey: string; actionId: string; dismissOnAction?: boolean };
      if (actionCta.dismissOnAction !== false) handleDismissAll();
    }
  }

  // Sets up the content wrapper's start transform SYNCHRONOUSLY (before React
  // re-renders with the new notice), then flags the grace-delay effect to slide
  // rather than hide+show.
  function triggerPageSlide(dir: 'left' | 'right') {
    isPageNavRef.current = true;
    slideDirRef.current = dir;
    if (!prefersReducedMotion) {
      const el = contentWrapperRef.current;
      if (el) {
        el.style.transition = 'none';
        el.style.transform = dir === 'right' ? 'translateX(100%)' : 'translateX(-100%)';
      }
    }
  }

  function handlePrev() {
    if (!canPage || idx <= 0) return;
    const next = idx - 1;
    triggerPageSlide('left');
    setIdx(next);
    announceIndex(next, notices.length);
  }

  function handleNext() {
    if (!canPage || idx >= notices.length - 1) return;
    const next = idx + 1;
    triggerPageSlide('right');
    setIdx(next);
    announceIndex(next, notices.length);
  }

  function handleGoto(i: number) {
    if (!canPage || i === idx) return;
    triggerPageSlide(i > idx ? 'right' : 'left');
    setIdx(i);
    announceIndex(i, notices.length);
  }

  // No notice to show
  if (!notice) return null;

  // Pre-compute body with params interpolated
  const rawBody = t(notice.bodyKey);
  const body = notice.bodyParams
    ? Object.entries(notice.bodyParams).reduce(
        (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, 'g'), v),
        rawBody
      )
    : rawBody;

  const title = t(notice.titleKey);
  const ctaLabel = notice.cta ? t(notice.cta.labelKey) : null;

  const titleId = `notice-title-${notice.id}`;
  const bodyId  = `notice-body-${notice.id}`;

  // Animation classes
  const dur = prefersReducedMotion ? 'duration-[120ms]' : 'duration-[260ms]';
  const ease = visible ? 'ease-out' : 'ease-in';

  const contentProps: ContentProps = {
    notice, title, body, ctaLabel, titleId, bodyId, isDark,
    onDismiss: handleDismiss,
    onDismissAll: handleDismissAll,
    onCTA: handleCTA,
    total: notices.length,
    currentPage: idx,
    canPage,
    onPrev: handlePrev,
    onNext: handleNext,
    onGoto: handleGoto,
  };

  if (isMobile) {
    const mobileMotion = prefersReducedMotion
      ? (visible ? 'opacity-100' : 'opacity-0')
      : (visible ? 'opacity-100 translate-y-0' : 'opacity-100 translate-y-full');

    return (
      <div className="fixed inset-0 z-50" role="presentation">
        {/* Screen-reader page announcements */}
        <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{pageAnnouncement}</span>
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] transition-opacity ${dur} ${ease} ${visible ? 'opacity-100' : 'opacity-0'}`}
          onClick={notice.dismissible ? handleDismiss : undefined}
        />
        {/* Bottom sheet */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          className={`absolute bottom-0 left-0 right-0 rounded-t-3xl overflow-hidden max-h-[85dvh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl transition-all ${dur} ${ease} ${mobileMotion}`}
          onTouchStart={e => { touchStartY.current = e.touches[0].clientY; }}
          onTouchEnd={e => {
            if (touchStartY.current !== null && notice.dismissible) {
              const delta = e.changedTouches[0].clientY - touchStartY.current;
              if (delta > 80) handleDismiss();
            }
            touchStartY.current = null;
          }}
        >
          {/* Drag handle */}
          <div className="pt-3 pb-1 flex justify-center">
            <div className="w-9 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
          </div>
          <div ref={contentWrapperRef}>
            <NoticeContent {...contentProps} />
          </div>
        </div>
      </div>
    );
  }

  // Desktop centered modal
  const maxWidth = notice.severity === 'critical' ? 'max-w-[560px]' : 'max-w-[480px]';
  const desktopMotion = prefersReducedMotion
    ? (visible ? 'opacity-100' : 'opacity-0')
    : (visible ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.97]');

  return (
    <div
      className={`fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-[2px] transition-opacity ${dur} ${ease} ${visible ? 'opacity-100' : 'opacity-0'}`}
      role="presentation"
      onClick={notice.dismissible ? handleDismiss : undefined}
    >
      {/* Screen-reader page announcements */}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{pageAnnouncement}</span>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          className={`w-full ${maxWidth} rounded-2xl overflow-hidden shadow-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all ${dur} ${ease} ${desktopMotion}`}
          onClick={e => e.stopPropagation()}
        >
          <div ref={contentWrapperRef}>
            <NoticeContent {...contentProps} />
          </div>
        </div>
      </div>
    </div>
  );
}
