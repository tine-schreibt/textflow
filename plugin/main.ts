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
  TAbstractFile,
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
import { MenuBar } from "./src/menuBar";
import { FlowService } from "./src/flowService";
import { TEXTFLOW_SYSTEMFOLDER } from "./src/settingsTab";
import { dirname, basename } from "path";

// so the menu bar can be kept within the view
declare module "obsidian" {
  interface MarkdownView {
    menuBar?: MenuBar;
  }
}

// needed for scoll into view stuff
interface ObsidianEditor extends Editor {
  cm?: EditorView;
}

// used by the cursor listener
interface CodeMirrorCursor {
  line: number;
  ch: number;
}

// keeps all the listeners in one place
interface ListenerBasketItem {
  plugin: ViewPlugin<any>;
  extension: StateEffect<any>;
}

// The plugin class itself
export default class TextFlowPlugin extends Plugin {
  settings: TextFlowSettings;
  flowService: FlowService;
  settingsTab: TextFlowSettingsTab;
  isRebuilding: boolean = false; // to prevent a doom spiral of the modify listener
  isLoading: boolean = true; // to prevent the create listener from spamming notices onload

  // ---------------- Global objects and variables -------------------------

  // ---- flag to prevent the leaf-change-listener from interfering with scrolling to source file in flow
  private isNavigatingFlow: boolean = false;

  // ---- flag to keep textFlow from spiraling when its syncs trigger vault.modify()
  private isSyncing: boolean = false;

  // -- tracking read-only ranges (to protect region IDs) --------------------------
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

  protectDuringSaveExtension = StateField.define<boolean>({
    create: () => false,
    update: (value, tr) => {
      for (let effect of tr.effects) {
        if (effect.is(this.toggleProtectionEffect)) {
          return effect.value;
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

  // for timing of flowSwitcherModal display() calls, we need to access them from setupFlowView()
  private modalUpdateCallback: (() => void) | null = null;

  registerModalUpdateCallback(callback: () => void) {
    this.modalUpdateCallback = callback;
  }

  unregisterModalUpdateCallback() {
    this.modalUpdateCallback = null;
  }

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
  //CHECKED
  async ensureSystemFolder() {
    const systemFolder = this.app.vault
      .getAllLoadedFiles()
      .find(
        (file) => file instanceof TFolder && file.name === TEXTFLOW_SYSTEMFOLDER
      );

    if (this.settings.firstLaunch) return;

    if (systemFolder) {
      // if there is a systemFolder
      if (
        // but expected path doesn't agree with actual place/path
        this.settings.systemFolderPath != systemFolder.path
      ) {
        // defer to reality and update settings
        if (!this.settings.systemFolderPath) return;
        const oldPath = this.settings.systemFolderPath;
        this.settings.systemFolderPath = systemFolder.path;

        if (this.settings.flows) {
          Object.keys(this.settings.flows).forEach((flowName) => {
            this.settings.flows[flowName].flowFilePath = normalizePath(
              `${this.settings.systemFolderPath}/${flowName}.md`
            );
          });
        }
        await this.saveSettings();
      }
    }
  }

  // ---------- debug UID because I'm too lazy to implement importing stuff from flowService to here
  debugMarker = (marker: string) => {
    console.log({
      fullMarker: marker,
      length: marker.length,
      chars: Array.from(marker).map((char) => ({
        char: char,
        code: char.charCodeAt(0).toString(16), // hex code
        name:
          char === "\u00A0"
            ? "NBSP"
            : char === "\u200B"
            ? "ZWSP"
            : char === "\u200C"
            ? "ZWNJ"
            : char === "\u200D"
            ? "ZWJ"
            : "unknown",
      })),
    });
  };

  // ---------------- Functions: Utilities: UI/UX -------------------------

  // cleanup for the menu bar
  // creation happens in setupFlowView, using menuBar.ts
  cleanupMenuBar(leaf: WorkspaceLeaf) {
    if (leaf.view instanceof MarkdownView && leaf.view.menuBar) {
      leaf.view.menuBar.detach();
      delete leaf.view.menuBar;
    }
  }

  registerCommands() {
    // Command for syncing
    this.addCommand({
      id: `sync-text-flow`,
      name: `Sync all modified regions.`,
      callback: async () => {
        // toggle
        await this.syncAllLeaves();
        await this.saveSettings();
      },
    });

    // Open the switcher modal
    this.addCommand({
      id: "open-flowswitcher",
      name: "Open flow switcher modal",
      callback: async () => {
        // toggle
        new Modals.FlowSwitcherModal(this.app, this).open();
      },
    });

    // turn off explorer navigation so multi-select works as expected
    this.addCommand({
      id: "toggle-explorer-listener",
      name: `Toggle explorer navigation`,
      callback: () => {
        this.settings.explorerListener
          ? (this.settings.explorerListener = false)
          : (this.settings.explorerListener = true);
        this.saveSettings();
      },
    });

    // hide explorer deco

    this.addCommand({
      id: "toggle-explorer-deco",
      name: `Toggle explorer decoration`,
      callback: () => {
        this.settings.showExplorerDeco
          ? (this.settings.showExplorerDeco = false)
          : (this.settings.showExplorerDeco = true);
        this.saveSettings();
      },
    });

    // hide menu bar
    this.addCommand({
      id: "toggle-menu-bar",
      name: `Toggle menu bar`,
      callback: () => {
        this.settings.showMenuBar
          ? (this.settings.showMenuBar = false)
          : (this.settings.showMenuBar = true);
        this.settings.maxMenuBar = true;
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;

        view.menuBar?.refresh(view.contentEl);
        this.saveSettings();
      },
    });

    // select active region
    this.addCommand({
      id: "select-active-region",
      name: "Select active region",
      callback: () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;

        const leafID = (view.leaf as any).id;
        const flowName = this.isFlowFile(leafID.view.path);
        if (!flowName) return;
        if (!this.settings.flows[flowName].activeRegions) return;
        if (!this.settings.flows[flowName].activeRegions[leafID]) return;
        if (!this.settings.flows[flowName].activeRegions[leafID].path) return;

        const activeRegion = normalizePath(
          this.settings.flows[flowName].activeRegions[leafID].path
        );
        if (!activeRegion) return;

        this.flowService.selectActiveRegion(
          flowName,
          activeRegion,
          view.editor.getValue(),
          view.editor
        );
      },
    });

    // restore cursor position
    this.addCommand({
      id: "restore-cursor",
      name: `Restore most recent cursor position`,
      callback: async () => {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView || !activeView.file) {
          return;
        }

        const activeLeafPath = activeView.file.path;
        if (!activeLeafPath) return;

        // if active leaf is flow, set it up
        const flowName = this.isFlowFile(activeLeafPath);
        if (!flowName) return;

        const editor = activeView.editor as ObsidianEditor;
        const leafID = (activeView.leaf as any).id;
        this.restoreCursorPos(flowName, activeView, leafID);
      },
    });
  }

  // ----- is called onload and sets the visibility of TextFlow_SystemFolder
  //CHECKED
  discernAndSetSystemFolderState = (
    systemFolderHidden?: boolean,
    systemFolderPath?: string
  ): void => {
    if (systemFolderPath) {
      systemFolderPath = normalizePath(systemFolderPath);
    }

    // Remove any existing style
    const existingStyle = document.head.querySelector(
      "style[data-textflow-temp]"
    );
    if (existingStyle) {
      existingStyle.remove();
    }

    // If we're not hiding (or don't have a place defined) just return after removing style
    if (!systemFolderHidden || systemFolderPath === undefined) {
      return;
    }

    // Create and append style with the correct selector
    const addStyle = () => {
      let hiddenStyle = document.createElement("style");
      hiddenStyle.setAttribute("data-textflow-temp", "true");

      hiddenStyle.textContent = `
            div[data-path='${systemFolderPath}'],
            div[data-path^='${systemFolderPath}'] {
                display: none !important;
            }
        `;
      document.head.appendChild(hiddenStyle);
    };

    // Try immediately and also with a small delay to ensure DOM is ready
    addStyle();
    setTimeout(addStyle, 500); // Add style again after 500ms
  };
  // ^CHECKED

  // ----- DECORATE SOURCE NOTES IN FILE EXPLORER -----------
  decorateSourceFiles = (): void => {
    let path = "";
    let handledPathsArray: string[] = [];
    const unsavedPathsArray: string[] = [];
    let isUnsaved = false;

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
        `style[data-textflow-${isUnsaved ? "general" : "unsaved"}]`
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
      const neutralSymbol = this.settings.explorerDecoStyle[0];
      const unsyncedSymbol = this.settings.explorerDecoStyle[1];
      const neutralStyle = this.settings.explorerDecoStyle[2];
      const unsyncedStyle = this.settings.explorerDecoStyle[3];
      const styleContent =
        isUnsaved === "unsaved"
          ? `
          div[data-path='${escapeSelector(
            cleanPath
          )}'] .nav-file-title-content::after,
          div[data-path='${escapeSelector(
            cleanPath
          )}'] .nav-folder-title-content::after {
              content: " ${unsyncedSymbol}" !important; 
              --nav-item-color: var(--color-accent) !important; 
              color: var(--color-accent) !important;
              opacity: ${
                unsyncedStyle.includes("high") ? "1" : "0.6"
              } !important;
              font-size: ${
                unsyncedStyle.includes("large") ? "1.2em" : "1em"
              } !important;
              font-family: monospace !important;  // prevents emojis
              vertical-align: middle !important;
          }
      `
          : `
          div[data-path='${escapeSelector(
            cleanPath
          )}'] .nav-file-title-content::after,
          div[data-path='${escapeSelector(
            cleanPath
          )}'] .nav-folder-title-content::after {
              content: " ${neutralSymbol}" !important; 
              --nav-item-color: ${
                neutralStyle.includes("high")
                  ? "var(--text-muted)"
                  : "var(--text-faint)"
              } !important;
              color: ${
                neutralStyle.includes("high")
                  ? "var(--text-muted)"
                  : "var(--text-faint)"
              } !important;
              opacity: 1;
              font-size: ${
                neutralStyle.includes("large") ? "1.2em" : "1em"
              } !important;
              font-family: monospace !important; 
              vertical-align: middle !important;
          }
      `;

      style.textContent = styleContent;
      document.head.appendChild(style);
    };

    // -------- THE LOGIC -----------------
    // handle general paths
    Object.keys(this.settings.activeFlowObject).forEach((flow) => {
      // get the file list
      let key = this.settings.flows[flow].flowRecipe.bookmarks
        ? "bookmarks"
        : "foldersTagsProps";

      for (path of this.settings.flows[flow].flowRecipe[key]) {
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

  // --------- So that toggling deco off doesn't require a reload ------
  undecorateSourceFiles = (): void => {
    let path = "";
    let handledPathsArray: string[] = [];
    const unsavedPathsArray: string[] = [];
    let isUnsaved = false;

    const accentColor = getComputedStyle(document.body)
      .getPropertyValue("--interactive-accent")
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
      const neutralSymbol = this.settings.explorerDecoStyle[0];
      const unsyncedSymbol = this.settings.explorerDecoStyle[1];
      const neutralStyle = this.settings.explorerDecoStyle[2];
      const unsyncedStyle = this.settings.explorerDecoStyle[3];
      const styleContent =
        isUnsaved === "unsaved"
          ? `
            div[data-path='${escapeSelector(
              cleanPath
            )}'] .nav-file-title-content::after,
            div[data-path='${escapeSelector(
              cleanPath
            )}'] .nav-folder-title-content::after {
                content: "" !important;  
                color: ${accentColor} !important;
                opacity: ${
                  unsyncedStyle.includes("high") ? "1" : "0.6"
                } !important;
                font-size: ${
                  unsyncedStyle.includes("large") ? "1.2em" : "1em"
                } !important;
                font-family: monospace !important;  // Add this to prevent emoji rendering
                vertical-align: middle !important;
            }
        `
          : `
            div[data-path='${escapeSelector(
              cleanPath
            )}'] .nav-file-title-content::after,
            div[data-path='${escapeSelector(
              cleanPath
            )}'] .nav-folder-title-content::after {
                content: " " !important;  
                color: ${
                  neutralStyle.includes("high")
                    ? "var(--text-muted)"
                    : "var(--text-faint)"
                } !important;
                font-size: ${
                  neutralStyle.includes("large") ? "1.2em" : "1em"
                } !important;
                font-family: monospace !important;  // Add this to prevent emoji rendering
                vertical-align: middle !important;
            }
        `;

      style.textContent = styleContent;
      document.head.appendChild(style);
    };

    // -------- THE LOGIC -----------------
    // handle general paths
    Object.keys(this.settings.activeFlowObject).forEach((flow) => {
      // get the file list
      let key = this.settings.flows[flow].flowRecipe.bookmarks
        ? "bookmarks"
        : "foldersTagsProps";

      for (path of this.settings.flows[flow].flowRecipe[key]) {
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
  };

  // ---------------- Functions: Listeners -------------------------

  // ---------------- Functions: Listeners: Global -----------------
  addListeners() {
    // ---------------- File modification -------------------------------
    // This event fires whenever any file in the vault is modified
    // the isSyncing flag prevents a doom spiral
    this.registerEvent(
      this.app.vault.on("modify", (file: TAbstractFile) => {
        if (!this.isSyncing) {
          if (file instanceof TFile) {
            Object.keys(this.settings.flows).forEach((flowName) => {
              if (
                !this.settings.flows[flowName].flaggedForRebuild &&
                this.settings.flows[flowName].flowMap[file.path]
              ) {
                this.settings.flows[flowName].flaggedForRebuild = true;
                this.saveSettings();
              }
            });
          }
        }
      })
    );

    // Rename events
    this.registerEvent(
      this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
        let parentFolder = normalizePath(dirname(file.path));
        if (file instanceof TFolder) {
          parentFolder = file.path;
        }

        // Check if the current folder's path is the stored systemFolderPath;
        // if it is, we don't have to do any more checks
        if (parentFolder === this.settings.systemFolderPath) return;
        // if it's not, check if it should be
        if (parentFolder.contains(TEXTFLOW_SYSTEMFOLDER)) {
          // if it should be, update settings
          this.ensureSystemFolder();
        }

        const breakableCheckPaths = Object.keys(this.settings.flows);
        for (let flowName of breakableCheckPaths) {
          // if the flow is made from bookmarks, move on
          if (this.settings.flows[flowName].flaggedForRebuild) break;
          if (this.settings.flows[flowName].flowRecipe.bookmarks) break;

          // if the flow contained the old path, flag and move on
          if (this.settings.flows[flowName].flowMap[oldPath]) {
            this.settings.flows[flowName].flaggedForRebuild = true;
            this.saveSettings();
            break;
          }
          // if the parent is included
          if (
            parentFolder ===
            this.settings.flows[flowName].flowCookbook.folderIncluded
          ) {
            this.settings.flows[flowName].flaggedForRebuild = true;
            this.saveSettings();
            break;
          }
          if (
            // if the path starts with inclusion path, subfolders aren't excluded
            // and the subfolder isn't excluded later
            parentFolder.startsWith(
              this.settings.flows[flowName].flowCookbook.folderIncluded + "/"
            ) &&
            !this.settings.flows[flowName].flowCookbook.folderIncluded.endsWith(
              "/"
            ) &&
            !parentFolder.includes(
              this.settings.flows[flowName].flowCookbook.folderExcluded + "/"
            )
          ) {
            this.settings.flows[flowName].flaggedForRebuild = true;
            this.saveSettings();
            break;
          }
        }
      })
    );

    // Create events
    this.registerEvent(
      this.app.vault.on("create", (file: TAbstractFile) => {
        if (this.isLoading) return;

        let parentFolder = normalizePath(dirname(file.path));
        if (file instanceof TFolder) {
          parentFolder = normalizePath(file.path);
        }
        const breakableCheckPaths = Object.keys(this.settings.flows);
        for (let flowName of breakableCheckPaths) {
          if (this.settings.flows[flowName].flaggedForRebuild) break;
          if (this.settings.flows[flowName].flowRecipe.bookmarks) break;
          // if the parent folder is included
          if (
            parentFolder ===
            this.settings.flows[flowName].flowCookbook.folderIncluded
          ) {
            this.settings.flows[flowName].flaggedForRebuild = true;
            this.saveSettings();
            break;
          }
          if (
            // if the path starts with inclusion path, subfolders aren't excluded
            // and the subfolder isn't excluded later
            parentFolder.startsWith(
              this.settings.flows[flowName].flowCookbook.folderIncluded + "/"
            ) &&
            !this.settings.flows[flowName].flowCookbook.folderIncluded.endsWith(
              "/"
            ) &&
            !parentFolder.includes(
              this.settings.flows[flowName].flowCookbook.folderExcluded + "/"
            )
          ) {
            this.settings.flows[flowName].flaggedForRebuild = true;
            this.saveSettings();
            break;
          }
        }
      })
    );

    // Delete events
    this.registerEvent(
      this.app.vault.on("delete", (file: TAbstractFile) => {
        if (file instanceof TFile) {
          const breakableCheckPaths = Object.keys(this.settings.flows);
          for (let flowName of breakableCheckPaths) {
            if (
              !this.settings.flows[flowName].flaggedForRebuild &&
              this.settings.flows[flowName].flowMap[normalizePath(file.path)]
            ) {
              this.settings.flows[flowName].flaggedForRebuild = true;
              this.saveSettings();
              break;
            }
          }
        }
      })
    );

    // ----------------- Auto-save on blur  -------------------------------
    this.registerDomEvent(window, "blur", async () => {
      await this.syncAllLeaves();
    });

    // -- LEAF CHANGE - Manage editors and warning css on flow, source and vanilla notes ------
    // setup functions take care of the details
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", async (leaf) => {
        if (this.isNavigatingFlow) {
          // console.log("skipping active-leaf setups because isNavigatingFlow");
          return;
        }
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
              await this.setupFlowView(isFlow, leaf.view);
              this.mostRecentActiveFlowLeaf = leaf;

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
      this.app.workspace.on("file-open", async (file) => {
        // console.log("file-open triggered");
        if (this.isNavigatingFlow) {
          //    console.log("skipping file-open setup because isNavigatingFlow");
          return;
        }
        // In case the newly opened file has been loaded into
        // the active leaf, which doesn't trigger active-leaf-change
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView || !activeView.file) {
          return;
        }

        if (activeView && activeView.file) {
          const activeLeafPath = activeView.file.path;
          if (activeLeafPath) {
            // if active leaf is flow, set it up
            const isFlow = this.isFlowFile(activeLeafPath);
            if (isFlow) {
              await this.setupFlowView(isFlow, activeView);
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
                  "textFlow Plugin Critical Error:\n " +
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
                          cursorOffset,
                          view
                        );
                        /*console.log(
                          "cusor listener calling checkActiveRegionCache"
                        );*/
                        if (plugin.hadTrackingError) {
                          new Notice(
                            "textFlow: Flow tracking restored. :)\n" +
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
                          "textFlow Plugin warning:\n " +
                            "Flow region tracking failed!\n\n" +
                            "Please close and reopen your flow.\n\n" +
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
                  "textFlow Plugin warning:\n " +
                    "Flow region tracking failed!\n\n" +
                    "Please close and reopen your flow.\n\n" +
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
                  "textFlow Plugin: Error during cleanup of cursor listener.\n" +
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
            throw new Error("TextFlow plugin: No active leaf path available.");
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
            "textFlow Plugin Critical Error:\n " +
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
        const changeListener = ViewPlugin.fromClass(
          class {
            constructor(view: EditorView) {
              try {
                // Any initialization if needed
              } catch (error) {
                console.error("Error initializing change listener:", error);
                new Notice(
                  "textFlow Plugin: Error tracking text changes.\n" +
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
                        plugin.settings.flows[isItFlow].activeRegions[leafID] &&
                        plugin.settings.flows[isItFlow].activeRegions[leafID]
                          .type === "file"
                      ) {
                        const activePath =
                          plugin.settings.flows[isItFlow].activeRegions[leafID]
                            .path;

                        // This check is here because else a rebuild will put the currently active region in
                        // the unsavedRegionsArray, and I don't want to fudge with more complicated state management
                        if (plugin.settings.flows[isItFlow].isFreshBuild) {
                          plugin.settings.flows[isItFlow].isFreshBuild = false;
                          return;
                        }

                        // if the active region isn't registered as modified
                        if (
                          activePath &&
                          !plugin.settings.flows[
                            isItFlow
                          ].unsavedRegionsArray.includes(activePath)
                        ) {
                          // Add to unsaved array
                          plugin.settings.flows[
                            isItFlow
                          ].unsavedRegionsArray.push(activePath);
                          plugin.saveSettings();
                          if (view.menuBar) {
                            view.menuBar.refresh(view.contentEl);
                          }
                          if (plugin.settings.showExplorerDeco) {
                            plugin.decorateSourceFiles();
                          }

                          // Check other flows that might need rebuilding
                          Object.keys(plugin.settings.flows).forEach(
                            (otherFlow) => {
                              if (
                                otherFlow !== isItFlow && // Different flow
                                !plugin.settings.flows[otherFlow]
                                  .flaggedForRebuild && // Not already flagged
                                plugin.settings.flows[otherFlow].flowMap[
                                  activePath
                                ] // Contains this file
                              ) {
                                plugin.settings.flows[
                                  otherFlow
                                ].flaggedForRebuild = true;
                              }
                            }
                          );
                        }
                      }
                    } catch (error) {
                      console.error("Error processing text change:", error);
                      new Notice(
                        "textFlow Plugin warning: Error processing text change",
                        5000
                      );
                    }
                  }, 250);
                }
              } catch (error) {
                console.error("Error in change update:", error);
                new Notice(
                  "textFlow Plugin: Error tracking changes.\n" +
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
                  "textFlow Plugin: Error during cleanup of change listener.\n" +
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
            "textFlow Plugin: Error setting up change tracking.\n" +
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
      if (!this.settings.explorerListener) {
        return;
      }

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

      // I don't remember why I did this; I guess to prevent some bug?
      // Should have commented right away -.-
      const activeFlowObjectSnapshot = this.settings.activeFlowObject;

      // check if the user likely isn't trying to open a file with their click
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        return;
      }
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

        for (const flowName in activeFlowObjectSnapshot) {
          if (Object.keys(activeFlowObjectSnapshot[flowName]).length != 0) {
            if (this.settings.flows[flowName].flowMap[clickedFilePath]) {
              parentFlowName = flowName;
              flowSettings = this.settings.flows[flowName];
              isOfActiveFlow = true;
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
    };
  }

  // ---------------- Functions: Flow management -------------------------
  // The big bundle that centralises flow management
  async setupFlowView(flowName: string, view: MarkdownView) {
    const leafID = (view.leaf as any).id;
    const editor = view.editor as any;

    try {
      // this has to happen first so the menuBar can access its leaf specific settings
      console.log(
        "setupFlowView calling manageActiveFlowObject for ",
        flowName
      );
      await this.manageActiveFlowObject();
      await this.syncAllLeaves();

      // and this also has to be done before the setup so I don't have to refresh the menu bar
      if (this.settings.flows[flowName].flaggedForRebuild) {
        await this.flowService.rebuildFlow(flowName, "setupFlowView");
      }

      this.addProtectDuringSaveExtension(editor);
      this.addIdDividerProtection(view, flowName);
      this.addCursorListener(view);
      this.addTextChangeListener(view);

      // scroll bar visibility
      this.flowService.updateScrollbarVisibility();
      this.restoreCursorPos(flowName, view, leafID);

      // Update the modal
      if (this.modalUpdateCallback) {
        this.modalUpdateCallback();
      }
    } finally {
      // Do the menu bar stuff
      if (view.menuBar) {
        if ((view.menuBar as MenuBar).getFlowName() === flowName) {
          view.menuBar.refresh(view.contentEl);
          return;
        }
        view.menuBar.detach();
        delete view.menuBar;
      }

      const menuBar = new MenuBar(this.app, this, flowName, view);
      menuBar.attach(view.contentEl);
      view.menuBar = menuBar;

      // this is here so if the user has other leaves with the same flow
      // visible, the menu bar gets updated
      const allLeaves = this.app.workspace.getLeavesOfType("markdown");
      for (const leaf of allLeaves) {
        const otherView = leaf.view as MarkdownView;
        if (otherView === view) continue;
        const filePath = view.file?.path;
        if (!filePath) continue;
        const otherFlowName = this.isFlowFile(filePath);
        if (!otherFlowName || otherFlowName != flowName) continue;
        otherView.menuBar?.refresh(view.contentEl);
      }
    }
  }

  // ---- Identity check
  isFlowFile = (activeLeafPath: string) => {
    if (!normalizePath(activeLeafPath).includes("TextFlow_SystemFolder")) {
      return null;
    }
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
      new Notice(`textFlow: No flow with name ${flowName} found.`, 10000);
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
            "textFlow: View is not MarkdownView after opening flow file"
          );
        }
      } else {
        new Notice(
          `textFlow: Flow file not found: ${flow.flowFilePath}\nTry clicking the 'Move' button for the TextFlow_SystemFolder location.`,
          10000
        );
      }
    }
  }

  // ------------- Used by flowSwitcherModal -----------
  manageActiveFlowObject = async () => {
    // track all leaves
    const foundFlowLeaves: Record<string, Set<string>> = {};
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView) {
        const leafID = (leaf as any).id;
        const leafPath = leaf.view.file?.path;
        if (leafPath) {
          const flowName = this.isFlowFile(leafPath);
          if (flowName) {
            // get leaves per flow
            if (!foundFlowLeaves[flowName]) {
              foundFlowLeaves[flowName] = new Set();
            }
            foundFlowLeaves[flowName].add(leafID);

            // Ensure the acviveFlowObject exists
            if (!this.settings.activeFlowObject[flowName]) {
              this.settings.activeFlowObject[flowName] = {};
            }
            this.settings.activeFlowObject[flowName][leafID] = true;

            // Then add region tracking for newly opened leaves
            if (this.settings.flows[flowName].activeRegions) {
              if (!this.settings.flows[flowName].activeRegions[leafID]) {
                this.addRegionTracking(flowName, leafID);
              }
            }
          }
        }
      }
    });

    // Clean up region tracking for closed leaves
    Object.keys(this.settings.flows).forEach((flowName) => {
      if (this.settings.flows[flowName].activeRegions) {
        if (
          Object.keys(this.settings.flows[flowName].activeRegions).length > 0
        ) {
          Object.keys(this.settings.flows[flowName].activeRegions).forEach(
            async (leafID) => {
              if (!foundFlowLeaves[flowName]?.has(leafID)) {
                delete this.settings.flows[flowName].activeRegions[leafID];
              }
              // then, if a flow is all closed, we sync it, because all other syncs
              // only care for active leaves
              if (
                Object.keys(this.settings.flows[flowName].activeRegions)
                  .length === 0
              ) {
                if (
                  this.settings.flows[flowName].unsavedRegionsArray.length > 0
                ) {
                  const path = this.settings.flows[flowName].flowFilePath;
                  const note = this.app.vault.getAbstractFileByPath(path);
                  if (!note) {
                    new Notice(
                      `textFlow: The note at ${path} couldn't be found.`
                    );
                  }
                  if (note instanceof TFile) {
                    // get the text from the file
                    const text: string = await this.app.vault.read(note);

                    this.saveBackToSource(flowName, text);
                  }
                }
              }
            }
          );
        }
      }
      // finally, also clean up the activeFlowObject
      if (this.settings.activeFlowObject) {
        if (this.settings.activeFlowObject[flowName]) {
          if (
            Object.keys(this.settings.activeFlowObject[flowName]).length === 0
          ) {
            delete this.settings.activeFlowObject[flowName];
          } else {
            Object.keys(this.settings.activeFlowObject[flowName]).forEach(
              (leafID) => {
                if (!foundFlowLeaves[flowName]?.has(leafID)) {
                  delete this.settings.activeFlowObject[flowName][leafID];
                }
              }
            );
          }
        }
        // And now update the decoration and refresh the menu bars
        if (Object.keys(this.settings.activeFlowObject).length === 0) {
          this.undecorateSourceFiles();
          const allLeaves = this.app.workspace.getLeavesOfType("markdown");
          for (const leaf of allLeaves) {
            const view = leaf.view as MarkdownView;
            const filePath = view.file?.path;
            if (!filePath) continue;
            const flowName = this.isFlowFile(filePath);
            if (!flowName) continue;
            view.menuBar?.refresh(view.contentEl);
          }
        }
      }
    });
    await this.saveSettings();
  };

  // ----- add region tracking for new leafs
  addRegionTracking = async (flowName: string, leafID: string) => {
    const [path, targetObject] =
      Object.entries(this.settings.flows[flowName].flowMap).find(
        ([_, obj]) => obj.flowOrder === 1
      ) || [];
    if (targetObject) {
      const { type, UID, flowOrder, lengthPlusDividers } = targetObject;
      this.settings.flows[flowName].activeRegions[leafID] = {
        currentCursorPos: 0,
        type: targetObject.type,
        path: path,
        UID: targetObject.UID,
        flowOrder: 1,
        startInFlow: 0,
        endInFlow: targetObject.lengthPlusDividers,
        leafMenuBarSettings: {
          menuBarDisplayState: "show",
          navDropdownState: "hide",
          cursorDropdownState: "hide",
        },
      };
      await this.saveSettings();
    }
  };

  // if a flow is replaced by a non-flow
  closeFlow = async (view: MarkdownView) => {
    await this.syncAllLeaves();
    this.removeCursorListener(view);
    this.removeTextChangeListener(view);
    this.removeIdDividerProtection(view.editor as any);
    this.cleanupMenuBar(view.leaf);
    this.manageActiveFlowObject();
    if (view.menuBar) {
      view.menuBar.detach();
    }
    // reveal scrollbar
    this.flowService.updateScrollbarVisibility();
    this.saveSettings();
  };

  // --- Set up source files
  setupSourceNote = (view: MarkdownView) => {
    if (this.isNavigatingFlow) {
      //console.log("Skipping source note setup during navigation");
      return;
    }
    //console.log("setupSourceNote: calling closeFlow");
    this.closeFlow(view);
  };

  // --- set up vanilla note
  setupVanillaNote = (view: MarkdownView) => {
    //console.log("setupVanillaNote: calling close flow");
    this.closeFlow(view);
  };

  // ---- Functions: Data safety ----------------------------

  // ---- Functions: Data safety: Read-only for UIDs and dividers
  addIdDividerProtection = (view: MarkdownView, flowName: string) => {
    const flow = this.settings.flows[flowName];
    if (!flow) return;

    const editor = view.editor as any;
    if (!editor.cm) return;

    if (!this.hasIdDividerProtection(editor)) {
      const preventEdit = EditorState.transactionFilter.of((tr) => {
        if (this.isRebuilding) {
          return tr;
        }

        if (!tr.changes.empty) {
          let shouldReject = false;

          tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
            const windowStart = Math.max(0, fromA - 60);
            const windowEnd = Math.min(tr.startState.doc.length, toA + 60);
            const windowText = tr.startState.sliceDoc(windowStart, windowEnd);

            let match;
            const regex =
              /\n[\u200B\u200C\u200D\u2060\u2061\u2062\u2063\u2064\uFEFF\u00A0]{46}<hr>\n\n/g;

            while ((match = regex.exec(windowText)) !== null) {
              const absoluteDividerStart = windowStart + match.index + 1;
              const absoluteDividerEnd =
                absoluteDividerStart + match[0].length - 2;

              if (
                (fromA < absoluteDividerEnd && toA > absoluteDividerStart) ||
                (fromA <= absoluteDividerStart && toA >= absoluteDividerEnd) ||
                // Protect against edits that would affect the newlines
                (fromA >= absoluteDividerStart &&
                  fromA <= absoluteDividerEnd) ||
                (toA >= absoluteDividerStart && toA <= absoluteDividerEnd)
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
  hasIdDividerProtection = (editor: any) => {
    if (!editor.cm) return false;
    const hasField =
      editor.cm.state.field(this.readOnlyRanges, false) !== undefined;
    return hasField;
  };

  // -----------------------------------------------------------
  removeIdDividerProtection = (editor: any) => {
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
  toggleProtectionDuringSave(editorView: EditorView, isProtected: boolean) {
    try {
      const container = editorView.dom.closest(".cm-editor")?.parentElement;
      if (container) {
        container.classList.toggle("save-rebuild-protection", isProtected);
      }
      editorView.dispatch({
        effects: this.toggleProtectionEffect.of(isProtected),
      });
    } catch (error) {
      console.error("Failed to toggle protection:", error);
    }
  }
  // ---- Functions: Data safety: Save changes to source files
  // --- but first, a little helper function, just in case the UI is sluggish:

  private async pollForEditor(
    view: MarkdownView,
    retries = 5,
    delay = 200
  ): Promise<ObsidianEditor | null> {
    for (let i = 0; i < retries; i++) {
      const editor = view.editor as ObsidianEditor;
      if (editor?.cm) {
        return editor; // Success!
      }
      // Wait for the delay before the next attempt
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    new Notice(
      `textFlow: Editor in view '${view.file?.path}' did not become available after ${retries} retries. Sync has been aborted. Please try again.`
    );
    return null; // Failure
  }

  // Sync all leaves

  syncAllLeaves = async () => {
    this.isSyncing = true;
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
        let editor = view.editor as ObsidianEditor;
        if (!editor) {
          const newEditor = await this.pollForEditor(view);
          if (newEditor) {
            editor = newEditor;
          }
        }
        if (editor.cm) {
          await this.toggleProtectionDuringSave(editor.cm, true);
        }
      }
      // Perform saves
      await Promise.all(
        Object.entries(flowLeaves).map(async ([flowName, view]) => {
          const text = view.editor.getValue();
          const leafID = (view.leaf as any).id;
          await this.saveBackToSource(flowName, text, leafID);
          if (view.menuBar) {
            view.menuBar.refresh(view.contentEl);
          }
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
      this.isSyncing = false;
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
  saveBackToSource = async (
    flowName: string,
    text: string,
    leafID?: number
  ) => {
    // console.log("saveBackToSource responding");
    if (this.settings.flows[flowName].unsavedRegionsArray) {
      const map = this.settings.flows[flowName].flowMap;
      const remainingPaths: string[] = [];
      if (this.settings.flows[flowName].unsavedRegionsArray.length > 0) {
        for (const path of this.settings.flows[flowName].unsavedRegionsArray) {
          const sourceFile = await this.app.vault.getFileByPath(path);
          if (!sourceFile) {
            console.error(`File not found at path: ${path}`);
            return;
          }

          let startOfRegion = await this.findStartOfRegion(
            this.settings.flows[flowName],
            map[path].flowOrder,
            text
          );

          const endOfRegion = text.indexOf(map[path].UID) - 1; // subtract 1 for the \r before the UID

          const flowFile = await this.app.vault.getFileByPath(
            this.settings.flows[flowName].flowFilePath
          );

          if (!flowFile) {
            new Notice(`textFlow: File not found at path: ${path}`);
            return;
          } else if (sourceFile instanceof TFile && startOfRegion) {
            const regionSlice = text.slice(startOfRegion + 1, endOfRegion);
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
            } catch (error) {
              remainingPaths.push(path);
              new Notice(
                `textFlow: An error occurred while trying to sync to ${path}. Please try again in a second. If the error persists, consult the 'Fixing problems' section of the readme.`
              );

              // console.error(`Failed to save changes to ${file.path}:`, error);
              throw error;
            }
          }
        }
      }
      this.settings.flows[flowName].unsavedRegionsArray = remainingPaths;
      if (leafID) {
        this.manageCursorPos(flowName, leafID);
      }
      this.saveSettings();
      this.settings.flows[flowName].timestamp = this.getTimestamp();
      if (this.settings.showExplorerDeco) {
        this.decorateSourceFiles();
      }
    }
  };

  formatTimestamp = (timestamp: number, allTimestamps: number[]): string => {
    // Create date formatter for the date part
    const dateFormatter = new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    // Create time formatter - will automatically use 24h format based on locale
    const timeFormatter = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const date = new Date(timestamp);
    const dateStr = dateFormatter.format(date).replace(/\//g, "-");
    const timeStr = timeFormatter.format(date);

    // Find duplicates (timestamps that match when rounded to seconds)
    const timestampSec = Math.floor(timestamp / 1000);
    const duplicates = allTimestamps
      .filter((t) => Math.floor(t / 1000) === timestampSec)
      .sort();

    // If this timestamp has duplicates, add the index
    const index = duplicates.indexOf(timestamp);
    const suffix = duplicates.length > 1 ? ` (${index + 1})` : "";

    return `${dateStr} / ${timeStr}${suffix}`;
  };

  // -------------- Functions: Manage persistent cursor position
  manageCursorPos = (flowName: string, leafID: number) => {
    if (this.settings.flows[flowName].activeRegions) {
      const allTimestamps: number[] = [];
      Object.keys(this.settings.flows[flowName].activeRegions).forEach(
        (leaf) => {
          if (
            this.settings.flows[flowName].persistentCursors[leaf]?.creationDate
          ) {
            const timestamp =
              this.settings.flows[flowName].persistentCursors[leaf]
                .creationDate;
            allTimestamps.push(timestamp);
          }
        }
      );

      const currentLeaf = this.settings.flows[flowName].activeRegions[leafID];

      // check because of possible undefined
      let regionPath = "";
      if (currentLeaf.path) {
        regionPath = currentLeaf.path;
      }

      const currentCursor = currentLeaf.currentCursorPos;
      // Initialize if doesn't exist
      if (!this.settings.flows[flowName].persistentCursors) {
        this.settings.flows[flowName].persistentCursors = {};
      }
      if (!this.settings.flows[flowName].persistentCursors[leafID]) {
        const creationDateString = this.formatTimestamp(
          Date.now(),
          allTimestamps
        );
        this.settings.flows[flowName].persistentCursors[leafID] = {
          creationDate: Date.now(),
          creationDateString: creationDateString,
          update: Date.now(),
          cursors: [[regionPath, currentCursor]],
        };
        const leaves = Object.entries(
          this.settings.flows[flowName].persistentCursors
        );
        if (leaves.length > 5) {
          // Find the leaf with the oldest timestamp
          const [oldestLeafId] = leaves.reduce((oldest, current) => {
            return current[1].update < oldest[1].update ? current : oldest;
          });
          delete this.settings.flows[flowName].persistentCursors[oldestLeafId];
        }
        return;
      }

      // Check if there's an entry for the leaf and path and delete if present
      this.settings.flows[flowName].persistentCursors[leafID].cursors =
        this.settings.flows[flowName].persistentCursors[leafID].cursors.filter(
          (tuple) => tuple[0] !== regionPath
        );

      // Then add the new cursor
      this.settings.flows[flowName].persistentCursors[leafID].cursors.unshift([
        regionPath,
        currentCursor,
      ]);
      // update the timestamp
      this.settings.flows[flowName].persistentCursors[leafID].update =
        Date.now();

      // Romove stale entries
      if (
        this.settings.flows[flowName].persistentCursors[leafID].cursors.length >
        5
      ) {
        this.settings.flows[flowName].persistentCursors[leafID].cursors.pop();
      }
    }
  };

  // -------- Restore cursorPos for known leaves
  restoreCursorPos = (flowName: string, view: MarkdownView, leafID: string) => {
    if (
      this.settings.flows[flowName].persistentCursors &&
      this.settings.flows[flowName].persistentCursors[leafID]
    ) {
      const editor = view.editor as ObsidianEditor;
      const cmEditor = editor.cm;
      if (cmEditor) {
        const cursorPos =
          this.settings.flows[flowName].persistentCursors[leafID].cursors[0][1];

        if (cursorPos !== undefined && cursorPos >= 0) {
          this.flowService.scrollToPos(editor, cursorPos);
        }
      }
    }
  };

  // --------------- Functions: Flow management: Regions -----------------------------------------
  private checkActiveRegionCache = async (
    flow: Types.FlowDef,
    leafID: number,
    cursorOffset: number,
    view: MarkdownView
  ) => {
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
      let activeRegionObject = this.findActiveRegion(
        flow,
        editor,
        leafID,
        cursorOffset,
        text
      );

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
      let activeRegion = await this.findActiveRegion(
        flow,
        editor,
        leafID,
        cursorOffset,
        text
      );

      if (activeRegion) {
        // console.log("New active region found:", activeRegion.path);
        flow.activeRegions[leafID] = activeRegion;
        this.saveSettings();
        if (view.menuBar) {
          view.menuBar.refresh(view.contentEl);
        }
      } else {
        console.error("No new active region found");
      }
      // console.log("checkActiveRegionCache: ", flow.activeRegions);
      await this.saveSettings();
      return;
    }
  };

  // ------------- region tracking utilities ----------------------
  private findActiveRegion = (
    flow: Types.FlowDef,
    editor: ObsidianEditor,
    leafID: number,
    cursorOffset: number,
    text: string
  ) => {
    const markerRegex =
      /[\u200B\u200C\u200D\u2060\u2061\u2062\u2063\u2064\uFEFF\u00A0]{46}<hr>/;
    // Handle boundary conditions first
    if (cursorOffset === 0) {
      // Get first region from flow map
      const firstRegion = Object.entries(flow.flowMap).find(
        ([_, regionMap]) => regionMap.flowOrder === 1
      );

      if (firstRegion) {
        const [path, regionMap] = firstRegion;
        // Move cursor to safe position in first region
        const safePos = 1;
        this.flowService.scrollToPos(editor, safePos);
        console.log("First region: ", path);
        return {
          currentCursorPos: safePos,
          type: regionMap.type,
          path: path,
          UID: regionMap.UID,
          flowOrder: 1,
          startInFlow: 0,
          endInFlow: text.indexOf(regionMap.UID) + regionMap.UID.length + 4,
          leafMenuBarSettings: flow.activeRegions[leafID].leafMenuBarSettings,
        };
      }
    }

    if (cursorOffset >= text.length - 46) {
      // Get last region from flow map
      const lastRegion = Object.entries(flow.flowMap).find(
        ([_, regionMap]) =>
          regionMap.flowOrder === Object.keys(flow.flowMap).length
      );

      if (lastRegion) {
        const [path, regionMap] = lastRegion;
        // Move cursor to safe position in last region
        const safePos = text.lastIndexOf(regionMap.UID) - 1;
        this.flowService.scrollToPos(editor, safePos);
        console.log("last region: ", path);
        return {
          currentCursorPos: safePos,
          type: regionMap.type,
          path: path,
          UID: regionMap.UID,
          flowOrder: regionMap.flowOrder,
          startInFlow:
            this.findStartOfRegion(flow, regionMap.flowOrder, text) || 0,
          endInFlow: text.lastIndexOf(regionMap.UID) + regionMap.UID.length + 4,
          leafMenuBarSettings: flow.activeRegions[leafID].leafMenuBarSettings,
        };
      }
    }

    const searchStart = text.slice(cursorOffset);

    const matches = searchStart.match(markerRegex);

    let UIDLength = 0;
    if (matches) {
      UIDLength = matches[0].length - 4;
      const UUID = matches[0].slice(0, UIDLength);

      // Log all regions and their UIDs
      Object.entries(flow.flowMap).forEach(([path, region]) => {});
      UIDLength = matches[0].length - 4;
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
          leafMenuBarSettings: {
            menuBarDisplayState:
              flow.activeRegions[leafID].leafMenuBarSettings
                .menuBarDisplayState,
            navDropdownState:
              flow.activeRegions[leafID].leafMenuBarSettings.navDropdownState,
            cursorDropdownState:
              flow.activeRegions[leafID].leafMenuBarSettings
                .cursorDropdownState,
          },
        };
        return activeRegionObject;
      } else {
        console.error("No matching region found for UID");
      }
    } else {
      console.error("No marker found in text after cursor");
    }
    return undefined;
  };

  // ------------------
  findStartOfRegion = (
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
      const invisibleUID = previousRegionMap.UID;
      const index = text.indexOf(invisibleUID);
      const startPos = index + (invisibleUID + "<hr>").length + 1;
      return startPos;
    } else {
      return 1;
    }
  };

  // -------------------------------------------------------
  //------------------------- ONLOAD -----------------------
  // -------------------------------------------------------
  async onload() {
    this.settings = await this.loadSettings();

    this.flowService = new FlowService(this, this.app);

    // -------------------------------------------------------------------
    // ------------------- ONLOAD: add listeners for cursor and clicks
    // Wait for the file explorer to be available in the DOM
    this.app.workspace.onLayoutReady(async () => {
      // ---------- Look for TextFlow_SystemFolder
      this.ensureSystemFolder();
      if (this.settings.showExplorerDeco) {
        this.decorateSourceFiles();
      }
      this.flowService.updateScrollbarVisibility();
      // ----- ONLOAD: set up UI -------------------------

      // ------------------- Flow switcher modal ---------------------
      // Add status bar item
      if (this.settings.switcherPos === "statusBar") {
        const flowSwitcher = this.addStatusBarItem();
        flowSwitcher.addClass("mod-clickable");
        const iconContainer = flowSwitcher.createSpan();
        setIcon(iconContainer, "scroll-text");

        flowSwitcher.addEventListener("click", () => {
          new Modals.FlowSwitcherModal(this.app, this).open();
        });
      } else if (this.settings.switcherPos === "ribbon") {
        this.addRibbonIcon(
          "scroll-text",
          "Open flowSwitcher",
          (evt: MouseEvent) => {
            new Modals.FlowSwitcherModal(this.app, this).open();
          }
        );
      }
      // Handle temp folder visibility
      if (this.settings.systemFolderHidden) {
        this.discernAndSetSystemFolderState(
          true,
          this.settings.systemFolderPath
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
              this.settings.systemFolderPath
            );
          }, 100);
        }
      }
    });

    // ----------- ONLOAD: add global listeners ------------------------------------

    this.addListeners();
    this.registerCommands();
    this.addSettingTab(new TextFlowSettingsTab(this.app, this));
    this.app.metadataCache.on("resolved", () => {
      setTimeout(() => {
        this.isLoading = false;
      }, 1000); // Add a small delay to ensure all initial events have fired
    });
  }

  // -------------------------------------------------------
  // ------------------ ONUNLOAD---------------------------
  // -------------------------------------------------------
  onunload() {
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

    // --------------- Remove menu bar ------------------
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView && leaf.view.menuBar) {
        leaf.view.menuBar.detach();
      }
    });
  }
}
