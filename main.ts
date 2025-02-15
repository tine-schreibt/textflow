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

  // ------------------ protects the editor from changes while a save is going on
  private toggleProtectionEffect = StateEffect.define<boolean>();

  private protectDuringSaveExtension = StateField.define<boolean>({
    create: () => false,
    update: (value, tr) => {
      for (let effect of tr.effects) {
        if (effect.is(this.toggleProtectionEffect)) {
          return effect.value; // Still boolean
        }
      }
      return value;
    },
    provide: (field) =>
      EditorView.editorAttributes.of((value) => ({
        editable: value ? "false" : "true", // Convert boolean to string here
      })),
  });

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

    this.registerDomEvent(window, "blur", async () => {
      if (this.settings.autoSave) {
        console.log("blur listener calls saveAllLeavesAuto");
        await this.saveAllLeavesAuto();
        console.log("blur listener: saves finished");
      }
    });

    // ---------------- Change to focus -------------------------------

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", async (leaf) => {
        // Save inactive leaves
        //console.log("active-leaf-change calling saveInactiveLeaves");
        await this.saveInactiveLeaves();
        // console.log("active-leaf-change: save finished");
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
                  // Add read-only and activate
                }
              }
            }
          }
        }
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
                        /* console.log(
                          "cusor listener calling checkActiveRegionCache"
                        );*/
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
          //  console.error("Error attaching navigation listener:", error);
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
                      console.log("textChangeListener looking for path");
                      if (shSettings.flows[isItFlow].activeRegion) {
                        console.log("textChangeListener found path");
                        if (
                          // if the active region isn't registered as edited
                          !shSettings.flows[
                            isItFlow
                          ].modifiedRegionsArray.includes(
                            shSettings.flows[isItFlow].activeRegion.path
                          )
                        ) {
                          shSettings.flows[isItFlow].modifiedRegionsArray.push(
                            shSettings.flows[isItFlow].activeRegion.path
                          );
                          console.log(
                            "region added to modifiedRegionsArray: ",
                            shSettings.flows[isItFlow].modifiedRegionsArray
                          );
                        }
                        if (
                          !shSettings.flagForRebuild.includes(
                            shSettings.flows[isItFlow].activeRegion.path
                          )
                        ) {
                          shSettings.flagForRebuild.push(
                            shSettings.flows[isItFlow].activeRegion.path
                          );
                          console.log(
                            "path added to flaggedForRebuild array: ",
                            shSettings.flagForRebuild
                          );
                        }
                        // Here you can handle the changes
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
                      }
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
          //  console.error("Error attaching change listener:", error);
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
              const editor = flowLeaf.view.editor as any;
              this.addProtectDuringSaveExtension(editor);
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
    const editor = view.editor as any;
    this.addProtectDuringSaveExtension(editor);
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

  // ---------------------- Functions: Data safety ----------------------------

  // --------------------- Functions: Data safety: Read-only for UIDs and dividers
  private addReadOnlyExtension = (leaf: MarkdownView, flowName: string) => {
    const flow = this.settings.flows[flowName];
    if (!flow) return;

    const editor = leaf.editor as any;
    if (!editor.cm) return;

    if (!this.hasReadOnlyExtension(editor)) {
      // console.log("attaching readOnlyExtension to: ", flowName);
      const preventEdit = EditorState.transactionFilter.of((tr) => {
        if (!tr.changes.empty) {
          let shouldReject = false;

          tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
            const windowStart = Math.max(0, fromA - 50);
            const windowEnd = Math.min(tr.startState.doc.length, toA + 50);
            const windowText = tr.startState.sliceDoc(windowStart, windowEnd);

            let match;
            const regex = /(?:^|\n)[\u200B\u200C\u200D]{26,}(<hr>)(?:\n\n|$)/g;

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
    }
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

  /// --------------- Functions: Data safety: Protect editor during saving

  private addProtectDuringSaveExtension(editor: any) {
    try {
      if (editor.cm instanceof EditorView) {
        // Check if protection extension already exists
        const hasProtection = editor.cm.state.field(
          this.protectDuringSaveExtension,
          false
        );

        if (!hasProtection) {
          editor.cm.dispatch({
            effects: StateEffect.appendConfig.of([
              this.protectDuringSaveExtension,
            ]),
          });
          //  console.log("Added protection extension to editor");
        } else {
          //  console.log("Editor already has protection extension");
        }
      } else {
        console.warn("Could not find EditorView instance:", editor);
      }
    } catch (error) {
      if (error.message?.includes("Field is not present")) {
        // This is fine - means we need to add the extension
        editor.cm.dispatch({
          effects: StateEffect.appendConfig.of([
            this.protectDuringSaveExtension,
          ]),
        });
        //  console.log("Added protection extension to editor");
      } else {
        console.error("Failed to add protection extension:", error);
      }
    }
  }

  // Toggle protection state
  private toggleProtectionDuringSave(editor: EditorView, protect: boolean) {
    try {
      editor.dispatch({
        effects: this.toggleProtectionEffect.of(protect),
      });
    } catch (error) {
      console.error("Failed to toggle protection:", error);
    }
  }
  // ----------------- Functions: Data safety: Save changes to source files
  // For window/leaf changes - only save inactive flows
  private saveInactiveLeaves = async () => {
    if (!this.settings.autoSave) return;

    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const inactiveLeaves = this.app.workspace
      .getLeavesOfType("markdown")
      .filter(
        (leaf) =>
          leaf.view instanceof MarkdownView &&
          activeView &&
          leaf.view !== activeView
      );

    // Create a map of flowId to leaf
    const flowLeaves: Record<string, MarkdownView> = {};

    // Populate flowLeaves
    for (const leaf of inactiveLeaves) {
      const view = leaf.view as MarkdownView;
      const filePath = view.file?.path;
      if (filePath) {
        const flowName = await this.isFlowFile(filePath);
        if (flowName && !flowLeaves[flowName]) {
          flowLeaves[flowName] = view;
        }
      }
    }
    try {
      // Enable protection
      for (const [_, view] of Object.entries(flowLeaves)) {
        const editor = view.editor as ObsidianEditor;
        if (editor.cm) {
          await this.toggleProtectionDuringSave(editor.cm, true);
        }
      }
      // Perform saves
      await Promise.all(
        Object.entries(flowLeaves).map(async ([flowId, view]) => {
          const text = view.editor.getValue();
          await this.saveBackToSource(flowId, text);
        })
      );
    } finally {
      // Remove protection
      for (const [_, view] of Object.entries(flowLeaves)) {
        const editor = view.editor as ObsidianEditor;
        if (editor.cm) {
          this.toggleProtectionDuringSave(editor.cm, false);
        }
      }
    }
  };

  // For app blur and manual save - save everything
  private saveAllLeavesAuto = async () => {
    if (!this.settings.autoSave) return;

    const allLeaves = this.app.workspace.getLeavesOfType("markdown");
    const flowLeaves: Record<string, MarkdownView> = {};

    // Populate flowLeaves
    for (const leaf of allLeaves) {
      const view = leaf.view as MarkdownView;
      const filePath = view.file?.path;
      if (filePath) {
        const flowId = await this.isFlowFile(filePath);
        if (flowId && !flowLeaves[flowId]) {
          flowLeaves[flowId] = view;
        }
      }
    }
    try {
      // Enable protection
      for (const [_, view] of Object.entries(flowLeaves)) {
        const editor = view.editor as ObsidianEditor;
        if (editor.cm) {
          await this.toggleProtectionDuringSave(editor.cm, true);
        }
      }
      // Perform saves
      await Promise.all(
        Object.entries(flowLeaves).map(async ([flowId, view]) => {
          const text = view.editor.getValue();
          await this.saveBackToSource(flowId, text);
        })
      );
    } finally {
      // Remove protection
      for (const [_, view] of Object.entries(flowLeaves)) {
        const editor = view.editor as ObsidianEditor;
        if (editor.cm) {
          this.toggleProtectionDuringSave(editor.cm, false);
        }
      }
    }
  };

  private saveAllLeavesManual = async () => {
    const allLeaves = this.app.workspace.getLeavesOfType("markdown");
    const flowLeaves: Record<string, MarkdownView> = {};

    // Populate flowLeaves
    for (const leaf of allLeaves) {
      const view = leaf.view as MarkdownView;
      const filePath = view.file?.path;
      if (filePath) {
        const flowId = await this.isFlowFile(filePath);
        if (flowId && !flowLeaves[flowId]) {
          flowLeaves[flowId] = view;
        }
      }
    }
    try {
      // Enable protection
      for (const [_, view] of Object.entries(flowLeaves)) {
        const editor = view.editor as ObsidianEditor;
        if (editor.cm) {
          await this.toggleProtectionDuringSave(editor.cm, true);
        }
      }
      // Perform saves
      await Promise.all(
        Object.entries(flowLeaves).map(async ([flowId, view]) => {
          const text = view.editor.getValue();
          await this.saveBackToSource(flowId, text);
        })
      );
    } finally {
      // Remove protection
      for (const [_, view] of Object.entries(flowLeaves)) {
        const editor = view.editor as ObsidianEditor;
        if (editor.cm) {
          this.toggleProtectionDuringSave(editor.cm, false);
        }
      }
    }
  };

  //---- The actual save function -------------
  private saveBackToSource = async (flow: string, text: string) => {
    // console.log("saveBackToSource responding");
    if (this.settings.flows[flow].modifiedRegionsArray) {
      /* console.log(
        "saveBackToSource iterating trough modifiedRegions: ",
        this.settings.flows[flow].modifiedRegionsArray
      );*/
      const map = this.settings.flows[flow].flowMap;
      const remainingPaths: string[] = [];
      for (const path of this.settings.flows[flow].modifiedRegionsArray) {
        const sourceFile = await this.app.vault.getFileByPath(path);
        if (!sourceFile) {
          console.error(`File not found at path: ${path}`);
          return;
        }
        // console.log("saveBackToSource calling findStartOfRegion");
        const startOfRegion = await this.findStartOfRegion(
          this.settings.flows[flow],
          map[path].flowOrder - 1,
          text
        );
        console.log(
          "saveBackToSource findStartOfRegion says: ",
          path,
          " starts at ",
          startOfRegion
        );

        // console.log("saveBackToSource calling findEndOfRegion");
        const endOfRegion = text.indexOf(map[path].UID) - 1; // subtract 1 for the \r before the UID
        const flowFile = await this.app.vault.getFileByPath(
          this.settings.flows[flow].flowFilePath
        );
        console.log(
          "saveBackToSource findEndOfRegion says: ",
          path,
          " ends at ",
          endOfRegion
        );

        if (!flowFile) {
          console.error(`File not found at path: ${path}`);
          return;
        } else if (sourceFile instanceof TFile) {
          const flowContent = await this.app.vault.read(flowFile);
          console.log("Source file is: ", sourceFile);
          console.log(
            "saveBackToSource reading ",
            this.settings.flows[flow].flowFilePath
          );
          {
            const regionSlice = flowContent.slice(startOfRegion, endOfRegion);
            console.log("saveBackToSource slices from flow: ", regionSlice);
            try {
              // Read existing content
              const existingContent = await this.app.vault.read(sourceFile);

              // Replace content portion while keeping YAML
              const yamlMatch = existingContent.match(/^---\n[\s\S]*?\n---\n/);
              const newContent = yamlMatch
                ? `${yamlMatch[0]}${regionSlice}`
                : regionSlice;

              // Save modified content
              await this.app.vault.modify(sourceFile, newContent);
              // console.log("saveBackToSource is done saving");
            } catch (error) {
              remainingPaths.push(path);

              // console.error(`Failed to save changes to ${file.path}:`, error);
              throw error;
            }
          }
        }
      }
      this.settings.flows[flow].modifiedRegionsArray = remainingPaths;
    }
  };

  // --------------- Functions: Flow management: Regions -----------------------------------------
  private checkActiveRegionCache = async (
    flow: Types.FlowDef,
    cursorOffset: number
  ) => {
    /* console.log("=== checkActiveRegionCache called ===");
    console.log("Cursor offset:", cursorOffset);*/

    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      console.log("No active view found");
      return;
    }

    const editor = activeView.editor as ObsidianEditor;
    const cmEditor = editor.cm;
    if (!cmEditor) {
      console.log("No cmEditor found");
      return;
    }

    // Get full document text from CodeMirror state
    const text = cmEditor.state.doc.toString();
    // console.log("Document length:", text.length);

    if (
      cursorOffset > flow.activeRegion.startInFlow &&
      cursorOffset < flow.activeRegion.endInFlow
    ) {
      // console.log("Cursor still in same region, updating position");
      flow.activeRegion.lastCursorPosition = cursorOffset;
      this.saveSettings();
      return;
    } else {
      // console.log("Cursor in new region, finding active region");
      flow.activeRegion.lastCursorPosition = cursorOffset;
      let activeRegion = await this.findActiveRegion(flow, cursorOffset, text);
      if (activeRegion) {
        console.log("New active region found:", activeRegion.path);
        flow.activeRegion = activeRegion;
      } else {
        console.log("No new active region found");
      }
      this.saveSettings();
    }
  };

  // ------------- region tracking utilities ----------------------
  private findActiveRegion = async (
    flow: Types.FlowDef,
    cursorOffset: number,
    text: string
  ) => {
    /* console.log("=== findActiveRegion called ===");
    console.log("Cursor offset:", cursorOffset);
    console.log("Text length:", text.length);*/

    const markerRegex = /[\u200B\u200C\u200D]{26,}<hr>/;
    const searchStart = text.slice(cursorOffset);
    // console.log("Search start length:", searchStart.length);

    const matches = searchStart.match(markerRegex);
    // console.log("Marker matches:", matches ? "yes" : "no");

    if (matches) {
      const uidLength = matches[0].length - 4;
      const uid = matches[0].slice(0, uidLength);
      // console.log("Found UID:", uid);

      const foundRegion = Object.entries(flow.flowMap).find(
        ([_, foundRegionMap]) => foundRegionMap.UID === uid
      );

      if (foundRegion) {
        const [foundRegionPath, foundRegionMap] = foundRegion;
        // console.log(`Match found: ${foundRegionPath} (${foundRegionMap.type})`);

        let newStartInFlow;
        if (foundRegionMap.flowOrder > 1) {
          newStartInFlow =
            this.findStartOfRegion(flow, foundRegionMap.flowOrder - 1, text) ||
            0;
        } else {
          newStartInFlow = 0;
        }

        const endInFlow = text.indexOf(foundRegionMap.UID) + matches[0].length;

        /* console.log("Region bounds:", {
          start: newStartInFlow,
          end: endInFlow,
          path: foundRegionPath,
        });*/

        const activeRegionObject: Types.ActiveRegion = {
          lastCursorPosition: cursorOffset,
          path: foundRegionPath,
          UID: uid,
          flowOrder: foundRegionMap.flowOrder,
          startInFlow: newStartInFlow,
          endInFlow: endInFlow,
        };

        // console.log("Returning active region:", activeRegionObject);
        return activeRegionObject;
      } else {
        console.log("No matching region found for UID");
      }
    } else {
      console.log("No marker found in text after cursor");
    }
    // console.log("=== findActiveRegion end ===");
    return undefined;
  };

  // ------------------
  private findStartOfRegion = (
    flow: Types.FlowDef,
    flowOrder: number,
    text: string
  ) => {
    const previousRegion = Object.entries(flow.flowMap).find(
      ([previousRegion, previousRegionFlowMapEntry]) =>
        previousRegionFlowMapEntry.flowOrder === flowOrder
    );
    if (previousRegion) {
      const [previousRegionPath, previousRegionMap] = previousRegion;

      if (flowOrder - 1 !== 0) {
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

      await this.initialSetup(); //

      // Handle temp folder visibility
      if (this.settings.tempFolderHidden) {
        this.discernAndSetTempFolderState(true, this.settings.tempFolderPlace);
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
