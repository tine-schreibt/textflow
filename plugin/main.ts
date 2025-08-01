import {
  Editor,
  MarkdownView,
  normalizePath,
  Notice,
  Plugin,
  setIcon,
  TFolder,
  TAbstractFile,
  WorkspaceLeaf,
  TFile,
} from "obsidian";
import { TextFlowSettingsTab } from "./src/settingsTab";
import { TextFlowSettings, DEFAULT_SETTINGS } from "./src/types";
import { EditorView, ViewUpdate, ViewPlugin } from "@codemirror/view";
import {
  Compartment,
  EditorState,
  StateEffect,
  Extension,
} from "@codemirror/state";
import { redo } from "@codemirror/commands";
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

// keeps all the listeners in one place
interface ListenerBasketItem {
  extension: Extension;
}

// ----------- THE PLUGIN CLASS ITESELF
export default class TextFlowPlugin extends Plugin {
  settings: TextFlowSettings;
  flowService: FlowService;
  settingsTab: TextFlowSettingsTab;
  isRebuilding: boolean = false; // to prevent a doom spiral of the modify listener
  isLoading: boolean = true; // suspend create listener while we're setting up

  // ---------------- Global objects and variables -------------------------

  // ---- flag to prevent the leaf-change-listener from interfering with scrolling to source file in flow
  private explorerClickListenerActive: boolean = false;

  // ---- flag to keep textFlow from eating its tail when its own file operations trigger a listener
  textFlowOperation: boolean = false;

  // This is used by listeners and setups for proper leaf activation
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

  // ---------------- Functions: Utilities: UI/UX -------------------------

  // cleanup for the menu bar
  // creation happens in setupFlowView, using menuBar.ts
  //CHECKED AND TESTED
  cleanupMenuBar(leaf: WorkspaceLeaf) {
    if (leaf.view instanceof MarkdownView && leaf.view.menuBar) {
      leaf.view.menuBar.detach();
      delete leaf.view.menuBar;
    }
  }
  //^CHECKED AND TESTED

  // ---------------- all our nice commands
  registerCommands() {
    // Command for syncing
    this.addCommand({
      id: `sync-text-flow`,
      name: `Sync all modified regions.`,
      callback: async () => {
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
        if (this.settings.showExplorerDeco) {
          this.settings.showExplorerDeco = false;
          this.unDecorateSourceNotes();
        } else {
          this.settings.showExplorerDeco = true;
          this.decorateSourceNotes("redo");
        }
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

        const leafID = (activeView.leaf as any).id;
        // check if we got data for that leafID
        this.restoreCursorPos(flowName, activeView, leafID);
      },
    });

    // toggle scrollbar visibility
    this.addCommand({
      id: "toggle-scroll-bar",
      name: `Toggle scroll bar`,
      callback: async () => {
        if (this.settings.hideScrollbar === "none") {
          this.settings.hideScrollbar = "all";
          await this.saveSettings();
          this.flowService.updateScrollbarVisibility();
        } else if (this.settings.hideScrollbar === "all") {
          this.settings.hideScrollbar = "none";
          await this.saveSettings();
          this.flowService.updateScrollbarVisibility();
        }
      },
    });
  }

  // ----- is called onload and sets the visibility of TextFlow_SystemFolder
  //CHECKED AND TESTED
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
  // ^CHECKED AND TESTED

  // ----- DECORATE SOURCE NOTES IN FILE EXPLORER -----------
  // CHECKED AND TESTED
  decorateSourceNotes = async (mode: Types.CalculationMode) => {
    if (!this.settings.showExplorerDeco) return;

    let path = "";
    let handledPathsArray: string[] = [];
    const unsyncedPathsArray: string[] = [];
    let decoStyle = "";

    // ------ all the helper functions used -------
    const handlePath = (path: string, decoStyle: Types.DecoStyle) => {
      let successivePath = "";
      for (let fragment of path.split("/")) {
        if (!fragment.endsWith(".md")) {
          successivePath += `${fragment}/`;
        } else {
          successivePath += fragment;
        }
        if (!handledPathsArray.includes(successivePath)) {
          handledPathsArray.push(successivePath);
          updateStyles(successivePath, decoStyle);
        }
      }
    };

    const updateStyles = (path: string, decoStyle: Types.DecoStyle) => {
      // Remove trailing slash for files (if it exists)
      const cleanPath = path.endsWith("/") ? path.slice(0, -1) : path;

      // First remove any existing styles for this path
      const existingStyles = document.head.querySelectorAll(
        "style[data-textflow-neutral], style[data-textflow-unsynced]"
      );
      existingStyles.forEach((style) => {
        const styleContent = style.textContent || "";
        // Only remove if it's for this specific path
        if (
          styleContent.includes(`data-path='${this.escapeSelector(cleanPath)}'`)
        ) {
          style.remove();
        }
      });

      // Return early if we're just removing styles
      if (decoStyle === "none") {
        return;
      }

      const fileElement = document.querySelector(
        `div[data-path='${this.escapeSelector(cleanPath)}']`
      );
      const folderElement = document.querySelector(
        `div[data-path='${this.escapeSelector(cleanPath)}'] .nav-folder-title`
      );

      let style = document.createElement("style");

      style.setAttribute(`data-textflow-${decoStyle}`, "true");

      // the decoration symbol which we fetch from an array of options
      let neutralSymbol = this.settings.explorerDecoStyle[0];
      let unsyncedSymbol = this.settings.explorerDecoStyle[1];
      const neutralStyle = this.settings.explorerDecoStyle[2];
      const unsyncedStyle = this.settings.explorerDecoStyle[3];

      let styleContent = "";

      // style for neutral stuff
      if (decoStyle === "neutral") {
        styleContent = `
  div[data-path='${this.escapeSelector(
    cleanPath
  )}'] .nav-file-title-content::after,
  div[data-path='${this.escapeSelector(
    cleanPath
  )}'] .nav-folder-title-content::after {
  content: " ${neutralSymbol}" !important;
  --nav-item-color: ${
    neutralStyle.includes("high") ? "var(--text-muted)" : "var(--text-faint)"
  } !important;
  color: ${
    neutralStyle.includes("high") ? "var(--text-muted)" : "var(--text-faint)"
  } !important;
  opacity: 1;
  font-size: ${neutralStyle.includes("large") ? "1.2em" : "1em"} !important;
  font-family: monospace !important;
  vertical-align: middle !important;
  }
  `;
      }
      // Style for unsynced stuff
      if (decoStyle === "unsynced") {
        styleContent = `
  div[data-path='${this.escapeSelector(
    cleanPath
  )}'] .nav-file-title-content::after,
  div[data-path='${this.escapeSelector(
    cleanPath
  )}'] .nav-folder-title-content::after {
  content: " ${unsyncedSymbol}" !important;
  --nav-item-color: var(--color-accent) !important;
  color: var(--color-accent) !important;
  opacity: ${unsyncedStyle.includes("high") ? "1" : "0.6"} !important;
  font-size: ${unsyncedStyle.includes("large") ? "1.2em" : "1em"} !important;
  font-family: monospace !important; // prevents emojis
  vertical-align: middle !important;
  }
  `;
      }
      style.textContent = styleContent;
      document.head.appendChild(style);
    };

    // -------- THE LOGIC -----------------
    // handle general paths
    const handledPaths: { [key: string]: boolean } = {};
    let flowArray: string[] = [];

    // if we redo, we need all flows, else we just need the active ones
    if (mode === "redo") {
      flowArray = Object.keys(this.settings.flows);
    } else {
      flowArray = Object.keys(this.settings.activeFlowObject);
    }

    for (let flowName of flowArray) {
      // get the file list
      let key = this.settings.flows[flowName].flowRecipe.bookmarks
        ? "bookmarks"
        : "foldersTagsProps";

      for (path of this.settings.flows[flowName].flowRecipe[key]) {
        // exclude folder titles
        if (path.startsWith("#")) continue;

        // and we only need to do this if we redo the whole shebang
        if (mode === "redo") {
          // if we're handling a flow that is active, track the path
          if (this.settings.activeFlowObject[flowName]) {
            handledPaths[path] = true;
          }
          // if we're handling a non-active flow, protect the known active paths
          if (!this.settings.activeFlowObject[flowName]) {
            if (handledPaths[path]) continue;
            decoStyle = "none";
            handlePath(path, decoStyle as Types.DecoStyle);
            continue;
          }
        }
        // handle the path
        if (
          this.settings.activeFlowObject[flowName] &&
          !this.settings.flows[flowName].unsyncedRegionsArray.includes(path)
        ) {
          decoStyle = "neutral";
          handlePath(path, decoStyle as Types.DecoStyle);
        } else {
          unsyncedPathsArray.push(path);
        }
      }
    }

    // handle unsynced paths - null handled paths array
    // because we may need to override some general styles
    for (path of unsyncedPathsArray) {
      decoStyle = "unsynced";
      handlePath(path, decoStyle as Types.DecoStyle);
    }
  };

  //^CHECKED AND TESTED

  // removing all styles on deactivation
  //CHECKED AND TESTED
  unDecorateSourceNotes = async () => {
    if (this.settings.showExplorerDeco) return;
    let path = "";
    let handledPathsArray: string[] = [];

    type DecoStyle = "neutral" | "unsynced" | "none";
    // ------ all the helper functions used -------
    const handlePath = (path: string) => {
      let successivePath = "";
      for (let fragment of path.split("/")) {
        if (!fragment.endsWith(".md")) {
          successivePath += `${fragment}/`;
        } else {
          successivePath += fragment;
        }
        if (!handledPathsArray.includes(successivePath)) {
          handledPathsArray.push(successivePath);
          updateStyles(successivePath);
        }
      }
    };

    const updateStyles = (path: string) => {
      // Remove trailing slash for files (if it exists)
      const cleanPath = path.endsWith("/") ? path.slice(0, -1) : path;

      // First remove any existing styles for this path
      const existingStyles = document.head.querySelectorAll(
        "style[data-textflow-neutral], style[data-textflow-unsynced]"
      );
      existingStyles.forEach((style) => {
        const styleContent = style.textContent || "";
        // Only remove if it's for this specific path
        if (
          styleContent.includes(`data-path='${this.escapeSelector(cleanPath)}'`)
        ) {
          style.remove();
        }
      });
    };

    // -------- THE LOGIC -----------------
    const handledPaths: { [key: string]: boolean } = {};
    Object.keys(this.settings.flows).forEach((flowName) => {
      // get the file list
      let key = this.settings.flows[flowName].flowRecipe.bookmarks
        ? "bookmarks"
        : "foldersTagsProps";

      for (path of this.settings.flows[flowName].flowRecipe[key]) {
        // exclude folder titles
        if (path.startsWith("#")) continue;
        handlePath(path);
        continue;
      }
    });
  };

  //^CHECKED AND TESTED

  //------ function to clean up paths for CSS handling; used by deco function
  //CHECKED AND TESTED
  escapeSelector = (str: string): string => {
    // Escape special characters that have meaning in CSS selectors
    return (
      str
        .replace(/["'&,.*+?^${}()|[\]\\]/g, "\\$&")
        // Handle spaces
        .replace(/\s/g, "\\ ")
    );
  };
  //^CHECKED AND TESTED

  // ---------------- Functions: Listeners -------------------------

  // ---------------- Functions: Listeners: Global -----------------
  addListeners() {
    // ---------------- File modification -------------------------------
    // This event fires whenever any file in the vault is modified
    // the textFlowOperation flag prevents a doom spiral
    //CHECKED AND TESTED

    this.registerEvent(
      this.app.vault.on("modify", (file: TAbstractFile) => {
        if (this.textFlowOperation) return;

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
      })
    );
    //^CHECKED AND TESTED

    // Rename events
    //CHECKED AND TESTED
    this.registerEvent(
      this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
        let parentFolder = normalizePath(dirname(file.path));
        if (file instanceof TFolder) {
          parentFolder = file.path;
        }

        let oldParentFolder = normalizePath(dirname(oldPath));
        if (file instanceof TFolder) {
          oldParentFolder = file.path;
        }

        // check if they renamed the system folder (check if old path is identical)
        if (this.settings.systemFolderPath === normalizePath(oldPath)) {
          if (
            // but basename differs
            normalizePath(basename(this.settings.systemFolderPath)) !=
            normalizePath(basename(file.path))
          )
            new Notice(
              "textFlow: Please don't rename the system folder. You can hide it in settings."
            );
          return;
        }

        // check if the user renamed a flow
        Object.keys(this.settings.flows).forEach(async (flowName) => {
          if (
            this.settings.flows[flowName].flowFilePath ===
            normalizePath(oldPath)
          ) {
            new Notice(
              `textFlow: Please use textFlow settings to rename flows / the export function to get them out of the system folder.\n` +
                `If you moved the TextFlow_SystemFolder manually, please reload your vault to restore proper syncing.`,
              0
            );
            const flowFile = this.app.vault.getAbstractFileByPath(file.path);
            if (flowFile) {
              if (flowFile instanceof TFile) {
                this.textFlowOperation = true;
                await this.app.vault.rename(flowFile, oldPath);
                this.textFlowOperation = false;
                new Notice("textFlow: Old file name/path has been restored.");
              }
            }
            return;
          }
        });

        // Check if the user moved the system folder
        if (this.settings.systemFolderPath === normalizePath(oldPath)) {
          // update system folder data
          this.ensureSystemFolder();
        }

        const continuableCheckPaths = Object.keys(this.settings.flows);
        for (let flowName of continuableCheckPaths) {
          if (this.settings.flows[flowName].flaggedForRebuild) continue;

          // if the flow contained the old path, flag and move on
          if (this.settings.flows[flowName].flowMap[oldPath]) {
            this.settings.flows[flowName].flaggedForRebuild = true;
            this.saveSettings();
            continue;
          }
          // if the parent is included
          if (
            parentFolder ===
            this.settings.flows[flowName].flowCookbook.folderIncluded
          ) {
            this.settings.flows[flowName].flaggedForRebuild = true;
            this.saveSettings();
            continue;
          }
          if (
            // if the path starts with inclusion path and subfolders aren't excluded
            parentFolder.startsWith(
              this.settings.flows[flowName].flowCookbook.folderIncluded + "/"
            ) &&
            !this.settings.flows[flowName].flowCookbook.folderIncluded.endsWith(
              "/"
            )
          ) {
            // if the exclusion criterion isn't empty
            if (this.settings.flows[flowName].flowCookbook.folderExcluded) {
              const exclusionArray =
                this.settings.flows[flowName].flowCookbook.folderExcluded.split(
                  ","
                );
              const isExcluded = exclusionArray.some((path) =>
                parentFolder.includes(path.trim() + "/")
              );
              if (isExcluded) continue;
            }
            this.settings.flows[flowName].flaggedForRebuild = true;
            this.saveSettings();
            continue;
          }
        }
      })
    );
    //^CHECKED AND TESTED

    // Create events
    //CHECKED AND TESTED
    this.registerEvent(
      this.app.vault.on("create", (file: TAbstractFile) => {
        if (this.isLoading) return;

        let parentFolder = normalizePath(dirname(file.path));
        if (file instanceof TFolder) {
          parentFolder = normalizePath(file.path);
        }

        if (parentFolder.contains(TEXTFLOW_SYSTEMFOLDER)) {
          new Notice(
            "textFlow: You just created a new element in the system folder. Please move it somewhere else."
          );
          this.ensureSystemFolder();
          return;
        }

        const continuableCheckPaths = Object.keys(this.settings.flows);
        for (let flowName of continuableCheckPaths) {
          if (this.settings.flows[flowName].flaggedForRebuild) continue;
          // if the flow is made from bookmarks, move on
          if (this.settings.flows[flowName].flowRecipe.bookmarks) continue;

          // if the parent folder is included
          if (
            parentFolder ===
            this.settings.flows[flowName].flowCookbook.folderIncluded
          ) {
            this.settings.flows[flowName].flaggedForRebuild = true;
            this.saveSettings();
            continue;
          }
          if (
            // if the path starts with inclusion path, subfolders aren't excluded
            parentFolder.startsWith(
              this.settings.flows[flowName].flowCookbook.folderIncluded + "/"
            ) &&
            !this.settings.flows[flowName].flowCookbook.folderIncluded.endsWith(
              "/"
            )
          ) {
            if (this.settings.flows[flowName].flowCookbook.folderExcluded) {
              const exclusionArray =
                this.settings.flows[flowName].flowCookbook.folderExcluded.split(
                  ","
                );
              const isExcluded = exclusionArray.some((path) =>
                parentFolder.includes(path.trim() + "/")
              );
              if (isExcluded) continue;
            }
            this.settings.flows[flowName].flaggedForRebuild = true;
            this.saveSettings();
            continue;
          }
        }
      })
    );
    //^CHECKED AND TESTED

    // Delete events
    //CHECKED AND TESTED
    this.registerEvent(
      this.app.vault.on("delete", (file: TAbstractFile) => {
        let parentFolder = normalizePath(dirname(file.path));
        if (file instanceof TFolder) {
          parentFolder = normalizePath(file.path);
        }

        if (parentFolder.contains(TEXTFLOW_SYSTEMFOLDER)) {
          this.ensureSystemFolder();
          return;
        }

        if (file instanceof TFile) {
          const continuableCheckPaths = Object.keys(this.settings.flows);
          for (let flowName of continuableCheckPaths) {
            if (
              !this.settings.flows[flowName].flaggedForRebuild &&
              this.settings.flows[flowName].flowMap[normalizePath(file.path)]
            ) {
              this.settings.flows[flowName].flaggedForRebuild = true;
              this.saveSettings();
              continue;
            }
          }
        }
      })
    );
    //^CHECKED AND TESTED

    //CHECKED AND TESTED
    // ----------------- Auto-sync on blur  -------------------------------
    this.registerDomEvent(window, "blur", async () => {
      await this.syncAllLeaves();
    });
    //^CHECKED AND TESTED

    // -- LEAF CHANGE - Call management for flow, source and vanilla notes ------
    // setup functions take care of the details
    //CHECKED AND TESTED
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", async (leaf) => {
        // so we skip if the explorerClickListener is already taking care of stuff
        if (this.explorerClickListenerActive) {
          return;
        }

        if (leaf?.view instanceof MarkdownView) {
          const view = leaf.view;
          const activeLeafPath = leaf.view.file?.path;
          if (activeLeafPath) {
            // if active leaf is flow, set it up
            const isFlow = this.isFlowFile(activeLeafPath);
            if (isFlow) {
              await this.setupFlowView(isFlow, leaf.view);
              this.mostRecentActiveFlowLeaf = leaf;
              return;
            }
            // otherwise strip the flow stuff
            this.closeFlow(view);
          }
        }
      })
    );
    //^CHECKED AND TESTED

    // catch if only an empty leaf remains
    //CHECKED AND TESTED
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        if (this.app.workspace.getLeavesOfType("markdown").length === 0) {
          // We're definitely in the "empty leaf" state
          this.manageActiveFlowObject();
        }
      })
    );
  }
  //^CHECKED AND TESTED

  //CHECKED AND TESTED

  // ---------------- Functions: Listeners: Individual ----------
  // a little object to keep track of stuff
  listenerBasket: { [key: string]: ListenerBasketItem } = {};

  // This listener is used to track the active region
  private addCursorListener = (view: MarkdownView | null) => {
    if (!view) {
      return;
    }
    const leafID: number = (view.leaf as any).id;
    if (!leafID) return;

    if (this.listenerBasket[leafID]) {
      return;
    }

    const activeLeafPath = view.file?.path;
    if (!activeLeafPath) return;

    const flowName = this.isFlowFile(activeLeafPath);
    if (!flowName) {
      this.removeCursorListener(view);
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

    // ---------- actual listener stuff

    const plugin = this;
    let lastCursorPosition: number | null = null;
    let debounceTimeout: NodeJS.Timeout | null = null;

    const navigationListener = ViewPlugin.fromClass(
      class {
        constructor(view: EditorView) {}

        update(update: ViewUpdate) {
          if (!update.selectionSet) return;

          const cursorOffset = update.state.selection.main.from;

          if (cursorOffset !== lastCursorPosition) {
            lastCursorPosition = cursorOffset;

            if (debounceTimeout) {
              clearTimeout(debounceTimeout);
            }

            debounceTimeout = setTimeout(() => {
              if (!plugin.settings.flows[flowName]) {
                throw new Error(`Flow ${flowName} not found in settings`);
              }
              // this sets off a chain of functions which updates the active Region
              plugin.checkActiveRegion(
                plugin.settings.flows[flowName],
                leafID,
                cursorOffset,
                view
              );
            }, 250);
          }
        }

        destroy() {
          if (debounceTimeout) {
            clearTimeout(debounceTimeout);
          }
          delete plugin.listenerBasket[leafID];
        }
      }
    );

    try {
      const extension = StateEffect.appendConfig.of([navigationListener]);

      this.listenerBasket[leafID] = {
        extension: navigationListener,
      };

      cmEditor.dispatch({
        effects: extension,
      });
    } catch (error) {
      delete this.listenerBasket[leafID];
      new Notice(
        "textFlow:\n " +
          `Cursor tracking failed for ${flowName}!\n` +
          "Please close and reopen the flow.\n" +
          "If this error persists, reload your vault.",
        20000 // Show for 5 seconds
      );
    }
  };
  //^CHECKED AND TESTED

  //CHECKED AND TESTED
  // ---------------------------------------------------------
  removeCursorListener = (view: MarkdownView) => {
    const leafID = (view.leaf as any).id;
    if (!leafID) return;
    if (!this.listenerBasket[leafID]) return;

    const editor = view.editor as ObsidianEditor;
    const cmEditor = editor.cm;
    if (!cmEditor) return;

    // Remove the listener
    const { extension } = this.listenerBasket[leafID];
    cmEditor.dispatch({
      effects: StateEffect.reconfigure.of([extension]),
    });
    delete this.listenerBasket[leafID];
  };
  //^CHECKED AND TESTED

  //CHECKED AND TESTED
  // -----------------
  private addTextChangeListener = (view: MarkdownView | null) => {
    if (!view) return;

    const leafID: number = (view.leaf as any).id;
    if (!leafID) return;

    if (this.listenerBasket[`${leafID}-changes`]) {
      return;
    }

    const activeLeafPath = view.file?.path;
    if (!activeLeafPath) return;

    const flowName = this.isFlowFile(activeLeafPath);
    if (!flowName) {
      this.removeTextChangeListener(view);
      return;
    }

    const editor = view?.editor as ObsidianEditor;
    if (!editor) return;

    const cmEditor = editor.cm;
    if (!cmEditor) return;

    // ---------- actual listener stuff

    const plugin = this;
    let debounceTimeout: NodeJS.Timeout | null = null;

    const changeListener = ViewPlugin.fromClass(
      class {
        constructor(view: EditorView) {}

        update(update: ViewUpdate) {
          if (!update.docChanged) return;

          const changes = update.changes;

          // return if no actual text change has taken place
          if (changes.empty) return;

          if (debounceTimeout) {
            clearTimeout(debounceTimeout);
          }

          debounceTimeout = setTimeout(() => {
            // Prevent rebuild frong registering as text change
            if (plugin.settings.flows[flowName].isFreshBuild) {
              plugin.settings.flows[flowName].isFreshBuild = false;
              return;
            }

            // Ensure that active region for the leaf is of type 'file'
            if (!plugin.settings.flows[flowName].activeRegions) return;
            if (!plugin.settings.flows[flowName].activeRegions[leafID]) return;
            if (
              plugin.settings.flows[flowName].activeRegions[leafID].type !=
              "file"
            )
              return;

            const activeRegionPath =
              plugin.settings.flows[flowName].activeRegions[leafID].path;
            if (!activeRegionPath) return;

            if (
              !plugin.settings.flows[flowName].unsyncedRegionsArray.includes(
                activeRegionPath
              )
            ) {
              // Add to unsynced array
              plugin.settings.flows[flowName].unsyncedRegionsArray.push(
                activeRegionPath
              );
              plugin.saveSettings();

              // update the menu bar to show unsynced status
              if (view.menuBar) {
                view.menuBar.refresh(view.contentEl);
              }

              // update source decoration
              if (plugin.settings.showExplorerDeco) {
                plugin.decorateSourceNotes("update");
              }
            }
          }, 250);
        }

        destroy() {
          try {
            if (debounceTimeout) {
              clearTimeout(debounceTimeout);
            }
            delete plugin.listenerBasket[`${leafID}-changes`];
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

      this.listenerBasket[`${leafID}-changes`] = {
        extension: changeListener,
      };

      cmEditor.dispatch({
        effects: extension,
      });
    } catch (error) {
      if (activeLeafPath) {
        delete this.listenerBasket[`${leafID}-changes`];
      }
      new Notice(
        "textFlow Plugin: Error setting up change tracking.\n" +
          "Please report this issue on github.",
        10000
      );
    }
  };
  //^CHECKED AND TESTED

  //CHECKED AND TESTED
  //---------------
  removeTextChangeListener = (view: MarkdownView) => {
    const leafID = (view.leaf as any).id;
    if (!leafID) return;
    if (!this.listenerBasket[`${leafID}-changes`]) return;

    const editor = view.editor as ObsidianEditor;
    const cmEditor = editor.cm;
    if (!cmEditor) return;

    // Remove the listener
    const { extension } = this.listenerBasket[`${leafID}-changes`];

    cmEditor.dispatch({
      effects: StateEffect.reconfigure.of([extension]),
    });

    delete this.listenerBasket[`${leafID}-changes`];
  };
  //^CHECKED AND TESTED

  //CHECKED AND TESTED
  // -------- helper for the fileExplorerClickListener
  // Are we even clicking into the file explorer?
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
  //^CHECKED AND TESTED

  //CHECKED AND TESTED
  // ---- This listener is for navigating flows via the file explorer
  // it is removed onunload. It's also a nervous steed, so just admire it from afar.
  private boundFileExplorerClick: (event: MouseEvent) => void;

  fileExplorerOpenClickListener() {
    this.boundFileExplorerClick = async (event: MouseEvent) => {
      if (!this.settings.explorerListener) {
        return;
      }

      if (!this.isFileExplorerClick(event)) {
        return;
      }

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

      // I don't remember why I did this, but it's not increasing complexity so let's just keep it
      const activeFlowObjectSnapshot = this.settings.activeFlowObject;

      // check if the user likely isn't trying to open a file with their click
      // it doesn't do much, though.
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

      const flowName = this.isFlowFile(clickedFilePath);
      if (flowName) {
        clickHandled = true;
        this.explorerClickListenerActive = true;

        if (noteIsOpen && noteIsOpen.view instanceof MarkdownView) {
          // Flow is already open, just set it up
          await this.setupFlowView(flowName, noteIsOpen.view);
          this.app.workspace.setActiveLeaf(noteIsOpen.view.leaf, {
            focus: true,
          });
        } else {
          await this.activateFlow(flowName);
        }

        // Delay to allow UI to settle
        setTimeout(() => {
          this.explorerClickListenerActive = false;
        }, 100);
      } else {
        // If it's not a flow file, check if it's a source file of an active flow
        // and gather info on it
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

        // handle the source note
        if (parentFlowName && flowSettings && isOfActiveFlow) {
          clickHandled = true;
          this.explorerClickListenerActive = true; // Set before any async operations

          try {
            const flowFilePath = flowSettings.flowFilePath;

            let flowLeaf;

            // Check if the most recently active flow leaf matches our target
            if (
              this.mostRecentActiveFlowLeaf?.view instanceof MarkdownView &&
              (this.mostRecentActiveFlowLeaf.view as MarkdownView).file
                ?.path === flowFilePath
            ) {
              flowLeaf = this.mostRecentActiveFlowLeaf;
            } else {
              // Find the next best leaf with our flow
              flowLeaf = leaves.find(
                (leaf) =>
                  leaf.view instanceof MarkdownView &&
                  leaf.view.file?.path === flowFilePath
              );
            }

            // if there's no leaf with our flow, make one
            if (!flowLeaf || !(flowLeaf.view instanceof MarkdownView)) {
              await this.activateFlow(parentFlowName);
              flowLeaf = this.app.workspace
                .getLeavesOfType("markdown")
                .find(
                  (leaf) =>
                    leaf.view instanceof MarkdownView &&
                    (leaf.view as MarkdownView).file?.path === flowFilePath
                );

              // if we couldn't set up the leaf for some reason, bow out
              if (!flowLeaf || !(flowLeaf.view instanceof MarkdownView)) {
                return;
              }
            }

            // but if we got the leaf set up, let's focus it
            this.app.workspace.setActiveLeaf(flowLeaf, { focus: true });

            // Delay so dust can settle
            await new Promise((resolve) => setTimeout(resolve, 150)); // 150ms, adjust if needed

            // Now prepare for the scrolling
            const flowView = flowLeaf.view as MarkdownView;
            const editor = flowView.editor as ObsidianEditor;
            const cmEditor = editor.cm;

            if (!cmEditor) {
              return;
            }

            // Make sure the active leaf is still our target flow leaf
            const currentActiveLeaf =
              this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf;
            if (currentActiveLeaf !== flowLeaf) {
              // if not, yank it back into focus
              console.warn(
                "TextFlow: Active leaf changed unexpectedly. Forcing it back to flow leaf before scrolling."
              );
              this.app.workspace.setActiveLeaf(flowLeaf, { focus: true });
              await new Promise((resolve) => setTimeout(resolve, 50));
            }

            // get all the info we need
            const flowDocumentText = cmEditor.state.doc.toString();
            const regionFlowOrder =
              flowSettings.flowMap[clickedFilePath].flowOrder;
            const startPosInFlow = this.findStartOfRegion(
              flowSettings,
              regionFlowOrder,
              flowDocumentText
            );

            // make sure info is good
            if (startPosInFlow !== undefined && startPosInFlow >= 0) {
              const line = cmEditor.state.doc.lineAt(
                Math.max(0, startPosInFlow)
              );
              const targetPos = line.from;
              // scroll
              cmEditor.dispatch({
                selection: { anchor: targetPos, head: targetPos },
                effects: EditorView.scrollIntoView(targetPos, {
                  y: "center",
                  yMargin: 10,
                }),
                userEvent: "select.pointer",
              });
              // focus
              cmEditor.focus();
            }
          } catch (err) {
            console.error(
              `TextFlow: Error during source file handling for ${clickedFilePath} in flow ${parentFlowName}:`,
              err
            );
          } finally {
            setTimeout(() => {
              this.explorerClickListenerActive = false;
            }, 300);
          }
        }
      }

      // Fallback for files not handled as flows or source files by our logic
      if (!clickHandled) {
        this.explorerClickListenerActive = false; // Ensure this is false for regular note opening
        if (noteIsOpen) {
          this.app.workspace.setActiveLeaf(noteIsOpen, { focus: true });
        } else {
          // Since we prevented the default, we must roleplay it now
          const openInNewSplit =
            this.app.workspace.getLeavesOfType("markdown").length > 0 &&
            (event.metaKey || event.ctrlKey);
          this.app.workspace.openLinkText(clickedFilePath, "", openInNewSplit);
        }
      }
    };
  }
  //^CHECKED AND TESTED

  // ---------------- Functions: Flow management and UI -------------------------
  // ---- Identity check
  //CHECKED AND TESTED
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
  //^CHECKED AND TESTED

  // The big bundle that centralises flow management
  async setupFlowView(flowName: string, view: MarkdownView) {
    const leafID = (view.leaf as any).id;
    let editor = view.editor as any;

    console.log("setting up flow");
    // this has to happen first so the menuBar can just be set up
    await this.manageActiveFlowObject();

    // add this so we can safely rebuild
    this.addWriteProtection(view, "sync");

    if (this.settings.flows[flowName].flaggedForRebuild) {
      this.toggleEditable(view, false);
      await this.flowService.rebuildFlow(flowName, "setupFlowView");
      this.toggleEditable(view, true);
    }
    // now do the menu bar
    this.setupMenuBar(view, flowName);

    // set up the editor with its other extensions and listeners
    this.addWriteProtection(view, "divider");
    this.addCursorListener(view);
    this.addTextChangeListener(view);

    // Update the switcher modal
    if (this.modalUpdateCallback) {
      this.modalUpdateCallback();
    }

    // check scroll bar visibility
    this.flowService.updateScrollbarVisibility();

    // put the cursor back to its last known location
    this.restoreCursorPos(flowName, view, leafID);

    // Do a blanket refresh of all the menu bars involved with the flow
    const allLeaves = this.app.workspace.getLeavesOfType("markdown");
    for (const leaf of allLeaves) {
      const view = leaf.view as MarkdownView;

      const filePath = view.file?.path;
      if (!filePath) continue;

      const otherFlowName = this.isFlowFile(filePath);
      if (!otherFlowName || otherFlowName != flowName) continue;

      view.menuBar?.refresh(view.contentEl);
    }
  }
  //^CHECKED AND TESTED

  //CHECKED AND TESTED
  // ---- handle menuBar setup
  setupMenuBar = (view: MarkdownView, flowName: string) => {
    let menuBar: MenuBar;
    // If we got one, check if it belongs to the flow
    if (view.menuBar) {
      if ((view.menuBar as MenuBar).getFlowName() != flowName) {
        view.menuBar.detach();
        delete view.menuBar;
      }
    }
    // not in an else because it also needs to catch when we delete the menu bar
    if (!view.menuBar) {
      menuBar = new MenuBar(this.app, this, flowName, view);
      menuBar.attach(view.contentEl);
      view.menuBar = menuBar;
    }
    view.menuBar.refresh(view.contentEl);
  };
  //^CHECKED AND TESTED

  //CHECKED AND TESTED
  // mostly here to handle uninitialised leaves
  refreshMenuBars = async () => {
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    for (let leaf of leaves) {
      const view = leaf.view as MarkdownView;
      const filePath = view.file?.path;
      if (!filePath) continue;

      const flowName = this.isFlowFile(filePath);
      if (!flowName) continue;

      const leafID = (leaf as any).id;

      // check if leaf is properly initialised
      if (!(leaf instanceof MarkdownView)) {
        // reopen note if it's not
        const flowFile = this.app.vault.getAbstractFileByPath(filePath);
        if (flowFile instanceof TFile) {
          await leaf.openFile(flowFile);
        }
      }
      // then refresh
      if (view.menuBar) {
        view.menuBar.refresh(view.contentEl);
      }
    }
  };
  //^CHECKED AND TESTED

  //CHECKED AND TESTED
  // ---- Make sure flows are set up when they are activated
  async activateFlow(flowName: string) {
    const flow = this.settings.flows[flowName];
    if (!flow) {
      new Notice(`textFlow: No flow with name ${flowName} found.`, 10000);
      return;
    }
    // Get the file
    const flowFile = this.app.vault.getAbstractFileByPath(flow.flowFilePath);

    if (flowFile instanceof TFile) {
      // make a leaf and put the file into it
      const leaf = this.app.workspace.getLeaf("tab"); // Prefer opening in a new split if creating
      await leaf.openFile(flowFile);

      // now set it up and focus it
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
        `textFlow: Flow file not found: ${flow.flowFilePath}\n` +
          `Try clicking the 'Move' button for the TextFlow_SystemFolder location.`,
        10000
      );
    }
  }
  //^CHECKED AND TESTED

  //CHECKED AND TESTED
  // ------------- Used by flowSwitcherModal -----------
  manageActiveFlowObject = async () => {
    // track all leaves
    const foundFlowLeaves: Record<string, Set<string>> = {};

    this.app.workspace.iterateAllLeaves((leaf) => {
      // get info for all leaves' contents, initalised or not
      const leafViewState = leaf.getViewState();
      if (leafViewState.type === "markdown" && leafViewState.state?.file) {
        const leafID = (leaf as any).id;
        const leafPath = leafViewState.state?.file;
        if (typeof leafPath != "string") return; // behaves like 'continue' in this callback

        const flowName = this.isFlowFile(leafPath);
        if (flowName) {
          // get leaves per flow
          if (!foundFlowLeaves[flowName]) {
            foundFlowLeaves[flowName] = new Set();
          }
          foundFlowLeaves[flowName].add(leafID);

          // Ensure the activeFlowObject exists
          if (!this.settings.activeFlowObject[flowName]) {
            this.settings.activeFlowObject[flowName] = {};
          }
          this.settings.activeFlowObject[flowName][leafID] = true;

          // Then add region tracking for newly opened leaves
          if (!this.settings.flows[flowName].activeRegions) {
            this.settings.flows[flowName].activeRegions = {};
          }
          if (!this.settings.flows[flowName].activeRegions[leafID]) {
            this.addRegionTracking(flowName, leafID);
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
                  this.settings.flows[flowName].unsyncedRegionsArray.length > 0
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
                    this.syncBackToSource(flowName, text, leafID);
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
        // And now update all decoration and refresh the menu bars
        this.decorateSourceNotes("redo");
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
    });
    await this.saveSettings();
  };
  //^CHECKED AND TESTED

  //CHECKED AND TESTED
  // ----- add region tracking for new leafs, because we get errors if we don't
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
  //^CHECKED AND TESTED

  // CHECKED AND TESTED
  // if a flow is replaced by a non-flow
  closeFlow = async (view: MarkdownView) => {
    await this.syncAllLeaves();
    this.removeCursorListener(view);
    this.removeTextChangeListener(view);
    this.cleanupMenuBar(view.leaf);
    this.manageActiveFlowObject();
    if (view.menuBar) {
      view.menuBar.detach();
    }
    // reveal scrollbar
    this.flowService.updateScrollbarVisibility();

    const leafId = (view.leaf as any).id;
    if (this.editableCompartments?.[leafId]) {
      delete this.editableCompartments[leafId];
    }

    this.saveSettings();
  };
  // ^CHECKED AND TESTED

  // ---- Functions: Data safety ----------------------------

  // ---- Functions: Data safety: Read-only for dividers and during sync
  private editableCompartments: { [key: string]: [Compartment, boolean] } = {};
  // CHECKED AND TESTED
  addWriteProtection = (
    view: MarkdownView,
    protectionType: Types.ProtectionType
  ) => {
    const editor = view.editor as any;
    const leafId = (view.leaf as any).id;

    if (!editor.cm) {
      console.log("no editor");
      return;
    }

    if (protectionType === "sync") {
      // create new compartment
      const protectSyncCompartment = new Compartment();
      // store compartment so we can reuse it to toggle on/off
      this.editableCompartments[leafId] = [protectSyncCompartment, true];

      // Initialize
      editor.cm.dispatch({
        effects: StateEffect.appendConfig.of([
          protectSyncCompartment.of(
            this.preventEdit(this.editableCompartments, leafId)
          ),
        ]),
      });
    }

    if (protectionType === "divider") {
      // this needs to be full-on transaction filter because a domEventHandler
      // can be deleted into
      const preventEdit = EditorState.transactionFilter.of((tr) => {
        // if the flow is being rebuilt, we need to suspend protection
        // otherwise the editor contents can't be updated
        if (this.isRebuilding) return tr;

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
            return [];
          }
        }
        return tr;
      });

      // Create new compartment
      const protectDividerCompartment = new Compartment();
      // Initialize
      editor.cm.dispatch({
        effects: StateEffect.appendConfig.of([
          protectDividerCompartment.of([preventEdit]),
        ]),
      });
    }
  };
  // ^CHECKED AND TESTED

  // the function that builds the preventDefault configuration for the
  // sync (and mostly rebuild) writelock
  // CHECKED AND TESTED
  preventEdit = (
    editableCompartments: { [key: string]: [Compartment, boolean] },
    leafID: string
  ): Extension => {
    return EditorView.domEventHandlers({
      beforeinput(event) {
        const isEditable = editableCompartments[leafID]?.[1];
        if (isEditable === false) {
          event.preventDefault(); // Blocks all user input
        }
      },
    });
  };
  // ^CHECKED AND TESTED

  // toggle the sync protection by reconfiguring the compartment
  // CHECKED AND TESTED
  toggleEditable = (view: MarkdownView, editable: boolean) => {
    const editor = view.editor as any;

    const leafId = (view.leaf as any).id;
    if (!this.editableCompartments[leafId]) return;
    this.editableCompartments[leafId][1] = editable;
    const compartment = this.editableCompartments[leafId][0];

    if (compartment) {
      editor.cm.dispatch({
        effects: compartment.reconfigure([
          this.preventEdit(this.editableCompartments, leafId),
        ]),
      });
    }
  };
  // ^CHECKED AND TESTED

  // CHECKED AND TESTED
  // Sync all leaves
  syncAllLeaves = async () => {
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
    // Perform syncs
    this.textFlowOperation = true; // suspends modify listener

    await Promise.all(
      Object.entries(flowLeaves).map(async ([flowName, view]) => {
        const text = view.editor.getValue();
        const leafID = (view.leaf as any).id;
        await this.toggleEditable(view, false); // block all user edits
        await this.syncBackToSource(flowName, text, leafID);
        await this.toggleEditable(view, true);
      })
    );
    this.refreshMenuBars();
    this.textFlowOperation = false; // unsuspends modify listener
  };
  // ^CHECKED AND TESTED

  // CHECKED AND TESTED
  //---- The actual sync function -------------
  syncBackToSource = async (flowName: string, text: string, leafID: string) => {
    if (this.settings.flows[flowName].unsyncedRegionsArray) {
      const map = this.settings.flows[flowName].flowMap;
      const remainingPaths: string[] = [];
      if (this.settings.flows[flowName].unsyncedRegionsArray.length > 0) {
        for (const path of this.settings.flows[flowName].unsyncedRegionsArray) {
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

              // sync modified content
              await this.app.vault.modify(sourceFile, newContent);
            } catch (error) {
              remainingPaths.push(path);
              new Notice(
                `textFlow: An error occurred while trying to sync to ${path}. Please try again in a second. If the error persists, consult the 'Fixing problems' section of the readme.`
              );

              // console.error(`Failed to sync changes to ${file.path}:`, error);
              throw error;
            }
          }
        }
      }
      this.settings.flows[flowName].unsyncedRegionsArray = remainingPaths;

      this.manageCursorPos(flowName, leafID);
      this.saveSettings();
      if (this.settings.showExplorerDeco) {
        this.decorateSourceNotes("update");
      }
    }
  };

  // ^CHECKED AND TESTED

  //CHECKED AND TESTED
  // ------ Functions: Manage persistent cursor position
  manageCursorPos = (flowName: string, leafID: string) => {
    if (this.settings.flows[flowName].activeRegions) {
      const currentLeaf = this.settings.flows[flowName].activeRegions?.[leafID];

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
        this.settings.flows[flowName].persistentCursors[leafID] = {
          leafContent: `${flowName} (${leafID.slice(0, 5)})`,
          update: Date.now(),
          cursors: [[regionPath, currentCursor]],
        };
        const leaves = Object.entries(
          this.settings.flows[flowName].persistentCursors
        );
        if (leaves.length > 5) {
          // cap at five entries
          // by finding the leaf with the oldest timestamp using forbidden magic
          const [oldestLeafId] = leaves.reduce((oldest, current) => {
            return current[1].update < oldest[1].update ? current : oldest;
          });
          delete this.settings.flows[flowName].persistentCursors[oldestLeafId];
        }
        return;
      }

      // Check if there's already an entry for the leaf and region and delete if present
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

      // Cap at five entries
      if (
        this.settings.flows[flowName].persistentCursors[leafID].cursors.length >
        5
      ) {
        this.settings.flows[flowName].persistentCursors[leafID].cursors.pop();
      }
    }
  };

  //^CHECKED AND TESTED

  //CHECKED AND TESTED
  // -------- Restore cursorPos for known and unknown leafIDs
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
    } else {
      // get the most recent time stamp for the active flow
      const timestampArray: number[] = [];
      if (
        Object.keys(this.settings.flows[flowName].persistentCursors).length > 0
      ) {
        Object.keys(this.settings.flows[flowName].persistentCursors).forEach(
          (leafID) => {
            timestampArray.push(
              this.settings.flows[flowName].persistentCursors[leafID].update
            );
          }
        );

        // sort the timestamps in reverse order so newest timestamp comes first
        timestampArray.sort((a, b) => b - a);

        const mostRecentTimestamp: number = timestampArray[0];
        let mostRecentCursor: number = 0;
        if (this.settings.flows[flowName].persistentCursors) {
          Object.keys(this.settings.flows[flowName].persistentCursors).forEach(
            (leafID) => {
              if (
                this.settings.flows[flowName].persistentCursors[leafID]
                  .update === mostRecentTimestamp
              ) {
                mostRecentCursor =
                  this.settings.flows[flowName].persistentCursors[leafID]
                    .cursors[0][1];
              }
            }
          );
        }

        const editor = view.editor as ObsidianEditor;
        mostRecentCursor
          ? this.flowService.scrollToPos(editor, mostRecentCursor)
          : "";
      }
    }
  };
  //^CHECKED AND TESTED

  //CHECKED AND TESTED
  // --------------- Functions: Flow management: Regions -----------------------------------------
  private checkActiveRegion = async (
    flow: Types.FlowDef,
    leafID: number,
    cursorOffset: number,
    view: MarkdownView
  ) => {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      return;
    }

    const editor = activeView.editor as ObsidianEditor;
    const cmEditor = editor.cm;
    if (!cmEditor) {
      return;
    }

    // Get full document text from CodeMirror state
    const text = cmEditor.state.doc.toString();

    // if this is the initial call for the leaf, give it a n active region
    if (!flow.activeRegions[leafID]) {
      let activeRegionObject = this.findActiveRegion(
        flow,
        editor,
        leafID,
        cursorOffset,
        text
      );

      // double check because active region could come back undefined
      if (activeRegionObject) {
        flow.activeRegions[leafID] = activeRegionObject;
        await this.saveSettings();
        return;
      } else {
        new Notice("textFlow: ");
      }
    } else if (
      // if there are values, use those to check if we're still in our known region
      cursorOffset > flow.activeRegions[leafID].startInFlow &&
      cursorOffset < flow.activeRegions[leafID].endInFlow
    ) {
      flow.activeRegions[leafID].currentCursorPos = cursorOffset;
      await this.saveSettings();
      return;
    } else {
      // new terrain!
      flow.activeRegions[leafID].currentCursorPos = cursorOffset;
      // Use a map and compass
      let activeRegion = this.findActiveRegion(
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
        // if the compass just cirles, notify the user
        new Notice(
          `textFlow: Region tracking error. \n` +
            `Your are most likely seeing this because you undid (ctrl+z) your way into the state before a rebuild.\n` +
            `Please redo (ctrl+shift+z) your way back into the current version of things.\n` +
            `If that doesn't seem to work, please rebuild ${flow.flowName}.\n` +
            `This may lead to further error messages. Please follow their instructions.`,
          0
        );
      }
      await this.saveSettings();
      return;
    }
  };
  //^CHECKED AND TESTED
  //CHECKED AND TESTED
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

    // Handle extreme conditions
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

        // then return region data
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

        // and return region data
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

    // if we're already in a safe position
    const searchStart = text.slice(cursorOffset);
    const matches = searchStart.match(markerRegex);

    if (matches) {
      console.log("we got matches");
      const UIDLength = matches[0].length - 4;
      const UID = matches[0].slice(0, UIDLength);

      const foundRegion = Object.entries(flow.flowMap).find(
        ([_, foundRegionMap]) => foundRegionMap.UID === UID
      );

      if (foundRegion) {
        const [foundRegionPath, foundRegionMap] = foundRegion;

        // calculate where the region starts
        let newStartInFlow;
        if (foundRegionMap.flowOrder > 1) {
          newStartInFlow =
            this.findStartOfRegion(flow, foundRegionMap.flowOrder, text) || 0;
        } else {
          newStartInFlow = 0;
        }

        // calculate where it ends
        const endInFlow = text.indexOf(foundRegionMap.UID) + matches[0].length;

        // put together the object
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
  //^CHECKED AND TESTED

  //CHECKED AND TESTED
  // ------------------
  findStartOfRegion = (
    flow: Types.FlowDef,
    flowOrder: number,
    text: string
  ) => {
    // this is just math
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
  //^CHECKED AND TESTED

  // -------------------------------------------------------
  //------------------------- ONLOAD -----------------------
  // -------------------------------------------------------
  async onload() {
    this.settings = await this.loadSettings();

    // set up the class to access its functions
    this.flowService = new FlowService(this, this.app);

    // -------------------------------------------------------------------
    // ------------------- ONLOAD: add listeners for cursor and clicks
    // Wait for the file explorer to be available in the DOM
    this.app.workspace.onLayoutReady(async () => {
      // make sure we know where our stuff is
      this.ensureSystemFolder();

      // ---- Set up UI
      // ----------------------------------------------
      if (this.settings.showExplorerDeco) {
        this.decorateSourceNotes("redo");
      }

      this.flowService.updateScrollbarVisibility();

      this.addSettingTab(new TextFlowSettingsTab(this.app, this));

      // --- Flow switcher modal ---------------------
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

      // Handle system folder visibility
      if (this.settings.systemFolderHidden) {
        this.discernAndSetSystemFolderState(
          true,
          this.settings.systemFolderPath
        );
      }

      // ----------- listeners and commands
      // Listener vor navigation
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

    // check if we're done initialising files and wait a moment longer
    this.app.metadataCache.on("resolved", () => {
      setTimeout(() => {
        this.isLoading = false;
      }, 1000);
    });
  }

  // -------------------------------------------------------
  // ------------------ ONUNLOAD---------------------------
  // -------------------------------------------------------
  onunload() {
    this.saveSettings();

    // ------------ Remove listeners -----------

    //------------ REMOVE explorer click listener -----------
    const fileExplorer = document.querySelector(".nav-files-container");
    if (fileExplorer && this.boundFileExplorerClick) {
      fileExplorer.removeEventListener("click", this.boundFileExplorerClick);
    }

    const iterableLeafIDs = Object.keys(this.listenerBasket);
    for (let leafID of iterableLeafIDs) {
      // skip the text change entries (we're removing both listeners anyway)
      if (leafID.endsWith("-changes")) continue;

      const leaves = this.app.workspace.getLeavesOfType("markdown");
      const targetLeaf = leaves.find((leaf) => (leaf as any).id === leafID);

      for (const leaf of leaves) {
        // Check if the leaf's view is a MarkdownView and if its file path matches
        if (targetLeaf?.view instanceof MarkdownView) {
          this.removeCursorListener(targetLeaf.view);
          this.removeTextChangeListener(targetLeaf.view);
        }
      }
    }

    // --------------- Remove menu bar ------------------
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView && leaf.view.menuBar) {
        leaf.view.menuBar.detach();
      }
    });
  }
}
