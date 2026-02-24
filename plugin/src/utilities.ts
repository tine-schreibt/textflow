import {
  App,
  Editor,
  MarkdownView,
  normalizePath,
  Notice,
  TFile,
  WorkspaceLeaf,
} from "obsidian";
import { EditorView } from "@codemirror/view";
import TextFlow from "../main";
import * as Types from "./types";
import path, { dirname, basename } from "path";

// This file contains a cornucopia of functions that are needed in various classes yet don't thematically fit in any of them
//-----------------------------------------------------------------------------------------
// TOC
//-----------------------------------------------------------------------------------------
// restoreCursorPos
// scrollToPos
// safeCreateOrModifyFile
// exportFlow
// selectActiveRegion
// getLeafId
// getEditorView
// callStack
// updateScrollbarVisibility
// getTimestamp
// explorerDecoArray

export class utilities {
  constructor(
    private plugin: TextFlow,
    private app: App,
  ) {}
  // -------- Restore cursorPos for known and unknown leafIDs
  restoreCursorPos = (flowName: string, view: MarkdownView, leafID: string) => {
    if (
      this.plugin.settings.flows[flowName].persistentCursors &&
      this.plugin.settings.flows[flowName].persistentCursors[leafID]
    ) {
      const editor = view.editor as Types.ObsidianEditor;
      const cmEditor = editor.cm;
      if (cmEditor) {
        const cursorPos =
          this.plugin.settings.flows[flowName].persistentCursors[leafID]
            .cursors[0][1];

        if (cursorPos !== undefined && cursorPos >= 0) {
          this.scrollToPos(editor, cursorPos);
        }
      }
    } else {
      // get the most recent time stamp for the active flow
      const timestampArray: number[] = [];
      if (
        Object.keys(this.plugin.settings.flows[flowName].persistentCursors)
          .length > 0
      ) {
        Object.keys(
          this.plugin.settings.flows[flowName].persistentCursors,
        ).forEach((leafID) => {
          timestampArray.push(
            this.plugin.settings.flows[flowName].persistentCursors[leafID]
              .update,
          );
        });

        // sort the timestamps in reverse order so newest timestamp comes first
        timestampArray.sort((a, b) => b - a);

        const mostRecentTimestamp: number = timestampArray[0];
        let mostRecentCursor: number = 0;
        if (this.plugin.settings.flows[flowName].persistentCursors) {
          Object.keys(
            this.plugin.settings.flows[flowName].persistentCursors,
          ).forEach((leafID) => {
            if (
              this.plugin.settings.flows[flowName].persistentCursors[leafID]
                .update === mostRecentTimestamp
            ) {
              mostRecentCursor =
                this.plugin.settings.flows[flowName].persistentCursors[leafID]
                  .cursors[0][1];
            }
          });
        }

        const editor = view.editor as Types.ObsidianEditor;
        mostRecentCursor ? this.scrollToPos(editor, mostRecentCursor) : "";
      }
    }
  };

  // this function was written by Claude 3.5 Sonnet
  scrollToPos = (
    editor: Types.ObsidianEditor,
    cursorPos: number,
    dontFocus?: boolean,
  ) => {
    if (!editor.cm) return;
    if (editor.cm.state.doc.length === 0) return; // if the doc hasn't loaded yet; error when opening flow in new tab
    const cmEditor = editor.cm;
    if (!cmEditor) return; // It wants this checked, too, so we check it

    if (cursorPos !== undefined && cursorPos >= 0) {
      const line = cmEditor.state.doc.lineAt(Math.max(0, cursorPos));
      const targetPos = line.from;

      // Get current viewport info
      const viewport = cmEditor.viewport;

      // Calculate the target scroll position
      const targetLine = line.number;
      const lineHeight = cmEditor.defaultLineHeight;

      // Set selection and try to scroll using CodeMirror's way, so CodeMirror knows where we're at
      cmEditor.dispatch({
        selection: { anchor: targetPos, head: targetPos },
        effects: EditorView.scrollIntoView(targetPos, {
          y: "start",
          yMargin: lineHeight * 2,
        }),
      });

      // Then immediately use DOM scrolling as a forced backup
      // b/c sometimes the first scroll ends up with negative coordinates for some reason
      const scrollDOM = cmEditor.scrollDOM;
      const targetScrollTop = (targetLine - 1) * lineHeight;
      scrollDOM.scrollTop = targetScrollTop;

      if (!dontFocus) {
        cmEditor.focus();
      }
    }
  };

  safeCreateOrModifyFile = async (path: string, newContent: string) => {
    try {
      // this.callStack("safeCreateFile");
      const existingFile = this.app.vault.getAbstractFileByPath(path);
      this.plugin.textFlowOperation = true;

      if (existingFile instanceof TFile) {
        // check if the file is open
        const leaves = this.app.workspace.getLeavesOfType("markdown");
        for (const leaf of leaves) {
          await leaf.loadIfDeferred();
          if (
            leaf.view instanceof MarkdownView &&
            leaf.view.file?.path === path
          ) {
            const editor = leaf.view.editor as Types.ObsidianEditor;
            editor.setValue(newContent);
            return;
          }
        }
        // if the file exists but is not open, we get to here
        await this.app.vault.process(existingFile, (content) => {
          return newContent;
        });
      } else {
        this.plugin.textFlowOperation = true;
        await this.app.vault.create(path, newContent);
        this.plugin.textFlowOperation = false;
      }
    } catch (error) {
      console.error(`Failed to create/modify file at ${path}:`, error);
      throw error;
    }
  };
  // export active flow

  exportFlow = async (flowName: string) => {
    const path = this.plugin.settings.flows[flowName].flowFilePath;
    const file = this.app.vault.getAbstractFileByPath(path);

    if (file instanceof TFile) {
      const fileContent: string = await this.app.vault.read(file);
      const stripUUIDs = (text: string): string => {
        const uuidPattern =
          /[\u200B\u200C\u200D\u2060\u2061\u2062\u2063\u2064\uFEFF\u00A0]{46}/g;
        const result = text.replace(uuidPattern, "\n");
        return result;
      };

      const cleanContent = stripUUIDs(fileContent);

      const yaml = ""; //`---\ntextFlowExport: true\n---`;
      const contentWithYaml = `${yaml}\n${cleanContent}`;

      const exportedFlowPath = normalizePath(
        `${flowName}_export_${this.getTimestamp()}.md`,
      );
      await this.safeCreateOrModifyFile(exportedFlowPath, contentWithYaml);
      new Notice(
        this.plugin.t("menubar.selectButton.notice successful export", {
          exportedFlowPath: exportedFlowPath,
        }),
      );
    }
  };

  selectActiveRegion = (
    flowName: string,
    path: string,
    text: string,
    viewDotEditor: Editor,
  ) => {
    // notify of failure du to tracking error
    if (this.plugin.flowOutOfSync.includes(flowName)) {
      new Notice(
        this.plugin.t("menuBar.selectActiveRegion tracking error", {
          flowName: flowName,
        }),
      );
      return;
    }
    const map = this.plugin.settings.flows[flowName].flowMap;

    const startPos = this.plugin.findStartOfRegion(
      this.plugin.settings.flows[flowName],
      this.plugin.settings.flows[flowName].flowMap[path].flowOrder,
      text,
    );
    const endPos = text.indexOf(map[path].invisibleUUID) - 1; // subtract 1 for the \r before the UID

    if (startPos && endPos) {
      const cmView = this.getEditorView(viewDotEditor);
      if (cmView) {
        // Type guard for ObsidianEditor
        try {
          cmView.dispatch({
            selection: { anchor: startPos + 1, head: endPos },
            scrollIntoView: true, // Optional: scroll the selection into view
          });
          cmView.focus(); // Optional: focus the editor
        } catch (error) {
          console.error("Failed to set selection:", error);
        }
      }
    }
  };

  //---------------------
  // robot told me these would help to keep the scope clean with regards to type
  getLeafId = (leaf: WorkspaceLeaf): Types.LeafId => {
    return (leaf as any).id as Types.LeafId;
  };

  getEditorView = (editor: Editor): EditorView | null => {
    const cm = (editor as Types.EditorWithCM).cm;
    return cm instanceof EditorView ? cm : null;
  };

  callStack = (recipient: string) => {
    const stack = new Error().stack;
    if (!stack) return;
    console.log(recipient, stack, Date.now());
  };

  //-----------
  updateScrollbarVisibility = async () => {
    // Handle all leaves
    // add hider if all are hidden
    if (this.plugin.settings.hideScrollbar === "all") {
      const body = document.body;
      body.classList.remove("hide-scrollbar");
      body.classList.add("hide-scrollbar");
    } else {
      // otherwise remove hiding from class list
      const body = document.body;
      body.classList.remove("hide-scrollbar");

      // then check for container classes
      const allLeaves = this.app.workspace.getLeavesOfType("markdown");
      for (let leaf of allLeaves) {
        await leaf.loadIfDeferred();
        if (leaf.view instanceof MarkdownView && leaf.view.file) {
          // check if it's a flow
          const flowName = this.plugin.isFlowFile(leaf.view.file.path);
          if (!flowName) {
            // remove the class
            leaf.view.containerEl.removeClass("hide-scrollbar");
            continue;
          }

          // If the leaf is a flow and we want to hide
          if (this.plugin.settings.hideScrollbar === "flows") {
            if (!leaf.view.containerEl.hasClass("hide-scrollbar")) {
              leaf.view.containerEl.addClass("hide-scrollbar");
            }
          } else {
            // unhide it
            leaf.view.containerEl.removeClass("hide-scrollbar");
          }
        }
      }
    }
  };

  // this was written by Claude 3.5 Sonnet
  getTimestamp = (timestamp?: number): string => {
    const date = new Date(timestamp || Date.now());

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${year}-${month}-${day}_${hours}-${minutes}`;
  };

  // The arrays with the deco stuff, which I made, by hand. I like pain sometimes.
  explorerDecoArray: Types.DecorationEntry[] = [
    ["--", "", "large-high-contrast-neutral", "large-high-contrast-unsynced"],

    ["○", "●", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["○", "●", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["○", "●", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["○", "●", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["☆", "★", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["☆", "★", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["☆", "★", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["☆", "★", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["◇", "◆", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["◇", "◆", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["◇", "◆", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["◇", "◆", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["❀", "✿", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["❀", "✿", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["❀", "✿", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["❀", "✿", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["❄", "❆", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["❄", "❆", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["❄", "❆", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["❄", "❆", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["❝", "❞", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["❝", "❞", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["❝", "❞", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["❝", "❞", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["❤", "❤", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["❤", "❤", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["❤", "❤", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["❤", "❤", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["☯", "☯", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["☯", "☯", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["☯", "☯", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["☯", "☯", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["☮", "☮", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["☮", "☮", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["☮", "☮", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["☮", "☮", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["✈", "✈", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["✈", "✈", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["✈", "✈", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["✈", "✈", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["♪", "♫", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["♪", "♫", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["♪", "♫", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["♪", "♫", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["☠", "☠", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["☠", "☠", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["☠", "☠", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["☠", "☠", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["⚐", "⚑", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["⚐", "⚑", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["⚐", "⚑", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["⚐", "⚑", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["⚕", "⚕", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["⚕", "⚕", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["⚕", "⚕", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["⚕", "⚕", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["⚖", "⚖", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["⚖", "⚖", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["⚖", "⚖", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["⚖", "⚖", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["⚝", "⚝", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["⚝", "⚝", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["⚝", "⚝", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["⚝", "⚝", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["⚓", "⚓", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["⚓", "⚓", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["⚓", "⚓", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["⚓", "⚓", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["⚔", "⚔", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["⚔", "⚔", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["⚔", "⚔", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["⚔", "⚔", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["⚛", "⚛", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["⚛", "⚛", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["⚛", "⚛", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["⚛", "⚛", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["☣", "☣", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["☣", "☣", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["☣", "☣", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["☣", "☣", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["▒", "▓", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["▒", "▓", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["▒", "▓", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["▒", "▓", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["∈", "∈", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["∈", "∈", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["∈", "∈", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["∈", "∈", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["∑", "∑", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["∑", "∑", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["∑", "∑", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["∑", "∑", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["∧", "∨", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["∧", "∨", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["∧", "∨", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["∧", "∨", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["∫", "∫", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["∫", "∫", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["∫", "∫", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["∫", "∫", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["=", "≠", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["=", "≠", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["=", "≠", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["=", "≠", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    [".", "?", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    [".", "?", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    [".", "?", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    [".", "?", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    [".", "!", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    [".", "!", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    [".", "!", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    [".", "!", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["#", "#", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["#", "#", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["#", "#", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["#", "#", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["*", "*", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["*", "*", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["*", "*", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["*", "*", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["→", "←", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["→", "←", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["→", "←", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["→", "←", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["←", "→", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["←", "→", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["←", "→", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["←", "→", "small-low-contrast-neutral", "small-low-contrast-unsynced"],
  ];
}
