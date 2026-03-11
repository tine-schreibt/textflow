import {
  App,
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
import { Compartment, EditorState, StateEffect } from "@codemirror/state";
import * as Types from "./src/types";
import * as Modals from "./src/modals";
import { MenuBar } from "./src/menuBar";
import { settingsTabFunctions } from "./src/settingsTabFunctions+";
import XXH from "xxhashjs";
import path, { dirname, basename } from "path";
import en from "./src/lang/en.json";
import de from "./src/lang/de.json";

// Any code that was actually written by AI is labelled

//-----------------------------------------------------------------------------------------
// This file is quite big, but everything is deeply interconnected, so splitting it up actually made it more complicated and confusing
//-----------------------------------------------------------------------------------------
//
//
// Table of Contents, mostly to demonstrate the very sane file structure
//-----------------------------------------------------------------------------------------
//    - StatsOverlay
//    - menuBar module
//----------------------------------------------------------------------------------------
// ----------- THE PLUGIN CLASS-------------------
//-----------------------------------------------------------------------------------------
// - assorted global variables, flags and objects to help the plugin talk to itself
//----------------------------------------------------------------------------------------
// - Utility functions
//-----------------------------------------------------------------------------------------
//    - load and save settings
//    - ensureSystemFolder
//-----------------------------------------------------------------------------------------
// - Utility/general UI/UX
//-----------------------------------------------------------------------------------------
//    - loadLanguage (localisation)
//    - COMMANDS
//    - systemFolderState (hidden/shown)
//    - decorateSourceNotes
//    - undecorateSourceNotes
//-----------------------------------------------------------------------------------------
// - LISTENERS
//-----------------------------------------------------------------------------------------
//    - Listener helpers
//      - getUniqueFileName
//    - Context menu entries (in file explorer)
//      - flag all flows containing file
//      - create new file
//      - create flow from folder
//    - File Events
//      - modify (flag for rebuild)
//      - rename (flag or restore name)
//      - create (flag or move and open)
//      - delete (flag)
//    - Window/editor/workspace events
//      - focus (statcheck active flows)
//      - active-leaf-change (setup/close flow leaves)
//      - layout-change (setup/close flow leaves)
//    - Navigation
//      - isFileExplorerClick
//      - fileExplorerOpenClickListener
//    - Compartments for TRACKING and SAFETY
//      - pertains to:
//          - cursorListener
//          - textChangeListener
//          - transaction filter for UUIDs
//      - makeCompartments
//      - dispatchCompartments
//      - resetCompartments
//      - checkCompartments
//    - TRACKING helpers
//      - checkActiveRegion
//      - addRegionTracking
//      - findActiveRegion
//      - findStartOfRegion
//-----------------------------------------------------------------------------------------
// - Flow Management and UI
//-----------------------------------------------------------------------------------------
//      - isFlowFile
//      - setUpFlow
//      - activateFlow
//      - manageActiveRegions
//      - closeFlow
//      - setupMenuBar
//      - refreshMenuBars
//      - cleanupMenuBar
//-----------------------------------------------------------------------------------------
// - Data safety
//-----------------------------------------------------------------------------------------
//      - (for writelocks/tracking see compartments)
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
    translate: (key: string, variables?: Record<string, string>) => string,
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

    const symbol = this.plugin.settingsTabFunctions.explorerDecoArray[0][0];
    this.progressText = this.container.createDiv({
      cls: "textflow-loading-text",
      text: this.t("main.statsOverlay initial notice", {
        flowName: this.flowName,
      }),
    });
  }

  updateProgress(elapsedTime: number) {
    const text = this.t("setUpFlow.statsCheck done", {
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

// --------------------------------------------------
// ----------- THE PLUGIN CLASS----------------------
// --------------------------------------------------
export default class TextFlowPlugin extends Plugin {
  settings: TextFlowSettings;
  settingsTabFunctions: settingsTabFunctions;
  settingsTab: TextFlowSettingsTab;

  // ------------- global stuff ----------------------
  textFlowSystemFolderName = "textFlowSystemFolder";
  private i18n: Record<string, any> = {}; // localisation

  //--- some variables to keep track of things
  private mostRecentActiveFlowLeaf: WorkspaceLeaf | null = null;
  private lastActiveRegion: string = "/";
  private lastActivity: { [key: string]: number } = {};
  private inactivityThreshold: number = 5 * 60 * 1000;
  private alreadyActivated: {
    [key: string]: { [key: string]: Types.ActivationTuple };
  } = {}; // flowName: {leafID: [activated, cursorFired]}
  private listenerBasket: { [key: string]: Types.ListenerBasketItem } = {}; // is cleaned up in the manageActiveRegions function

  // --- flow out of sync flag to prevent user from creating syncing errors when tracking fails
  flowOutOfSync: string[] = [];

  //----- flags to prevent listeners/functions from interfering with stuff
  isRebuilding: boolean = false; // menuBar
  textFlowOperation: boolean = false; // create, modify and rename listener
  private explorerClickListenerActive: boolean = false; // active-leaf-change listener

  //----- flags that help preserve multi-select behaviour
  private modifierState = {
    shift: false,
    alt: false,
    meta: false,
  };

  // ----- Stuff to avoid save race conditions and broken saves
  private isUnloading: boolean = false;
  private isSavingSettings: boolean = false;
  private pendingSettingsSave: {} | null = null;
  private morePendingSettingsSave: boolean = false;

  // ---------------- Some callbacks -------------------------

  // for timing of flowSwitcherModal display() calls, we need to access them from setUpFlow()
  private modalUpdateCallback: (() => void) | null = null;

  registerModalUpdateCallback(callback: () => void) {
    this.modalUpdateCallback = callback;
  }

  unregisterModalUpdateCallback() {
    this.modalUpdateCallback = null;
  }

  // ---------------- Functions ------------------------------------

  // ---------------- Functions: settingsTabFunctions -------------------------
  async loadSettings(): Promise<TextFlowSettings> {
    const loaded = await this.loadData();
    const mergedSettings = Object.assign({}, DEFAULT_SETTINGS, loaded);
    return mergedSettings;
  }

  // ---------------------------------------------------------------

  saveSettings = async () => {
    // this.settingsTabFunctions.callStack("saveSettings");

    this.pendingSettingsSave = structuredClone(this.settings);
    this.morePendingSettingsSave = true;

    if (this.isSavingSettings || this.isUnloading) {
      if (this.morePendingSettingsSave) {
      }
      return;
    }

    this.isSavingSettings = true;

    try {
      while (this.morePendingSettingsSave) {
        if (this.isUnloading) return;
        this.morePendingSettingsSave = false;

        // Make the temp path
        const tempPath = path.join(
          this.app.vault.configDir,
          "plugins",
          this.manifest.id,
          "data.json.tmp",
        );

        // check if the file exists (after interrupted save) and delete it
        if (await this.app.vault.adapter.exists(tempPath)) {
          await this.app.vault.adapter.remove(tempPath);
        }

        // write the new file
        await this.app.vault.adapter.write(
          tempPath,
          JSON.stringify(this.pendingSettingsSave, null, 2),
        );

        // make data.json path
        const dataJsonPath = path.join(
          this.app.vault.configDir,
          "plugins",
          this.manifest.id,
          "data.json",
        );

        // delete the old data.json
        if (await this.app.vault.adapter.exists(dataJsonPath)) {
          await this.app.vault.adapter.remove(dataJsonPath);
        }
        // then rename the temp file
        await this.app.vault.adapter.rename(tempPath, dataJsonPath);
      }
    } finally {
      this.isSavingSettings = false;
    }
  };

  // ---------------------------------------------------------------
  // see also: discernAndSetSystemFolderState for UI
  ensureSystemFolder = async () => {
    if (this.settings.firstLaunch) return;

    const systemFolder = this.app.vault
      .getAllLoadedFiles()
      .find(
        (file) =>
          file instanceof TFolder &&
          file.name === this.textFlowSystemFolderName,
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
              `${this.settings.systemFolderPath}/${flowName}.md`,
            );
          });
        }
      }
    } else {
      if (this.settings.systemFolderPath) {
        await this.settingsTabFunctions.createSystemFolder(
          this.settings.systemFolderPath,
        );
        this.discernAndSetSystemFolderState();
      } else {
        new Notice(this.t("sysFolder please setup"));
      }
    }
  };

  // ---------------- Functions: settingsTabFunctions: UI/UX -------------------------

  // -------- Localisation (obviously written by Claude)
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

    this.addCommand({
      id: `text-flow-flag-all-for-rebuild`,
      name: this.t("main.registerCommand flag all for rebuild"),
      callback: async () => {
        // flag for rebuild
        for (let flowName of Object.keys(this.settings.flows)) {
          this.settings.flows[flowName].flaggedForRebuild = true;
        }
        await this.saveSettings();

        // refresh menu bars
        const allLeaves = this.app.workspace.getLeavesOfType("markdown");
        for (const leaf of allLeaves) {
          const view = leaf.view as MarkdownView;
          if (!view.menuBar) continue;
          view.menuBar.refresh(view.contentEl);
        }
      },
    });

    // check stats for all flows
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
            }),
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

    // ---------------------------------------------------------------
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
        await this.settingsTabFunctions.rebuildFlow(flowName, "switcher");
      },
    });

    // ---------------------------------------------------------------
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
          const leafID = this.settingsTabFunctions.getLeafId(view.leaf);
          new Modals.FlowSwitcherModal(this.app, this, leafID).open();
        }
      },
    });

    // ---------------------------------------------------------------
    // FuzzNav
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
            flowName,
          ).open();
        } else {
          new Modals.FuzzyNavModal(this.app, this, this.settings).open();
        }
      },
    });

    // ---------------------------------------------------------------
    // toggle explorer navigation so multi-select works as expected
    this.addCommand({
      id: "text-flow-toggle-explorer-listener",
      name: this.t("main.registerCommand toggle explorer navigation"),
      callback: async () => {
        this.settings.explorerListener
          ? (this.settings.explorerListener = false)
          : (this.settings.explorerListener = true);
        await this.saveSettings();
        new Notice(
          this.t("main toggle explorer navigation notice", {
            explorerNavigationToggleState: this.settings.explorerListener
              ? "ON"
              : "OFF",
          }),
        );
      },
    });

    // ---------------------------------------------------------------
    // min/max menu bar
    this.addCommand({
      id: "text-flow-toggle-menu-bar",
      name: this.t("main.registerCommand toggle menu bar"),
      callback: async () => {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
          const path = activeView.file?.path;
          if (!path) return;

          const flowName = this.isFlowFile(path);
          if (!flowName) return;

          const leafID = this.settingsTabFunctions.getLeafId(activeView.leaf);
          if (!leafID) return;

          for (let leaf of Object.keys(this.settings.activeRegions[flowName])) {
          }
          // toggle the setting
          this.settings.activeRegions[flowName][leafID].leafMenuBarSettings
            .menuBarDisplayState === "max"
            ? (this.settings.activeRegions[flowName][
                leafID
              ].leafMenuBarSettings.menuBarDisplayState = "min")
            : (this.settings.activeRegions[flowName][
                leafID
              ].leafMenuBarSettings.menuBarDisplayState = "max");
          await this.saveSettings();
          this.refreshMenuBars();
        }
      },
    });

    // ---------------------------------------------------------------
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
        this.settingsTabFunctions.exportFlow(flowName);
      },
    });

    // ---------------------------------------------------------------
    // select active region
    this.addCommand({
      id: "text-flow-select-active-region",
      name: this.t("main.registerCommand select active region"),
      callback: () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        if (!view.file) return;

        const activeLeafPath = view.file.path;
        const leafID = this.settingsTabFunctions.getLeafId(view.leaf);
        const flowName = this.isFlowFile(activeLeafPath);
        if (!flowName) return;
        if (!this.settings.activeRegions[flowName]) return;
        if (!this.settings.activeRegions[flowName][leafID]) return;
        if (!this.settings.activeRegions[flowName][leafID].path) return;

        const activeRegion = normalizePath(
          this.settings.activeRegions[flowName][leafID].path,
        );
        if (!activeRegion) return;

        this.settingsTabFunctions.selectActiveRegion(
          flowName,
          activeRegion,
          view.editor.getValue(),
          view.editor,
        );
      },
    });

    // ---------------------------------------------------------------
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

        const leafID = this.settingsTabFunctions.getLeafId(activeView.leaf);
        // check if we got data for that leafID
        this.settingsTabFunctions.restoreCursorPos(
          flowName,
          activeView,
          leafID,
        );
      },
    });

    // ---------------------------------------------------------------
    // toggle scrollbar
    this.addCommand({
      id: "text-flow-toggle-scroll-bar",
      name: this.t("main.registerCommand toggle scroll bar"),
      callback: async () => {
        if (this.settings.hideScrollbar === "none") {
          this.settings.hideScrollbar = "all";
          await this.saveSettings();
          this.settingsTabFunctions.updateScrollbarVisibility();
        } else if (this.settings.hideScrollbar === "all") {
          this.settings.hideScrollbar = "none";
          await this.saveSettings();
          this.settingsTabFunctions.updateScrollbarVisibility();
        }
      },
    });
  };

  // ----- this is called onload and sets the visibility of textFlowSystemFolderName
  discernAndSetSystemFolderState = (): void => {
    const systemFolderPath = this.settings.systemFolderPath;
    const systemFolderHidden = this.settings.systemFolderHidden;

    // Remove any existing style
    const existingStyle = document.head.querySelector(
      "style[data-textflow-temp]",
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
            const leafID = this.settingsTabFunctions.getLeafId(activeView.leaf);

            for (let flowName of Object.keys(this.settings.activeRegions)) {
              if (this.settings.activeRegions[flowName][leafID]) {
                activeRegionPath =
                  this.settings.activeRegions[flowName][leafID].path;
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
      // Remove trailing slash (if it exists)
      const cleanPath = path.endsWith("/") ? path.slice(0, -1) : path;

      // First remove any existing styles for this path
      const existingStyles = document.head.querySelectorAll(
        "style[data-textflow-neutral], style[data-textflow-unsynced]",
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
        `div[data-path='${this.escapeSelector(cleanPath)}']`,
      );
      const folderElement = document.querySelector(
        `div[data-path='${this.escapeSelector(cleanPath)}'] .nav-folder-title`,
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

          // The CSS part was written by Claude and refined by ChatGPT, amy logic is by me
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
        cleanPath,
      )}'] .nav-file-title-content,
      div[data-path='${this.escapeSelector(
        cleanPath,
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
          cleanPath,
        )}'] .nav-file-title-content,
        div[data-path='${this.escapeSelector(
          cleanPath,
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
    cleanPath,
  )}'] .nav-file-title-content::after,
  div[data-path='${this.escapeSelector(
    cleanPath,
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
      cleanPath,
    )}'] .tree-item-self.nav-file-title,
  div[data-path='${this.escapeSelector(
    cleanPath,
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
          cleanPath,
        )}'] .tree-item-self.nav-file-title,
        div[data-path='${this.escapeSelector(
          cleanPath,
        )}'] .tree-item-self.nav-folder-title {
          background-color: var(--nav-item-background-active) !important;
        }
        div[data-path='${this.escapeSelector(
          cleanPath,
        )}'] .nav-file-title-content::after,
        div[data-path='${this.escapeSelector(
          cleanPath,
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

    // -------- MORE LOGIC -----------------
    // handle general paths
    const handledPaths: { [key: string]: boolean } = {};
    let flowArray: string[] = [];

    // if we redo, we need all flows, else we just need the active ones
    if (mode === "redo") {
      flowArray = Object.keys(this.settings.flows);
    } else {
      flowArray = Object.keys(this.settings.activeRegions);
    }

    for (let flowName of flowArray) {
      // get the file list
      for (path of Object.keys(this.settings.flows[flowName].flowMap)) {
        // exclude folder titles
        if (path.startsWith("#")) continue;

        // and we only need to do this if we redo the whole shebang
        if (mode === "redo") {
          // if we're handling a flow that is active, track the path
          if (this.settings.activeRegions[flowName]) {
            handledPaths[path] = true;
          }
          // if we're handling a non-active flow, protect the known active paths
          if (!this.settings.activeRegions[flowName]) {
            if (handledPaths[path]) continue;
            decoStyle = "none";
            handlePath(path, decoStyle as Types.DecoStyle);
            continue;
          }
        }
        // handle the path
        if (
          this.settings.activeRegions[flowName] &&
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

  // ---------------------------------------------------------------
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
        "style[data-textflow-neutral], style[data-textflow-unsynced]",
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

  // ---------------------------------------------------------------
  //------ function to clean up paths for CSS handling; used by deco function
  // written by Claude
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

  // this little thing was written by Claude and painstakingly fixed by me
  getUniqueFileName = (
    basePath: string,
    inputName: string = "_untitled.md",
  ) => {
    let number = 0;
    let fullPath = "";
    let nakedName = inputName;
    if (inputName.endsWith(".md")) {
      // if it has a suffix, remove it, so we can append numbers
      nakedName = inputName.slice(0, inputName.length - 3);
      fullPath = normalizePath(`${basePath}/${nakedName}.md`);
    } else {
      fullPath = normalizePath(`${basePath}/${nakedName}`);
    }

    if (!this.app.vault.getAbstractFileByPath(fullPath)) {
      if (inputName.endsWith(".md")) return `${nakedName}.md`;
      return `${nakedName}`;
    }

    // If the file/folder does exist
    while (this.app.vault.getAbstractFileByPath(fullPath)) {
      const item = this.app.vault.getAbstractFileByPath(fullPath);
      number++;
      if (inputName.endsWith(".md")) {
        fullPath = normalizePath(`${basePath}/${nakedName} ${number}.md`);
      } else if (item instanceof TFolder) {
        fullPath = normalizePath(`${basePath}/${nakedName} ${number}`);
      }
    }
    if (inputName.endsWith(".md")) return `${nakedName} ${number}.md`;
    return `${nakedName} ${number}`;
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
                }),
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
                    this.settings.flows,
                  )) {
                    pathLoop: for (let path of Object.keys(
                      this.settings.flows[flowName].flowMap,
                    )) {
                      if (!this.settings.flows[flowName].flaggedForRebuild) {
                        for (let path of Object.keys(
                          this.settings.flows[flowName].flowMap,
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
        }),
      );
    }

    // ---------------------------------------------------------------
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

              const itemCreationModal = new Modals.CreateNewItem(
                this.app,
                this,
                parentFolder,
              );
              itemCreationModal.open();

              const newFileName = this.getUniqueFileName(parentFolder);
              const newFilePath = normalizePath(
                `/${parentFolder}/${newFileName}.md`,
              );

              await this.app.vault.create(newFilePath, "");
            });
        });
      }),
    );

    // ---------------------------------------------------------------
    // thing to make flow from selected folder
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile) return;
        menu.addItem((item) => {
          item
            .setTitle(
              this.t("main.fileMenuListener.context make flow from folder"),
            )
            .onClick(async () => {
              const normalisedPath = normalizePath(file.path);
              let parentFolder = normalisedPath;
              if (file instanceof TFile) {
                parentFolder = dirname(normalisedPath);
              }
              // empty the basket, just in case
              this.settingsTabFunctions.resetFlowBuildBasket(
                this.settings.flowBuildBasket,
              );
              // put defaults in
              this.settings.flowBuildBasket.flowName = `${basename(
                parentFolder,
              )}`;
              this.settings.flowBuildBasket.oldFlowName = `${basename(
                parentFolder,
              )}`;
              this.settings.flowBuildBasket.flowDefinition.folderIncluded =
                parentFolder;
              this.settings.flowBuildBasket.definitionMode = "foldersTagsProps";
              this.settings.flowBuildBasket.flowDefinition.pathsTagsPropertiesSortOrder =
                "noteOrder";
              this.settings.flowBuildBasket.folderTitles = true;
              // reset of the basket happens in the modal
              await this.saveSettings();

              const flowCreationModal = new Modals.CreateFlowFromFolder(
                this.app,
                this,
              );
              flowCreationModal.open();
            });
        });
      }),
    );

    // ---------------------------------------------------------------
    // ------ same but for multiple folders
    this.registerEvent(
      this.app.workspace.on("files-menu", (menu, files) => {
        let folders: number = 0;
        for (let file of files) {
          if (file instanceof TFolder) ++folders;
        }
        if (folders === 0) return;
        menu.addItem((item) => {
          item;
          if (folders === 1) {
            item.setTitle(
              this.t("main.fileMenuListener.context make flow from folder"),
            );
          } else {
            item.setTitle(
              this.t("main.fileMenuListener.context make flow from folderS"),
            );
          }
          item.onClick(async () => {
            const inclusionPathArray = [];
            for (let file of files) {
              if (file instanceof TFolder) {
                inclusionPathArray.push(file.path);
              }
            }

            // sometimes the array comes out not in alphanumeric order, so...
            inclusionPathArray.sort((a, b) => a.localeCompare(b));

            // empty the basket, just in case
            this.settingsTabFunctions.resetFlowBuildBasket(
              this.settings.flowBuildBasket,
            );
            // put defaults in
            this.settings.flowBuildBasket.flowName = this.t("modal_flowName");
            this.settings.flowBuildBasket.oldFlowName =
              this.t("modal_flowName");
            this.settings.flowBuildBasket.flowDefinition.folderIncluded =
              inclusionPathArray.join(",");
            this.settings.flowBuildBasket.definitionMode = "foldersTagsProps";
            this.settings.flowBuildBasket.flowDefinition.pathsTagsPropertiesSortOrder =
              "noteOrder";
            this.settings.flowBuildBasket.folderTitles = true;
            // reset of the basket happens in the modal
            await this.saveSettings();

            const flowCreationModal = new Modals.CreateFlowFromFolder(
              this.app,
              this,
            );
            flowCreationModal.open();
          });
        });
      }),
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
      }),
    );

    // ---------------------------------------------------------------
    // Rename events
    this.registerEvent(
      this.app.vault.on(
        "rename",
        async (file: TAbstractFile, oldPath: string) => {
          // return early
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

          // CHECK FOR SYSTEM FOLDER ITSELF
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
              }),
            );
            return;
          } // or if they moved the system folder
          else if (basename(oldPath) === this.textFlowSystemFolderName) {
            // update system folder data
            await this.ensureSystemFolder();
            return;
          }

          // CHECK FOR FLOW FILES
          let rawNewFileName = basename(file.path).slice(
            0,
            basename(file.path).length - 3,
          );
          // is the file in sysFolder?
          if (newParentFolder === this.textFlowSystemFolderName) {
            // if it's a valid flow file, all is well
            if (this.settings.flows[rawNewFileName]) {
              return;
            } // if it's not a valid flow file, check where it came from
            else {
              // notify the user
              if (oldParentFolder === this.textFlowSystemFolderName) {
                new Notice(
                  this.t("main.renameListener.notice use settings to rename"),
                );
              } else {
                new Notice(
                  this.t(
                    "main.renameListener.notice element moved to system folder; was moved back",
                  ),
                );
              }
              // then revert the rename
              this.textFlowOperation = true;
              await this.app.vault.rename(file, oldPath);
              this.textFlowOperation = false;
              return;
            }
          } else {
            // if it's outside the sys folder, check if it's a flow
            if (this.settings.flows[rawNewFileName]) {
              // and if they moved it from the sys folder
              if (oldParentFolder === this.textFlowSystemFolderName) {
                new Notice(this.t("main.renameListener.notice use export"));
              }
              // then revert the rename
              this.textFlowOperation = true;
              await this.app.vault.rename(file, oldPath);
              this.textFlowOperation = false;
              return;
            }
          }

          // CHECK EVERYTHING ELSE
          for (let flowName of Object.keys(this.settings.flows)) {
            if (this.settings.flows[flowName].flaggedForRebuild) continue;

            // if we got a file and it's part of the flow
            if (
              file instanceof TFile &&
              this.settings.flows[flowName].flowMap[oldPath]
            ) {
              this.settings.flows[flowName].flaggedForRebuild = true;
              // await this.saveSettings();
              continue;
            }

            // if we got a folder and it provides parts of the flow
            if (file instanceof TFolder) {
              for (let regionPath of Object.keys(
                this.settings.flows[flowName],
              )) {
                if (dirname(regionPath) === oldPath) {
                  this.settings.flows[flowName].flaggedForRebuild = true;
                  // await this.saveSettings();
                  continue;
                }
              }
            }

            // if the flow is defined from bookmarks, we can move on
            if (this.settings.flows[flowName].definitionMode === "bookmarks")
              continue;

            // if the flow is defined from a path and the parent is included
            if (
              newParentFolder ===
              this.settings.flows[flowName].flowDefinition.folderIncluded
            ) {
              this.settings.flows[flowName].flaggedForRebuild = true;
              // await this.saveSettings();
              continue;
            }
            if (
              // if the path starts with inclusion path and subfolders aren't excluded
              newParentFolder.startsWith(
                this.settings.flows[flowName].flowDefinition.folderIncluded +
                  "/",
              ) &&
              !this.settings.flows[
                flowName
              ].flowDefinition.folderIncluded.endsWith("/")
            ) {
              // if the exclusion criterion isn't empty
              if (this.settings.flows[flowName].flowDefinition.folderExcluded) {
                const exclusionArray =
                  this.settings.flows[
                    flowName
                  ].flowDefinition.folderExcluded.split(",");
                const isExcluded = exclusionArray.some((path) =>
                  newParentFolder.includes(path.trim() + "/"),
                );
                if (isExcluded) continue;
              }
              this.settings.flows[flowName].flaggedForRebuild = true;
              // await this.saveSettings();
              continue;
            }
          }
          await this.saveSettings();
        },
      ),
    );

    // ---------------------------------------------------------------
    // Create events
    this.registerEvent(
      this.app.vault.on("create", async (file: TAbstractFile) => {
        // return early if textFlow is doing stuff
        if (!this.app.workspace.layoutReady) return;
        if (this.textFlowOperation) return;
        let parentFolder = normalizePath(dirname(file.path));
        if (file instanceof TFolder) {
          parentFolder = normalizePath(file.path);
        }

        if (
          // if the user put a new file in the system folder the check for .md is so that stuff by - for example - Edit History doesn't get flagged
          parentFolder === this.settings.systemFolderPath &&
          file.path.endsWith(".md")
        ) {
          // If a new .md file gets created in the system folder, it's because the user has set 'create new file in same folder as active file', so we simulate that behaviour by getting the path for last active region and moving the file into the respective folder

          setTimeout(async () => {
            const baseName = basename(file.path);
            const basePath = dirname(this.lastActiveRegion);
            const newFileName = await this.getUniqueFileName(
              basePath,
              baseName,
            );
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
                { newFilePath: basePath },
              ),
            );
          }, 100);
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
              this.settings.flows[flowName].flowDefinition.folderIncluded,
            ) &&
            (parentFolder ===
              this.settings.flows[flowName].flowDefinition.folderIncluded ||
              !this.settings.flows[
                flowName
              ].flowDefinition.folderIncluded.endsWith("/"))
          ) {
            if (this.settings.flows[flowName].flowDefinition.folderExcluded) {
              const exclusionArray =
                this.settings.flows[
                  flowName
                ].flowDefinition.folderExcluded.split(",");
              const isExcluded = exclusionArray.some((path) =>
                parentFolder.includes(path.trim() + "/"),
              );
              if (isExcluded) continue;
            }
            this.settings.flows[flowName].flaggedForRebuild = true;
            await this.saveSettings();
          }
        }
      }),
    );

    // ---------------------------------------------------------------
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
            // check if the user deleted a flow file and flag it for rebuild
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
                  normalizePath(file.path),
                )
              ) {
                const cleanedArray = this.settings.flows[
                  flowName
                ].unsyncedRegionsArray.filter(
                  (path) => path !== normalisedPath,
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
      }),
    );

    // ---------- Window/Editor events
    // ----------------- Auto-sync and checks on focus  -------------------------------
    this.registerDomEvent(window, "focus", async () => {
      for (let flowName of Object.keys(this.settings.activeRegions)) {
        await this.checkStatsForFlow(flowName);
      }
    });

    // ------------- Modifier keys
    // this is so the fileExplorerClickListener doesn't interfere as much
    this.registerDomEvent(document, "keydown", (event: KeyboardEvent) => {
      if (event.key === "Shift") this.modifierState.shift = true;
      if (event.key === "Alt") this.modifierState.alt = true;
      if (event.key === "Meta") this.modifierState.meta = true;
    });

    this.registerDomEvent(document, "keyup", (event: KeyboardEvent) => {
      if (event.key === "Shift") this.modifierState.shift = false;
      if (event.key === "Alt") this.modifierState.alt = false;
      if (event.key === "Meta") this.modifierState.meta = false;
    });

    // ---------------------------------------------------------------
    // Opening/closing/switching of leaves
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", async (leaf) => {
        // so we skip if the explorerClickListener is already taking care of stuff
        if (this.explorerClickListenerActive) {
          return;
        }
        this.leafSwitching();
      }),
    );

    this.registerEvent(
      this.app.workspace.on("layout-change", async () => {
        this.leafSwitching();
      }),
    );
  }

  // ---------------- Functions: Listeners: Tracking in editor ----------

  // -------------- Listeners: Compartments -----------------------------------------
  private makeCompartments = async (view: MarkdownView) => {
    const cmView = this.settingsTabFunctions.getEditorView(view.editor);
    const leafID = this.settingsTabFunctions.getLeafId(view.leaf);

    if (!cmView) return;
    if (!view) return;

    const activeLeafPath = view.file?.path;
    if (!activeLeafPath) return;

    const flowName = this.isFlowFile(activeLeafPath);
    if (!flowName) {
      this.resetCompartments(leafID, cmView);
      return;
    }

    // the three extensions were originally written with a lot of AI involvement
    // getting it to actually work was mostly me, though

    // -------- CURSOR LISTENER -------------------
    if (!this.listenerBasket[leafID] || !this.listenerBasket[leafID].cursor) {
      const plugin = this;
      let lastCursorPosition: number | null = null;
      let cursorDebounceTimeout: NodeJS.Timeout | null = null;

      const cursorListenerCompartment = new Compartment();

      const cursorListener = ViewPlugin.fromClass(
        class {
          constructor(view: EditorView) {}

          update(update: ViewUpdate) {
            if (!update.selectionSet) return;

            const cursorOffset = update.state.selection.main.from;

            if (cursorOffset !== lastCursorPosition) {
              lastCursorPosition = cursorOffset;

              if (cursorDebounceTimeout) {
                clearTimeout(cursorDebounceTimeout);
              }

              cursorDebounceTimeout = setTimeout(async () => {
                if (!plugin.settings.flows[flowName]) {
                  throw new Error(`Flow ${flowName} not found in settings`);
                }

                // register activity so textChange listener can start firing
                if (plugin.alreadyActivated[flowName]) {
                  if (plugin.alreadyActivated[flowName][leafID]) {
                    if (!plugin.alreadyActivated[flowName][leafID][1]) {
                      plugin.alreadyActivated[flowName][leafID][1] = true;
                    }
                  }
                }

                // this sets off a chain of functions which updates the active Region
                await plugin.checkActiveRegion(
                  flowName,
                  leafID,
                  cursorOffset,
                  view,
                );
              }, 250);
            }
          }

          destroy() {
            if (cursorDebounceTimeout) {
              clearTimeout(cursorDebounceTimeout);
            }
          }
        },
      );
      // put it all in the basket

      if (!this.listenerBasket[leafID]) {
        this.listenerBasket[leafID] = {};
      }
      this.listenerBasket[leafID].cursor = {
        compartment: cursorListenerCompartment,
        extension: cursorListener,
        emptyReference: [],
      };
    }

    // -------- TEXT CHANGE LISTENER -------------------
    if (
      !this.listenerBasket[leafID] ||
      !this.listenerBasket[leafID].textChange
    ) {
      // ---------- actual listener stuff

      const plugin = this;
      let textChangeDebounceTimeout: NodeJS.Timeout | null = null;

      const textChangeListenerCompartment = new Compartment();

      const textChangeListener = ViewPlugin.fromClass(
        class {
          constructor(view: EditorView) {}

          update(update: ViewUpdate) {
            if (!update.docChanged) return;

            const changes = update.changes;

            // return if no actual text change has taken place
            if (changes.empty) return;

            if (textChangeDebounceTimeout) {
              clearTimeout(textChangeDebounceTimeout);
            }

            textChangeDebounceTimeout = setTimeout(async () => {
              // Prevent rebuilds and app reload from registering as text change
              if (plugin.settings.flows[flowName].isFreshBuild) {
                plugin.settings.flows[flowName].isFreshBuild = false;
                return;
              }
              if (plugin.alreadyActivated[flowName]) {
                if (plugin.alreadyActivated[flowName][leafID]) {
                  if (!plugin.alreadyActivated[flowName][leafID][1]) {
                    return;
                  }
                }
              }

              // Ensure that active region for the leaf is of type 'file'
              if (!plugin.settings.activeRegions[flowName]) return;
              if (!plugin.settings.activeRegions[flowName][leafID]) return;

              const activeRegionPath =
                plugin.settings.activeRegions[flowName][leafID].path;
              if (!activeRegionPath) return;

              let callRefresh =
                plugin.settings.flows[flowName].unsyncedRegionsArray.length ===
                0
                  ? true
                  : false;

              if (
                !plugin.settings.flows[flowName].unsyncedRegionsArray.includes(
                  activeRegionPath,
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
                      activeRegionPath,
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
                  activeRegionPath,
                );
                await plugin.saveSettings();
              }

              if (callRefresh) {
                // update the menu bar to show unsynced status
                if (view.menuBar) {
                  view.menuBar.refresh(view.contentEl);
                }
                callRefresh = false;
              }

              // update source decoration
              if (plugin.settings.explorerDecoStyle[0] != "--") {
                plugin.decorateSourceNotes("update");
              }
            }, 250);
          }

          destroy() {
            if (textChangeDebounceTimeout) {
              clearTimeout(textChangeDebounceTimeout);
            }
          }
        },
      );
      if (!this.listenerBasket[leafID]) {
        this.listenerBasket[leafID] = {};
      }
      this.listenerBasket[leafID].textChange = {
        compartment: textChangeListenerCompartment,
        extension: textChangeListener,
        emptyReference: [],
      };
    }

    // -------- DIVIDER PROTECTION -------------------

    if (!this.listenerBasket[leafID] || !this.listenerBasket[leafID].divider) {
      const dividerProtectionCompartment = new Compartment();

      // And another bit of slop
      const dividerProtectionListener = EditorState.transactionFilter.of(
        (tr) => {
          // if the flow is being rebuilt, we need to suspend protection otherwise the editor contents can't be updated
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
                  (fromA <= absoluteDividerStart &&
                    toA >= absoluteDividerEnd) ||
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
        },
      );

      if (!this.listenerBasket[leafID]) {
        this.listenerBasket[leafID] = {};
      }
      this.listenerBasket[leafID].divider = {
        compartment: dividerProtectionCompartment,
        extension: dividerProtectionListener,
        emptyReference: [],
      };
    }

    // and finally we dispatch the whole kitten kaboodle to the editor
    this.dispatchCompartments(leafID, cmView);
  };

  // ---------------------------------------------------------------
  // for this I actually read the CodeMirror docu
  dispatchCompartments = (leafID: string, cmView: EditorView) => {
    const typesArray = ["cursor", "textChange", "divider"];

    for (let type of typesArray) {
      if (!this.listenerBasket[leafID][type].compartment.get(cmView.state)) {
        // if compartment is not present in this editor
        cmView.dispatch({
          effects: StateEffect.appendConfig.of([
            this.listenerBasket[leafID][type].compartment.of([
              this.listenerBasket[leafID][type].extension,
            ]),
          ]),
        });
      }

      // if the extension has been reset
      const extension = this.listenerBasket[leafID][type].compartment.get(
        cmView.state,
      );

      if (extension === this.listenerBasket[leafID][type].emptyReference) {
        cmView.dispatch({
          effects: StateEffect.reconfigure.of([
            this.listenerBasket[leafID][type].compartment.of([
              this.listenerBasket[leafID][type].extension,
            ]),
          ]),
        });
      }
    }
  };

  // ---------------------------------------------------------------
  // I read so much docu, I feel like a snob
  resetCompartments = (leafID: string, cmView: EditorView) => {
    const typesArray = ["cursor", "textChange", "divider"];

    for (let type of typesArray) {
      if (!this.listenerBasket[leafID]) return;
      if (!this.listenerBasket[leafID][type]) continue;
      if (!this.listenerBasket[leafID][type].compartment.get(cmView.state))
        continue;

      // if the extension is present
      const extension = this.listenerBasket[leafID][type].compartment.get(
        cmView.state,
      );
      // but it is not empty
      if (extension != this.listenerBasket[leafID][type].emptyReference) {
        cmView.dispatch({
          effects: StateEffect.reconfigure.of([
            this.listenerBasket[leafID][type].compartment.of([
              this.listenerBasket[leafID][type].emptyReference,
            ]),
          ]),
        });
      }
    }
  };

  // ---------------------------------------------------------------
  checkCompartments = (leafID: string, cmView: EditorView) => {
    const typesArray = ["cursor", "textChange", "divider"];
    for (let type of typesArray) {
      if (!this.listenerBasket[leafID]) return false;
      if (!this.listenerBasket[leafID][type]) return false;
      if (!this.listenerBasket[leafID][type].compartment.get(cmView.state))
        return false;

      // if the extension is present
      const extension = this.listenerBasket[leafID][type].compartment.get(
        cmView.state,
      );
      if (!extension) return false;
      if (extension === this.listenerBasket[leafID][type].emptyReference)
        return false;
    }
    return true;
  };

  // ---------------------------------------------------------------
  // The listener parts of this were written by AI
  // -------- helpers for the fileExplorerClickListener
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

  // ---------------------------------------------------------------
  // ---- This listener is for navigating flows via the file explorer
  // it is removed onunload. It's also a nervous steed, so just admire it from afar.
  private boundFileExplorerClick: (event: MouseEvent) => void;

  fileExplorerOpenClickListener = () => {
    this.boundFileExplorerClick = async (event: MouseEvent) => {
      if (
        this.modifierState.shift === true ||
        this.modifierState.alt === true ||
        this.modifierState.meta === true
      )
        return;

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
      const activeRegionsSnapshot = this.settings.activeRegions;

      // Prevent Obsidian's default click action immediately.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      let clickHandled = false;

      // get all leaves and check if the note the user wants is already open
      const leaves = this.app.workspace.getLeavesOfType("markdown");
      const noteIsOpen = leaves.find(
        (leaf) =>
          leaf.view instanceof MarkdownView &&
          (leaf.view as MarkdownView).file?.path === clickedFilePath,
      );

      // then check if it's a flow file
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

        for (const flowName in activeRegionsSnapshot) {
          if (Object.keys(activeRegionsSnapshot[flowName]).length != 0) {
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
          this.explorerClickListenerActive = true;
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
                  leaf.view.file?.path === flowFilePath,
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
                    (leaf.view as MarkdownView).file?.path === flowFilePath,
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
            const editor = flowView.editor as Types.ObsidianEditor;
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
                "TextFlow: Active leaf changed unexpectedly. Forcing it back to flow leaf before scrolling.",
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
              flowDocumentText,
            );

            // make sure info is good
            if (startPosInFlow !== undefined && startPosInFlow >= 0) {
              const line = cmEditor.state.doc.lineAt(
                Math.max(0, startPosInFlow),
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
              err,
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
  };

  // --------------- Listeners: Tracking helpers -----------------------------------------
  private checkActiveRegion = async (
    flowName: string,
    leafID: string,
    cursorOffset: number,
    view: MarkdownView,
  ) => {
    // this is to prevent error messages when activating a leaf triggers a check and/or rebuild
    if (this.settings.flows[flowName].flaggedForRebuild) return;

    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) return;

    const editor = activeView.editor as Types.ObsidianEditor;
    const cmEditor = editor.cm;
    if (!cmEditor) return;

    // Get full document text from CodeMirror state
    const text = cmEditor.state.doc.toString();

    if (cursorOffset >= text.length - 1) {
      new Notice(
        this.t("endOfFlow.notice don't type here", {
          flowName: flowName,
        }),
        30000,
      );
    }

    // if this is the initial call for the leaf, give it an active region
    if (!this.settings.activeRegions[flowName][leafID]) {
      let activeRegionObject = this.findActiveRegion(
        flowName,
        editor,
        leafID,
        cursorOffset,
        text,
      );

      // double check because active region could come back undefined
      if (activeRegionObject) {
        // we're in sync
        // inform the user if necessary
        if (this.flowOutOfSync.includes(flowName)) {
          new Notice(
            this.t("checkActiveRegion.notice region tracking error resolved", {
              flowName: flowName,
            }),
            0,
          );
        }
        // update the array
        const filteredArray = this.flowOutOfSync.filter((filterFlowname) => {
          filterFlowname != flowName;
        });
        this.flowOutOfSync = filteredArray;

        this.settings.activeRegions[flowName][leafID] = activeRegionObject;
        // then check if the active region overlaps and send a notice
        if (activeRegionObject.path) {
          this.lastActiveRegion = activeRegionObject.path;
          this.decorateSourceNotes("update");
          this.notifyOfOverlap(activeRegionObject.path, flowName, leafID);
        }

        await this.saveSettings();
        return;
      }
    } else {
      const markerRegex =
        /[\u200B\u200C\u200D\u2060\u2061\u2062\u2063\u2064\uFEFF\u00A0]{46}<hr>/;
      const searchStart = text.slice(cursorOffset);
      const matches = searchStart.match(markerRegex);

      if (!matches) {
        console.error("textFlow: No UUID marker found in this.");
        return;
      }

      // Check if we're still in the same region
      const UIDLength = matches[0].length - 4;
      const nextUID = matches[0].slice(0, UIDLength);

      // if we're still in the same region, only update the cursor position
      if (
        nextUID === this.settings.activeRegions[flowName][leafID].invisibleUUID
      ) {
        this.settings.activeRegions[flowName][leafID].currentCursorPos =
          cursorOffset;
      }
      if (
        nextUID != this.settings.activeRegions[flowName][leafID].invisibleUUID
      ) {
        // new terrain!
        this.settings.activeRegions[flowName][leafID].currentCursorPos =
          cursorOffset;
        // Use a map and compass
        let activeRegion = this.findActiveRegion(
          flowName,
          editor,
          leafID,
          cursorOffset,
          text,
        );

        if (activeRegion) {
          // we're in sync
          // inform the user if necessary
          if (this.flowOutOfSync.includes(flowName)) {
            new Notice(
              this.t(
                "checkActiveRegion.notice region tracking error resolved",
                {
                  flowName: flowName,
                },
              ),
              0,
            );
          }
          // update the array
          const filteredArray = this.flowOutOfSync.filter((filterFlowname) => {
            filterFlowname != flowName;
          });
          this.flowOutOfSync = filteredArray;

          this.lastActiveRegion = activeRegion.path;
          const activeRegionPath = activeRegion.path;
          // if the user wants checks, always check the new region
          if (
            !activeRegionPath?.startsWith("#") &&
            this.settings.checkExternalEdits != "no"
          ) {
            if (activeRegionPath) {
              const flowHasEdits = await this.checkStatsForNote(
                flowName,
                activeRegionPath,
              );
              if (flowHasEdits) {
                await this.settingsTabFunctions.rebuildFlow(
                  flowName,
                  "menuBar",
                );
                new Notice(
                  this.t("main.cursorTracker.notice", {
                    flowName: flowName,
                  }),
                );
                this.lastActivity[flowName] = Date.now();
              }
            }
          }
          this.settings.activeRegions[flowName][leafID] = activeRegion;
          await this.saveSettings();
          this.decorateSourceNotes("update");
          if (view.menuBar) {
            view.menuBar.refresh(view.contentEl);
          }
          if (activeRegion.path) {
            this.notifyOfOverlap(activeRegion.path, flowName, leafID);
          }
        } else {
          // if the compass just cirles, set flag to prevent saves and notify the user
          if (!this.flowOutOfSync.includes(flowName)) {
            this.flowOutOfSync.push(flowName);
          }
          if (view.menuBar) {
            view.menuBar.refresh(view.contentEl);
          }
          new Notice(
            this.t("checkActiveRegion.notice region tracking error", {
              flowName: flowName,
            }),
            0,
          );
        }
      }
    }
  };

  // ---------------------------------------------------------------
  // ----- add region tracking for new leafs, because we get errors if we don't
  addRegionTracking = async (flowName: string, leafID: string) => {
    const [path, targetObject] =
      Object.entries(this.settings.flows[flowName].flowMap).find(
        ([_, obj]) => obj.flowOrder === 1,
      ) || [];
    if (targetObject) {
      if (!this.settings.activeRegions[flowName])
        this.settings.activeRegions[flowName] = {};
      const { type, invisibleUUID, flowOrder } = targetObject;
      this.settings.activeRegions[flowName][leafID] = {
        currentCursorPos: 0,
        path: path ? path : "",
        invisibleUUID: targetObject.invisibleUUID,
        leafMenuBarSettings: {
          menuBarDisplayState: this.settings.menuBarDefault,
          navDropdownState: "hide",
          navDropdownSearchTerm: undefined,
          cursorDropdownState: "hide",
        },
      };
      await this.saveSettings();
    }
  };

  // ---------------------------------------------------------------
  // returns an activeRegion object
  private findActiveRegion = (
    flowName: string,
    editor: Types.ObsidianEditor,
    leafID: string,
    cursorOffset: number,
    text: string,
  ) => {
    // The regEx, of course, is AI slop
    const markerRegex =
      /[\u200B\u200C\u200D\u2060\u2061\u2062\u2063\u2064\uFEFF\u00A0]{46}<hr>/;

    // Handle extreme conditions
    if (cursorOffset === 0) {
      // Get first region from flow map
      const firstRegion = Object.entries(
        this.settings.flows[flowName].flowMap,
      ).find(([_, regionMap]) => regionMap.flowOrder === 1);

      if (firstRegion) {
        const [path, regionMap] = firstRegion;
        // Move cursor to safe position in first region
        const safePos = 1;
        this.settingsTabFunctions.scrollToPos(editor, safePos);

        // then return region data
        return {
          currentCursorPos: safePos,
          path: path,
          invisibleUUID: regionMap.invisibleUUID,
          leafMenuBarSettings:
            this.settings.activeRegions[flowName][leafID].leafMenuBarSettings,
        };
      }
    }

    if (cursorOffset >= text.length - 46) {
      // Get last region from flow map
      const lastRegion = Object.entries(
        this.settings.flows[flowName].flowMap,
      ).find(
        ([_, regionMap]) =>
          regionMap.flowOrder ===
          Object.keys(this.settings.flows[flowName].flowMap).length,
      );

      if (lastRegion) {
        const [path, regionMap] = lastRegion;
        // Move cursor to safe position in last region
        const safePos = text.lastIndexOf(regionMap.invisibleUUID) - 1;
        this.settingsTabFunctions.scrollToPos(editor, safePos);

        // and return region data
        return {
          currentCursorPos: safePos,
          path: path,
          invisibleUUID: regionMap.invisibleUUID,
          leafMenuBarSettings:
            this.settings.activeRegions[flowName][leafID].leafMenuBarSettings,
        };
      }
    }

    // if we're already in a safe position
    let additonalOffset = 0;
    if (cursorOffset >= 46) additonalOffset = 46;
    const searchStart = text.slice(cursorOffset - additonalOffset);
    const matches = searchStart.match(markerRegex);

    if (matches) {
      const UIDLength = matches[0].length - 4;
      const UID = matches[0].slice(0, UIDLength);

      const foundRegion = Object.entries(
        this.settings.flows[flowName].flowMap,
      ).find(([_, foundRegionMap]) => foundRegionMap.invisibleUUID === UID);

      if (!foundRegion) {
      }
      if (foundRegion) {
        const [foundRegionPath, foundRegionMap] = foundRegion;

        // put the object together
        const activeRegionObject: Types.ActiveRegion = {
          currentCursorPos: cursorOffset,
          path: foundRegionPath,
          invisibleUUID: UID,
          leafMenuBarSettings: {
            menuBarDisplayState:
              this.settings.activeRegions[flowName][leafID].leafMenuBarSettings
                .menuBarDisplayState,
            navDropdownState:
              this.settings.activeRegions[flowName][leafID].leafMenuBarSettings
                .navDropdownState,
            navDropdownSearchTerm:
              this.settings.activeRegions[flowName][leafID].leafMenuBarSettings
                .navDropdownSearchTerm,

            cursorDropdownState:
              this.settings.activeRegions[flowName][leafID].leafMenuBarSettings
                .cursorDropdownState,
          },
        };
        return activeRegionObject;
      }
      // textFlow gets lost when the cursor is behind the last UUID, so we check for that and only notify if there is an actual problem
    } else if (cursorOffset < text.length - 52) {
      console.error("textFlow: No UUID marker found in this.");
      return undefined;
    } else return undefined;
  };

  // ---------------------------------------------------------------
  // we still need this for scrolling, syncing and marking of regions!!!
  findStartOfRegion = (
    flow: Types.FlowDef,
    flowOrder: number,
    text: string,
  ) => {
    // this is just math
    const previousRegion = Object.entries(flow.flowMap).find(
      ([previousRegion, previousRegionFlowMapEntry]) =>
        previousRegionFlowMapEntry.flowOrder === flowOrder - 1,
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
    const flowName = activeLeafPath.match(/([^/]+)(?=\.md$)/)?.[0]; // gets the flow name out of the path; written by AI
    if (flowName && this.settings.flows[flowName]) {
      return flowName;
    } else {
      return null;
    }
  };

  // ---------------------------------------------------------------
  // handles the opening, closing and switching of leaves
  // is called by layout-change and active-leaf-change
  leafSwitching = async () => {
    await this.syncAllLeaves();
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    if (!view.file) return;
    const leaf = view.leaf;

    const activeLeafPath = view.file.path;

    if (leaf?.view instanceof MarkdownView) {
      const view = leaf.view;
      const activeLeafPath = leaf.view.file?.path;
      if (activeLeafPath) {
        // if active leaf is flow, set it up; hash check happens in setup
        const isFlow = this.isFlowFile(activeLeafPath);
        if (isFlow) {
          await this.setUpFlow(isFlow, leaf.view);

          const leafID = this.settingsTabFunctions.getLeafId(view.leaf);

          this.mostRecentActiveFlowLeaf = leaf;
          return;
        } else {
          this.closeFlow(view);
          this.manageActiveRegions();
        }
      }
    }
  };

  // ---------------------------------------------------------------
  // The big bundle that centralises flow management
  setUpFlow = async (flowName: string, view: MarkdownView) => {
    // this.settingsTabFunctions.callStack("setUpFlow");

    let isFreshlyBuilt = false;

    // ------------- DATA INTEGRITY ---------------------
    // check if the flow needs a rebuild due to changes from outside
    if (this.settings.checkExternalEdits != "no") {
      if (!this.lastActivity[flowName]) {
        // if the flow has been newly opened
        const statsOverlay = new StatsOverlay(
          view.leaf,
          flowName,
          this.app,
          this,
          this.t,
        );
        await this.checkStatsForFlow(flowName);
        statsOverlay.remove();
      } else if (
        // if it's been dormant for at least five minutes
        this.lastActivity[flowName] - Date.now() >
        this.inactivityThreshold
      ) {
        const statsOverlay = new StatsOverlay(
          view.leaf,
          flowName,
          this.app,
          this,
          this.t,
        );
        await this.checkStatsForFlow(flowName);
        statsOverlay.remove();
      }
      // update activity
      this.lastActivity[flowName] = Date.now();
    }

    // ------------- REBUILDING ---------------------
    if (this.settings.flows[flowName].flaggedForRebuild) {
      await this.settingsTabFunctions.rebuildFlow(flowName, "setUpFlow");
      isFreshlyBuilt = true;
    }

    // ------------- SCROLLING ---------------------
    const leafID = this.settingsTabFunctions.getLeafId(view.leaf);
    // See if this is the inital activation of the flow/leaf and restore cursor
    // we need this so Outline navigation works (because it triggers listeners)
    if (!this.alreadyActivated[flowName]) {
      if (!isFreshlyBuilt) this.UUIDIntegrityCheck(flowName);
      this.alreadyActivated[flowName] = {};
      this.alreadyActivated[flowName][leafID] = [true, false];
      this.settingsTabFunctions.restoreCursorPos(flowName, view, leafID);
    } else if (!this.alreadyActivated[flowName][leafID]) {
      this.alreadyActivated[flowName][leafID] = [true, false];
      this.settingsTabFunctions.restoreCursorPos(flowName, view, leafID);
    }

    // ------------- PROTECTION ---------------------
    // set up the editor with its  extensions and listeners
    await this.makeCompartments(view);

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

    // -------------- VISUALS ---------------------
    // this has to happen first so the menuBar can just be set up
    await this.manageActiveRegions();

    // Update the switcher modal in case it's open
    if (this.modalUpdateCallback) {
      this.modalUpdateCallback();
    }

    this.setupMenuBar(view, flowName);
  };

  // ---------------------------------------------------------------
  // ---- Make sure flows are set up when they are activated
  activateFlow = async (flowName: string) => {
    if (!this.settings.flows[flowName]) {
      new Notice(
        this.t("activateFlow.notice flow name not found", {
          flowName: flowName,
        }),
        10000,
      );
      return;
    }
    // Get the file
    const flowFile = this.app.vault.getAbstractFileByPath(
      this.settings.flows[flowName].flowFilePath,
    );

    if (flowFile instanceof TFile) {
      // make a leaf and put the file into it
      const leaf = this.app.workspace.getLeaf("tab"); // Prefer opening in a tab
      await leaf.openFile(flowFile);

      // now open and focus the flow, pin it, and set up tracking and stuff
      if (leaf.view instanceof MarkdownView) {
        this.app.workspace.setActiveLeaf(leaf, { focus: true });
        this.setUpFlow(flowName, leaf.view);
        leaf.setPinned(true);
      } else {
        console.error(
          "textFlow: View is not MarkdownView after opening flow file",
        );
      }
    } else {
      new Notice(
        this.t("activateFlow.notice flow file not found", {
          flow_flowFilePath: this.settings.flows[flowName].flowFilePath,
        }),
        10000,
      );
    }
  };

  // ---------------------------------------------------------------
  // this function also removes obsolete entries from the listenerBasket
  manageActiveRegions = async () => {
    //this.settingsTabFunctions.callStack("manageActiveRegions");

    // gather the flow leaves
    const foundFlowLeaves: Record<string, Set<string>> = {};

    this.app.workspace.iterateAllLeaves((leaf) => {
      // get info for all leaves' contents, initalised or not
      const leafViewState = leaf.getViewState();
      if (leafViewState.type === "markdown" && leafViewState.state?.file) {
        const leafID = this.settingsTabFunctions.getLeafId(leaf);
        const leafPath = leafViewState.state?.file;
        if (typeof leafPath != "string") return; // behaves like 'continue' in this callback

        // set up entries for newly opened flows
        const flowName = this.isFlowFile(leafPath);
        if (flowName) {
          // get leaves per flow
          if (!foundFlowLeaves[flowName]) {
            foundFlowLeaves[flowName] = new Set();
          }
          foundFlowLeaves[flowName].add(leafID);

          // Ensure the activeRegions exists in the object
          if (!this.settings.activeRegions[flowName]) {
            this.settings.activeRegions[flowName] = {};
          }
          if (!this.settings.activeRegions[flowName][leafID]) {
            this.addRegionTracking(flowName, leafID);
          }

          // Then add region tracking for newly opened leaves
          if (!this.settings.activeRegions[flowName]) {
            this.settings.activeRegions[flowName] = {};
          }
          if (!this.settings.activeRegions[flowName][leafID]) {
            this.addRegionTracking(flowName, leafID);
          }
        }
      }
    });

    // Clean up entries for closed leaves plus the listenerBasket
    Object.keys(this.settings.flows).forEach((flowName) => {
      if (this.settings.activeRegions[flowName]) {
        if (Object.keys(this.settings.activeRegions[flowName]).length > 0) {
          Object.keys(this.settings.activeRegions[flowName]).forEach(
            async (leafID) => {
              if (!foundFlowLeaves[flowName]?.has(leafID)) {
                delete this.settings.activeRegions[flowName][leafID];
                // filter the id from the array
                this.settings.flows[flowName].lastActiveLeaves =
                  this.settings.flows[flowName].lastActiveLeaves.filter(
                    (id) => id !== leafID,
                  );
                delete this.listenerBasket[leafID];
              }

              // then, if a flow is all closed, we delete the main entry and sync the flow, because all other syncs only care about active leaves
              if (
                Object.keys(this.settings.activeRegions[flowName]).length === 0
              ) {
                delete this.settings.activeRegions[flowName];

                if (
                  this.settings.flows[flowName].unsyncedRegionsArray.length > 0
                ) {
                  const path = this.settings.flows[flowName].flowFilePath;
                  const note = this.app.vault.getAbstractFileByPath(path);
                  if (!note) {
                    new Notice(
                      this.t(
                        "manageActiveRegions.notice sync upon closing flow failed",
                        { path: path },
                      ),
                    );
                  }
                  if (note instanceof TFile) {
                    // get the text from the file
                    const text: string = await this.app.vault.read(note);
                    await this.syncBackToSource(flowName, text, leafID);
                  }
                }
              }
            },
          );
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
    }
  };

  // ---------------------------------------------------------------
  // if a flow is replaced by a non-flow
  closeFlow = async (view: MarkdownView) => {
    //this.settingsTabFunctions.callStack("closeFlow");

    await this.syncAllLeaves();

    // reset the compartments
    const leafID = this.settingsTabFunctions.getLeafId(view.leaf);
    const cmView = this.settingsTabFunctions.getEditorView(view.editor);
    if (cmView) {
      this.resetCompartments(leafID, cmView);
    }

    this.cleanupMenuBar(view.leaf);
    if (view.menuBar) {
      view.menuBar.detach();
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
    // finally
    this.manageActiveRegions(); // also saves
  };

  // ---------------------------------------------------------------
  setupMenuBar = (view: MarkdownView, flowName: string) => {
    let menuBar: MenuBar;
    const leafID = this.settingsTabFunctions.getLeafId(view.leaf);
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

  // ---------------------------------------------------------------
  refreshMenuBars = async () => {
    if (this.isRebuilding) return;

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

  // ---------------------------------------------------------------
  // creation happens in setUpFlow, using menuBar.ts
  cleanupMenuBar = (leaf: WorkspaceLeaf) => {
    if (leaf.view instanceof MarkdownView && leaf.view.menuBar) {
      leaf.view.menuBar.detach();
      delete leaf.view.menuBar;
    }
  };

  // ---- Functions: Data safety ----------------------------

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
      // before we get to actually modifying, let's flag other flows
      for (let otherFlowName of Object.keys(this.settings.flows)) {
        if (flowName != otherFlowName) {
          if (!this.settings.flows[otherFlowName].flaggedForRebuild) {
            for (let path of this.settings.flows[flowName]
              .unsyncedRegionsArray) {
              if (this.settings.flows[otherFlowName].flowMap[path])
                this.settings.flows[otherFlowName].flaggedForRebuild = true;
              // saving is done by syncBackToSource
            }
          }
        }
      }
      for (let view of flowLeaves[flowName]) {
        const text = view.editor.getValue();
        const leafID = this.settingsTabFunctions.getLeafId(view.leaf);
        await this.syncBackToSource(flowName, text, leafID);
      }
    }
    this.textFlowOperation = false; // unsuspends modify listener
  };

  // ---------------------------------------------------------------
  //---- The actual sync function -------------
  syncBackToSource = async (flowName: string, text: string, leafID: string) => {
    // block syncing if there's a tracking error
    if (this.flowOutOfSync.includes(flowName)) {
      new Notice(
        this.t("syncBackToSource tracking error", {
          flowName: flowName,
        }),
        0,
      );
      return;
    }
    if (this.settings.flows[flowName].unsyncedRegionsArray) {
      const map = this.settings.flows[flowName].flowMap;
      const remainingPaths: string[] = [];
      if (this.settings.flows[flowName].unsyncedRegionsArray.length > 0) {
        for (const path of this.settings.flows[flowName].unsyncedRegionsArray) {
          if (path.startsWith("#")) continue;
          const sourceFile = this.app.vault.getFileByPath(path);
          if (!sourceFile) {
            new Notice(
              this.t("syncBackToSource.notice sync failed source note", {
                path: path,
              }),
            );
            return;
          }
          const check = await this.checkStatsForNote(flowName, path);
          if (check) {
            new Notice(
              this.t("syncBackToSource.failedStatCheck", { path: path }),
            );
            return;
          }

          let startOfRegion = this.findStartOfRegion(
            this.settings.flows[flowName],
            map[path].flowOrder,
            text,
          );

          const endOfRegion = text.indexOf(map[path].invisibleUUID) - 1; // subtract 1 for the \r before the UID

          const flowFile = this.app.vault.getFileByPath(
            this.settings.flows[flowName].flowFilePath,
          );

          if (!flowFile) {
            new Notice(
              this.t("syncBackToSource.notice sync failed flow note", {
                path: path,
              }),
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
              await this.settingsTabFunctions.safeCreateOrModifyFile(
                path,
                newContent,
              );
            } catch (error) {
              remainingPaths.push(path);
              new Notice(
                this.t("syncBackToSource.notice other random error", {
                  flowName: flowName,
                  path: path,
                }),
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

  // ---------------------------------------------------------------
  UUIDIntegrityCheck = async (flowName: string) => {
    let flowFilePath = this.settings.flows[flowName].flowFilePath;
    const flowFile = this.app.vault.getAbstractFileByPath(flowFilePath);
    let text = "";
    if (flowFile instanceof TFile) {
      text = await this.app.vault.read(flowFile);
    }

    const markerRegex =
      /[\u200B\u200C\u200D\u2060\u2061\u2062\u2063\u2064\uFEFF\u00A0]{46}/g;

    const matches = text.match(markerRegex);

    if (!matches) {
      new Notice(
        this.t("brokenRegions NONE found notification", {
          flowName: flowName,
        }),
      );
      return;
    }
    if (
      matches.length !=
      Object.keys(this.settings.flows[flowName].flowMap).length
    ) {
      const brokenRegionsArray = [];
      for (let regionName of Object.keys(
        this.settings.flows[flowName].flowMap,
      )) {
        if (
          !matches.includes(
            this.settings.flows[flowName].flowMap[regionName].invisibleUUID,
          )
        ) {
          brokenRegionsArray.push(regionName);
        }
      }
      const brokenRegionsList = brokenRegionsArray.join("\n- ");
      new Notice(
        this.t("brokenRegions SOME notification", {
          flowName: flowName,
          regions: brokenRegionsList,
        }),
        15000,
      );
    }
  };

  // ---------------------------------------------------------------
  // a robot said I should do it like this, and who am I to question a robot?
  // it's to account for random delays in file writing and OS quirks to avoid false positives
  MTIME_DELTA = 1000;

  // check stats for an entire flow's source notes
  checkStatsForFlow = async (flowName: string) => {
    if (this.settings.checkExternalEdits === "no") return;
    if (this.settings.flows[flowName].flaggedForRebuild) return;

    let key = this.settings.flows[flowName].definitionMode
      ? "bookmarks"
      : "foldersTagsProps";

    // iterating over the paths
    // Use Promise.all for parallel execution:

    let pathsToCheck: string[] = [];
    Object.keys(this.settings.flows[flowName].flowMap).forEach((note) => {
      // pick out only note paths
      if (!this.settings.flows[flowName].flowMap[note].path.startsWith("#")) {
        pathsToCheck.push(this.settings.flows[flowName].flowMap[note].path);
      }
    });

    const checkPromises = pathsToCheck.map((path) =>
      this.checkStatsForNote(flowName, path),
    );

    const results = await Promise.all(checkPromises);
    const changed = results.some((check) => check === true);

    if (changed) {
      // check if the flow is active/in active leaf
      if (this.settings.activeRegions[flowName]) {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view?.file?.path.endsWith(`${flowName}.md`)) {
          // rebuild immediately
          await this.settingsTabFunctions.rebuildFlow(flowName, "switcher");
        }
      } else {
        // if it's inactive, just flag for rebuild
        this.settings.flows[flowName].flaggedForRebuild = true;
        await this.saveSettings();
      }
    }
    return changed;
  };

  // ---------------------------------------------------------------
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
        if (check) changed = true;
      }
    }

    const oldMtime = this.settings.flows[flowName].flowMap[path].mtime;
    const newMtime = sourceFile.stat.mtime;
    if (Math.abs(newMtime - oldMtime) > this.MTIME_DELTA) {
      if (this.settings.checkExternalEdits === "mtime") {
        changed = true;
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
      await this.saveSettings();
    }
    return changed;
  };

  // ---------------------------------------------------------------
  // Functionality to keep mtimes and hashes up to date
  updateStats = async (flowName: string, path: string, file: TFile) => {
    if (this.settings.flows[flowName].flowMap[path]) {
      this.settings.flows[flowName].flowMap[path].mtime = file.stat.mtime;
      // caller saves
    }
    if (this.settings.checkExternalEdits === "mtime+hash") {
      let fileContent: string = await this.app.vault.read(file);
      const newHash = this.makeHash(fileContent);
      this.settings.hashes[path] = newHash;
      // caller saves
    }
  };

  // ---------------------------------------------------------------
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

  // ---------------------------------------------------------------
  makeHash = (text: string) => {
    return XXH.h64(text, 0x0).toString(16);
  };

  // ---------------------------------------------------------------
  checkHash = async (sourceFile: TFile, path: string, flowName: string) => {
    let changed = false;
    let fileContent: string = await this.app.vault.read(sourceFile);
    const newHash = this.makeHash(fileContent);
    // if there's no hash yet for some reason, do a quick once-over for the flow
    if (!this.settings.hashes[path]) {
      await this.initialHashing(flowName);
    }
    if (newHash === this.settings.hashes[path]) {
      // if contents are the same, just update mtime
      const newMtime = sourceFile.stat.mtime;
      this.settings.flows[flowName].flowMap[path].mtime = newMtime;
    } else {
      // if there's been an actual edit to the content, update the hash
      this.settings.hashes[path] = newHash;
      changed = true;
    }
    await this.saveSettings();
    return changed;
  };

  // ------ Functions: Misc -------------------

  manageCursorPos = async (
    flowName: string,
    leafID: string,
    // these args come from the fuzzyNavModal
    item?: Types.SuggestionItem,
    currentCursor?: number,
  ) => {
    if (!this.settings.activeRegions[flowName]) return;
    if (!this.settings.activeRegions[flowName][leafID]) return;

    let regionPath = "";
    if (item) {
      if (item.path) {
        regionPath = item.path;
      }
    } else if (this.settings.activeRegions[flowName][leafID].path) {
      regionPath = this.settings.activeRegions[flowName][leafID].path;
    }

    if (!currentCursor) {
      currentCursor =
        this.settings.activeRegions[flowName][leafID].currentCursorPos;
    }

    // Initialise if doesn't exist
    if (!this.settings.flows[flowName].persistentCursors) {
      this.settings.flows[flowName].persistentCursors = {};
    }
    if (!this.settings.flows[flowName].persistentCursors[leafID]) {
      this.settings.flows[flowName].persistentCursors[leafID] = {
        //leafNickname: `${leafID.slice(0, 5)}`,
        update: Date.now(),
        cursors: [[regionPath, currentCursor, Date.now()]],
      };

      // cap the number of leaves
      const leaves = Object.entries(
        this.settings.flows[flowName].persistentCursors,
      );

      if (leaves.length > 5) {
        // find the leaf with the oldest timestamp using forbidden magic that a robot showed me
        const [oldestLeafId] = leaves.reduce((oldest, current) => {
          return current[1].update < oldest[1].update ? current : oldest;
        });
        delete this.settings.flows[flowName].persistentCursors[oldestLeafId];
      }
      return;
    }

    // Check if we already have an entry for that cursor and remove it
    const updatedCursors = this.settings.flows[flowName].persistentCursors[
      leafID
    ].cursors.filter(([key]) => key !== regionPath);

    // then put the new entry at the start
    updatedCursors.unshift([regionPath, currentCursor, Date.now()]);

    // and put it back into the object
    this.settings.flows[flowName].persistentCursors[leafID].cursors =
      updatedCursors;

    // update the timestamp
    this.settings.flows[flowName].persistentCursors[leafID].update = Date.now();

    // Cap number of entries
    if (
      this.settings.flows[flowName].persistentCursors[leafID].cursors.length > 5
    ) {
      this.settings.flows[flowName].persistentCursors[leafID].cursors.pop();
    }

    // also remove ancient entries, but leave the last ones intact
    if (
      this.settings.flows[flowName].persistentCursors[leafID].cursors.length > 2
    ) {
      for (let leafID of Object.keys(
        this.settings.flows[flowName].persistentCursors,
      )) {
        if (
          Math.abs(
            this.settings.flows[flowName].persistentCursors[leafID].update -
              Date.now(),
          ) >
          1000 * 60 * 60 * 48 // if other entries are older than 48 hours
        ) {
          delete this.settings.flows[flowName].persistentCursors[leafID];
        }
      }
    }
  };

  // ---------------------------------------------------------------
  notifyOfOverlap = (path: string, activeFlow: string, leafID: string) => {
    let overlappingFlows: string[] = [];
    for (let flowName of Object.keys(this.settings.activeRegions)) {
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
      const overlapString = Object.keys(this.settings.activeRegions).join(", ");
      const regionName = basename(path);
      new Notice(
        this.t("checkActiveRegion.notice overlap detected", {
          regionName: regionName,
          overlapString: overlapString,
        }),
      );
    }
  };

  // -------------------------------------------------------
  //------------------------- ONLOAD -----------------------
  // -------------------------------------------------------
  async onload() {
    this.settings = await this.loadSettings();
    //this.flows = await this.loadFlowDefs();
    await this.loadLanguage();

    // to make saving even more safe
    this.register(() => {
      this.isUnloading = true;
    });

    // set up the class so main.ts can act as an access hub to the functions in settingsTabFunctions.ts
    // this needs to happen before layoutReady, or else there will be errors
    this.settingsTabFunctions = new settingsTabFunctions(this, this.app);

    // -------------------------------------------------------------------

    this.app.workspace.onLayoutReady(async () => {
      // make sure we know where our stuff is
      await this.ensureSystemFolder(); // also calls state discernment to hide

      // get settings ready
      this.addSettingTab(new TextFlowSettingsTab(this.app, this));

      // get deco ready
      if (this.settings.explorerDecoStyle[0] != "--") {
        this.decorateSourceNotes("redo");
      }

      // scroll bar
      this.settingsTabFunctions.updateScrollbarVisibility();

      // button for the flowSwitcher
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
            const leafID = this.settingsTabFunctions.getLeafId(view.leaf);
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
              const leafID = this.settingsTabFunctions.getLeafId(view.leaf);
              new Modals.FlowSwitcherModal(this.app, this, leafID).open();
            }
          },
        );
      }

      // ---------------------------------------------------------------
      // and finally, Listeners and commands
      this.fileExplorerOpenClickListener();
      const fileExplorer = document.querySelector(".nav-files-container");
      if (fileExplorer && this.boundFileExplorerClick) {
        fileExplorer.addEventListener("click", this.boundFileExplorerClick);
      }
    });

    this.addListeners();

    this.registerCommands();
  }

  // -------------------------------------------------------
  // ------------------ ONUNLOAD----------------------------
  // -------------------------------------------------------
  onunload() {
    // ------------ Remove listeners -----------

    //------------ REMOVE explorer click listener -----------
    const fileExplorer = document.querySelector(".nav-files-container");
    if (fileExplorer && this.boundFileExplorerClick) {
      fileExplorer.removeEventListener("click", this.boundFileExplorerClick);
    }

    // ------------ RESET compartments to []
    for (let leafID of Object.keys(this.listenerBasket)) {
      // skip the text change entries (we're removing both listeners anyway)
      if (leafID.endsWith("-changes")) continue;
      const leaves = this.app.workspace.getLeavesOfType("markdown");
      const targetLeaf = leaves.find(
        (leaf) => this.settingsTabFunctions.getLeafId(leaf) === leafID,
      );
      for (const leaf of leaves) {
        if (targetLeaf?.view instanceof MarkdownView) {
          const cmView = this.settingsTabFunctions.getEditorView(
            targetLeaf.view.editor,
          );
          if (cmView) this.resetCompartments(leafID, cmView);
        }
      }
    }

    // --------------- REMOVE menu bar ------------------
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView && leaf.view.menuBar) {
        leaf.view.menuBar.detach();
      }
    });
  }
}
