"use client";

import { Button } from "antd";
import { Fragment, useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

import { DraftInput } from "@/components/editor/inspector/DraftInput";
import { WorkspaceBackIcon } from "@/components/ui/InlineIcons";

import { useEditorRibbonStyles } from "./EditorRibbon.style";

export type EditorRibbonTab = "home" | "insert" | "design" | "layout" | "document" | "context";

export type EditorRibbonTabItem = {
  key: EditorRibbonTab;
  label: string;
  icon?: ReactNode;
};

export type EditorRibbonGroup = {
  key: string;
  label: string;
  content: ReactNode;
  embedded?: boolean;
};

function wheelDistance(event: WheelEvent, viewportWidth: number) {
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return 0;
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * viewportWidth;
  }
  return event.deltaY;
}

function enableHorizontalWheelScrolling(viewport: HTMLDivElement) {
  const handleWheel = (event: WheelEvent) => {
    const maxScrollLeft = Math.max(
      0,
      viewport.scrollWidth - viewport.clientWidth,
    );
    const distance = wheelDistance(event, viewport.clientWidth);
    if (maxScrollLeft === 0 || distance === 0) return;

    const nextScrollLeft = Math.min(
      maxScrollLeft,
      Math.max(0, viewport.scrollLeft + distance),
    );
    if (nextScrollLeft === viewport.scrollLeft) return;

    viewport.scrollLeft = nextScrollLeft;
    event.preventDefault();
  };

  viewport.addEventListener("wheel", handleWheel, { passive: false });
  return () => viewport.removeEventListener("wheel", handleWheel);
}

export function EditorRibbonPropertyGroup({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const { styles } = useEditorRibbonStyles();

  return (
    <section aria-label={label} className={styles.propertyGroup} role="group">
      <div className={styles.propertyGroupBody}>{children}</div>
      <span className={styles.propertyGroupLabel}>{label}</span>
    </section>
  );
}

export type EditorRibbonSaveTone =
  | "neutral"
  | "warning"
  | "processing"
  | "success"
  | "error";

export function EditorRibbon({
  activeTab,
  backHref,
  backLabel,
  commandGroups,
  documentActions,
  documentName,
  documentNameLabel,
  quickActions,
  saveStatus,
  saveStatusTone = "neutral",
  tabs,
  tablistLabel,
  onDocumentNameChange,
  onTabChange,
}: {
  activeTab: EditorRibbonTab;
  backHref: string;
  backLabel: string;
  commandGroups: EditorRibbonGroup[];
  documentActions: ReactNode;
  documentName: string;
  documentNameLabel: string;
  quickActions: ReactNode;
  saveStatus: string;
  saveStatusTone?: EditorRibbonSaveTone;
  tabs: EditorRibbonTabItem[];
  tablistLabel: string;
  onDocumentNameChange: (name: string) => void;
  onTabChange: (tab: EditorRibbonTab) => void;
}) {
  const { styles } = useEditorRibbonStyles();
  const documentViewportRef = useRef<HTMLDivElement>(null);
  const tabsViewportRef = useRef<HTMLDivElement>(null);
  const commandViewportRef = useRef<HTMLDivElement>(null);
  const activeTabItem = tabs.find((tab) => tab.key === activeTab) ?? tabs[0];

  useEffect(() => {
    const viewports = [
      documentViewportRef.current,
      tabsViewportRef.current,
      commandViewportRef.current,
    ];
    const cleanups = viewports
      .filter((viewport): viewport is HTMLDivElement => viewport !== null)
      .map(enableHorizontalWheelScrolling);
    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentTab: EditorRibbonTab,
  ) {
    const currentIndex = tabs.findIndex((tab) => tab.key === currentTab);
    let nextIndex: number | undefined;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    }

    if (nextIndex === undefined) return;

    const nextTab = tabs[nextIndex];

    if (!nextTab) return;

    event.preventDefault();
    onTabChange(nextTab.key);
    document.getElementById(`editor-ribbon-tab-${nextTab.key}`)?.focus();
  }

  return (
    <header className={styles.ribbon} data-testid="editor-ribbon">
      <div className={styles.documentBar} ref={documentViewportRef}>
        <Button
          aria-label={backLabel}
          className={styles.backButton}
          href={backHref}
          title={backLabel}
          type="text"
        >
          <WorkspaceBackIcon size={18} />
        </Button>
        <div className={styles.quickActions}>{quickActions}</div>
        <div className={styles.identity}>
          <DraftInput
            aria-label={documentNameLabel}
            className={styles.documentName}
            data-testid="resume-title-input"
            title={documentName}
            value={documentName}
            parseValue={(name) => (name.trim() ? name : undefined)}
            onValidValueChange={onDocumentNameChange}
          />
          <span
            className={styles.saveStatus}
            data-status-tone={saveStatusTone}
            data-testid="resume-save-status"
          >
            {saveStatus}
          </span>
        </div>
        <div className={styles.documentActions}>{documentActions}</div>
      </div>

      <div className={styles.tabsViewport} ref={tabsViewportRef}>
        <div aria-label={tablistLabel} className={styles.tablist} role="tablist">
          {tabs.map((tab) => (
            <button
              aria-controls="editor-ribbon-command-panel"
              aria-selected={tab.key === activeTab}
              className={styles.tab}
              data-contextual={tab.key === "context" ? "true" : undefined}
              id={`editor-ribbon-tab-${tab.key}`}
              key={tab.key}
              role="tab"
              tabIndex={tab.key === activeTab ? 0 : -1}
              type="button"
              onClick={() => onTabChange(tab.key)}
              onKeyDown={(event) => handleTabKeyDown(event, tab.key)}
            >
              {tab.icon ? <span className={styles.tabIcon}>{tab.icon}</span> : null}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.commandViewport} ref={commandViewportRef}>
        <div
          aria-label={activeTabItem?.label}
          aria-labelledby={`editor-ribbon-tab-${activeTab}`}
          className={styles.commandSurface}
          id="editor-ribbon-command-panel"
          role="tabpanel"
        >
          {commandGroups.map((group) => group.embedded ? (
            <Fragment key={group.key}>{group.content}</Fragment>
          ) : (
              <section className={styles.commandGroup} key={group.key}>
                <div className={styles.commandBody}>{group.content}</div>
                <span className={styles.commandLabel}>{group.label}</span>
              </section>
            ))}
        </div>
      </div>
    </header>
  );
}
