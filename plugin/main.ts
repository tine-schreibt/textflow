import {
  App,
  Editor,
  EventRef,
  FileView,
  MarkdownView,
  Modal,
  normalizePath,
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
import * as Types from "./src/types";
import * as Modals from "./src/modals";
// import { TextFlow } from "./src/flowMaker";

interface ObsidianEditor extends Editor {
  cm?: EditorView;
}

// used by the cursor listener
interface CodeMirrorCursor {
  line: number;
  ch: number;
}

// the basket is used to keep all listener data in one accessible place
interface ListenerBasketItem {
  plugin: ViewPlugin<any>;
  extension: StateEffect<any>;
}

export default class TextFlowPlugin extends Plugin {
  settings: TextFlowSettings;
  tempFilePath: string;

  // ---------------- Global objects and variables -------------------------
  // ---- flag to prevent the leaf-change-listener from interfering with scrolling to yource file in flow
  private isNavigatingFlow: boolean = false;

  // ----------------- tracking read-only ranges (to protect region IDs) --------------------------
  // helper stuff and auxiliaries
  private hadTrackingError: boolean = false;

  // adds a lock symbol to read-only files
  private readOnlyHighlight = Decoration.mark({
    class: "cm-read-only-region",
  });

  // state field for id protection
  private readOnlyRanges = StateField.define<{
    ranges: Array<{ from: number; to: number }>;
    decorations: DecorationSet;
  }>({
    create: () => ({
      ranges: [],
      decorations: Decoration.none,
    }),
    // tr -> transaction
    update: (state, tr) => {
      let ranges = state.ranges;

      // Handle range updates
      // e -> effect
      for (let e of tr.effects) {
        if (e.is(this.updateRangesEffect)) {
          ranges = e.value;
        }
      }

      // Create decorations from ranges; normalize position 0
      const decorations = Decoration.set(
        ranges.map((range) =>
          this.readOnlyHighlight.range(Math.max(0, range.from), range.to)
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

  // ----- protect the editor from changes while a save is going on ----------------
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
        editable: value ? "false" : "true",
      })),
  });

  // Add this new property to track the most recently active flow leaf
  private mostRecentActiveFlowLeaf: WorkspaceLeaf | null = null;

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
  async ensureSystemFolder() {
    const systemFolder = this.app.vault
      .getAllLoadedFiles()
      .find(
        (file) =>
          file instanceof TFolder && file.name === "TextFlow_SystemFolder"
      );

    if (!systemFolder) {
      // if there is no system folder
      if (
        // but place/path are defined
        this.settings.systemFolderPlace != undefined &&
        this.settings.systemFolderPath != undefined
      ) {
        new Notice(
          `The TextFlow_SystemFolder could not be found. Please return it to ${this.settings.systemFolderPlace} or create a new one via the TextFlow settings.`
        );
      }
    }
    if (systemFolder) {
      // if there is a systemFolder
      if (
        // but expected place/path don't agree with actual place/path
        this.settings.systemFolderPlace != (systemFolder.parent?.path ?? "") || // if parent is null, use "" as the path
        this.settings.systemFolderPath != systemFolder.path
      ) {
        // defer to reality and update settings
        const oldPlace = this.settings.systemFolderPlace;
        this.settings.systemFolderPlace = systemFolder.parent?.path ?? "";
        this.settings.systemFolderPath = systemFolder.path;
        for (let flow in this.settings.flows) {
          this.settings.flows[flow].flowFilePath = normalizePath(
            `${this.settings.systemFolderPath}/${flow}.md`
          );
        }

        new Notice(
          `The TextFlow_SystemFolder seems to have been moved manually from ${oldPlace} to ${this.settings.systemFolderPlace}. TextFlow's settings have been updated accordingly.`
        );
        await this.saveSettings();
      }
    }
  }

  // ---------------- Functions: Utilities: UI -------------------------

  registerCommands() {
    // Command for onOffSwitch
    this.addCommand({
      id: `save-text-flow`,
      name: `Save all modified regions.`,
      callback: async () => {
        // toggle
        await this.saveAllLeavesManual();
        await this.saveSettings();
      },
    });
  }

  // ----- is called onload
  discernAndSetSystemFolderState = (
    systemFolderState?: boolean,
    systemFolderPlace?: string
  ): void => {
    // Remove any existing style
    const existingStyle = document.head.querySelector(
      "style[data-textflow-temp]"
    );
    if (existingStyle) {
      existingStyle.remove();
    }

    // If we're not hiding or don't have a place defined, just return after removing style
    if (!systemFolderState || systemFolderPlace === undefined) {
      return;
    }

    let sysFolderPath = "";
    if (systemFolderPlace === "/") {
      sysFolderPath = normalizePath(`/TextFlow_SystemFolder`);
    } else {
      sysFolderPath = normalizePath(
        `${systemFolderPlace}/TextFlow_SystemFolder`
      );
    }

    // Create and append style with the correct selector
    const addStyle = () => {
      let hiddenStyle = document.createElement("style");
      hiddenStyle.setAttribute("data-textflow-temp", "true");

      hiddenStyle.textContent = `
            div[data-path='${sysFolderPath}'],
            div[data-path^='${sysFolderPath}'] {
                display: none !important;
            }
        `;
      document.head.appendChild(hiddenStyle);
    };

    // Try immediately and also with a small delay to ensure DOM is ready
    addStyle();
    setTimeout(addStyle, 500); // Add style again after 500ms
  };

  // ----- DECORATE SOURCE NOTES IN FILE EXPLORER -----------
  decorateSourceFiles = (): void => {
    // Remove any existing style
    let path = "";
    let handledPathsArray: string[] = [];
    const unsavedPathsArray: string[] = [];
    let isUnsaved = false;

    const accentColor = getComputedStyle(document.body)
      .getPropertyValue("--text-accent")
      .trim();

    // ------ all the helper functions used -------
    const handlePath = (path: string, isUnsaved: boolean) => {
      let successivePath = "";
      for (let fragment of path.split("/")) {
        if (!fragment.endsWith(".md")) {
          successivePath += `${fragment}/`;
        } else {
          successivePath += fragment;
        }
        if (!handledPathsArray.includes(successivePath)) {
          handledPathsArray.push(successivePath);
          updateStyles(successivePath, isUnsaved);
        }
      }
    };

    const updateStyles = (path: string, isUnsaved: boolean) => {
      // Add console log to check the path being used

      // Remove opposite style if exists
      const oppositeStyle = document.head.querySelector(
        `style[data-textflow-source-${isUnsaved ? "general" : "unsaved"}]`
      );
      if (oppositeStyle) oppositeStyle.remove();

      // Add or update correct style
      addStyle(path, isUnsaved ? "unsaved" : "general");
    };

    // Create and append style with the correct selector
    const addStyle = (path: string, isUnsaved: string) => {
      // Remove trailing slash for files (if it exists)
      const cleanPath = path.endsWith("/") ? path.slice(0, -1) : path;

      // Log both file and folder elements for this path
      function escapeSelector(str: string): string {
        // Escape special characters that have meaning in CSS selectors
        return (
          str
            .replace(/["'&,.*+?^${}()|[\]\\]/g, "\\$&")
            // Handle spaces
            .replace(/\s/g, "\\ ")
        );
      }

      const fileElement = document.querySelector(
        `div[data-path='${escapeSelector(cleanPath)}']`
      );
      const folderElement = document.querySelector(
        `div[data-path='${escapeSelector(cleanPath)}'] .nav-folder-title`
      );

      let style = document.createElement("style");
      style.setAttribute(`data-textflow-${isUnsaved}`, "true");

      // Update selector to target both files and folders
      const styleContent =
        isUnsaved === "unsaved"
          ? `
          div[data-path='${escapeSelector(
            cleanPath
          )}'] .nav-file-title-content::after,
          div[data-path='${escapeSelector(
            cleanPath
          )}'] .nav-folder-title-content::after {
              content: " ●" !important;
              color: ${accentColor} !important;
              font-size: 0.5em !important;
              vertical-align: middle !important
          }
      `
          : `
          div[data-path='${escapeSelector(
            cleanPath
          )}'] .nav-file-title-content::after,
          div[data-path='${escapeSelector(
            cleanPath
          )}'] .nav-folder-title-content::after {
              content: " ○" !important;
              color: var(--text-faint) !important;
              font-size: 0.5em !important;
              vertical-align: middle !important
          }
      `;

      style.textContent = styleContent;
      document.head.appendChild(style);
    };

    // -------- THE LOGIC -----------------
    // handle general paths
    Object.keys(this.settings.flows).forEach((flow) => {
      // get the file list
      let key = this.settings.flows[flow].flowReceipe.bookmarks
        ? "bookmarks"
        : "foldersTagsProps";

      for (path of this.settings.flows[flow].flowReceipe[key]) {
        // exclude folder titles
        if (!path.startsWith("#")) {
          if (!this.settings.flows[flow].unsavedRegionsArray.includes(path)) {
            isUnsaved = false;
            handlePath(path, isUnsaved);
          } else {
            unsavedPathsArray.push(path);
          }
        }
      }
    });

    // handle unsaved paths - null handled paths array
    // because we may need to override some general styles
    handledPathsArray = [];
    for (path of unsavedPathsArray) {
      isUnsaved = true;
      handlePath(path, isUnsaved);
    }
  };

  // ---------------- Functions: Listeners -------------------------

  // ---------------- Functions: Listeners: Global -----------------
  addListeners() {
    // ---------------- File modification -------------------------------
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        //console.log(`File modified: ${file.path}`);
      })
    );

    // ----------------- Auto-save on blur  -------------------------------
    this.registerDomEvent(window, "blur", async () => {
      if (!this.settings.autoSave) {
        return;
      }
      await this.saveAllLeavesAuto();
    });

    // ---------------- Auto-save on focus change -------------------------------
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", async () => {
        if (!this.settings.autoSave) {
          return;
        }
        await this.saveInactiveLeaves();
      })
    );
    // console.log("active-leaf-change: save finished");

    // -- LEAF CHANGE - Manage editors and warning css on flow, source and vanilla notes ------
    // setup functions take care of the details
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (this.isNavigatingFlow) {
          // console.log("skipping active-leaf setups because isNavigatingFlow");
          return;
        }
        this.manageActiveFlowObject();

        if (leaf?.view instanceof MarkdownView) {
          const view = leaf.view;
          const activeLeafPath = leaf.view.file?.path;
          if (activeLeafPath) {
            // Check if this is a source file and we're navigating
            const isSourceFile = Object.values(this.settings.flows).some(
              (flow) => flow.flowMap[activeLeafPath]
            );
            if (isSourceFile && this.isNavigatingFlow) {
              console.log("Preventing source file setup during navigation");
              return;
            }
            // if active leaf is flow, set it up
            const isFlow = this.isFlowFile(activeLeafPath);
            if (isFlow) {
              this.setupFlowView(isFlow, leaf.view);
              return;
            }
            // if active leaf is source, set it up
            for (let flow in this.settings.flows) {
              if (this.settings.flows[flow].flowMap[activeLeafPath]) {
                // console.log("active leaf change: is source");
                this.setupSourceNote(view);
                return;
              } else {
                //console.log("active leaf change: is vanilla");
                this.setupVanillaNote(view);
              }
            }
          }
        }
      })
    );

    // -- FILE OPEN - Manage editors and warning css on -------------
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        // console.log("file-open triggered");
        if (this.isNavigatingFlow) {
          //    console.log("skipping file-open setup because isNavigatingFlow");
          return;
        }
        this.manageActiveFlowObject();

        // In case the newly opened file has been loaded into
        // the active leaf, which doesn't trigger active-leaf-change
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) {
          return;
        }
        const activeLeafPath = activeView.file?.path;
        if (activeLeafPath) {
          // if active leaf is flow, set it up
          const isFlow = this.isFlowFile(activeLeafPath);
          if (isFlow) {
            this.setupFlowView(isFlow, activeView);
            return;
          }
          // if active leaf is source, set it up
          for (let flow in this.settings.flows) {
            if (this.settings.flows[flow].flowMap[activeLeafPath]) {
              this.setupSourceNote(activeView);
            }
          }
        } else {
          this.setupVanillaNote(activeView);
        }
      })
    );

    // catch it, when only an empty leaf remains
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        if (this.app.workspace.getLeavesOfType("markdown").length === 0) {
          // We're definitely in the "empty leaf" state
          this.manageActiveFlowObject();
        }
      })
    );
    // Add this to track the most recently active flow leaf
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf?.view instanceof MarkdownView) {
          const activeLeafPath = leaf.view.file?.path;
          if (activeLeafPath && this.isFlowFile(activeLeafPath)) {
            this.mostRecentActiveFlowLeaf = leaf;
          }
        }
      })
    );
  }

  // ---------------- Functions: Listeners: Individual ----------

  // leaf.view as MarkdownView
  listenerBasket: { [key: string]: ListenerBasketItem } = {};

  private addCursorListener = (view: MarkdownView | null) => {
    // Off ramps
    if (!view) {
      return;
    }

    const editor = view?.editor as ObsidianEditor | null;
    if (!editor) {
      return;
    }
    const cmEditor = editor.cm;
    if (!cmEditor) {
      return;
    }
    const activeLeafPath = view.file?.path;
    const leafID = (view.leaf as any).id;

    if (activeLeafPath && this.listenerBasket[leafID]) {
      return;
    }

    // ---------- actual listener stuff
    if (activeLeafPath !== undefined) {
      const isItFlow = this.isFlowFile(activeLeafPath);

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
                          leafID,
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
                  delete plugin.listenerBasket[leafID];
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

          this.listenerBasket[leafID] = {
            plugin: navigationListener,
            extension: extension,
          };

          cmEditor.dispatch({
            effects: extension,
          });
        } catch (error) {
          //  console.error("Error attaching navigation listener:", error);
          if (activeLeafPath) {
            delete this.listenerBasket[leafID];
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
        this.removeCursorListener(view);
      }
    }
  };

  // ---------------------------------------------------------
  removeCursorListener = (view: MarkdownView) => {
    const leafID = (view.leaf as any).id;
    if (leafID !== undefined && this.listenerBasket[leafID]) {
      const editor = view.editor as ObsidianEditor;
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
  private addTextChangeListener = (view: MarkdownView | null) => {
    // off ramps
    if (!view) return;

    const editor = view?.editor as ObsidianEditor | null;
    if (!editor) return;

    const cmEditor = editor.cm;
    if (!cmEditor) return;

    const activeLeafPath = view.file?.path;
    const leafID: number = (view.leaf as any).id; // Add this line

    if (leafID && this.listenerBasket[`${leafID}-changes`]) {
      return;
    }
    if (activeLeafPath !== undefined) {
      const isItFlow = this.isFlowFile(activeLeafPath);
      // actual listener

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

                  // return if no actual text change has taken place
                  if (changes.empty) return;

                  if (debounceTimeout) {
                    clearTimeout(debounceTimeout);
                  }

                  debounceTimeout = setTimeout(() => {
                    try {
                      // If leaf region is a file
                      if (
                        shSettings.flows[isItFlow].activeRegions[leafID] &&
                        shSettings.flows[isItFlow].activeRegions[leafID]
                          .type === "file"
                      ) {
                        const activePath =
                          shSettings.flows[isItFlow].activeRegions[leafID].path;

                        // if the active region isn't registered as modified
                        if (
                          activePath &&
                          !shSettings.flows[
                            isItFlow
                          ].unsavedRegionsArray.includes(activePath)
                        ) {
                          // Add to unsaved array
                          shSettings.flows[isItFlow].unsavedRegionsArray.push(
                            activePath
                          );
                          plugin.saveSettings();
                          if (shSettings.explorerDeco) {
                            plugin.decorateSourceFiles();
                          }

                          // Check other flows that might need rebuilding
                          Object.keys(shSettings.flows).forEach((otherFlow) => {
                            if (
                              otherFlow !== isItFlow && // Different flow
                              !shSettings.flows[otherFlow].flaggedForRebuild && // Not already flagged
                              shSettings.flows[otherFlow].flowMap[activePath] // Contains this file
                            ) {
                              shSettings.flows[otherFlow].flaggedForRebuild =
                                true;
                              // Optionally notify user
                              new Notice(
                                `Flow "${otherFlow}" marked for rebuild due to changes in shared file`
                              );
                            }
                          });
                        }
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
                  delete plugin.listenerBasket[`${leafID}-changes`];
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

          this.listenerBasket[`${leafID}-changes`] = {
            plugin: changeListener,
            extension: extension,
          };

          cmEditor.dispatch({
            effects: extension,
          });
        } catch (error) {
          //  console.error("Error attaching change listener:", error);
          if (activeLeafPath) {
            delete this.listenerBasket[`${leafID}-changes`];
          }
          new Notice(
            "TextFlow Plugin: Error setting up change tracking.\n" +
              "Please report this issue on github.",
            10000
          );
        }
      } else {
        this.removeTextChangeListener(view);
      }

      Object.keys(this.settings.flows).forEach((flow) => {
        if (
          isItFlow &&
          flow != isItFlow &&
          !this.settings.flows[flow].flaggedForRebuild
        ) {
          for (let unsavedPath of this.settings.flows[isItFlow]
            .unsavedRegionsArray) {
            if (this.settings.flows[flow].flowMap.usavedPath) {
              this.settings.flows[flow].flaggedForRebuild = true;
            }
          }
        }
      });
    }
  };

  //---------------
  removeTextChangeListener = (view: MarkdownView) => {
    const leafID = (view.leaf as any).id;
    if (leafID !== undefined && this.listenerBasket[`${leafID}-changes`]) {
      const editor = view.editor as ObsidianEditor;
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

  // Instead of just checking for preventDefault(), let's verify we're dealing with a file explorer click
  private isFileExplorerClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;

    // Check if it's the inner content element
    if (!target.classList.contains("nav-file-title-content")) return false;

    // Check parent (file title)
    const fileTitle = target.parentElement;
    if (!fileTitle?.classList.contains("nav-file-title")) return false;

    // Check grandparent (file item)
    const fileItem = fileTitle.parentElement;
    if (!fileItem?.classList.contains("nav-file")) return false;

    return true;
  };
  // ---------------------------------------------------------
  private boundFileExplorerClick: (event: MouseEvent) => void;
  // ---------- This listener is removed in ONUNLOAD ---------------------
  // it checks, if left-clicked files are flows or constituents of open flows and handles the behaviour
  fileExplorerOpenClickListener() {
    this.boundFileExplorerClick = async (event: MouseEvent) => {
      if (!this.isFileExplorerClick(event)) {
        return;
      }

      // CAPTURE ACTIVE VIEW IMMEDIATELY - before any other operations
      const activeViewAtClickTime =
        this.app.workspace.getActiveViewOfType(MarkdownView);

      const allLeaves = this.app.workspace.getLeavesOfType("markdown");
      allLeaves.forEach((leaf, index) => {
        const view = leaf.view as MarkdownView;
      });

      const target = event.target as HTMLElement;
      const fileItem = target.closest(".nav-file-title");
      if (!fileItem) {
        new Error("No file item found");
        return;
      }

      const clickedFilePath = fileItem.getAttribute("data-path");
      if (!clickedFilePath) {
        return;
      }

      const file = this.app.vault.getAbstractFileByPath(clickedFilePath);
      if (!(file instanceof TFile)) {
        return;
      }

      const activeFlowObjectSnapshot = this.settings.activeFlowObject;
      // Prevent Obsidian's default click action immediately.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      let clickHandled = false;

      const leaves = this.app.workspace.getLeavesOfType("markdown");
      const noteIsOpen = leaves.find(
        (leaf) =>
          leaf.view instanceof MarkdownView &&
          (leaf.view as MarkdownView).file?.path === clickedFilePath
      );

      const isFlowName = this.isFlowFile(clickedFilePath);

      if (isFlowName) {
        clickHandled = true;
        this.isNavigatingFlow = true;
        /* console.log(
          `TextFlow: Clicked file ${clickedFilePath} is a flow. Activating.`
        );*/
        try {
          if (noteIsOpen && noteIsOpen.view instanceof MarkdownView) {
            await this.activateFlow(isFlowName, noteIsOpen.view);
          } else {
            await this.activateFlow(isFlowName);
          }
        } finally {
          setTimeout(() => {
            this.isNavigatingFlow = false;
            /*console.log(
              "TextFlow: isNavigatingFlow reset after flow activation."
            );*/
          }, 100); // Delay to allow UI to settle
        }
      } else {
        // Not a flow file, check if it's a source file of an active flow
        let parentFlowName: string | null = null;
        let flowSettings: Types.FlowDef | null = null;
        let isOfActiveFlow: boolean = false;

        console.log("checking if part of active flow");
        for (const flowName in activeFlowObjectSnapshot) {
          if (Object.keys(activeFlowObjectSnapshot[flowName]).length != 0) {
            console.log(
              "active leaf number: ",
              Object.keys(activeFlowObjectSnapshot[flowName]).length
            );
            if (this.settings.flows[flowName].flowMap[clickedFilePath]) {
              parentFlowName = flowName;
              flowSettings = this.settings.flows[flowName];
              isOfActiveFlow = true;
              console.log("is of active flow? ", isOfActiveFlow);
            }
          }
        }

        if (parentFlowName && flowSettings && isOfActiveFlow) {
          clickHandled = true;
          this.isNavigatingFlow = true; // Set before any async operations
          /*console.log(
            `TextFlow: Clicked source file ${clickedFilePath} belongs to flow ${parentFlowName}.`
          );*/

          try {
            const flowFilePath = flowSettings.flowFilePath;

            let flowLeaf;

            // First priority: Check if the most recently active flow leaf matches our target
            if (
              this.mostRecentActiveFlowLeaf?.view instanceof MarkdownView &&
              (this.mostRecentActiveFlowLeaf.view as MarkdownView).file
                ?.path === flowFilePath
            ) {
              flowLeaf = this.mostRecentActiveFlowLeaf;
            } else {
              // Fallback: Find any existing leaf with our flow
              flowLeaf = leaves.find(
                (leaf) =>
                  leaf.view instanceof MarkdownView &&
                  leaf.view.file?.path === flowFilePath
              );
            }

            if (!flowLeaf || !(flowLeaf.view instanceof MarkdownView)) {
              /*console.log(
                `Flow ${parentFlowName} (${flowFilePath}) is not open or leaf is invalid. Activating it.`
              );*/
              await this.activateFlow(parentFlowName);
              flowLeaf = this.app.workspace
                .getLeavesOfType("markdown")
                .find(
                  (leaf) =>
                    leaf.view instanceof MarkdownView &&
                    (leaf.view as MarkdownView).file?.path === flowFilePath
                );

              if (!flowLeaf || !(flowLeaf.view instanceof MarkdownView)) {
                /*console.error(
                  `TextFlow: Failed to find or create a valid leaf for flow ${parentFlowName} after activation.`
                );*/
                return; // Exit: click handled by failing.
              }
            }

            /*console.log(
              `TextFlow: Setting active leaf to flow ${parentFlowName} in leaf ${
                (flowLeaf as any).id
              }`
            );*/
            this.app.workspace.setActiveLeaf(flowLeaf, { focus: true });

            // Crucial delay: Allow editor to fully load and focus after setActiveLeaf
            await new Promise((resolve) => setTimeout(resolve, 150)); // 150ms, adjust if needed

            const flowView = flowLeaf.view as MarkdownView;
            const editor = flowView.editor as ObsidianEditor;
            const cmEditor = editor.cm;

            if (!cmEditor) {
              /*console.error(
                "TextFlow: CodeMirror editor not found in the flow view after activation and delay."
              );*/
              return; // Exit: click handled.
            }

            // Defensive check: Ensure the active leaf is still our target flow leaf
            const currentActiveLeaf =
              this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf;
            if (currentActiveLeaf !== flowLeaf) {
              console.warn(
                "TextFlow: Active leaf changed unexpectedly. Forcing it back to flow leaf before scrolling."
              );
              this.app.workspace.setActiveLeaf(flowLeaf, { focus: true });
              await new Promise((resolve) => setTimeout(resolve, 50)); // Shorter delay for re-focus
            }

            const flowDocumentText = cmEditor.state.doc.toString();
            const regionFlowOrder =
              flowSettings.flowMap[clickedFilePath].flowOrder;
            const startPosInFlow = this.findStartOfRegion(
              flowSettings,
              regionFlowOrder,
              flowDocumentText
            );

            if (startPosInFlow !== undefined && startPosInFlow >= 0) {
              const line = cmEditor.state.doc.lineAt(
                Math.max(0, startPosInFlow)
              ); // Ensure position is not negative
              const targetPos = line.from; // Scroll to the beginning of the line
              cmEditor.dispatch({
                selection: { anchor: targetPos, head: targetPos },
                effects: EditorView.scrollIntoView(targetPos, {
                  y: "center", // Center in viewport
                  yMargin: 10, // Small margin
                }),
                userEvent: "select.pointer",
              });
              cmEditor.focus(); // Explicitly focus the editor
            }
          } catch (err) {
            console.error(
              `TextFlow: Error during source file handling for ${clickedFilePath} in flow ${parentFlowName}:`,
              err
            );
          } finally {
            setTimeout(() => {
              this.isNavigatingFlow = false;
            }, 300); // Increased delay
          }
        }
      }

      // Fallback for files not handled as flows or source files by our logic
      if (!clickHandled) {
        this.isNavigatingFlow = false; // Ensure this is false for regular note opening
        if (noteIsOpen) {
          this.app.workspace.setActiveLeaf(noteIsOpen, { focus: true });
        } else {
          // We prevented default, so we must explicitly open it if it's a regular note.
          // Determine if we should open in a new split or existing leaf.
          const openInNewSplit =
            this.app.workspace.getLeavesOfType("markdown").length > 0 &&
            (event.metaKey || event.ctrlKey);
          this.app.workspace.openLinkText(clickedFilePath, "", openInNewSplit);
        }
      }
      this.manageActiveFlowObject();
    };
  }

  // ---------------- Functions: Flow management -------------------------
  // The big bundle that centralises flow management
  private setupFlowView(flowName: string, view: MarkdownView) {
    const leafID = (view.leaf as any).id;
    const editor = view.editor as any;
    this.addProtectDuringSaveExtension(editor);
    this.addIdDividerProtection(view, flowName);
    this.addCursorListener(view);
    this.addTextChangeListener(view);
    if (view.containerEl.hasClass("source-read-only")) {
      view.containerEl.removeClass("source-read-only");
    }
    setTimeout(() => this.manageActiveFlowObject(), 500);
  }

  // ---- Identity check
  isFlowFile = (activeLeafPath: string) => {
    const flowName = activeLeafPath.match(/([^/]+)(?=\.md$)/)?.[0]; // gets the flow name out of the path
    if (flowName && this.settings.flows[flowName]) {
      return flowName;
    } else {
      return null;
    }
  };

  // ---- Make sure flows are set up when they are activated
  async activateFlow(flowName: string, existingView?: MarkdownView) {
    const flow = this.settings.flows[flowName];
    if (!flow) {
      new Notice(`No flow with name ${flowName} found.`, 10000);
      return;
    }

    if (existingView) {
      // Flow is already open, just set it up
      this.setupFlowView(flowName, existingView);
      this.app.workspace.setActiveLeaf(existingView.leaf, {
        focus: true,
      }); // Added focus: true
    } else {
      // Need to open new leaf
      const flowFile = this.app.vault.getAbstractFileByPath(flow.flowFilePath);

      if (flowFile instanceof TFile) {
        const leaf = this.app.workspace.getLeaf("split"); // Prefer opening in a new split if creating
        await leaf.openFile(flowFile);
        if (leaf.view instanceof MarkdownView) {
          this.setupFlowView(flowName, leaf.view);
          this.app.workspace.setActiveLeaf(leaf, { focus: true }); // Make sure to activate the leaf with focus
        } else {
          console.error(
            "TextFlow: View is not MarkdownView after opening flow file"
          );
        }
      } else {
        new Notice(
          `TextFlow: Flow file not found: ${flow.flowFilePath}\nTry clicking the 'Move' button for the TextFlow_SystemFolder location.`,
          10000
        );
      }
    }
  }

  // ---- Set up all open flows with their listeners -----------
  initialSetup = async () => {
    const allLeaves = this.app.workspace.getLeavesOfType("markdown");
    // Iterate over all the leavesfileExplorerClickListener
    for (const leaf of allLeaves) {
      if (leaf.view instanceof MarkdownView) {
        const leafPath = leaf.view.file?.path;
        let flowName = null;
        if (leafPath !== undefined) {
          flowName = this.isFlowFile(leafPath);
          if (flowName) {
            this.setupFlowView(flowName, leaf.view as MarkdownView);
          }
        }
        await this.saveSettings();
      }
    }
  };

  // ------------- Used by flowSwitcherModal -----------
  manageActiveFlowObject = async () => {
    // reset it all
    Object.keys(this.settings.activeFlowObject).forEach((flow) => {
      this.settings.activeFlowObject[flow] = {};
      this.saveSettings();
    });

    // the repopulate
    const leafIDArray: string[] = [];
    const allLeaves = this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView) {
        const leafID = (leaf as any).id;
        const leafPath = leaf.view.file?.path;
        if (leafPath) {
          // check if it's a flow
          const flowName = this.isFlowFile(leafPath);
          if (flowName) {
            leafIDArray.push(leafID);
            // check if it has an object already
            if (this.settings.activeFlowObject[flowName]) {
              this.settings.activeFlowObject[flowName][leafID] = true;
              this.saveSettings();
            } else {
              this.settings.activeFlowObject[flowName] = {};
              this.settings.activeFlowObject[flowName][leafID] = true;
              this.saveSettings();
            }
            if (this.settings.flows[flowName].activeRegions) {
              if (!this.settings.flows[flowName].activeRegions[leafID]) {
                this.addRegionTracking(flowName, leafID);
              }
            }
          }
        }
      }
    });
    this.removeRegionTracking(leafIDArray);
  };

  // ----- add region tracking for new leafs
  addRegionTracking = (flowName: string, leafID: string) => {
    console.log("no active region ", leafID, " for ", flowName);
    const [path, targetObject] =
      Object.entries(this.settings.flows[flowName].flowMap).find(
        ([_, obj]) => obj.flowOrder === 1
      ) || [];
    console.log("getting ", path, targetObject);
    if (targetObject) {
      console.log("target acquired");
      const { type, UID, flowOrder, lengthPlusDividers } = targetObject;
      this.settings.flows[flowName].activeRegions[leafID] = {
        currentCursorPos: 0,
        type: targetObject.type,
        path: path,
        UID: targetObject.UID,
        flowOrder: 1,
        startInFlow: 0,
        endInFlow: targetObject.lengthPlusDividers,
      };
      console.log("saving settings");
      this.saveSettings();
    }
  };

  // ---- remove stale entries
  removeRegionTracking = (leafIDArray: string[]) => {
    Object.keys(this.settings.flows).forEach((flow) => {
      Object.keys(this.settings.flows[flow].activeRegions).forEach((leafID) => {
        if (!leafIDArray.includes(leafID)) {
          console.log("removing tracking for ", leafID);
          delete this.settings.flows[flow].activeRegions[leafID];
        }
        this.saveSettings();
      });
    });
  };

  // if a flow is replaced by a non-flow
  closeFlow = (view: MarkdownView) => {
    this.removeCursorListener(view);
    this.removeTextChangeListener(view);
    this.removeIdDividerProtection(view.editor as any);
    this.manageActiveFlowObject();
    this.saveSettings();
  };

  // --- Set up source files
  setupSourceNote = (view: MarkdownView) => {
    if (this.isNavigatingFlow) {
      //console.log("Skipping source note setup during navigation");
      return;
    }
    if (!view.containerEl.hasClass("source-read-only")) {
      view.containerEl.addClass("source-read-only");
    }
    //console.log("setupSourceNote: calling closeFlow");
    this.closeFlow(view);
  };

  // --- set up vanilla note
  setupVanillaNote = (view: MarkdownView) => {
    if (view.containerEl.hasClass("source-read-only")) {
      view.containerEl.removeClass("source-read-only");
    }
    //console.log("setupVanillaNote: calling close flow");
    this.closeFlow(view);
  };

  // ---- Functions: Data safety ----------------------------

  // ---- Functions: Data safety: Read-only for UIDs and dividers
  private addIdDividerProtection = (view: MarkdownView, flowName: string) => {
    const flow = this.settings.flows[flowName];
    if (!flow) return;

    const editor = view.editor as any;
    if (!editor.cm) return;

    if (!this.hasIdDividerProtection(editor)) {
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

  // ----------------------------------------------------------
  private hasIdDividerProtection = (editor: any) => {
    if (!editor.cm) return false;
    const hasField =
      editor.cm.state.field(this.readOnlyRanges, false) !== undefined;
    return hasField;
  };

  // -----------------------------------------------------------
  private removeIdDividerProtection = (editor: any) => {
    if (!editor.cm) return;

    if (this.hasIdDividerProtection(editor)) {
      editor.cm.dispatch({
        effects: StateEffect.reconfigure.of([]),
      });
    }
  };

  /// --- Functions: Data safety: Protect editor during saving
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
        } else {
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
  // ---- Functions: Data safety: Save changes to source files
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
        const flowName = this.isFlowFile(filePath);
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
          this.toggleProtectionDuringSave(editor.cm, true);
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
        const flowId = this.isFlowFile(filePath);
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
          this.toggleProtectionDuringSave(editor.cm, true);
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

  saveAllLeavesManual = async () => {
    const allLeaves = this.app.workspace.getLeavesOfType("markdown");
    const flowLeaves: Record<string, MarkdownView> = {};

    // Populate flowLeaves
    for (const leaf of allLeaves) {
      const view = leaf.view as MarkdownView;
      const filePath = view.file?.path;
      if (filePath) {
        const flowId = this.isFlowFile(filePath);
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

  getTimestamp = (): string => {
    const date = new Date();
    const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${weekday}, ${year}.${month}.${day}, ${hours}:${minutes}`;
  };

  //---- The actual save function -------------
  private saveBackToSource = async (flow: string, text: string) => {
    // console.log("saveBackToSource responding");
    if (this.settings.flows[flow].unsavedRegionsArray) {
      /*console.log(
        "saveBackToSource iterating trough modifiedRegions: ",
        this.settings.flows[flow].unsavedRegionsArray
      );*/
      const map = this.settings.flows[flow].flowMap;
      const remainingPaths: string[] = [];
      for (const path of this.settings.flows[flow].unsavedRegionsArray) {
        const sourceFile = await this.app.vault.getFileByPath(path);
        if (!sourceFile) {
          console.error(`File not found at path: ${path}`);
          return;
        }
        /* console.log(
          "saveBackToSource calling findStartOfRegion for path: ",
          path
        );*/
        const startOfRegion = await this.findStartOfRegion(
          this.settings.flows[flow],
          map[path].flowOrder,
          text
        );
        // console.log("saveBackToSource found startOfRegion: ", startOfRegion);

        // console.log("saveBackToSource searching for endOfRegion: ", path);
        const endOfRegion = text.indexOf(map[path].UID) - 1; // subtract 1 for the \r before the UID
        // console.log("endOfRegion found: ", endOfRegion);
        const flowFile = await this.app.vault.getFileByPath(
          this.settings.flows[flow].flowFilePath
        );

        if (!flowFile) {
          new Notice(`File not found at path: ${path}`);
          return;
        } else if (sourceFile instanceof TFile && startOfRegion) {
          const flowContent = await this.app.vault.read(flowFile);
          {
            const regionSlice = flowContent.slice(
              startOfRegion + 1,
              endOfRegion
            );
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
      this.settings.flows[flow].unsavedRegionsArray = remainingPaths;
      this.settings.flows[flow].timestamp = this.getTimestamp();
      this.manageCursorPos(flow);
      if (this.settings.explorerDeco) {
        this.decorateSourceFiles();
      }
    }
  };

  // -------------- Functions: Manage persistent cursor position
  manageCursorPos = (flow: string) => {
    Object.keys(this.settings.flows[flow].activeRegions).forEach((leafID) => {
      const currentLeaf = this.settings.flows[flow].activeRegions[leafID];
      let regionPath = "";
      if (currentLeaf.path) {
        regionPath = currentLeaf.path;
      }
      const currentCursor = currentLeaf.currentCursorPos;

      // Initialize if doesn't exist
      if (!this.settings.flows[flow].persistentCursors[leafID]) {
        this.settings.flows[flow].persistentCursors[leafID] = [
          [regionPath, [currentCursor]],
        ];
        return;
      }

      // Check if there's an entry for the leaf
      const existingLeafIndex = this.settings.flows[flow].persistentCursors[
        leafID
      ].findIndex(([path, _]) => path === regionPath);

      if (existingLeafIndex !== -1) {
        // Region exists, add cursor to its array
        const cursors =
          this.settings.flows[flow].persistentCursors[leafID][
            existingLeafIndex
          ][1];
        cursors.unshift(currentCursor);
        // Keep only last 3 cursor positions
        if (cursors.length > 3) {
          cursors.pop(); // Remove oldest
        }
      } else {
        // New region, add it to the array
        this.settings.flows[flow].persistentCursors[leafID].unshift([
          regionPath,
          [currentCursor],
        ]);
        // Keep only last 3 regions
        if (this.settings.flows[flow].persistentCursors[leafID].length > 5) {
          this.settings.flows[flow].persistentCursors[leafID].pop(); // Remove oldest
        }
      }
    });
  };
  // --------------- Functions: Flow management: Regions -----------------------------------------
  private checkActiveRegionCache = async (
    flow: Types.FlowDef,
    leafID: number,
    cursorOffset: number
  ) => {
    /* console.log("=== checkActiveRegionCache called ===");
    console.log("Cursor offset:", cursorOffset);*/

    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      console.log("No  found");
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

    // if this is the initial
    if (!flow.activeRegions[leafID]) {
      let activeRegionObject = this.findActiveRegion(flow, cursorOffset, text);

      if (activeRegionObject) {
        flow.activeRegions[leafID] = activeRegionObject;
      }
      await this.saveSettings();
      return;
    }

    // if there are values, use those
    else if (
      cursorOffset > flow.activeRegions[leafID].startInFlow &&
      cursorOffset < flow.activeRegions[leafID].endInFlow
    ) {
      //console.log("Cursor still in same region, updating position");
      flow.activeRegions[leafID].currentCursorPos = cursorOffset;
      await this.saveSettings();
      return;
    } else {
      // console.log("Cursor in new region, finding active region");
      flow.activeRegions[leafID].currentCursorPos = cursorOffset;
      let activeRegion = await this.findActiveRegion(flow, cursorOffset, text);
      if (activeRegion) {
        // console.log("New active region found:", activeRegion.path);
        flow.activeRegions[leafID] = activeRegion;
      } else {
        console.log("No new active region found");
      }
      // console.log("checkActiveRegionCache: ", flow.activeRegions);
      await this.saveSettings();
      return;
    }
  };

  // ------------- region tracking utilities ----------------------
  private findActiveRegion = (
    flow: Types.FlowDef,
    cursorOffset: number,
    text: string
  ) => {
    // regEx for proper divider
    const markerRegex = /[\u200B\u200C\u200D]{26,}<hr>/;

    // regEx for timestamp divider for debugging
    //    const markerRegex = /[0-9]{5,}<hr>/;

    const searchStart = text.slice(cursorOffset);

    const matches = searchStart.match(markerRegex);

    if (matches) {
      const UIDLength = matches[0].length - 4;
      const UID = matches[0].slice(0, UIDLength);

      const foundRegion = Object.entries(flow.flowMap).find(
        ([_, foundRegionMap]) => foundRegionMap.UID === UID
      );

      if (foundRegion) {
        const [foundRegionPath, foundRegionMap] = foundRegion;

        let newStartInFlow;
        if (foundRegionMap.flowOrder > 1) {
          newStartInFlow =
            this.findStartOfRegion(flow, foundRegionMap.flowOrder, text) || 0;
        } else {
          newStartInFlow = 0;
        }
        const endInFlow = text.indexOf(foundRegionMap.UID) + matches[0].length;

        const activeRegionObject: Types.ActiveRegion = {
          currentCursorPos: cursorOffset,
          type: foundRegionMap.type,
          path: foundRegionPath,
          UID: UID,
          flowOrder: foundRegionMap.flowOrder,
          startInFlow: newStartInFlow,
          endInFlow: endInFlow,
        };
        return activeRegionObject;
      } else {
        console.log("No matching region found for UID");
      }
    } else {
      console.log("No marker found in text after cursor");
    }
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
        previousRegionFlowMapEntry.flowOrder === flowOrder - 1
    );

    if (previousRegion) {
      const [previousRegionPath, previousRegionMap] = previousRegion;

      if (flowOrder - 1 !== 0) {
        const invisibleUID = previousRegionMap.UID;
        const index = text.indexOf(invisibleUID);
        const startPos = index + (invisibleUID + "<hr>").length + 1;
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

    // -------------------------------------------------------------------
    // ------------------- ONLOAD: add listeners for cursor and clicks
    // Wait for the file explorer to be available in the DOM
    this.app.workspace.onLayoutReady(async () => {
      // ---------- Look for TextFlow_SystemFolder
      this.ensureSystemFolder();
      if (this.settings.explorerDeco) {
        this.decorateSourceFiles();
      }

      // ----- ONLOAD: set up UI -------------------------

      // ------------------- Flow switcher modal ---------------------
      // Add status bar item
      const statusBarItem = this.addStatusBarItem();
      statusBarItem.addClass("mod-clickable");
      const iconContainer = statusBarItem.createSpan();
      setIcon(iconContainer, "scroll-text");

      statusBarItem.addEventListener("click", () => {
        new Modals.FlowSwitcherModal(this.app, this).open();
      });
      // Add ribbon icon (optional)
      this.addRibbonIcon("sheets-in-box", "Open Flow", (evt: MouseEvent) => {
        new Modals.FlowSwitcherModal(this.app, this).open();
      });

      await this.initialSetup(); //

      // Handle temp folder visibility
      if (this.settings.systemFolderHidden) {
        this.discernAndSetSystemFolderState(
          true,
          this.settings.systemFolderPlace
        );
      }
      // -------------------------------
      this.fileExplorerOpenClickListener();
      const fileExplorer = document.querySelector(".nav-files-container");
      if (fileExplorer && this.boundFileExplorerClick) {
        fileExplorer.addEventListener("click", this.boundFileExplorerClick);

        // Add a small delay before trying to hide the folder
        if (this.settings.systemFolderHidden) {
          setTimeout(() => {
            this.discernAndSetSystemFolderState(
              true,
              this.settings.systemFolderPlace
            );
          }, 100);
        }
      }
    });

    // ----------- ONLOAD: add global listeners ------------------------------------

    this.addListeners();

    this.registerCommands();

    // ----------- ONLOAD: register settingsTab ------------------------------------
    this.addSettingTab(new TextFlowSettingsTab(this.app, this));
  }

  // -------------------------------------------------------
  // ------------------ ONUNLOAD---------------------------
  // -------------------------------------------------------
  onunload() {
    // this.persistCursorPosition();
    this.saveSettings();
    // ---------------- Store data for all active flows ----

    // Remove read-only extensions from all markdown views
    const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of markdownLeaves) {
      if (leaf.view instanceof MarkdownView) {
        const editor = leaf.view.editor as any;
        this.removeIdDividerProtection(editor);
      }
    }

    // ------------ ONUNLOAD: REMOVE cursor listeners -----------
    Object.keys(this.listenerBasket).forEach((key) => {
      const leafID = key.replace("-changes", "");

      const leaves = this.app.workspace.getLeavesOfType("markdown");
      const targetLeaf = leaves.find((leaf) => (leaf as any).id === leafID);

      for (const leaf of leaves) {
        // Check if the leaf's view is a MarkdownView and if its file path matches
        if (targetLeaf?.view instanceof MarkdownView) {
          this.removeCursorListener(targetLeaf.view);
          this.removeTextChangeListener(targetLeaf.view);
        }
      }
    });

    //------------ ONUNLOAD: REMOVE explorer click listener -----------
    const fileExplorer = document.querySelector(".nav-files-container");
    if (fileExplorer && this.boundFileExplorerClick) {
      fileExplorer.removeEventListener("click", this.boundFileExplorerClick);
    }
  }
}
