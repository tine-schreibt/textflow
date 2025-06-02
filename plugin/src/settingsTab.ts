import * as jsYaml from "js-yaml";
import { getAPI } from "obsidian-dataview";
import type { DataviewApi } from "obsidian-dataview";
import * as Modals from "./modals";
import {
  App,
  PluginSettingTab,
  Setting,
  TFolder,
  TFile,
  TAbstractFile,
  TextComponent,
  MarkdownView,
  normalizePath,
  Notice,
  ButtonComponent,
} from "obsidian";
import TextFlow from "../main";
import * as Types from "./types";

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

// --- The class that defines the settings tab
export class TextFlowSettingsTab extends PluginSettingTab {
  plugin: TextFlow;

  constructor(app: App, plugin: TextFlow) {
    super(app, plugin);
    this.plugin = plugin;
  }

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

  // ---- Function that bundles saving an reloading
  // Enable modals save and redraw the display
  modalSaveAndReload = async () => {
    await this.plugin.saveSettings();
    this.display(); // Refresh the UI after saving
  };

  // ------ function that checks if flows overlap
  conflictCollector = (flowBuildBasket: Types.flowBuildBasket) => {
    const conflicts: string[] = [];
    const key1 = Object.keys(flowBuildBasket.finalReceipe)[0];
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

  private createSystemFolder = async (newSystemFolderPath: string) => {
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
  private checkSystemFolder = () => {
    const systemFolder = this.app.vault
      .getAllLoadedFiles()
      .find(
        (file) =>
          file instanceof TFolder && file.name === "TextFlow_SystemFolder"
      );
    return systemFolder instanceof TFolder ? systemFolder : null;
  };

  // --- RADIO BUTTON MANAGER -----------------
  private radioButtonManager(
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
          flowBuildBasket.flowCookbook.bookmarkGroup === undefined ||
          flowBuildBasket.flowCookbook.bookmarkGroup === ""
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
        const ensureNoUndefined = await this.ensureNoUndefined(flowBuildBasket);
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

  writeFlowDef = (
    settings: Types.TextFlowSettings,
    flowBuildBasket: Types.flowBuildBasket
  ) => {
    const conflicts = this.conflictCollector(flowBuildBasket);
    // -------- CREATE THE FLOW OBJECT (doesn't save yet!) -------------------------------
    settings.flows[flowBuildBasket.createOrEditFlowName] = {
      flowName: flowBuildBasket.createOrEditFlowName,
      flowFilePath: `${this.plugin.settings.systemFolderPlace}TextFlow_SystemFolder/${flowBuildBasket.createOrEditFlowName}.md`,
      flowCookbook: flowBuildBasket.cleanCookbook, // cleaned up user input
      flowReceipe: flowBuildBasket.finalReceipe, // { defMode: pathArray }
      depthFirst: flowBuildBasket.depthFirst,
      isFreshBuild: true,
      flowBuilt: false,
      flaggedForRebuild: false,
      conflictArray: conflicts,
      activeRegions: {},
      persistentCursors: {},
      modifiedRegionsArray: [],
      flowMap: {},
    };
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
  private getBookmarkPathsByGroupName = async (
    flowBuildBasket: Types.flowBuildBasket
  ) => {
    let groupName = flowBuildBasket.flowCookbook.bookmarkGroup;
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
    const collectPaths = (items: Types.BookmarkItem[]): string[] => {
      for (const item of items) {
        if (item.type === "file" && item.path) {
          bookmarkedNotePathsArray.push(item.path);
        } else if (includeSubgroups && item.type === "group" && item.items) {
          // Recurse into nested groups
          bookmarkedNotePathsArray.push(`#${item.title ?? "Unnamed Group"}`);
          collectPaths(item.items);
        }
      }
      return bookmarkedNotePathsArray;
    };

    // Function call
    if (finalGroup?.items) {
      bookmarkedNotePathsArray.push(`#${finalGroup.title ?? "Unnamed Group"}`); // push name of main group
      collectPaths(finalGroup.items);
    } else {
      new Notice("Please check the name of the bookmark group you submitted");
    }
    return Promise.resolve(bookmarkedNotePathsArray);
  };

  // --- GET ALL PATHS FROM FOLDER TAG PROPERTY -------------------
  // In case input hasn't been touched; also makes ! safe to use
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
    return Promise.resolve();
  };

  // --- Function to get the paths
  private getPathsByFoldersTagsProps = async (
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
      const children = folder.children.sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      // Process each child (file or folder) in order
      for (const child of children) {
        if (child instanceof TFile) {
          fileTreeArray.push(child.path);
        } else if (child instanceof TFolder) {
          buildDepthFirstFileTree(child);
        }
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
      folderIncluded: string
    ) => {
      let arrayWithFolderTitles: string[] = [];
      let lastProcessedPath = "";

      if (folderIncluded === "" || folderIncluded === "/") {
        arrayWithFolderTitles.push(`#${this.app.vault.getName()}`);
      }
      for (let path of finalPathArray) {
        // Split current and last path into segments
        const currentSegments = path.split("/");
        const lastSegments = lastProcessedPath.split("/");

        // Find the point where the current path diverges from the last path
        let divergeIndex = 0;
        while (
          divergeIndex < currentSegments.length - 1 && // -1 to not process the file name
          divergeIndex < lastSegments.length &&
          currentSegments[divergeIndex] === lastSegments[divergeIndex]
        ) {
          divergeIndex++;
        }

        // Add folder titles for new path segments
        for (let i = divergeIndex; i < currentSegments.length - 1; i++) {
          arrayWithFolderTitles.push(`#${currentSegments[i]}`);
        }

        // Add the file path
        arrayWithFolderTitles.push(path);
        lastProcessedPath = path;
      }

      return arrayWithFolderTitles;
    };

    // Files first approach
    const findFolderTitlesFilesFirst = (
      finalPathArray: string[],
      folderIncluded: string
    ) => {
      let lastParentFolder = "";
      let currentParentFolder = "";
      let arrayWithFolderTitles: string[] = [];
      if (folderIncluded === "" || folderIncluded === "/") {
        arrayWithFolderTitles.push(`#${this.app.vault.getName()}`);
      }
      for (let path of finalPathArray) {
        // split the path into an array, then get the second-to-last entry or empty string
        let parentFolderPathArray = path.split("/");
        currentParentFolder =
          parentFolderPathArray.length > 1
            ? parentFolderPathArray[parentFolderPathArray.length - 2]
            : "";
        if (currentParentFolder != lastParentFolder) {
          arrayWithFolderTitles.push(`#${currentParentFolder}`);
          lastParentFolder = currentParentFolder;
        }
        arrayWithFolderTitles.push(path);
      }
      return arrayWithFolderTitles;
    };

    //-- function call for folder titles
    let pathArrayWithFolderTitles: string[] = [];
    if (flowBuildBasket.depthFirst) {
      pathArrayWithFolderTitles = findFolderTitlesDepthFirst(
        finalPathArray,
        normalizePath(shCookbook.folderIncluded.trim())
      );
    } else {
      pathArrayWithFolderTitles = findFolderTitlesFilesFirst(
        finalPathArray,
        normalizePath(shCookbook.folderIncluded.trim())
      );
    }

    // pack the cookbook back into the basket
    flowBuildBasket.flowCookbook = shCookbook;

    // presto
    return Promise.resolve(pathArrayWithFolderTitles);
  };

  // ------ The flowBuilder --------------------------
  private flowBuilder = async (
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

      // Your existing loop logic here

      if (ingredient.startsWith("#")) {
        // if it's a folder name
        mapValueBasket.flowOrder++;
        await this.createInvisibleUID(mapValueBasket);
        // make the proper divider
        const divider = `\r${mapValueBasket.UID}<hr>\r\r`;
        // make unencoded divider for debugging
        // const divider = `\r${mapValueBasket.timestamp}<hr>\r\r`;
        mapValueBasket.idDivider = divider.replace(/\\r/g, "\r");

        const ingredientName = ingredient.replace("#", "");

        flow.flowMap[ingredient] = {
          type: "folder",
          path: ingredient,
          itemName: ingredientName,
          UID: mapValueBasket.UID,
          timestamp: mapValueBasket.timestamp,
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

          if (normalizedFileContent.startsWith(normalizedTitleLine)) {
            fileContent = fileContent
              .substring(normalizedTitleLine.length + 1)
              .trimStart();
          }

          flow.flowMap[ingredient] = {
            type: "file",
            path: ingredient,
            itemName: note.name,
            UID: mapValueBasket.UID,
            timestamp: mapValueBasket.timestamp,
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
          /*mapValueBasket.currentEnd =
            mapValueBasket.concatenatedFileContents.length;
          flow.flowMap[ingredient].startEndInFlow.end =
            mapValueBasket.currentEnd;*/
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
      this.plugin.saveSettings();
    }
    if (counter === total) {
      progressBar.close();
    }
  };

  // -------------- manage YAML ------------------

  // ---------------- the actual handling of YAML -------
  private manageYaml = async (
    file: TFile,
    mapValueBasket: Types.mapValueBasket
  ) => {
    try {
      // Create a variable to store the modified frontmatter
      let modifiedFrontmatter: any = {};

      await this.app.fileManager.processFrontMatter(
        file,
        async (frontmatter) => {
          // Store the entire frontmatter object so we don't lose other properties
          modifiedFrontmatter = { ...frontmatter };

          if (frontmatter?.TextFlowUID) {
            const timestampMatch =
              frontmatter.TextFlowUID.match(/【(\d{13,})】/);

            if (timestampMatch) {
              const [_, timestampString] = timestampMatch;
              const timestampNumber = Number(timestampString);
              mapValueBasket.timestamp = timestampNumber;

              const invisibleUidRegex = /⟦([\u200B\u200C\u200D]{26,})⟧/;
              const invisibleUidMatchResult =
                frontmatter.TextFlowUID.match(invisibleUidRegex);

              if (invisibleUidMatchResult && invisibleUidMatchResult[1]) {
                // Invisible UID part found and captured
                mapValueBasket.UID = invisibleUidMatchResult[1];
                modifiedFrontmatter.TextFlowUID = `【${timestampNumber}】⟦${mapValueBasket.UID}⟧`;
              } else {
                // Timestamp part was found, but the invisible UID part is missing or malformed.
                // Recreate the invisible UID.
                const newInvisibleUID = this.reCreateInvisibleUID(
                  timestampNumber,
                  mapValueBasket
                );
                mapValueBasket.UID = newInvisibleUID;

                // Update frontmatter to store the newly created/recreated complete UID
                modifiedFrontmatter.TextFlowUID = `【${timestampNumber}】⟦${newInvisibleUID}⟧`;
              }
            } else {
              // if (!timestampMatch) - TextFlowUID exists but is incomplete (no timestamp)
              throw new Error(
                "TextFlow: Invalid UID format in properties.\n" +
                  "This file seems to be part of a flow but its UID is corrupted.\n" +
                  "Please restore from backup or remove TextFlowUID from properties to treat as new file."
              );
            }
          } else {
            // if (!frontmatter?.TextFlowUID) - No TextFlowUID found
            // Create one
            await this.createInvisibleUID(mapValueBasket); // This sets mapValueBasket.UID and .timestamp
            modifiedFrontmatter.TextFlowUID = `【${mapValueBasket.timestamp}】⟦${mapValueBasket.UID}⟧`;
          }
        }
      );

      // After processing, write the modified frontmatter back to the file
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
  private createInvisibleUID = (mapValueBasket: Types.mapValueBasket) => {
    const INVISIBLE_CHARS = [
      "\u200B", // Zero-width space (0)
      "\u200C", // Zero-width non-joiner (1)
      "\u200D", // Zero-width joiner (2)
    ];

    let timestamp = Date.now();
    if (timestamp === mapValueBasket.timestamp) {
      timestamp += 1;
    }
    //console.log(`createInvisibleUID timestamp ${timestamp}`);
    const base3 = timestamp.toString(3);
    const encodedTimestamp = [...base3]
      .map((digit) => INVISIBLE_CHARS[parseInt(digit)])
      .join("");
    //console.log(`base3 timestamp: ${base3}`);
    // debugMarker(encodedTimestamp);

    mapValueBasket.timestamp = timestamp;
    mapValueBasket.UID = encodedTimestamp;
    mapValueBasket.yamlMini = `\nTextFlowUID: 【${timestamp}】⟦${encodedTimestamp}⟧`;
  };

  // ----------------- If invisible UID got eaten by external editor -----------
  private reCreateInvisibleUID = (
    timestamp: number,
    mapValueBasket: Types.mapValueBasket
  ) => {
    // Define our invisible characters
    const INVISIBLE_CHARS = [
      "\u200B", // Zero-width space (0)
      "\u200C", // Zero-width non-joiner (1)
      "\u200D", // Zero-width joiner (2)
    ];

    // Convert to base-3 string
    const base3 = timestamp.toString(3);

    // Convert each base-3 digit to the corresponding invisible character
    const reCreatedUID = [...base3]
      .map((digit) => INVISIBLE_CHARS[parseInt(digit)])
      .join("");

    return reCreatedUID;
  };
  // --------------- debug the UID
  private debugMarker = (marker: string) => {
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

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    //#######################################################################
    //###########################  Globals   ################################
    //#######################################################################

    //#######################################################################
    //###########################   Settings Tab   ##########################
    //#######################################################################

    const setUpTextFlow = containerEl.createDiv({
      cls: "headline-container",
    });

    // ###############   SET UP A SYSTEM FOLDER   ###########################
    const systemFolder = this.checkSystemFolder();
    let newSystemFolderPlace = ""; // container for the new path
    // -------------------
    const setSystemFolder = new Setting(setUpTextFlow)
      .setName("Choose a place for TextFlow_SystemFolder")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "TextFlow needs a system folder to store its flows and snapshots.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "Enter / to choose the root folder.",
          });
        })
      );

    if (!systemFolder) {
      this.plugin.settings.systemFolderPlace = "";
      this.plugin.settings.systemFolderPath = "TextFlow_SystemFolder";
      this.plugin.saveSettings();
    } else if (
      this.plugin.settings.systemFolderPath != systemFolder.path ||
      this.plugin.settings.systemFolderPlace !=
        (systemFolder.parent?.path ?? "") // if parent is null, use "" as the path
    ) {
      this.plugin.settings.systemFolderPath = systemFolder.path;
      this.plugin.settings.systemFolderPlace = systemFolder.parent?.path ?? "";
      this.plugin.saveSettings();
    }

    setSystemFolder
      .addText((newSystemFolderInput) =>
        newSystemFolderInput
          .setValue(
            this.plugin.settings.systemFolderPlace
              ? this.plugin.settings.systemFolderPlace
              : ""
          )
          .onChange(async (value) => {
            newSystemFolderPlace = normalizePath(value);
            await this.debouncedSaveSettings();
          })
      )
      .addButton((systemFolderCreateOrMoveButton) => {
        systemFolderCreateOrMoveButton
          .setButtonText(systemFolder ? "Move" : "Create")
          .onClick(async () => {
            // Create SystemFolder
            if (!systemFolder) {
              const newPath = normalizePath(
                `${newSystemFolderPlace}/TextFlow_SystemFolder`
              );
              await this.createSystemFolder(newPath);
              this.plugin.discernAndSetsystemFolderState(
                this.plugin.settings.systemFolderHidden,
                newSystemFolderPlace
              );
            } else {
              //Move SystemFolder
              try {
                const newPath = normalizePath(
                  `${newSystemFolderPlace}/TextFlow_SystemFolder`
                );
                await this.app.vault.rename(systemFolder, newPath);
                this.plugin.discernAndSetsystemFolderState(
                  this.plugin.settings.systemFolderHidden,
                  newSystemFolderPlace
                );
                // Update settings with new location
                this.plugin.settings.systemFolderPath = newPath;
                this.plugin.settings.systemFolderPlace = newSystemFolderPlace;

                Object.keys(this.plugin.settings.flows).forEach((flow) => {
                  this.plugin.settings.flows[flow].flowFilePath = normalizePath(
                    `${this.plugin.settings.systemFolderPath}/${flow}.md`
                  );
                });
                await this.plugin.saveSettings();

                new Notice(`SystemFolder moved to ${newSystemFolderPlace}`);
              } catch (error) {
                new Notice(`Failed to move folder: ${error.message}`);
              }
            }
          });
      });

    // -----------   hide temp folder  ---------------
    const hidesystemFolder = new Setting(setUpTextFlow)
      .setName("Hide TextFlow_SystemFolder")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "Hiding this folder is strongly recommended, since accidentally messing with it could lead to data loss or corruption.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "Unhiding the folder requires a reload of the vault.",
          });
        })
      )
      .addToggle((hideSystemFolderToggle) => {
        hideSystemFolderToggle
          .setValue(this.plugin.settings.systemFolderHidden)
          .onChange(async (value) => {
            this.plugin.settings.systemFolderHidden = value;
            this.plugin.discernAndSetsystemFolderState(
              value,
              this.plugin.settings.systemFolderPlace
            );
            await this.plugin.saveSettings();
          });
      });

    // --------   Create a new flowObject   ----------------
    const createFlows = containerEl.createDiv({
      cls: "headline-container",
    });
    createFlows.createEl("h3", {
      text: "Create a new Flow",
      cls: "headline-text",
    });

    //--------- FLOW NAME -----------------
    const chooseFlowName = new Setting(createFlows)
      .setName("Name your Flow")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "Please enter a unique name for your flow.",
          });
        })
      )
      .addText((flowName) => {
        flowName.setPlaceholder("Enter a unique name");
        if (!this.plugin.settings.flowBuildBasket?.fresh) {
          flowName.setValue(this.plugin.settings.flowBuildBasket.oldFlowName);
          this.plugin.settings.flowBuildBasket.createOrEditFlowName =
            this.plugin.settings.flowBuildBasket.oldFlowName;
        }
        flowName.onChange(async (value) => {
          this.plugin.settings.flowBuildBasket.createOrEditFlowName =
            value.trim();
          this.plugin.settings.flowBuildBasket.fresh = false;
          this.debouncedSaveSettings();
        });
      });

    // ---- SORT FLOW ---------
    const sortFlow = new Setting(createFlows)
      .setName("Follow file explorer order")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "(Sub)folders and notes will be processed in the same order as they appear in the file explorer.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "If toggled off, files will be processed first, then (sub)folders.",
          });
        })
      )
      .addToggle((sortToggle) => {
        const toggleSetting = sortToggle.setValue(true);
        if (!this.plugin.settings.flowBuildBasket?.fresh) {
          sortToggle.setValue(this.plugin.settings.flowBuildBasket.depthFirst);
        }
        sortToggle.onChange(async (value) => {
          this.plugin.settings.flowBuildBasket.depthFirst = value;
          this.plugin.saveSettings();
        });
      });

    //------- DEFINE FLOW --------------------
    const defineFlow = new Setting(createFlows)
      .setName("Define your Flow...")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "Changing definition modes will clear all values.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "If you don't enter any criteria, your enitre vault will be included in your flow.",
            cls: "text-emphasis",
          });
        })
      );

    //------- RADIO BUTTONS
    const radioButtonContainer = defineFlow.controlEl.createDiv({
      cls: "radio-button-group",
    });
    const buttons: { [key: string]: ButtonComponent } = {};

    // -------- Radio Buttons ---------------
    // Creating just the buttons to keep UI order; settings and .onClick
    // are below the input element setup
    buttons.bookmarks = new ButtonComponent(radioButtonContainer)
      .setButtonText("... by a bookmark group")
      .setClass("settings-radio-button");
    if (this.plugin.settings.flowBuildBasket.definitionMode === "bookmarks") {
      buttons.bookmarks.buttonEl.addClass("settings-radio-button-active");
    }

    buttons.foldersTagsProps = new ButtonComponent(radioButtonContainer)
      .setButtonText("... by folders, tags, properties")
      .setClass("settings-radio-button");
    if (
      this.plugin.settings.flowBuildBasket.definitionMode === "foldersTagsProps"
    ) {
      buttons.foldersTagsProps.buttonEl.addClass(
        "settings-radio-button-active"
      );
    }

    // ------ BOOKMARKS INPUT ELEMENT AND STUFF --------------------------------------
    const chooseBookmarks = new Setting(createFlows);
    chooseBookmarks.settingEl.hide(); // HIDE INITIALLY
    chooseBookmarks.settingEl.addClass("border-top-none");
    chooseBookmarks.settingEl.addClass("input-width-200");
    chooseBookmarks.setDesc(
      createFragment((desc) => {
        desc.createSpan({
          text: "Input the name of a bookmarks group.",
        });
        desc.createEl("br"); // Add line break
        desc.createSpan({
          text: "To choose a subgroup, enter its path like this:",
        });
        desc.createEl("br"); // Add line break
        desc.createSpan({
          text: "rootLevelGroup/subGroup1/subGroup2",
        });
        desc.createEl("br"); // Add line break
        desc.createSpan({
          text: "To exclude a group's subgroups end its name/path with /",
        });
      })
    );
    chooseBookmarks.addText((setBookmarksGroup) => {
      if (!this.plugin.settings.flowBuildBasket?.fresh) {
        setBookmarksGroup.setValue(
          this.plugin.settings.flowBuildBasket.flowCookbook.bookmarkGroup
        );
      }
      setBookmarksGroup.onChange(async (value) => {
        this.plugin.settings.flowBuildBasket.previewUsed = false;
        this.plugin.settings.flowBuildBasket.flowCookbook.bookmarkGroup =
          value.trim();
        this.plugin.settings.flowBuildBasket.fresh = false;
        this.debouncedSaveSettings();
      });
    });

    // ---------- FOLDERS, TAGS AND PROPERTIES INPUT ELEMENT -----------------------------------------
    const showOrHideAlLFoldersTagsProps = (state: string) => {
      if (state === "show") {
        headlineChoosePathsTagsProperties.settingEl.show();
        folderIncludeInput.settingEl.show();
        folderExcludeInput.settingEl.show();
        tagsIncludeInput.settingEl.show();
        tagsExcludeInput.settingEl.show();
        propertiesIncludeInput.settingEl.show();
        propertiesExcludeInput.settingEl.show();
      }
      if (state === "hide") {
        headlineChoosePathsTagsProperties.settingEl.hide();
        folderIncludeInput.settingEl.hide();
        folderExcludeInput.settingEl.hide();
        tagsIncludeInput.settingEl.hide();
        tagsExcludeInput.settingEl.hide();
        propertiesIncludeInput.settingEl.hide();
        propertiesExcludeInput.settingEl.hide();
      }
    };
    // --- headline object ------
    const headlineChoosePathsTagsProperties = new Setting(createFlows);
    headlineChoosePathsTagsProperties.settingEl.hide();
    headlineChoosePathsTagsProperties
      .setClass("border-top-none")
      .setClass("input-width")
      //.setClass("paths-props-setting")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "All six inputs are optional. For inclusion, all criteria must be true; for exclusion only one criterion must me true.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "If you need more complex logic, consider defining your flow using a Dataview query and tagging the results. ",
          });
        })
      );

    // ----- Folder include
    const folderIncludeInput = new Setting(createFlows);
    folderIncludeInput.settingEl.hide();
    folderIncludeInput.settingEl.addClass("border-top-none");
    folderIncludeInput.settingEl.addClass("input-width-400");
    folderIncludeInput
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "Choose a source folder.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "Default is root.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "End path with / to not include subfolders.",
          });
        })
      )
      .addText((folderIncludeInput) => {
        if (!this.plugin.settings.flowBuildBasket?.fresh) {
          folderIncludeInput.setValue(
            this.plugin.settings.flowBuildBasket.flowCookbook.folderIncluded
          );
        }
        folderIncludeInput.onChange(async (value) => {
          this.plugin.settings.flowBuildBasket.previewUsed = false;
          this.plugin.settings.flowBuildBasket.flowCookbook.folderIncluded =
            value;
          this.plugin.settings.flowBuildBasket.fresh = false;
          this.debouncedSaveSettings();
        });
      });

    // ----- Folder exclude
    const folderExcludeInput = new Setting(createFlows);
    folderExcludeInput.settingEl.hide();
    folderExcludeInput.settingEl.addClass("border-top-none");
    folderExcludeInput.settingEl.addClass("input-width-400");
    folderExcludeInput
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "EXclude subfolder(s) by PATH.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "Input comma separated list.",
          });
        })
      )
      .addText((chooseExcludedFolders) => {
        if (!this.plugin.settings.flowBuildBasket?.fresh) {
          chooseExcludedFolders.setValue(
            this.plugin.settings.flowBuildBasket.flowCookbook.folderExcluded
          );
        }
        chooseExcludedFolders.onChange(async (value) => {
          this.plugin.settings.flowBuildBasket.previewUsed = false;
          this.plugin.settings.flowBuildBasket.flowCookbook.folderExcluded =
            value.trim();
          this.plugin.settings.flowBuildBasket.fresh = false;
          this.debouncedSaveSettings();
        });
      });

    // ----- Tags
    const tagsIncludeInput = new Setting(createFlows);
    tagsIncludeInput.settingEl.hide();
    tagsIncludeInput.settingEl.addClass("border-top-none");
    tagsIncludeInput.settingEl.addClass("input-width-400");
    tagsIncludeInput
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "INclude by TAG.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "Input comma separated list.",
          });
        })
      )
      .addText((chooseIncludedTags) => {
        if (!this.plugin.settings.flowBuildBasket?.fresh) {
          chooseIncludedTags.setValue(
            this.plugin.settings.flowBuildBasket.flowCookbook.tagsIncluded
          );
        }
        chooseIncludedTags.onChange(async (value) => {
          this.plugin.settings.flowBuildBasket.previewUsed = false;
          this.plugin.settings.flowBuildBasket.flowCookbook.tagsIncluded =
            value.trim();
          this.plugin.settings.flowBuildBasket.fresh = false;
          this.debouncedSaveSettings();
        });
      });

    const tagsExcludeInput = new Setting(createFlows);
    tagsExcludeInput.settingEl.hide();
    tagsExcludeInput.settingEl.addClass("border-top-none");
    tagsExcludeInput.settingEl.addClass("input-width-400");
    tagsExcludeInput
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "EXclude by TAG.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "Input comma separated list.",
          });
        })
      )
      .addText((chooseExcludedTags) => {
        if (!this.plugin.settings.flowBuildBasket?.fresh) {
          chooseExcludedTags.setValue(
            this.plugin.settings.flowBuildBasket.flowCookbook.tagsExcluded
          );
        }
        chooseExcludedTags.onChange(async (value) => {
          this.plugin.settings.flowBuildBasket.previewUsed = false;
          this.plugin.settings.flowBuildBasket.flowCookbook.tagsExcluded =
            value.trim();
          this.plugin.settings.flowBuildBasket.fresh = false;
          this.debouncedSaveSettings();
        });
      });

    // ----- Properties
    const propertiesIncludeInput = new Setting(createFlows);
    propertiesIncludeInput.settingEl.hide();
    propertiesIncludeInput.settingEl.addClass("border-top-none");
    propertiesIncludeInput.settingEl.addClass("input-width-400");
    propertiesIncludeInput
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "INclude by PROPERTY.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "Input comma separated list.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: `You can use property = "value"`,
          });
        })
      )
      .addText((chooseIncludedProperties) => {
        if (!this.plugin.settings.flowBuildBasket?.fresh) {
          chooseIncludedProperties.setValue(
            this.plugin.settings.flowBuildBasket.flowCookbook.propsIncluded
          );
        }
        chooseIncludedProperties.onChange(async (value) => {
          this.plugin.settings.flowBuildBasket.previewUsed = false;
          this.plugin.settings.flowBuildBasket.flowCookbook.propsIncluded =
            value.trim();
          this.plugin.settings.flowBuildBasket.fresh = false;
          this.debouncedSaveSettings();
        });
      });

    const propertiesExcludeInput = new Setting(createFlows);
    propertiesExcludeInput.settingEl.hide();
    propertiesExcludeInput.settingEl.addClass("border-top-none");
    propertiesExcludeInput.settingEl.addClass("input-width-400");
    propertiesExcludeInput
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "EXclude by PROPERTY.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "Input comma separated list.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: `You can use property = "value"`,
          });
        })
      )
      .addText((chooseExcludedProperties) => {
        if (!this.plugin.settings.flowBuildBasket?.fresh) {
          chooseExcludedProperties.setValue(
            this.plugin.settings.flowBuildBasket.flowCookbook.propsExcluded
          );
        }
        chooseExcludedProperties.onChange(async (value) => {
          this.plugin.settings.flowBuildBasket.previewUsed = false;
          this.plugin.settings.flowBuildBasket.flowCookbook.propsExcluded =
            value.trim();
          this.plugin.settings.flowBuildBasket.fresh = false;
          this.debouncedSaveSettings();
        });
      });

    // ---- RADIO BUTTON SETTINGS AND LOGIC
    // ---------------- Presets for the BOOKMARKS button
    if (!this.plugin.settings.flowBuildBasket?.fresh) {
      if (this.plugin.settings.flowBuildBasket.definitionMode === "bookmarks") {
        showOrHideAlLFoldersTagsProps("hide");
        chooseBookmarks.settingEl.show();
      }
    }
    // onClick for the BOOKMARKS button
    buttons.bookmarks.onClick(() => {
      if (
        this.plugin.settings.flowBuildBasket.definitionMode ===
        "foldersTagsProps"
      ) {
        this.plugin.settings.flowBuildBasket.flowCookbook = {};
        this.plugin.saveSettings();
      }
      this.plugin.settings.flowBuildBasket.definitionMode = "bookmarks";
      this.plugin.settings.flowBuildBasket.previewUsed = false;
      this.radioButtonManager(buttons.bookmarks, buttons.foldersTagsProps);
      chooseBookmarks.settingEl.show();
      showOrHideAlLFoldersTagsProps("hide");
    });

    // ------------ Presets for the foldersTagsProps button
    if (!this.plugin.settings.flowBuildBasket?.fresh) {
      if (
        this.plugin.settings.flowBuildBasket.definitionMode ===
        "foldersTagsProps"
      ) {
        chooseBookmarks.settingEl.hide();
        showOrHideAlLFoldersTagsProps("show");
      }
    }

    // onClick for the foldersTagsProps button
    buttons.foldersTagsProps.onClick(() => {
      if (this.plugin.settings.flowBuildBasket.definitionMode === "bookmarks") {
        this.plugin.settings.flowBuildBasket.flowCookbook = {};
        this.plugin.saveSettings();
      }
      this.plugin.settings.flowBuildBasket.definitionMode = "foldersTagsProps";
      this.plugin.settings.flowBuildBasket.previewUsed = false;
      this.radioButtonManager(buttons.foldersTagsProps, buttons.bookmarks);
      chooseBookmarks.settingEl.hide();
      showOrHideAlLFoldersTagsProps("show");
    });

    // ----------- Preview and save BUTTONS --------------------

    const previewButton = new ButtonComponent(containerEl);
    previewButton
      .setButtonText("Preview your flow structure")
      .onClick(async (buttonEl: MouseEvent) => {
        this.plugin.settings.flowBuildBasket = {
          createOrEditFlowName:
            this.plugin.settings.flowBuildBasket.createOrEditFlowName,
          oldFlowName: this.plugin.settings.flowBuildBasket.oldFlowName,
          createOrEdit: this.plugin.settings.flowBuildBasket.createOrEdit,
          depthFirst: this.plugin.settings.flowBuildBasket.depthFirst,
          definitionMode: this.plugin.settings.flowBuildBasket.definitionMode,
          flowCookbook: this.plugin.settings.flowBuildBasket.flowCookbook,
          cleanCookbook: {},
          finalReceipe: this.plugin.settings.flowBuildBasket.finalReceipe,
          conflicts: this.plugin.settings.flowBuildBasket.conflicts,
          dataviewSearchPath: "",
          previewUsed: true,
          success: false,
          fresh: false,
        };
        await this.createFlowDefinition(this.plugin.settings.flowBuildBasket);
        this.plugin.settings.flowBuildBasket.previewUsed = true;
        if (this.plugin.settings.flowBuildBasket.success === true) {
          const previewModal = new Modals.previewModal(
            this.app,
            this.plugin,
            this.plugin.settings.flowBuildBasket
          );
          previewModal.open();
        }
      });

    const saveButton = new ButtonComponent(containerEl);
    saveButton
      .setButtonText("Save Flow definition")
      .onClick(async (buttonEl: MouseEvent) => {
        // if no flow name is given

        if (!this.plugin.settings.flowBuildBasket.createOrEditFlowName) {
          new Notice("Please give your flow a name first.");
          return;
        }
        // if we're creating and a flow with the given name already exists
        if (
          this.plugin.settings.flowBuildBasket.createOrEdit === "create" &&
          this.plugin.settings.flows[
            this.plugin.settings.flowBuildBasket.createOrEditFlowName
          ]
        ) {
          new Notice(
            "A flow by this name already exists. Rename your new flow or delete the old one."
          );
          return;
        }

        // If we're editing the flow and changing its name
        let currentFlowName =
          this.plugin.settings.flowBuildBasket.createOrEditFlowName;
        let oldFlowName = this.plugin.settings.flowBuildBasket.oldFlowName;

        if (
          this.plugin.settings.flowBuildBasket.createOrEdit === "edit" &&
          currentFlowName != oldFlowName
        ) {
          // delete the old flow object
          delete this.plugin.settings.flows[oldFlowName];
        }

        // Build a flow definition if preview hasn't done that yet
        if (!this.plugin.settings.flowBuildBasket.previewUsed) {
          await this.createFlowDefinition(this.plugin.settings.flowBuildBasket);
          if (!this.plugin.settings.flowBuildBasket.success) {
            return;
          }
        }

        await this.writeFlowDef(
          this.plugin.settings,
          this.plugin.settings.flowBuildBasket
        );
        // reset all values
        this.resetFlowBuildBasket(this.plugin.settings.flowBuildBasket);
        this.plugin.saveSettings();
        this.display();
      });

    // ----- Clear the input mask
    const clearValues = new ButtonComponent(containerEl);
    clearValues.setButtonText("Reset").onClick(async (buttonEl: MouseEvent) => {
      this.plugin.settings.flowBuildBasket.previewUsed = false;
      this.resetFlowBuildBasket(this.plugin.settings.flowBuildBasket);
      this.plugin.saveSettings();
      this.display();
    });

    const flowDisplay = containerEl.createDiv({
      cls: "headline-container",
    });
    flowDisplay.createEl("h3", {
      text: "Your Flow definitions",
      cls: "headline-text",
    });

    Object.keys(this.plugin.settings.flows).forEach((flow) => {
      const shownFlow = this.plugin.settings.flows[flow];

      // --- DISPLAY PREPARATIONS ----------------------------------
      // Set up strings to display flow criteria
      let source = "";
      const included: string[] = [];
      let inclusionString = "";
      const excluded: string[] = [];
      let exclusionString = "";

      // SOURCE
      if (shownFlow.flowCookbook.bookmarks) {
        source += `Bookmark group "${shownFlow.flowCookbook.bookmarks}"`;
      } else if (shownFlow.flowCookbook.folderIncluded === "") {
        source += `Root folder`;
      } else {
        source += `Folder ${shownFlow.flowCookbook.folderIncluded}`;
      }
      // INCLUSION
      // if flow is based on folderTagProp
      if (shownFlow.flowCookbook.tagsIncluded != "") {
        included.push(`Tags: ${shownFlow.flowCookbook.tagsIncluded}`);
      }

      if (shownFlow.flowCookbook.propsIncluded != "") {
        included.push(`Props: ${shownFlow.flowCookbook.propsIncluded}`);
      }
      const inclusionsJoined = included.join(" / ");
      inclusionString += inclusionsJoined;
      // Put it all together

      // EXCLUSION
      // if flow is based on folderTagProp
      if (
        shownFlow.flowCookbook.folderExcluded != "" &&
        shownFlow.flowCookbook.folderExcluded != undefined
      ) {
        excluded.push(`Folders: ${shownFlow.flowCookbook.folderExcluded}`);
      }

      if (shownFlow.flowCookbook.tagsExcluded != "")
        excluded.push(`Tags: ${shownFlow.flowCookbook.tagsExcluded}`);
      if (shownFlow.flowCookbook.propsExcluded != "") {
        excluded.push(`Props: ${shownFlow.flowCookbook.propsExcluded}`);
      }
      const exclusionsJoined = excluded.join(" / ");
      exclusionString += exclusionsJoined;

      // --- THE DISPLAY ITSELF -------------------------------
      const flowShow = new Setting(flowDisplay);
      let modWarning = "";
      if (shownFlow.modifiedRegionsArray.length > 0) {
        modWarning = " - UNSAVED CHANGES!";
      }
      flowShow
        .setName(`${shownFlow.flowName}`)
        .setDesc(
          createFragment((desc) => {
            desc.createSpan({
              text: `Source: ${source} ${modWarning}`,
            });
            if (inclusionString != "" && inclusionString != undefined) {
              desc.createEl("br"); // Add line break
              desc.createSpan({
                text: `Inclusion criteria: ${inclusionString}`,
              });
            }
            if (exclusionString != "" && exclusionString != undefined) {
              desc.createEl("br"); // Add line break
              desc.createSpan({
                text: `Exclusion criteria: ${exclusionString}`,
              });
            }
          })
        )

        .addButton((rebuildButton) =>
          rebuildButton.setButtonText("(Re)build)").onClick(async () => {
            // gather all info for the flowDefinition
            const flowReBuildBasket: Types.flowBuildBasket = {
              createOrEditFlowName: this.plugin.settings.flows[flow].flowName,
              oldFlowName: this.plugin.settings.flows[flow].flowName,
              createOrEdit: "",
              depthFirst: this.plugin.settings.flows[flow].depthFirst,
              definitionMode: Object.keys(
                this.plugin.settings.flows[flow].flowReceipe
              )[0],
              flowCookbook: this.plugin.settings.flows[flow].flowCookbook,
              cleanCookbook: {},
              finalReceipe: this.plugin.settings.flows[flow].flowReceipe,
              conflicts: this.plugin.settings.flows[flow].conflictArray,
              dataviewSearchPath: "",
              previewUsed: true,
              success: false,
              fresh: false,
            };

            await this.createFlowDefinition(flowReBuildBasket);
            this.plugin.settings.flows[
              flowReBuildBasket.createOrEditFlowName
            ].flowReceipe = flowReBuildBasket.finalReceipe; // { defMode: pathArray }

            this.resetFlowBuildBasket(flowReBuildBasket);

            // Get fresh reference to the flow object after createFlowDefinition
            const updatedFlow = this.plugin.settings.flows[flow];

            // ---------- flow creation ----------------
            // the object that shuttles the values between the functions
            const mapValueBasket: Types.mapValueBasket = {
              concatenatedFileContents: "",
              initialIteration: true,
              timestamp: 0,
              flowOrder: 0,
              UID: "",
              yamlMini: "",
              singleFileContent: "",
              currentEnd: 0,
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
              flow,
              mapValueBasket
            );

            await this.plugin.saveSettings();
            this.display();
          })
        )

        .addButton((editFlow) => {
          editFlow.setButtonText("Edit").onClick(async () => {
            // state check creating vs editing

            this.plugin.settings.flowBuildBasket = {
              createOrEditFlowName: "",
              oldFlowName: shownFlow.flowName,
              createOrEdit: "edit",
              depthFirst: shownFlow.depthFirst,
              definitionMode: Object.keys(shownFlow.flowReceipe)[0],
              flowCookbook: shownFlow.flowCookbook,
              cleanCookbook: shownFlow.flowCookbook,
              finalReceipe: shownFlow.flowReceipe,
              conflicts: shownFlow.conflictArray,
              dataviewSearchPath: "",
              previewUsed: false,
              success: true,
              fresh: false,
            };

            this.plugin.saveSettings();
            this.display();
          });
        })
        .addButton((deleteDef) => {
          deleteDef.setButtonText("Delete definition").onClick(async () => {
            const DeleteFlowDefModal = new Modals.DeleteFlowDefModal(
              this.app,
              this.plugin.settings,
              shownFlow.flowName,
              this.modalSaveAndReload
            );
            DeleteFlowDefModal.open();
          });
        });
    });
  }
}
