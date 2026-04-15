import {
  App,
  ButtonComponent,
  Editor,
  MarkdownView,
  normalizePath,
  Notice,
  TFolder,
  TFile,
  WorkspaceLeaf,
} from "obsidian";
import { EditorView } from "@codemirror/view";
import TextFlow from "../main";
import * as Types from "./types";
import path from "path";
import { getAPI, SMarkdownPage } from "obsidian-dataview";

// Any code that was actually written by AI is labelled

//-------------------------------------------------------------------------------------
// TOC
//-------------------------------------------------------------------------------------
// - Progress stuff (required by flowBuilder())
//-------------------------------------------------------------------------------------
//    - class ProgressNotice
//    - class LoadingOverlay
//-------------------------------------------------------------------------------------
// - Required by settingsTab, in order of appearance
//-------------------------------------------------------------------------------------
//    - checkSystemFolder
//    - createSystemFolder
//    - debouncedSaveSettings
//    - isValidFlowName
//    - renameFlow
//    - radioButtonManager
//    - --- CREATE FLOW PATH ARRAY ------------
//    - createSourceNotePathArray
//      - getBookmarkPathsByGroupName
//          - collectBookmarkPathsFolderOrder
//          - collectBookmarkPathsNoteOrder
//          - collectBookmarkPathsManualOrder
//      - ensureNoUndefined
//      - getPathsByFoldersTagsProps
//        - makeNoteOrderPathArray
//        - makeFolderOrderPathArray
//        - findAndAddFolderTitles
//    - overlapCollector
//    - writeAndSaveFlowDef
//    - syncOverlaps
//    - resetFlowBuildBasket
//    - --- BUILD FLOW ----------------
//      - flowBuildingBundle
//      - flowBuilder
//      - createInvisibleUUID
//    - backupFlowDefs
//-------------------------------------------------------------------------------------
// - the + stuff whichI tried to put into its own class but that just confused me
//-------------------------------------------------------------------------------------
// - getLeafID
// - getEditor
// - getEditorCM
// - getMarkdownView
// - callStack
// - restoreCursorPos
// - scrollToPos
// - safeCreateOrModifyFile
// - exportFlow
// - selectActiveRegion
// - updateScrollbarVisibility
// - getTimestamp
// - explorerDecoArray

//--------------------------------------------------
// --- A class for the build progress toast (shown when rebuilding from settings tab)
class ProgressNotice {
  private notice: Notice;
  private flowName: string;
  private t: (key: string, variables?: Record<string, string>) => string;
  constructor(
    flowName: string,
    translation: (key: string, variables?: Record<string, string>) => string,
  ) {
    this.flowName = flowName;
    this.t = translation;
    this.notice = new Notice(
      this.t("settingsTabFunctions.progressNotice.notice initial notice", {
        this_flowName: this.flowName,
      }),
    );
  }

  updateProgress(
    current: number,
    total: number,
    symbolFilled: string,
    t: (key: string, variables?: Record<string, string>) => string,
  ) {
    const percent = Math.floor((current / total) * 100);
    const percentString = percent.toString();
    const filled = Math.floor(percent / 10);
    const bar =
      "[" + symbolFilled.repeat(filled) + "o".repeat(10 - filled) + "]";
    this.notice.setMessage(
      t("settingsTabFunctions.progressNotice.notice updated notice", {
        this_flowName: this.flowName,
        bar: bar,
        percent: percentString,
      }),
    );
  }

  close() {
    this.notice.hide();
  }
}

//--------------------------------------------------
// the overlay for active flows
class LoadingOverlay {
  private plugin: TextFlow;
  private container: HTMLElement;
  private progressText: HTMLElement;
  private flowName: string;
  private t: (key: string, variables?: Record<string, string>) => string;

  constructor(
    leaf: WorkspaceLeaf,
    flowName: string,
    app: App,
    plugin: TextFlow,
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
      text: this.t(
        "settingsTabFunctions.progressNotice.notice initial notice",
        {
          this_flowName: this.flowName,
        },
      ),
    });
  }

  updateProgress(
    current: number,
    total: number,
    symbolEmpty: string,
    symbolFilled: string,
  ) {
    const percent = Math.floor((current / total) * 100);
    const percentString = percent.toString();
    const filled = Math.floor(percent / 10);
    const bar =
      "[" + symbolFilled.repeat(filled) + symbolEmpty.repeat(10 - filled) + "]";
    const text = this.t(
      "settingsTabFunctions.progressNotice.notice updated notice",
      {
        this_flowName: this.flowName,
        bar: bar,
        percent: percentString,
      },
    );
    this.progressText.setText(text);
  }

  remove() {
    this.container.remove();
  }
}

export class settingsTabFunctions {
  constructor(
    private plugin: TextFlow,
    private app: App,
  ) {}
  //--------------------------------------------------
  //-------------------- Functions ----------------
  //--------------------------------------------------

  // stuff is sorted in the order in which it is being called from settingsTab / a bundle function

  // -------- see if a system folder already exists -------

  checkSystemFolder = () => {
    const systemFolder = this.app.vault
      .getAllLoadedFiles()
      .find(
        (file) =>
          file instanceof TFolder &&
          file.name === this.plugin.textFlowSystemFolderName,
      );
    return systemFolder instanceof TFolder ? systemFolder : null;
  };

  //--------------------------------------------------
  createSystemFolder = async (newSystemFolderPath: string) => {
    try {
      // Ensure the folder exists, create it if necessary
      let newSystemFolder =
        this.app.vault.getAbstractFileByPath(newSystemFolderPath);
      if (!newSystemFolder) {
        await this.app.vault.createFolder(newSystemFolderPath);

        // add a little readme with info on how to not fuck up the folder
        const readmePath = normalizePath(`${newSystemFolderPath}/README.md`);
        const content = this.plugin.t("readme");
        this.plugin.textFlowOperation = true;
        await this.plugin.settingsTabFunctions.safeCreateOrModifyFile(
          readmePath,
          content,
        );
        this.plugin.textFlowOperation = false;

        // inform the user of success
        new Notice(
          this.plugin.t("createSystemFolder.notice folder created", {
            newSystemFolderPath: newSystemFolderPath,
          }),
        );
      } else if (!(newSystemFolder instanceof TFolder)) {
        throw new Error(`"${newSystemFolderPath}" exists but is not a folder.`);
      }
    } catch (e) {
      console.error(
        `textFlow: Something went wrong when trying to create ${newSystemFolderPath}: ${e}`,
      );
    }
  };

  //--------------------------------------------------
  // ----- To slow down saving on input fields
  private debouncedSaveTimer: NodeJS.Timeout | undefined;

  debouncedSaveSettings = async () => {
    if (this.debouncedSaveTimer) {
      clearTimeout(this.debouncedSaveTimer);
    }
    this.debouncedSaveTimer = setTimeout(async () => {
      await this.plugin.saveSettings();
      this.debouncedSaveTimer = undefined;
    }, 200); // .2 second delay
  };

  //--------------------------------------------------
  // --------- Make sure only valid file names can be entered as flow names
  isValidFlowName = (name: string): { valid: boolean; reason?: string } => {
    // Check for null/undefined names
    if (!name) {
      return {
        valid: false,
        reason: this.plugin.t("validFlowNameCheck.error.1 missing flow name"),
      };
    }
    // if we're creating and a flow with the chosen name already exists
    if (
      this.plugin.settings.flowBuildBasket.createOrEdit != "edit" &&
      this.plugin.settings.flows[this.plugin.settings.flowBuildBasket.flowName]
    ) {
      return {
        valid: false,
        reason: this.plugin.t(
          "validFlowNameCheck.error.2 flow already exists",
          { flowName: name },
        ),
      };
    }

    // Check for system-reserved names
    const reservedNames = [
      ".",
      "..",
      "CON",
      "PRN",
      "AUX",
      "NUL",
      "COM1",
      "COM2",
      "COM3",
      "COM4",
      "COM5",
      "COM6",
      "COM7",
      "COM8",
      "COM9",
      "LPT1",
      "LPT2",
      "LPT3",
      "LPT4",
      "LPT5",
      "LPT6",
      "LPT7",
      "LPT8",
      "LPT9",
    ];
    if (reservedNames.includes(name.toUpperCase())) {
      return {
        valid: false,
        reason: this.plugin.t("This name is reserved by the system"),
      };
    }

    // Check for invalid characters - added backtick
    const invalidChars = /[<>:"/\\|?*#^[\]`\x00-\x1F]/;
    if (invalidChars.test(name)) {
      return {
        valid: false,
        reason: this.plugin.t(
          "textFlow: Please remove invalid characters from your flow name",
        ),
      };
    }

    // Check for names ending with period or space (problematic on Windows)
    if (name.startsWith(".") || name.endsWith(".")) {
      return {
        valid: false,
        reason: this.plugin.t(
          "textFlow: A flow name cannot start or end with a period",
        ),
      };
    }

    return { valid: true };
  };

  //--------------------------------------------------
  renameFlow = async () => {
    // this only handles the clean-up of the old version;
    // the creation of the new version happens in the save button code
    if (
      this.plugin.settings.flowBuildBasket.flowName !=
        this.plugin.settings.flowBuildBasket.oldFlowName &&
      this.plugin.settings.flows[
        this.plugin.settings.flowBuildBasket.oldFlowName
      ]
    ) {
      const newFlowName = this.plugin.settings.flowBuildBasket.flowName;
      const oldFlowName = this.plugin.settings.flowBuildBasket.oldFlowName;

      this.plugin.syncAllLeaves();

      // reset all active leaves of the flow
      Object.keys(this.plugin.settings.activeRegions).forEach((activeFlow) => {
        if (activeFlow === oldFlowName) {
          Object.keys(this.plugin.settings.activeRegions[activeFlow]).forEach(
            async (leafID) => {
              const targetLeaf = this.app.workspace.getLeafById(leafID);
              if (targetLeaf) {
                targetLeaf.detach();
              }
            },
          );
        }
      });

      // nix the flow's activeRegions
      if (this.plugin.settings.flows[oldFlowName]) {
        if (this.plugin.settings.activeRegions[oldFlowName]) {
          this.plugin.settings.activeRegions[oldFlowName] = {};
        }
      }

      // delete its entry in activeRegions
      delete this.plugin.settings.activeRegions[oldFlowName];

      // handle overlapObjects for the flow
      Object.keys(this.plugin.settings.flows).forEach((otherFlowName) => {
        if (this.plugin.settings.flows[otherFlowName].overlapObject) {
          if (
            this.plugin.settings.flows[otherFlowName].overlapObject[oldFlowName]
          ) {
            this.plugin.settings.flows[otherFlowName].overlapObject[
              newFlowName
            ] =
              this.plugin.settings.flows[otherFlowName].overlapObject[
                oldFlowName
              ];
            delete this.plugin.settings.flows[otherFlowName].overlapObject[
              oldFlowName
            ];
          }
        }
      });

      // finally, delete the old object
      delete this.plugin.settings.flows[oldFlowName];

      // save it all
      await this.plugin.saveSettings();

      // and finally rename the flow file if it exists
      const oldFlowPath = normalizePath(
        `${this.plugin.settings.systemFolderPath}/${oldFlowName}.md`,
      );
      const newFlowPath = normalizePath(
        `${this.plugin.settings.systemFolderPath}/${newFlowName}.md`,
      );

      const flowFile = this.app.vault.getAbstractFileByPath(oldFlowPath);

      if (flowFile) {
        if (flowFile instanceof TFile) {
          this.plugin.textFlowOperation = true;
          await this.app.vault.rename(flowFile, newFlowPath);
          this.plugin.textFlowOperation = false;
        }
      }
    }
  };

  //--------------------------------------------------
  radioButtonManager(
    selectedButton: ButtonComponent,
    unselectedButton1: ButtonComponent,
    unselectedButton2: ButtonComponent,
  ) {
    // Update all buttons
    selectedButton.buttonEl.addClass("settings-radio-button-active");
    unselectedButton1.buttonEl.removeClass("settings-radio-button-active");
    unselectedButton2.buttonEl.removeClass("settings-radio-button-active");
  }

  //--------------------------------------------------
  // The function that turns the user's criteria into a sorted and filtered array of paths ---------
  createSourceNotePathArray = async (
    flowBuildBasket: Types.flowBuildBasket,
  ) => {
    // -------- Putting the flowNotesPathArray together by fetching/filtering all paths
    try {
      // ------ DVQuery FLOWS -----------------------
      if (flowBuildBasket.definitionMode === "dvQuery") {
        const dvQueryPathArray = await this.getPathsByDvQuery(flowBuildBasket);
        flowBuildBasket.flowNotesPathArray = dvQueryPathArray;
      }

      // ------ FOLDERS/TAG/PROPERTY FLOWS -----------------------
      else if (flowBuildBasket.definitionMode === "foldersTagsProps") {
        this.ensureNoUndefined(flowBuildBasket);

        const foldersTagsPropsPathArray =
          await this.getPathsByFoldersTagsProps(flowBuildBasket);
        flowBuildBasket.flowNotesPathArray = foldersTagsPropsPathArray;
      }

      // ----------- BOOKMARK FLOWS ---------------------
      if (flowBuildBasket.definitionMode === "bookmarks") {
        if (
          flowBuildBasket.flowDefinition.bookmarks === undefined ||
          flowBuildBasket.flowDefinition.bookmarks === ""
        ) {
          new Notice(
            this.plugin.t(
              "createSourceNotePathArray.notice enter bookmark group",
            ),
          );
          flowBuildBasket.success = false;
        } else {
          const bookmarkPathArray =
            this.getBookmarkPathsByGroupName(flowBuildBasket);
          flowBuildBasket.flowNotesPathArray = bookmarkPathArray;
        }
      }

      // ---- Check for empty
      if (flowBuildBasket.flowNotesPathArray.length === 0) {
        new Notice(
          this.plugin.t(
            "createSourceNotePathArray.notice definition leads to empty flow",
          ),
        );
        flowBuildBasket.success = false;
        return;
      }
      // get overlap info
      flowBuildBasket.overlapObject = this.overlapCollector(flowBuildBasket);
      flowBuildBasket.success = true;
    } catch (error) {
      new Notice(
        this.plugin.t(
          "createSourceNotePathArray.notice random error, please check console",
        ),
      );
      flowBuildBasket.success = false;
    }
  };

  // --- HELPER FUNCTIONS FOR FETCHING PATHS (AND CLEANING UP STUFF)
  // Also we're using the opportunity to get a clean definition (user input) for storage

  // ---------------- GET DVQUERY PATHS ----------------------
  getPathsByDvQuery = async (flowBuildBasket: Types.flowBuildBasket) => {
    if (!this.plugin.settings.systemFolderPath) return [];
    const dv = getAPI();
    if (!dv) {
      new Notice(
        this.plugin.t(
          "getPathsByFoldersTagsProps.notice dataview not installed",
        ),
      );
      return [];
    }

    // the path sorting suff again
    let sortedFilePathArray: string[] = [];
    const vault = this.app.vault;

    flowBuildBasket.flowDefinition.pathsTagsPropertiesSortOrder ===
      "noteOrder" ||
    flowBuildBasket.flowDefinition.pathsTagsPropertiesSortOrder === undefined
      ? (sortedFilePathArray = this.makeNoteOrderPathArray(
          vault.getRoot(),
          sortedFilePathArray,
        ))
      : (sortedFilePathArray = this.makeFolderOrderPathArray(
          vault.getRoot(),
          sortedFilePathArray,
        ));

    let finalPathArray: string[] = [];

    let allNotes = await dv.query(`${flowBuildBasket.flowDefinition.dvQuery}`);

    if (!allNotes.successful) {
      return [];
    }
    // the following line is slop
    const filteredPathObject: { [key: string]: boolean } = {};

    for (let note of allNotes.value.values) {
      filteredPathObject[note.path] = true;
    }

    for (let path of sortedFilePathArray) {
      // remove entries that are in the systemFolder
      if (path.startsWith(`${this.plugin.settings.systemFolderPath}`)) continue;
      if (filteredPathObject[path] && !finalPathArray.includes(path)) {
        finalPathArray.push(path);
      }
    }

    if (flowBuildBasket.folderTitles) {
      finalPathArray = this.findAndAddFolderTitles(
        finalPathArray,
        flowBuildBasket,
      );
    }

    return finalPathArray;
  };

  // --- GET ALL PATHS FROM FOLDER TAG PROPERTY ---------------------------
  // But first we ensure we don't have undefineds and make the ! type assertion later on safe to use
  ensureNoUndefined = async (flowBuildBasket: Types.flowBuildBasket) => {
    if (flowBuildBasket.flowDefinition.folderIncluded === undefined) {
      flowBuildBasket.flowDefinition.folderIncluded = "";
    }
    if (flowBuildBasket.flowDefinition.folderExcluded === undefined) {
      flowBuildBasket.flowDefinition.folderExcluded = "";
    }
    if (flowBuildBasket.flowDefinition.tagsIncluded === undefined) {
      flowBuildBasket.flowDefinition.tagsIncluded = "";
    }
    if (flowBuildBasket.flowDefinition.tagsExcluded === undefined) {
      flowBuildBasket.flowDefinition.tagsExcluded = "";
    }
    if (flowBuildBasket.flowDefinition.propsIncluded === undefined) {
      flowBuildBasket.flowDefinition.propsIncluded = "";
    }
    if (flowBuildBasket.flowDefinition.propsExcluded === undefined) {
      flowBuildBasket.flowDefinition.propsExcluded = "";
    }
  };

  getPathsByFoldersTagsProps = async (
    flowBuildBasket: Types.flowBuildBasket,
  ) => {
    const dv = getAPI();
    if (!dv) {
      new Notice(
        this.plugin.t(
          "getPathsByFoldersTagsProps.notice dataview not installed",
        ),
      );
      return [];
    }
    // unpack into shorthand for easier reading
    const shFlowDefinition = flowBuildBasket.flowDefinition;

    // -------------------------------------------------
    // ---- PRE FLIGHT CHECKS AND CLEANUP --------------
    // -------------------------------------------------
    // !!!!!YES, LEAVE THE CLEANUP!!!!!
    // I know it's redundant, but if you touch it, it releases an ancient, unbreakable curse.

    //--- INCLUDED FOLDERS ---------------------
    let cleanFolderInclusionArray: string[] = [];

    const folderInclusionArray = shFlowDefinition.folderIncluded.split(",");
    if (folderInclusionArray.length >= 1) {
      const nonEmptyFolderInclusionArray = folderInclusionArray.filter(
        (x) => x.length > 0,
      );
    }

    for (let includedFolder of folderInclusionArray) {
      let excludeSubfolders = false;

      // check for trailing slash, because normalizePath will eat it
      if (
        includedFolder != "/" &&
        includedFolder != "//" &&
        includedFolder != "."
      ) {
        excludeSubfolders = includedFolder.endsWith("/");
      }

      includedFolder = normalizePath(includedFolder.trim());

      // because all that cleaning STILL doesn't get rid of "//":
      if (includedFolder === "//") {
        includedFolder = "/";
      }

      // dataview likes paths only with extra garnish
      const dvPath =
        includedFolder === "" ||
        includedFolder === "/" ||
        includedFolder === "root"
          ? "" // Empty string in Dataview queries means "search everywhere"
          : `\"${includedFolder}\"`; // For specific paths, we need to wrap in quotes

      // save cleaned path with trailing slash if we exclude subfolders
      if (excludeSubfolders) {
        includedFolder = `${includedFolder}/`;
        cleanFolderInclusionArray.push(includedFolder);
      } else {
        cleanFolderInclusionArray.push(includedFolder);
      }
      flowBuildBasket.dataviewSearchArray.push([dvPath, includedFolder]);
    }

    // save the handled results
    flowBuildBasket.flowDefinition.folderIncluded =
      cleanFolderInclusionArray.join(",");

    //--- EXCLUDED FOLDERS -------------------------------------------------
    let cleanFolderExclusionArray: string[] = [];

    const folderExclusionArray = shFlowDefinition.folderExcluded.split(",");
    if (folderExclusionArray.length >= 1) {
      const nonEmptyFolderExclusionArray = folderExclusionArray
        .map((x) => x.trim())
        .filter((x) => x.length > 0);
      for (let excludedFolder of nonEmptyFolderExclusionArray) {
        let cleanExcludedPath = normalizePath(excludedFolder.trim());
        cleanFolderExclusionArray.push(cleanExcludedPath);
      }
      // save cleaned values
      flowBuildBasket.flowDefinition.folderExcluded =
        cleanFolderExclusionArray.join(",");
    } else {
      cleanFolderExclusionArray.push("");
      flowBuildBasket.flowDefinition.folderExcluded = "";
    }

    // add the system folder path so it gets exluded
    if (this.plugin.settings.systemFolderPath) {
      cleanFolderExclusionArray.push(this.plugin.settings.systemFolderPath);
    }

    //--- INCLUDED and EXCLUDED TAGS - strip # --------------------------------
    const tagCleanup = (tagString: string) => {
      let nonEmptyTagArray: string[] = [];
      const tagArray = tagString.split(",");
      nonEmptyTagArray = tagArray
        .map((tag) => {
          tag = tag.trim();
          if (tag.length > 0 && !tag.startsWith("#")) {
            tag = `#${tag}`;
          }
          return tag;
        })
        .filter((x) => x.length > 0);

      return nonEmptyTagArray;
    };

    const cleanTagInclusionArray = tagCleanup(shFlowDefinition.tagsIncluded);
    flowBuildBasket.flowDefinition.tagsIncluded =
      cleanTagInclusionArray.join(",");
    const cleanTagExclusionArray = tagCleanup(shFlowDefinition.tagsExcluded);
    flowBuildBasket.flowDefinition.tagsExcluded =
      cleanTagExclusionArray.join(",");

    //--- INCLUDED and  EXCLUDED PROPERTIES - clean up and split at = -------------------
    const propertyCleanup = (propertyString: string) => {
      let cleanPropertyArray = [];
      const propertyArray = propertyString.split(",");
      const nonEmptyPropertyArray = propertyArray
        .map((x) => x.trim())
        .filter((x) => x.length > 0);
      for (let i = 0; i < nonEmptyPropertyArray.length; i++) {
        if (nonEmptyPropertyArray[i].indexOf("=") !== -1) {
          // if there's a = in the mix
          let equalsIndex = nonEmptyPropertyArray[i].indexOf("=");
          let property = nonEmptyPropertyArray[i].slice(0, equalsIndex).trim();
          let value = nonEmptyPropertyArray[i]
            .slice(equalsIndex + 1, nonEmptyPropertyArray[i].length)
            .trim();
          cleanPropertyArray.push([property, value]);
        } else {
          // if it's just a property
          let cleanPropertyString = propertyArray[i].trim();
          cleanPropertyArray.push([cleanPropertyString]);
        }
      }
      return cleanPropertyArray;
    };

    let cleanPropertiesInclusionArray = propertyCleanup(
      shFlowDefinition.propsIncluded,
    );
    let cleanPropertiesExclusionArray = propertyCleanup(
      shFlowDefinition.propsExcluded,
    );
    // !!! Do NOT save cleaned up proprties back to the recipe !!!
    // The formatting is not what's expected by the cleanup and it will break.

    // add this to keep exports excluded (tag currently not being added on export)
    //  cleanPropertiesExclusionArray.push(["textFlowExport"]);

    // -------- cleanup done ---------------------------------------------------

    // Call for the path sorting stuff -------------------------
    let sortedFilePathArray: string[] = [];
    const vault = this.app.vault;

    flowBuildBasket.flowDefinition.pathsTagsPropertiesSortOrder ===
      "noteOrder" ||
    flowBuildBasket.flowDefinition.pathsTagsPropertiesSortOrder === undefined
      ? (sortedFilePathArray = this.makeNoteOrderPathArray(
          vault.getRoot(),
          sortedFilePathArray,
        ))
      : (sortedFilePathArray = this.makeFolderOrderPathArray(
          vault.getRoot(),
          sortedFilePathArray,
        ));

    // ----------------------------------------------------------
    // ---- USE DATAVIEW API to get and filter notes
    // ----------------------------------------------------------
    // a global to ship stuff between functions
    let finalPathArray: string[] = [];

    for (let dvInclusionTuple of flowBuildBasket.dataviewSearchArray) {
      const dvPath = dvInclusionTuple[0].trim();
      let allNotes = await dv.pages(dvPath);

      // If inclusion path ends with slash, filter out subfolder stuff
      if (dvInclusionTuple[1] != "/" && dvInclusionTuple[1].endsWith("/")) {
        const baseFolder = dvInclusionTuple[1].replace(/\/$/, "");

        allNotes = allNotes.filter(
          (page: Types.DVNote) => path.dirname(page.file.path) === baseFolder,
        );
      }

      const filteredNotes = allNotes.where((note: Types.DVNote) => {
        return (
          // exclude folders
          !cleanFolderExclusionArray.some((path) =>
            note.file.path.startsWith(path),
          ) &&
          // include tags
          cleanTagInclusionArray.every((includedTag) => {
            const noteTags = Array.from(note.file.tags);
            return noteTags.includes(includedTag);
          }) &&
          // exclude tags
          !cleanTagExclusionArray.some((excludedTag) => {
            const noteTags = Array.from(note.file.tags);
            return noteTags.includes(excludedTag);
          }) &&
          // include properties
          cleanPropertiesInclusionArray.every((property) => {
            if (property.length === 1) {
              let extractedProperty = property[0];
              return !!note[extractedProperty]; // the first! turns the property into a (false) boolean, the second ! inverts to return true
            } else if (Array.isArray(property) && property.length === 2) {
              const [key, value] = property;
              const noteValue = note[key];
              if (Array.isArray(noteValue)) {
                return noteValue.includes(value);
              }
              return noteValue === value;
            }
            return false;
          }) &&
          // exclude properties
          !cleanPropertiesExclusionArray.some((property) => {
            if (property.length === 1) {
              let extractedProperty = property[0];
              return note[extractedProperty];
            } else if (property.length === 2) {
              const [key, value] = property;
              const noteValue = note[key];
              if (Array.isArray(noteValue)) {
                return noteValue.includes(value);
              }
              return noteValue === value;
            }
            return false;
          })
        );
      });

      // USE FILTERED LIST TO NARROW DOWN SORTED LIST --------------------------
      // put the paths into an object to speed up things
      const filteredPathObject: { [key: string]: boolean } = {};
      for (let note of filteredNotes) {
        filteredPathObject[(note as Types.DVNote).file.path] = true;
      }
      // now filter
      for (let path of sortedFilePathArray) {
        if (filteredPathObject[path] && !finalPathArray.includes(path)) {
          finalPathArray.push(path);
        }
      }
    }

    if (flowBuildBasket.folderTitles) {
      finalPathArray = this.findAndAddFolderTitles(
        finalPathArray,
        flowBuildBasket,
      );
    }

    // pack the definition back into the basket
    flowBuildBasket.flowDefinition = shFlowDefinition;

    // presto; as a reminder: this is handed back all the way up in createSourceNotePathArray
    return finalPathArray;
  };

  // ----------------------------------------------------------
  // --- FUNCTIONS TO MAKE SORTED PATH ARRAYS ---------------------
  // ----------------------------------------------------------
  // unsurprisingly, these are AI

  // Make array following note order -----------------------------------
  makeNoteOrderPathArray = (folder: TFolder, pathCollector: string[]) => {
    if (!this.plugin.settings.systemFolderPath) return [];
    // Split and sort folders and files separately
    const folders = folder.children
      .filter((child): child is TFolder => child instanceof TFolder)
      .sort((a, b) => a.name.localeCompare(b.name));

    const files = folder.children
      .filter((child): child is TFile => child instanceof TFile)
      .sort((a, b) => a.name.localeCompare(b.name));

    // then recurse into subfolders, if we don't exclude them
    for (const subfolder of folders) {
      this.makeNoteOrderPathArray(subfolder, pathCollector);
    }

    // Always process files in current folder
    for (const file of files) {
      if (file.path.startsWith(this.plugin.settings.systemFolderPath)) continue;
      pathCollector.push(file.path);
    }
    return pathCollector;
  };

  // Make array following folder order ------------------------------------
  makeFolderOrderPathArray = (folder: TFolder, pathCollector: string[]) => {
    const children = folder.children.sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    // Get notes first
    for (const child of children) {
      if (child instanceof TFile) {
        if (child.path.startsWith(`${this.plugin.settings.systemFolderPath}`))
          continue;
        pathCollector.push(child.path);
      }
    }
    // then recurse into subfolders, if we don't exclude them
    for (const child of children) {
      if (child instanceof TFolder) {
        this.makeFolderOrderPathArray(child, pathCollector);
      }
    }
    return pathCollector;
  };

  // --------------------------------------------------------------------
  // HELPER FUNCTION FOR INCLUDING FOLDER TITLES IN PATH DEFINED FLOWS
  // --------------------------------------------------------------------

  findAndAddFolderTitles = (
    finalPathArray: string[],
    flowBuildBasket: Types.flowBuildBasket,
  ) => {
    let arrayWithFolderTitles: string[] = [];
    let lastParentFolder = "";

    for (let currentPath of finalPathArray) {
      // Split current and last path into segments
      const currentPathSegments = currentPath.split("/");

      // find the last parent folder
      // if there is no parent
      if (currentPathSegments.length === 1 && flowBuildBasket.folderTitles) {
        if (lastParentFolder != this.app.vault.getName()) {
          arrayWithFolderTitles.push(`# ${this.app.vault.getName()}`);
          arrayWithFolderTitles.push(`${currentPath}`);
        }
        lastParentFolder = this.app.vault.getName();
      }
      // if there is a parent, check if it's a new one
      if (currentPathSegments.length >= 2 && flowBuildBasket.folderTitles) {
        let currentParentFolder =
          currentPathSegments[currentPathSegments.length - 2];
        if (lastParentFolder != currentParentFolder) {
          // if it's a new parent, push it and replace
          arrayWithFolderTitles.push(`# ${currentParentFolder}`);
          lastParentFolder = currentParentFolder;
        }
      }
      arrayWithFolderTitles.push(`${currentPath}`);
    }

    return arrayWithFolderTitles;
  };

  // ---- GET PATHS IN BOOKMARK GROUP ----------------
  getBookmarkPathsByGroupName = (flowBuildBasket: Types.flowBuildBasket) => {
    let groupName = flowBuildBasket.flowDefinition.bookmarks;

    // since groupName could be a path, prepare it for further processing:
    const cleanPath = groupName.replace(/\/+/g, "/");
    flowBuildBasket.flowDefinition.bookmarks = cleanPath;
    const groupPathArray = cleanPath.split("/");

    // if the user wants to exclude subgroups, flag and remove the trailing /
    let includeSubgroups: boolean = true;
    if (cleanPath.endsWith("/")) {
      includeSubgroups = false;
      groupPathArray.splice(groupPathArray.length - 1, 1);
    }

    // get the bookmarks via the API and prepare helper variables
    const bookmarks = (this.app as Types.ObsidianApp).internalPlugins.plugins
      .bookmarks.instance;
    const bookmarkItems = bookmarks.items;
    let bookmarkedNotePathsArray: string[] = [];

    //-- Function to navigate to the group and dissect out its contents, written by Claude
    const navigateToGroup = (
      items: Types.BookmarkItem[],
      pathParts: string[],
    ): Types.BookmarkItem | null => {
      let current = items;
      let found: Types.BookmarkItem | null = null;

      for (const part of pathParts) {
        found =
          current.find(
            (item) => item.type === "group" && item.title === part,
          ) || null;

        if (!found || !found.items) return null;
        current = found.items;
      }
      return found;
    };

    // Call to the function we just defined
    const finalGroup = navigateToGroup(bookmarkItems, groupPathArray);

    // -- the following collection triplet was birthed by Claude 3.5 Sonnet --------------------
    // as the doula, I shed quite some sweat, though, and maybe even some tears
    //-------------- Reflecting note order -------------------
    const collectBookmarkPathsNoteOrder = (
      items: Types.BookmarkItem[],
      flowBuildBasket: Types.flowBuildBasket,
      topLevelTitle: string, // Add parameter for top level title
    ): string[] => {
      if (!this.plugin.settings.systemFolderPath) return [];
      const bookmarkedNotePathsArray: string[] = [];

      const processGroup = (group: any) => {
        // First, process any subgroups (going deep first)
        if (group.items) {
          // Process subgroups first
          for (const item of group.items) {
            if (item.type === "group") {
              processGroup(item);
            }
          }

          // After processing subgroups, add this group's title and direct files
          if (flowBuildBasket.folderTitles) {
            bookmarkedNotePathsArray.push(`# ${group.title}`);
          }

          // Add only direct file children (not those in subgroups)
          const directFiles = group.items.filter(
            (item: any) => item.type === "file",
          );
          directFiles.forEach((file: any) => {
            bookmarkedNotePathsArray.push(file.path);
          });
        }
      };

      if (includeSubgroups) {
        // Process each group in the items array
        items.forEach((item) => {
          if (item.type === "group") {
            processGroup(item);
          }
        });
      }

      // After processing all groups, add the top level title and direct files
      if (
        topLevelTitle &&
        flowBuildBasket.folderTitles &&
        topLevelTitle != this.plugin.textFlowSystemFolderName
      ) {
        bookmarkedNotePathsArray.push(`# ${topLevelTitle}`);
      }

      // Add top-level files
      const topLevelFiles = items.filter((item) => item.type === "file");
      topLevelFiles.forEach((file) => {
        if (
          file &&
          file.path &&
          !file.path.startsWith(`${this.plugin.settings.systemFolderPath}`)
        ) {
          bookmarkedNotePathsArray.push(file.path);
        }
      });

      return bookmarkedNotePathsArray;
    };

    // ---- Reflecting folder order ----------------------
    const collectBookmarkPathsFolderOrder = (
      items: Types.BookmarkItem[],
      flowBuildBasket: Types.flowBuildBasket,
      topLevelTitle: string,
    ): string[] => {
      const bookmarkedNotePathsArray: string[] = [];

      // First handle top-level files
      const topLevelFiles = items.filter((item) => item.type === "file");
      if (topLevelTitle && flowBuildBasket.folderTitles) {
        bookmarkedNotePathsArray.push(`# ${topLevelTitle}`);
      }
      topLevelFiles.forEach((file) => {
        if (file.type === "file" && file.path) {
          bookmarkedNotePathsArray.push(file.path);
        }
      });

      // Then process groups
      for (const item of items) {
        if (item.type === "group" && item.items) {
          // Add this group's name and its direct files
          if (flowBuildBasket.folderTitles) {
            bookmarkedNotePathsArray.push(`# ${item.title ?? "Unnamed Group"}`);
          }
          // Add direct files
          item.items.forEach((file) => {
            if (file.type === "file" && file.path) {
              bookmarkedNotePathsArray.push(file.path);
            }
          });

          // Then process subgroups if included
          if (includeSubgroups) {
            item.items.forEach((subItem) => {
              if (subItem.type === "group") {
                if (flowBuildBasket.folderTitles) {
                  bookmarkedNotePathsArray.push(
                    `# ${subItem.title ?? "Unnamed Group"}`,
                  );
                }
                subItem.items?.forEach((file) => {
                  if (file.type === "file" && file.path) {
                    bookmarkedNotePathsArray.push(file.path);
                  }
                });
              }
            });
          }
        }
      }
      return bookmarkedNotePathsArray;
    };

    // ------------- Preserving custom order --------------------------------------
    // iterator is needed so it doesn't add the main group's name before every level
    let iterator = 0;
    const collectBookmarkPathsManualOrder = (
      items: Types.BookmarkItem[],
      flowBuildBasket: Types.flowBuildBasket,
    ): string[] => {
      iterator++;
      const bookmarkedNotePathsArray: string[] = [];

      // Add the toplevel title, if titles are wanted
      if (flowBuildBasket.folderTitles && iterator === 1) {
        bookmarkedNotePathsArray.push(
          `# ${groupPathArray[groupPathArray.length - 1]}`,
        );
      }

      // Process each item in original order
      for (const item of items) {
        if (item.type === "file" && item.path) {
          bookmarkedNotePathsArray.push(item.path);
        } else if (includeSubgroups && item.type === "group" && item.items) {
          if (flowBuildBasket.folderTitles) {
            bookmarkedNotePathsArray.push(`# ${item.title ?? "Unnamed Group"}`);
          }
          // Recursively process group contents and add results to our array
          const subGroupPaths = collectBookmarkPathsManualOrder(
            item.items,
            flowBuildBasket,
          );
          bookmarkedNotePathsArray.push(...subGroupPaths);
        }
      }

      return bookmarkedNotePathsArray;
    };

    // Call to the functions we just defined ---------------------------------
    if (finalGroup?.items) {
      if (
        flowBuildBasket.flowDefinition.bookmarksSortOrder === "noteOrder" ||
        flowBuildBasket.flowDefinition.bookmarksSortOrder === undefined
      ) {
        bookmarkedNotePathsArray = collectBookmarkPathsNoteOrder(
          finalGroup.items,
          flowBuildBasket,
          groupPathArray[groupPathArray.length - 1],
        );
        return bookmarkedNotePathsArray;
      } else if (
        flowBuildBasket.flowDefinition.bookmarksSortOrder === "folderOrder"
      ) {
        bookmarkedNotePathsArray = collectBookmarkPathsFolderOrder(
          finalGroup.items,
          flowBuildBasket,
          groupPathArray[groupPathArray.length - 1],
        );
        return bookmarkedNotePathsArray;
      } else {
        bookmarkedNotePathsArray = collectBookmarkPathsManualOrder(
          finalGroup.items,
          flowBuildBasket,
        );
        return bookmarkedNotePathsArray;
      }
    } else {
      new Notice(
        this.plugin.t(
          "createSourceNotePathArray.notice bookmark group not found",
        ),
      );
      return [];
    }
  };

  // ------ function that checks if flows overlap ------------
  // it's also called wayyyy back by createSourceNotePathArray

  overlapCollector = (flowBuildBasket: Types.flowBuildBasket) => {
    const overlapObject: Types.OverlapObject = {};
    const key = Object.keys(flowBuildBasket.flowNotesPathArray)[0];
    if (Object.keys(this.plugin.settings.flows).length >= 1) {
      flowLoop: for (let referenceFlow in this.plugin.settings.flows) {
        if (
          referenceFlow != flowBuildBasket.oldFlowName &&
          referenceFlow != flowBuildBasket.flowName
        ) {
          for (let path of flowBuildBasket.flowNotesPathArray) {
            if (
              !path.startsWith("#") &&
              this.plugin.settings.flows[referenceFlow].flowMap[path]
            ) {
              if (!overlapObject[referenceFlow]) {
                overlapObject[referenceFlow] = {};
              }
              overlapObject[referenceFlow][path] = true;
            }
          }
        }
      }
    }
    return overlapObject;
  };

  // --------------------------------------
  // WRITE DOWN AND SAVE ALL THE STUFF WE PUT TOGETHER UP THERE
  // --------------------------------------

  writeAndSaveFlowDef = async (flowBuildBasket: Types.flowBuildBasket) => {
    // handle double slashes, because those things would survive a nuclear winter
    if (flowBuildBasket.flowDefinition.folderIncluded === "//") {
      flowBuildBasket.flowDefinition.folderIncluded = "/";
    }

    // -------- CREATE THE FLOW OBJECT -------------------------------
    this.plugin.settings.flows[flowBuildBasket.flowName] = {
      flowFilePath: normalizePath(
        `${this.plugin.settings.systemFolderPath}/${flowBuildBasket.flowName}.md`,
      ),
      definitionMode: flowBuildBasket.definitionMode,
      flowDefinition: flowBuildBasket.flowDefinition,
      folderTitles: flowBuildBasket.folderTitles,
      isFreshBuild: true,
      flowBuilt: false,
      flaggedForRebuild: true,
      overlapObject: flowBuildBasket.overlapObject,
      lastActiveLeaves: flowBuildBasket.lastActiveLeaves,
      persistentCursors: flowBuildBasket.persistentCursors,
      unsyncedRegionsArray: [],
      flowMap: {},
    };
    await this.plugin.saveSettings();
  };

  // ----------------- sync overlap info across flows -----------------------

  syncOverlaps = (referenceFlow: Types.flowBuildBasket) => {
    let refFlowName = referenceFlow.flowName;

    Object.keys(this.plugin.settings.flows).forEach((syncFlowName) => {
      // Case 1: Flow is in reference overlaps
      if (syncFlowName != refFlowName && referenceFlow.overlapObject) {
        if (!this.plugin.settings.flows[syncFlowName].overlapObject) {
          this.plugin.settings.flows[syncFlowName].overlapObject = {};
        }
        this.plugin.settings.flows[syncFlowName].overlapObject[refFlowName] =
          referenceFlow.overlapObject[syncFlowName];
      }
      // Case 2: Syncflow is not in reference overlaps, but reference is in syncFlow's overlaps
      if (
        !referenceFlow.overlapObject[syncFlowName] &&
        this.plugin.settings.flows[syncFlowName].overlapObject
      ) {
        if (
          this.plugin.settings.flows[syncFlowName].overlapObject[refFlowName]
        ) {
          delete this.plugin.settings.flows[syncFlowName].overlapObject[
            refFlowName
          ];
        }
      }
    });
  };

  // --- Reset the flowBuildBasket -------------

  resetFlowBuildBasket = (resetFlowBuildBasket: Types.flowBuildBasket) => {
    resetFlowBuildBasket.createOrEdit = "create";
    resetFlowBuildBasket.dataviewSearchArray = [];
    resetFlowBuildBasket.success = false;
    resetFlowBuildBasket.flowName = "";
    resetFlowBuildBasket.oldFlowName = "";
    resetFlowBuildBasket.definitionMode = "";
    resetFlowBuildBasket.folderTitles = true;
    resetFlowBuildBasket.flowDefinition = {};
    resetFlowBuildBasket.flowNotesPathArray = [];
    resetFlowBuildBasket.overlapObject = {};
    resetFlowBuildBasket.lastActiveLeaves = [];
    resetFlowBuildBasket.persistentCursors = {};
  };

  // ------ The function that manages everything surrounding the rebuilding of a flow

  flowBuildingBundle = async (flowName: string, caller: string) => {
    this.plugin.isRebuilding = true;
    const flowReBuildBasket: Types.flowBuildBasket = {
      // rebuild specific properties
      createOrEdit: "",
      dataviewSearchArray: [],
      success: false,
      // properties that will be transferred to the actual flow object
      flowName: flowName,
      oldFlowName: flowName,
      definitionMode: this.plugin.settings.flows[flowName].definitionMode,
      folderTitles: this.plugin.settings.flows[flowName].folderTitles,
      flowDefinition: this.plugin.settings.flows[flowName].flowDefinition,
      flowNotesPathArray: [],
      overlapObject: this.plugin.settings.flows[flowName].overlapObject,
      lastActiveLeaves: this.plugin.settings.flows[flowName].lastActiveLeaves,
      persistentCursors: this.plugin.settings.flows[flowName].persistentCursors,
    };

    // do the thing
    await this.createSourceNotePathArray(flowReBuildBasket);

    // exit; error messages are sent by createSourceNotePathArray
    if (!flowReBuildBasket.success) {
      // clean up and save
      this.resetFlowBuildBasket(flowReBuildBasket);
      await this.plugin.saveSettings();
      return;
    }

    // do the other thing
    await this.writeAndSaveFlowDef(flowReBuildBasket);

    // update overlaps, reset flag, clean up the basket
    this.syncOverlaps(flowReBuildBasket); // null unsavedRegions
    this.plugin.settings.flows[flowName].flaggedForRebuild = false;
    await this.plugin.saveSettings();

    // Get a fresh reference now that we've written the def
    const updatedFlow = this.plugin.settings.flows[flowName];

    // ---------- THE ACTUAL FLOW FILE CREATION ----------------
    // the object that keeps track of stuff and shuttles values between the various parts of the function
    let mapValueBasket: Types.mapValueBasket = {
      concatenatedFileContents: "",
      basicUUID: "",
      invisibleUUID: "",
      flowOrder: 0,
      singleFileContent: "",
      currentEnd: 0,
      idDivider: "",
    };

    let key = "";
    updatedFlow.definitionMode
      ? (key = "bookmarks")
      : (key = "foldersTagsProps");

    let pathArray: string[] = [];
    Object.keys(this.plugin.settings.flows[flowName].flowMap).forEach(
      (note) => {
        pathArray.push(this.plugin.settings.flows[flowName].flowMap[note].path);
      },
    );

    // Call the build function; didn't think we'd get here...

    await this.flowBuilder(
      flowReBuildBasket.flowNotesPathArray,
      updatedFlow,
      flowName,
      mapValueBasket,
      caller,
    );

    // null the value basket, just to be thorough
    mapValueBasket = {
      concatenatedFileContents: "",
      basicUUID: "",
      invisibleUUID: "",
      flowOrder: 0,
      singleFileContent: "",
      currentEnd: 0,
      idDivider: "",
    };

    this.resetFlowBuildBasket(flowReBuildBasket);
    // reset the out of sync array
    const filteredArray = this.plugin.flowOutOfSync.filter((filterFlowname) => {
      filterFlowname != flowName;
    });
    this.plugin.flowOutOfSync = filteredArray;
    this.plugin.isRebuilding = false;
    await this.plugin.saveSettings();
  };

  // ------ The function that actually builds flows --------------------------

  flowBuilder = async (
    flowNotesPathArray: string[],
    flow: Types.FlowDef,
    flowName: string,
    mapValueBasket: Types.mapValueBasket,
    caller: string,
  ): Promise<void> => {
    // pre-flight check for SystemFolder
    let systemFolder = this.checkSystemFolder();
    if (!systemFolder) {
      new Notice(
        this.plugin.t("flowBuilder.notice system folder not found", {
          textFlowSystemFolderName: this.plugin.textFlowSystemFolderName,
        }),
      );
      return;
    }

    // ---- Progress stuff.

    type ProgressVisualizer = ProgressNotice;

    // prepare variable for the progress notice in case the call came from inside the... settingsTab
    let progressToast: ProgressVisualizer | null = null;
    if (caller === "settingsTab" || caller === "switcher") {
      progressToast = new ProgressNotice(flowName, this.plugin.t);
    }

    // Get an object started for the rest of cases
    let progressOverlays: { [key: string]: LoadingOverlay } = {};
    const leafIDAndEditorObject: { [key: string]: WorkspaceLeaf } = {};
    if (this.plugin.settings.activeRegions[flowName]) {
      Object.keys(this.plugin.settings.activeRegions[flowName]).forEach(
        async (leafID) => {
          const leaf = this.app.workspace.getLeafById(leafID);
          if (leaf) {
            // make sure the leaf has ben properly initialised
            await leaf.loadIfDeferred();

            leafIDAndEditorObject[leafID] = leaf;
            progressOverlays[leafID] = new LoadingOverlay(
              leaf,
              flowName,
              this.app,
              this.plugin,
              this.plugin.t,
            );
          }
        },
      );
    }

    // the part that persists flow frontmatter
    // fetch frontmatter if there is any
    let flowFilePath = this.plugin.settings.flows[flowName].flowFilePath;
    const flowFile = this.app.vault.getAbstractFileByPath(flowFilePath);
    if (flowFile instanceof TFile) {
      const cache = this.app.metadataCache.getFileCache(flowFile);
      const frontmatterPosition = cache?.frontmatterPosition;
      if (frontmatterPosition) {
        const fileContent = await this.app.vault.read(flowFile);
        const frontmatter = fileContent.slice(
          0,
          frontmatterPosition.end.offset + 1,
        );
        // put it in the basket with a line break
        mapValueBasket.concatenatedFileContents = frontmatter + "\n";
      }
    }

    // Info exange with the progress bar for toast and overlay
    let counter = 0;
    const total = flowNotesPathArray.length;
    for (let path of flowNotesPathArray) {
      // create update the progress bar
      counter++;
      if (caller === "settingsTab") {
        if (progressToast) {
          const symbolFilled = this.plugin.settings.explorerDecoStyle[1];
          progressToast.updateProgress(
            counter,
            total,
            symbolFilled,
            this.plugin.t,
          );
        }
      } else {
        const symbolEmpty =
          this.plugin.settingsTabFunctions.explorerDecoArray[0][0];
        const symbolFilled = this.plugin.settings.explorerDecoStyle[1];
        Object.keys(progressOverlays).forEach((leafID) => {
          progressOverlays[leafID].updateProgress(
            counter,
            total,
            symbolEmpty,
            symbolFilled,
          );
        });
      }
      if (counter === total) {
        if (caller === "settingsTab" || caller === "switcher") {
          if (progressToast) {
            progressToast.close();
          }
        }
        if (caller != "settingsTab") {
          Object.keys(progressOverlays).forEach((leafID) => {
            progressOverlays[leafID].remove();
          });
        }
      }

      // --- The actual handling of content ----------
      // If the ingredient (array entry) is a folder/group title
      if (path.startsWith("#")) {
        mapValueBasket.flowOrder++;
        this.createInvisibleUID(mapValueBasket);
        // make the proper divider
        mapValueBasket.idDivider = `\r${mapValueBasket.invisibleUUID}<hr>\r\r`;

        // visible divider for debugging purposes (there's also debugUID())
        // mapValueBasket.idDivider = `\r${mapValueBasket.identifier}<hr>\r\r`;

        flow.flowMap[path] = {
          type: "folder",
          path: path,
          basicUUID: mapValueBasket.basicUUID,
          invisibleUUID: mapValueBasket.invisibleUUID,
          flowOrder: mapValueBasket.flowOrder,
        } as Types.SourceFileObject;

        // Add content with marker before divider
        mapValueBasket.concatenatedFileContents += `${path}${mapValueBasket.idDivider}`;
      }
      // if the ingredient is a path
      else {
        mapValueBasket.flowOrder++;
        this.createInvisibleUID(mapValueBasket);
        mapValueBasket.idDivider = `\r${mapValueBasket.invisibleUUID}<hr>\r\r`;

        // unencoded divider for debugging purposes (there's also debugUID())
        // mapValueBasket.idDivider = `\r${mapValueBasket.identifier}<hr>\r\r`;

        // get the note
        const note = this.app.vault.getAbstractFileByPath(path);
        if (!note) {
          new Notice(
            this.plugin.t("flowBuilder.notice path not found", {
              path: path,
            }),
          );
          return;
        }

        // type check
        if (note instanceof TFile) {
          let fileContent: string = await this.app.vault.read(note);

          // make a hash if we don't have one yet but need it
          if (this.plugin.settings.checkExternalEdits != "no") {
            if (!this.plugin.settings.hashes[path]) {
              const hash = this.plugin.makeHash(fileContent);
              this.plugin.settings.hashes[path] = hash;
            }
          }

          // check if there are UUIDs in there due to a sync fuckup
          let match;
          const regex =
            /[\u200B\u200C\u200D\u2060\u2061\u2062\u2063\u2064\uFEFF\u00A0]{46}/;

          if ((match = regex.exec(fileContent) !== null)) {
            // remove any progress stuff so the user isn't stuck with the overlay/has to click away the toast
            if (caller === "settingsTab" || caller === "switcher") {
              if (progressToast) {
                progressToast.close();
              }
            }
            if (caller != "settingsTab") {
              Object.keys(progressOverlays).forEach((leafID) => {
                progressOverlays[leafID].remove();
              });
            }

            // tell the user
            new Notice(
              this.plugin.t("flowBUilder.notice UUID found in source note", {
                path: path,
                flowName: flowName,
              }),
              0,
            );

            // then stop
            return;
          }

          // remove frontmatter
          mapValueBasket.singleFileContent = fileContent
            .replace(/^---\n[\s\S]*?\n---\n*/, "")
            .trim();

          // get mtime regardless of user settings because we gotta put something in the object
          const mtime = note.stat.mtime;

          // put all info in the note object
          flow.flowMap[path] = {
            type: "file",
            mtime: mtime,
            path: path,
            basicUUID: mapValueBasket.basicUUID,
            invisibleUUID: mapValueBasket.invisibleUUID,
            flowOrder: mapValueBasket.flowOrder,
          } as Types.SourceFileObject;

          // Add content with marker before divider
          mapValueBasket.concatenatedFileContents += `${mapValueBasket.singleFileContent}${mapValueBasket.idDivider}`;
        } else {
          console.error("Invalid file.");
        }
      }
    }
    if (systemFolder && systemFolder instanceof TFolder) {
      const flowFilePath = normalizePath(
        `${this.plugin.settings.systemFolderPath}/${flowName}.md`,
      );

      // this also takes care of flags for write protection and listeners
      this.plugin.textFlowOperation = true;
      await this.plugin.settingsTabFunctions.safeCreateOrModifyFile(
        flowFilePath,
        mapValueBasket.concatenatedFileContents,
      );
      this.plugin.textFlowOperation = false;

      // remove the progress toast if it exists
      if (progressToast) {
        progressToast.close();
      }
      // also, scroll and remove progress overlay
      Object.keys(progressOverlays).forEach((leafID) => {
        Object.keys(this.plugin.settings.activeRegions).forEach((flowName) => {
          if (this.plugin.settings.activeRegions[flowName][leafID]) {
            if (this.plugin.settings.activeRegions[flowName][leafID]) {
              // check if we got a cursor position
              if (
                !this.plugin.settings.flows[flowName].persistentCursors ||
                !this.plugin.settings.flows[flowName].persistentCursors[
                  leafID
                ] ||
                !this.plugin.settings.flows[flowName].persistentCursors[leafID]
                  .cursors
              ) {
                // if we don't that's it
                return;
              } else {
                // if we do, we first scroll there
                const leaf = leafIDAndEditorObject[leafID];
                if (!leaf || !(leaf.view instanceof MarkdownView)) {
                  progressOverlays[leafID].remove();
                  return;
                }
                const view = leaf.view;
                if (view instanceof MarkdownView) {
                  this.plugin.settingsTabFunctions.restoreCursorPos(
                    flowName,
                    view,
                    leafID,
                  );
                }
                // remove the operlay
                progressOverlays[leafID].remove();
              }
            }
          }
        });
      });

      await this.plugin.saveSettings();
    }
  };

  // ---- Like it says.... --------------------------
  createInvisibleUID = (mapValueBasket: Types.mapValueBasket) => {
    const invisibleChars = [
      "\u00A0", // No-Break Space 0
      "\u200B", // Zero-width space 1
      "\u200C", // Zero-width non-joiner 2
      "\u200D", // Zero-width joiner 3
      "\u2060", // Word joiner 4
      "\u2061", // Function application 5
      "\u2062", // Invisible times 6
      "\u2063", // Invisible separator 7
      "\u2064", // Invisible plus 8
      "\uFEFF", // Zero-width no-break space 9
    ];

    // for debugging
    /*
    const invisibleChars = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
    */

    // get the initial UUID
    let UUID = crypto.randomUUID();

    // turn it into base9 piecemeal (to avoid bigint), then join and pad so the regEx is easier and faster
    const base9Transform = (identifier: string) => {
      const initialIdentifierArray = identifier.split("-");
      const base9IdentifierArray: string[] = [];
      // this transformer is all AI
      for (let hexNumber of initialIdentifierArray) {
        const numberIdentifier = parseInt(hexNumber, 16);
        const base9 = numberIdentifier.toString(9);
        const transformedIdentifier = [...base9]
          .map((digit) => invisibleChars[parseInt(digit)])
          .join("");
        base9IdentifierArray.push(transformedIdentifier);
      }
      const finalIdentifier = base9IdentifierArray.join("");
      const paddedTransformedIdentifier = finalIdentifier.padStart(
        46,
        invisibleChars[1],
      );

      return paddedTransformedIdentifier;
    };

    // call the function
    const paddedBase9Identifier = base9Transform(UUID);

    // put both versions in the basket
    mapValueBasket.basicUUID = UUID;
    mapValueBasket.invisibleUUID = paddedBase9Identifier;
  };

  // puts copy of all flow defs in a .json into textFlowSystemFolder in the user's vault
  backupFlowDefs = async () => {
    let datedFlows: { [key: string]: Types.FlowDef } = {};

    for (let flowName of Object.keys(this.plugin.settings.flows)) {
      const currentDate = this.plugin.settingsTabFunctions.getTimestamp();
      const backupName = `${flowName}*${currentDate}`;
      datedFlows[backupName] = structuredClone(
        this.plugin.settings.flows[flowName],
      );
      datedFlows[backupName].flowBuilt = false;
      datedFlows[backupName].flaggedForRebuild = true;
      datedFlows[backupName].overlapObject = {};
      datedFlows[backupName].lastActiveLeaves = [];
      datedFlows[backupName].persistentCursors = {};
      datedFlows[backupName].unsyncedRegionsArray = [];
      datedFlows[backupName].flowMap = {};
    }

    // Make the path
    let backupPath = "";
    if (this.plugin.settings.systemFolderPath) {
      backupPath = path.join(
        this.plugin.settings.systemFolderPath,
        "textFlowDefBackup.json",
      );
    }

    if (!this.plugin.settings.systemFolderPath) {
      new Notice(this.plugin.t("sysFolder please setup"));
      return;
    }

    if (await this.app.vault.adapter.exists(backupPath)) {
      await this.app.vault.adapter.remove(backupPath);
    }

    // write the object back to our file
    await this.app.vault.adapter.write(
      backupPath,
      JSON.stringify(datedFlows, null, 2),
    );
  };

  // </settingsTabFunctions>
  // ---------------------------------------------------------------

  //--------------------------------------------------
  // To encapsulate this apparently unavoidable 'as any' type casting; a robot said this is how you do it
  getLeafID = (leaf: WorkspaceLeaf): Types.LeafID => {
    return (leaf as any).id as Types.LeafID;
  };

  // I have no idea if this even does anything, but I actually feel more comfortable like this, so...
  getEditor = (view: MarkdownView): Types.ObsidianEditor | null => {
    const editor = view.editor as Types.ObsidianEditor;
    return editor ?? null;
  };

  getEditorCM = (editor: Editor): EditorView | null => {
    const cm = (editor as Types.EditorWithCM).cm;
    return cm instanceof EditorView ? cm : null;
  };

  getMarkdownView = (leaf: WorkspaceLeaf): MarkdownView | null => {
    const view = leaf.view as MarkdownView;
    return view ?? null;
  };

  // For debugging ------------------------------------------
  callStack = (recipient: string) => {
    const stack = new Error().stack;
    if (!stack) return;
    console.log(recipient, stack, Date.now());
  };

  // -------- Restore cursorPos for known and unknown leafIDs
  restoreCursorPos = (flowName: string, view: MarkdownView, leafID: string) => {
    if (
      this.plugin.settings.flows[flowName].persistentCursors &&
      this.plugin.settings.flows[flowName].persistentCursors[leafID]
    ) {
      const editor = this.plugin.settingsTabFunctions.getEditor(view);
      if (!editor) return;
      const cursorPos =
        this.plugin.settings.flows[flowName].persistentCursors[leafID]
          .cursors[0][1];

      if (cursorPos !== undefined && cursorPos >= 0) {
        this.scrollToPos(editor, cursorPos);
      }
    } else {
      // get the most recent time stamp for the active flow
      const timestampArray: number[] = [];
      if (
        Object.keys(this.plugin.settings.flows[flowName].persistentCursors)
          .length > 0
      ) {
        Object.keys(
          this.plugin.settings.flows[flowName].persistentCursors,
        ).forEach((leafID) => {
          timestampArray.push(
            this.plugin.settings.flows[flowName].persistentCursors[leafID]
              .update,
          );
        });

        // sort the timestamps in reverse order so newest timestamp comes first
        timestampArray.sort((a, b) => b - a);

        const mostRecentTimestamp: number = timestampArray[0];
        let mostRecentCursor: number = 0;
        if (this.plugin.settings.flows[flowName].persistentCursors) {
          Object.keys(
            this.plugin.settings.flows[flowName].persistentCursors,
          ).forEach((leafID) => {
            if (
              this.plugin.settings.flows[flowName].persistentCursors[leafID]
                .update === mostRecentTimestamp
            ) {
              mostRecentCursor =
                this.plugin.settings.flows[flowName].persistentCursors[leafID]
                  .cursors[0][1];
            }
          });
        }

        const editor = this.plugin.settingsTabFunctions.getEditor(view);
        if (!editor) return;
        mostRecentCursor ? this.scrollToPos(editor, mostRecentCursor) : "";
      }
    }
  };

  // this function was written by Claude 3.5 Sonnet ---------------------------
  scrollToPos = (
    editor: Types.ObsidianEditor,
    cursorPos: number,
    dontFocus?: boolean,
  ) => {
    if (!editor.cm) return;
    if (editor.cm.state.doc.length === 0) return; // if the doc hasn't loaded yet; error when opening flow in new tab
    const cmEditor = editor.cm;
    if (!cmEditor) return; // It wants this checked, too, so we check it

    if (cursorPos !== undefined && cursorPos >= 0) {
      const line = cmEditor.state.doc.lineAt(Math.max(0, cursorPos));
      const targetPos = line.from;

      // Get current viewport info
      const viewport = cmEditor.viewport;

      // Calculate the target scroll position
      const targetLine = line.number;
      const lineHeight = cmEditor.defaultLineHeight;

      // Set selection and try to scroll using CodeMirror's way, so CodeMirror knows where we're at
      cmEditor.dispatch({
        selection: { anchor: targetPos, head: targetPos },
        effects: EditorView.scrollIntoView(targetPos, {
          y: "start",
          yMargin: lineHeight * 2,
        }),
      });

      // Then immediately use DOM scrolling as a forced backup
      // b/c sometimes the first scroll ends up with negative coordinates for some reason
      const scrollDOM = cmEditor.scrollDOM;
      const targetScrollTop = (targetLine - 1) * lineHeight;
      scrollDOM.scrollTop = targetScrollTop;

      if (!dontFocus) {
        cmEditor.focus();
      }
    }
  };

  // ---------------------------------------------
  safeCreateOrModifyFile = async (path: string, newContent: string) => {
    try {
      // this.callStack("safeCreateFile");

      const existingFile = this.app.vault.getAbstractFileByPath(path);
      // suspend write protection and the create listener
      if (existingFile instanceof TFile) {
        // check if the file is open so we can explicitly replace the editor content with our new flow; this avoids problems with the content not updating, resulting in tracking errors
        const leaves = this.app.workspace.getLeavesOfType("markdown");
        for (const leaf of leaves) {
          await leaf.loadIfDeferred();
          if (
            leaf.view instanceof MarkdownView &&
            leaf.view.file?.path === path
          ) {
            const editor = this.plugin.settingsTabFunctions.getEditor(
              leaf.view,
            );
            if (!editor) continue;
            editor.setValue(newContent);
            // we only need to catch one instance b/c replacing content in one editor replaces content in all editors holding that file
            return;
          }
        }
        // if the file exists but is not open, we get to here
        await this.app.vault.process(existingFile, (content) => {
          return newContent;
        });
      } else {
        await this.app.vault.create(path, newContent);
      }
    } catch (error) {
      console.error(`Failed to create/modify file at ${path}:`, error);
      throw error;
    }
  };

  // -------------------------------------------------
  // removes UUIDs and puts it in a new file in root with time stamped title
  exportFlow = async (flowName: string) => {
    const path = this.plugin.settings.flows[flowName].flowFilePath;
    const file = this.app.vault.getAbstractFileByPath(path);

    if (file instanceof TFile) {
      const fileContent: string = await this.app.vault.read(file);
      const stripUUIDs = (text: string): string => {
        const uuidPattern =
          /[\u200B\u200C\u200D\u2060\u2061\u2062\u2063\u2064\uFEFF\u00A0]{46}/g;
        const result = text.replace(uuidPattern, "\n");
        return result;
      };

      const cleanContent = stripUUIDs(fileContent);

      const yaml = ""; //`---\ntextFlowExport: true\n---`;
      const contentWithYaml = `${yaml}\n${cleanContent}`;

      const exportedFlowPath = normalizePath(
        `${flowName}_export_${this.getTimestamp()}.md`,
      );
      this.plugin.textFlowOperation = true;
      await this.safeCreateOrModifyFile(exportedFlowPath, contentWithYaml);
      this.plugin.textFlowOperation = false;
      new Notice(
        this.plugin.t("menubar.selectButton.notice successful export", {
          exportedFlowPath: exportedFlowPath,
        }),
      );
    }
  };

  // ----------------------------------------
  selectActiveRegion = (
    flowName: string,
    path: string,
    text: string,
    viewDotEditor: Editor,
  ) => {
    // notify of failure du to tracking error
    if (this.plugin.flowOutOfSync.includes(flowName)) {
      new Notice(
        this.plugin.t("menuBar.selectActiveRegion tracking error", {
          flowName: flowName,
        }),
      );
      return;
    }
    const map = this.plugin.settings.flows[flowName].flowMap;

    const startPos = this.plugin.findStartOfRegion(
      this.plugin.settings.flows[flowName],
      this.plugin.settings.flows[flowName].flowMap[path].flowOrder,
      text,
    );
    const endPos = text.indexOf(map[path].invisibleUUID) - 1; // subtract 1 for the \r before the UID

    if (startPos && endPos) {
      const cmEditor = this.getEditorCM(viewDotEditor);
      if (cmEditor) {
        // Type guard for ObsidianEditor
        try {
          cmEditor.dispatch({
            selection: { anchor: startPos + 1, head: endPos },
            scrollIntoView: true, // Optional: scroll the selection into view
          });
          cmEditor.focus(); // Optional: focus the editor
        } catch (error) {
          console.error("Failed to set selection:", error);
        }
      }
    }
  };

  //--------------------------------------------------
  updateScrollbarVisibility = async () => {
    // Handle all leaves
    // add hider if all are hidden
    if (this.plugin.settings.hideScrollbar === "all") {
      const body = document.body;
      body.classList.remove("hide-scrollbar");
      body.classList.add("hide-scrollbar");
    } else {
      // otherwise remove hiding from class list
      const body = document.body;
      body.classList.remove("hide-scrollbar");

      // then check for container classes
      const allLeaves = this.app.workspace.getLeavesOfType("markdown");
      for (let leaf of allLeaves) {
        await leaf.loadIfDeferred();
        if (leaf.view instanceof MarkdownView && leaf.view.file) {
          // check if it's a flow
          const flowName = this.plugin.isFlowFile(leaf.view.file.path);
          if (!flowName) {
            // remove the class
            leaf.view.containerEl.removeClass("hide-scrollbar");
            continue;
          }

          // If the leaf is a flow and we want to hide
          if (this.plugin.settings.hideScrollbar === "flows") {
            if (!leaf.view.containerEl.hasClass("hide-scrollbar")) {
              leaf.view.containerEl.addClass("hide-scrollbar");
            }
          } else {
            // unhide it
            leaf.view.containerEl.removeClass("hide-scrollbar");
          }
        }
      }
    }
  };

  //--------------------------------------------------
  // this was written by Claude 3.5 Sonnet
  getTimestamp = (timestamp?: number): string => {
    const date = new Date(timestamp || Date.now());

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${year}-${month}-${day}_${hours}-${minutes}`;
  };

  //--------------------------------------------------
  // The arrays with the deco stuff, which I made, one by one, by hand. Because I like pain sometimes.
  explorerDecoArray: Types.DecorationEntry[] = [
    ["--", "", "large-high-contrast-neutral", "large-high-contrast-unsynced"],

    ["○", "●", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["○", "●", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["○", "●", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["○", "●", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["☆", "★", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["☆", "★", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["☆", "★", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["☆", "★", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["◇", "◆", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["◇", "◆", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["◇", "◆", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["◇", "◆", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["❀", "✿", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["❀", "✿", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["❀", "✿", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["❀", "✿", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["❄", "❆", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["❄", "❆", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["❄", "❆", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["❄", "❆", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["❝", "❞", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["❝", "❞", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["❝", "❞", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["❝", "❞", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["❤", "❤", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["❤", "❤", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["❤", "❤", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["❤", "❤", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["☯", "☯", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["☯", "☯", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["☯", "☯", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["☯", "☯", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["☮", "☮", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["☮", "☮", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["☮", "☮", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["☮", "☮", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["✈", "✈", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["✈", "✈", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["✈", "✈", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["✈", "✈", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["♪", "♫", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["♪", "♫", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["♪", "♫", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["♪", "♫", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["☠", "☠", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["☠", "☠", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["☠", "☠", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["☠", "☠", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["⚐", "⚑", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["⚐", "⚑", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["⚐", "⚑", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["⚐", "⚑", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["⚕", "⚕", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["⚕", "⚕", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["⚕", "⚕", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["⚕", "⚕", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["⚖", "⚖", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["⚖", "⚖", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["⚖", "⚖", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["⚖", "⚖", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["⚝", "⚝", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["⚝", "⚝", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["⚝", "⚝", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["⚝", "⚝", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["⚓", "⚓", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["⚓", "⚓", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["⚓", "⚓", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["⚓", "⚓", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["⚔", "⚔", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["⚔", "⚔", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["⚔", "⚔", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["⚔", "⚔", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["⚛", "⚛", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["⚛", "⚛", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["⚛", "⚛", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["⚛", "⚛", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["☣", "☣", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["☣", "☣", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["☣", "☣", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["☣", "☣", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["▒", "▓", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["▒", "▓", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["▒", "▓", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["▒", "▓", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["∈", "∈", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["∈", "∈", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["∈", "∈", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["∈", "∈", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["∑", "∑", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["∑", "∑", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["∑", "∑", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["∑", "∑", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["∧", "∨", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["∧", "∨", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["∧", "∨", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["∧", "∨", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["∫", "∫", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["∫", "∫", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["∫", "∫", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["∫", "∫", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["=", "≠", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["=", "≠", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["=", "≠", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["=", "≠", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    [".", "?", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    [".", "?", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    [".", "?", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    [".", "?", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    [".", "!", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    [".", "!", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    [".", "!", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    [".", "!", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["#", "#", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["#", "#", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["#", "#", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["#", "#", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["*", "*", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["*", "*", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["*", "*", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["*", "*", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["→", "←", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["→", "←", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["→", "←", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["→", "←", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

    ["←", "→", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["←", "→", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["←", "→", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["←", "→", "small-low-contrast-neutral", "small-low-contrast-unsynced"],
  ];
}
