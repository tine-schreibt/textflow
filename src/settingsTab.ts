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
import TextFlow from "main";
import * as Types from "./types";

export class TextFlowSettingsTab extends PluginSettingTab {
  plugin: TextFlow;

  constructor(app: App, plugin: TextFlow) {
    super(app, plugin);
    this.plugin = plugin;
  }

  //#######################################################################
  //###########################    Functions   ############################
  //#######################################################################

  private newSystemFolderCreation = async (newSystemFolderPath: string) => {
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
  private findSystemFolder = () => {
    const systemFolder = this.app.vault
      .getAllLoadedFiles()
      .find(
        (file) =>
          file instanceof TFolder && file.name === "TextFlow_SystemFolder"
      );
    return systemFolder instanceof TFolder ? systemFolder : null;
  };

  // ---------- RADIO BUTTON MANAGER -----------------

  private radioButtonManager(
    selectedButton: ButtonComponent,
    unselectedButton1: ButtonComponent
  ) {
    // Update all buttons
    selectedButton.buttonEl.addClass("settings-radio-button-active");
    unselectedButton1.buttonEl.removeClass("settings-radio-button-active");
  }

  // ------------- FETCHING PATHS AND ALSO CLEANING UP STUFF
  // so we're using the opportunity to get a clean cookbook for storage
  cleanCookbook: { [key: string]: string } = {};

  // -------------- GET ALL PATHS IN BOOKMARK GROUP ----------------
  private getBookmarkPathsByGroupName(groupName: string) {
    // prepare path for further processing:
    const cleanPath = groupName.replace(/\/+/g, "/");
    this.cleanCookbook.bookmarks = cleanPath;
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

    // navigate to the group and dissect out its contents
    function navigateToGroup(
      items: Types.BookmarkItem[],
      pathParts: string[]
    ): Types.BookmarkItem | null {
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
    }

    const finalGroup = navigateToGroup(bookmarkItems, groupPathArray);

    // Recursively collect file paths
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

    if (finalGroup?.items) {
      bookmarkedNotePathsArray.push(`§${finalGroup.title ?? "Unnamed Group"}`); // push name of main group
      collectPaths(finalGroup.items);
    } else {
      new Notice("Please check the name of the bookmark group you submitted");
    }
    return bookmarkedNotePathsArray;
  }

  // --------------------- GET ALL PATHS FROM FOLDER TAG PROPERTY -------------------
  // Helper function for including folder titles
  findFolderTitles = (notePathArray: string[], folderIncluded: string) => {
    let lastParentFolder = "";
    let currentParentFolder = "";
    let arrayWithFolderTitles: string[] = [];
    if (folderIncluded === "") {
      arrayWithFolderTitles.push(`§${this.app.vault.getName()}`);
    }
    for (let i = 0; notePathArray.length > i; i++) {
      // split the path into an array, then get the second-to-last entry or empty string
      let parentFolderPathArray = notePathArray[i].split("/");
      currentParentFolder =
        parentFolderPathArray.length > 1
          ? parentFolderPathArray[parentFolderPathArray.length - 2]
          : "";
      if (currentParentFolder != lastParentFolder) {
        arrayWithFolderTitles.push(`§${currentParentFolder}`);
        lastParentFolder = currentParentFolder;
      }
      arrayWithFolderTitles.push(notePathArray[i]);
    }
    return arrayWithFolderTitles;
  };

  private getPathsByFoldersTagsProps = (
    folderIncluded: string, //
    folderExcluded: string,
    tagIncluded: string,
    tagExcluded: string,
    propertyIncluded: string,
    propertyExcluded: string
  ) => {
    const dv = getAPI();
    if (!dv) {
      new Notice("Dataview API not available!");
      return [];
    }

    // ----------- Pre-flight checks and cleanup --------------

    // INCLUDED FOLDER - only one path; notify if multiple
    let cleanInclusionPath: string = "";
    const folderInclusionArray = folderIncluded.split(",");
    if (folderInclusionArray.length > 1) {
      new Notice("Folder inclusion can only contain a single folder.");
    } else {
      cleanInclusionPath = normalizePath(folderIncluded.trim());
      this.cleanCookbook.folderIncluded = cleanInclusionPath;
    }
    // EXCLUDED FOLDERS - clean up paths
    let cleanFolderExclusionArray: string[] = [];
    const folderExclusionArray = folderExcluded.split(",");
    const nonEmptyFolderExclusionArray = folderExclusionArray
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
    for (let i = 0; i < nonEmptyFolderExclusionArray.length; i++) {
      let cleanExcludedPath = normalizePath(
        nonEmptyFolderExclusionArray[i].trim()
      );
      cleanFolderExclusionArray.push(cleanExcludedPath);
      this.cleanCookbook.folderExcluded = cleanFolderExclusionArray.join(", ");
    }
    // INCLUDED and EXCLUDED TAGS - strip #
    const tagCleanup = (tagString: string) => {
      let cleanTagArray: string[] = [];
      const tagArray = tagString.split(",");
      const nonEmptyTagArray = tagArray
        .map((x) => x.trim())
        .filter((x) => x.length > 0);
      for (let i = 0; i < nonEmptyTagArray.length; i++) {
        let cleanTag = nonEmptyTagArray[i].replace(/^#/, "");
        cleanTagArray.push(cleanTag);
      }
      return cleanTagArray;
    };
    const cleanTagInclusionArray = tagCleanup(tagIncluded);
    this.cleanCookbook.tagIncluded = cleanTagInclusionArray.join(", ");
    const cleanTagExclusionArray = tagCleanup(tagExcluded);
    this.cleanCookbook.tagExcluded = cleanTagExclusionArray.join(", ");

    // INCLUDED and  EXCLUDED PROPERTIES - clean up and split at =
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
    let cleanPropertiesInclusionArray = propertyCleanup(propertyIncluded);
    this.cleanCookbook.propertyIncluded =
      cleanPropertiesInclusionArray.join(", ");
    let cleanPropertiesExclusionArray = propertyCleanup(propertyExcluded);
    this.cleanCookbook.propertyExcluded =
      cleanPropertiesExclusionArray.join(", ");

    // CALLING DATAVIEW API to fetch all included, then filter
    const allNotes = dv.pages(cleanInclusionPath);
    const filteredNotes = allNotes.where(
      (note: Types.DVNote) =>
        // exlude folders
        !cleanFolderExclusionArray.some((path) =>
          note.file.path.startsWith(path)
        ) &&
        // include tags
        cleanTagInclusionArray.every((includedTag) =>
          note.file.tags.includes(includedTag)
        ) &&
        // exclude tags
        !cleanTagExclusionArray.some((excludedTag) =>
          note.file.tags.includes(excludedTag)
        ) &&
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

    const filteredPathArray = Array.from(filteredNotes).map(
      (note) => (note as Types.DVNote).file.path
    );
    const pathArrayWithFolderTitles = this.findFolderTitles(
      filteredPathArray,
      normalizePath(folderIncluded.trim())
    );
    return pathArrayWithFolderTitles;
  };

  // !!! FOLDER TITLES !!!

  // ---------- flow creation ----------------
  private buildFlatFlowMap = async (
    folderPath: string,
    flowName: string
  ): Promise<void> => {
    const flow: Types.FlowDef = this.plugin.settings.flows[flowName] || {
      sourcePath: folderPath,
      flowFileName: flowName,
      divider: "<hr>",
      flowMap: {}, // Flat map
    };
    let mapValueBasket: Types.mapValueBasket = {
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

    const rootFolder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!(rootFolder instanceof TFolder) || !rootFolder) {
      console.error(`There's a problem with ${folderPath}`);
      new Notice(`Please check if ${folderPath} exists and is a folder`);
      return;
    }

    // Start processing from the root folder
    await this.updateFlatMap(rootFolder, flow, mapValueBasket);
    // Save back the updated FlowDef
    this.plugin.settings.flows[flowName] = flow;

    // Check if temp folder exists before writing
    const systemFolder = this.app.vault.getAbstractFileByPath(
      `${this.plugin.settings.systemFolderPlace}/TextFlow_SystemFolder`
    );
    if (systemFolder && systemFolder instanceof TFolder) {
      const tempFilePath = `${this.plugin.settings.systemFolderPlace}/TextFlow_SystemFolder/${flowName}.md`;
      this.app.vault.adapter.write(
        tempFilePath,
        mapValueBasket.concatenatedFileContents
      );
    } else {
      new Notice("Please create a temp folder first.");
      return;
    }
    // save temp file
    this.plugin.saveSettings();
  };

  // ------------ actual flat map logic -------
  private updateFlatMap = async (
    item: TAbstractFile,
    flow: Types.FlowDef,
    mapValueBasket: Types.mapValueBasket
  ): Promise<void> => {
    const fullPath = item.path;
    const itemName = item.name;

    new Notice("Building flow...");
    // Calculate new positions once
    if (
      item instanceof TFolder &&
      item.path !==
        this.plugin.settings.systemFolderPlace + "/TextFlow_SystemFolder"
    ) {
      mapValueBasket.flowOrder++; // increment counter if needed
      await this.createInvisibleUID(mapValueBasket);
      // make the proper divider
      const divider = `\r${mapValueBasket.UID}<hr>\r\r`;

      // make unencoded divider for debugging
      // const divider = `\r${mapValueBasket.timestamp}<hr>\r\r`;

      mapValueBasket.idDivider = divider.replace(/\\r/g, "\r");

      flow.flowMap[fullPath] = {
        type: "folder",
        path: fullPath,
        itemName: item.name,
        UID: mapValueBasket.UID,
        timestamp: mapValueBasket.timestamp,
        flowOrder: mapValueBasket.flowOrder,
        minLength: itemName.length,
        lengthPlusDividers: itemName.length + mapValueBasket.idDivider.length,
        startEndInFlow: {
          start: mapValueBasket.initialIteration
            ? 0
            : mapValueBasket.concatenatedFileContents.length,
          end: itemName.length + mapValueBasket.idDivider.length,
        },
      } as Types.SourceFileObject;
      mapValueBasket.initialIteration = false;

      // Add content with marker before divider
      mapValueBasket.concatenatedFileContents += `<center><b>${itemName}</b></center>${mapValueBasket.idDivider}`;
      mapValueBasket.currentEnd =
        mapValueBasket.concatenatedFileContents.length;
      flow.flowMap[fullPath].startEndInFlow.end = mapValueBasket.currentEnd;

      for (const subItem of item.children) {
        await this.updateFlatMap(subItem, flow, mapValueBasket);
      }
    } else if (item instanceof TFile) {
      mapValueBasket.flowOrder++; // increment counter if needed
      const modificationTimestamp = Date.now();
      let fileContent: string = await this.app.vault.read(item);

      // Extract, fix or create YAML and separate it from other content
      // this also calls UID creation
      await this.manageYaml(item, mapValueBasket);
      // make the proper divider
      //const divider = `\r${mapValueBasket.UID}<hr>\r\r`;

      const divider = `\r${mapValueBasket.UID}<hr>\r\r`;
      mapValueBasket.idDivider = divider.replace(/\\r/g, "\r");

      fileContent = mapValueBasket.singleFileContent;

      // find and remove the title line; normalize
      const titleLine = `${item.name.replace(/\.md$/, "")}`;
      const normalize = (fileContent: string) =>
        fileContent.replace(/\uFEFF|\s+$/g, "").trim();
      const normalizedTitleLine = normalize(titleLine);
      const normalizedFileContent = normalize(fileContent);

      if (normalizedFileContent.startsWith(normalizedTitleLine)) {
        fileContent = fileContent
          .substring(normalizedTitleLine.length + 1)
          .trimStart();
      }

      flow.flowMap[fullPath] = {
        type: "file",
        path: fullPath,
        itemName: item.name,
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
      mapValueBasket.currentEnd =
        mapValueBasket.concatenatedFileContents.length;
      flow.flowMap[fullPath].startEndInFlow.end = mapValueBasket.currentEnd;
    } else {
      console.error("End of folder OR invalid file.");
    }
    this.plugin.saveSettings();
  };

  // -------------- manage YAML ------------------

  // ---------------- the actual handling of YAML -------
  private manageYaml = async (
    file: TFile,
    mapValueBasket: Types.mapValueBasket
  ) => {
    let foundUID = false;
    try {
      await this.app.fileManager.processFrontMatter(
        file,
        async (frontmatter) => {
          if (frontmatter?.TextFlowUID) {
            const timestampMatch =
              frontmatter.TextFlowUID.match(/【(\d{13,})】/);

            if (timestampMatch) {
              const [_, timestamp] = timestampMatch;
              mapValueBasket.timestamp = Number(timestamp);

              // look for complete yaml
              const completeYamldMatch = frontmatter.TextFlowUID.match(
                /(【\d{13,}】⟦[\u200B\u200C\u200D]{26,}⟧)/
              );
              if (completeYamldMatch) {
                const [_, timestamp, invisibleUID] = timestampMatch;
                mapValueBasket.UID = invisibleUID;
                // make the proper divider
                //const divider = `\r${encodedTimestamp}<hr>\r\r`;

                // make unencoded divider for debugging
                const divider = `\r${invisibleUID}<hr>\r\r`;
                mapValueBasket.idDivider = divider.replace(/\\r/g, "\r");
              } else {
                await this.reCreateInvisibleUID(timestamp, mapValueBasket);
              }
            } else {
              throw new Error(
                "TextFlow: Invalid UID format in properties.\n" +
                  "This file seems to be part of a flow but its UID is corrupted.\n" +
                  "Please restore from backup or remove TextFlowUID from properties to treat as new file."
              );
            }
          } else {
            // No TextFlowUID found, create one
            await this.createInvisibleUID(mapValueBasket);
            frontmatter.TextFlowUID = `【${mapValueBasket.timestamp}】⟦${mapValueBasket.UID}⟧`;
          }
        }
      );
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
    //###########################  Globals   ####################
    //#######################################################################

    //#######################################################################
    //###########################   Settings Tab   ##########################
    //#######################################################################

    const setUpTextFlow = containerEl.createDiv({
      cls: "headline-container",
    });

    // ###############   SET UP A SYSTEM FOLDER   ###########################
    const systemFolder = this.findSystemFolder();
    let newSystemFolderPlace = ""; // container for the new path
    // -------------------
    const setSystemFolder = new Setting(setUpTextFlow)
      .setName("Choose a place for TextFlow_SystemFolder")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "TextFlow needs a system folder to store its flows and snapshots.",
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
              const newPath = `${newSystemFolderPlace}/TextFlow_SystemFolder`;
              this.newSystemFolderCreation(newPath);
            } else {
              //Move SystemFolder
              try {
                const newPath = `${newSystemFolderPlace}/TextFlow_SystemFolder`;
                await this.app.vault.rename(systemFolder, newPath);
                // Update settings with new location
                this.plugin.settings.systemFolderPath = newPath;
                this.plugin.settings.systemFolderPlace = newSystemFolderPlace;
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
    let createOrEditFlowName: string = "";

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
            createOrEditFlowName = value.trim();
          })
      );

    //------- DEFINE FLOW --------------------
    let definitionMode = "";
    const flowCookbook: { [key: string]: string | undefined } = {};

    const defineFlow = new Setting(createFlows)
      .setName("Define your Flow...")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "How do you want to define your Flow?",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "Changing modes clears the input mask.",
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
        definitionMode = "bookmarks";
        this.radioButtonManager(buttons.bookmarks, buttons.pathsPropertiesTags);
        chooseBookmarks.settingEl.show(); // Show bookmark settings
        iHateLayoutingWithHTMLAndCSS("hide");
      });

    // -------- Paths and properties button ---------------
    buttons.pathsPropertiesTags = new ButtonComponent(radioButtonContainer)
      .setButtonText("... by folder, tags, properties")
      .setClass("settings-radio-button")
      .onClick(() => {
        definitionMode = "pathsTagsProps";
        this.radioButtonManager(buttons.pathsPropertiesTags, buttons.bookmarks);
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
        flowCookbook.bookmarkGroup = value.trim();
      })
    );

    // ---------- PATHS AND PROPERTIES INPUT ELEMENT -----------------------------------------

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
            text: "End path with / to exclude all subfolders.",
          });
        })
      )
      .addText((chooseSourceFolder) =>
        chooseSourceFolder.onChange(async (value) => {
          flowCookbook.folderIncluded = value;
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
          const folders = value;
          flowCookbook.folderExcluded = value;
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
          flowCookbook.tagIncluded = value.trim();
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
          flowCookbook.tagExcluded = value.trim();
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
          flowCookbook.propertyIncluded = value.trim();
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
          flowCookbook.propertyExcluded = value.trim();
        })
      );

    // -------  EXCLUDE SUBFOLDERS -----------------
    let createOrEditsourcePath: string = "";
    const TextFlow_SystemFolder = `${this.plugin.settings.systemFolderPlace}/TextFlow_SystemFolder`;
    let excludedFolders: string[] = [];

    // #############   excluded meta data   #########
    // #############   included meta data   #########

    // ----------- SAVE BUTTON --------------------

    // !!! SAVE DEFINITION STATE AND DEFINITION STATEMENTS FOR LATER EDITING !!!

    const previewButton = new ButtonComponent(containerEl);
    previewButton.buttonEl.setAttribute(
      "state",
      createOrEdit == "creating" ? "creating" : "editing"
    );
    previewButton
      .setButtonText("Verify flow")
      .onClick(async (buttonEl: MouseEvent) => {
        // Pre-flight check 01 - flowName
        if (createOrEditFlowName === "") {
          new Notice("Flow name can not be empty.");
          return;
        }
        if (
          createOrEdit === "create" &&
          this.plugin.settings.flows[createOrEditFlowName]
        ) {
          new Notice(
            `A flow with the name ${createOrEditFlowName} already exist. Please choose a different name or edit the existing flow.`
          );
          return;
        }

        // -------- Putting the finalReceipe together by fetching/filtering all paths
        try {
          // So finalReceipe is the mode as property and an array paths as value
          let finalReceipe: { [key: string]: string[] } = {};

          // ----------- FINAL RECEIPE FOR BOOKMARKS ---------------------
          if (definitionMode === "bookmarks") {
            if (flowCookbook.bookmarkGroup === undefined) {
              new Notice("Please enter at least one bookmark group.");
            } else {
              const paths = this.getBookmarkPathsByGroupName(
                  flowCookbook.bookmarkGroup
                ),
                finalReceipe = { bookmarks: paths };
            }

            // ------ FINAL RECEIPE FOR PATHTAGPROPERTY -----------------------
          } else {
            // if input field hasn't been touched, flowCookbook might miss some steps
            const preventUndefined = (thing: string | undefined) => {
              if (thing === undefined) return "";
              return thing;
            };
            // We call that, then hand it all over to getPathsByFoldersTagsProps
            const makePathTagPropertyReceipe = (
              folderIncluded: string | undefined,
              folderExcluded: string | undefined,
              tagIncluded: string | undefined,
              tagExcluded: string | undefined,
              propertyIncluded: string | undefined,
              propertyExcluded: string | undefined
            ) => {
              flowCookbook.folderIncluded = preventUndefined(
                flowCookbook.folderIncluded
              );
              flowCookbook.folderExcluded = preventUndefined(
                flowCookbook.folderExcluded
              );
              flowCookbook.tagIncluded = preventUndefined(
                flowCookbook.tagIncluded
              );
              flowCookbook.tagExcluded = preventUndefined(
                flowCookbook.tagExcluded
              );
              flowCookbook.propertyIncluded = preventUndefined(
                flowCookbook.propertyIncluded
              );
              flowCookbook.propertyExcluded = preventUndefined(
                flowCookbook.propertyExcluded
              );
              finalReceipe = {
                folderTagsProperties: this.getPathsByFoldersTagsProps(
                  flowCookbook.folderIncluded,
                  flowCookbook.folderExcluded,
                  flowCookbook.tagIncluded,
                  flowCookbook.tagExcluded,
                  flowCookbook.propertyIncluded,
                  flowCookbook.propertyExcluded
                ),
              };
            };
          }
          // Pre-flight check 02: finalReceipe array
          if (
            (finalReceipe.bookmarks && finalReceipe.bookmarks.length <= 1) ||
            (finalReceipe.folderTagsProperties &&
              finalReceipe.folderTagsProperties.length <= 1)
          ) {
            new Notice(
              "Your flow definition leads to an empty flow. Please edit it to be less restrictive"
            );
            return;
          }
          // -------- CREATE THE FLOW OBJECT -------------------------------
          this.plugin.settings.flows[createOrEditFlowName] = {
            flowCookbook: this.cleanCookbook, // cleaned up user input
            flowReceipe: finalReceipe, // mode as property, path array as value
            flowFileName: createOrEditFlowName, // Using the entered name
            flowFilePath: `${this.plugin.settings.systemFolderPlace}/TextFlow_SystemFolder/${createOrEditFlowName}.md`,
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

          this.plugin.saveSettings();
          // ----------- CALL THE PREVIEW MODAL ----------
        } catch (error) {
          console.error("Error preparing finalReceipe:", error);
          new Notice(
            "An error occurred while creating the finalReceipe for your flow. Check the console for details."
          );
        }
      });

    // ########### YOUR FLOWS ###################
    // rename flows, change flows, delete flows
  }
}
