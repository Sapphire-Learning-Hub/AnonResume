"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand";
import { findResumeMatches } from "@/domain/resume/search/document";
import {
  nextMatchAfterReplacement,
  nextResumeMatchAfterReplacement,
} from "@/domain/resume/search/navigation";
import { findTextMatches } from "@/domain/resume/search/match";
import type {
  ResumeSearchMatch,
  ResumeSearchQuery,
} from "@/domain/resume/search/types";
import type { ResumeEditorStoreState } from "@/stores/resume-editor";
import { useI18n } from "@/i18n/I18nProvider";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import type { MarkdownSearchHandle } from "./markdown-search";

export function useResumeSearch({
  store,
  scopeRef,
  markdown,
  source,
  disabled = false,
}: {
  store: StoreApi<ResumeEditorStoreState>;
  scopeRef: RefObject<HTMLElement | null>;
  markdown: boolean;
  source: string;
  disabled?: boolean;
}) {
  const document = useStore(store, (state) => state.document);
  const { t } = useI18n();
  const { toast } = useAppFeedback();
  const [open, setOpen] = useState(false);
  const [query, setQueryState] = useState<ResumeSearchQuery>({
    text: "",
    caseSensitive: false,
  });
  const [replacement, setReplacement] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [index, setIndex] = useState(0);
  const [focusRequest, setFocusRequest] = useState(0);
  const [navigationRequest, setNavigationRequest] = useState(0);
  const previousFocus = useRef<HTMLElement | null>(null);
  const markdownRef = useRef<MarkdownSearchHandle | null>(null);
  const documentMatches = useMemo(
    () => (open && !markdown ? findResumeMatches(document, query) : []),
    [document, query, open, markdown],
  );
  const sourceMatches = useMemo(
    () => (open && markdown ? findTextMatches(source, query) : []),
    [source, query, open, markdown],
  );
  const count = markdown ? sourceMatches.length : documentMatches.length;
  const currentIndex = count ? Math.min(index, count - 1) : -1;
  const currentMatch: ResumeSearchMatch | undefined =
    documentMatches[currentIndex];
  const sourceMatch = sourceMatches[currentIndex];

  const openSearch = useCallback(() => {
    if (disabled) return;
    if (
      globalThis.document.activeElement instanceof HTMLElement &&
      !globalThis.document.activeElement.closest("[data-resume-search-bar]")
    )
      previousFocus.current = globalThis.document.activeElement;
    setOpen(true);
    setFocusRequest((value) => value + 1);
  }, [disabled]);
  const close = useCallback(() => {
    setOpen(false);
    markdownRef.current?.setQuery(null);
    const previous = previousFocus.current;
    queueMicrotask(() => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    function handle(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229 ||
        disabled ||
        event.altKey
      )
        return;
      const target = event.target;
      if (!(target instanceof Node) || !scopeRef.current?.contains(target))
        return;
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "f" && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        openSearch();
      } else if (
        open &&
        (event.key === "F3" ||
          ((event.metaKey || event.ctrlKey) && key === "g"))
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (count)
          setIndex((currentIndex + (event.shiftKey ? -1 : 1) + count) % count);
        setNavigationRequest((value) => value + 1);
      }
    }
    globalThis.document.addEventListener("keydown", handle, true);
    return () =>
      globalThis.document.removeEventListener("keydown", handle, true);
  }, [scopeRef, disabled, openSearch, open, count, currentIndex]);

  useEffect(() => {
    markdownRef.current?.setQuery(open && markdown && !disabled ? query : null);
    if (open && markdown && sourceMatch)
      markdownRef.current?.selectMatch(sourceMatch);
  }, [open, markdown, disabled, query, sourceMatch, navigationRequest]);

  function onQuery(next: ResumeSearchQuery) {
    setQueryState(next);
    setIndex(0);
    setNavigationRequest((value) => value + 1);
  }
  function navigate(direction: 1 | -1) {
    if (!count) return;
    setIndex((currentIndex + direction + count) % count);
    setNavigationRequest((value) => value + 1);
  }
  function replace(all: boolean) {
    if (disabled || !count) return;
    let replaced = 0;
    if (markdown) {
      replaced =
        markdownRef.current?.replaceMatches(
          query,
          replacement,
          all ? undefined : sourceMatch,
        ) ?? 0;
      if (replaced && !all && sourceMatch) {
        const updated =
          source.slice(0, sourceMatch.from) +
          replacement +
          source.slice(sourceMatch.to);
        setIndex(
          nextMatchAfterReplacement(
            sourceMatches,
            findTextMatches(updated, query),
            currentIndex,
            replacement,
          ),
        );
      }
    } else {
      const result = store
        .getState()
        .replaceSearchMatches({
          query,
          replacement,
          targetKey: all ? undefined : currentMatch?.key,
          expectedDocument: document,
        });
      if (result.stale) {
        toast.warning({
          key: "resume-search-result",
          content: t("editor.search.stale"),
        });
        return;
      }
      replaced = result.count;
      if (replaced && !all)
        setIndex(
          nextResumeMatchAfterReplacement(
            documentMatches,
            findResumeMatches(store.getState().document, query),
            currentIndex,
            replacement,
          ),
        );
    }
    if (replaced)
      toast.success({
        key: "resume-search-result",
        content: t("editor.search.replaced", { count: replaced }),
      });
    setNavigationRequest((value) => value + 1);
  }

  return {
    open: open && !disabled,
    openSearch,
    close,
    query,
    onQuery,
    replacement,
    setReplacement,
    expanded,
    toggleExpanded: () => setExpanded((value) => !value),
    focusRequest,
    count,
    index: currentIndex,
    currentMatch,
    documentMatches,
    navigate,
    navigationRequest,
    replaceCurrent: () => replace(false),
    replaceAll: () => replace(true),
    markdownRef,
  };
}
