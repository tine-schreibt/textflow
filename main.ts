import {
  App,
  Editor,
  EventRef,
  FileView,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  setIcon,
  Setting,
  TFolder,
  WorkspaceLeaf,
  TFile,
} from "obsidian";
import { TextFlowSettingsTab } from "./src/settingsTab";
import { TextFlowSettings, DEFAULT_SETTINGS } from "./src/types";
import {
  EditorView,
  Decoration,
  DecorationSet,
  ViewUpdate,
  ViewPlugin,
} from "@codemirror/view";
import {
  combineConfig,
  EditorState,
  StateEffect,
  StateField,
  Transaction,
} from "@codemirror/state";
import * as Types from "src/types";
import * as Modals from "src/modals";
// import { TextFlow } from "./src/flowMaker";

interface ObsidianEditor extends Editor {
  cm?: EditorView;
}

// You can also create more specific types for your use cases:
interface CodeMirrorCursor {
  line: number;
  ch: number;
}

interface ListenerBasketItem {
  plugin: ViewPlugin<any>;
  extension: StateEffect<any>;
}

export default class TextFlowPlugin extends Plugin {
  settings: TextFlowSettings;
  tempFilePath: string;

  // ---------------- Global objects and variables -------------------------
  private cursorResetTracker: string[] = [];
  private scrollToConstituent: boolean;
  private lastShiftTime: number = 0;
  private shiftDebounceTime: number = 300;
  private wakingUp: boolean = true;
  // ----------------- tracking read-only ranges --------------------------
  private hadTrackingError: boolean = false; // Add this line
  private readOnlyHighlight = Decoration.mark({
    class: "cm-read-only-region",
  });

  private readOnlyRanges = StateField.define<{
    ranges: Array<{ from: number; to: number }>;
    decorations: DecorationSet;
  }>({
    create: () => ({
      ranges: [],
      decorations: Decoration.none,
    }),
    update: (state, tr) => {
      let ranges = state.ranges;

      // Handle range updates
      for (let e of tr.effects) {
        if (e.is(this.updateRangesEffect)) {
          ranges = e.value;
        }
      }

      // Create decorations from ranges, but normalize position 0
      const decorations = Decoration.set(
        ranges.map((range) =>
          this.readOnlyHighlight.range(
            Math.max(0, range.from), // Ensure decoration starts at 0 minimum
            range.to
          )
        )
      );

      return {
        ranges,
        decorations,
      };
    },
    provide: (state) =>
      EditorView.decorations.from(state, (value) => value.decorations),
  });

  private updateRangesEffect =
    StateEffect.define<Array<{ from: number; to: number }>>();

  // ---------------- Functions ------------------------------------
  // ---------------- Functions: Utilities -------------------------
  async loadSettings(): Promise<TextFlowSettings> {
    const loaded = await this.loadData();
    const mergedSettings = Object.assign({}, DEFAULT_SETTINGS, loaded);
    return mergedSettings;
  }
  // ---------------------------------------------------------------
  async saveSettings() {
    await this.saveData(this.settings);
  }
  // ---------------------------------------------------------------
  async ensureTempFolder() {
    if (this.settings.tempFolderPlace !== undefined) {
      const tempFolderPath: string = `${this.settings.tempFolderPlace}/x_textFlowTemp`;
      try {
        let folder = this.app.vault.getAbstractFileByPath(tempFolderPath);
        if (!folder) {
          await this.app.vault.createFolder(tempFolderPath);
        } else if (!(folder instanceof TFolder)) {
          throw new Error(`"${tempFolderPath}" exists but is not a folder.`);
        }
      } catch (error) {
        console.error(`Error handling temp folder: ${error.message}`);
        // new Notice("Failed to create or verify temp folder");
      }
    }
  }

  // ---------------- Functions: Utilities: UI -------------------------
  // ----- is called onload
  discernAndSetTempFolderState = (
    tempFolderState?: boolean,
    tempFolderPlace?: string
  ): void => {
    // Remove any existing style
    const existingStyle = document.head.querySelector(
      "style[data-textflow-temp]"
    );
    if (existingStyle) {
      existingStyle.remove();
    }

    // If we're not hiding or don't have a place defined, just return after removing style
    if (!tempFolderState || tempFolderPlace === undefined) {
      return;
    }

    let hiddenStyle = document.createElement("style");
    hiddenStyle.setAttribute("data-textflow-temp", "true");

    // Construct the full path
    let tempFolderPath = tempFolderPlace
      ? `${tempFolderPlace}/x_textFlowTemp`
      : "x_textFlowTemp";

    // More specific CSS selector that only targets the temp folder and its direct children
    hiddenStyle.textContent = `
			div[data-path='${tempFolderPath}'],
			div[data-path^='${tempFolderPath}/'] {
				display: none !important;
			}
		`;

    document.head.appendChild(hiddenStyle);
  };

  // ------------- persist cursor position --------
  private persistCursorPosition = () => {
    Object.entries(this.settings.flows).map(([name, flow]) => ({
      name,
      hasActiveRegion: !!flow.activeRegion,
      persistentCursorPos: flow.persistentCursorPos,
    }));

    for (const [flowName, flow] of Object.entries(
      this.settings.flows as Record<string, Types.FlowDef>
    )) {
      if (flow.activeRegion?.lastCursorPosition !== undefined) {
        flow.persistentCursorPos = flow.activeRegion.lastCursorPosition;
      }
    }
  };

  // ---------------- Functions: Listeners -------------------------
  // ---------------- Functions: Listeners: Global -----------------

  addListeners() {
    // ---------------- File mod -------------------------------
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        console.log(`File modified: ${file.path}`);
      })
    );
    // ---------------- Layout change (tab closure) -------------------------------

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", async (leaf) => {
        if (leaf?.view instanceof MarkdownView) {
          const activeLeafPath = leaf.view.file?.path;

          if (activeLeafPath) {
            const flowName = this.isFlowFile(activeLeafPath);
            if (flowName) {
              this.setupFlowView(flowName, leaf.view);
            } else {
              // Check if this is a constituent file of any active flow
              for (const [flowName, flow] of Object.entries(
                this.settings.flows
              )) {
                if (
                  flow.flowMap[activeLeafPath] &&
                  this.settings.activeFlows.includes(flowName)
                ) {
                  // Found an orphaned constituent file
                  const handleOrphanedFileClick =
                    new Modals.HandleOrphanedFiles(
                      this.app,
                      flow.flowFilePath,
                      activeLeafPath,
                      this.settings.flows[flowName],
                      flowName
                    );
                  break;
                }
              }
            }
          }
        }
      })
    );

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", async (leaf) => {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView?.file) {
          const flowName = this.isFlowFile(activeView.file.path);
          if (
            flowName &&
            !this.scrollToConstituent &&
            !this.cursorResetTracker.includes(flowName)
          ) {
            const startPos = this.settings.flows[flowName].persistentCursorPos;

            // Add safety checks
            const editor = activeView.editor;
            const cmEditor = (editor as any).cm;
            if (editor && cmEditor && startPos !== undefined) {
              // Check if document is loaded and has content
              if (cmEditor.state.doc.length > 0) {
                // Make sure position is within bounds
                const safePos = Math.min(
                  startPos,
                  cmEditor.state.doc.length - 1
                );

                const cursorPos = editor.offsetToPos(safePos);
                editor.setCursor(cursorPos);

                const line = cmEditor.state.doc.lineAt(safePos);
                const targetPos = line.from;

                cmEditor.dispatch({
                  selection: { anchor: targetPos },
                  effects: EditorView.scrollIntoView(targetPos, {
                    y: "start",
                    yMargin: 0,
                  }),
                });
                console.log(
                  `active-leaf-change set cursor pos, scrolled to ${targetPos}`
                );
              } else {
                // Document not ready, try again in a moment
                setTimeout(() => {
                  // Retry the cursor setting
                  if (cmEditor.state.doc.length > 0) {
                    const safePos = Math.min(
                      startPos,
                      cmEditor.state.doc.length - 1
                    );
                    const cursorPos = editor.offsetToPos(safePos);
                    editor.setCursor(cursorPos);

                    const line = cmEditor.state.doc.lineAt(safePos);
                    const targetPos = line.from;
                    console.log(
                      `active-leaf-change set cursor pos after delay, scrolled to ${targetPos}`
                    );

                    cmEditor.dispatch({
                      selection: { anchor: targetPos },
                      effects: EditorView.scrollIntoView(targetPos, {
                        y: "start",
                        yMargin: 0,
                      }),
                    });
                  }
                }, 500);
                console.log("listener set cursor pos after delay");
              }
            }
            this.cursorResetTracker.push(flowName);
            console.log(this.cursorResetTracker);
          }
        }
      })
    );
  }

  // ---------------- Functions: Listeners: Individual ----------

  // leaf.view as MarkdownView
  listenerBasket: { [key: string]: ListenerBasketItem } = {};

  private addCursorListener = (leaf: MarkdownView | null) => {
    if (!leaf) {
      return;
    }
    const editor = leaf?.editor as ObsidianEditor | null;
    if (!editor) {
      return;
    }
    const cmEditor = editor.cm;
    if (!cmEditor) {
      return;
    }
    const activeLeafPath = leaf.file?.path;

    if (activeLeafPath && this.listenerBasket[activeLeafPath]) {
      return;
    }

    if (activeLeafPath !== undefined) {
      let isItFlow = this.isFlowFile(activeLeafPath);

      if (cmEditor && isItFlow) {
        const plugin = this;
        let lastCursorPosition: number | null = null;
        let debounceTimeout: NodeJS.Timeout | null = null;

        const navigationListener = ViewPlugin.fromClass(
          class {
            constructor(view: EditorView) {
              try {
                // Any initialization if needed
              } catch (error) {
                console.error("Error initializing navigation listener:", error);
                new Notice(
                  "TextFlow Plugin Critical Error:\n " +
                    "Flow tracking system failed.\n" +
                    "1. Close the flow immediately\n" +
                    "2. Close and reopen your vault\n" +
                    "3. Verify your flow\n\n" +
                    "If this error persists, please report it on github.",
                  20000 // Show for 10 seconds
                );
                throw error;
              }
            }

            update(update: ViewUpdate) {
              try {
                if (update.selectionSet) {
                  const cursorOffset = update.state.selection.main.from;

                  if (cursorOffset !== lastCursorPosition) {
                    lastCursorPosition = cursorOffset;

                    if (debounceTimeout) {
                      clearTimeout(debounceTimeout);
                    }

                    debounceTimeout = setTimeout(() => {
                      try {
                        if (!plugin.settings.flows[isItFlow]) {
                          throw new Error(
                            `Flow ${isItFlow} not found in settings`
                          );
                        }
                        plugin.checkActiveRegionCache(
                          plugin.settings.flows[isItFlow],
                          cursorOffset
                        );
                        console.log(
                          "cusor listener calling checkActiveRegionCache"
                        );
                        if (plugin.hadTrackingError) {
                          new Notice(
                            "Flow tracking restored. :)\n" +
                              "Your changes are now being tracked properly again.",
                            4000
                          );
                          plugin.hadTrackingError = false;
                        }
                      } catch (error) {
                        console.error(
                          "Error processing cursor position:",
                          error
                        );
                        plugin.hadTrackingError = true;
                        new Notice(
                          "TextFlow Plugin warning:\n " +
                            "Flow region tracking failed!\n\n" +
                            "To prevent data loss:\n" +
                            "1. Stop editing immediately\n" +
                            "2. Close the flow\n" +
                            "3. Close and reopen your vault\n" +
                            "4. Verify your flow\n\n" +
                            "If this error persists, please report it on github.",
                          20000 // Show for 5 seconds
                        );
                      }
                    }, 250);
                  }
                }
              } catch (error) {
                console.error("Error in navigation update:", error);
                new Notice(
                  "TextFlow Plugin Critical Error:\n " +
                    "Flow tracking system failed.\n" +
                    "1. Close the flow immediately\n" +
                    "2. Close and reopen your vault\n" +
                    "3. Verify your flow\n\n" +
                    "If this error persists, please report it on github.",
                  20000
                );
              }
            }

            destroy() {
              try {
                if (debounceTimeout) {
                  clearTimeout(debounceTimeout);
                }
                if (activeLeafPath) {
                  delete plugin.listenerBasket[activeLeafPath];
                }
              } catch (error) {
                console.error("Error cleaning up navigation listener:", error);
                new Notice(
                  "TextFlow Plugin: Error during cleanup of cursor listener.\n" +
                    "Please reload the plugin to ensure proper operation.",
                  10000
                );
              }
            }
          }
        );

        try {
          const extension = StateEffect.appendConfig.of([navigationListener]);

          if (!activeLeafPath) {
            throw new Error("TExtFlow plugin: No active leaf path available.");
          }

          this.listenerBasket[activeLeafPath] = {
            plugin: navigationListener,
            extension: extension,
          };

          cmEditor.dispatch({
            effects: extension,
          });
        } catch (error) {
          console.error("Error attaching navigation listener:", error);
          if (activeLeafPath) {
            delete this.listenerBasket[activeLeafPath];
          }
          new Notice(
            "TextFlow Plugin Critical Error:\n " +
              "Flow tracking system failed.\n" +
              "1. Close the flow immediately\n" +
              "2. Close and reopen your vault\n" +
              "3. Verify your flow\n\n" +
              "If this error persists, please report it on github.",
            20000
          );
        }
      } else {
        this.removeCursorListener(leaf);
      }
    }
  };

  // ---------------------------------------------------------
  removeCursorListener = (leaf: MarkdownView) => {
    const activeLeafPath = leaf.file?.path;
    if (activeLeafPath !== undefined && this.listenerBasket[activeLeafPath]) {
      const editor = leaf.editor as ObsidianEditor;
      const cmEditor = editor.cm;
      if (cmEditor) {
        // Remove the listener
        cmEditor.dispatch({
          effects: StateEffect.reconfigure.of([]),
        });
        // The destroy callback will handle removing from the basket
      }
    }
  };

  // -----------------
  private addTextChangeListener = (leaf: MarkdownView | null) => {
    if (!leaf) return;

    const editor = leaf?.editor as ObsidianEditor | null;
    if (!editor) return;

    const cmEditor = editor.cm;
    if (!cmEditor) return;

    const activeLeafPath = leaf.file?.path;

    // Don't add duplicate listeners
    if (activeLeafPath && this.listenerBasket[`${activeLeafPath}-changes`]) {
      return;
    }

    if (activeLeafPath !== undefined) {
      let isItFlow = this.isFlowFile(activeLeafPath);

      if (cmEditor && isItFlow) {
        const plugin = this;
        let debounceTimeout: NodeJS.Timeout | null = null;
        const shSettings = this.settings;

        const changeListener = ViewPlugin.fromClass(
          class {
            constructor(view: EditorView) {
              try {
                // Any initialization if needed
              } catch (error) {
                console.error("Error initializing change listener:", error);
                new Notice(
                  "TextFlow Plugin: Error tracking text changes.\n" +
                    "Please report this issue on github.",
                  10000
                );
                throw error;
              }
            }

            update(update: ViewUpdate) {
              try {
                if (update.docChanged) {
                  const changes = update.changes;

                  if (debounceTimeout) {
                    clearTimeout(debounceTimeout);
                  }

                  debounceTimeout = setTimeout(() => {
                    try {
                      for (const [flowName, flow] of Object.entries(
                        shSettings.flows as Record<string, Types.FlowDef>
                      )) {
                        if (flow.flowMap[activeLeafPath]) {
                          if (
                            !flow.modifiedRegionsArray.contains(activeLeafPath)
                          )
                            flow.modifiedRegionsArray.push(activeLeafPath);
                            console.log(flow.modifiedRegionsArray)
                        }
                      } // Here you can handle the changes
                      changes.iterChanges(
                        (fromA, toA, fromB, toB, inserted) => {
                          console.log("Text change detected:", {
                            fromA,
                            toA,
                            fromB,
                            toB,
                            insertedText: inserted.toString(),
                          });
                          // You can add your change handling logic here
                          // For example, tracking what changed in the active region
                        }
                      );
                    } catch (error) {
                      console.error("Error processing text change:", error);
                      new Notice(
                        "TextFlow Plugin warning: Error processing text change",
                        5000
                      );
                    }
                  }, 250);
                }
              } catch (error) {
                console.error("Error in change update:", error);
                new Notice(
                  "TextFlow Plugin: Error tracking changes.\n" +
                    "Please report this issue on github.",
                  10000
                );
              }
            }

            destroy() {
              try {
                if (debounceTimeout) {
                  clearTimeout(debounceTimeout);
                }
                if (activeLeafPath) {
                  delete plugin.listenerBasket[`${activeLeafPath}-changes`];
                }
              } catch (error) {
                console.error("Error cleaning up change listener:", error);
                new Notice(
                  "TextFlow Plugin: Error during cleanup of change listener.\n" +
                    "Please reload the plugin to ensure proper operation.",
                  10000
                );
              }
            }
          }
        );

        try {
          const extension = StateEffect.appendConfig.of([changeListener]);

          if (!activeLeafPath) {
            throw new Error("TextFlow plugin: No active leaf path available.");
          }

          this.listenerBasket[`${activeLeafPath}-changes`] = {
            plugin: changeListener,
            extension: extension,
          };

          cmEditor.dispatch({
            effects: extension,
          });
        } catch (error) {
          console.error("Error attaching change listener:", error);
          if (activeLeafPath) {
            delete this.listenerBasket[`${activeLeafPath}-changes`];
          }
          new Notice(
            "TextFlow Plugin: Error setting up change tracking.\n" +
              "Please report this issue on github.",
            10000
          );
        }
      } else {
        this.removeTextChangeListener(leaf);
      }
    }
  };

  //---------------
  removeTextChangeListener = (leaf: MarkdownView) => {
    const activeLeafPath = leaf.file?.path;
    if (
      activeLeafPath !== undefined &&
      this.listenerBasket[`${activeLeafPath}-changes`]
    ) {
      const editor = leaf.editor as ObsidianEditor;
      const cmEditor = editor.cm;
      if (cmEditor) {
        // Remove the listener
        cmEditor.dispatch({
          effects: StateEffect.reconfigure.of([]),
        });
        // The destroy callback will handle removing from the basket
      }
    }
  };

  // ---------------------------------------------------------
  private boundFileExplorerClick: (event: MouseEvent) => void;
  // ---------- This listener is removed in ONUNLOAD ---------------------
  fileExplorerClickListener() {
    this.boundFileExplorerClick = async (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const fileItem = target.closest(".nav-file-title");

      if (!fileItem) return;
      const clickedFilePath = fileItem.getAttribute("data-path");

      if (!clickedFilePath) return;
      const file = this.app.vault.getAbstractFileByPath(clickedFilePath);

      if (!(file instanceof TFile)) return;

      const leaves = this.app.workspace.getLeavesOfType("markdown");

      let fileLeaf = leaves.find(
        (leaf) =>
          leaf.view instanceof MarkdownView &&
          (leaf.view as MarkdownView).file?.path === clickedFilePath
      );

      const currentFlow = this.isFlowFile(clickedFilePath);

      if (currentFlow) {
        // Case: File is a flow (either already open or not)
        event.preventDefault();
        if (fileLeaf) {
          // Flow is already open, just focus it and adjust readonly
          await this.activateFlow(currentFlow);
        } else {
          // Flow needs to be opened
          await this.activateFlow(currentFlow);
        }
        return;
      }

      // Check if the file is part of any flow
      for (const [flowName, flow] of Object.entries(
        this.settings.flows as Record<string, Types.FlowDef>
      )) {
        if (flow.flowMap[clickedFilePath]) {
          // Check if the flow is already open
          let flowLeaf = this.app.workspace
            .getLeavesOfType("markdown")
            .find(
              (leaf) =>
                leaf.view instanceof MarkdownView &&
                (leaf.view as MarkdownView).file?.path === flow.flowFilePath
            );
          // if it's open just make it active
          if (flowLeaf) {
            event.preventDefault();
            await this.app.workspace.setActiveLeaf(flowLeaf);
            if (flowLeaf.view instanceof MarkdownView) {
              this.addReadOnlyExtension(flowLeaf.view, flowName);
              this.addCursorListener(flowLeaf.view);
              this.addTextChangeListener(flowLeaf.view);
            }
          } else {
            // if it's not open, open it and attach stuff
            event.preventDefault();
            this.activateFlow(flowName);
          }
          if (flowLeaf?.view instanceof MarkdownView) {
            await this.app.workspace.setActiveLeaf(flowLeaf);
            const startPos = flow.flowMap[clickedFilePath].startEndInFlow.start;
            const editor = flowLeaf.view.editor;
            if (editor) {
              const cursorPos = editor.offsetToPos(startPos);
              editor.setCursor(cursorPos);

              const cmEditor = (editor as any).cm;
              if (cmEditor) {
                // Adjust to correct for a consistent -1 offset error
                const adjustedStartPos = startPos;
                const line = cmEditor.state.doc.lineAt(adjustedStartPos);
                const targetPos = line.from;
                console.log(
                  `fileExplorerClickListener set cursor pos, scrolled to ${targetPos}`
                );
                cmEditor.dispatch({
                  selection: { anchor: targetPos },
                  effects: EditorView.scrollIntoView(targetPos, {
                    y: "start",
                    yMargin: 0, // No margin to prevent adjustments
                  }),
                });
              }
            }
          }
          return;
        }
      }

      // If the file is neither a flow nor part of a flow
      if (!currentFlow) {
        event.preventDefault();

        if (fileLeaf) {
          this.app.workspace.setActiveLeaf(fileLeaf);
        } else {
          this.app.workspace.openLinkText(
            clickedFilePath,
            "",
            false // Don't open in new pane
          );
        }
      }
    };
  }

  // ---------------- Functions: Flow management -------------------------
  private async setupFlowView(flowName: string, view: MarkdownView) {
    this.addReadOnlyExtension(view, flowName);
    this.addCursorListener(view);
    this.addTextChangeListener(view);

    if (!this.settings.activeFlows.includes(flowName)) {
      this.settings.activeFlows = [...this.settings.activeFlows, flowName];
      await this.saveSettings();
    }
  }

  async activateFlow(flowName: string, existingView?: MarkdownView) {
    const flow = this.settings.flows[flowName];
    if (!flow) {
      return;
    }

    if (existingView) {
      // Flow is already open, just set it up
      await this.setupFlowView(flowName, existingView);
      await this.app.workspace.setActiveLeaf(existingView.leaf);
    } else {
      // Need to open new leaf
      const leaf = this.app.workspace.getLeaf(true);
      const flowFile = this.app.vault.getAbstractFileByPath(flow.flowFilePath);

      if (flowFile instanceof TFile) {
        await leaf.openFile(flowFile);
        if (leaf.view instanceof MarkdownView) {
          await this.setupFlowView(flowName, leaf.view);
        }
      }
    }
  }

  // --------------------- Set up open flows with listeners -----------
  initialSetup = async () => {
    await this.persistCursorPosition();
    console.log("persisting cursor on inititalSetup");
    const allLeaves = this.app.workspace.getLeavesOfType("markdown");
    // Iterate over all the leavesfileExplorerClickListener
    for (const leaf of allLeaves) {
      if (leaf.view instanceof MarkdownView) {
        const activeLeafPath = leaf.view.file?.path;

        // Now you can check if the leaf's path should be in the listener basket or not
        // If it's part of the active flow, attach the listener
        let flowName = null;
        if (activeLeafPath !== undefined) {
          flowName = this.isFlowFile(activeLeafPath);
          if (flowName) {
            this.activateFlow(flowName);
            console.log(
              `initialSetup activating flow with last cursor pos `,
              this.settings.flows[flowName].activeRegion?.lastCursorPosition
            );

            // If we have stored cursor position, restore it
            const cache = this.settings.flows[flowName];
            if (
              cache &&
              this.settings.flows[flowName].persistentCursorPos !== undefined
            ) {
              const editor = leaf.view.editor;
              this.app.workspace.onLayoutReady(() => {
                // this is to make sure the editor is ready
                const cmEditor = (editor as any).cm;
                if (cmEditor) {
                  const startPos = cache.persistentCursorPos;
                  const line = cmEditor.state.doc.lineAt(startPos);
                  const targetPos = line.from;
                  console.log(
                    `initialSetup set cursor pos, scrolled to ${targetPos}`
                  );
                  cmEditor.dispatch({
                    selection: { anchor: targetPos },
                    effects: EditorView.scrollIntoView(targetPos, {
                      y: "start",
                      yMargin: 0, // No margin to prevent adjustments
                    }),
                  });
                }
              });
            }
            // Initialize region tracking with current cursor position
            this.checkActiveRegionCache(
              this.settings.flows[flowName],
              cache.persistentCursorPos
            );
            console.log(`initialSetup calling checkActiveRegionCache`);
          }
        }
        this.saveSettings();
      }
    }
  };

  // --------------------------------------------------------------------

  isFlowFile = (activeLeafPath: string) => {
    const flowName = activeLeafPath.match(/([^/]+)(?=\.md$)/)?.[0]; // gets the flow name out of the path
    if (flowName && this.settings.flows[flowName]) {
      return flowName;
    } else {
      return null;
    }
  };

  // ---------------------- Functions: Flow management: Region tracking ----------------------------

  private addReadOnlyExtension = (leaf: MarkdownView, flowName: string) => {
    const flow = this.settings.flows[flowName];
    if (!flow) return;

    const editor = leaf.editor as any;
    if (!editor.cm) return;

    if (this.hasReadOnlyExtension(editor)) {
      this.removeReadOnlyExtension(editor);
    }

    const preventEdit = EditorState.transactionFilter.of((tr) => {
      if (!tr.changes.empty) {
        let shouldReject = false;

        tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
          // Get a larger window around the edit point
          const windowStart = Math.max(0, fromA - 20);
          const windowEnd = Math.min(tr.startState.doc.length, toA + 20);
          const windowText = tr.startState.sliceDoc(windowStart, windowEnd);

          let match;
          const regex = /(?:^|\n)[\u200B\u200C\u200D]{10}(<hr>)(?:\n\n|$)/g;

          //  /(?:^|\n)(\*\*\*|___|<hr>)(?:\n|$)/g;
          while ((match = regex.exec(windowText)) !== null) {
            // Get absolute positions of the protected `***`, including required newlines
            const absoluteDividerStart = windowStart + match.index;
            const absoluteDividerEnd = absoluteDividerStart + match[0].length;

            if (
              (fromA < absoluteDividerEnd && toA > absoluteDividerStart) ||
              (fromA <= absoluteDividerStart && toA >= absoluteDividerEnd)
            ) {
              shouldReject = true;
            }
          }
        });

        if (shouldReject) {
          return []; // Reject the transaction
        }
      }
      return tr; // Allow normal edits
    });

    editor.cm.dispatch({
      effects: StateEffect.appendConfig.of([preventEdit]),
    });
  };

  // -----------------------------------------------------------
  private removeReadOnlyExtension = (editor: any) => {
    if (!editor.cm) return;

    if (this.hasReadOnlyExtension(editor)) {
      editor.cm.dispatch({
        effects: StateEffect.reconfigure.of([]),
      });
    }
  };

  // ----------------------------------------------------------
  private hasReadOnlyExtension = (editor: any) => {
    if (!editor.cm) return false;
    const hasField =
      editor.cm.state.field(this.readOnlyRanges, false) !== undefined;
    return hasField;
  };

  // --------------- Functions: Flow management: Regions cache + utilities -----------------------------------------
  private checkActiveRegionCache = async (
    flow: Types.FlowDef,
    cursorOffset: number
  ) => {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      console.log("no active view");
      return;
    }

    const editor = activeView.editor as ObsidianEditor;
    const cmEditor = editor.cm;
    if (!cmEditor) {
      console.log("no cmEditor");
      return;
    }

    // Get full document text from CodeMirror state
    const text = cmEditor.state.doc.toString();
    if (
      cursorOffset > flow.activeRegion.startInFlow &&
      cursorOffset < flow.activeRegion.endInFlow
    ) {
      flow.activeRegion.lastCursorPosition = cursorOffset;
      console.log("still in active region");
      this.saveSettings();
      return;
    } else {
      flow.activeRegion.lastCursorPosition = cursorOffset;
      let activeRegion = await this.findActiveRegion(flow, cursorOffset, text);
      console.log(`checkActiveRegion looking for active region`);
      if (activeRegion) {
        flow.activeRegion = activeRegion;
      }
      this.saveSettings();
    }
  };

  // ------------- regions cache utilities ----------------------
  private findActiveRegion = async (
    flow: Types.FlowDef,
    cursorOffset: number,
    text: string
  ) => {
    const markerRegex = /[\u200B\u200C\u200D]{10}<hr>/;
    const searchStart = text.slice(cursorOffset);
    const matches = searchStart.match(markerRegex);
    if (matches) {
      const uid = matches[0].slice(0, 10);

      const activeRegion = Object.entries(flow.flowMap).find(
        ([activeRegionPath, activeRegionMap]) => activeRegionMap.UID === uid
      );
      if (activeRegion) {
        const [activeRegionPath, activeRegionMap] = activeRegion;
        const startInFlow = this.findStartOfRegion(
          flow,
          activeRegionMap.UIDPlain - 1,
          text
        );
        if (startInFlow) {
          const markerLength = (activeRegionMap.UID + "<hr>").length + 1; // +1 for \r
          const activeRegionObject: Types.ActiveRegion = {
            lastCursorPosition: cursorOffset,
            path: activeRegionPath,
            UID: uid,
            UIDPlain: activeRegionMap.UIDPlain,
            startInFlow: startInFlow,
            endInFlow: text.indexOf(activeRegionMap.UID) + markerLength,
          };
          return activeRegionObject;
        }
      }
    }
  };

  // ------------------
  private findStartOfRegion = (
    flow: Types.FlowDef,
    UIDPlain: number,
    text: string
  ) => {
    const previousRegion = Object.entries(flow.flowMap).find(
      ([previousRegion, previousRegionFlowMapEntry]) =>
        previousRegionFlowMapEntry.UIDPlain === UIDPlain
    );
    if (previousRegion) {
      const [previousRegionPath, previousRegionMap] = previousRegion;

      if (UIDPlain - 1 !== 0) {
        const UID = previousRegionMap.UID;
        const index = text.indexOf(UID);
        const startPos = index + (UID + "<hr>").length + 1;
        return startPos;
      } else {
        return 0;
      }
    }
  };

  // -------------------------------------------------------
  //------------------------- ONLOAD -----------------------
  // -------------------------------------------------------
  async onload() {
    this.settings = await this.loadSettings();

    // ------ ONLOAD: if plugin has been set up before, make sure the temp folder exists ------------
    if (
      this.settings.tempFolderPlace !== "not set yet" &&
      this.settings.tempFolderPlace !== undefined
    ) {
      this.ensureTempFolder();
    }

    // -------------------------------------------------------------------
    // ------------------- ONLOAD: add listeners for cursor and clicks
    // Wait for the file explorer to be available in the DOM
    this.app.workspace.onLayoutReady(async () => {
      // ----- ONLOAD: set up UI -------------------------
      // ------------------- Flow switcher modal ---------------------
      // Add status bar item
      const statusBarItem = this.addStatusBarItem();
      statusBarItem.addClass("mod-clickable");
      const iconContainer = statusBarItem.createSpan();
      setIcon(iconContainer, "sheets-in-box");

      statusBarItem.addEventListener("click", () => {
        new Modals.FlowSwitcherModal(this.app, this).open();
      });
      // Add ribbon icon (optional)
      this.addRibbonIcon("sheets-in-box", "Open Flow", (evt: MouseEvent) => {
        new Modals.FlowSwitcherModal(this.app, this).open();
      });

      await this.initialSetup();

      // Handle temp folder visibility
      if (this.settings.tempFolderHidden) {
        this.discernAndSetTempFolderState(true, this.settings.tempFolderPlace);
      }

      // Set up active view if it exists and is a markdown view
      // Set up active view if it exists and is a markdown view
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView?.file) {
        const flowName = this.isFlowFile(activeView.file.path);
        if (flowName !== null) {
          // Use the standard flow activation path
          await this.activateFlow(flowName, activeView);
        }
      }

      // -------------------------------
      this.fileExplorerClickListener();
      const fileExplorer = document.querySelector(".nav-files-container");
      if (fileExplorer && this.boundFileExplorerClick) {
        fileExplorer.addEventListener("click", this.boundFileExplorerClick);
      }
    });

    // ----------- ONLOAD: add global listeners ------------------------------------

    this.addListeners();

    // ----------- ONLOAD: register settingsTab ------------------------------------
    this.addSettingTab(new TextFlowSettingsTab(this.app, this));
  }

  // -------------------------------------------------------
  // ------------------ ONUNLOAD---------------------------
  // -------------------------------------------------------
  onunload() {
    this.persistCursorPosition();
    this.saveSettings();
    // ---------------- Store data for all active flows ----
    this.cursorResetTracker = [];

    // Remove read-only extensions from all markdown views
    const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of markdownLeaves) {
      if (leaf.view instanceof MarkdownView) {
        const editor = leaf.view.editor as any;
        this.removeReadOnlyExtension(editor);
      }
    }

    // ------------ ONUNLOAD: REMOVE cursor listeners -----------
    for (const path in this.listenerBasket) {
      // Get all leaves of the MarkdownView type
      const leaves = this.app.workspace.getLeavesOfType("markdown");

      for (const leaf of leaves) {
        // Check if the leaf's view is a MarkdownView and if its file path matches
        if (
          leaf.view instanceof MarkdownView &&
          leaf.view.file?.path === path
        ) {
          let markdownView = leaf.view as MarkdownView; // Cast the view to MarkdownView
          this.removeCursorListener(markdownView);
          this.removeTextChangeListener(markdownView);
        }
      }
    }

    //------------ ONUNLOAD: REMOVE explorer click listener -----------
    const fileExplorer = document.querySelector(".nav-files-container");
    if (fileExplorer && this.boundFileExplorerClick) {
      fileExplorer.removeEventListener("click", this.boundFileExplorerClick);
    }
  }
}
