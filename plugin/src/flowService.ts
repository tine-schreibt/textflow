import {
  App,
  ButtonComponent,
  Editor,
  MarkdownView,
  normalizePath,
  Notice,
  TFolder,
  TFile,
  Vault,
  WorkspaceLeaf,
} from "obsidian";
import { EditorView } from "@codemirror/view";
import TextFlow from "../main";
import * as Types from "./types";
import fs from "fs/promises";
import path, { dirname, basename } from "path";
import { getAPI } from "obsidian-dataview";

//-----------------------------------------------------------------------------------------
// TOC
//-----------------------------------------------------------------------------------------
// - Progress stuff
//-----------------------------------------------------------------------------------------
//    - class ProgressNotice
//    - class LoadingOverlay
//-----------------------------------------------------------------------------------------
// - Required by settingsTab in order of mention
//-----------------------------------------------------------------------------------------
//    - checkSystemFolder
//    - createSystemFolder
//    - debouncedSaveSettings
//    - radioButtonManager
//    - isValidFlowName
//    - renameFlow
//    - radioButtonManager
//    - CREATE FLOW DEFINITON
//      - getBookmarkPathsByGroupName
//      - ensureNoUndefined
//      - getPathsByFoldersTagsProps
//    - writeFlowDef
//    - conflictCollector
//    - syncConflictObjects
//    - resetFlowBuildBasket
//    - REBUILD FLOW
//      - flowBuilder
//       - createInvisibleUUID
//       - debugUID
//    - restoreCursorPos (for saved pos)
//    - scrollToPos (for computed pos)
//    - safeCreateFile
//    - backupFlowDef
//-----------------------------------------------------------------------------------------
// - Required by menuBar.ts and main.ts
//-----------------------------------------------------------------------------------------
//    - exportFlow
//    - selectActiveRegion
//-----------------------------------------------------------------------------------------
// - Random utilities and... is it called assets?
//-----------------------------------------------------------------------------------------
//    - updateScrollbarVisibility
//    - getTimestamp
//    - explorerDecoArray
//-----------------------------------------------------------------------------------------
//-----------------------------------------------------------------------------------------

interface ObsidianEditor extends Editor {
  cm?: EditorView;
}

// --- A class for the build progress notice (shown when rebuilding from settings tab)
class ProgressNotice {
  private notice: Notice;
  private flowName: string;
  private t: (key: string, variables?: Record<string, string>) => string;
  constructor(
    flowName: string,
    translation: (key: string, variables?: Record<string, string>) => string
  ) {
    this.flowName = flowName;
    this.t = translation;
    this.notice = new Notice(
      this.t("flowService.progressNotice.notice initial notice", {
        this_flowName: this.flowName,
      })
    );
  }

  updateProgress(
    current: number,
    total: number,
    symbolFilled: string,
    t: (key: string, variables?: Record<string, string>) => string
  ) {
    const percent = Math.floor((current / total) * 100);
    const percentString = percent.toString();
    const filled = Math.floor(percent / 10);
    const bar =
      "[" + symbolFilled.repeat(filled) + "o".repeat(10 - filled) + "]";
    this.notice.setMessage(
      t("flowService.progressNotice.notice updated notice", {
        this_flowName: this.flowName,
        bar: bar,
        percent: percentString,
      })
    );
  }

  close() {
    this.notice.hide();
  }
}

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
      text: this.t("flowService.progressNotice.notice initial notice", {
        this_flowName: this.flowName,
      }),
    });
  }

  updateProgress(
    current: number,
    total: number,
    symbolEmpty: string,
    symbolFilled: string
  ) {
    const percent = Math.floor((current / total) * 100);
    const percentString = percent.toString();
    const filled = Math.floor(percent / 10);
    const bar =
      "[" + symbolFilled.repeat(filled) + symbolEmpty.repeat(10 - filled) + "]";
    const text = this.t("flowService.progressNotice.notice updated notice", {
      this_flowName: this.flowName,
      bar: bar,
      percent: percentString,
    });
    this.progressText.setText(text);
  }

  remove() {
    this.container.remove();
  }
}

export class FlowService {
  constructor(private plugin: TextFlow, private app: App) {}
  //#######################################################################
  //###########################    Functions   ############################
  //#######################################################################

  // stuff is sorted in the order in which it is being called from settingsTab
  // -------- see if a system folder already exists -------

  checkSystemFolder = () => {
    const systemFolder = this.app.vault
      .getAllLoadedFiles()
      .find(
        (file) =>
          file instanceof TFolder &&
          file.name === this.plugin.textFlowSystemFolderName
      );
    return systemFolder instanceof TFolder ? systemFolder : null;
  };

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
        await this.safeCreateOrModifyFile(readmePath, content);

        // inform the user of success
        new Notice(
          this.plugin.t("createSystemFolder.notice folder created", {
            newSystemFolderPath: newSystemFolderPath,
          })
        );
      } else if (!(newSystemFolder instanceof TFolder)) {
        throw new Error(`"${newSystemFolderPath}" exists but is not a folder.`);
      }
    } catch (e) {
      console.error(
        `textFlow: Something went wrong when trying to create ${newSystemFolderPath}: ${e}`
      );
    }
  };

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
          { flowName: name }
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
          "textFlow: Please remove invalid characters from your flow name"
        ),
      };
    }

    // Check for names ending with period or space (problematic on Windows)
    if (name.startsWith(".") || name.endsWith(".")) {
      return {
        valid: false,
        reason: this.plugin.t(
          "textFlow: A flow name cannot start or end with a period"
        ),
      };
    }

    return { valid: true };
  };

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
      const leaves = this.app.workspace.getLeavesOfType("markdown");
      Object.keys(this.plugin.settings.activeRegions).forEach((activeFlow) => {
        if (activeFlow === oldFlowName) {
          Object.keys(this.plugin.settings.activeRegions[activeFlow]).forEach(
            async (leafID) => {
              const targetLeaf = leaves.find(
                (leaf) => this.getLeafId(leaf) === leafID
              );
              if (targetLeaf) {
                targetLeaf.detach();
              }
            }
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

      // handle conflictObjects for the flow
      Object.keys(this.plugin.settings.flows).forEach((otherFlowName) => {
        if (this.plugin.settings.flows[otherFlowName].conflictObject) {
          if (
            this.plugin.settings.flows[otherFlowName].conflictObject[
              oldFlowName
            ]
          ) {
            this.plugin.settings.flows[otherFlowName].conflictObject[
              newFlowName
            ] =
              this.plugin.settings.flows[otherFlowName].conflictObject[
                oldFlowName
              ];
            delete this.plugin.settings.flows[otherFlowName].conflictObject[
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
        `${this.plugin.settings.systemFolderPath}/${oldFlowName}.md`
      );
      const newFlowPath = normalizePath(
        `${this.plugin.settings.systemFolderPath}/${newFlowName}.md`
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

  // --- RADIO BUTTON MANAGER -----------------
  radioButtonManager(
    selectedButton: ButtonComponent,
    unselectedButton1: ButtonComponent
  ) {
    // Update all buttons
    selectedButton.buttonEl.addClass("settings-radio-button-active");
    unselectedButton1.buttonEl.removeClass("settings-radio-button-active");
  }

  createFlowDefinition = (flowBuildBasket: Types.flowBuildBasket) => {
    // -------- Putting the finalRecipe together by fetching/filtering all paths
    try {
      // ----------- FINAL RECIPE FOR BOOKMARKS ---------------------
      if (flowBuildBasket.definitionMode === "bookmarks") {
        if (
          flowBuildBasket.flowCookbook.bookmarks === undefined ||
          flowBuildBasket.flowCookbook.bookmarks === ""
        ) {
          new Notice(
            this.plugin.t("createFlowDefinition.notice enter bookmark group")
          );
          flowBuildBasket.success = false;
        } else {
          const bookmarkPathArray =
            this.getBookmarkPathsByGroupName(flowBuildBasket);
          flowBuildBasket.finalRecipe = bookmarkPathArray;
        }

        // ------ FINAL RECIPE FOR PATH TAG PROPERTY -----------------------
      } else {
        this.ensureNoUndefined(flowBuildBasket);

        const foldersTagsPropsPathArray =
          this.getPathsByFoldersTagsProps(flowBuildBasket);
        flowBuildBasket.finalRecipe = foldersTagsPropsPathArray;
      }
      // ---- Check for empty
      if (flowBuildBasket.finalRecipe.length === 0) {
        new Notice(
          this.plugin.t(
            "createFlowDefinition.notice definition leads to empty flow"
          )
        );
        flowBuildBasket.success = false;
      }
      // get conflict info
      flowBuildBasket.conflictObject = this.conflictCollector(flowBuildBasket);
      flowBuildBasket.success = true;
    } catch (error) {
      new Notice(
        this.plugin.t(
          "createFlowDefinition.notice random error, please check console"
        )
      );
      flowBuildBasket.success = false;
    }
  };

  // --- HELPER FUNCTIONS FOR FETCHING PATHS (AND CLEANING UP STUFF)
  // Also we're using the opportunity to get a clean cookbook (user input) for storage

  // ---- GET PATHS IN BOOKMARK GROUP ----------------
  getBookmarkPathsByGroupName = (flowBuildBasket: Types.flowBuildBasket) => {
    let groupName = flowBuildBasket.flowCookbook.bookmarks;

    // since groupName could be a path, prepare it for further processing:
    const cleanPath = groupName.replace(/\/+/g, "/");
    flowBuildBasket.flowCookbook.bookmarks = cleanPath;
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

    //-- Function to navigate to the group and dissect out its contents
    const navigateToGroup = (
      items: Types.BookmarkItem[],
      pathParts: string[]
    ): Types.BookmarkItem | null => {
      let current = items;
      let found: Types.BookmarkItem | null = null;

      for (const part of pathParts) {
        found =
          current.find(
            (item) => item.type === "group" && item.title === part
          ) || null;

        if (!found || !found.items) return null;
        current = found.items;
      }
      return found;
    };

    // Call to the function we just defined
    const finalGroup = navigateToGroup(bookmarkItems, groupPathArray);

    // -- the collection triplet was birthed by Claude 3.5 Sonnet --------------------
    //-- as the midspouse, I shed quite some sweat, though, and maybe even some tears-------

    //-- Function to collect stuff DEPTH FIRST
    const collectPathsNoteOrder = (
      items: Types.BookmarkItem[],
      flowBuildBasket: Types.flowBuildBasket,
      topLevelTitle: string // Add parameter for top level title
    ): string[] => {
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
            (item: any) => item.type === "file"
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
      if (topLevelTitle && flowBuildBasket.folderTitles) {
        bookmarkedNotePathsArray.push(`# ${topLevelTitle}`);
      }

      // Add top-level files
      const topLevelFiles = items.filter((item) => item.type === "file");
      topLevelFiles.forEach((file) => {
        if (file && file.path) {
          bookmarkedNotePathsArray.push(file.path);
        }
      });

      return bookmarkedNotePathsArray;
    };

    // ---- notes first
    const collectPathsFolderOrder = (
      items: Types.BookmarkItem[],
      flowBuildBasket: Types.flowBuildBasket,
      topLevelTitle: string
    ): string[] => {
      const bookmarkedNotePathsArray: string[] = [];

      // First handle top-level files
      const topLevelFiles = items.filter((item) => item.type === "file");
      if (topLevelTitle && flowBuildBasket.folderTitles) {
        bookmarkedNotePathsArray.push(`#${topLevelTitle}`);
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
            bookmarkedNotePathsArray.push(`#${item.title ?? "Unnamed Group"}`);
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
                    `#${subItem.title ?? "Unnamed Group"}`
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

    // --- Take everything as it comes: CUSTOM
    // iterator is needed so it doesn't add the main group's name before every
    // new level of the hierarchy
    let iterator = 0;
    const collectPathsPreserveOrder = (
      items: Types.BookmarkItem[],
      flowBuildBasket: Types.flowBuildBasket
    ): string[] => {
      iterator++;
      const bookmarkedNotePathsArray: string[] = [];

      // Add the toplevel title, if titles are wanted
      if (flowBuildBasket.folderTitles && iterator === 1) {
        bookmarkedNotePathsArray.push(
          `# ${groupPathArray[groupPathArray.length - 1]}`
        );
      }

      // Process each item in original order
      for (const item of items) {
        if (item.type === "file" && item.path) {
          bookmarkedNotePathsArray.push(item.path);
        } else if (includeSubgroups && item.type === "group" && item.items) {
          if (flowBuildBasket.folderTitles) {
            bookmarkedNotePathsArray.push(`#${item.title ?? "Unnamed Group"}`);
          }
          // Recursively process group contents and add results to our array
          const subGroupPaths = collectPathsPreserveOrder(
            item.items,
            flowBuildBasket
          );
          bookmarkedNotePathsArray.push(...subGroupPaths);
        }
      }

      return bookmarkedNotePathsArray;
    };

    // Call to the function we just defined
    if (finalGroup?.items) {
      if (
        flowBuildBasket.flowCookbook.bookmarksSortOrder === "noteOrder" ||
        flowBuildBasket.flowCookbook.bookmarksSortOrder === undefined
      ) {
        bookmarkedNotePathsArray = collectPathsNoteOrder(
          finalGroup.items,
          flowBuildBasket,
          groupPathArray[groupPathArray.length - 1]
        );
        return bookmarkedNotePathsArray;
      } else if (
        flowBuildBasket.flowCookbook.bookmarksSortOrder === "folderOrder"
      ) {
        bookmarkedNotePathsArray = collectPathsFolderOrder(
          finalGroup.items,
          flowBuildBasket,
          groupPathArray[groupPathArray.length - 1]
        );
        return bookmarkedNotePathsArray;
      } else {
        bookmarkedNotePathsArray = collectPathsPreserveOrder(
          finalGroup.items,
          flowBuildBasket
        );
        return bookmarkedNotePathsArray;
      }
    } else {
      new Notice(
        this.plugin.t("createFlowDefinition.notice bookmark group not found")
      );
      return [];
    }
  };

  // --- GET ALL PATHS FROM FOLDER TAG PROPERTY ---------------------------
  // But first we snappily ensure we don't have undefineds and make the ! type assertion later on safe to use
  ensureNoUndefined = async (flowBuildBasket: Types.flowBuildBasket) => {
    if (flowBuildBasket.flowCookbook.folderIncluded === undefined) {
      flowBuildBasket.flowCookbook.folderIncluded = "";
    }
    if (flowBuildBasket.flowCookbook.folderExcluded === undefined) {
      flowBuildBasket.flowCookbook.folderExcluded = "";
    }
    if (flowBuildBasket.flowCookbook.tagsIncluded === undefined) {
      flowBuildBasket.flowCookbook.tagsIncluded = "";
    }
    if (flowBuildBasket.flowCookbook.tagsExcluded === undefined) {
      flowBuildBasket.flowCookbook.tagsExcluded = "";
    }
    if (flowBuildBasket.flowCookbook.propsIncluded === undefined) {
      flowBuildBasket.flowCookbook.propsIncluded = "";
    }
    if (flowBuildBasket.flowCookbook.propsExcluded === undefined) {
      flowBuildBasket.flowCookbook.propsExcluded = "";
    }
  };

  // --- Function to get the paths -------

  getPathsByFoldersTagsProps = (flowBuildBasket: Types.flowBuildBasket) => {
    const dv = getAPI();
    if (!dv) {
      new Notice(
        this.plugin.t(
          "getPathsByFoldersTagsProps.notice dataview not installed"
        )
      );
      return [];
    }
    // unpack into shorthand for easier reading
    const shCookbook = flowBuildBasket.flowCookbook;
    // ---- Pre-flight checks and cleanup --------------

    //--- INCLUDED FOLDER - only one path; notify if multiple
    let cleanFolderInclusionArray: string[] = [];

    const folderInclusionArray = shCookbook.folderIncluded.split(",");
    if (folderInclusionArray.length >= 1) {
      const nonEmptyFolderInclusionArray = folderInclusionArray.filter(
        (x) => x.length > 0
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
    flowBuildBasket.flowCookbook.folderIncluded =
      cleanFolderInclusionArray.join(",");

    // Leave the cleanup. I know it's redundant, but if you touch it, it releases a curse.
    //--- EXCLUDED FOLDERS - clean up paths
    let cleanFolderExclusionArray: string[] = [];

    const folderExclusionArray = shCookbook.folderExcluded.split(",");
    if (folderExclusionArray.length >= 1) {
      const nonEmptyFolderExclusionArray = folderExclusionArray
        .map((x) => x.trim())
        .filter((x) => x.length > 0);
      for (let excludedFolder of nonEmptyFolderExclusionArray) {
        let cleanExcludedPath = normalizePath(excludedFolder.trim());
        cleanFolderExclusionArray.push(cleanExcludedPath);
      }
      // save cleaned values
      flowBuildBasket.flowCookbook.folderExcluded =
        cleanFolderExclusionArray.join(",");
    } else {
      cleanFolderExclusionArray.push("");
      flowBuildBasket.flowCookbook.folderExcluded = "";
    }

    // add the system folder path so it gets exluded
    if (this.plugin.settings.systemFolderPath) {
      cleanFolderExclusionArray.push(this.plugin.settings.systemFolderPath);
    }

    //--- INCLUDED and EXCLUDED TAGS - strip #
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

    // use cleanup on tags and save cleaned strings back
    const cleanTagInclusionArray = tagCleanup(shCookbook.tagsIncluded);
    flowBuildBasket.flowCookbook.tagsIncluded =
      cleanTagInclusionArray.join(",");
    const cleanTagExclusionArray = tagCleanup(shCookbook.tagsExcluded);
    flowBuildBasket.flowCookbook.tagsExcluded =
      cleanTagExclusionArray.join(",");

    //--- INCLUDED and  EXCLUDED PROPERTIES - clean up and split at =
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

    // Use cleanup on properties
    let cleanPropertiesInclusionArray = propertyCleanup(
      shCookbook.propsIncluded
    );

    let cleanPropertiesExclusionArray = propertyCleanup(
      shCookbook.propsExcluded
    );
    // add this to keep exports excluded
    cleanPropertiesExclusionArray.push(["textFlowExport"]);

    // Do NOT save cleaned up proprties back to the cookbook!
    // The formatting is not what's expected by the cleanup and it will break.

    // -------- cleanup done ----------------

    // --- FETCH FILE TREE FOR SORTING PURPOSES
    // some globals for the whole path stuff
    const fileTreeArray: string[] = [];
    const vault = this.app.vault;

    // Build tree in the same order as seen in fileExplorer
    const buildNoteOrderFileTree = (folder: TFolder) => {
      // Split and sort folders and files separately
      const folders = folder.children
        .filter((child): child is TFolder => child instanceof TFolder)
        .sort((a, b) => a.name.localeCompare(b.name));

      const files = folder.children
        .filter((child): child is TFile => child instanceof TFile)
        .sort((a, b) => a.name.localeCompare(b.name));

      // then recurse into subfolders, if we don't exclude them
      for (const subfolder of folders) {
        buildNoteOrderFileTree(subfolder);
      }

      // Always process files in current folder
      for (const file of files) {
        fileTreeArray.push(file.path);
      }
    };

    // Recursive function to build file tree notes first (changes order)
    const buildFolderOrderFileTree = (folder: TFolder) => {
      const children = folder.children.sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      // Get notes first
      for (const child of children) {
        if (child instanceof TFile) {
          fileTreeArray.push(child.path);
        }
      }
      // then recurse into subfolders, if we don't exclude them
      for (const child of children) {
        if (child instanceof TFolder) {
          buildFolderOrderFileTree(child);
        }
      }
    };

    // Build the complete file tree (which puts results in fileTreeArray)
    this.plugin.settings.flowBuildBasket.flowCookbook
      .pathsTagsPropertiesSortOrder === "noteOrder" ||
    this.plugin.settings.flowBuildBasket.flowCookbook
      .pathsTagsPropertiesSortOrder === undefined
      ? buildNoteOrderFileTree(vault.getRoot())
      : buildFolderOrderFileTree(vault.getRoot());

    // ---- CALL DATAVIEW API to fetch all included, then filter
    let finalPathArray: string[] = [];

    for (let dvInclusionTuple of flowBuildBasket.dataviewSearchArray) {
      const dvPath = dvInclusionTuple[0].trim();
      let allNotes = dv.pages(dvPath);

      // If inclusion path ends with slash, filter out subfolder stuff
      if (dvInclusionTuple[1] != "/" && dvInclusionTuple[1].endsWith("/")) {
        const baseFolder = dvInclusionTuple[1].replace(/\/$/, "");

        allNotes = allNotes.filter(
          (page: Types.DVNote) => path.dirname(page.file.path) === baseFolder
        );
      }

      const filteredNotes = allNotes.where((note: Types.DVNote) => {
        return (
          // exclude folders
          !cleanFolderExclusionArray.some((path) =>
            note.file.path.startsWith(path)
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
              return note[key] === value;
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
              return note[key] === value;
            }
            return false;
          })
        );
      });

      // pick the paths out of the resulting array
      const filteredPathArray = Array.from(filteredNotes).map(
        (note) => (note as Types.DVNote).file.path
      );
      const filteredPathObject: { [key: string]: boolean } = {};
      for (let path of filteredPathArray) {
        filteredPathObject[path] = true;
      }
      // maybe I should semantic version these pathArrays....
      for (let path of fileTreeArray) {
        if (filteredPathObject[path] && !finalPathArray.includes(path)) {
          finalPathArray.push(path);
        }
      }
    }

    // Helper functions for including folder titles

    // Depth first approach
    const findFolderTitlesNoteOrder = (
      finalPathArray: string[],
      flowBuildBasket: Types.flowBuildBasket
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
            arrayWithFolderTitles.push(`#${this.app.vault.getName()}`);
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
            arrayWithFolderTitles.push(`#${currentParentFolder}`);
            lastParentFolder = currentParentFolder;
          }
        }
        arrayWithFolderTitles.push(`${currentPath}`);
      }

      return arrayWithFolderTitles;
    };

    //-- function call for folder titles

    let pathArrayWithFolderTitles = findFolderTitlesNoteOrder(
      finalPathArray,
      flowBuildBasket
    );

    // pack the cookbook back into the basket
    flowBuildBasket.flowCookbook = shCookbook;

    // presto
    return pathArrayWithFolderTitles;
  };

  // ----- Save the stuff we just put together --------------

  writeFlowDef = async (
    settings: Types.TextFlowSettings,
    flowBuildBasket: Types.flowBuildBasket
  ) => {
    // handle double slashes
    if (flowBuildBasket.flowCookbook.folderIncluded === "//") {
      flowBuildBasket.flowCookbook.folderIncluded = "/";
    }

    // -------- CREATE THE FLOW OBJECT -------------------------------
    settings.flows[flowBuildBasket.flowName] = {
      flowFilePath: normalizePath(
        `${this.plugin.settings.systemFolderPath}/${flowBuildBasket.flowName}.md`
      ),
      definitionMode: flowBuildBasket.definitionMode,
      flowCookbook: flowBuildBasket.flowCookbook,
      folderTitles: flowBuildBasket.folderTitles,
      isFreshBuild: true,
      flowBuilt: false,
      flaggedForRebuild: true,
      conflictObject: flowBuildBasket.conflictObject,
      lastActiveLeaves: flowBuildBasket.lastActiveLeaves,
      persistentCursors: flowBuildBasket.persistentCursors,
      unsyncedRegionsArray: [],
      flowMap: {},
    };
    await this.plugin.saveSettings();
  };

  // ------ function that checks if flows overlap

  conflictCollector = (flowBuildBasket: Types.flowBuildBasket) => {
    const conflictObject: Types.ConflictObject = {};
    const key = Object.keys(flowBuildBasket.finalRecipe)[0];
    if (Object.keys(this.plugin.settings.flows).length >= 1) {
      flowLoop: for (let referenceFlow in this.plugin.settings.flows) {
        if (
          referenceFlow != flowBuildBasket.oldFlowName &&
          referenceFlow != flowBuildBasket.flowName
        ) {
          for (let path of flowBuildBasket.finalRecipe) {
            if (
              !path.startsWith("#") &&
              this.plugin.settings.flows[referenceFlow].flowMap[path]
            ) {
              if (!conflictObject[referenceFlow]) {
                conflictObject[referenceFlow] = {};
              }
              conflictObject[referenceFlow][path] = true;
            }
          }
        }
      }
    }
    return conflictObject;
  };

  // ----------------- sync conflicts

  syncConflictObjects = (referenceFlow: Types.flowBuildBasket) => {
    let refFlowName = referenceFlow.flowName;

    Object.keys(this.plugin.settings.flows).forEach((syncFlowName) => {
      // Case 1: Flow is in reference conflicts
      if (syncFlowName != refFlowName && referenceFlow.conflictObject) {
        if (!this.plugin.settings.flows[syncFlowName].conflictObject) {
          this.plugin.settings.flows[syncFlowName].conflictObject = {};
        }
        this.plugin.settings.flows[syncFlowName].conflictObject[refFlowName] =
          referenceFlow.conflictObject[syncFlowName];
      }
      // Case 2: Syncflow is not in reference conflicts, but reference is in syncFlow's conflicts
      if (
        !referenceFlow.conflictObject[syncFlowName] &&
        this.plugin.settings.flows[syncFlowName].conflictObject
      ) {
        if (
          this.plugin.settings.flows[syncFlowName].conflictObject[refFlowName]
        ) {
          delete this.plugin.settings.flows[syncFlowName].conflictObject[
            refFlowName
          ];
        }
      }
    });
  };

  // --- Reset flowBuildBasket -------------
  resetFlowBuildBasket = (resetFlowBuildBasket: Types.flowBuildBasket) => {
    resetFlowBuildBasket.createOrEdit = "create";
    resetFlowBuildBasket.dataviewSearchArray = [];
    resetFlowBuildBasket.success = false;
    resetFlowBuildBasket.flowName = "";
    resetFlowBuildBasket.oldFlowName = "";
    resetFlowBuildBasket.definitionMode = "";
    resetFlowBuildBasket.folderTitles = true;
    resetFlowBuildBasket.flowCookbook = {};
    resetFlowBuildBasket.finalRecipe = [];
    resetFlowBuildBasket.conflictObject = {};
    resetFlowBuildBasket.lastActiveLeaves = [];
    resetFlowBuildBasket.persistentCursors = {};
  };

  // ------ The function that handles everything necessary to (re)build a flow
  rebuildFlow = async (flowName: string, caller: string) => {
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
      flowCookbook: this.plugin.settings.flows[flowName].flowCookbook,
      finalRecipe: [],
      conflictObject: this.plugin.settings.flows[flowName].conflictObject,
      lastActiveLeaves: this.plugin.settings.flows[flowName].lastActiveLeaves,
      persistentCursors: this.plugin.settings.flows[flowName].persistentCursors,
    };

    // do the thing
    this.createFlowDefinition(flowReBuildBasket);

    // exit; error messages are sent by createFlowDefinition
    if (!flowReBuildBasket.success) {
      // clean up and save
      this.resetFlowBuildBasket(flowReBuildBasket);
      await this.plugin.saveSettings();
      return;
    }

    // do the other thing
    await this.writeFlowDef(this.plugin.settings, flowReBuildBasket);

    // update conflicts, reset flag, clean up the basket
    this.syncConflictObjects(flowReBuildBasket); // null unsavedRegions
    this.plugin.settings.flows[flowName].flaggedForRebuild = false;
    await this.plugin.saveSettings();

    // Get a fresh reference now that we've written the def
    const updatedFlow = this.plugin.settings.flows[flowName];

    // ---------- THE ACTUAL FLOW FILE CREATION ----------------
    // the object that keeps track of stuff and shuttles values between the various parts of the function
    let mapValueBasket: Types.mapValueBasket = {
      concatenatedFileContents: "",
      initialIteration: true,
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
      }
    );

    // Call the build function; didn't think we'd get here...

    await this.flowBuilder(
      flowReBuildBasket.finalRecipe,
      updatedFlow,
      flowName,
      mapValueBasket,
      caller
    );

    // null the basket, just to be thorough.
    mapValueBasket = {
      concatenatedFileContents: "",
      initialIteration: true,
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

  // ------ The flowBuilder --------------------------
  flowBuilder = async (
    recipeArray: string[],
    flow: Types.FlowDef,
    flowName: string,
    mapValueBasket: Types.mapValueBasket,
    caller: string
  ): Promise<void> => {
    // pre-flight check for SystemFolder
    let systemFolder = this.checkSystemFolder();
    if (!systemFolder) {
      new Notice(
        this.plugin.t("flowBuilder.notice system folder not found", {
          textFlowSystemFolderName: this.plugin.textFlowSystemFolderName,
        })
      );
      return;
    }

    // ---- Progress stuff.

    type ProgressVisualizer = ProgressNotice;

    // prepare variable for the progress notice
    // in case the call came from inside the...
    // settingsTab
    let progressToast: ProgressVisualizer | null = null;
    if (caller === "settingsTab" || caller === "switcher") {
      progressToast = new ProgressNotice(flowName, this.plugin.t);
    }

    // Get an object started for the rest of cases
    let progressOverlays: { [key: string]: LoadingOverlay } = {};
    const IDAndEditorObject: { [key: string]: WorkspaceLeaf } = {};
    if (this.plugin.settings.activeRegions[flowName]) {
      Object.keys(this.plugin.settings.activeRegions[flowName]).forEach(
        async (leafID) => {
          const leaves = this.app.workspace.getLeavesOfType("markdown");
          const leaf = leaves.find(
            (newLeaf) => this.getLeafId(newLeaf) === leafID
          );
          if (leaf) {
            // make sure the leaf has ben properly initialised
            await leaf.loadIfDeferred();

            IDAndEditorObject[leafID] = leaf;
            progressOverlays[leafID] = new LoadingOverlay(
              leaf,
              flowName,
              this.app,
              this.plugin,
              this.plugin.t
            );
          }
        }
      );
    }

    // the part that persists flow frontmatter
    // fetch frontmatter if there is any
    let flowFilePath = this.plugin.settings.flows[flowName].flowFilePath;
    // get the file to extract its frontmatter
    const flowFile = this.app.vault.getAbstractFileByPath(flowFilePath);
    if (flowFile instanceof TFile) {
      const cache = this.app.metadataCache.getFileCache(flowFile);
      const frontmatterPosition = cache?.frontmatterPosition;
      if (frontmatterPosition) {
        const fileContent = await this.app.vault.read(flowFile);
        const frontmatter = fileContent.slice(
          0,
          frontmatterPosition.end.offset + 1
        );
        // put it in the basket
        mapValueBasket.concatenatedFileContents = frontmatter + "\n";
      }
    }

    // Info exange with the progress bar
    let counter = 0;
    const total = recipeArray.length;
    for (let ingredient of recipeArray) {
      // create update the progress bar
      counter++;
      if (caller === "settingsTab") {
        if (progressToast) {
          const symbolFilled = this.plugin.settings.explorerDecoStyle[1];
          progressToast.updateProgress(
            counter,
            total,
            symbolFilled,
            this.plugin.t
          );
        }
      } else {
        const symbolEmpty = this.explorerDecoArray[0][0];
        const symbolFilled = this.plugin.settings.explorerDecoStyle[1];
        Object.keys(progressOverlays).forEach((leafID) => {
          progressOverlays[leafID].updateProgress(
            counter,
            total,
            symbolEmpty,
            symbolFilled
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
      // If the ingredient (array entry) is a title
      if (ingredient.startsWith("#")) {
        mapValueBasket.flowOrder++;
        this.createInvisibleUID(mapValueBasket);
        // make the proper divider
        const divider = `\r${mapValueBasket.invisibleUUID}<hr>\r\r`;

        // unencoded divider for debugging purposes (there's also debugUID())
        // const divider = `\r${mapValueBasket.identifier}<hr>\r\r`;
        mapValueBasket.idDivider = divider.replace(/\\r/g, "\r");

        // stripping # so Outline will look as expected
        const ingredientName = ingredient.replace("#", "# ");

        // The object that holds the info about the folder/group
        flow.flowMap[ingredient] = {
          type: "folder",
          path: ingredient,
          basicUUID: mapValueBasket.basicUUID,
          invisibleUUID: mapValueBasket.invisibleUUID,
          flowOrder: mapValueBasket.flowOrder,
        } as Types.SourceFileObject;
        mapValueBasket.initialIteration = false;

        // Add content with marker before divider
        mapValueBasket.concatenatedFileContents += `${ingredientName}${mapValueBasket.idDivider}`;
      }
      // if the ingredient is a path
      else {
        mapValueBasket.flowOrder++;
        this.createInvisibleUID(mapValueBasket);

        // unencoded divider for debugging purposes (there's also debugUID())
        // const divider = `\r${mapValueBasket.identifier}<hr>\r\r`;
        const divider = `\r${mapValueBasket.invisibleUUID}<hr>\r\r`;
        mapValueBasket.idDivider = divider.replace(/\\r/g, "\r");

        // get the note
        const note = this.app.vault.getAbstractFileByPath(ingredient);
        if (!note) {
          new Notice(
            this.plugin.t("flowBuilder.notice ingredient not found", {
              ingredient: ingredient,
            })
          );
          return;
        }

        // type check
        if (note instanceof TFile) {
          let fileContent: string = await this.app.vault.read(note);

          // make a hash if we don't have one yet
          if (
            this.plugin.settings.checkExternalEdits === "mtime+hash" ||
            this.plugin.settings.checkExternalEdits === "always hash"
          ) {
            if (!this.plugin.settings.hashes[ingredient]) {
              const hash = this.plugin.makeHash(fileContent);
              this.plugin.settings.hashes[ingredient] = hash;
            }
          }

          // check if there are UUIDs in there due to a sync fuckup
          let match;
          const regex =
            /[\u200B\u200C\u200D\u2060\u2061\u2062\u2063\u2064\uFEFF\u00A0]{46}/;

          if ((match = regex.exec(fileContent) !== null)) {
            new Notice(
              this.plugin.t("flowBUilder.notice UUID found in source note", {
                ingredient: ingredient,
                flowName: flowName,
              }),
              0
            );

            // remove the progress stuff
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
            return;
          }

          // remove frontmatter
          mapValueBasket.singleFileContent = fileContent
            .replace(/^---\n[\s\S]*?\n---\n*/, "")
            .trim();

          // get mtime regardless of user settings
          const mtime = note.stat.mtime;

          // put all info in the note object
          flow.flowMap[ingredient] = {
            type: "file",
            mtime: mtime,
            path: ingredient,
            basicUUID: mapValueBasket.basicUUID,
            invisibleUUID: mapValueBasket.invisibleUUID,
            flowOrder: mapValueBasket.flowOrder,
            startEndInFlow: {
              start: mapValueBasket.initialIteration
                ? 0
                : mapValueBasket.concatenatedFileContents.length,
              end:
                mapValueBasket.concatenatedFileContents.length +
                fileContent.length +
                mapValueBasket.idDivider.length,
            },
          } as Types.SourceFileObject;

          mapValueBasket.initialIteration = false;

          // Add content with marker before divider
          mapValueBasket.concatenatedFileContents += `${mapValueBasket.singleFileContent}${mapValueBasket.idDivider}`;
        } else {
          console.error("Invalid file.");
        }
      }
    }
    if (systemFolder && systemFolder instanceof TFolder) {
      const flowFilePath = normalizePath(
        `${this.plugin.settings.systemFolderPath}/${flowName}.md`
      );

      // this also takes care of flags for write protection and listeners
      await this.plugin.flowService.safeCreateOrModifyFile(
        flowFilePath,
        mapValueBasket.concatenatedFileContents
      );

      // remove the progress toast if it exists
      if (progressToast) {
        progressToast.close();
      }
      // and finally, scroll and remove progress overlay
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
                const leaf = IDAndEditorObject[leafID];
                if (!leaf || !(leaf.view instanceof MarkdownView)) {
                  progressOverlays[leafID].remove();
                  return;
                }
                const view = leaf.view;
                if (view instanceof MarkdownView) {
                  this.restoreCursorPos(flowName, view, leafID);
                }
                progressOverlays[leafID].remove();
              }
            }
          }
        });
      });

      await this.plugin.saveSettings();
    }
  };

  // ---- Like it says....
  createInvisibleUID = (mapValueBasket: Types.mapValueBasket) => {
    const invisibleChars = [
      "\u200B", // Zero-width space 0
      "\u200C", // Zero-width non-joiner 1
      "\u200D", // Zero-width joiner 2
      "\u2060", // Word joiner 3
      "\u2061", // Function application 4
      "\u2062", // Invisible times 5
      "\u2063", // Invisible separator 6
      "\u2064", // Invisible plus 7
      "\uFEFF", // Zero-width no-break space 8
      "\u00A0", // No-Break Space 9
    ];

    // get the initial UUID
    let UUID = crypto.randomUUID();

    // turn it into base9 piecemeal (to avoid bigint), then join and pad
    const base9Transform = (identifier: string) => {
      const initialIdentifierArray = identifier.split("-");
      const base9IdentifierArray: string[] = [];

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
        invisibleChars[0]
      );

      return paddedTransformedIdentifier;
    };

    // call the function
    const paddedBase9Identifier = base9Transform(UUID);

    // put both versions in the basket
    mapValueBasket.basicUUID = UUID;
    mapValueBasket.invisibleUUID = paddedBase9Identifier;
  };

  // for debugging
  debugUID = (uid: string) => {
    console.log({
      originalNumber: uid.match(/【(\d+)】/)?.[1],
      invisiblePart: uid.match(/⟦([\u200B\u200C\u200D]+)⟧/)?.[1],
      invisiblePartLength: uid.match(/⟦([\u200B\u200C\u200D]+)⟧/)?.[1]?.length,
      chars: Array.from(uid.match(/⟦([\u200B\u200C\u200D]+)⟧/)?.[1] || "").map(
        (char) => ({
          char,
          code: char.charCodeAt(0).toString(10),
          type:
            char === "\u00A0"
              ? "NBSP"
              : char === "\u200B"
              ? "ZWSP"
              : char === "\u200C"
              ? "ZWNJ"
              : char === "\u200D"
              ? "ZWJ"
              : char === "\u2060"
              ? "WJ"
              : char === "\u2061"
              ? "FA"
              : char === "\u2062"
              ? "*"
              : char === "\u2063"
              ? "IS"
              : char === "\u2064"
              ? "+"
              : char === "\uFEFF"
              ? "NBZWS"
              : "unknown",
        })
      ),
    });
  };

  // -------- Restore cursorPos for known and unknown leafIDs
  restoreCursorPos = (flowName: string, view: MarkdownView, leafID: string) => {
    if (
      this.plugin.settings.flows[flowName].persistentCursors &&
      this.plugin.settings.flows[flowName].persistentCursors[leafID]
    ) {
      const editor = view.editor as ObsidianEditor;
      const cmEditor = editor.cm;
      if (cmEditor) {
        const cursorPos =
          this.plugin.settings.flows[flowName].persistentCursors[leafID]
            .cursors[0][1];

        if (cursorPos !== undefined && cursorPos >= 0) {
          this.scrollToPos(editor, cursorPos);
        }
      }
    } else {
      // get the most recent time stamp for the active flow
      const timestampArray: number[] = [];
      if (
        Object.keys(this.plugin.settings.flows[flowName].persistentCursors)
          .length > 0
      ) {
        Object.keys(
          this.plugin.settings.flows[flowName].persistentCursors
        ).forEach((leafID) => {
          timestampArray.push(
            this.plugin.settings.flows[flowName].persistentCursors[leafID]
              .update
          );
        });

        // sort the timestamps in reverse order so newest timestamp comes first
        timestampArray.sort((a, b) => b - a);

        const mostRecentTimestamp: number = timestampArray[0];
        let mostRecentCursor: number = 0;
        if (this.plugin.settings.flows[flowName].persistentCursors) {
          Object.keys(
            this.plugin.settings.flows[flowName].persistentCursors
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

        const editor = view.editor as ObsidianEditor;
        mostRecentCursor ? this.scrollToPos(editor, mostRecentCursor) : "";
      }
    }
  };

  // this function was written by Claude 3.5 Sonnet
  scrollToPos = (
    editor: Types.ObsidianEditor,
    cursorPos: number,
    dontFocus?: boolean
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

  safeCreateOrModifyFile = async (path: string, newContent: string) => {
    try {
      // this.callStack("safeCreateFile");
      const existingFile = this.app.vault.getAbstractFileByPath(path);
      this.plugin.textFlowOperation = true;

      if (existingFile instanceof TFile) {
        // check if the file is open
        const leaves = this.app.workspace.getLeavesOfType("markdown");
        for (const leaf of leaves) {
          await leaf.loadIfDeferred();
          if (
            leaf.view instanceof MarkdownView &&
            leaf.view.file?.path === path
          ) {
            const editor = leaf.view.editor as ObsidianEditor;
            editor.setValue(newContent);
            return;
          }
        }
        // if the file exists but is not open, we get to here
        await this.app.vault.process(existingFile, (content) => {
          return newContent;
        });
      } else {
        this.plugin.textFlowOperation = true;
        await this.app.vault.create(path, newContent);
        this.plugin.textFlowOperation = false;
      }
    } catch (error) {
      console.error(`Failed to create/modify file at ${path}:`, error);
      throw error;
    }
  };

  backupFlowDefs = async () => {
    let datedFlows: { [key: string]: Types.FlowDef } = {};

    for (let flowName of Object.keys(this.plugin.settings.flows)) {
      const currentDate = this.getTimestamp();
      const backupName = `${flowName}*${currentDate}`;
      datedFlows[backupName] = structuredClone(
        this.plugin.settings.flows[flowName]
      );
      datedFlows[backupName].flowBuilt = false;
      datedFlows[backupName].flaggedForRebuild = true;
      datedFlows[backupName].conflictObject = {};
      datedFlows[backupName].lastActiveLeaves = [];
      datedFlows[backupName].persistentCursors = {};
      datedFlows[backupName].unsyncedRegionsArray = [];
      datedFlows[backupName].flowMap = {};
    }

    const output = JSON.stringify(datedFlows, null, 2);

    // Make the path
    let backupPath = "";
    if (this.plugin.settings.systemFolderPath) {
      backupPath = path.join(
        this.plugin.settings.systemFolderPath,
        "textFlowDefBackup.json"
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
      JSON.stringify(datedFlows, null, 2)
    );
  };

  // export active flow

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
        `${flowName}_export_${this.plugin.flowService.getTimestamp()}.md`
      );
      await this.plugin.flowService.safeCreateOrModifyFile(
        exportedFlowPath,
        contentWithYaml
      );
      new Notice(
        this.plugin.t("menubar.selectButton.notice successful export", {
          exportedFlowPath: exportedFlowPath,
        })
      );
    }
  };

  selectActiveRegion = (
    flowName: string,
    path: string,
    text: string,
    viewDotEditor: Editor
  ) => {
    // notify of failure du to tracking error
    if (this.plugin.flowOutOfSync.includes(flowName)) {
      new Notice(
        this.plugin.t("menuBar.selectActiveRegion tracking error", {
          flowName: flowName,
        })
      );
      return;
    }
    const map = this.plugin.settings.flows[flowName].flowMap;

    const startPos = this.plugin.findStartOfRegion(
      this.plugin.settings.flows[flowName],
      this.plugin.settings.flows[flowName].flowMap[path].flowOrder,
      text
    );
    const endPos = text.indexOf(map[path].invisibleUUID) - 1; // subtract 1 for the \r before the UID

    if (startPos && endPos) {
      const cmView = this.getEditorView(viewDotEditor);
      if (cmView) {
        // Type guard for ObsidianEditor
        try {
          cmView.dispatch({
            selection: { anchor: startPos + 1, head: endPos },
            scrollIntoView: true, // Optional: scroll the selection into view
          });
          cmView.focus(); // Optional: focus the editor
        } catch (error) {
          console.error("Failed to set selection:", error);
        }
      }
    }
  };

  //---------------------
  // robot told me these would help to keep the scope clean with regards to type
  getLeafId = (leaf: WorkspaceLeaf): Types.LeafId => {
    return (leaf as any).id as Types.LeafId;
  };

  getEditorView = (editor: Editor): EditorView | null => {
    const cm = (editor as Types.EditorWithCM).cm;
    return cm instanceof EditorView ? cm : null;
  };

  callStack = (recipient: string) => {
    const stack = new Error().stack;
    if (!stack) return;
    console.log(recipient, stack, Date.now());
  };

  //-----------
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

  // The arrays with the deco stuff, which I made, by hand. I like pain sometimes.
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
