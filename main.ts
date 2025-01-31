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
import { EditorView, ViewUpdate } from "@codemirror/view";
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
  // ---------------- tracking regions in general -------------------------
  private sortedRegionsCache: Array<{
    path: string;
    start: number;
    end: number;
    type: string;
  }> | null = null;
  private lastFlowUpdate: string | null = null;
  private lastCursorCheck: number = 0;
  private lastCursorOffset: number = 0;
  // ----------------- tracking read-only ranges --------------------------
  private readOnlyRanges = StateField.define<
    Array<{ from: number; to: number }>
  >({
    create: () => [],
    update: (
      ranges: Array<{ from: number; to: number }>,
      tr: Transaction
    ): Array<{ from: number; to: number }> => {
      for (let e of tr.effects) {
        if (e.is(this.updateRangesEffect)) {
          return e.value;
        }
      }
      return ranges;
    },
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
    await this.saveData(this.settings);
  }
  // ---------------------------------------------------------------
  async ensureTempFolder() {
    console.log(`tempFolderPlace: ${this.settings.tempFolderPlace}`);
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
      new Notice("Failed to create or verify temp folder");
    }
  }

  // ---------------- Functions: Utilities: UI -------------------------
  discernAndSetTempFolderState = (
    tempFolderState?: boolean,
    tempFolderPlace?: string
  ): void => {
    console.log(`Checking hidden state. It is ${tempFolderState}`);

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
    console.log(`Set style to hidden for path: ${tempFolderPath}`);
  };

  // ---------------- Functions: Listeners -------------------------
  // ---------------- Functions: Listeners: Global -----------------

  addListeners() {
    // ---------------- File mod -------------------------------
    this.registerEvent(
      // File modifications
      this.app.vault.on("modify", (file) => {
        console.log(`File modified: ${file.path}`);
      })
    );
    // ---------------- Layout change (tab closure) -------------------------------
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        // This event fires when any layout change occurs, including tab closure
        const currentLeaves = this.app.workspace.getLeavesOfType("markdown");
        const currentPaths = currentLeaves
          .map((leaf) =>
            leaf.view instanceof MarkdownView ? leaf.view.file?.path : undefined
          )
          .filter((path): path is string => path !== undefined);

        // Check if any flow files were closed

        let closure = this.settings.activeFlows.filter(
          (f) => !currentPaths.includes(f)
        );
        if (closure.length > 0) {
          this.settings.activeFlows.filter((f) => !closure.includes(f));

          this.saveSettings();
        }
      })
    );
    // ---------------- Editor change (change of content) -------------------------------
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (!file) return;

        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) return;

        const editor = activeView.editor as any;
        if (editor && this.hasReadOnlyExtension(editor)) {
          this.removeReadOnlyExtension(editor);
        }

        const flowName = this.isFlowFile(file.path);

        if (flowName) {
          // File is a flow, set up read-only regions
          console.log(`Flow file opened: ${flowName}`);
          this.setupFlowEditor(activeView, flowName);
        } else {
          // File is not a flow, remove read-only regions if they exist
          console.log(`Non-flow file opened: ${file.path}`);
        }
      })
    );
  }

  // ---------------- Functions: Listeners: Individual ----------

  // leaf.view as MarkdownView
  listenerBasket: { [key: string]: EventRef } = {};
  addCursorListener = (leaf: MarkdownView | null) => {
    if (!leaf) return;
    const editor = leaf?.editor as ObsidianEditor | null;
    if (!editor) return;
    const cmEditor = editor.cm;
    const activeLeafPath = leaf.file?.path;
    let isItFlow = null;

    if (activeLeafPath !== undefined) {
      isItFlow = this.isFlowFile(activeLeafPath);

      if (cmEditor && isItFlow) {
        // Define the callback function separately so we can remove it later
        const cursorCallback = () => {
          const state = cmEditor.state;
          const selection = state.selection.main;

          // Only update if this is a cursor movement, not a selection
          if (selection.from === selection.to) {
            const cursorOffset = selection.from;
            this.updateActiveRegion(
              this.settings,
              activeLeafPath,
              cursorOffset
            );
          }
        };

        // Instead of .on(), use EditorView.updateListener
        const updateListener = EditorView.updateListener.of((update) => {
          if (update.selectionSet) {
            cursorCallback();
          }
        });

        cmEditor.dispatch({
          effects: StateEffect.appendConfig.of([updateListener]),
        });

        const currentFlow = isItFlow;
        if (
          currentFlow !== null &&
          activeLeafPath &&
          !this.settings.activeFlows.includes(currentFlow)
        ) {
          this.settings.activeFlows.unshift(currentFlow);
          this.saveSettings();
        }

        this.listenerBasket[activeLeafPath] = updateListener;
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
        console.log(`Listener removed for: ${activeLeafPath}`);
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
      //console.log("File explorer click detected on:", clickedFilePath);

      if (!clickedFilePath) return;
      const file = this.app.vault.getAbstractFileByPath(clickedFilePath);
      //console.log("File object:", file);

      if (!(file instanceof TFile)) return;

      const leaves = this.app.workspace.getLeavesOfType("markdown");
      console.log(
        leaves.map((leaf) =>
          leaf.view instanceof MarkdownView ? leaf.view.file?.path : "Unknown"
        )
      );

      let fileLeaf = leaves.find(
        (leaf) =>
          leaf.view instanceof MarkdownView &&
          (leaf.view as MarkdownView).file?.path === clickedFilePath
      );

      const currentFlow = this.isFlowFile(clickedFilePath);
      //console.log(`Flow check result for ${clickedFilePath}: ${currentFlow}`);

      if (currentFlow) {
        // Case: File is a flow (either already open or not)
        event.preventDefault();
        //console.log(`File is flow: ${currentFlow}`);

        if (fileLeaf) {
          // Flow is already open, just focus it
          //console.log(`${currentFlow} is open; making it active`);
          this.app.workspace.setActiveLeaf(fileLeaf);
          if (fileLeaf.view instanceof MarkdownView) {
            this.addCursorListener(fileLeaf.view);
            this.setupFlowEditor(fileLeaf.view, currentFlow);
          }
        } else {
          // Flow needs to be opened
          fileLeaf = this.app.workspace.getLeaf(true);
          await fileLeaf.openFile(file);

          if (!this.settings.activeFlows.includes(currentFlow)) {
            this.settings.activeFlows.unshift(currentFlow);
            this.saveSettings();
          }
        }

        // Add cursor listener if it's a MarkdownView
        if (fileLeaf.view instanceof MarkdownView) {
          this.addCursorListener(fileLeaf.view);
          this.setupFlowEditor(fileLeaf.view, currentFlow);
        }
        return;
      }

      // Check if the file is part of any flow
      for (const [flowName, flow] of Object.entries(
        this.settings.flows as Record<string, Types.FlowDef>
      )) {
        if (flow.flowMap[clickedFilePath]) {
          console.log(`${clickedFilePath} is part of flow ${flowName}`);

          // Check if the flow is already open
          let flowLeaf = this.app.workspace
            .getLeavesOfType("markdown")
            .find(
              (leaf) =>
                leaf.view instanceof MarkdownView &&
                (leaf.view as MarkdownView).file?.path === flow.flowFilePath
            );

          if (flowLeaf) {
            console.log(`${flowName} is open; making it active`);
            event.preventDefault();
            await this.app.workspace.setActiveLeaf(flowLeaf);
          } else {
            console.log(
              `${flow.flowFilePath} is not open; opening it in a new leaf`
            );
            event.preventDefault();
            flowLeaf = this.app.workspace.getLeaf(false);
            await flowLeaf.openFile(
              this.app.vault.getAbstractFileByPath(flow.flowFilePath) as TFile
            );

            if (!this.settings.activeFlows.includes(flowName)) {
              this.settings.activeFlows.unshift(flowName);
              if (flowLeaf.view instanceof MarkdownView) {
                this.setupFlowEditor(flowLeaf.view, flowName);
              }
              this.saveSettings();
            }
          }

          // Add cursor listener to the flow leaf if it's a MarkdownView
          if (flowLeaf?.view instanceof MarkdownView) {
            const startPos = flow.flowMap[clickedFilePath].startEndInFlow.start;
            const editor = flowLeaf.view.editor;
            if (editor) {
              const cursorPos = editor.offsetToPos(startPos);
              editor.setCursor(cursorPos);

              // this is to make sure the editor is ready
              setTimeout(() => {
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
              }, 150);

              this.addCursorListener(flowLeaf.view);
              this.setupFlowEditor(flowLeaf.view, flowName);
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
    //console.log("Leafs:", allLeaves);
    // Iterate over all the leaves
    for (const leaf of allLeaves) {
      if (leaf.view instanceof MarkdownView) {
        const activeLeafPath = leaf.view.file?.path;
        //console.log("Leaf path:", activeLeafPath);

        // Now you can check if the leaf's path should be in the listener basket or not
        // If it's part of the active flow, attach the listener
        let flowName = null;
        if (activeLeafPath !== undefined) {
          //console.log("Found flow:", flowName);
          flowName = this.isFlowFile(activeLeafPath);
          if (flowName) {
            this.addCursorListener(leaf.view);
            this.setupFlowEditor(leaf.view, flowName);
            if (!this.settings.activeFlows.includes(flowName)) {
              this.settings.activeFlows.push(flowName);
            }

            // If we have stored cursor position, restore it
            const cache = this.settings.flows[flowName].activeRegionCache;
            if (cache && cache.lastCursorPosition !== undefined) {
              const storedPosition = cache.lastCursorPosition;
              const editor = leaf.view.editor;
              console.log("Restoring cursor position:", storedPosition);
              setTimeout(() => {
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
              }, 150);
            }
            // Initialize region tracking with current cursor position
            const cursorOffset = leaf.view.editor.posToOffset(
              leaf.view.editor.getCursor()
            );
            this.updateActiveRegion(
              this.settings,
              activeLeafPath,
              cursorOffset
            );

            console.log(
              `onload: initialized region tracking for flow ${flowName}`
            );
          }
        }
        this.saveSettings();
      }
    }
  };

  // --------------------------------------------------------------------

  isFlowFile = (activeLeafPath: string) => {
    //console.log(`checking if ${activeLeafPath} is a flow`);
    const flowName = activeLeafPath.match(/([^/]+)(?=\.md$)/)?.[0]; // gets the flow name out of the path
    //console.log(`Clicked file is: ${flowName}`);
    if (flowName && this.settings.flows[flowName]) {
      //console.log(`Yup, it's a flow!`);
      if (!this.settings.activeFlows.includes(flowName)) {
        this.settings.activeFlows.unshift(flowName);
        this.saveSettings();
        //console.log(`Set ${flowName} to active.`);
      }
      return flowName;
    } else {
      //console.log(`Nope, ${activeLeafPath} is not a flow file`);
      return null;
    }
  };

  // ---------------------- Functions: Flow management: Region tracking ----------------------------
  private updateReadOnlyRanges = (flow: Types.FlowDef) => {
    // Create array to hold all read-only ranges
    const readOnlyRanges: Array<{ from: number; to: number }> = [];

    // Process each region in the flow map
    Object.values(flow.flowMap).forEach((region) => {
      if (region.type === "folder") {
        // Entire folder regions are read-only
        readOnlyRanges.push({
          from: region.startEndInFlow.start,
          to: region.startEndInFlow.end,
        });
      } else if (region.type === "file") {
        // Add divider area at the end of file regions
        const dividerLength = this.settings.divider.length + 2; // +2 for \r\r
        readOnlyRanges.push({
          from: region.startEndInFlow.end - dividerLength,
          to: region.startEndInFlow.end,
        });
      }
    });

    return readOnlyRanges;
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

    // Check if our state field exists in the editor state
    return editor.cm.state.field(this.readOnlyRanges, false) !== undefined;
  };

  // -------------------------------------
  private setupFlowEditor = (leaf: MarkdownView, flowName: string) => {
    console.log(`Setting up flow editor for ${flowName}`);
    const flow = this.settings.flows[flowName];
    if (!flow) return;

    const editor = leaf.editor as any;
    if (!editor.cm) return;

    // Check if extension already exists
    if (this.hasReadOnlyExtension(editor)) {
      console.log("Existing extension found, updating ranges");
      this.updateReadOnlyRangesForEditor(editor, flow);
      return;
    }

    // Create and apply the extension for the first time
    const readOnlyRanges = this.updateReadOnlyRanges(flow);
    console.log("Created read-only ranges:", readOnlyRanges);

    const preventEdit = EditorState.transactionFilter.of((tr) => {
      if (!tr.changes.empty) {
        const ranges = tr.startState.field(this.readOnlyRanges);
        console.log("Checking edit against ranges:", ranges);
        let shouldPrevent = false;
        tr.changes.iterChanges((fromA, toA) => {
          for (let range of ranges) {
            if (fromA < range.to && toA > range.from) {
              console.log(`Edit prevented at position ${fromA}-${toA}`);
              shouldPrevent = true;
            }
          }
        });
        if (shouldPrevent) return [];
      }
      return tr;
    });

    // First set up the extension with initial ranges
    editor.cm.dispatch({
      effects: [
        StateEffect.appendConfig.of([this.readOnlyRanges, preventEdit]),
        this.updateRangesEffect.of(readOnlyRanges),
      ],
    });
  };

  // ----------------------------------------------------------
  private updateReadOnlyRangesForEditor = (
    editor: any,
    flow: Types.FlowDef
  ) => {
    const ranges = this.updateReadOnlyRanges(flow);
    console.log("Updating editor with ranges:", ranges);
    editor.cm.dispatch({
      effects: this.updateRangesEffect.of(ranges),
    });
  };
  // ----------------------------------------------------------
  private updateActiveRegion = (
    shSettings: TextFlowSettings,
    activeLeafPath: string,
    cursorOffset: number
  ) => {
    if (!shSettings.activeFlows) return;

    const flowName = activeLeafPath.match(/([^/]+)(?=\.md$)/)?.[0];
    if (!flowName || !shSettings.activeFlows.includes(flowName)) {
      shSettings.flowLeafInFocus = false;
      return;
    }

    const flow = shSettings.flows[flowName];
    if (!flow.activeRegionCache) {
      console.log(`Initial cache setup for flow ${flowName}`);
      this.updateActiveRegionCache(flow, cursorOffset);
      return;
    }

    const cached = flow.activeRegionCache;

    // Debounce rapid cursor checks
    if (
      this.lastCursorCheck &&
      Date.now() - this.lastCursorCheck < 50 && // 50ms debounce
      cursorOffset === this.lastCursorOffset
    ) {
      return;
    }

    this.lastCursorCheck = Date.now();
    this.lastCursorOffset = cursorOffset;

    console.log(
      `Checking cursor position: ${cursorOffset} against region: ${cached.activeRegion.path} (${cached.activeRegion.start}-${cached.activeRegion.end})`
    );

    // Quick check if we're still in current region
    if (
      cursorOffset >= cached.activeRegion.start &&
      cursorOffset <= cached.activeRegion.end
    ) {
      return; // No change needed
    }

    // Check if we moved to next or previous region
    if (
      cached.nextRegion &&
      cursorOffset >= cached.nextRegion.start &&
      cursorOffset <= cached.nextRegion.end
    ) {
      console.log(`Moving to next region: ${cached.nextRegion.path}`);
      this.shiftActiveRegionCache(flow, "forward");
    } else if (
      cached.previousRegion &&
      cursorOffset >= cached.previousRegion.start &&
      cursorOffset <= cached.previousRegion.end
    ) {
      console.log(`Moving to previous region: ${cached.previousRegion.path}`);
      this.shiftActiveRegionCache(flow, "backward");
    } else {
      console.log(`Cursor jumped far - recalculating cache`);
      this.updateActiveRegionCache(flow, cursorOffset);
    }
    shSettings.flowLeafInFocus = true;
    this.saveSettings();
  };

  // --------------------------- Functions: Flow management: update cache -----------------------------------------
  private updateActiveRegionCache = (
    flow: Types.FlowDef,
    cursorOffset: number
  ) => {
    // Performance optimization: Cache sorted regions
    if (!this.sortedRegionsCache || this.lastFlowUpdate !== flow.flowFilePath) {
      this.sortedRegionsCache = Object.entries(flow.flowMap)
        .map(([path, item]) => ({
          path,
          start: item.startEndInFlow.start,
          end: item.startEndInFlow.end,
          type: item.type,
        }))
        .sort((a, b) => a.start - b.start);
      this.lastFlowUpdate = flow.flowFilePath;
    }

    // Binary search for the region containing cursorOffset
    let left = 0;
    let right = this.sortedRegionsCache.length - 1;
    let currentIndex = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const region = this.sortedRegionsCache[mid];

      if (cursorOffset >= region.start && cursorOffset <= region.end) {
        currentIndex = mid;
        break;
      }

      if (cursorOffset < region.start) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    if (currentIndex === -1) {
      console.log(`Warning: Cursor (${cursorOffset}) not found in any region`);
      return;
    }

    console.log(
      `Found cursor in region: ${this.sortedRegionsCache[currentIndex].path}`
    );
    console.log(
      `Region bounds: ${this.sortedRegionsCache[currentIndex].start}-${this.sortedRegionsCache[currentIndex].end}`
    );

    // Update cache
    flow.activeRegionCache = {
      lastCursorPosition: cursorOffset,
      activeRegion: this.sortedRegionsCache[currentIndex],
      previousRegion:
        currentIndex > 0
          ? this.sortedRegionsCache[currentIndex - 1]
          : undefined,
      nextRegion:
        currentIndex < this.sortedRegionsCache.length - 1
          ? this.sortedRegionsCache[currentIndex + 1]
          : undefined,
    };
    this.saveSettings();
    console.log(`Cache updated with:
        Active: ${flow.activeRegionCache.activeRegion.path}
        Previous: ${flow.activeRegionCache.previousRegion?.path || "none"}
        Next: ${flow.activeRegionCache.nextRegion?.path || "none"}`);
  };

  // --------------------------- Functions: Flow management: shift cache -----------------------------------------
  private shiftActiveRegionCache = (
    flow: Types.FlowDef,
    direction: "forward" | "backward"
  ) => {
    if (!flow.activeRegionCache) {
      console.log("Warning: Cannot shift undefined cache");
      return;
    }

    console.log(`Shifting cache ${direction}`);

    if (direction === "forward" && flow.activeRegionCache.nextRegion) {
      const nextNext = this.findNextRegion(
        flow,
        flow.activeRegionCache.nextRegion.path
      );
      flow.activeRegionCache = {
        lastCursorPosition: flow.activeRegionCache.lastCursorPosition,
        activeRegion: flow.activeRegionCache.nextRegion,
        previousRegion: flow.activeRegionCache.activeRegion,
        nextRegion: nextNext,
      };
      console.log(
        `Shifted forward to: ${flow.activeRegionCache.activeRegion.path}`
      );
    } else if (
      direction === "backward" &&
      flow.activeRegionCache.previousRegion
    ) {
      const prevPrev = this.findPreviousRegion(
        flow,
        flow.activeRegionCache.previousRegion.path
      );
      flow.activeRegionCache = {
        lastCursorPosition: flow.activeRegionCache.lastCursorPosition,
        activeRegion: flow.activeRegionCache.previousRegion,
        previousRegion: prevPrev,
        nextRegion: flow.activeRegionCache.activeRegion,
      };
      console.log(
        `Shifted backward to: ${flow.activeRegionCache.activeRegion.path}`
      );
    }
    this.saveSettings();
  };

  // --------------------------- Functions: Flow management: find next/previous region -----------------------------------------
  private findNextRegion = (flow: Types.FlowDef, currentPath: string) => {
    const regions = Object.entries(flow.flowMap)
      .map(([path, item]) => ({
        path,
        start: item.startEndInFlow.start,
        end: item.startEndInFlow.end,
        type: item.type,
      }))
      .sort((a, b) => a.start - b.start);

    const currentIndex = regions.findIndex((r) => r.path === currentPath);
    const nextRegion =
      currentIndex < regions.length - 1 ? regions[currentIndex + 1] : undefined;

    if (nextRegion) {
      console.log(`Found next region: ${nextRegion.path}`);
    }
    return nextRegion;
  };

  // --------------------------------------------------------------------
  private findPreviousRegion = (flow: Types.FlowDef, currentPath: string) => {
    const regions = Object.entries(flow.flowMap)
      .map(([path, item]) => ({
        path,
        start: item.startEndInFlow.start,
        end: item.startEndInFlow.end,
        type: item.type,
      }))
      .sort((a, b) => a.start - b.start);

    const currentIndex = regions.findIndex((r) => r.path === currentPath);
    const prevRegion = currentIndex > 0 ? regions[currentIndex - 1] : undefined;

    if (prevRegion) {
      console.log(`Found previous region: ${prevRegion.path}`);
    }
    return prevRegion;
  };

  // -------------------------------------------------------
  //------------------------- ONLOAD -----------------------
  // -------------------------------------------------------
  async onload() {
    console.log("TextFlow Plugin loaded.");

    // ------ ONLOAD: get the settings ------------------
    this.settings = await this.loadSettings();

    // ------ ONLOAD: if plugin has been set up before, make sure the temp folder exists ------------
    if (
      this.settings.tempFolderPlace !== "not set yet" &&
      this.settings.tempFolderPlace !== undefined
    ) {
      this.ensureTempFolder();
    }

    // ----- ONLOAD: set up UI -------------------------
    // -------------------------------------------------------------------

    this.discernAndSetTempFolderState(
      this.settings.tempFolderHidden,
      this.settings.tempFolderPlace
    );

    this.saveSettings();

    // ------------------- ONLOAD: add listeners for cursor and clicks
    // Wait for the file explorer to be available in the DOM
    this.app.workspace.onLayoutReady(() => {
      this.initialSetup();
      // -------------------------------
      this.addCursorListener(
        this.app.workspace.getActiveViewOfType(MarkdownView) as MarkdownView
      );
      // -------------------------------
      this.fileExplorerClickListener(); // This only creates the function

      // Add this to actually attach the listener:
      const fileExplorer = document.querySelector(".nav-files-container");
      if (fileExplorer && this.boundFileExplorerClick) {
        fileExplorer.addEventListener("click", this.boundFileExplorerClick);
        console.log("File explorer click listener added");
      } else {
        console.log(
          "Could not find file explorer or click listener not defined"
        );
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
    console.log("TextFlow Plugin unloaded.");
    // ---------------- Store data for all active flows ----
    this.saveSettings();

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
  // ------------------ ONUNLOAD: remove global listeners -------------------
  removeListeners() {}
}
