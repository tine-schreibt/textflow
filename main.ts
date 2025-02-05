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
} from "@codemirror/view";
import {
  EditorState,
  StateEffect,
  StateField,
  Transaction,
} from "@codemirror/state";
import * as Types from "src/types";
// import { TextFlow } from "./src/flowMaker";

interface ObsidianEditor extends Editor {
  cm?: EditorView;
}

// You can also create more specific types for your use cases:
interface CodeMirrorCursor {
  line: number;
  ch: number;
}

export default class TextFlowPlugin extends Plugin {
  settings: TextFlowSettings;
  tempFilePath: string;

  // ---------------- Global objects and variables -------------------------
  // ----------------- tracking read-only ranges --------------------------
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
    try {
      const loadedSettings = await this.loadData();
      return Object.assign({}, DEFAULT_SETTINGS, loadedSettings);
    } catch (error) {
      console.error("Failed to load settings:", error);
      new Notice("Failed to load settings, using defaults");
      return { ...DEFAULT_SETTINGS };
    }
  }
  // ---------------------------------------------------------------
  async saveSettings(): Promise<void> {
    const settingsToSave = structuredClone(this.settings);
    await this.saveData(settingsToSave);
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

        // If this is a flow file being modified, make sure it's in activeFlows
        const flowName = this.isFlowFile(file.path);
        if (flowName && !this.settings.activeFlows.includes(flowName)) {
          console.log(`Ensuring flow ${flowName} stays in activeFlows`);
          this.settings.activeFlows = [...this.settings.activeFlows, flowName];
          this.saveSettings();
        }
      })
    );
    // ---------------- Layout change (tab closure) -------------------------------
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.app.workspace.onLayoutReady(() => {
          // This event fires when any layout change occurs, including tab closure
          const currentLeaves = this.app.workspace.getLeavesOfType("markdown");
          const currentPaths = currentLeaves
            .map((leaf) =>
              leaf.view instanceof MarkdownView
                ? leaf.view.file?.path
                : undefined
            )
            .filter((path): path is string => path !== undefined);

          // Check if any flows were closed
          let closure = this.settings.activeFlows.filter(
            (f) => !currentPaths.includes(f)
          );
          if (closure.length > 0) {
            this.settings.activeFlows = this.settings.activeFlows.filter(
              (f) => !closure.includes(f)
            );

            this.saveSettings();
          }
        });
      })
    );
  }

  // ---------------- Functions: Listeners: Individual ----------

  // leaf.view as MarkdownView
  listenerBasket: { [key: string]: EventRef } = {};
  private addCursorListener = (leaf: MarkdownView | null) => {
    if (!leaf) return;
    const editor = leaf?.editor as ObsidianEditor | null;
    if (!editor) return;
    const cmEditor = editor.cm;
    const activeLeafPath = leaf.file?.path;

    if (activeLeafPath && this.listenerBasket[activeLeafPath]) {
      return;
    }
    if (activeLeafPath !== undefined) {
      let isItFlow = this.isFlowFile(activeLeafPath);

      if (cmEditor && isItFlow) {
        // Define the callback function separately so we can remove it later
        const cursorCallback = () => {
          const state = cmEditor.state;
          const selection = state.selection.main;
          const cursorOffset = selection.from;
          this.checkActiveRegionCache(
            this.settings.flows[isItFlow],
            cursorOffset
          );
          console.log("Navigation event detected");
        };

        // Look for navigation events
        const updateActiveRegionListener = EditorView.updateListener.of(
          (update) => {
            if (update.selectionSet) {
              // Any cursor/selection change
              const isNavigationEvent = update.transactions.some(
                (tr: Transaction) =>
                  tr.changes.empty && // No text changes
                  tr.isUserEvent("select") // User-initiated selection change
              );

              if (isNavigationEvent) {
                // call for a check
                cursorCallback();
              }
            }
          }
        );

        cmEditor.dispatch({
          effects: StateEffect.appendConfig.of([updateActiveRegionListener]),
        });

        this.listenerBasket[activeLeafPath] = updateActiveRegionListener;
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
        // Remove from the basket
        delete this.listenerBasket[activeLeafPath];
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
          if (fileLeaf.view instanceof MarkdownView) {
            this.addReadOnlyExtension(fileLeaf.view, currentFlow);
            this.addCursorListener(fileLeaf.view);
            console.log(
              "Checking if flow is already active:",
              currentFlow,
              this.settings.activeFlows
            );
            if (!this.settings.activeFlows.includes(currentFlow)) {
              // Double-check the flow still needs to be added
              if (!this.settings.activeFlows.includes(currentFlow)) {
                console.log(
                  `Restoring ${currentFlow} to activeFlows in click handler`
                );
                this.settings.activeFlows = [
                  ...this.settings.activeFlows,
                  currentFlow,
                ];
                await this.saveSettings(); // Use a longer delay like updateActiveRegion does
              }
            }
          }
        } else {
          // Flow needs to be opened, listener and readonly attached
          fileLeaf = this.app.workspace.getLeaf(true);
          await fileLeaf.openFile(file);
          const activeView =
            this.app.workspace.getActiveViewOfType(MarkdownView);
          if (activeView) {
            if (fileLeaf.view instanceof MarkdownView) {
              this.addReadOnlyExtension(fileLeaf.view, currentFlow);
              this.addCursorListener(fileLeaf.view);
              console.log(
                "Checking if flow is already active:",
                currentFlow,
                this.settings.activeFlows
              );
              if (!this.settings.activeFlows.includes(currentFlow)) {
                this.settings.activeFlows = [
                  ...this.settings.activeFlows,
                  currentFlow,
                ]; // Force reactivity
                await this.saveSettings();
                console.log("After adding:", this.settings.activeFlows);
              }
            }
          }
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
              console.log(`Setting up flow: ${flowLeaf.view.file?.path}`);
              this.addReadOnlyExtension(flowLeaf.view, flowName);
              this.addCursorListener(flowLeaf.view);
              console.log(
                "Checking if flow is already active:",
                flowName,
                this.settings.activeFlows
              );
              if (!this.settings.activeFlows.includes(flowName)) {
                // Double-check the flow still needs to be added
                if (!this.settings.activeFlows.includes(flowName)) {
                  console.log(
                    `Restoring ${flowName} to activeFlows in click handler`
                  );
                  this.settings.activeFlows = [
                    ...this.settings.activeFlows,
                    flowName,
                  ];
                  await this.saveSettings(); // Use a longer delay like updateActiveRegion does
                }
              }
            }
          } else {
            // if it's not open, open it and attach stuff
            event.preventDefault();
            flowLeaf = this.app.workspace.getLeaf(true);
            await flowLeaf.openFile(
              this.app.vault.getAbstractFileByPath(flow.flowFilePath) as TFile
            );
            await this.app.workspace.setActiveLeaf(flowLeaf);
            if (flowLeaf.view instanceof MarkdownView) {
              this.addReadOnlyExtension(flowLeaf.view, flowName);
              this.addCursorListener(flowLeaf.view);
              console.log(
                "Checking if flow is already active:",
                flowName,
                this.settings.activeFlows
              );
              if (!this.settings.activeFlows.includes(flowName)) {
                // Double-check the flow still needs to be added
                if (!this.settings.activeFlows.includes(flowName)) {
                  console.log(
                    `Restoring ${flowName} to activeFlows in click handler`
                  );
                  this.settings.activeFlows = [
                    ...this.settings.activeFlows,
                    flowName,
                  ];
                  await this.saveSettings(); // Use a longer delay like updateActiveRegion does
                }
              }
            }
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
            this.addCursorListener(leaf.view);
            this.addReadOnlyExtension(leaf.view, flowName);
            if (!this.settings.activeFlows.includes(flowName)) {
              this.settings.activeFlows = [
                ...this.settings.activeFlows,
                flowName,
              ];
              this.saveSettings();
            }

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

  // --------------------------- Functions: Flow management: update cache -----------------------------------------
  private checkActiveRegionCache = (
    flow: Types.FlowDef,
    cursorOffset: number
  ) => {
    if (
      flow.activeRegionCache !== undefined &&
      (cursorOffset < flow.activeRegionCache.regions[0].startInFlow ||
        cursorOffset > flow.activeRegionCache.regions[0].endInFlow) &&
      cursorOffset >= flow.activeRegionCache.regions[-1].startInFlow &&
      cursorOffset <= flow.activeRegionCache.regions[1].endInFlow
    ) {
      this.shiftCacheWindow(flow, cursorOffset, flow.activeRegionCache);
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
      const shPreviousRegion = flow.activeRegionCache.regions[-1];
      const shActiveRegion = flow.activeRegionCache.regions[0];
      const shNextRegion = flow.activeRegionCache.regions[1];
      // --------------------------------------

      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!activeView) return;

      const editor = activeView.editor as ObsidianEditor;
      const cmEditor = editor.cm;
      if (!cmEditor) return;

      // Get full document text from CodeMirror state
      const text = cmEditor.state.doc.toString();

      // Set up regex search from cursor position
      const markerRegex = /[\u200B\u200C\u200D]{10}<hr>/g;
      markerRegex.lastIndex = cursorOffset;

      // Find downstream marker
      let activeRegionEnd = markerRegex.exec(text);
      if (activeRegionEnd) {
        const uid = activeRegionEnd[0].slice(0, 10); // Just get the UID part, without <hr>

        // Find matching flowMap entry and fill in the rest of the cache
        const activeRegionInFlowMap = Object.entries(flow.flowMap).find(
          ([activeRegionPath, activeRegionMap]) => activeRegionMap.UID === uid
        );
        if (activeRegionInFlowMap) {
          const [activeRegionPath, activeRegionMap] = activeRegionInFlowMap;
          shActiveRegion.path = activeRegionPath;
          shActiveRegion.UID = uid;
          shActiveRegion.UIDPlain = activeRegionMap.UIDPlain;
          // See: shActiveRegion.startInFlow = previousRegionEnd + (shPreviousRegion.UID + "<hr>" + 1).length;
          shActiveRegion.endInFlow =
            activeRegionEnd.index + (shActiveRegion.UID + "<hr>" + 1).length;
        }
        // use UIDPlain to find previous region
        if (shActiveRegion.UIDPlain - 1 === 0) {
          // First region
          shPreviousRegion.path = "";
          shPreviousRegion.UID = "";
          shPreviousRegion.UIDPlain = -1; // Or some sentinel value
          shPreviousRegion.startInFlow = 0;
          shPreviousRegion.endInFlow = 0;

          shActiveRegion.startInFlow = 0; // Active region starts at beginning
        } else {
          const previousRegionInFlowMap = Object.entries(flow.flowMap).find(
            ([previousRegionPath, previousRegionFlowMapEntry]) =>
              previousRegionFlowMapEntry.UIDPlain ===
              shActiveRegion.UIDPlain - 1
          );

          // use UIDPlain to find the region before that to get start of previous region
          let previousRegionStart = 0;
          if (shPreviousRegion.UIDPlain - 1 !== 0) {
            const prePreviousRegionInFlowMap = Object.entries(
              flow.flowMap
            ).find(
              ([prePreviousRegionPath, prePreviousRegionFlowMapEntry]) =>
                prePreviousRegionFlowMapEntry.UIDPlain ===
                shPreviousRegion.UIDPlain - 1
            );
            if (prePreviousRegionInFlowMap) {
              const [prePreviousRegionPath, prePreviousRegionMap] =
                prePreviousRegionInFlowMap;
              previousRegionStart =
                text.indexOf(prePreviousRegionMap.UID) +
                (shPreviousRegion.UID + "<hr>" + 1).length;
            }
          }
          // populate cache for previousRegion
          if (previousRegionInFlowMap) {
            const [previousRegionPath, previousRegionMap] =
              previousRegionInFlowMap;
            const previousRegionEnd =
              text.indexOf(previousRegionMap.UID) +
              (shPreviousRegion.UID + "<hr>" + 1).length;
            shPreviousRegion.path = previousRegionPath;
            shPreviousRegion.UID = previousRegionMap.UID;
            shPreviousRegion.UIDPlain = previousRegionMap.UIDPlain;
            shPreviousRegion.startInFlow = previousRegionStart;
            shPreviousRegion.endInFlow = previousRegionEnd;
            // Complete active region info
            shActiveRegion.startInFlow =
              previousRegionEnd + (shPreviousRegion.UID + "<hr>" + 1).length;
          }
          // find next region
          const nextRegionInFlowMap = Object.entries(flow.flowMap).find(
            ([nextRegionPath, nextRegionFlowMapEntry]) =>
              nextRegionFlowMapEntry.UIDPlain === shActiveRegion.UIDPlain + 1
          );
          if (nextRegionInFlowMap) {
            // populate cache
            const [nextRegionPath, nextRegionMap] = nextRegionInFlowMap;
            const nextRegionEnd = text.indexOf(nextRegionMap.UID);
            shNextRegion.path = nextRegionPath;
            shNextRegion.UID = nextRegionMap.UID;
            shNextRegion.UIDPlain = nextRegionMap.UIDPlain;
            shNextRegion.startInFlow = shActiveRegion.endInFlow + 1;
            shNextRegion.endInFlow = nextRegionEnd;
          } else {
            shNextRegion.path = "";
            shNextRegion.UID = "";
            shNextRegion.UIDPlain = shActiveRegion.UIDPlain + 1; // Or some sentinel value
            shNextRegion.startInFlow = shActiveRegion.endInFlow;
            shNextRegion.endInFlow = text.length;
          }
        }
      }
      console.log(`active region is ${shActiveRegion.path}`);
      this.saveSettings();
    }
  };

  // --------------------------- Functions: Flow management: shift cache -----------------------------------------
  private shiftCacheWindow = (
    flow: Types.FlowDef,
    cursorOffset: number,
    activeRegionCache: Types.ActiveRegionCache
  ) => {
    const regions = Object.values(flow.flowMap).sort(
      (a, b) => a.startEndInFlow.start - b.startEndInFlow.start
    );

    const currentActiveRegion = flow.activeRegionCache.regions[0];
    const currentIndex = regions.findIndex(
      (r) => r.path === currentActiveRegion.path
    );

    if (currentIndex === -1) return;

    const newActiveIndex =
      direction === "forward" ? currentIndex + 1 : currentIndex - 1;
    if (newActiveIndex < 0 || newActiveIndex >= regions.length) return;

    // Rebuild cache around new active region
    this.checkActiveRegionCache(
      flow,
      regions[newActiveIndex].startEndInFlow.start + 1
    );
  };

  // -------------------------------------------------------
  //------------------------- ONLOAD -----------------------
  // -------------------------------------------------------
  async onload() {
    // ------ ONLOAD: get the settings ------------------
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
    this.app.workspace.onLayoutReady(() => {
      // ----- ONLOAD: set up UI -------------------------
      this.initialSetup();
      if (this.settings.tempFolderHidden) {
        this.discernAndSetTempFolderState(true, this.settings.tempFolderPlace);
      }
      // -------------------------------
      this.addCursorListener(
        this.app.workspace.getActiveViewOfType(MarkdownView) as MarkdownView
      );
      // --addReadOnlyExtension---------------
      const leaf = this.app.workspace.getActiveViewOfType(
        MarkdownView
      ) as MarkdownView;
      const activeLeafPath = leaf.file?.path;
      if (activeLeafPath) {
        const flowName = this.isFlowFile(activeLeafPath);
        if (flowName !== null) {
          this.addReadOnlyExtension(leaf, flowName);
        }
      }

      // -------------------------------
      this.fileExplorerClickListener(); // This only creates the function

      // Add this to actually attach the listener:
      const fileExplorer = document.querySelector(".nav-files-container");
      if (fileExplorer && this.boundFileExplorerClick) {
        fileExplorer.addEventListener("click", this.boundFileExplorerClick);
      } else {
      }
      this.saveSettings();
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
