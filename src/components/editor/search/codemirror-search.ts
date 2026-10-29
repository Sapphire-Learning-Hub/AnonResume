import { isolateHistory } from "@codemirror/commands";
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { findTextMatches } from "@/domain/resume/search/match";
import type {
  ResumeSearchQuery,
  TextSearchMatch,
} from "@/domain/resume/search/types";
import type { MarkdownSearchHandle } from "./markdown-search";

const queryEffect = StateEffect.define<ResumeSearchQuery | null>();
const currentEffect = StateEffect.define<TextSearchMatch>();
interface SearchState {
  query: ResumeSearchQuery | null;
  current: TextSearchMatch | null;
  decorations: DecorationSet;
}

export const markdownSearchExtension = StateField.define<SearchState>({
  create: () => ({ query: null, current: null, decorations: Decoration.none }),
  update(value, transaction) {
    let { query, current } = value;
    let changed = transaction.docChanged;
    for (const effect of transaction.effects) {
      if (effect.is(queryEffect)) {
        query = effect.value;
        current = null;
        changed = true;
      }
      if (effect.is(currentEffect)) {
        current = effect.value;
        changed = true;
      }
    }
    if (!changed) return value;
    const matches = query
      ? findTextMatches(transaction.state.doc.toString(), query)
      : [];
    return {
      query,
      current,
      decorations: Decoration.set(
        matches.map((match) =>
          Decoration.mark({
            class: "cm-resume-search-match",
            attributes: {
              "data-current": String(
                match.from === current?.from && match.to === current.to,
              ),
            },
          }).range(match.from, match.to),
        ),
      ),
    };
  },
  provide: (field) =>
    EditorView.decorations.from(field, (value) => value.decorations),
});

export function createMarkdownSearchHandle(
  getView: () => EditorView | null,
): MarkdownSearchHandle {
  return {
    setQuery(query) {
      const view = getView();
      if (!view) return;
      const previous = view.state.field(markdownSearchExtension).query;
      if (
        previous?.text === query?.text &&
        previous?.caseSensitive === query?.caseSensitive
      )
        return;
      view.dispatch({ effects: queryEffect.of(query) });
    },
    selectMatch(match) {
      const view = getView();
      if (!view || view.state.sliceDoc(match.from, match.to) !== match.text)
        return;
      view.dispatch({
        effects: [
          currentEffect.of(match),
          EditorView.scrollIntoView(match.from, { y: "center" }),
        ],
      });
    },
    replaceMatches(query, replacement, target) {
      const view = getView();
      if (!view) return 0;
      const matches = findTextMatches(view.state.doc.toString(), query).filter(
        (match) =>
          match.text !== replacement &&
          (!target ||
            (match.from === target.from &&
              match.to === target.to &&
              match.text === target.text)),
      );
      if (!matches.length) return 0;
      view.dispatch({
        changes: matches.map(({ from, to }) => ({
          from,
          to,
          insert: replacement,
        })),
        annotations: isolateHistory.of("full"),
      });
      return matches.length;
    },
  };
}
