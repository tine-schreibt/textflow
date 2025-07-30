import { getAPI } from "obsidian-dataview";
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

interface ObsidianEditor extends Editor {
  cm?: EditorView;
}

// --- A class for the build progress notice (shown when rebuilding from settings tab)
class ProgressNotice {
  private plugin: TextFlow;
  private notice: Notice;
  private flowName: string;
  private symbolEmpty: string;

  constructor(flowName: string, plugin: TextFlow) {
    this.plugin = plugin;
    this.flowName = flowName;
    this.symbolEmpty = this.plugin.flowService.explorereDecoArray[0][0];
    this.notice = new Notice(
      `textFlow: Building ${this.flowName}: [${this.symbolEmpty.repeat(
        10
      )}] 0% \nFirst build might take longer.`
    );
  }

  updateProgress(current: number, total: number) {
    const symbolEmpty = this.plugin.flowService.explorereDecoArray[0][0];
    const symbolfilled = this.plugin.settings.explorerDecoStyle[1];
    const percent = Math.floor((current / total) * 100);
    const filled = Math.floor(percent / 10);
    const bar =
      "[" + symbolfilled.repeat(filled) + symbolEmpty.repeat(10 - filled) + "]";
    this.notice.setMessage(
      `Building ${this.flowName}: ${bar} ${percent}% \nFirst build might take longer.`
    );
  }

  close() {
    this.notice.hide();
  }
}

// the overlay for active flows
class LoadingOverlay {
  private app: App;
  private plugin: TextFlow;
  private progressEl: HTMLElement;
  private container: HTMLElement;
  private progressText: HTMLElement;
  private flowName: string;

  constructor(leaf: WorkspaceLeaf, flowName: string, app: App) {
    this.app = app;
    this.flowName = flowName;
    console.log("leaf.view constructor:", leaf.view?.constructor?.name);

    if (leaf.view instanceof MarkdownView)
      // which we have made certain
      this.container = leaf.view.contentEl.createDiv({
        cls: "textflow-loading-container",
      });

    const symbol = this.plugin.flowService.explorereDecoArray[0][0];
    this.progressText = this.container.createDiv({
      cls: "textflow-loading-text",
      text: `Building ${this.flowName}: ${symbol.repeat(
        10
      )} 0% \nFirst build might take longer.`,
    });
  }

  updateProgress(current: number, total: number) {
    const empty = this.plugin.flowService.explorereDecoArray[0][0]; // empty circle
    const full = this.plugin.settings.explorerDecoStyle[1]; // full version of what the user chose
    const percent = Math.floor((current / total) * 100);
    const filled = Math.floor(percent / 10);
    const bar = "[" + full.repeat(filled) + "empty".repeat(10 - filled) + "]";
    const text = `Building ${this.flowName}: ${bar} ${percent}% \nFirst build might take longer.`;
    this.progressText.setText(text);
  }

  ensureMarkdownViewFromLeaf = async (
    leaf: WorkspaceLeaf
  ): Promise<MarkdownView> => {
    if (leaf.view instanceof MarkdownView) return leaf.view;

    // Switch to any other leaf temporarily
    const leaves: WorkspaceLeaf[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      leaves.push(leaf);
    });
    const otherLeaf = leaves.find((l: WorkspaceLeaf) => l !== leaf);

    if (otherLeaf) {
      this.app.workspace.setActiveLeaf(otherLeaf, { focus: true });
      await sleep(50);
    }

    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    await sleep(50);

    if (leaf.view instanceof MarkdownView) return leaf.view;

    throw new Error("Leaf did not resolve to MarkdownView after re-activation");
  };

  sleep = (ms: number): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

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

  // -------- see if a system folder already -------
  //CHECKED AND TESTED
  checkSystemFolder = () => {
    const systemFolder = this.app.vault
      .getAllLoadedFiles()
      .find(
        (file) =>
          file instanceof TFolder && file.name === "TextFlow_SystemFolder"
      );
    return systemFolder instanceof TFolder ? systemFolder : null;
  };
  //^CHECKED AND TESTED

  createSystemFolder = async (newSystemFolderPath: string) => {
    try {
      // Ensure the folder exists, create it if necessary
      let newSystemFolder =
        this.app.vault.getAbstractFileByPath(newSystemFolderPath);
      if (!newSystemFolder) {
        await this.app.vault.createFolder(newSystemFolderPath);
        new Notice(
          `textFlow: TextFlow_SystemFolder created at ${newSystemFolderPath}`
        );
      } else if (!(newSystemFolder instanceof TFolder)) {
        throw new Error(`"${newSystemFolderPath}" exists but is not a folder.`);
      }
    } catch (e) {
      console.log(
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

  // --- RADIO BUTTON MANAGER -----------------
  radioButtonManager(
    selectedButton: ButtonComponent,
    unselectedButton1: ButtonComponent
  ) {
    // Update all buttons
    selectedButton.buttonEl.addClass("settings-radio-button-active");
    unselectedButton1.buttonEl.removeClass("settings-radio-button-active");
  }

  // --------- Make sure only valid file names can be entered as flow names
  // CHECKED AND TESTED
  isValidFlowName = (name: string): { valid: boolean; reason?: string } => {
    // Check for null/undefined names
    if (!name) {
      return {
        valid: false,
        reason: "textFlow: Please give your flow a name.",
      };
    }
    // if we're creating and a flow with the chosen name already exists
    if (
      this.plugin.settings.flowBuildBasket.createOrEdit != "edit" &&
      this.plugin.settings.flows[this.plugin.settings.flowBuildBasket.flowName]
    ) {
      return {
        valid: false,
        reason:
          "textFlow: A flow by this name already exists. Please rename your new flow or delete the old one.",
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
      return { valid: false, reason: "This name is reserved by the system" };
    }

    // Check for invalid characters - added backtick
    const invalidChars = /[<>:"/\\|?*#^[\]`\x00-\x1F]/;
    if (invalidChars.test(name)) {
      return {
        valid: false,
        reason:
          'textFlow: Please remove invalid characters from your flow name (? : # * < > [ ] / | \\ "  ^ `)',
      };
    }

    // Check for names ending with period or space (problematic on Windows)
    if (name.startsWith(".") || name.endsWith(".")) {
      return {
        valid: false,
        reason: "textFlow: A flow name cannot start or end with a period",
      };
    }

    return { valid: true };
  };
  // ^ CHECKED AND TESTED

  //CHECKED
  createFlowDefinition = async (
    flowBuildBasket: Types.flowBuildBasket
  ): Promise<void> => {
    // -------- Putting the finalRecipe together by fetching/filtering all paths
    try {
      // ----------- FINAL RECIPE FOR BOOKMARKS ---------------------
      if (flowBuildBasket.definitionMode === "bookmarks") {
        if (
          flowBuildBasket.flowCookbook.bookmarks === undefined ||
          flowBuildBasket.flowCookbook.bookmarks === ""
        ) {
          new Notice("textFlow: Please enter a bookmark group.");
          flowBuildBasket.success = false;
          return Promise.reject(Error);
        } else {
          const bookmarkPathArray = await this.getBookmarkPathsByGroupName(
            flowBuildBasket
          );
          flowBuildBasket.finalRecipe = { bookmarks: bookmarkPathArray };
        }

        // ------ FINAL RECIPE FOR PATH TAG PROPERTY -----------------------
      } else {
        await this.ensureNoUndefined(flowBuildBasket);
        const foldersTagsPropsPathArray = await this.getPathsByFoldersTagsProps(
          flowBuildBasket
        );
        flowBuildBasket.finalRecipe = {
          foldersTagsProps: foldersTagsPropsPathArray,
        };
      }
      // ---- Check for empty
      if (
        (flowBuildBasket.definitionMode === "bookmarks" &&
          flowBuildBasket.finalRecipe.bookmarks.length === 0) ||
        (flowBuildBasket.definitionMode == "foldersTagsProps" &&
          flowBuildBasket.finalRecipe.foldersTagsProps.length === 0)
      ) {
        new Notice(
          "textFlow: Your definition leads to an empty flow. Please check for typos or make your criteria less restrictive."
        );
        flowBuildBasket.success = false;
      }
      // get conflict info
      flowBuildBasket.conflictObject = this.conflictCollector(flowBuildBasket);
      flowBuildBasket.success = true;
    } catch (error) {
      new Notice(
        "textFlow: An error occurred while creating the finalRecipe for your flow. Please check the console for details."
      );
      flowBuildBasket.success = false;
    }
  };
  //^CHECKED

  // --- HELPER FUNCTIONS FOR FETCHING PATHS (AND CLEANING UP STUFF)
  // Also we're using the opportunity to get a clean cookbook (user input) for storage

  //CHECKED AND TESTED
  // ---- GET PATHS IN BOOKMARK GROUP ----------------
  getBookmarkPathsByGroupName = async (
    flowBuildBasket: Types.flowBuildBasket
  ) => {
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
    const collectPathsDepthFirst = (
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

    // ---- FILES FIRST
    const collectPathsFilesFirst = (
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
        flowBuildBasket.flowCookbook.bookmarksSortOrder === "depthFirst" ||
        flowBuildBasket.flowCookbook.bookmarksSortOrder === undefined
      ) {
        bookmarkedNotePathsArray = await collectPathsDepthFirst(
          finalGroup.items,
          flowBuildBasket,
          groupPathArray[groupPathArray.length - 1]
        );
        return Promise.resolve(bookmarkedNotePathsArray);
      } else if (
        flowBuildBasket.flowCookbook.bookmarksSortOrder === "filesFirst"
      ) {
        bookmarkedNotePathsArray = await collectPathsFilesFirst(
          finalGroup.items,
          flowBuildBasket,
          groupPathArray[groupPathArray.length - 1]
        );
        return Promise.resolve(bookmarkedNotePathsArray);
      } else {
        bookmarkedNotePathsArray = await collectPathsPreserveOrder(
          finalGroup.items,
          flowBuildBasket
        );
        return Promise.resolve(bookmarkedNotePathsArray);
      }
    } else {
      new Notice(
        "textFlow: Please check the name of the bookmark group you submitted"
      );
      return Promise.reject(Error);
    }
  };
  //^CHECKED AND TESTED

  // --- GET ALL PATHS FROM FOLDER TAG PROPERTY ---------------------------
  // But first we snappily ensure we don't have undefineds and make the ! type assertion later on safe to use
  //^CHECKED AND TESTED
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
    this.plugin.saveSettings();
    return Promise.resolve();
  };
  //^CHECKED AND TESTED

  // --- Function to get the paths -------
  //CHECKED AND TESTED
  getPathsByFoldersTagsProps = async (
    flowBuildBasket: Types.flowBuildBasket
  ) => {
    const dv = getAPI();
    if (!dv) {
      new Notice(
        "textFlow: Dataview API not available. Please make sure you have installed the dataview plugin."
      );
      return Promise.reject(Error);
    }
    // unpack into shorthand for easier reading
    const shCookbook = flowBuildBasket.flowCookbook;
    // ---- Pre-flight checks and cleanup --------------

    //--- INCLUDED FOLDER - only one path; notify if multiple
    let cleanInclusionPath: string = "";
    const folderInclusionArray = shCookbook.folderIncluded.split(",");
    let excludeSubfolders = false;
    if (folderInclusionArray.length > 1) {
      new Notice(
        "textFlow: Folder inclusion can only contain a single folder."
      );
    } else {
      // Clean up the whole "" and \ stuff we have to add for Dataview so rebuilds don't accumulate it
      cleanInclusionPath = shCookbook.folderIncluded
        .replace(/["\\\s]/g, "")
        .replace(/\/+/g, "/") // Replace multiple forward slashes with single ones
        .trim();
      // check for trailing slash, because normalizePath will eat it
      if (
        cleanInclusionPath != "/" &&
        cleanInclusionPath != "//" &&
        cleanInclusionPath != "."
      ) {
        excludeSubfolders = cleanInclusionPath.endsWith("/");
      }
      // Normalize
      cleanInclusionPath = normalizePath(cleanInclusionPath);
      // and because all that cleaning STILL doesn't get rid of "//":
      if (shCookbook.folderIncluded === "//") {
        shCookbook.folderIncluded = "/";
      }
      // save path with trailing slash
      if (excludeSubfolders) {
        flowBuildBasket.flowCookbook.folderIncluded = `${cleanInclusionPath}/`;
        this.plugin.saveSettings();
      } else {
        flowBuildBasket.flowCookbook.folderIncluded = `${cleanInclusionPath}`;
        this.plugin.saveSettings();
      }

      // dataview likes paths only with extra garnish
      flowBuildBasket.dataviewSearchPath =
        cleanInclusionPath === "" ||
        cleanInclusionPath === "/" ||
        cleanInclusionPath === "root"
          ? "" // Empty string in Dataview queries means "search everywhere"
          : `\"${cleanInclusionPath}\"`; // For specific paths, we need to wrap in quotes
    }

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
      flowBuildBasket.flowCookbook.folderExcluded =
        cleanFolderExclusionArray.join(", ");
    } else {
      cleanFolderExclusionArray.push("");
      flowBuildBasket.flowCookbook.folderExcluded = "";
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
    flowBuildBasket.flowCookbook.tagsIncluded =
      cleanTagInclusionArray.join(", ");
    const cleanTagExclusionArray = tagCleanup(shCookbook.tagsExcluded);
    flowBuildBasket.flowCookbook.tagsExcluded =
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

    let cleanPropertiesExclusionArray = propertyCleanup(
      shCookbook.propsExcluded
    );

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

      // then recurse into subfolders, if we don't exclude them
      for (const subfolder of folders) {
        buildDepthFirstFileTree(subfolder);
      }

      // Always process files in current folder
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
      // then recurse into subfolders, if we don't exclude them
      for (const child of children) {
        if (child instanceof TFolder) {
          buildFilesFirstFileTree(child);
        }
      }
    };

    // Build the complete file tree (which puts results in fileTreeArray)
    this.plugin.settings.flowBuildBasket.flowCookbook
      .pathsTagsPropertiesSortOrder === "depthFirst" ||
    this.plugin.settings.flowBuildBasket.flowCookbook
      .pathsTagsPropertiesSortOrder === undefined
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
      flowBuildBasket.flowCookbook.folderIncluded != "/" &&
      flowBuildBasket.flowCookbook.folderIncluded.endsWith("/")
    ) {
      allNotes = allNotes.filter((page: Types.DVNote) =>
        isDirectChild(
          page.file.path,
          flowBuildBasket.flowCookbook.folderIncluded.slice(0, -1)
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
          new Notice(
            "textFlow: Please check your included properties for typos."
          );
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
          new Notice(
            "textFlow: Please check your excluded properties for typos."
          );
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
  //^CHECKED AND TESTED

  // ----- Save the stuff we just put together --------------
  //CHECKED AND TESTED
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
      flowName: flowBuildBasket.flowName,
      flowFilePath: normalizePath(
        `${this.plugin.settings.systemFolderPath}/${flowBuildBasket.flowName}.md`
      ),
      definitionMode: flowBuildBasket.definitionMode,
      flowCookbook: flowBuildBasket.flowCookbook,
      flowRecipe: flowBuildBasket.finalRecipe, // { defMode: pathArray }
      folderTitles: flowBuildBasket.folderTitles,
      isFreshBuild: true,
      flowBuilt: false,
      flaggedForRebuild: false,
      conflictObject: flowBuildBasket.conflictObject,
      activeRegions: flowBuildBasket.activeRegions,
      persistentCursors: flowBuildBasket.persistentCursors,
      unsyncedRegionsArray: [],
      flowMap: {},
    };
    await this.plugin.saveSettings();
  };
  //^CHECKED AND TESTED

  // ------ function that checks if flows overlap
  //CHECKED AND TESTED
  conflictCollector = (flowBuildBasket: Types.flowBuildBasket) => {
    const conflictObject: Types.ConflictObject = {};
    const key1 = Object.keys(flowBuildBasket.finalRecipe)[0];
    if (Object.keys(this.plugin.settings.flows).length >= 1) {
      flowLoop: for (let flowName in this.plugin.settings.flows) {
        if (flowName != flowBuildBasket.flowName) {
          const key2 = Object.keys(
            this.plugin.settings.flows[flowName].flowRecipe
          )[0];
          for (let path of flowBuildBasket.finalRecipe[key1]) {
            if (
              !path.startsWith("#") &&
              this.plugin.settings.flows[flowName].flowRecipe[key2].includes(
                path
              )
            ) {
              if (!conflictObject[flowName]) {
                conflictObject[flowName] = {};
              }
              conflictObject[flowName][path] = true;
            }
          }
        }
      }
    }
    return conflictObject;
  };
  //^CHECKED AND TESTED

  // ----------------- sync conflicts

  //CHECKED AND TESTED
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
  //^CHECKED AND TESTED

  // --- Reset flowBuildBasket -------------
  resetFlowBuildBasket = async (
    resetFlowBuildBasket: Types.flowBuildBasket
  ) => {
    resetFlowBuildBasket.createOrEdit = "create";
    resetFlowBuildBasket.dataviewSearchPath = "";
    resetFlowBuildBasket.previewUsed = false;
    resetFlowBuildBasket.success = false;
    resetFlowBuildBasket.flowName = "";
    resetFlowBuildBasket.definitionMode = "";
    resetFlowBuildBasket.folderTitles = true;
    resetFlowBuildBasket.flowCookbook = {};
    resetFlowBuildBasket.finalRecipe = {};
    resetFlowBuildBasket.conflictObject = {};
    resetFlowBuildBasket.activeRegions = {};
    resetFlowBuildBasket.persistentCursors = {};
  };

  // CHECKED AND TESTED
  // ------ The function that handles everything necessary to (re)build a flow
  rebuildFlow = async (flowName: string, caller: string) => {
    const flowReBuildBasket: Types.flowBuildBasket = {
      // rebuild specific properties
      createOrEdit: "",
      dataviewSearchPath: "",
      previewUsed: false,
      success: false,
      // properties that will be transferred to the actual flow object
      flowName: this.plugin.settings.flows[flowName].flowName,
      definitionMode: this.plugin.settings.flows[flowName].definitionMode,
      folderTitles: this.plugin.settings.flows[flowName].folderTitles,
      flowCookbook: this.plugin.settings.flows[flowName].flowCookbook,
      finalRecipe: {},
      conflictObject: this.plugin.settings.flows[flowName].conflictObject,
      activeRegions: this.plugin.settings.flows[flowName].activeRegions,
      persistentCursors: this.plugin.settings.flows[flowName].persistentCursors,
    };

    // do the thing
    await this.createFlowDefinition(flowReBuildBasket);

    // exit; error messages are sent by createFlowDefinition
    if (!flowReBuildBasket.success) {
      // clean up and save
      this.resetFlowBuildBasket(flowReBuildBasket);
      this.plugin.saveSettings();
      return;
    }

    // do the other thing
    await this.writeFlowDef(this.plugin.settings, flowReBuildBasket);

    // update conflicts, reset flag, clean up the basket
    await this.syncConflictObjects(flowReBuildBasket); // null unsavedRegions
    this.plugin.settings.flows[flowName].flaggedForRebuild = false;
    await this.resetFlowBuildBasket(flowReBuildBasket);
    await this.plugin.saveSettings();

    // Get a fresh reference now that we've written the def
    const updatedFlow = this.plugin.settings.flows[flowName];

    // ---------- THE ACTUAL FLOW FILE CREATION ----------------
    // the object that keeps track of stuff and shuttles values between the various parts of the function
    let mapValueBasket: Types.mapValueBasket = {
      concatenatedFileContents: "",
      initialIteration: true,
      identifier: "0",
      flowOrder: 0,
      UID: "",
      singleFileContent: "",
      currentEnd: 0,
      idDivider: "",
    };

    // for some reason, using definitionMode here doesn't work
    let key = "";
    updatedFlow.flowRecipe.bookmarks
      ? (key = "bookmarks")
      : (key = "foldersTagsProps");

    // this is to make sure we got the latest version of everything
    await this.plugin.syncAllLeaves();

    // Call the build function; didn't think we'd get here...
    await this.flowBuilder(
      updatedFlow.flowRecipe[key],
      updatedFlow,
      flowName,
      mapValueBasket,
      caller
    );

    // null the basket, just to be thorough.
    mapValueBasket = {
      concatenatedFileContents: "",
      initialIteration: true,
      identifier: "0",
      flowOrder: 0,
      UID: "",
      singleFileContent: "",
      currentEnd: 0,
      idDivider: "",
    };

    this.plugin.saveSettings();
  };
  // ^CHECKED AND TESTED

  // CHECKED AND TESTED
  // ------ The flowBuilder --------------------------
  flowBuilder = async (
    recipeArray: string[],
    flow: Types.FlowDef,
    flowName: string,
    mapValueBasket: Types.mapValueBasket,
    caller: string
  ): Promise<void> => {
    // setting this to disable IDDiverder protection, so it doesn't block the editor refresh
    this.plugin.isRebuilding = true;
    // pre-flight check for SystemFolder
    let systemFolder = this.checkSystemFolder();
    if (!systemFolder) {
      new Notice("textFlow: TextFlow_SystemFolder not found.");
      return;
    }

    // ---- Progress stuff.

    type ProgressVisualizer = ProgressNotice;

    // prepare variable for the progress notice
    // in case the call came from inside the...
    // settingsTab
    let progressToast: ProgressVisualizer | null = null;
    if (caller === "settingsTab" || caller === "switcher") {
      progressToast = new ProgressNotice(flowName, this.plugin);
    }

    // Get an object started for the rest of cases
    let progressOverlays: { [key: string]: LoadingOverlay } = {};
    if (caller != "settingsTab") {
      if (this.plugin.settings.activeFlowObject[flowName]) {
        Object.keys(this.plugin.settings.flows[flowName].activeRegions).forEach(
          async (leafID) => {
            const leaves = this.app.workspace.getLeavesOfType("markdown");
            const leaf = leaves.find(
              (newLeaf) => (newLeaf as any).id === leafID
            );
            if (leaf) {
              if (!(leaf instanceof MarkdownView)) {
                const flowFile = this.app.vault.getAbstractFileByPath(
                  this.plugin.settings.flows[flowName].flowFilePath
                );
                if (flowFile instanceof TFile) {
                  await leaf.openFile(flowFile);
                }
              }
              progressOverlays[leafID] = new LoadingOverlay(
                leaf,
                flowName,
                this.app
              );
            }
          }
        );
      }
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
        console.log("Extracted frontmatter:", frontmatter);
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
          progressToast.updateProgress(counter, total);
        }
      } else {
        Object.keys(progressOverlays).forEach((leafID) => {
          progressOverlays[leafID].updateProgress(counter, total);
        });
      }
      if (counter === total) {
        if (caller === "settingsTab") {
          if (progressToast) {
            progressToast.close();
          }
        } else {
          Object.keys(progressOverlays).forEach((leafID) => {
            progressOverlays[leafID].remove();
          });
        }
      }

      // --- The actual handling of content ----------
      // If the ingredient (array entry) is a title
      if (ingredient.startsWith("#")) {
        mapValueBasket.flowOrder++;
        await this.createInvisibleUID(mapValueBasket);
        // make the proper divider
        const divider = `\r${mapValueBasket.UID}<hr>\r\r`;

        // unencoded divider for debugging purposes (there's also debugUID())
        // const divider = `\r${mapValueBasket.identifier}<hr>\r\r`;
        mapValueBasket.idDivider = divider.replace(/\\r/g, "\r");

        // stripping # so Outline will look as expected
        const ingredientName = ingredient.replace("#", "");

        // The object that holds the info about the folder/group
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
      // if the ingredient is a path
      else {
        mapValueBasket.flowOrder++;
        await this.createInvisibleUID(mapValueBasket);

        // unencoded divider for debugging purposes (there's also debugUID())
        // const divider = `\r${mapValueBasket.identifier}<hr>\r\r`;
        const divider = `\r${mapValueBasket.UID}<hr>\r\r`;
        mapValueBasket.idDivider = divider.replace(/\\r/g, "\r");

        // get the note
        const note = this.app.vault.getAbstractFileByPath(ingredient);
        if (!note) {
          new Notice(`textFlow: The note at ${ingredient} couldn't be found.`);
          return;
        }
        // type check
        if (note instanceof TFile) {
          const modificationTimestamp = Date.now();
          let fileContent: string = await this.app.vault.read(note);

          // check if there are UUIDs in there due to a sync fuckup
          let match;
          const regex =
            /[\u200B\u200C\u200D\u2060\u2061\u2062\u2063\u2064\uFEFF\u00A0]{46}/;

          if ((match = regex.exec(fileContent) !== null)) {
            new Notice(
              `textFlow: The note\n` +
                `${ingredient}\n` +
                `of flow\n` +
                `${flowName}\n` +
                `contains at least one UUID.\n` +
                `This can come about due to sync errors.\n` +
                `How to proceed now: \n` +
                `1. Export ${flowName} to prevent any loss of edits and backup your vault, just to be safe.\n` +
                `2. Check the mentioned note (search for '<hr>') for any copied over regions and cut them out.\n` +
                `3. Check the source notes of these regions to make sure they are up to date; if they aren't, copy/paste the latest version from the flow.\n` +
                `To make all of this easier, turn off navigation via file explorer (in the settings tab or command palette).\n` +
                `Afterwards try another rebuild.\n`,
              0
            );

            // remove the overlay/dismiss the progress toast
            if (caller === "settingsTab") {
              if (progressToast) {
                progressToast.close();
              }
            } else {
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

          // put all info in the note object
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

      this.safeCreateFile(
        this.app.vault,
        flowFilePath,
        mapValueBasket.concatenatedFileContents
      );
      // remove the flag
      this.plugin.isRebuilding = false;
      this.plugin.saveSettings();
    }
  };

  // ^CHECKED AND TESTED

  // CHECKED AND TESTED
  // ---- Like it says....
  createInvisibleUID = async (mapValueBasket: Types.mapValueBasket) => {
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
    mapValueBasket.identifier = UUID;
    mapValueBasket.UID = paddedBase9Identifier;
  };

  // ^CHECKED AND TESTED

  // CHECKED AND TESTED

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
  // ^CHECKED AND TESTED

  // CHECKED AND TESTED
  scrollToPos(editor: Types.ObsidianEditor, cursorPos: number) {
    const cmEditor = editor.cm;
    let text = "";
    if (cmEditor) {
      text = cmEditor.state.doc.toString();
    }
    if (cursorPos !== undefined && cursorPos >= 0 && cmEditor) {
      // Ensure position is not negative
      const line = cmEditor.state.doc.lineAt(Math.max(0, cursorPos));
      const targetPos = line.from;
      cmEditor.dispatch({
        selection: { anchor: targetPos, head: targetPos },
        effects: EditorView.scrollIntoView(targetPos, {
          y: "center",
          yMargin: 10,
        }),
        userEvent: "select.pointer",
      });
      // Explicitly focus the editor
      cmEditor.focus();
    }
  }
  // ^CHECKED AND TESTED

  safeCreateFile = async (vault: Vault, path: string, content: string) => {
    try {
      const existingFile = vault.getAbstractFileByPath(path);
      if (existingFile instanceof TFile) {
        await vault.modify(existingFile, content);
      } else {
        await vault.create(path, content);
      }
    } catch (error) {
      console.error(`Failed to create/modify file at ${path}:`, error);
      throw error;
    }
  };

  //CHECKED AND TESTED

  selectActiveRegion = async (
    flowName: string,
    path: string,
    text: string,
    editor: Editor
  ) => {
    const map = this.plugin.settings.flows[flowName].flowMap;

    const startPos = await this.plugin.findStartOfRegion(
      this.plugin.settings.flows[flowName],
      this.plugin.settings.flows[flowName].flowMap[path].flowOrder,
      text
    );
    const endPos = text.indexOf(map[path].UID) - 1; // subtract 1 for the \r before the UID

    if (startPos && endPos) {
      if ("cm" in editor) {
        // Type guard for ObsidianEditor
        const cmEditor = (editor as any).cm;
        if (cmEditor) {
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
    }
  };

  updateScrollbarVisibility() {
    // Handle all leaves
    // add hider if all are hidden
    if (this.plugin.settings.hideScrollbar === "all") {
      const body = document.body;
      body.classList.remove("hide-scrollbar");
      body.classList.add("hide-scrollbar");
    } else {
      // otherwise remove the hiding
      const body = document.body;
      body.classList.remove("hide-scrollbar");
    }

    // Handle flow leaves
    // get all the leaves and check they're valid
    const allLeaves = this.app.workspace.getLeavesOfType("markdown");
    for (let leaf of allLeaves) {
      if (leaf.view instanceof MarkdownView && leaf.view.file) {
        // check if it's a flow
        const flowName = this.plugin.isFlowFile(leaf.view.file.path);
        if (!flowName) return;

        // if only flows are hidden, add the hiding
        if (
          this.plugin.settings.hideScrollbar === "flows" &&
          !leaf.view.containerEl.hasClass("hide-scrollbar")
        ) {
          leaf.view.containerEl.addClass("hide-scrollbar");
        } else {
          // if none or all are hidden, remove it
          leaf.view.containerEl.removeClass("hide-scrollbar");
        }
      }
    }
  }

  getTimestamp = (): string => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${year}-${month}-${day}_${hours}-${minutes}`;
  };

  // The arrays with the deco stuff
  explorereDecoArray: Types.DecorationEntry[] = [
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

    ["✿", "❀", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["✿", "❀", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["✿", "❀", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["✿", "❀", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

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

    ["!", "?", "large-high-contrast-neutral", "large-high-contrast-unsynced"],
    ["!", "?", "large-low-contrast-neutral", "large-low-contrast-unsynced"],
    ["!", "?", "small-high-contrast-neutral", "small-high-contrast-unsynced"],
    ["!", "?", "small-low-contrast-neutral", "small-low-contrast-unsynced"],

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
