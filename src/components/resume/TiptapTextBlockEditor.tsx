"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";

import Link from "@tiptap/extension-link";
import { EditorContent, type Editor, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { Button, Input, Popover, Tooltip, type InputRef } from "antd";

import { TagOutlined } from "@ant-design/icons";

import { CloseIcon, LinkIcon } from "@/components/ui/InlineIcons";
import { PaletteColorPicker } from "@/components/ui/PaletteColorPicker";
import {
  areRichTextContentsEqual,
  normalizeLinkHref,
  normalizeRichTextContent,
  normalizeTextColor,
} from "@/domain/resume/rich-text";
import type { RichTextContent } from "@/domain/resume/schema";
import { defaultLocale, getMessages } from "@/i18n/messages";

import { useTiptapTextBlockEditorStyles } from "./TiptapTextBlockEditor.style";
import { ResumeIconNode } from "./ResumeIconNode";
import { ResumeInlineTagMark } from "./ResumeInlineTagMark";
import { ResumeTextColorMark } from "./ResumeTextColorMark";

const defaultMessages = getMessages(defaultLocale);

export interface TiptapInlineToolbarLabels {
  applyLink: string;
  ariaLabel: string;
  bold: string;
  boldShortcut: string;
  inlineTag: string;
  inlineTagShortcut: string;
  textColor: string;
  clearTextColor: string;
  colorPalette: string;
  italic: string;
  italicShortcut: string;
  link: string;
  linkPlaceholder: string;
  linkShortcut: string;
  removeLink: string;
  strike: string;
  strikeShortcut: string;
  underline: string;
  underlineShortcut: string;
}

const defaultInlineToolbarLabels: TiptapInlineToolbarLabels = {
  applyLink: defaultMessages["editor.applyLink"],
  ariaLabel: defaultMessages["editor.inlineTextFormatting"],
  bold: defaultMessages["editor.bold"],
  boldShortcut: defaultMessages["editor.boldShortcut"],
  inlineTag: defaultMessages["editor.inlineTag"],
  inlineTagShortcut: defaultMessages["editor.inlineTagShortcut"],
  textColor: defaultMessages["editor.inlineTextColor"],
  clearTextColor: defaultMessages["editor.clearTextColor"],
  colorPalette: defaultMessages["common.colorPalette"],
  italic: defaultMessages["editor.italic"],
  italicShortcut: defaultMessages["editor.italicShortcut"],
  link: defaultMessages["editor.link"],
  linkPlaceholder: defaultMessages["editor.linkPlaceholder"],
  linkShortcut: defaultMessages["editor.linkShortcut"],
  removeLink: defaultMessages["editor.removeLink"],
  strike: defaultMessages["editor.strike"],
  strikeShortcut: defaultMessages["editor.strikeShortcut"],
  underline: defaultMessages["editor.underline"],
  underlineShortcut: defaultMessages["editor.underlineShortcut"],
};

export type TiptapTextBlockEditorCommand =
  | { type: "toggleBold" }
  | { type: "toggleItalic" }
  | { type: "toggleUnderline" }
  | { type: "toggleStrike" }
  | { type: "toggleTag" }
  | { type: "setTextColor"; color: string }
  | { type: "unsetTextColor" }
  | { type: "setLink"; href: string }
  | { type: "upsertLink"; text: string; href: string; title?: string }
  | { type: "unsetLink" }
  | { type: "insertIcon"; iconId: string };

export interface TiptapTextBlockEditorHandle {
  applyCommand: (command: TiptapTextBlockEditorCommand) => boolean;
  prepareLink: () => TiptapLinkContext | undefined;
}

export interface TiptapLinkContext {
  text: string;
  href: string;
  title: string;
}

export const ResumeLinkDialogContext = createContext<
  ((context: TiptapLinkContext) => void) | undefined
>(undefined);

export interface TiptapTextBlockEditorFormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  tag: boolean;
  textColor: string;
  linkHref: string;
}

function createResumeIconInsertion(iconId: string) {
  return [
    {
      type: "resumeIcon",
      attrs: { iconId },
    },
    {
      type: "text",
      text: " ",
    },
  ];
}

type TextSelectionRange = {
  from: number;
  to: number;
};

function prepareLinkForEditor(
  editor: Editor,
  linkSelectionRef: { current: TextSelectionRange | null },
): TiptapLinkContext {
  let hasLink = editor.isActive("link");

  if (editor.state.selection.empty && hasLink) {
    editor.commands.extendMarkRange("link");
  } else if (editor.state.selection.empty) {
    const { from, $from } = editor.state.selection;
    const adjacent = [
      { node: $from.nodeAfter, from },
      { node: $from.nodeBefore, from: from - ($from.nodeBefore?.nodeSize ?? 0) },
    ].find(({ node }) => node?.marks.some((mark) => mark.type.name === "link"));

    if (adjacent?.node) {
      editor.commands.setTextSelection({
        from: adjacent.from,
        to: adjacent.from + adjacent.node.nodeSize,
      });
      hasLink = true;
    }
  }

  const { from, to } = editor.state.selection;
  const attributes = hasLink ? editor.getAttributes("link") : {};

  linkSelectionRef.current = { from, to };

  return {
    text: editor.state.doc.textBetween(from, to, " "),
    href: typeof attributes.href === "string" ? attributes.href : "",
    title: typeof attributes.title === "string" ? attributes.title : "",
  };
}

interface TiptapTextBlockEditorProps {
  ariaLabel?: string;
  className?: string;
  content: RichTextContent;
  inlineToolbarLabels?: TiptapInlineToolbarLabels;
  onChange: (content: RichTextContent) => void;
  onFormattingStateChange?: (state: TiptapTextBlockEditorFormatState) => void;
  style?: CSSProperties;
  wrapperClassName?: string;
}

function getFirstDocumentLinkHref(editor: Editor) {
  const document = normalizeRichTextContent(editor.getJSON());

  for (const paragraph of document.content) {
    for (const node of paragraph.content) {
      if (node.type !== "text") continue;

      const linkMark = node.marks?.find((mark) => mark.type === "link");

      if (typeof linkMark?.attrs?.href === "string") {
        return linkMark.attrs.href;
      }
    }
  }

  return "";
}

function getSelectedLinkHref(editor: Editor) {
  const selectionMarks = editor.state.selection.empty
    ? editor.state.selection.$from.marks()
    : [
        ...editor.state.selection.$from.marks(),
        ...editor.state.selection.$to.marks(),
      ];
  const selectedLinkMark = selectionMarks.find((mark) => mark.type.name === "link");

  if (typeof selectedLinkMark?.attrs.href === "string") {
    return selectedLinkMark.attrs.href;
  }

  const linkAttrs = editor.getAttributes("link");

  if (typeof linkAttrs.href === "string") {
    return linkAttrs.href;
  }

  return getFirstDocumentLinkHref(editor);
}

function getFormattingState(editor: Editor): TiptapTextBlockEditorFormatState {
  const { $from, empty } = editor.state.selection;
  const adjacentTag =
    empty &&
    [$from.nodeBefore, $from.nodeAfter].some((node) =>
      node?.marks.some((mark) => mark.type.name === "tag"),
    );
  const textColorAttributes = editor.getAttributes("textColor");

  return {
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    underline: editor.isActive("underline"),
    strike: editor.isActive("strike"),
    tag: editor.isActive("tag") || Boolean(adjacentTag),
    textColor:
      typeof textColorAttributes.color === "string"
        ? textColorAttributes.color
        : "",
    linkHref: getSelectedLinkHref(editor),
  };
}

function applyEditorStyle(element: HTMLElement, style: CSSProperties | undefined) {
  element.style.margin = "0";

  if (style?.fontSize) {
    element.style.fontSize = `${style.fontSize}px`;
  } else {
    element.style.removeProperty("font-size");
  }

  if (style?.fontWeight) {
    element.style.fontWeight = `${style.fontWeight}`;
  } else {
    element.style.removeProperty("font-weight");
  }

  if (style?.lineHeight) {
    element.style.lineHeight = `${style.lineHeight}`;
  } else {
    element.style.removeProperty("line-height");
  }

  if (style?.color) {
    element.style.color = style.color;
  } else {
    element.style.removeProperty("color");
  }

  if (style?.textAlign) {
    element.style.textAlign = style.textAlign;
  } else {
    element.style.removeProperty("text-align");
  }
}

function preventToolbarMouseDown(event: ReactMouseEvent<HTMLElement>) {
  event.preventDefault();
}

export const TiptapTextBlockEditor = forwardRef<
  TiptapTextBlockEditorHandle,
  TiptapTextBlockEditorProps
>(function TiptapTextBlockEditor({
  ariaLabel = defaultMessages["editor.textBlockEditor"],
  className,
  content,
  inlineToolbarLabels = defaultInlineToolbarLabels,
  onChange,
  onFormattingStateChange,
  style,
  wrapperClassName,
}, ref) {
  const { styles } = useTiptapTextBlockEditorStyles();
  const openLinkDialog = useContext(ResumeLinkDialogContext);
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const linkInputRef = useRef<InputRef>(null);
  const linkSelectionRef = useRef<TextSelectionRange | null>(null);
  const colorSelectionRef = useRef<TextSelectionRange | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        codeBlock: false,
        dropcursor: false,
        gapcursor: false,
        heading: false,
        horizontalRule: false,
        listItem: false,
        link: false,
        orderedList: false,
      }),
      Link.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            title: {
              default: null,
              parseHTML: (element) => element.getAttribute("title"),
              renderHTML: (attributes) =>
                attributes.title ? { title: attributes.title } : {},
            },
          };
        },
      }).configure({
        autolink: false,
        linkOnPaste: false,
        openOnClick: false,
      }),
      ResumeIconNode,
      ResumeInlineTagMark,
      ResumeTextColorMark,
    ],
    content,
    editorProps: {
      attributes: {
        "aria-label": ariaLabel,
        class: className ?? "",
        role: "textbox",
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();

          if (openLinkDialog && editor) {
            openLinkDialog(prepareLinkForEditor(editor, linkSelectionRef));
            return true;
          }

          const { empty, from, to } = _view.state.selection;
          linkSelectionRef.current = empty ? null : { from, to };
          setLinkDraft("");
          setLinkPopoverOpen(true);
          return true;
        }

        return false;
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      onChange(normalizeRichTextContent(nextEditor.getJSON()));
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      prepareLink: () => editor ? prepareLinkForEditor(editor, linkSelectionRef) : undefined,
      applyCommand: (command) => {
        if (!editor) {
          return false;
        }

        if (command.type === "insertIcon") {
          return editor
            .chain()
            .focus(undefined, { scrollIntoView: false })
            .insertContent(createResumeIconInsertion(command.iconId))
            .run();
        }

        const chain = editor.chain().focus();
        const preparedChain = editor.state.selection.empty ? chain.selectAll() : chain;

        switch (command.type) {
          case "toggleBold":
            return preparedChain.toggleBold().run();
          case "toggleItalic":
            return preparedChain.toggleItalic().run();
          case "toggleUnderline":
            return preparedChain.toggleUnderline().run();
          case "toggleStrike":
            return preparedChain.toggleStrike().run();
          case "toggleTag":
            return preparedChain.toggleMark("tag").run();
          case "setTextColor": {
            const color = normalizeTextColor(command.color);

            return color
              ? preparedChain.setMark("textColor", { color }).run()
              : false;
          }
          case "unsetTextColor":
            return preparedChain.unsetMark("textColor").run();
          case "setLink": {
            const href = normalizeLinkHref(command.href);

            return href ? preparedChain.setLink({ href }).run() : false;
          }
          case "upsertLink": {
            const href = normalizeLinkHref(command.href);
            const text = command.text.trim();

            if (!href || !text) return false;

            const range = linkSelectionRef.current ?? editor.state.selection;
            const originalText = editor.state.doc.textBetween(range.from, range.to, " ");
            let linkChain = editor.chain().focus(undefined, { scrollIntoView: false });

            if (originalText !== text) {
              linkChain = linkChain.insertContentAt(range, text);
            }

            const applied = linkChain
              .setTextSelection({ from: range.from, to: range.from + text.length })
              .setLink({
                href,
                title: command.title?.trim() || null,
              })
              .run();

            if (applied) linkSelectionRef.current = null;

            return applied;
          }
          case "unsetLink":
          {
            const range = linkSelectionRef.current;
            const result = (range ? chain.setTextSelection(range) : preparedChain)
              .unsetLink()
              .run();
            linkSelectionRef.current = null;
            return result;
          }
        }
      },
    }),
    [editor],
  );

  useEffect(() => {
    if (!editor || !onFormattingStateChange) return;

    const reportFormattingState = () => {
      onFormattingStateChange(getFormattingState(editor));
    };

    reportFormattingState();
    editor.on("selectionUpdate", reportFormattingState);
    editor.on("transaction", reportFormattingState);

    return () => {
      editor.off("selectionUpdate", reportFormattingState);
      editor.off("transaction", reportFormattingState);
    };
  }, [editor, onFormattingStateChange]);

  useEffect(() => {
    if (!editor) return;

    const nextContent = normalizeRichTextContent(content);
    const currentContent = normalizeRichTextContent(editor.getJSON());

    if (areRichTextContentsEqual(currentContent, nextContent)) {
      return;
    }

    editor.commands.setContent(nextContent, { emitUpdate: false });
  }, [content, editor]);

  useEffect(() => {
    if (!editor) return;

    applyEditorStyle(editor.view.dom as HTMLElement, style);
  }, [editor, style]);

  useLayoutEffect(() => {
    if (!linkPopoverOpen) return;

    const frameId = window.requestAnimationFrame(() => {
      linkInputRef.current?.focus({ cursor: "end" });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [linkPopoverOpen]);

  function runInlineCommand(command: TiptapTextBlockEditorCommand) {
    if (!editor) return;

    const chain = editor.chain().focus();

    switch (command.type) {
      case "toggleBold":
        chain.toggleBold().run();
        break;
      case "toggleItalic":
        chain.toggleItalic().run();
        break;
      case "toggleUnderline":
        chain.toggleUnderline().run();
        break;
      case "toggleStrike":
        chain.toggleStrike().run();
        break;
      case "toggleTag":
        chain.toggleMark("tag").run();
        break;
      case "setTextColor": {
        const color = normalizeTextColor(command.color);

        if (!color) {
          return;
        }

        const savedSelection = colorSelectionRef.current;
        const colorChain = savedSelection
          ? chain.setTextSelection(savedSelection)
          : chain;

        colorChain.setMark("textColor", { color }).run();
        colorSelectionRef.current = null;
        break;
      }
      case "unsetTextColor": {
        const savedSelection = colorSelectionRef.current;
        const colorChain = savedSelection
          ? chain.setTextSelection(savedSelection)
          : chain;

        colorChain.unsetMark("textColor").run();
        colorSelectionRef.current = null;
        break;
      }
      case "setLink": {
        const href = normalizeLinkHref(command.href);

        if (!href) {
          return;
        }

        const savedSelection = linkSelectionRef.current;
        const linkChain = savedSelection
          ? chain.setTextSelection(savedSelection)
          : chain;

        linkChain.setLink({ href }).run();
        linkSelectionRef.current = null;
        setLinkPopoverOpen(false);
        break;
      }
      case "unsetLink":
        chain.unsetLink().run();
        linkSelectionRef.current = null;
        break;
      case "insertIcon":
        editor
          .chain()
          .focus(undefined, { scrollIntoView: false })
          .insertContent(createResumeIconInsertion(command.iconId))
          .run();
        break;
    }
  }

  function openLinkPopover() {
    if (!editor) return;

    if (openLinkDialog) {
      openLinkDialog(prepareLinkForEditor(editor, linkSelectionRef));
      return;
    }

    const { empty, from, to } = editor.state.selection;
    linkSelectionRef.current = empty ? null : { from, to };
    setLinkDraft(getSelectedLinkHref(editor));
    setLinkPopoverOpen(true);
  }

  function rememberColorSelection() {
    if (!editor) return;

    const { empty, from, to } = editor.state.selection;
    colorSelectionRef.current = empty ? null : { from, to };
  }

  return (
    <>
      <EditorContent editor={editor} className={wrapperClassName} style={style} />
      {editor ? (
        <BubbleMenu
          editor={editor}
          role="toolbar"
          aria-label={inlineToolbarLabels.ariaLabel}
          className={styles.inlineToolbar}
          appendTo={() => document.body}
          shouldShow={({ state, view, from, to }) =>
            (linkPopoverOpen && linkSelectionRef.current !== null) ||
            (colorPickerOpen && colorSelectionRef.current !== null) ||
            (view.hasFocus() &&
              !state.selection.empty &&
              Boolean(state.doc.textBetween(from, to).trim()))
          }
          options={{
            strategy: "fixed",
            placement: "top",
            offset: 8,
            flip: true,
            shift: { padding: 12 },
          }}
        >
          <Tooltip title={inlineToolbarLabels.boldShortcut}>
            <Button
              size="small"
              type={editor.isActive("bold") ? "primary" : "text"}
              aria-label={inlineToolbarLabels.bold}
              aria-pressed={editor.isActive("bold")}
              onMouseDown={preventToolbarMouseDown}
              onClick={() => runInlineCommand({ type: "toggleBold" })}
            >
              B
            </Button>
          </Tooltip>
          <Tooltip title={inlineToolbarLabels.italicShortcut}>
            <Button
              size="small"
              type={editor.isActive("italic") ? "primary" : "text"}
              aria-label={inlineToolbarLabels.italic}
              aria-pressed={editor.isActive("italic")}
              onMouseDown={preventToolbarMouseDown}
              onClick={() => runInlineCommand({ type: "toggleItalic" })}
            >
              <i>I</i>
            </Button>
          </Tooltip>
          <Tooltip title={inlineToolbarLabels.inlineTagShortcut}>
            <Button
              size="small"
              type={editor.isActive("tag") ? "primary" : "text"}
              aria-label={inlineToolbarLabels.inlineTag}
              aria-pressed={editor.isActive("tag")}
              onMouseDown={preventToolbarMouseDown}
              onClick={() => runInlineCommand({ type: "toggleTag" })}
            >
              <TagOutlined />
            </Button>
          </Tooltip>
          <Tooltip title={inlineToolbarLabels.underlineShortcut}>
            <Button
              size="small"
              type={editor.isActive("underline") ? "primary" : "text"}
              aria-label={inlineToolbarLabels.underline}
              aria-pressed={editor.isActive("underline")}
              onMouseDown={preventToolbarMouseDown}
              onClick={() => runInlineCommand({ type: "toggleUnderline" })}
            >
              <span style={{ textDecoration: "underline" }}>U</span>
            </Button>
          </Tooltip>
          <Tooltip title={inlineToolbarLabels.strikeShortcut}>
            <Button
              size="small"
              type={editor.isActive("strike") ? "primary" : "text"}
              aria-label={inlineToolbarLabels.strike}
              aria-pressed={editor.isActive("strike")}
              onMouseDown={preventToolbarMouseDown}
              onClick={() => runInlineCommand({ type: "toggleStrike" })}
            >
              <span style={{ textDecoration: "line-through" }}>S</span>
            </Button>
          </Tooltip>
          <div onMouseDownCapture={rememberColorSelection}>
            <PaletteColorPicker
              allowClear
              className={styles.inlineColorControl}
              label={inlineToolbarLabels.textColor}
              paletteLabel={inlineToolbarLabels.colorPalette}
              placement="top"
              value={getFormattingState(editor).textColor}
              placeholder={style?.color ?? "#0f172a"}
              onOpenChange={(open) => {
                if (open) {
                  rememberColorSelection();
                }

                setColorPickerOpen(open);
              }}
              onChange={(color) =>
                runInlineCommand({ type: "setTextColor", color })
              }
              onClear={() => runInlineCommand({ type: "unsetTextColor" })}
            />
          </div>
          <Tooltip title={inlineToolbarLabels.clearTextColor}>
            <Button
              size="small"
              type="text"
              aria-label={inlineToolbarLabels.clearTextColor}
              onMouseDown={preventToolbarMouseDown}
              onClick={() => runInlineCommand({ type: "unsetTextColor" })}
            >
              <CloseIcon size={15} />
            </Button>
          </Tooltip>
          <Popover
            open={linkPopoverOpen}
            trigger={[]}
            placement="top"
            autoAdjustOverflow={false}
            destroyOnHidden
            content={
              <div className={styles.inlineToolbarLinkForm}>
                <Input
                  ref={linkInputRef}
                  aria-label={inlineToolbarLabels.link}
                  placeholder={inlineToolbarLabels.linkPlaceholder}
                  value={linkDraft}
                  onChange={(event) => setLinkDraft(event.target.value)}
                  onPressEnter={() => {
                    const href = linkDraft.trim();

                    if (href) {
                      runInlineCommand({ type: "setLink", href });
                    }
                  }}
                />
                <Button
                  type="primary"
                  onMouseDown={preventToolbarMouseDown}
                  onClick={() => {
                    const href = linkDraft.trim();

                    if (href) {
                      runInlineCommand({ type: "setLink", href });
                    }
                  }}
                >
                  {inlineToolbarLabels.applyLink}
                </Button>
              </div>
            }
          >
            <Tooltip title={linkPopoverOpen ? null : inlineToolbarLabels.linkShortcut}>
              <Button
                size="small"
                type={editor.isActive("link") ? "primary" : "text"}
                aria-label={inlineToolbarLabels.link}
                aria-pressed={editor.isActive("link")}
                onMouseDown={preventToolbarMouseDown}
                onClick={openLinkPopover}
              >
                <LinkIcon size={15} />
              </Button>
            </Tooltip>
          </Popover>
          {editor.isActive("link") ? (
            <Button
              size="small"
              type="text"
              aria-label={inlineToolbarLabels.removeLink}
              onMouseDown={preventToolbarMouseDown}
              onClick={() => runInlineCommand({ type: "unsetLink" })}
            >
              <CloseIcon size={15} />
            </Button>
          ) : null}
        </BubbleMenu>
      ) : null}
    </>
  );
});
