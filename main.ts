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
    await this.saveData(this.settings);
  }
  // ---------------------------------------------------------------
  async ensureTempFolder() {
    if (this.settings.tempFolderPlace !== undefined) {
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

        // Check if any flows were closed
        let closure = this.settings.activeFlows.filter(
          (f) => !currentPaths.includes(f)
        );
        if (closure.length > 0) {
          closure.forEach((flow) => {});
          this.settings.activeFlows.filter((f) => !closure.includes(f));

          this.saveSettings();
        }
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
      console.log(`Cursor listener already exists for: ${activeLeafPath}`);
      return;
    }
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
        const updateActiveRegionListener = EditorView.updateListener.of(
          (update) => {
            if (update.selectionSet) {
              cursorCallback();
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
      console.log("File explorer click detected on:", clickedFilePath);

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
          // Flow is already open, just focus it and adjust readonly
          this.app.workspace.setActiveLeaf(fileLeaf);
          if (fileLeaf.view instanceof MarkdownView) {
            console.log("About to call setupReadonlyEditor #1");
            this.setupReadOnlyEditor(fileLeaf.view, currentFlow);
          }
        } else {
          // Flow needs to be opened, listener and readonly attached
          fileLeaf = this.app.workspace.getLeaf(true);
          await fileLeaf.openFile(file);
          const activeView =
            this.app.workspace.getActiveViewOfType(MarkdownView);
          if (activeView) {
            if (fileLeaf.view instanceof MarkdownView) {
              this.addCursorListener(fileLeaf.view);
              console.log("About to call setupReadonlyEditor #2");
              this.setupReadOnlyEditor(activeView, currentFlow);
            }
          }

          if (!this.settings.activeFlows.includes(currentFlow)) {
            this.settings.activeFlows.unshift(currentFlow);
            this.saveSettings();
          }
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

          // if it's open just make it active
          if (flowLeaf) {
            console.log(`${flowName} is open; making it active`);
            event.preventDefault();
            if (flowLeaf.view instanceof MarkdownView) {
              console.log("About to call setupReadonlyEditor #3");
              this.setupReadOnlyEditor(flowLeaf.view, flowName);
              this.addCursorListener(flowLeaf.view);
            }
            await this.app.workspace.setActiveLeaf(flowLeaf);
          } else {
            // if it's not open, open it and attach stuff
            event.preventDefault();
            flowLeaf = this.app.workspace.getLeaf(true);
            await flowLeaf.openFile(
              this.app.vault.getAbstractFileByPath(flow.flowFilePath) as TFile
            );

            if (!this.settings.activeFlows.includes(flowName)) {
              this.settings.activeFlows.unshift(flowName);
              if (flowLeaf.view instanceof MarkdownView) {
                console.log("About to call setupReadonlyEditor #4");
                this.setupReadOnlyEditor(flowLeaf.view, flowName);
                this.addCursorListener(flowLeaf.view);
              }
              this.saveSettings();
            }
          }
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
    console.log("Initial setup running");
    // Iterate over all the leavesfileExplorerClickListener
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
            console.log("About to call setupReadonlyEditor from initialSetup");
            this.setupReadOnlyEditor(leaf.view, flowName);
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

  private setupReadOnlyEditor = (leaf: MarkdownView, flowName: string) => {
    console.log(`Setting up flow editor for ${flowName}`);
    const flow = this.settings.flows[flowName];
    if (!flow) return;

    const editor = leaf.editor as any;
    if (!editor.cm) return;

    // Add a unique class to the editor container
    const container = leaf.containerEl;
    container.classList.add("flow-view"); // Ensures only your plugin’s files are affected
    console.log("Attaching flow view class");

    // Remove class when the file is closed
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (newLeaf) => {
        // Ensure newLeaf is valid before proceeding
        if (newLeaf instanceof WorkspaceLeaf) {
          // Compare leaves instead of views
          if (newLeaf !== leaf.leaf) {
            container.classList.remove("flow-view");
            console.log("removing flow view class");
          }
        } else {
          // If there's no valid leaf, remove the class for safety
          container.classList.remove("flow-view");
        }
      })
    );

    if (this.hasReadOnlyExtension(editor)) {
      console.log("Removing existing read-only extension");
      this.removeReadOnlyExtension(editor);
    }

    const preventEdit = EditorState.transactionFilter.of((tr) => {
      if (!tr.changes.empty) {
        let shouldReject = false;

        tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
          // Get a larger window around the edit point
          const windowStart = Math.max(0, fromA - 10);
          const windowEnd = Math.min(tr.startState.doc.length, toA + 10);
          const windowText = tr.startState.sliceDoc(windowStart, windowEnd);

          console.log("Window text:", JSON.stringify(windowText));

          let match;
          const regex = /\*\*\*/g;
          while ((match = regex.exec(windowText)) !== null) {
            // Get absolute positions of the protected `***`
            const absoluteDividerStart = windowStart + match.index;
            const absoluteDividerEnd = absoluteDividerStart + 3;

            console.log(
              `Found divider at ${absoluteDividerStart}-${absoluteDividerEnd}, edit at ${fromA}-${toA}`
            );

            // Check if edit overlaps with `***`
            if (
              // Direct modification within ***
              (fromA < absoluteDividerEnd && toA > absoluteDividerStart) ||
              // Deletion that extends into ***
              (fromA <= absoluteDividerStart && toA >= absoluteDividerEnd)
            ) {
              console.log("Edit would affect protected range");
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

    console.log("Applying preventEdit filter to editor");
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
    console.log("Checking for read-only extension:", hasField);
    return hasField;
  };

  // ----------------------------------------------------------

  private updateActiveRegion = (
    shSettings: TextFlowSettings,
    activeLeafPath: string,
    cursorOffset: number
  ) => {
    const flowName = this.isFlowFile(activeLeafPath);
    if (!flowName) return;

    const flow = shSettings.flows[flowName];
    if (!flow) return;

    const cached = flow.activeRegionCache;
    if (!cached) {
      console.log("No cache exists, initializing..."); // Debug log
      // First-time initialization of cache
      this.updateActiveRegionCache(flow, cursorOffset);
      return;
    }

    // Check if cursor is still within the active region (region 0)
    const activeRegion = cached.regions[0];
    console.log("Current active region:", activeRegion); // Debug log
    // console.log("Cursor position:", cursorOffset); // Debug log

    if (
      cursorOffset >= activeRegion.start &&
      cursorOffset <= activeRegion.end
    ) {
      // Still in active region, just update cursor position
      cached.lastCursorPosition = cursorOffset;
      //console.log("Still in active region"); // Debug log

      return;
    }

    // Check if cursor moved to an adjacent cached region
    for (let i = -2; i <= 2; i++) {
      const region = cached.regions[i];
      if (!region) continue;

      if (cursorOffset >= region.start && cursorOffset <= region.end) {
        console.log(`Moving to region ${i}`);
        // Shift the cache window by i positions
        const direction = i > 0 ? "forward" : "backward";
        const shifts = Math.abs(i);
        for (let j = 0; j < shifts; j++) {
          this.shiftCacheWindow(flow, direction);
        }
        // If we get here, cursor has moved outside our cached window
        console.log("Cursor moved outside cache window - recalculating cache"); // Debug log
        this.updateActiveRegionCache(flow, cursorOffset);
        return;
      }
    }

    // If we get here, cursor has moved outside our cached window
    console.log("Cursor moved outside cache window - recalculating cache");
    this.updateActiveRegionCache(flow, cursorOffset);

    // Update read-only ranges after recalculation
  };

  // --------------------------- Functions: Flow management: update cache -----------------------------------------
  private updateActiveRegionCache = (
    flow: Types.FlowDef,
    cursorOffset: number
  ) => {
    const regions = flow.flowMap;
    const regionArray = Object.values(regions).sort(
      (a, b) => a.startEndInFlow.start - b.startEndInFlow.start
    );

    // Find the active region index
    const activeIndex = regionArray.findIndex(
      (region) =>
        cursorOffset >= region.startEndInFlow.start &&
        cursorOffset <= region.startEndInFlow.end
    );

    if (activeIndex === -1) return;

    // Initialize or reset cache
    flow.activeRegionCache = {
      lastCursorPosition: cursorOffset,
      regions: {},
    };

    // Populate cache with surrounding regions (-2 to +2)
    for (let i = -2; i <= 2; i++) {
      const regionIndex = activeIndex + i;
      if (regionIndex >= 0 && regionIndex < regionArray.length) {
        const region = regionArray[regionIndex];
        flow.activeRegionCache.regions[i] = {
          path: region.path,
          start: region.startEndInFlow.start,
          end: region.startEndInFlow.end,
          type: region.type,
        };
      }
    }
  };

  // --------------------------- Functions: Flow management: shift cache -----------------------------------------
  private shiftCacheWindow = (
    flow: Types.FlowDef,
    direction: "forward" | "backward"
  ) => {
    if (!flow.activeRegionCache) return;

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
    this.updateActiveRegionCache(
      flow,
      regions[newActiveIndex].startEndInFlow.start + 1
    );
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

    // -------------------------------------------------------------------
    // ------------------- ONLOAD: add listeners for cursor and clicks
    // Wait for the file explorer to be available in the DOM
    this.app.workspace.onLayoutReady(() => {
      // ----- ONLOAD: set up UI -------------------------
      this.initialSetup();
      if (this.settings.tempFolderHidden) {
        console.log(
          `[TextFlow] Layout ready, current hidden state: ${this.settings.tempFolderHidden}`
        );
        this.discernAndSetTempFolderState(true, this.settings.tempFolderPlace);
      }
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
    console.log("TextFlow Plugin unloaded.");
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
    // Clear our caches
    this.sortedRegionsCache = null;
    this.lastFlowUpdate = "";
    this.lastCursorCheck = 0;
    this.lastCursorOffset = 0;

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
