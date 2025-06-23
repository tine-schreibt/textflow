import { getAPI } from "obsidian-dataview";
import * as Modals from "./modals";
import {
  App,
  ButtonComponent,
  setIcon,
  MarkdownView,
  normalizePath,
  Notice,
  PluginSettingTab,
  Setting,
  TFolder,
  TFile,
  TAbstractFile,
  TextComponent,
} from "obsidian";
import TextFlow from "../main";
import * as Types from "./types";
import Pickr from "@simonwep/pickr";

// --- A class for the flowBuilder progress bar
class ProgressNotice {
  private notice: Notice;
  private progress: number = 0;
  private flowName: string;

  constructor(flowName: string) {
    this.flowName = flowName;
    this.notice = new Notice(
      `Building ${this.flowName}: [▱▱▱▱▱▱▱▱▱▱] 0% \nFirst build might take longer.`,
      0
    ); // 0 duration makes it persistent
  }
  updateProgress(current: number, total: number) {
    const percent = Math.floor((current / total) * 100);
    const filled = Math.floor(percent / 10);
    const bar = "[" + "▰".repeat(filled) + "-".repeat(10 - filled) + "]";
    this.notice.setMessage(
      `Building ${this.flowName}: ${bar} ${percent}% \nFirst build might take longer.`
    );
  }

  close() {
    this.notice.hide();
  }
}

export class FlowService {
  constructor(private plugin: TextFlow, private app: App) {}
  //#######################################################################
  //###########################    Functions   ############################
  //#######################################################################

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

  // ------ function that checks if flows overlap
  conflictCollector = (flowBuildBasket: Types.flowBuildBasket) => {
    const conflicts: string[] = [];
    const key1 = Object.keys(flowBuildBasket.finalReceipe)[0];
    if (Object.keys(this.plugin.settings.flows).length >= 1) {
      flowLoop: for (let flowName in this.plugin.settings.flows) {
        if (flowName != flowBuildBasket.createOrEditFlowName) {
          const key2 = Object.keys(
            this.plugin.settings.flows[flowName].flowReceipe
          )[0];
          for (let path of flowBuildBasket.finalReceipe[key1]) {
            if (
              !path.startsWith("#") &&
              this.plugin.settings.flows[flowName].flowReceipe[key2].includes(
                path
              )
            ) {
              conflicts.push(flowName);
              continue flowLoop;
            }
          }
        }
      }
    }
    return conflicts;
  };

  // ----------------- sync conflicts

  syncConflicts = (referenceFlow: Types.flowBuildBasket) => {
    const refFlowName = referenceFlow.createOrEditFlowName;

    Object.keys(this.plugin.settings.flows).forEach((syncFlowName) => {
      // Case 1: Flow is in reference conflicts but not in sync flow's conflicts
      if (
        referenceFlow.conflicts.includes(syncFlowName) &&
        !this.plugin.settings.flows[syncFlowName].conflictArray.includes(
          refFlowName
        )
      ) {
        this.plugin.settings.flows[syncFlowName].conflictArray.push(
          refFlowName
        );
      }
      // Case 2: Flow is not in reference conflicts but is in sync flow's conflicts
      if (
        !referenceFlow.conflicts.includes(syncFlowName) &&
        this.plugin.settings.flows[syncFlowName].conflictArray.includes(
          refFlowName
        )
      ) {
        this.plugin.settings.flows[syncFlowName].conflictArray =
          this.plugin.settings.flows[syncFlowName].conflictArray.filter(
            (name) => name !== refFlowName
          );
      }
    });
  };

  createSystemFolder = async (newSystemFolderPath: string) => {
    try {
      // Ensure the folder exists, create it if necessary
      let newSystemFolder =
        this.app.vault.getAbstractFileByPath(newSystemFolderPath);
      if (!newSystemFolder) {
        await this.app.vault.createFolder(newSystemFolderPath);
        new Notice(`TextFlow_SystemFolder created at ${newSystemFolderPath}`);
      } else if (!(newSystemFolder instanceof TFolder)) {
        throw new Error(`"${newSystemFolderPath}" exists but is not a folder.`);
      }
    } catch (e) {
      console.log(
        `Something went wrong when trying to create ${newSystemFolderPath}: ${e}`
      );
    }
  };

  // ---------------- see if system folder already exists -------
  checkSystemFolder = () => {
    const systemFolder = this.app.vault
      .getAllLoadedFiles()
      .find(
        (file) =>
          file instanceof TFolder && file.name === "TextFlow_SystemFolder"
      );
    return systemFolder instanceof TFolder ? systemFolder : null;
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

  createFlowDefinition = async (
    flowBuildBasket: Types.flowBuildBasket
  ): Promise<void> => {
    // Pre-flight check 01 - flowName set / uniqueness when creating
    if (flowBuildBasket.createOrEditFlowName === "") {
      new Notice("Flow name can not be empty.");
      flowBuildBasket.success = false;
      return Promise.reject(Error);
    }
    if (
      flowBuildBasket.createOrEdit === "create" &&
      this.plugin.settings.flows[flowBuildBasket.createOrEditFlowName]
    ) {
      new Notice(
        `A flow with the name ${flowBuildBasket.createOrEditFlowName} already exist. Please choose a different name or edit the existing flow.`
      );
      flowBuildBasket.success = false;
      return Promise.reject(Error);
    }

    // -------- Putting the finalReceipe together by fetching/filtering all paths
    try {
      // ----------- FINAL RECEIPE FOR BOOKMARKS ---------------------
      if (flowBuildBasket.definitionMode === "bookmarks") {
        if (
          flowBuildBasket.flowCookbook.bookmarks === undefined ||
          flowBuildBasket.flowCookbook.bookmarks === ""
        ) {
          new Notice("Please enter at least one bookmark group.");
          flowBuildBasket.success = false;
          return Promise.reject(Error);
        } else {
          const bookmarkPathArray = await this.getBookmarkPathsByGroupName(
            flowBuildBasket
          );
          flowBuildBasket.finalReceipe = { bookmarks: bookmarkPathArray };
          flowBuildBasket.conflicts = this.conflictCollector(flowBuildBasket);
        }

        // ------ FINAL RECEIPE FOR PATH TAG PROPERTY -----------------------
      } else {
        const ensureNoUndefined = this.ensureNoUndefined(flowBuildBasket);
        const foldersTagsPropsPathArray = await this.getPathsByFoldersTagsProps(
          flowBuildBasket
        );
        flowBuildBasket.finalReceipe = {
          foldersTagsProps: foldersTagsPropsPathArray,
        };
        flowBuildBasket.conflicts = this.conflictCollector(flowBuildBasket);
      }
      // ---- Pre-flight check 02 - finalReceipe array
      if (
        (flowBuildBasket.finalReceipe.bookmarks &&
          flowBuildBasket.finalReceipe.bookmarks.length <= 1) ||
        (flowBuildBasket.finalReceipe.folderTagsProperties &&
          flowBuildBasket.finalReceipe.folderTagsProperties.length <= 1)
      ) {
        new Notice(
          "Your flow definition leads to an empty flow. Please edit it to be less restrictive"
        );
        flowBuildBasket.success = false;
        return Promise.reject(Error);
      }

      flowBuildBasket.success = true;
      return Promise.resolve();
    } catch (error) {
      new Notice(
        "An error occurred while creating the finalReceipe for your flow. Check the console for details."
      );
      flowBuildBasket.success = false;
      return Promise.reject(error);
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

  writeFlowDef = async (
    settings: Types.TextFlowSettings,
    flowBuildBasket: Types.flowBuildBasket
  ) => {
    const conflicts = this.conflictCollector(flowBuildBasket);
    let activeRegionHandlerVariable = {};
    if (
      settings.flows[flowBuildBasket.createOrEditFlowName]?.activeRegions &&
      Object.keys(
        settings.flows[flowBuildBasket.createOrEditFlowName].activeRegions
      ).length > 0
    ) {
      // Deep copy the active regions
      activeRegionHandlerVariable = JSON.parse(
        JSON.stringify(
          settings.flows[flowBuildBasket.createOrEditFlowName].activeRegions
        )
      );
    }
    // -------- CREATE THE FLOW OBJECT -------------------------------
    settings.flows[flowBuildBasket.createOrEditFlowName] = {
      timestamp: this.getTimestamp(),
      flowName: flowBuildBasket.createOrEditFlowName,
      flowFilePath: `${this.plugin.settings.systemFolderPlace}TextFlow_SystemFolder/${flowBuildBasket.createOrEditFlowName}.md`,
      flowCookbook: flowBuildBasket.cleanCookbook, // cleaned up user input
      flowReceipe: flowBuildBasket.finalReceipe, // { defMode: pathArray }
      depthFirst: flowBuildBasket.depthFirst,
      folderTitles: flowBuildBasket.folderTitles,
      isFreshBuild: true,
      flowBuilt: false,
      flaggedForRebuild: false,
      conflictArray: conflicts,
      activeRegions: activeRegionHandlerVariable,
      persistentCursors: {},
      unsavedRegionsArray: [],
      flowMap: {},
    };
    await this.plugin.saveSettings();
  };

  // --- Reset flowBuildBasket
  resetFlowBuildBasket = (flowBuildBasket: Types.flowBuildBasket) => {
    flowBuildBasket.createOrEditFlowName = "";
    flowBuildBasket.oldFlowName = "";
    flowBuildBasket.createOrEdit = "";
    flowBuildBasket.definitionMode = "";
    flowBuildBasket.depthFirst = true;
    flowBuildBasket.flowCookbook = {};
    flowBuildBasket.cleanCookbook = {};
    flowBuildBasket.finalReceipe = {};
    flowBuildBasket.conflicts = [];
    flowBuildBasket.dataviewSearchPath = "";
    flowBuildBasket.success = false;
    flowBuildBasket.fresh = true;
  };
  // --- HELPER FUNCTIONS FOR FETCHING PATHS (AND CLEANING UP STUFF)
  // Also we're using the opportunity to get a clean cookbook (user input) for storage

  // ---- GET PATHS IN BOOKMARK GROUP ----------------
  getBookmarkPathsByGroupName = async (
    flowBuildBasket: Types.flowBuildBasket
  ) => {
    let groupName = flowBuildBasket.flowCookbook.bookmarks;
    // prepare path for further processing:
    const cleanPath = groupName.replace(/\/+/g, "/");
    flowBuildBasket.cleanCookbook.bookmarks = cleanPath;
    const groupPathArray = cleanPath.split("/");
    let includeSubgroups: boolean = true;
    if (groupPathArray[groupPathArray.length - 1] === "") {
      includeSubgroups = false;
      groupPathArray.splice(groupPathArray.length - 1, 1);
    }

    // get the bookmarks via the API and prepare helper variables
    const bookmarks = (this.app as any).internalPlugins.plugins.bookmarks
      .instance;
    const bookmarkItems = bookmarks.items;
    const bookmarkedNotePathsArray: string[] = [];

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

    // Function call
    const finalGroup = navigateToGroup(bookmarkItems, groupPathArray);

    //-- Function to recursively collect the file paths and group names
    const collectPaths = (
      items: Types.BookmarkItem[],
      flowBuildBasket: Types.flowBuildBasket
    ): string[] => {
      for (const item of items) {
        if (item.type === "file" && item.path) {
          bookmarkedNotePathsArray.push(item.path);
        } else if (includeSubgroups && item.type === "group" && item.items) {
          // Recurse into nested groups
          if (flowBuildBasket.folderTitles) {
            bookmarkedNotePathsArray.push(`#${item.title ?? "Unnamed Group"}`);
          }
          collectPaths(item.items, flowBuildBasket);
        }
      }
      return bookmarkedNotePathsArray;
    };

    // Function call
    if (finalGroup?.items) {
      bookmarkedNotePathsArray.push(`#${finalGroup.title ?? "Unnamed Group"}`); // push name of main group
      collectPaths(finalGroup.items, flowBuildBasket);
    } else {
      new Notice("Please check the name of the bookmark group you submitted");
    }
    return Promise.resolve(bookmarkedNotePathsArray);
  };

  // --- GET ALL PATHS FROM FOLDER TAG PROPERTY -------------------
  // In case input hasn't been touched; also makes ! safe to use
  ensureNoUndefined = (flowBuildBasket: Types.flowBuildBasket) => {
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
    return Promise.resolve();
  };

  // --- Function to get the paths
  getPathsByFoldersTagsProps = async (
    flowBuildBasket: Types.flowBuildBasket
  ) => {
    const dv = getAPI();
    if (!dv) {
      new Notice("Dataview API not available!");
      return Promise.reject(Error);
    }
    // unpack into shorthand for easier reading
    const shCookbook = flowBuildBasket.flowCookbook;
    // ---- Pre-flight checks and cleanup --------------

    //--- INCLUDED FOLDER - only one path; notify if multiple
    let cleanInclusionPath: string = "";
    const folderInclusionArray = shCookbook.folderIncluded.split(",");
    if (folderInclusionArray.length > 1) {
      new Notice("Folder inclusion can only contain a single folder.");
    } else {
      // Clean up the whole "" and \ stuff we have to add for Dataview so rebuilds don't accumulate it
      cleanInclusionPath = shCookbook.folderIncluded
        .replace(/["\\\s]/g, "")
        .replace(/\/+/g, "/") // Replace multiple forward slashes with single ones
        .trim();
      // check for trailing slash, because normalizePath will eat it
      let hasSlash = cleanInclusionPath.endsWith("/");
      // Normalize
      cleanInclusionPath = normalizePath(cleanInclusionPath);
      // save path with trailing slash
      if (hasSlash) {
        flowBuildBasket.cleanCookbook.folderIncluded = `${cleanInclusionPath}/`;
      } else {
        flowBuildBasket.cleanCookbook.folderIncluded = `${cleanInclusionPath}`;
      }

      // dataview likes paths only with extra garnish
      flowBuildBasket.dataviewSearchPath =
        cleanInclusionPath === "" || cleanInclusionPath === "/"
          ? "" // Empty string in Dataview queries means "search everywhere"
          : `\"${cleanInclusionPath}\"`; // For specific paths, we need to wrap in quotes
    }

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
      flowBuildBasket.cleanCookbook.folderExcluded =
        cleanFolderExclusionArray.join(", ");
    } else {
      cleanFolderExclusionArray.push("");
      flowBuildBasket.cleanCookbook.folderExcluded = "";
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

    // use cleanup on tags
    const cleanTagInclusionArray = tagCleanup(shCookbook.tagsIncluded);
    flowBuildBasket.cleanCookbook.tagsIncluded =
      cleanTagInclusionArray.join(", ");
    const cleanTagExclusionArray = tagCleanup(shCookbook.tagsExcluded);
    flowBuildBasket.cleanCookbook.tagsExcluded =
      cleanTagExclusionArray.join(", ");

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
    flowBuildBasket.cleanCookbook.propsIncluded =
      cleanPropertiesInclusionArray.join(", ");

    let cleanPropertiesExclusionArray = propertyCleanup(
      shCookbook.propsExcluded
    );
    flowBuildBasket.cleanCookbook.propsExcluded =
      cleanPropertiesExclusionArray.join(", ");

    // -------- cleanup done ----------------

    // --- FETCH FILE TREE FOR SORTING PURPOSES
    // some globals for the whole path stuff
    const fileTreeArray: string[] = [];
    const vault = this.app.vault;

    // Build tree in the same order as seen in fileExplorer
    const buildDepthFirstFileTree = (folder: TFolder) => {
      // Split and sort folders and files separately
      const folders = folder.children
        .filter((child): child is TFolder => child instanceof TFolder)
        .sort((a, b) => a.name.localeCompare(b.name));

      const files = folder.children
        .filter((child): child is TFile => child instanceof TFile)
        .sort((a, b) => a.name.localeCompare(b.name));

      // Process all folders first (depth-first)
      for (const subfolder of folders) {
        buildDepthFirstFileTree(subfolder);
      }

      // Then process all files in current folder
      for (const file of files) {
        fileTreeArray.push(file.path);
      }
    };

    // Recursive function to build file tree files first (changes order)
    const buildFilesFirstFileTree = (folder: TFolder) => {
      const children = folder.children.sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      // Get files first
      for (const child of children) {
        if (child instanceof TFile) {
          fileTreeArray.push(child.path);
        }
      }
      // then recurse into subfolders
      for (const child of children) {
        if (child instanceof TFolder) {
          buildFilesFirstFileTree(child);
        }
      }
    };

    // Build the complete file tree (which puts results in fileTreeArray)
    flowBuildBasket.depthFirst
      ? buildDepthFirstFileTree(vault.getRoot())
      : buildFilesFirstFileTree(vault.getRoot());

    // ---- CALL DATAVIEW API to fetch all included, then filter
    let allNotes = dv.pages(flowBuildBasket.dataviewSearchPath);

    // Function to exclude subfolders
    const isDirectChild = (filePath: string, basePath: string): boolean => {
      // Remove the base path from the start
      const relativePath = filePath.replace(basePath, "").replace(/^\//, "");
      // Count remaining forward slashes
      return relativePath.split("/").length <= 1;
    };
    // If inclusion path ends with slash, do the thing
    if (
      flowBuildBasket.cleanCookbook.folderIncluded != "/" &&
      flowBuildBasket.cleanCookbook.folderIncluded.endsWith("/")
    ) {
      allNotes = allNotes.filter((page: Types.DVNote) =>
        isDirectChild(
          page.file.path,
          flowBuildBasket.cleanCookbook.folderIncluded.slice(0, -1)
        )
      );
    }

    const filteredNotes = allNotes.where((note: Types.DVNote) => {
      // First ensure that TextFlow_SystemFolder is always excluded; don't want to create an ourobouros
      if (
        this.plugin.settings.systemFolderPath &&
        !cleanFolderExclusionArray.includes(
          this.plugin.settings.systemFolderPath
        )
      ) {
        cleanFolderExclusionArray.push(this.plugin.settings.systemFolderPath);
      }
      return (
        // exlude folders
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
          new Notice("Please check you included properties for typos.");
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
          new Notice("Please check you excluded properties for typos.");
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
    let finalPathArray: string[] = [];
    for (let path of fileTreeArray) {
      if (filteredPathObject[path]) {
        finalPathArray.push(path);
      }
    }

    // Helper functions for including folder titles

    // Depth first approach
    const findFolderTitlesDepthFirst = (
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

    let pathArrayWithFolderTitles = findFolderTitlesDepthFirst(
      finalPathArray,
      flowBuildBasket
    );

    // pack the cookbook back into the basket
    flowBuildBasket.flowCookbook = shCookbook;

    // presto
    return Promise.resolve(pathArrayWithFolderTitles);
  };

  // ------ The flowBuilder --------------------------
  flowBuilder = async (
    receipeArray: string[],
    flow: Types.FlowDef,
    flowName: string,
    mapValueBasket: Types.mapValueBasket
  ): Promise<void> => {
    // pre-flight check for SystemFolder
    let systemFolder = this.checkSystemFolder();
    if (!systemFolder) {
      new Notice("TextFlow_SystemFolder not found.");
      return;
    }

    const progressBar = new ProgressNotice(flowName);
    let counter = 0;

    const total = receipeArray.length;

    for (let ingredient of receipeArray) {
      counter++;
      progressBar.updateProgress(counter, total);

      if (ingredient.startsWith("#")) {
        // if it's a folder name
        mapValueBasket.flowOrder++;
        await this.createInvisibleUID(mapValueBasket);
        // make the proper divider
        const divider = `\r${mapValueBasket.UID}<hr>\r\r`;
        // make unencoded divider for debugging
        // const divider = `\r${mapValueBasket.identifier}<hr>\r\r`;
        mapValueBasket.idDivider = divider.replace(/\\r/g, "\r");

        const ingredientName = ingredient.replace("#", "");

        flow.flowMap[ingredient] = {
          type: "folder",
          path: ingredient,
          itemName: ingredientName,
          UID: mapValueBasket.UID,
          identifier: mapValueBasket.identifier,
          flowOrder: mapValueBasket.flowOrder,
          minLength: ingredientName.length,
          lengthPlusDividers:
            ingredientName.length + mapValueBasket.idDivider.length,
        } as Types.SourceFileObject;
        mapValueBasket.initialIteration = false;

        // Add content with marker before divider
        mapValueBasket.concatenatedFileContents += `<center><b>${ingredientName}</b></center>${mapValueBasket.idDivider}`;
      }
      // it ingredient is a path
      else {
        mapValueBasket.flowOrder++;
        const note = this.app.vault.getAbstractFileByPath(ingredient);
        if (!note) {
          new Notice(`The note at ${ingredient} couldn't be found.`);
        }
        if (note instanceof TFile) {
          const modificationTimestamp = Date.now();
          let fileContent: string = await this.app.vault.read(note);

          // Extract, fix or create YAML and separate it from other content
          // this also calls UID creation
          await this.manageYaml(note, mapValueBasket);
          // make the proper divider
          //const divider = `\r${mapValueBasket.UID}<hr>\r\r`;

          const divider = `\r${mapValueBasket.UID}<hr>\r\r`;
          mapValueBasket.idDivider = divider.replace(/\\r/g, "\r");

          fileContent = mapValueBasket.singleFileContent;

          // find and remove the title line; normalize
          const titleLine = `${note.name.replace(/\.md$/, "")}`;
          const normalize = (fileContent: string) =>
            fileContent.replace(/\uFEFF|\s+$/g, "").trim();
          const normalizedTitleLine = normalize(titleLine);
          const normalizedFileContent = normalize(fileContent);

          flow.flowMap[ingredient] = {
            type: "file",
            path: ingredient,
            itemName: note.name,
            UID: mapValueBasket.UID,
            identifier: mapValueBasket.identifier,
            flowOrder: mapValueBasket.flowOrder,
            minLength: fileContent.length,
            lengthPlusDividers:
              fileContent.length + mapValueBasket.idDivider.length,
            startEndInFlow: {
              start: mapValueBasket.initialIteration
                ? 0
                : mapValueBasket.concatenatedFileContents.length,
              end:
                mapValueBasket.concatenatedFileContents.length +
                fileContent.length +
                mapValueBasket.idDivider.length,
            },
            yamlMini: mapValueBasket.yamlMini,
          } as Types.SourceFileObject;

          mapValueBasket.initialIteration = false;

          // Add content with marker before divider
          mapValueBasket.concatenatedFileContents += `${fileContent}${mapValueBasket.idDivider}`;
        } else {
          console.error("Invalid file.");
        }
      }
    }
    if (systemFolder && systemFolder instanceof TFolder) {
      const flowFilePath = `${this.plugin.settings.systemFolderPlace}TextFlow_SystemFolder/${flow.flowName}.md`;
      this.app.vault.adapter.write(
        flowFilePath,
        mapValueBasket.concatenatedFileContents
      );
      flow.isFreshBuild = false;
      this.plugin.settings.usedUIDs = Array.from(mapValueBasket.usedUIDs);
      this.plugin.saveSettings();
    }
    if (counter === total) {
      progressBar.close();
    }
  };

  // -------------- manage YAML ------------------

  // ---------------- the actual handling of YAML -------
  manageYaml = async (file: TFile, mapValueBasket: Types.mapValueBasket) => {
    try {
      // Create a variable to store the modified frontmatter
      let modifiedFrontmatter: any = {};

      await this.app.fileManager.processFrontMatter(
        file,
        async (frontmatter) => {
          // Store the entire frontmatter object so we don't lose other properties
          modifiedFrontmatter = { ...frontmatter };

          if (frontmatter?.TextFlowUID) {
            //this.debugUID(frontmatter.TextFlowUID);
            const identifierMatch =
              frontmatter.TextFlowUID.match(/【([a-f0-9-]{36})】/i);

            if (identifierMatch) {
              const [_, identifierString] = identifierMatch;
              const identifierNumber = identifierString;
              mapValueBasket.identifier = identifierNumber;

              const invisibleUidRegex =
                /⟦([\u200B\u200C\u200D\u2060\u2061\u2062\u2063\u2064\uFEFF\u00A0]{41})⟧/;
              const invisibleUidMatchResult =
                frontmatter.TextFlowUID.match(invisibleUidRegex);

              if (invisibleUidMatchResult && invisibleUidMatchResult[1]) {
                // Invisible UID part found and captured
                mapValueBasket.UID = invisibleUidMatchResult[1];
                modifiedFrontmatter.TextFlowUID = `【${identifierNumber}】⟦${mapValueBasket.UID}⟧`;
              } else {
                // Timestamp part was found, but the invisible UID part is missing or malformed.
                // Recreate the invisible UID.
                const newInvisibleUID = this.reCreateInvisibleUID(
                  identifierNumber,
                  mapValueBasket
                );
                mapValueBasket.UID = newInvisibleUID;

                // Update frontmatter to store the newly created/recreated complete UID
                modifiedFrontmatter.TextFlowUID = `【${String(
                  identifierNumber
                ).padStart(13, "0")}】⟦${mapValueBasket.UID}⟧`;
              }
            } else {
              // if (!timestampMatch) - TextFlowUID exists but is incomplete (no timestamp)
              throw new Error(
                `TextFlow: Invalid UID format in properties of ${file.name}.\n` +
                  "This file seems to be part of a flow but its UID is corrupted.\n" +
                  "Please restore from backup or remove TextFlowUID from properties to treat as new file."
              );
            }
          } else {
            // if (!frontmatter?.TextFlowUID) - No TextFlowUID found
            // Create one
            await this.createInvisibleUID(mapValueBasket); // This sets mapValueBasket.UID and .timestamp
            modifiedFrontmatter.TextFlowUID = `【${mapValueBasket.identifier}】⟦${mapValueBasket.UID}⟧`;
          }
        }
      );

      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        Object.assign(frontmatter, modifiedFrontmatter);
      });
    } catch (error) {
      console.error("Error processing frontmatter:", error);
      throw error;
    }

    // Get content without YAML for flow map
    const content = await this.app.vault.read(file);
    mapValueBasket.singleFileContent = content
      .replace(/^---\n[\s\S]*?\n---\n*/, "")
      .trim();

    //this.debugMarker(mapValueBasket.UID);
    return mapValueBasket;
  };

  // ----------- translate timestamp into invisible base2 UID and make YAML entry
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

    const getNewUUID = () => {
      return crypto.randomUUID();
    };

    // turn the UUID into base9 piecemeal, then join and pad
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

    let UUID = getNewUUID();
    const paddedBase9Identifier = base9Transform(UUID);

    mapValueBasket.identifier = UUID;
    //console.log(`base3 timestamp: ${base3Identifier}`);
    // debugMarker(base3Identifier);
    mapValueBasket.UID = paddedBase9Identifier;
    mapValueBasket.yamlMini = `\nTextFlowUID: 【${mapValueBasket.identifier}】⟦${paddedBase9Identifier}⟧`;
  };

  // ----------------- If invisible UID got eaten by external editor -----------
  reCreateInvisibleUID = (
    identifier: string,
    mapValueBasket: Types.mapValueBasket
  ) => {
    // Define our invisible characters
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

    const initialIdentifierArray = identifier.split("-");
    const base10IdentifierArray: string[] = [];

    for (let hexNumber of initialIdentifierArray) {
      const numberIdentifier = parseInt(hexNumber, 16);
      const base10 = numberIdentifier.toString(10);
      const transformedIdentifier = [...base10]
        .map((digit) => invisibleChars[parseInt(digit)])
        .join("");
      base10IdentifierArray.push(transformedIdentifier);
    }
    const finalIdentifier = base10IdentifierArray.join("");
    const paddedTransformedIdentifier = finalIdentifier.padStart(
      41,
      invisibleChars[0]
    );

    return paddedTransformedIdentifier;
  };

  // --------------- debug the UID
  debugMarker = (marker: string) => {
    console.log({
      fullMarker: marker,
      length: marker.length,
      chars: Array.from(marker).map((char) => ({
        char: char,
        code: char.charCodeAt(0).toString(10),
        name:
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
      })),
    });
  };

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

  rebuildFlow = async (flowName: string) => {
    const flowReBuildBasket: Types.flowBuildBasket = {
      createOrEditFlowName: this.plugin.settings.flows[flowName].flowName,
      oldFlowName: this.plugin.settings.flows[flowName].flowName,
      createOrEdit: "",
      depthFirst: this.plugin.settings.flows[flowName].depthFirst,
      folderTitles: this.plugin.settings.flows[flowName].folderTitles,
      definitionMode: Object.keys(
        this.plugin.settings.flows[flowName].flowReceipe
      )[0],
      flowCookbook: this.plugin.settings.flows[flowName].flowCookbook,
      cleanCookbook: {},
      finalReceipe: {},
      conflicts: this.plugin.settings.flows[flowName].conflictArray,
      dataviewSearchPath: "",
      previewUsed: false,
      success: false,
      fresh: false,
    };

    await this.createFlowDefinition(flowReBuildBasket);
    if (!flowReBuildBasket.success) {
      return;
    }
    this.writeFlowDef(this.plugin.settings, flowReBuildBasket);
    // null unsavedRegions
    this.plugin.settings.flows[flowName].unsavedRegionsArray = [];
    this.plugin.settings.flows[flowName].flaggedForRebuild = false;
    this.resetFlowBuildBasket(flowReBuildBasket);
    this.plugin.saveSettings();

    // Get fresh reference to the flow object after createFlowDefinition
    const updatedFlow = this.plugin.settings.flows[flowName];

    // ---------- flow creation ----------------
    // the object that shuttles the values between the functions
    const mapValueBasket: Types.mapValueBasket = {
      concatenatedFileContents: "",
      initialIteration: true,
      identifier: "0",
      flowOrder: 0,
      UID: "",
      yamlMini: "",
      singleFileContent: "",
      currentEnd: 0,
      usedUIDs: new Set(this.plugin.settings.usedUIDs),
      idDivider: "",
    };

    let key = "";
    updatedFlow.flowReceipe.bookmarks // Use updatedFlow instead of shownFlow
      ? (key = "bookmarks")
      : (key = "foldersTagsProps");

    // Calling the build function
    await this.flowBuilder(
      updatedFlow.flowReceipe[key], // Use updatedFlow instead of shownFlow
      updatedFlow, // Use updatedFlow instead of shownFlow
      flowName,
      mapValueBasket
    );
  };
}
