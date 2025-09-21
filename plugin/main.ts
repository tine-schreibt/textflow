import {
  App,
  Editor,
  FileManager,
  MarkdownView,
  moment,
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
import * as Types from "./src/types";
import * as Modals from "./src/modals";
import { MenuBar } from "./src/menuBar";
import { FlowService } from "./src/flowService";
import XXH from "xxhashjs";
import path, { dirname, basename } from "path";
import en from "./src/lang/en.json";
import de from "./src/lang/de.json";

//-----------------------------------------------------------------------------------------
// This file is too big, but I feel like splitting it up
// would just move the complexity over to the file explorer
//-----------------------------------------------------------------------------------------
// TOC
//-----------------------------------------------------------------------------------------
// - Misc globals
// - StatsOverlay
// ----------------------------------------------------------------------------------------
// - Utility functions
//-----------------------------------------------------------------------------------------
//    - load and save
//    - ensureSystemFolder
//-----------------------------------------------------------------------------------------
// - Utility UI/UX
//-----------------------------------------------------------------------------------------
//    - loadLanguage (localisation)
//    - cleanupMenuBar
//    - COMMANDS
//    - systemFolderState (hidden/shown)
//    - decorateSourceNotes
//    - undecorateSourceNotes
//-----------------------------------------------------------------------------------------
// - LISTENERS
//-----------------------------------------------------------------------------------------
//    - Listener helpers
//      - getUniqueFileName
//    - Click Events (in file explorer)
//      - flag all flows containing file
//      - create new file
//      - create flow from folder
//    - File Events
//      - modify (flag for rebuild)
//      - rename (flag or restore name)
//      - create (flag or move and open)
//      - delete (flag)
//    - Window/editor/workspace events
//      - blur (sync and statcheck active flows)
//      - focus (statcheck active flows)
//      - active-leaf-change (setup/close flow leaves)
//      - layout-change (catch edge case when no flows open)
//    - TRACKING in editor
//      - addCursorListener
//      - removeCursorListener
//      - addTextChangeListener
//      - removeTextChangeListener
//      - isFileExplorerClick
//      - fileExplorerOpenClickListener
//    - TRACKING helpers
//      - checkActiveRegion
//      - addRegionTracking
//      - findActiveRegion
//      - findStartOfRegion
//-----------------------------------------------------------------------------------------
// - Flow Management and UI
//-----------------------------------------------------------------------------------------
//      - isFlowFile
//      - setupFlowView
//      - setupMenuBar
//      - refreshMenuBars
//      - activateFlow
//      - manageActiveFlowObject
//      - closeFlow
//-----------------------------------------------------------------------------------------
// - Data safety
//-----------------------------------------------------------------------------------------
//      - addWriteProtection
//      - preventEdit
//      - toggleEditable
//      - syncAllLeaves
//      - syncBackToSource
//      - updateStats
//      - checkStatsForFlow
//      - checkStatsForNote
//      - initialHashing
//      - makeHash
//      - checkHash
//-----------------------------------------------------------------------------------------
// - Misc
//-----------------------------------------------------------------------------------------
//      - manageCursorPos
//      - notifyOfOverlap
//-----------------------------------------------------------------------------------------
// - ONLOAD
//-----------------------------------------------------------------------------------------
// - ONUNLOAD
//-----------------------------------------------------------------------------------------

class StatsOverlay {
  private plugin: TextFlowPlugin;
  private container: HTMLElement;
  private progressText: HTMLElement;
  private flowName: string;
  private t: (key: string, variables?: Record<string, string>) => string;

  constructor(
    leaf: WorkspaceLeaf,
    flowName: string,
    app: App,
    plugin: TextFlowPlugin,
    translate: (key: string, variables?: Record<string, string>) => string
  ) {
    this.plugin = plugin;
    this.flowName = flowName;
    this.t = translate;

    if (!(leaf.view instanceof MarkdownView)) {
      throw new Error("LoadingOverlay: view is not a MarkdownView");
    }

    // Create overlay container
    this.container = leaf.view.contentEl.createDiv({
      cls: "textflow-loading-container",
    });

    const symbol = this.plugin.flowService.explorerDecoArray[0][0];
    this.progressText = this.container.createDiv({
      cls: "textflow-loading-text",
      text: this.t("main.statsOverlay initial notice", {
        flowName: this.flowName,
      }),
    });
  }

  updateProgress(elapsedTime: number) {
    const text = this.t("setupFlowView.statsCheck done", {
      elapsedTime: elapsedTime.toString(),
    });
    this.progressText.setText(text);
  }

  remove() {
    this.container.remove();
  }
}

// so the menu bar can be kept within the view
declare module "obsidian" {
  interface MarkdownView {
    menuBar?: MenuBar;
  }
}

// needed for scroll into view stuff
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
  isRebuilding: boolean = false; // to prevent superfluous feedback
  isLoading: boolean = true; // suspend create listener while we're setting up
  textFlowOperation: boolean = false; // set mostly when syncing to prevent doom spiral of the modify listener
  lastActivity: { [key: string]: number } = {};
  alreadyActivated: { [key: string]: { [key: string]: boolean } } = {}; // flowName: {leafID: true}
  lastActiveRegion: string = "";
  inactivityThreshold: number = 5 * 60 * 1000;
  fuzzNav: boolean = false; // to avoid scrolling interference

  // ---------------- Global objects and variables -------------------------

  textFlowSystemFolderName = "textFlowSystemFolder";

  // localisation
  private i18n: Record<string, any> = {};

  // ---- flag to prevent the leaf-change-listener from interfering with scrolling to source file in flow
  private explorerClickListenerActive: boolean = false;

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
  saveSettings = async () => {
    await this.saveData(this.settings);
  };

  // ---------------------------------------------------------------
  // see also: discernAndSetSystemFolderState for UI
  ensureSystemFolder = async () => {
    if (this.settings.firstLaunch) return;

    const systemFolder = this.app.vault
      .getAllLoadedFiles()
      .find(
        (file) =>
          file instanceof TFolder && file.name === this.textFlowSystemFolderName
      );

    if (systemFolder) {
      // if there is a systemFolder
      this.discernAndSetSystemFolderState();
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
    } else {
      if (this.settings.systemFolderPath) {
        await this.flowService.createSystemFolder(
          this.settings.systemFolderPath
        );
        this.discernAndSetSystemFolderState();
      } else {
        new Notice(this.t("sysFolder please setup"));
      }
    }
  };

  // ---------------- Functions: Utilities: UI/UX -------------------------

  // -------- Localisation (this part was quite obviously written by Claude 4 Sonnet)
  // Prepare translation

  private loadLanguage = async () => {
    const languages = {
      en,
      de,
    };
    const locale = moment.locale() || "en";

    // Use bundled languages instead of reading from file system
    if (locale in languages) {
      this.i18n = languages[locale as keyof typeof languages];
    } else {
      this.i18n = languages.en;
    }
  };

  // the wrapper function to use for translations
  t = (key: string, variables?: Record<string, string>): string => {
    let value = this.i18n[key];

    if (typeof value !== "string") {
      return key; // Return the key if translation not found
    }

    // Handle variable substitution
    if (variables) {
      return value.replace(/\$\{(\w+)\}/g, (match: string, varName: string) => {
        return variables[varName] || match;
      });
    }

    return value;
  };

  // cleanup for the menu bar
  // creation happens in setupFlowView, using menuBar.ts

  cleanupMenuBar = (leaf: WorkspaceLeaf) => {
    if (leaf.view instanceof MarkdownView && leaf.view.menuBar) {
      leaf.view.menuBar.detach();
      delete leaf.view.menuBar;
    }
  };

  // ---------------- all our nice commands
  registerCommands = () => {
    // Command for syncing
    this.addCommand({
      id: `text-flow-sync`,
      name: this.t("main.registerCommand sync all leaves"),
      callback: async () => {
        await this.syncAllLeaves();
      },
    });

    if (this.settings.checkExternalEdits === "no") {
      this.addCommand({
        id: `text-flow-flag-rebuild`,
        name: this.t("main.registerCommand flag for rebuild"),
        callback: async () => {
          // flag for rebuild
          for (let flowName of Object.keys(this.settings.flows)) {
            this.settings.flows[flowName].flaggedForRebuild = true;
            await this.saveSettings();
          }
          // refresh menu bars
          const allLeaves = this.app.workspace.getLeavesOfType("markdown");
          for (const leaf of allLeaves) {
            const view = leaf.view as MarkdownView;
            if (!view.menuBar) continue;
            view.menuBar.refresh(view.contentEl);
          }
        },
      });
    }

    if (
      this.settings.checkExternalEdits === "mtime" ||
      this.settings.checkExternalEdits === "mtime+hash" ||
      this.settings.checkExternalEdits === "always hash"
    ) {
      this.addCommand({
        id: `text-flow-check-stats`,
        name: this.t("main.registerCommand check stats"),
        callback: async () => {
          // flag for rebuild
          const changeArray = [];
          for (let flowName of Object.keys(this.settings.flows)) {
            const changes = await this.checkStatsForFlow(flowName);
            if (changes) {
              changeArray.push(flowName);
            }
          }
          if (changeArray.length === 0) {
            new Notice(this.t("main.checkStats no changes"));
          } else {
            const changeString = changeArray.join("\n");
            new Notice(
              this.t("main.checkStats changes detected", {
                changeString: changeString,
              })
            );
          }
          // refresh menu bars
          const allLeaves = this.app.workspace.getLeavesOfType("markdown");
          for (const leaf of allLeaves) {
            const view = leaf.view as MarkdownView;
            if (!view.menuBar) continue;
            view.menuBar.refresh(view.contentEl);
          }
        },
      });
    }

    // rebuild active leaf flow
    this.addCommand({
      id: `text-flow-rebuild-active`,
      name: this.t("main.registerCommand rebuild active leaf"),
      callback: async () => {
        // get the active leaf
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        if (!view.file) return;

        const activeLeafPath = view.file.path;
        const flowName = this.isFlowFile(activeLeafPath);
        if (!flowName) return;
        // rebuild
        this.flowService.rebuildFlow(flowName, "switcher");
      },
    });

    // Open the switcher modal
    this.addCommand({
      id: "text-flow-open-switcher",
      name: this.t("main.registerCommand open switcher"),
      callback: async () => {
        // toggle
        // also get the active leafID, so we can highlight the leaf
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) {
          new Modals.FlowSwitcherModal(this.app, this).open();
        } else {
          const leafID = (view.leaf as any).id;
          new Modals.FlowSwitcherModal(this.app, this, leafID).open();
        }
      },
    });

    this.addCommand({
      id: "text-flow-open-fuzzy-nav-modal",
      name: this.t("main.registerCommand open fuzzy navigation"),
      callback: async () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        let flowName: string | null = "";
        if (view) {
          if (view.file) {
            flowName = this.isFlowFile(view.file.path);
          }
        }
        if (flowName) {
          new Modals.FuzzyNavModal(
            this.app,
            this,
            this.settings,
            flowName
          ).open();
        } else {
          new Modals.FuzzyNavModal(this.app, this, this.settings).open();
        }
      },
    });

    // turn off explorer navigation so multi-select works as expected
    this.addCommand({
      id: "text-flow-toggle-explorer-listener",
      name: this.t("main.registerCommand toggle explorer navigation"),
      callback: async () => {
        this.settings.explorerListener
          ? (this.settings.explorerListener = false)
          : (this.settings.explorerListener = true);
        await this.saveSettings();
      },
    });

    // hide menu bar
    this.addCommand({
      id: "text-flow-toggle-menu-bar",
      name: this.t("main.registerCommand toggle menu bar"),
      callback: async () => {
        // toggle the setting
        this.settings.showMenuBar
          ? (this.settings.showMenuBar = false)
          : (this.settings.showMenuBar = true);
        await this.saveSettings();
        this.refreshMenuBars();
      },
    });

    // export active flow

    this.addCommand({
      id: "text-flow-export-flow",
      name: this.t("main.registerCommand export active flow"),
      callback: () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        if (!view.file) return;
        const flowName = this.isFlowFile(view.file.path);
        if (!flowName) return;
        this.flowService.exportFlow(flowName);
      },
    });

    // select active region
    this.addCommand({
      id: "text-flow-select-active-region",
      name: this.t("main.registerCommand select active region"),
      callback: () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        if (!view.file) return;

        const activeLeafPath = view.file.path;
        const leafID = (view.leaf as any).id;
        const flowName = this.isFlowFile(activeLeafPath);
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
      id: "text-flow-restore-cursor",
      name: this.t("main.registerCommand restore most recent cursor"),
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
        this.flowService.restoreCursorPos(flowName, activeView, leafID);
      },
    });

    // toggle scrollbar visibility
    this.addCommand({
      id: "text-flow-toggle-scroll-bar",
      name: this.t("main.registerCommand toggle scroll bar"),
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
  };

  // ----- is called onload and sets the visibility of textFlowSystemFolderName

  discernAndSetSystemFolderState = (): void => {
    const systemFolderPath = this.settings.systemFolderPath;
    const systemFolderHidden = this.settings.systemFolderHidden;

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
  };

  // ----- DECORATE SOURCE NOTES IN FILE EXPLORER -----------

  decorateSourceNotes = async (mode: Types.CalculationMode) => {
    let path = "";
    let handledPathsArray: string[] = [];
    const unsyncedPathsArray: string[] = [];
    let decoStyle = "";

    // find the active region path
    let activeRegionPath: string | undefined = "";
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView) {
      if (activeView.file) {
        const activeLeafPath = activeView.file.path;

        if (activeLeafPath) {
          const flowName = this.isFlowFile(activeLeafPath);
          if (flowName) {
            const leafID = (activeView.leaf as any).id;

            for (let flowName of Object.keys(this.settings.activeFlowObject)) {
              if (this.settings.flows[flowName].activeRegions[leafID]) {
                activeRegionPath =
                  this.settings.flows[flowName].activeRegions[leafID].path;
              }
            }
          }
        }
      }
    }

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

      const fileElement = document.querySelector(
        `div[data-path='${this.escapeSelector(cleanPath)}']`
      );
      const folderElement = document.querySelector(
        `div[data-path='${this.escapeSelector(cleanPath)}'] .nav-folder-title`
      );

      let style = document.createElement("style");

      style.setAttribute(`data-textflow-${decoStyle}`, "true");

      // the decoration symbol which we fetch from an array of options
      let neutralSymbol = "";
      let unsyncedSymbol = "";

      if (this.settings.explorerDecoStyle[0] != "--") {
        // show these symbols only when deco is activated
        neutralSymbol = this.settings.explorerDecoStyle[0];
        unsyncedSymbol = this.settings.explorerDecoStyle[1];
      }
      const neutralStyle = this.settings.explorerDecoStyle[2];
      const unsyncedStyle = this.settings.explorerDecoStyle[3];

      let pseudoElement = "";
      let activeColour = "";
      let opacity = "";

      if (
        activeRegionPath === path &&
        this.settings.activeRegionHighlight != "off"
      ) {
        // if the user chose the arrow for highlighting, add that
        if (this.settings.activeRegionHighlight === "arrow") {
          neutralSymbol = `${neutralSymbol}⬌`;
          unsyncedSymbol = `${unsyncedSymbol}⬌`;
        }
        // if the user would like their active source notes highlighted with a background
        if (
          this.settings.activeRegionHighlight === "bgAccent" ||
          this.settings.activeRegionHighlight === "bgMuted"
        ) {
          // check the colour
          activeColour =
            this.settings.activeRegionHighlight === "bgAccent"
              ? `var(--color-accent)`
              : `var(--nav-item-color)`;

          pseudoElement = `position: relative !important;
      }
      div[data-path='${this.escapeSelector(cleanPath)}']::before {
        content: "" !important;
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        background-color: ${activeColour} !important;
        opacity: 0.1 !important;
        pointer-events: none !important;
        z-index: 1 !important;
      }
      div[data-path='${this.escapeSelector(
        cleanPath
      )}'] .nav-file-title-content,
      div[data-path='${this.escapeSelector(
        cleanPath
      )}'] .nav-folder-title-content {
        position: relative !important;
        z-index: 2 !important;`;
        } else {
          // If they want an outline instead...
          // check the colour
          if (this.settings.activeRegionHighlight === "olAccent") {
            activeColour = `var(--color-accent)`;
            opacity = "1";
          } else if (this.settings.activeRegionHighlight === "olText") {
            activeColour = `var(--nav-item-color)`;
            opacity =
              this.settings.activeRegionHighlight === "olText" ? `0.5` : `0.2`;
          } else if (this.settings.activeRegionHighlight === "arrow") {
            opacity = "0";
          }
          pseudoElement = `position: relative !important;
        }
        div[data-path='${this.escapeSelector(cleanPath)}']::before {
          content: "" !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          box-shadow: inset 0 0 0 2px ${activeColour} !important;
          opacity: ${opacity} !important;
          border-radius: 3px !important;
          pointer-events: none !important;
          z-index: 1 !important;
          }
        div[data-path='${this.escapeSelector(
          cleanPath
        )}'] .nav-file-title-content,
        div[data-path='${this.escapeSelector(
          cleanPath
        )}'] .nav-folder-title-content {
          position: relative !important;
          z-index: 2 !important;`;
        }
      }

      let styleContent = "";

      // style for neutral stuff
      if (decoStyle === "neutral") {
        styleContent = `
                  div[data-path='${this.escapeSelector(cleanPath)}'] {
${pseudoElement}
  }
  div[data-path='${this.escapeSelector(
    cleanPath
  )}'] .nav-file-title-content::after,
  div[data-path='${this.escapeSelector(
    cleanPath
  )}'] .nav-folder-title-content::after 
  {
  content: ${JSON.stringify(" " + neutralSymbol)} !important;
  --nav-item-color: ${
    neutralStyle.includes("high") ? "var(--text-muted)" : "var(--text-faint)"
  } !important;
  color: ${
    neutralStyle.includes("high") ? "var(--text-muted)" : "var(--text-faint)"
  } !important;
  opacity: 1;
  font-size: ${neutralStyle.includes("large") ? "1em" : "0.8em"} !important;
  font-family: monospace !important;
  vertical-align: middle !important;
  }
    div[data-path='${this.escapeSelector(
      cleanPath
    )}'] .tree-item-self.nav-file-title,
  div[data-path='${this.escapeSelector(
    cleanPath
  )}'] .tree-item-self.nav-folder-title {
    background-color: var(--nav-item-background-active) !important;
  }
  `;
      }
      // Style for unsynced stuff
      if (decoStyle === "unsynced") {
        styleContent = `
          div[data-path='${this.escapeSelector(cleanPath)}'] {
    position: relative !important;
  }
  div[data-path='${this.escapeSelector(cleanPath)}']::before {
    content: "" !important;
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    background-color: ${activeColour} !important;
    opacity: 0.1 !important;
    pointer-events: none !important;
    z-index: 1 !important;
  }
  div[data-path='${this.escapeSelector(cleanPath)}'] .nav-file-title-content,
  div[data-path='${this.escapeSelector(cleanPath)}'] .nav-folder-title-content {
    position: relative !important;
    z-index: 2 !important;
  }
        div[data-path='${this.escapeSelector(
          cleanPath
        )}'] .tree-item-self.nav-file-title,
        div[data-path='${this.escapeSelector(
          cleanPath
        )}'] .tree-item-self.nav-folder-title {
          background-color: var(--nav-item-background-active) !important;
        }
        div[data-path='${this.escapeSelector(
          cleanPath
        )}'] .nav-file-title-content::after,
        div[data-path='${this.escapeSelector(
          cleanPath
        )}'] .nav-folder-title-content::after {
  content: ${JSON.stringify(" " + unsyncedSymbol)} !important;  
  --nav-item-color: ${
    neutralStyle.includes("high")
      ? "var(--color-accent)"
      : "color-mix(in srgb, var(--color-accent) 80%, transparent)"
  } !important;
  color: ${
    neutralStyle.includes("high")
      ? "var(--color-accent)"
      : "color-mix(in srgb, var(--color-accent) 80%, transparent)"
  } !important;
  opacity: 1;
  font-size: ${neutralStyle.includes("large") ? "1em" : "0.8em"} !important;
  font-family: monospace !important;
  vertical-align: middle !important;
    }
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
      for (path of Object.keys(this.settings.flows[flowName].flowMap)) {
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

  // removing all styles on deactivation

  unDecorateSourceNotes = async () => {
    if (this.settings.explorerDecoStyle[0] != "--") return;
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
      for (path of Object.keys(this.settings.flows[flowName].flowMap)) {
        // exclude folder titles
        if (path.startsWith("#")) continue;
        handlePath(path);
        continue;
      }
    });
  };

  //------ function to clean up paths for CSS handling; used by deco function

  escapeSelector = (str: string): string => {
    // Escape special characters that have meaning in CSS selectors
    return (
      str
        .replace(/["'&,.*+?^${}()|[\]\\]/g, "\\$&")
        // Handle spaces
        .replace(/\s/g, "\\ ")
    );
  };

  // ---------------- Functions: Listener helper functions -------------------------

  // this little thing was written by Claude 3.5 Sonnet and is needed
  // by some of the listeners
  getUniqueFileName = (basePath: string, baseName: string = "_untitled.md") => {
    // remove the .md so we can put numbers before it
    let fileName = baseName.slice(0, baseName.length - 3);
    let number = 0;
    let fullPath = normalizePath(`${basePath}/${fileName}.md`);
    // Check if file exists
    while (this.app.vault.getAbstractFileByPath(fullPath)) {
      number++;
      fileName = `${baseName} ${number}`;
      fullPath = normalizePath(`${basePath}/${fileName}.md`);
    }
    return `${fileName}.md`;
  };

  // ---------------- Functions: Listeners: Global -----------------
  addListeners() {
    // ------------ CLICK EVENTS ------------------
    // the context menu for rebuild flagging
    if (this.settings.checkExternalEdits === "no") {
      this.registerEvent(
        this.app.workspace.on("file-menu", (menu, file) => {
          const baseName = basename(file.path);
          menu.addItem((item) => {
            item
              .setTitle(
                this.t("main.fileMenuListener.context flag flows for rebuild", {
                  baseName: baseName,
                })
              )
              .setIcon("rotate-cw")
              .onClick(async () => {
                const normalisedPath = normalizePath(file.path);

                if (file instanceof TFile) {
                  // if it's a file, search for the path
                  for (let flowName of Object.keys(this.settings.flows)) {
                    if (
                      !this.settings.flows[flowName].flaggedForRebuild &&
                      this.settings.flows[flowName].flowMap[normalisedPath]
                    ) {
                      this.settings.flows[flowName].flaggedForRebuild = true;
                      await this.saveSettings();
                    }
                  }
                } else {
                  // if it's a folder
                  flowNameLoop: for (let flowName of Object.keys(
                    this.settings.flows
                  )) {
                    pathLoop: for (let path of Object.keys(
                      this.settings.flows[flowName].flowMap
                    )) {
                      if (!this.settings.flows[flowName].flaggedForRebuild) {
                        for (let path of Object.keys(
                          this.settings.flows[flowName].flowMap
                        )) {
                          if (path.startsWith(normalisedPath)) {
                            this.settings.flows[flowName].flaggedForRebuild =
                              true;
                            await this.saveSettings();
                            // we just need one path, so let's move on to the next flow
                            continue flowNameLoop;
                          }
                        }
                      }
                    }
                  }
                }
                // then refresh all the menu bars
                const allLeaves =
                  this.app.workspace.getLeavesOfType("markdown");
                for (const leaf of allLeaves) {
                  const view = leaf.view as MarkdownView;
                  if (!view.menuBar) continue;
                  view.menuBar.refresh(view.contentEl);
                }
              });
          });
        })
      );
    }

    // the thing to create a new file in the current folder
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        menu.addItem((item) => {
          item
            .setTitle(this.t("main.fileMenuListener.context create new file"))
            .setIcon("rotate-cw")
            .onClick(async () => {
              const normalisedPath = normalizePath(file.path);

              let parentFolder = normalisedPath;
              if (file instanceof TFile) {
                parentFolder = dirname(normalisedPath);
              }

              const newFileName = this.getUniqueFileName(parentFolder);
              const newFilePath = normalizePath(
                `/${parentFolder}/${newFileName}.md`
              );

              await this.app.vault.create(newFilePath, "");
            });
        });
      })
    );

    // ---------------   // thing to make flow from selected folder
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile) return;
        menu.addItem((item) => {
          item
            .setTitle(
              this.t("main.fileMenuListener.context make flow from folder")
            )
            .onClick(async () => {
              const normalisedPath = normalizePath(file.path);
              let parentFolder = normalisedPath;
              if (file instanceof TFile) {
                parentFolder = dirname(normalisedPath);
              }
              // empty the basket, just in case
              this.flowService.resetFlowBuildBasket(
                this.settings.flowBuildBasket
              );
              // put defaults in
              this.settings.flowBuildBasket.flowName = `${basename(
                parentFolder
              )}`;
              this.settings.flowBuildBasket.oldFlowName = `${basename(
                parentFolder
              )}`;
              this.settings.flowBuildBasket.flowCookbook.folderIncluded =
                parentFolder;
              this.settings.flowBuildBasket.definitionMode = "foldersTagsProps";
              this.settings.flowBuildBasket.flowCookbook.pathsTagsPropertiesSortOrder =
                "noteOrder";
              this.settings.flowBuildBasket.folderTitles = true;
              // reset of the basket happens in the modal
              await this.saveSettings();

              const flowCreationModal = new Modals.CreateFlowFromFolder(
                this.app,
                this
              );
              flowCreationModal.open();
            });
        });
      })
    );

    // ------ same thing but for multiple folders
    this.registerEvent(
      this.app.workspace.on("files-menu", (menu, files) => {
        menu.addItem((item) => {
          item
            .setTitle(
              this.t("main.fileMenuListener.context make flow from folderS")
            )
            .onClick(async () => {
              files.sort();
              const inclusionPathArray = [];
              for (let file of files) {
                if (file instanceof TFolder) {
                  inclusionPathArray.push(file.path);
                }
              }

              // empty the basket, just in case
              this.flowService.resetFlowBuildBasket(
                this.settings.flowBuildBasket
              );
              // put defaults in
              this.settings.flowBuildBasket.flowName = this.t("modal_flowName");
              this.settings.flowBuildBasket.oldFlowName =
                this.t("modal_flowName");
              this.settings.flowBuildBasket.flowCookbook.folderIncluded =
                inclusionPathArray.join(",");
              this.settings.flowBuildBasket.definitionMode = "foldersTagsProps";
              this.settings.flowBuildBasket.flowCookbook.pathsTagsPropertiesSortOrder =
                "noteOrder";
              this.settings.flowBuildBasket.folderTitles = true;
              // reset of the basket happens in the modal
              await this.saveSettings();

              const flowCreationModal = new Modals.CreateFlowFromFolder(
                this.app,
                this
              );
              flowCreationModal.open();
            });
        });
      })
    );

    // ------------- FILE EVENTS ---------------------
    // modify events
    this.registerEvent(
      this.app.vault.on("modify", async (file: TAbstractFile) => {
        if (this.textFlowOperation) return;

        if (file instanceof TFile) {
          for (let flowName of Object.keys(this.settings.flows)) {
            // check if it's the active leaf and a flow, so mtime-checking can handle it
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (view) {
              if (view.file) {
                if (view.file.path) {
                  if (view.file.path.endsWith(`${flowName}.md`)) {
                    continue;
                  }
                }
              }
            }
            if (
              !this.settings.flows[flowName].flaggedForRebuild &&
              this.settings.flows[flowName].flowMap[file.path]
            ) {
              this.settings.flows[flowName].flaggedForRebuild = true;
              await this.saveSettings();
            }
          }
        }
      })
    );

    // Rename events

    this.registerEvent(
      this.app.vault.on(
        "rename",
        async (file: TAbstractFile, oldPath: string) => {
          if (this.textFlowOperation) return;

          let newParentFolder = normalizePath(dirname(file.path));
          // if we'r edealing with a folder, don't get the parent
          if (file instanceof TFolder) {
            newParentFolder = file.path;
          }

          let oldParentFolder = normalizePath(dirname(oldPath));
          if (file instanceof TFolder) {
            oldParentFolder = file.path;
          }

          // Check if the user renamed the system folder
          if (
            basename(oldPath) === this.textFlowSystemFolderName &&
            basename(file.path) != this.textFlowSystemFolderName
          ) {
            this.textFlowOperation = true;
            await this.app.vault.rename(file, oldPath);
            this.textFlowOperation = false;
            new Notice(
              this.t("main.renameListener.notice don't rename system folder", {
                textFlowSystemFolderName: this.textFlowSystemFolderName,
              })
            );
            return;
          } // or if they moved the system folder
          else if (basename(oldPath) === this.textFlowSystemFolderName) {
            // update system folder data
            await this.ensureSystemFolder();
            return;
          }

          for (let flowName of Object.keys(this.settings.flows)) {
            // check if the user renamed or moved a flow
            if (basename(oldPath) === `${flowName}.md`) {
              if (basename(file.path) != `${flowName}.md`) {
                // revert renaming
                this.textFlowOperation = true;
                await this.app.vault.rename(file, oldPath);
                this.textFlowOperation = false;

                new Notice(
                  this.t("main.renameListener.notice use settings to rename")
                );
                return;
              }
              if (!newParentFolder.endsWith(this.textFlowSystemFolderName)) {
                // revert move
                this.textFlowOperation = true;
                await this.app.vault.rename(file, oldPath);
                this.textFlowOperation = false;

                new Notice(
                  this.t("main.renameListener.notice use export to export")
                );
                return;
              }
            }
            if (this.settings.flows[flowName].flaggedForRebuild) continue;

            // if the flow contained the old path, flag and move on
            if (this.settings.flows[flowName].flowMap[oldPath]) {
              this.settings.flows[flowName].flaggedForRebuild = true;
              await this.saveSettings();
              continue;
            }
            // if the parent is included
            if (
              newParentFolder ===
              this.settings.flows[flowName].flowCookbook.folderIncluded
            ) {
              this.settings.flows[flowName].flaggedForRebuild = true;
              await this.saveSettings();
              continue;
            }
            if (
              // if the path starts with inclusion path and subfolders aren't excluded
              newParentFolder.startsWith(
                this.settings.flows[flowName].flowCookbook.folderIncluded + "/"
              ) &&
              !this.settings.flows[
                flowName
              ].flowCookbook.folderIncluded.endsWith("/")
            ) {
              // if the exclusion criterion isn't empty
              if (this.settings.flows[flowName].flowCookbook.folderExcluded) {
                const exclusionArray =
                  this.settings.flows[
                    flowName
                  ].flowCookbook.folderExcluded.split(",");
                const isExcluded = exclusionArray.some((path) =>
                  newParentFolder.includes(path.trim() + "/")
                );
                if (isExcluded) continue;
              }
              this.settings.flows[flowName].flaggedForRebuild = true;
              await this.saveSettings();
              continue;
            }
          }
        }
      )
    );

    // Create events

    this.registerEvent(
      this.app.vault.on("create", async (file: TAbstractFile) => {
        if (this.isLoading) return;
        if (this.textFlowOperation) return;
        if (this.isRebuilding) return;

        let parentFolder = normalizePath(dirname(file.path));
        if (file instanceof TFolder) {
          parentFolder = normalizePath(file.path);
        }

        if (
          // if the user put a new file in the system folder
          // the check for .md is so that stuff by - for example - Edit History doesn't get flagged
          parentFolder === this.settings.systemFolderPath &&
          file.path.endsWith(".md")
        ) {
          // the user has set 'create new file in same folder as active file'
          // so we simulate that behaviour by getting the path for last active region
          // and moving the file in the respective folder
          const baseName = basename(file.path);
          const basePath = dirname(this.lastActiveRegion);
          const newFileName = await this.getUniqueFileName(basePath, baseName);
          const newFilePath = normalizePath(`${basePath}/${newFileName}`);
          this.textFlowOperation = true;
          await this.app.vault.rename(file, newFilePath);
          this.textFlowOperation = false;

          // open the new file so the user gets the expected behaviour
          const movedFile = this.app.vault.getAbstractFileByPath(newFilePath);
          if (movedFile instanceof TFile) {
            const leaf = this.app.workspace.getLeaf("tab");
            await leaf.openFile(movedFile);
            this.app.workspace.setActiveLeaf(leaf, { focus: true });
          }

          new Notice(
            this.t(
              "main.renameListener.notice new element created in system folder; was moved",
              { newFilePath: newFilePath }
            )
          );
          await this.ensureSystemFolder();
          return;
        }

        // actual checks for flagging
        for (let flowName of Object.keys(this.settings.flows)) {
          if (this.settings.flows[flowName].flaggedForRebuild) continue;
          // if the flow is made from bookmarks, move on
          if (this.settings.flows[flowName].definitionMode === "bookmarks")
            continue;

          if (
            // if the path starts with the inclusion path, and either IS the inclusion path
            // or subfolders aren't excluded
            parentFolder.startsWith(
              this.settings.flows[flowName].flowCookbook.folderIncluded
            ) &&
            (parentFolder ===
              this.settings.flows[flowName].flowCookbook.folderIncluded ||
              !this.settings.flows[
                flowName
              ].flowCookbook.folderIncluded.endsWith("/"))
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
            await this.saveSettings();
          }
        }
      })
    );

    // Delete events
    this.registerEvent(
      this.app.vault.on("delete", async (file: TAbstractFile) => {
        const normalisedPath = normalizePath(file.path);
        let parentFolder = normalizePath(dirname(file.path));
        if (file instanceof TFolder) {
          parentFolder = normalizePath(file.path);
        }

        if (parentFolder.endsWith(this.textFlowSystemFolderName)) {
          await this.ensureSystemFolder();
          return;
        }

        //
        if (file instanceof TFile) {
          for (let flowName of Object.keys(this.settings.flows)) {
            // check if the user delete a flow file and flag it for rebuild
            if (basename(parentFolder) === flowName) {
              if (!this.settings.flows[flowName].flaggedForRebuild) {
                this.settings.flows[flowName].flaggedForRebuild = true;
                await this.saveSettings();
                continue;
              }
            }
            // make sure the user doesn't end up stuck with an unsyncable region
            else if (this.settings.flows[flowName].flowMap[normalisedPath]) {
              if (
                this.settings.flows[flowName].unsyncedRegionsArray.includes(
                  normalizePath(file.path)
                )
              ) {
                const cleanedArray = this.settings.flows[
                  flowName
                ].unsyncedRegionsArray.filter(
                  (path) => path !== normalisedPath
                );
                this.settings.flows[flowName].unsyncedRegionsArray =
                  cleanedArray;
              }
              // now check if we need to flag
              if (!this.settings.flows[flowName].flaggedForRebuild) {
                this.settings.flows[flowName].flaggedForRebuild = true;
                await this.saveSettings();
                continue;
              }
            }
          }
        }
      })
    );

    // ---------- Window/Editor events
    // ----------------- Auto-sync and checks on blur or focus  -------------------------------
    this.registerDomEvent(window, "blur", async () => {
      await this.syncAllLeaves();
      for (let flowName of Object.keys(this.settings.activeFlowObject)) {
        await this.checkStatsForFlow(flowName);
      }
    });
    this.registerDomEvent(window, "focus", async () => {
      for (let flowName of Object.keys(this.settings.activeFlowObject)) {
        await this.checkStatsForFlow(flowName);
      }
    });

    // -- LEAF CHANGE - Call management for flow, source and vanilla notes ------
    // setup functions take care of the details

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
            // if active leaf is flow, set it up; hash check happens in setup
            const isFlow = this.isFlowFile(activeLeafPath);
            if (isFlow) {
              await this.setupFlowView(isFlow, leaf.view);
              this.mostRecentActiveFlowLeaf = leaf;
              return;
            }
            // otherwise strip the flow stuff; hash check happens with syncAllLeaves in closeFlow
            this.closeFlow(view);
          }
        }
      })
    );

    // catch if only an empty leaf remains

    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        if (this.app.workspace.getLeavesOfType("markdown").length === 0) {
          // We're definitely in the "empty leaf" state
          this.manageActiveFlowObject();
        }
      })
    );
  }

  // ---------------- Functions: Listeners: Tracking in editor ----------
  // a little object to keep track of stuff
  listenerBasket: { [key: string]: ListenerBasketItem } = {};

  // This listener is used to track the active region
  private addCursorListener = (view: MarkdownView | null) => {
    if (!view) {
      return;
    }
    const leafID: string = (view.leaf as any).id;
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

            debounceTimeout = setTimeout(async () => {
              if (!plugin.settings.flows[flowName]) {
                throw new Error(`Flow ${flowName} not found in settings`);
              }
              // this sets off a chain of functions which updates the active Region
              await plugin.checkActiveRegion(
                plugin.settings.flows[flowName],
                flowName,
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
        this.t("main.cursorListener.notice tracking failed"),
        20000 // Show for 5 seconds
      );
    }
  };

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

  // -----------------
  private addTextChangeListener = (view: MarkdownView | null) => {
    if (!view) return;

    const leafID: string = (view.leaf as any).id;
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

          debounceTimeout = setTimeout(async () => {
            // Prevent rebuild from registering as text change
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
              // if the user wants checks and has been inactive, do checks
              if (plugin.settings.checkExternalEdits != "no") {
                if (
                  Math.abs(Date.now() - plugin.lastActivity[flowName]) >
                  plugin.inactivityThreshold
                ) {
                  const fileHasEdits = await plugin.checkStatsForNote(
                    flowName,
                    activeRegionPath
                  );
                  if (fileHasEdits) {
                    // notifcations are handled by the check function
                    return;
                  }
                }
              }
              plugin.lastActivity[flowName] = Date.now();
              // Add to unsynced array
              plugin.settings.flows[flowName].unsyncedRegionsArray.push(
                activeRegionPath
              );
              await plugin.saveSettings();
            }

            // update the menu bar to show unsynced status
            if (view.menuBar) {
              view.menuBar.refresh(view.contentEl);
            }

            // update source decoration
            if (plugin.settings.explorerDecoStyle[0] != "--") {
              plugin.decorateSourceNotes("update");
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
        this.t("textChangeListener.notice error setting up listener"),
        10000
      );
    }
  };

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
          // Flow is already open, just set the leaf to active
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

  // --------------- Listeners: Tracking helpers -----------------------------------------
  private checkActiveRegion = async (
    flow: Types.FlowDef,
    flowName: string,
    leafID: string,
    cursorOffset: number,
    view: MarkdownView
  ) => {
    // this is to prevent error messages when activating a leaf triggers a rebuild
    if (this.settings.flows[flowName].flaggedForRebuild) return;

    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) return;

    const editor = activeView.editor as ObsidianEditor;
    const cmEditor = editor.cm;
    if (!cmEditor) return;

    // Get full document text from CodeMirror state
    const text = cmEditor.state.doc.toString();

    // if this is the initial call for the leaf, give it an active region
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
        // then check if the active region overlaps and sent a notice
        if (activeRegionObject.path) {
          this.lastActiveRegion = activeRegionObject.path;
          this.decorateSourceNotes("update");
          this.notifyOfOverlap(activeRegionObject.path, flowName, leafID);
        }

        await this.saveSettings();
        return;
      }
    } else if (
      // if there are values, use those to check if we're still in our known region
      cursorOffset > flow.activeRegions[leafID].startInFlow &&
      cursorOffset < flow.activeRegions[leafID].endInFlow
    ) {
      flow.activeRegions[leafID].currentCursorPos = cursorOffset;
      if (flow.activeRegions[leafID].path) {
        this.lastActiveRegion = flow.activeRegions[leafID].path;
      }
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
        if (activeRegion.path) {
          this.lastActiveRegion = activeRegion.path;
        }
        const activeRegionPath = activeRegion.path;
        // if the user wants checks, always check the new region
        if (
          !activeRegionPath?.startsWith("#") &&
          this.settings.checkExternalEdits != "no"
        ) {
          if (activeRegionPath) {
            const flowHasEdits = await this.checkStatsForNote(
              flowName,
              activeRegionPath
            );
            if (flowHasEdits) {
              this.flowService.rebuildFlow(flowName, "menuBar");
              new Notice(
                this.t("main.cursorTracker.notice", {
                  flowName: flowName,
                })
              );
              this.lastActivity[flowName] = Date.now();
            }
          }
        }
        flow.activeRegions[leafID] = activeRegion;
        await this.saveSettings();
        this.decorateSourceNotes("update");
        if (view.menuBar) {
          view.menuBar.refresh(view.contentEl);
        }
        if (activeRegion.path) {
          this.notifyOfOverlap(activeRegion.path, flowName, leafID);
        }
      } else {
        // if the compass just cirles, notify the user
        new Notice(
          this.t("checkActiveRegion.notice region tracking error", {
            flowName: flowName,
          }),
          0
        );
      }
      await this.saveSettings();
      return;
    }
  };

  // ----- add region tracking for new leafs, because we get errors if we don't
  addRegionTracking = async (flowName: string, leafID: string) => {
    const [path, targetObject] =
      Object.entries(this.settings.flows[flowName].flowMap).find(
        ([_, obj]) => obj.flowOrder === 1
      ) || [];
    if (targetObject) {
      const { type, invisibleUUID, flowOrder, lengthPlusDividers } =
        targetObject;
      this.settings.flows[flowName].activeRegions[leafID] = {
        currentCursorPos: 0,
        type: targetObject.type,
        path: path,
        invisibleUUID: targetObject.invisibleUUID,
        flowOrder: 1,
        startInFlow: 0,
        endInFlow: targetObject.lengthPlusDividers,
        leafMenuBarSettings: {
          menuBarDisplayState: "show",
          navDropdownState: "hide",
          navDropdownSearchTerm: undefined,
          cursorDropdownState: "hide",
        },
      };
      await this.saveSettings();
    }
  };

  // ------------- region tracking utilities ----------------------
  private findActiveRegion = (
    flow: Types.FlowDef,
    editor: ObsidianEditor,
    leafID: string,
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
          invisibleUUID: regionMap.invisibleUUID,
          flowOrder: 1,
          startInFlow: 0,
          endInFlow:
            text.indexOf(regionMap.invisibleUUID) +
            regionMap.invisibleUUID.length +
            4,
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
        const safePos = text.lastIndexOf(regionMap.invisibleUUID) - 1;
        this.flowService.scrollToPos(editor, safePos);

        // and return region data
        return {
          currentCursorPos: safePos,
          type: regionMap.type,
          path: path,
          invisibleUUID: regionMap.invisibleUUID,
          flowOrder: regionMap.flowOrder,
          startInFlow:
            this.findStartOfRegion(flow, regionMap.flowOrder, text) || 0,
          endInFlow:
            text.lastIndexOf(regionMap.invisibleUUID) +
            regionMap.invisibleUUID.length +
            4,
          leafMenuBarSettings: flow.activeRegions[leafID].leafMenuBarSettings,
        };
      }
    }

    // if we're already in a safe position
    const searchStart = text.slice(cursorOffset);
    const matches = searchStart.match(markerRegex);

    if (matches) {
      const UIDLength = matches[0].length - 4;
      const UID = matches[0].slice(0, UIDLength);

      const foundRegion = Object.entries(flow.flowMap).find(
        ([_, foundRegionMap]) => foundRegionMap.invisibleUUID === UID
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
        const endInFlow =
          text.indexOf(foundRegionMap.invisibleUUID) + matches[0].length;

        // put together the object
        const activeRegionObject: Types.ActiveRegion = {
          currentCursorPos: cursorOffset,
          type: foundRegionMap.type,
          path: foundRegionPath,
          invisibleUUID: UID,
          flowOrder: foundRegionMap.flowOrder,
          startInFlow: newStartInFlow,
          endInFlow: endInFlow,
          leafMenuBarSettings: {
            menuBarDisplayState:
              flow.activeRegions[leafID].leafMenuBarSettings
                .menuBarDisplayState,
            navDropdownState:
              flow.activeRegions[leafID].leafMenuBarSettings.navDropdownState,
            navDropdownSearchTerm:
              flow.activeRegions[leafID].leafMenuBarSettings
                .navDropdownSearchTerm,

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
    // this is just math
    const previousRegion = Object.entries(flow.flowMap).find(
      ([previousRegion, previousRegionFlowMapEntry]) =>
        previousRegionFlowMapEntry.flowOrder === flowOrder - 1
    );

    if (previousRegion) {
      const [previousRegionPath, previousRegionMap] = previousRegion;
      const invisibleUID = previousRegionMap.invisibleUUID;
      const index = text.indexOf(invisibleUID);
      const startPos = index + (invisibleUID + "<hr>").length + 1;
      return startPos;
    } else {
      return 1;
    }
  };

  // ---------------- Functions: Flow management and UI -------------------------
  // ---- Identity check

  isFlowFile = (activeLeafPath: string) => {
    const flowName = activeLeafPath.match(/([^/]+)(?=\.md$)/)?.[0]; // gets the flow name out of the path
    if (flowName && this.settings.flows[flowName]) {
      return flowName;
    } else {
      return null;
    }
  };

  // The big bundle that centralises flow management
  setupFlowView = async (flowName: string, view: MarkdownView) => {
    // ------------- PROTECTION ---------------------
    // set up the editor with its other extensions and listeners
    this.addWriteProtection(view, "divider");
    this.addCursorListener(view);
    this.addTextChangeListener(view);

    // ------------- VISUALS ---------------------
    // this has to happen first so the menuBar can just be set up
    await this.manageActiveFlowObject();
    // now do the menu bar
    this.setupMenuBar(view, flowName);
    // Update the switcher modal in case it's open
    if (this.modalUpdateCallback) {
      this.modalUpdateCallback();
    }

    // ------------- DATA INTEGRITY ---------------------
    // check if the flow needs a rebuild due to changes from outside
    if (this.settings.checkExternalEdits != "no") {
      if (!this.lastActivity[flowName]) {
        // if the flow has been newly opened
        const startTimer = Date.now();
        const statsOverlay = new StatsOverlay(
          view.leaf,
          flowName,
          this.app,
          this,
          this.t
        );
        await this.checkStatsForFlow(flowName);
        statsOverlay.updateProgress((Date.now() - startTimer) / 1000);
        statsOverlay.remove();
      } else if (
        // if it's been dormant for at least five minutes
        this.lastActivity[flowName] - Date.now() >
        this.inactivityThreshold
      ) {
        const startTimer = Date.now();
        const statsOverlay = new StatsOverlay(
          view.leaf,
          flowName,
          this.app,
          this,
          this.t
        );
        await this.checkStatsForFlow(flowName);
        statsOverlay.updateProgress((Date.now() - startTimer) / 1000);
        statsOverlay.remove();
      }
      // update activity
      this.lastActivity[flowName] = Date.now();
    }

    // ------------- REBUILDING ---------------------
    // add this so we can safely rebuild
    this.addWriteProtection(view, "sync");

    // rebuild if appropriate
    if (this.settings.flows[flowName].flaggedForRebuild) {
      this.toggleEditable(view, false);
      await this.flowService.rebuildFlow(flowName, "setupFlowView");
      this.toggleEditable(view, true);
    }

    const leafID = (view.leaf as any).id;

    // ------------- SCROLLING ---------------------
    // See if this is the inital activation of the flow/leaf and restore cursor
    if (!this.alreadyActivated[flowName]) {
      this.alreadyActivated[flowName] = {};
      this.alreadyActivated[flowName][leafID] = true;
      this.flowService.restoreCursorPos(flowName, view, leafID);
    } else if (!this.alreadyActivated[flowName][leafID]) {
      this.alreadyActivated[flowName][leafID] = true;
      this.flowService.restoreCursorPos(flowName, view, leafID);
    }

    // ------------- HOUSEKEEPING ---------------------
    // scrollbar hiding if necessary
    if (this.settings.hideScrollbar === "flows") {
      const leaf = view.leaf;
      if (leaf.view instanceof MarkdownView && leaf.view.file) {
        if (!leaf.view.containerEl.hasClass("hide-scrollbar")) {
          leaf.view.containerEl.addClass("hide-scrollbar");
        }
      }
    }

    // Keep track of the last active leaf for the fuzzNav
    if (this.settings.flows[flowName].lastActiveLeaves.contains(leafID)) {
      this.settings.flows[flowName].lastActiveLeaves = this.settings.flows[
        flowName
      ].lastActiveLeaves.filter((id) => id !== leafID);
    }
    this.settings.flows[flowName].lastActiveLeaves.unshift(leafID);

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
  };

  // ---- handle menuBar setup
  setupMenuBar = (view: MarkdownView, flowName: string) => {
    let menuBar: MenuBar;
    const leafID = (view.leaf as any).id;
    // If we got one, check if it belongs to the flow
    if (view.menuBar) {
      if ((view.menuBar as MenuBar).getFlowName() != flowName) {
        view.menuBar.detach();
        delete view.menuBar;
      }
    }
    // not in an else because it also needs to catch when we delete the menu bar
    if (!view.menuBar) {
      menuBar = new MenuBar(this.app, this, flowName, view, leafID);
      menuBar.attach(view.contentEl);
      view.menuBar = menuBar;
    }
    view.menuBar.refresh(view.contentEl);
  };

  // mostly here to handle uninitialised leaves
  refreshMenuBars = async () => {
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    for (let leaf of leaves) {
      const view = leaf.view as MarkdownView;
      const filePath = view.file?.path;
      if (!filePath) continue;

      const flowName = this.isFlowFile(filePath);
      if (!flowName) continue;

      // initialise
      await leaf.loadIfDeferred();

      // then refresh
      if (view.menuBar) {
        view.menuBar.refresh(view.contentEl);
      }
    }
  };

  // ---- Make sure flows are set up when they are activated
  activateFlow = async (flowName: string) => {
    if (!this.settings.flows[flowName]) {
      new Notice(
        this.t("activateFlow.notice flow name not found", {
          flowName: flowName,
        }),
        10000
      );
      return;
    }
    // Get the file
    const flowFile = this.app.vault.getAbstractFileByPath(
      this.settings.flows[flowName].flowFilePath
    );

    if (flowFile instanceof TFile) {
      // make a leaf and put the file into it
      const leaf = this.app.workspace.getLeaf("tab"); // Prefer opening in a tab
      await leaf.openFile(flowFile);

      // now set it up and focus it
      if (leaf.view instanceof MarkdownView) {
        this.app.workspace.setActiveLeaf(leaf, { focus: true }); // Make sure to activate the leaf with focus
      } else {
        console.error(
          "textFlow: View is not MarkdownView after opening flow file"
        );
      }
    } else {
      new Notice(
        this.t("activateFlow.notice flow file not found", {
          flow_flowFilePath: this.settings.flows[flowName].flowFilePath,
        }),
        10000
      );
    }
  };

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
                // filter the id from the array
                this.settings.flows[flowName].lastActiveLeaves =
                  this.settings.flows[flowName].lastActiveLeaves.filter(
                    (id) => id !== leafID
                  );
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
                      this.t(
                        "manageActiveFlowObject.notice sync upon closing flow failed",
                        { path: path }
                      )
                    );
                  }
                  if (note instanceof TFile) {
                    // get the text from the file
                    const text: string = await this.app.vault.read(note);
                    await this.syncBackToSource(flowName, text, leafID);
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
      }
    });

    // write that shit down
    await this.saveSettings();

    // And finally redraw the decoration and refresh the menu bars
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
  };

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

    const leafID = (view.leaf as any).id;
    if (this.editableCompartments?.[leafID]) {
      delete this.editableCompartments[leafID];
    }

    // update the activation tracker
    const activeLeafPath = view.file?.path;
    if (activeLeafPath) {
      const flowName = this.isFlowFile(activeLeafPath);
      if (flowName) {
        this.alreadyActivated[flowName];
        if (this.alreadyActivated[flowName].leafID) {
          delete this.alreadyActivated[flowName].leafID;
        }
      }
    }

    // take care of the scroll bar
    if (this.settings.hideScrollbar === "flows") {
      const leaf = view.leaf;
      if (leaf.view instanceof MarkdownView && leaf.view.file) {
        if (leaf.view.containerEl.hasClass("hide-scrollbar")) {
          leaf.view.containerEl.removeClass("hide-scrollbar");
        }
      }
    }

    await this.saveSettings();
  };

  // ---- Functions: Data safety ----------------------------

  // ---- Functions: Data safety: Read-only for dividers and during sync
  private editableCompartments: { [key: string]: [Compartment, boolean] } = {};

  addWriteProtection = (
    view: MarkdownView,
    protectionType: Types.ProtectionType
  ) => {
    const editor = view.editor as any;
    const leafID = (view.leaf as any).id;

    if (!editor.cm) {
      return;
    }

    if (protectionType === "sync") {
      // create new compartment
      const protectSyncCompartment = new Compartment();
      // store compartment so we can reuse it to toggle on/off
      this.editableCompartments[leafID] = [protectSyncCompartment, true];

      // Initialise
      editor.cm.dispatch({
        effects: StateEffect.appendConfig.of([
          protectSyncCompartment.of(
            this.preventEdit(this.editableCompartments, leafID)
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
      // Initialise
      editor.cm.dispatch({
        effects: StateEffect.appendConfig.of([
          protectDividerCompartment.of([preventEdit]),
        ]),
      });
    }
  };

  // the function that builds the preventDefault configuration for the
  // sync (and mostly rebuild) writelock

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

  // toggle the sync protection by reconfiguring the compartment

  toggleEditable = (view: MarkdownView, editable: boolean) => {
    const editor = view.editor as any;

    const leafID = (view.leaf as any).id;
    if (!this.editableCompartments[leafID]) return;
    this.editableCompartments[leafID][1] = editable;
    const compartment = this.editableCompartments[leafID][0];

    if (compartment) {
      editor.cm.dispatch({
        effects: compartment.reconfigure([
          this.preventEdit(this.editableCompartments, leafID),
        ]),
      });
    }
  };

  // Sync all leaves
  syncAllLeaves = async () => {
    const allLeaves = this.app.workspace.getLeavesOfType("markdown");
    const flowLeaves: Record<string, MarkdownView[]> = {};

    // Populate flowLeaves
    for (const leaf of allLeaves) {
      const view = leaf.view as MarkdownView;
      const filePath = view.file?.path;
      if (filePath) {
        const flowName = this.isFlowFile(filePath);
        if (flowName) {
          if (!flowLeaves[flowName]) {
            flowLeaves[flowName] = [view];
          } else {
            flowLeaves[flowName].push(view);
          }
        }
      }
    }
    // Perform syncs
    this.textFlowOperation = true; // suspends modify listener

    for (let flowName of Object.keys(flowLeaves)) {
      for (let view of flowLeaves[flowName]) {
        const text = view.editor.getValue();
        const leafID = (view.leaf as any).id;
        this.toggleEditable(view, false); // block all user edits
        await this.syncBackToSource(flowName, text, leafID);
        this.toggleEditable(view, true);
      }
      // before we get to actually modifying, let's flag other flows
      for (let otherFlowName of Object.keys(this.settings.flows)) {
        if (flowName != otherFlowName) {
          if (!this.settings.flows[otherFlowName].flaggedForRebuild) {
            for (let path of this.settings.flows[flowName]
              .unsyncedRegionsArray) {
              if (this.settings.flows[otherFlowName].flowMap[path])
                this.settings.flows[otherFlowName].flaggedForRebuild = true;
              await this.saveSettings();
            }
          }
        }
      }
    }
    this.textFlowOperation = false; // unsuspends modify listener
  };

  //---- The actual sync function -------------
  syncBackToSource = async (flowName: string, text: string, leafID: string) => {
    if (this.settings.flows[flowName].unsyncedRegionsArray) {
      const map = this.settings.flows[flowName].flowMap;
      const remainingPaths: string[] = [];
      if (this.settings.flows[flowName].unsyncedRegionsArray.length > 0) {
        for (const path of this.settings.flows[flowName].unsyncedRegionsArray) {
          const sourceFile = this.app.vault.getFileByPath(path);
          if (!sourceFile) {
            new Notice(
              this.t("syncBackToSource.notice sync failed source note", {
                path: path,
              })
            );
            return;
          }
          const check = await this.checkStatsForNote(flowName, path);
          if (check) {
            new Notice(
              this.t("syncBackToSource.failedStatCheck", { path: path })
            );
            return;
          }

          let startOfRegion = this.findStartOfRegion(
            this.settings.flows[flowName],
            map[path].flowOrder,
            text
          );

          const endOfRegion = text.indexOf(map[path].invisibleUUID) - 1; // subtract 1 for the \r before the UID

          const flowFile = this.app.vault.getFileByPath(
            this.settings.flows[flowName].flowFilePath
          );

          if (!flowFile) {
            new Notice(
              this.t("syncBackToSource.notice sync failed flow note", {
                path: path,
              })
            );
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
                this.t("syncBackToSource.notice other random error", {
                  flowName: flowName,
                  path: path,
                })
              );
              throw error;
            }
          }
          await this.updateStats(flowName, path, sourceFile);
        }
      }
      this.settings.flows[flowName].unsyncedRegionsArray = remainingPaths;

      this.manageCursorPos(flowName, leafID);
      this.refreshMenuBars();
      await this.saveSettings();
      if (this.settings.explorerDecoStyle[0] != "--") {
        this.decorateSourceNotes("update");
      }
    }
  };

  // Functionality to keep mtimes and hashes up to date
  updateStats = async (flowName: string, path: string, file: TFile) => {
    if (this.settings.flows[flowName].flowMap[path]) {
      this.settings.flows[flowName].flowMap[path].mtime = file.stat.mtime;
      await this.saveSettings();
    }
    if (this.settings.checkExternalEdits === "mtime+hash") {
      let fileContent: string = await this.app.vault.read(file);
      const newHash = this.makeHash(fileContent);
      this.settings.hashes[path] = newHash;
      await this.saveSettings();
    }
  };

  // a robot said I should do it like this, and who am I to question a robot?
  MTIME_EPSILON = 2000;

  // check stats for an entire flow's source notes
  checkStatsForFlow = async (flowName: string) => {
    if (this.settings.checkExternalEdits === "no") return;
    if (this.settings.flows[flowName].flaggedForRebuild) return;

    let key = this.settings.flows[flowName].flowRecipe.bookmarks
      ? "bookmarks"
      : "foldersTagsProps";

    // iterating over the paths
    // Use Promise.all for parallel execution:
    const pathsToCheck = this.settings.flows[flowName].flowRecipe[key].filter(
      (path) => !path.startsWith("#")
    ); // filter out titles

    const checkPromises = pathsToCheck.map((path) =>
      this.checkStatsForNote(flowName, path)
    );

    const results = await Promise.all(checkPromises);
    const changed = results.some((check) => check === true);

    if (changed) {
      this.settings.flows[flowName].flaggedForRebuild = true;
      await this.saveSettings();
      // check if the flow is active/in active leaf
      if (this.settings.activeFlowObject[flowName]) {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view?.file?.path.endsWith(`${flowName}.md`)) {
          this.flowService.rebuildFlow(flowName, "switcher");
        }
      }
    }
    return changed;
  };

  // The actual checking logic
  checkStatsForNote = async (flowName: string, path: string) => {
    if (this.settings.checkExternalEdits === "no") return;
    if (this.settings.flows[flowName].flaggedForRebuild) return;
    if (path.startsWith("#")) return; // excluding titles

    let changed = false;

    const sourceFile = this.app.vault.getFileByPath(path);
    if (!sourceFile) {
      if (this.settings.hashes[path]) {
        delete this.settings.hashes[path];
        changed = true;
      }
      return changed;
    }

    if (this.settings.checkExternalEdits === "always hash") {
      if (this.settings.checkExternalEdits === "always hash") {
        const check = await this.checkHash(sourceFile, path, flowName);
        console.log("stats check for ", path, ": ", check);
        if (check) changed = true;
      }
    }

    const oldMtime = this.settings.flows[flowName].flowMap[path].mtime;
    const newMtime = sourceFile.stat.mtime;
    if (Math.abs(newMtime - oldMtime) > this.MTIME_EPSILON) {
      if (this.settings.checkExternalEdits === "mtime") {
        changed = true;
        this.settings.flows[flowName].flaggedForRebuild = true;
      } else {
        const checked = await this.checkHash(sourceFile, path, flowName);
        if (checked) changed = true;
      }
    }

    if (changed) {
      this.settings.flows[flowName].flaggedForRebuild = true;
      Object.keys(this.settings.flows).forEach((iteratorFlowName) => {
        if (
          !this.settings.flows[iteratorFlowName].flaggedForRebuild &&
          iteratorFlowName != flowName
        ) {
          // rebuild of active leaf is taken care of by the caller
          if (this.settings.flows[iteratorFlowName].flowMap[path]) {
            this.settings.flows[iteratorFlowName].flaggedForRebuild = true;
          }
        }
      });
    }
    await this.saveSettings();
    return changed;
  };

  // so we got hashes to compare against
  initialHashing = async (flowName: string) => {
    for (const path of Object.keys(this.settings.flows[flowName].flowMap)) {
      if (!this.settings.hashes[path]) {
        const sourceFile = this.app.vault.getFileByPath(path);
        if (sourceFile instanceof TFile) {
          const fileContent = await this.app.vault.read(sourceFile);
          this.settings.hashes[path] = this.makeHash(fileContent);
        }
      }
    }
    await this.saveSettings();
  };

  // like it says
  makeHash = (text: string) => {
    return XXH.h64(text, 0x0).toString(16);
  };

  // yeah...
  checkHash = async (sourceFile: TFile, path: string, flowName: string) => {
    let changed = false;
    let fileContent: string = await this.app.vault.read(sourceFile);
    const newHash = this.makeHash(fileContent);
    // if there's no hash yet, it's because user just activated hashing
    // so do a quick once-over for the flow
    if (!this.settings.hashes[path]) {
      await this.initialHashing(flowName);
    }
    if (newHash === this.settings.hashes[path]) {
      // if contents are the same, just update mtime
      const newMtime = sourceFile.stat.mtime;
      this.settings.flows[flowName].flowMap[path].mtime = newMtime;
    } else {
      // if there's been an actual edit to the content, flag the flow
      if (this.settings.activeFlowObject[flowName]) {
        this.flowService.rebuildFlow(flowName, "switcher");
      } else {
        this.settings.flows[flowName].flaggedForRebuild = true;
      }
      new Notice(
        this.t("main.checkStats check stats feedback hash", {
          path: path,
        })
      );
      this.settings.hashes[path] = newHash;

      changed = true;
    }
    await this.saveSettings();
    return changed;
  };

  // ------ Functions: Misc
  manageCursorPos = async (
    flowName: string,
    leafID: string,
    // these args come from the fuzzyNavModal
    item?: Types.SuggestionItem,
    currentCursor?: number
  ) => {
    if (this.settings.flows[flowName].activeRegions) {
      if (!this.settings.flows[flowName].activeRegions[leafID]) {
        return;
      }

      let regionPath = "";
      if (item) {
        if (item.path) {
          regionPath = item.path;
        }
      } else if (this.settings.flows[flowName].activeRegions[leafID].path) {
        regionPath = this.settings.flows[flowName].activeRegions[leafID].path;
      }

      if (!currentCursor) {
        currentCursor =
          this.settings.flows[flowName].activeRegions[leafID].currentCursorPos;
      }
      // Initialise if doesn't exist
      if (!this.settings.flows[flowName].persistentCursors) {
        this.settings.flows[flowName].persistentCursors = {};
      }
      if (!this.settings.flows[flowName].persistentCursors[leafID]) {
        this.settings.flows[flowName].persistentCursors[leafID] = {
          leafNickname: `${leafID.slice(0, 5)}`,
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

      // Cap at two entries for the region so at most three are present
      const countAndDelete = (tuples: [string, number][]) => {
        let counter = 0;
        const filteredTuples = [];
        for (let tuple of tuples) {
          if (tuple[0] !== regionPath) {
            filteredTuples.push(tuple);
          } else if (counter < 2 && tuple[1] != currentCursor) {
            filteredTuples.push(tuple);
            counter++;
          }
        }
        return filteredTuples;
      };

      this.settings.flows[flowName].persistentCursors[leafID].cursors =
        countAndDelete(
          this.settings.flows[flowName].persistentCursors[leafID].cursors
        );

      // Then add the new cursor
      this.settings.flows[flowName].persistentCursors[leafID].cursors.unshift([
        regionPath,
        currentCursor,
      ]);

      // update the timestamp
      this.settings.flows[flowName].persistentCursors[leafID].update =
        Date.now();

      // Cap at nine entries so we get three cursors for three regions
      if (
        this.settings.flows[flowName].persistentCursors[leafID].cursors.length >
        9
      ) {
        this.settings.flows[flowName].persistentCursors[leafID].cursors.pop();
      }

      // also remove ancient entries, but leave the last ones intact
      if (
        this.settings.flows[flowName].persistentCursors[leafID].cursors.length >
        2
      ) {
        for (let leafID of Object.keys(
          this.settings.flows[flowName].persistentCursors
        )) {
          if (
            Math.abs(
              this.settings.flows[flowName].persistentCursors[leafID].update -
                Date.now()
            ) >
            1000 * 60 * 60 * 24 // if other entries are older than 24 hours
          ) {
            delete this.settings.flows[flowName].persistentCursors[leafID];
          }
        }
      }
    }
    await this.saveSettings();
  };

  notifyOfOverlap = (path: string, activeFlow: string, leafID: string) => {
    if (
      !this.settings.showMenuBar ||
      this.settings.flows[activeFlow].activeRegions[leafID].leafMenuBarSettings
        .menuBarDisplayState === "hide"
    ) {
      let overlappingFlows: string[] = [];
      for (let flowName of Object.keys(this.settings.activeFlowObject)) {
        if (flowName != activeFlow) {
          if (this.settings.flows[flowName].flowMap) {
            if (
              Object.keys(this.settings.flows[flowName].flowMap).includes(path)
            ) {
              overlappingFlows.push(flowName);
              continue;
            }
          }
        }
      }
      if (overlappingFlows.length > 0) {
        const overlapString = Object.keys(this.settings.activeFlowObject).join(
          ","
        );
        const regionName = basename(path);
        new Notice(
          this.t("checkActiveRegion.notice overlap detected", {
            regionName: regionName,
            overlapString: overlapString,
          })
        );
      }
    }
  };

  // -------------------------------------------------------
  //------------------------- ONLOAD -----------------------
  // -------------------------------------------------------
  async onload() {
    this.settings = await this.loadSettings();
    await this.loadLanguage();

    // set up the class so main.ts can act as an access hub to the functions in flowService.ts
    this.flowService = new FlowService(this, this.app);

    // -------------------------------------------------------------------
    // ------------------- ONLOAD: add listeners for cursor and clicks
    // Wait for the file explorer to be available in the DOM
    this.app.workspace.onLayoutReady(async () => {
      // make sure we know where our stuff is
      await this.ensureSystemFolder(); // also calls state discernment to hide

      // ---- Set up UI
      // ---------------- various stuff ------------------------
      if (this.settings.explorerDecoStyle[0] != "--") {
        this.decorateSourceNotes("redo");
      }

      this.flowService.updateScrollbarVisibility();

      this.addSettingTab(new TextFlowSettingsTab(this.app, this));

      // ---------------- Flow switcher modal ---------------------
      if (this.settings.switcherPos === "statusBar") {
        const flowSwitcher = this.addStatusBarItem();
        flowSwitcher.addClass("mod-clickable");
        const iconContainer = flowSwitcher.createSpan();
        setIcon(iconContainer, "scroll-text");

        flowSwitcher.addEventListener("click", () => {
          // also get the active leafID, so we can highlight the leaf
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (!view) {
            new Modals.FlowSwitcherModal(this.app, this).open();
          } else {
            const leafID = (view.leaf as any).id;
            new Modals.FlowSwitcherModal(this.app, this, leafID).open();
          }
        });
      } else if (this.settings.switcherPos === "ribbon") {
        this.addRibbonIcon(
          "scroll-text",
          "Open flowSwitcher",
          (evt: MouseEvent) => {
            // also get the active leafID, so we can highlight the leaf
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!view) {
              new Modals.FlowSwitcherModal(this.app, this).open();
            } else {
              const leafID = (view.leaf as any).id;
              new Modals.FlowSwitcherModal(this.app, this, leafID).open();
            }
          }
        );
      }

      // -- listeners and commands --------------------------
      // ------------------------- Listener for navigation
      this.fileExplorerOpenClickListener();
      const fileExplorer = document.querySelector(".nav-files-container");
      if (fileExplorer && this.boundFileExplorerClick) {
        fileExplorer.addEventListener("click", this.boundFileExplorerClick);
      }
    });

    // ------------------------- global listeners -------------

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
    // ------------ Remove listeners -----------

    //------------ REMOVE explorer click listener -----------
    const fileExplorer = document.querySelector(".nav-files-container");
    if (fileExplorer && this.boundFileExplorerClick) {
      fileExplorer.removeEventListener("click", this.boundFileExplorerClick);
    }

    for (let leafID of Object.keys(this.listenerBasket)) {
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
