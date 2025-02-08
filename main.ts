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
  private wakingUp = true;
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
          console.log(`Temp folder created at ${tempFolderPath}`);
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
      this.app.workspace.on("layout-change", () => {
        if (!this.wakingUp) {
          console.log(`layout-change awake and managing flow array`);
          this.app.workspace.onLayoutReady(() => {
            console.log("Layout change detected");
            const currentLeaves =
              this.app.workspace.getLeavesOfType("markdown");
            const currentPaths = currentLeaves
              .map((leaf) =>
                leaf.view instanceof MarkdownView
                  ? leaf.view.file?.path
                  : undefined
              )
              .filter((path): path is string => path !== undefined);

            console.log("Current paths:", currentPaths);
            console.log("Current activeFlows:", this.settings.activeFlows);

            // Check which active flows are no longer open
            let closure = this.settings.activeFlows.filter((flowName) => {
              // A flow is closed if none of the current paths match its flow file
              return !currentPaths.some(
                (path) => this.isFlowFile(path) === flowName
              );
            });

            if (closure.length > 0) {
              console.log("Removing flows:", closure);
              this.settings.activeFlows = this.settings.activeFlows.filter(
                (f) => !closure.includes(f)
              );
              this.saveSettings();
              console.log(`layout-change saving: ${this.settings.activeFlows}`);
            }
          });
        }
        console.log(`layout-change... Just waking up...`);
        this.wakingUp = false;
      })
    );

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", async (leaf) => {
        if (leaf?.view instanceof MarkdownView) {
          const activeLeafPath = leaf.view.file?.path;
          console.log("Leaf change detected:", activeLeafPath);

          if (activeLeafPath) {
            const flowName = this.isFlowFile(activeLeafPath);
            console.log("Is it a flow?", flowName);
            console.log("Current activeFlows:", this.settings.activeFlows);

            if (flowName) {
              this.setupFlowView(flowName, leaf.view);
              console.log(
                `active-leaf-change called setupFlowView: ${this.settings.activeFlows}`
              );
            } else {
              // Check if this is a constituent file of any active flow
              console.log(`Checking if ${activeLeafPath} is part of a flow`);
              for (const [flowName, flow] of Object.entries(
                this.settings.flows
              )) {
                if (
                  flow.flowMap[activeLeafPath] &&
                  this.settings.activeFlows.includes(flowName)
                ) {
                  console.log("opening modal");
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
                const adjustedStartPos = startPos - 1;
                const line = cmEditor.state.doc.lineAt(adjustedStartPos);
                const targetPos = line.from;

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

    if (!this.settings.activeFlows.includes(flowName)) {
      this.settings.activeFlows = [...this.settings.activeFlows, flowName];
      await this.saveSettings();
      console.log(
        `setupFlowView saving after adding: ${this.settings.activeFlows}`
      );
    }
    console.log("setupFlowView, no changes:", this.settings.activeFlows);
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

            // If we have stored cursor position, restore it
            const cache = this.settings.flows[flowName].activeRegionCache;
            if (cache && cache.lastCursorPosition !== undefined) {
              const storedPosition = cache.lastCursorPosition;
              const editor = leaf.view.editor;
              this.app.workspace.onLayoutReady(() => {
                // this is to make sure the editor is ready
                const cmEditor = (editor as any).cm;
                if (cmEditor) {
                  const startPos = storedPosition;
                  // Adjust to correct for a consistent -1 offset error
                  const adjustedStartPos = startPos - 1;
                  const line = cmEditor.state.doc.lineAt(adjustedStartPos);
                  const targetPos = line.from;

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
            const cursorOffset = leaf.view.editor.posToOffset(
              leaf.view.editor.getCursor()
            );
            this.checkActiveRegionCache(
              this.settings.flows[flowName],
              cursorOffset
            );
          }
        }
        this.saveSettings();
        console.log(`initialSetup saving: ${this.settings.activeFlows}`);
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
    if (!activeView) return;

    const editor = activeView.editor as ObsidianEditor;
    const cmEditor = editor.cm;
    if (!cmEditor) return;

    // Get full document text from CodeMirror state
    const text = cmEditor.state.doc.toString();
    if (
      flow.activeRegionCache !== undefined &&
      (cursorOffset < flow.activeRegionCache.regions[0].startInFlow ||
        cursorOffset > flow.activeRegionCache.regions[0].endInFlow) &&
      (flow.activeRegionCache.regions[-1].path ===
        "path for region with UIDPlain -1/+1 does not exist" ||
        cursorOffset >= flow.activeRegionCache.regions[-1].startInFlow) &&
      (flow.activeRegionCache.regions[1].path ===
        "path for region with UIDPlain -1/+1 does not exist" ||
        cursorOffset <= flow.activeRegionCache.regions[1].endInFlow)
    ) {
      flow.activeRegionCache.lastCursorPosition = cursorOffset;
      this.shiftCacheWindow(flow, cursorOffset, flow.activeRegionCache, text);
    } else {
      flow.activeRegionCache = {
        lastCursorPosition: cursorOffset,
        regions: {
          [-1]: {
            // relative to active region
            path: "",
            UID: "", // for boundary verification
            UIDPlain: 0, // for easy navigation
            startInFlow: 0,
            endInFlow: 0,
          },
          [0]: {
            path: "",
            UID: "",
            UIDPlain: 0,
            startInFlow: 0,
            endInFlow: 0,
          },
          [1]: {
            path: "",
            UID: "",
            UIDPlain: 0,
            startInFlow: 0,
            endInFlow: 0,
          },
        },
      };
      // --------- shorthands -----------------
      let shPrevRegion = flow.activeRegionCache.regions[-1];
      let shActiveRegion = flow.activeRegionCache.regions[0];
      let shNextRegion = flow.activeRegionCache.regions[1];
      // --------------------------------------

      let activeRegion = await this.findActiveRegion(flow, cursorOffset, text);
      if (activeRegion) {
        shActiveRegion = activeRegion;
        let prevRegion = this.findOtherRegion(
          flow,
          activeRegion.UIDPlain - 1,
          text
        );
        let nextRegion = this.findOtherRegion(
          flow,
          shActiveRegion.UIDPlain + 1,
          text
        );
        if (prevRegion) {
          shPrevRegion = prevRegion;
        }
        if (nextRegion) {
          shNextRegion = nextRegion;
        }
      }

      console.log(`active region is ${shActiveRegion.path}`);
    }
    this.saveSettings();
    console.log(`checkActiveRegionCache saving: ${this.settings.activeFlows}`);
  };

  // -----------------------------------------------------
  private shiftCacheWindow = (
    flow: Types.FlowDef,
    cursorOffset: number,
    activeRegionCache: Types.ActiveRegionCache,
    text: string
  ) => {
    // --------- shorthands -----------------
    let shPrevRegion = activeRegionCache.regions[-1];
    let shActiveRegion = activeRegionCache.regions[0];
    let shNextRegion = activeRegionCache.regions[1];
    // --------------------------------------
    console.log(
      `Shifting cache window ${
        cursorOffset < activeRegionCache.regions[0].startInFlow
          ? "backward"
          : "forward"
      }`
    );
    if (activeRegionCache !== undefined) {
      if (cursorOffset < activeRegionCache.regions[0].startInFlow) {
        const prevRegion = this.findOtherRegion(
          flow,
          shActiveRegion.UIDPlain - 1,
          text
        );
        if (prevRegion) {
          activeRegionCache.regions[1] = shActiveRegion;
          activeRegionCache.regions[0] = shPrevRegion;
          activeRegionCache.regions[-1] = prevRegion;
        }
      }
      if (cursorOffset > activeRegionCache.regions[0].endInFlow) {
        const nextRegion = this.findOtherRegion(
          flow,
          shActiveRegion.UIDPlain + 1,
          text
        );
        if (nextRegion) {
          activeRegionCache.regions[-1] = shActiveRegion;
          activeRegionCache.regions[0] = shNextRegion;
          activeRegionCache.regions[1] = nextRegion;
        }
      }
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
          const activeRegionObject: Types.RegionObject = {
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

  // --------------------------------
  private findOtherRegion = (
    flow: Types.FlowDef,
    UIDPlain: number,
    text: string
  ) => {
    const otherRegion = Object.entries(flow.flowMap).find(
      ([otherRegion, otherRegionFlowMapEntry]) =>
        otherRegionFlowMapEntry.UIDPlain === UIDPlain
    );
    if (otherRegion) {
      const [otherRegionPath, otherRegionMap] = otherRegion;

      if (UIDPlain > 1) {
        // if it's not the first region
        const startInFlow = this.findStartOfRegion(flow, UIDPlain - 1, text);
        if (startInFlow) {
          const markerLength = (otherRegionMap.UID + "<hr>").length + 1; // +1 for \r
          const otherRegionObject: Types.RegionObject = {
            path: otherRegionPath,
            UID: otherRegionMap.UID,
            UIDPlain: UIDPlain,
            startInFlow: startInFlow,
            endInFlow: text.indexOf(otherRegionMap.UID) + markerLength,
          };
          return otherRegionObject;
        } else {
          // path name is to make sure we don't have accidental matches with user content
          const otherRegionObject: Types.RegionObject = {
            path: "path for region with UIDPlain -1/+1 does not exist",
            UID: "none",
            UIDPlain: -1,
            startInFlow: 0,
            endInFlow: 0,
          };
          return otherRegionObject;
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
    console.log("Plugin loading...");
    this.settings = await this.loadSettings();
    console.log("Settings after initial load:", this.settings);

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

      // Add a check before layout ready
      this.app.workspace.onLayoutReady(() => {
        console.log("Layout ready, settings are:", this.settings);
        // ... rest of your layout ready code
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
    // ---------------- Store data for all active flows ----
    this.saveSettings();

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
