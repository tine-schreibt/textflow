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
  normalizePath,
  Notice,
  ButtonComponent,
} from "obsidian";
import TextFlow from "../main";
import * as Types from "./types";

// --- A class that helps with resetting values
class FlowDefVariables {
  createOrEditFlowName: string = "";
  definitionMode: string = "";
  flowCookbook: { [key: string]: string } = {};
  cleanCookbook: { [key: string]: string } = {};
  previewUsed: boolean = false;

  reset() {
    this.createOrEditFlowName = "";
    this.definitionMode = "";
    this.flowCookbook = {};
    this.cleanCookbook = {};
    this.previewUsed = false;
  }
}

// --- A class for the progress bar
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
  flowDefVariables: FlowDefVariables;

  constructor(app: App, plugin: TextFlow) {
    super(app, plugin);
    this.plugin = plugin;
    this.flowDefVariables = new FlowDefVariables();
  }

  //#######################################################################
  //###########################    Functions   ############################
  //#######################################################################

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

  // --- Create Flow definition
  // finalReceipe = {defnition mode: pathArray}
  finalReceipe: { [key: string]: string[] } = {};

  createFlowDefinition = async (
    flowDefBasket: Types.flowDefBasket
  ): Promise<void> => {
    // Pre-flight check 01 - flowName set / uniqueness when creating
    if (flowDefBasket.fdbCreateOrEditFlowName === "") {
      new Notice("Flow name can not be empty.");
      flowDefBasket.fdbSuccess = false;
      return Promise.reject(Error);
    }
    if (
      flowDefBasket.fdbCreateOrEdit === "create" &&
      this.plugin.settings.flows[flowDefBasket.fdbCreateOrEditFlowName]
    ) {
      new Notice(
        `A flow with the name ${flowDefBasket.fdbCreateOrEditFlowName} already exist. Please choose a different name or edit the existing flow.`
      );
      flowDefBasket.fdbSuccess = false;
      return Promise.reject(Error);
    }

    // -------- Putting the finalReceipe together by fetching/filtering all paths
    try {
      // ----------- FINAL RECEIPE FOR BOOKMARKS ---------------------
      if (flowDefBasket.fdbDefinitionMode === "bookmarks") {
        if (
          flowDefBasket.fdbFlowCookbook.bookmarkGroup === undefined ||
          flowDefBasket.fdbFlowCookbook.bookmarkGroup === ""
        ) {
          new Notice("Please enter at least one bookmark group.");
          flowDefBasket.fdbSuccess = false;
          return Promise.reject(Error);
        } else {
          const bookmarkPathArray = await this.getBookmarkPathsByGroupName(
            flowDefBasket
          );
          this.finalReceipe = { bookmarks: bookmarkPathArray };
        }

        // ------ FINAL RECEIPE FOR PATH TAG PROPERTY -----------------------
      } else {
        const ensureNoUndefined = await this.ensureNoUndefined(flowDefBasket);
        const foldersTagsPropsPathArray = await this.getPathsByFoldersTagsProps(
          flowDefBasket
        );
        this.finalReceipe = { foldersTagsProps: foldersTagsPropsPathArray };
      }
      // ---- Pre-flight check 02 - finalReceipe array
      if (
        (this.finalReceipe.bookmarks &&
          this.finalReceipe.bookmarks.length <= 1) ||
        (this.finalReceipe.folderTagsProperties &&
          this.finalReceipe.folderTagsProperties.length <= 1)
      ) {
        new Notice(
          "Your flow definition leads to an empty flow. Please edit it to be less restrictive"
        );
        flowDefBasket.fdbSuccess = false;
        return Promise.reject(Error);
      }

      // -------- CREATE THE FLOW OBJECT (doesn't save yet!) -------------------------------
      this.plugin.settings.flows[flowDefBasket.fdbCreateOrEditFlowName] = {
        flowCookbook: this.flowDefVariables.cleanCookbook, // cleaned up user input
        flowReceipe: this.finalReceipe, // { defMode: pathArray }
        isFreshBuild: true,
        flowFileName: flowDefBasket.fdbCreateOrEditFlowName, // Using the entered name
        flowFilePath: `${this.plugin.settings.systemFolderPlace}TextFlow_SystemFolder/${flowDefBasket.fdbCreateOrEditFlowName}.md`,
        flowBuilt: false,
        flowMap: {},
        flowActive: false,
        activeRegion: {
          lastCursorPosition: 0,
          type: "",
          path: "",
          UID: "",
          flowOrder: 1,
          startInFlow: 0,
          endInFlow: 1,
        },
        persistentCursorPos: 0,
        modifiedRegionsArray: [],
      };

      flowDefBasket.fdbSuccess = true;
      return Promise.resolve();
    } catch (error) {
      new Notice(
        "An error occurred while creating the finalReceipe for your flow. Check the console for details."
      );
      flowDefBasket.fdbSuccess = false;
      return Promise.reject(error);
    }
  };

  // --- Reset flowDefBasket
  resetFlowDefBasket = (flowDefBasket: Types.flowDefBasket) => {
    flowDefBasket.fdbCreateOrEditFlowName = "";
    flowDefBasket.fdbCreateOrEdit = "";
    flowDefBasket.fdbDefinitionMode = "";
    flowDefBasket.fdbFlowCookbook = {};
    flowDefBasket.fdbCleanCookbook = {};
    flowDefBasket.fdbSuccess = false;
  };

  // --- HELPER FUNCTIONS FOR FETCHING PATHS (AND CLEANING UP STUFF)
  // Also we're using the opportunity to get a clean cookbook (user input) for storage

  // ---- GET PATHS IN BOOKMARK GROUP ----------------
  private getBookmarkPathsByGroupName = async (
    flowDefBasket: Types.flowDefBasket
  ) => {
    let groupName = flowDefBasket.fdbFlowCookbook.bookmarkGroup;
    // prepare path for further processing:
    const cleanPath = groupName.replace(/\/+/g, "/");
    this.flowDefVariables.cleanCookbook.bookmarks = cleanPath;
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
          bookmarkedNotePathsArray.push(`§${item.title ?? "Unnamed Group"}`);
          collectPaths(item.items);
        }
      }

      return bookmarkedNotePathsArray;
    };

    // Function call
    if (finalGroup?.items) {
      bookmarkedNotePathsArray.push(`§${finalGroup.title ?? "Unnamed Group"}`); // push name of main group
      collectPaths(finalGroup.items);
    } else {
      new Notice("Please check the name of the bookmark group you submitted");
    }
    return Promise.resolve(bookmarkedNotePathsArray);
  };

  // --- GET ALL PATHS FROM FOLDER TAG PROPERTY -------------------
  // In case input hasn't been touched; also makes ! safe to use
  ensureNoUndefined = async (flowDefBasket: Types.flowDefBasket) => {
    if (flowDefBasket.fdbFlowCookbook.folderIncluded === undefined) {
      flowDefBasket.fdbFlowCookbook.folderIncluded = "";
    }
    if (flowDefBasket.fdbFlowCookbook.folderExcluded === undefined) {
      flowDefBasket.fdbFlowCookbook.folderExcluded = "";
    }
    if (flowDefBasket.fdbFlowCookbook.tagIncluded === undefined) {
      flowDefBasket.fdbFlowCookbook.tagIncluded = "";
    }
    if (flowDefBasket.fdbFlowCookbook.tagExcluded === undefined) {
      flowDefBasket.fdbFlowCookbook.tagExcluded = "";
    }
    if (flowDefBasket.fdbFlowCookbook.propertyIncluded === undefined) {
      flowDefBasket.fdbFlowCookbook.propertyIncluded = "";
    }
    if (flowDefBasket.fdbFlowCookbook.propertyExcluded === undefined) {
      flowDefBasket.fdbFlowCookbook.propertyExcluded = "";
    }
    return Promise.resolve();
  };

  // --- Function to get the paths
  private getPathsByFoldersTagsProps = async (
    flowDefBasket: Types.flowDefBasket
  ) => {
    const dv = getAPI();
    if (!dv) {
      new Notice("Dataview API not available!");
      return Promise.reject(Error);
    }
    // unpack into shorthand for easier reading
    const shCookbook = flowDefBasket.fdbFlowCookbook;
    // ---- Pre-flight checks and cleanup --------------

    //--- INCLUDED FOLDER - only one path; notify if multiple
    let cleanInclusionPath: string = "";
    const folderInclusionArray = shCookbook.folderIncluded.split(",");
    if (folderInclusionArray.length > 1) {
      new Notice("Folder inclusion can only contain a single folder.");
    } else {
      cleanInclusionPath = normalizePath(shCookbook.folderIncluded.trim());
      const searchPath =
        cleanInclusionPath === "" || cleanInclusionPath === "/"
          ? "" // Empty string in Dataview queries means "search everywhere"
          : `"${cleanInclusionPath.replace(/"/g, '\\"')}"`; // For specific paths, we need to wrap in quotes
      this.flowDefVariables.cleanCookbook.folderIncluded = searchPath;
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
      this.flowDefVariables.cleanCookbook.folderExcluded =
        cleanFolderExclusionArray.join(", ");
    } else {
      cleanFolderExclusionArray.push("");
      this.flowDefVariables.cleanCookbook.folderExcluded = "";
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
    const cleanTagInclusionArray = tagCleanup(shCookbook.tagIncluded);
    this.flowDefVariables.cleanCookbook.tagIncluded =
      cleanTagInclusionArray.join(", ");
    const cleanTagExclusionArray = tagCleanup(shCookbook.tagExcluded);
    this.flowDefVariables.cleanCookbook.tagExcluded =
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
      shCookbook.propertyIncluded
    );
    this.flowDefVariables.cleanCookbook.propertyIncluded =
      cleanPropertiesInclusionArray.join(", ");

    let cleanPropertiesExclusionArray = propertyCleanup(
      shCookbook.propertyExcluded
    );
    this.flowDefVariables.cleanCookbook.propertyExcluded =
      cleanPropertiesExclusionArray.join(", ");

    // -------- cleanup done ----------------

    // --- FETCH FILE TREE FOR SORTING PURPOSES
    // some globals for the whole path stuff
    const fileTreeArray: string[] = [];
    const vault = this.app.vault;

    // Recursive function to build the file tree in correct order
    const buildFileTree = (folder: TFolder) => {
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
          buildFileTree(child);
        }
      }
    };

    // Build the complete file tree (which puts results in fileTreeArray)
    buildFileTree(vault.getRoot());

    // ---- CALL DATAVIEW API to fetch all included, then filter
    const allNotes = dv
      .pages(this.flowDefVariables.cleanCookbook.folderIncluded)
      .sort((note: Types.DVNote) => {
        const parts = note.file.path.split("/");
        return parts
          .map((part, index) => {
            // For each level of depth, create a fixed-width string
            // This ensures "folder" comes before "folder/subfolder"
            return part.padEnd(100, "\0");
          })
          .join("");
      });
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

    // Helper function for including folder titles
    const findFolderTitles = (
      finalPathArray: string[],
      folderIncluded: string
    ) => {
      let lastParentFolder = "";
      let currentParentFolder = "";
      let arrayWithFolderTitles: string[] = [];
      if (folderIncluded === "" || folderIncluded === "/") {
        arrayWithFolderTitles.push(`§${this.app.vault.getName()}`);
      }
      for (let path of finalPathArray) {
        // split the path into an array, then get the second-to-last entry or empty string
        let parentFolderPathArray = path.split("/");
        currentParentFolder =
          parentFolderPathArray.length > 1
            ? parentFolderPathArray[parentFolderPathArray.length - 2]
            : "";
        if (currentParentFolder != lastParentFolder) {
          arrayWithFolderTitles.push(`§${currentParentFolder}`);
          lastParentFolder = currentParentFolder;
        }
        arrayWithFolderTitles.push(path);
      }
      console.log(
        "FOLDER INCLUDED: ",
        folderIncluded,
        "ARRAY: ",
        arrayWithFolderTitles
      );
      return arrayWithFolderTitles;
    };

    //-- function call for folder titles
    const pathArrayWithFolderTitles = findFolderTitles(
      finalPathArray,
      normalizePath(shCookbook.folderIncluded.trim())
    );

    // pack the cookbook back into the basket
    flowDefBasket.fdbFlowCookbook = shCookbook;

    // presto
    return Promise.resolve(pathArrayWithFolderTitles);
  };

  // ---------- flow creation ----------------
  // the object that shuttles the values between the functions
  mapValueBasket: Types.mapValueBasket = {
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

      if (ingredient.startsWith("§")) {
        // if it's a folder name
        mapValueBasket.flowOrder++;
        await this.createInvisibleUID(mapValueBasket);
        // make the proper divider
        const divider = `\r${mapValueBasket.UID}<hr>\r\r`;
        // make unencoded divider for debugging
        // const divider = `\r${mapValueBasket.timestamp}<hr>\r\r`;
        mapValueBasket.idDivider = divider.replace(/\\r/g, "\r");

        const ingredientName = ingredient.replace("§", "");

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
          startEndInFlow: {
            start: mapValueBasket.initialIteration
              ? 0
              : mapValueBasket.concatenatedFileContents.length,
            end: ingredientName.length + mapValueBasket.idDivider.length,
          },
        } as Types.SourceFileObject;
        mapValueBasket.initialIteration = false;

        // Add content with marker before divider
        mapValueBasket.concatenatedFileContents += `<center><b>${ingredientName}</b></center>${mapValueBasket.idDivider}`;
        mapValueBasket.currentEnd =
          mapValueBasket.concatenatedFileContents.length;
        flow.flowMap[ingredient].startEndInFlow.end = mapValueBasket.currentEnd;
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
          mapValueBasket.concatenatedFileContents += `${fileContent}-divider-${mapValueBasket.idDivider}`;
          mapValueBasket.currentEnd =
            mapValueBasket.concatenatedFileContents.length;
          flow.flowMap[ingredient].startEndInFlow.end =
            mapValueBasket.currentEnd;
        } else {
          console.error("Invalid file.");
        }
      }
    }
    if (systemFolder && systemFolder instanceof TFolder) {
      const flowFilePath = `${this.plugin.settings.systemFolderPlace}TextFlow_SystemFolder/${flow.flowFileName}.md`;
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
            await this.plugin.saveSettings();
          })
      )
      .addButton((systemFolderCreateOrMoveButton) => {
        systemFolderCreateOrMoveButton
          .setButtonText(systemFolder ? "Move" : "Create")
          .onClick(async () => {
            // Create SystemFolder
            if (!systemFolder) {
              const newPath = `${newSystemFolderPlace}TextFlow_SystemFolder`;
              this.createSystemFolder(newPath);
            } else {
              //Move SystemFolder
              try {
                const newPath = `${newSystemFolderPlace}TextFlow_SystemFolder`;
                await this.app.vault.rename(systemFolder, newPath);
                // Update settings with new location
                this.plugin.settings.systemFolderPath = newPath;
                this.plugin.settings.systemFolderPlace = newSystemFolderPlace;
                for (let flow in this.plugin.settings.flows) {
                  this.plugin.settings.flows[flow].flowFilePath = normalizePath(
                    `${this.plugin.settings.systemFolderPath}/${flow}.md`
                  );
                }
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
      .setName("Hide temp folder")
      .setDesc(
        "Hiding the folder is recommended to avoid accidentally messing with it."
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
    let createOrEdit = "creating";

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
      .addText((flowName) =>
        flowName
          .setPlaceholder("Enter a unique name")
          .onChange(async (value) => {
            // state check creating vs editing
            this.flowDefVariables.createOrEditFlowName = value.trim();
          })
      );

    //------- DEFINE FLOW --------------------
    const defineFlow = new Setting(createFlows)
      .setName("Define your Flow...")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "How do you want to define your Flow?",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "Changing modes doesn't clear the input mask, but only values of the active mask will be considered.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "If you don't enter any criteria, your enitre vault will be included.",
          });
        })
      );

    const radioButtonContainer = defineFlow.controlEl.createDiv({
      cls: "radio-button-group",
    });
    const buttons: { [key: string]: ButtonComponent } = {};

    // -------- Bookmarks button ---------------
    buttons.bookmarks = new ButtonComponent(radioButtonContainer)
      .setButtonText("... by a bookmark group")
      .setClass("settings-radio-button")
      .onClick(() => {
        this.flowDefVariables.definitionMode = "bookmarks";
        this.flowDefVariables.previewUsed = false;
        this.radioButtonManager(buttons.bookmarks, buttons.foldersTagsProps);
        chooseBookmarks.settingEl.show(); // Show bookmark settings
        iHateLayoutingWithHTMLAndCSS("hide");
      });

    // -------- Paths and properties button ---------------
    buttons.foldersTagsProps = new ButtonComponent(radioButtonContainer)
      .setButtonText("... by folder, tags, properties")
      .setClass("settings-radio-button")
      .onClick(() => {
        this.flowDefVariables.definitionMode = "pathsTagsProps";
        this.flowDefVariables.previewUsed = false;
        this.radioButtonManager(buttons.foldersTagsProps, buttons.bookmarks);
        iHateLayoutingWithHTMLAndCSS("show");
        chooseBookmarks.settingEl.hide();
      });

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
    chooseBookmarks.addText((chooseFlowFolder) =>
      chooseFlowFolder.onChange(async (value) => {
        this.flowDefVariables.previewUsed = false;
        this.flowDefVariables.flowCookbook.bookmarkGroup = value.trim();
      })
    );

    // ---------- FOLDERS, TAGS AND PROPERTIES INPUT ELEMENT -----------------------------------------

    // ------ function to show or hide all the paths, tags, properties elements ---------
    const iHateLayoutingWithHTMLAndCSS = (state: string) => {
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
      .addText((chooseSourceFolder) =>
        chooseSourceFolder.onChange(async (value) => {
          this.flowDefVariables.previewUsed = false;
          this.flowDefVariables.flowCookbook.folderIncluded = value;
        })
      );

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
      .addText((chooseExcludedFolders) =>
        chooseExcludedFolders.onChange(async (value) => {
          this.flowDefVariables.previewUsed = false;
          const folders = value;
          this.flowDefVariables.flowCookbook.folderExcluded = value.trim();
        })
      );

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
      .addText((chooseIncludedTags) =>
        chooseIncludedTags.onChange(async (value) => {
          this.flowDefVariables.previewUsed = false;
          this.flowDefVariables.flowCookbook.tagIncluded = value.trim();
        })
      );

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
      .addText((chooseExcludedTags) =>
        chooseExcludedTags.onChange(async (value) => {
          this.flowDefVariables.previewUsed = false;
          this.flowDefVariables.flowCookbook.tagExcluded = value.trim();
        })
      );

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
      .addText((chooseIncludedProperties) =>
        chooseIncludedProperties.onChange(async (value) => {
          this.flowDefVariables.previewUsed = false;
          this.flowDefVariables.flowCookbook.propertyIncluded = value.trim();
        })
      );

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
      .addText((chooseExcludedProperties) =>
        chooseExcludedProperties.onChange(async (value) => {
          this.flowDefVariables.previewUsed = false;
          this.flowDefVariables.flowCookbook.propertyExcluded = value.trim();
        })
      );

    // ----------- BUTTONS --------------------

    const previewButton = new ButtonComponent(containerEl);
    previewButton.buttonEl.setAttribute(
      "state",
      createOrEdit == "creating" ? "creating" : "editing"
    );
    previewButton
      .setButtonText("Preview your flow structure")
      .onClick(async (buttonEl: MouseEvent) => {
        const flowDefBasket: Types.flowDefBasket = {
          fdbCreateOrEditFlowName: this.flowDefVariables.createOrEditFlowName,
          fdbCreateOrEdit: createOrEdit,
          fdbDefinitionMode: this.flowDefVariables.definitionMode,
          fdbFlowCookbook: this.flowDefVariables.flowCookbook,
          fdbCleanCookbook: {},
          fdbSuccess: false,
        };
        await this.createFlowDefinition(flowDefBasket);
        this.flowDefVariables.previewUsed = true;
        if (flowDefBasket.fdbSuccess === true) {
          const previewModal = new Modals.previewModal(
            this.app,
            this.plugin,
            this.finalReceipe
          );
          previewModal.open();
        }
      });

    const saveButton = new ButtonComponent(containerEl);
    saveButton.buttonEl.setAttribute(
      "state",
      createOrEdit == "creating" ? "creating" : "editing"
    );
    saveButton
      .setButtonText("Save Flow definition")
      .onClick(async (buttonEl: MouseEvent) => {
        const flowDefBasket: Types.flowDefBasket = {
          fdbCreateOrEditFlowName: this.flowDefVariables.createOrEditFlowName,
          fdbCreateOrEdit: createOrEdit,
          fdbDefinitionMode: this.flowDefVariables.definitionMode,
          fdbFlowCookbook: this.flowDefVariables.flowCookbook,
          fdbCleanCookbook: {},
          fdbSuccess: false,
        };
        if (!this.flowDefVariables.previewUsed) {
          await this.createFlowDefinition(flowDefBasket);
          if (flowDefBasket.fdbSuccess === true) {
            // reset all values
            this.flowDefVariables.reset();
            this.resetFlowDefBasket(flowDefBasket);
            this.plugin.saveSettings();
            this.display();
          }
        } else {
          // reset all values
          this.flowDefVariables.reset();
          this.resetFlowDefBasket(flowDefBasket);
          this.plugin.saveSettings();
          this.display();
        }
      });
    const flowDisplay = containerEl.createDiv({
      cls: "headline-container",
    });
    flowDisplay.createEl("h3", {
      text: "Your Flow definitions",
      cls: "headline-text",
    });
    for (let flow in this.plugin.settings.flows) {
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
      if (shownFlow.flowCookbook.tagIncluded != "") {
        included.push(`Tags: ${shownFlow.flowCookbook.tagIncluded}`);
      }
      console.log("tag included: ", shownFlow.flowCookbook.tagIncluded);
      if (shownFlow.flowCookbook.propertyIncluded != "") {
        included.push(`Props: ${shownFlow.flowCookbook.propertyIncluded}`);
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

      if (shownFlow.flowCookbook.tagExcluded != "")
        excluded.push(`Tags: ${shownFlow.flowCookbook.tagExcluded}`);
      console.log("tag excluded: ", shownFlow.flowCookbook.tagExcluded);
      if (shownFlow.flowCookbook.propertyExcluded != "") {
        excluded.push(`Props: ${shownFlow.flowCookbook.propertyExcluded}`);
      }
      console.log("props excluded: ", shownFlow.flowCookbook.propertyExcluded);
      const exclusionsJoined = excluded.join(" / ");
      exclusionString += exclusionsJoined;

      // --- THE DISPLAY ITSELF -------------------------------
      const flowShow = new Setting(flowDisplay)
        .setName(`${shownFlow.flowFileName}`)
        .setDesc(
          createFragment((desc) => {
            desc.createSpan({
              text: `Source: ${source}`,
            });
            if (inclusionString != "") {
              desc.createEl("br"); // Add line break
              desc.createSpan({
                text: `Inclusion criteria: ${inclusionString}`,
              });
            }
            if (exclusionString != "") {
              desc.createEl("br"); // Add line break
              desc.createSpan({
                text: `Exclusion criteria: ${exclusionString}`,
              });
            }
          })
        )
        .addButton((rebuildFlow) =>
          rebuildFlow.setButtonText("(Re)build").onClick(async () => {
            let key = "";
            shownFlow.flowReceipe.bookmarks
              ? (key = "bookmarks")
              : (key = "foldersTagsProps");
            this.flowBuilder(
              shownFlow.flowReceipe[key],
              shownFlow,
              flow,
              this.mapValueBasket
            );
          })
        )
        .addButton((editFlow) =>
          editFlow.setButtonText("Edit").onClick(async () => {
            // state check creating vs editing
          })
        )
        .addButton((deleteFile) =>
          deleteFile.setButtonText("Delete").onClick(async () => {
            // state check creating vs editing
          })
        );
    }
  }
}
