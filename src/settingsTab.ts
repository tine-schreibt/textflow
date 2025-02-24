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

  private newTempFolderCreation = async (newTempFolderPath: string) => {
    try {
      // Ensure the folder exists, create it if necessary
      let newTempFolder =
        this.app.vault.getAbstractFileByPath(newTempFolderPath);
      if (!newTempFolder) {
        await this.app.vault.createFolder(newTempFolderPath);
        console.log(`Temp folder created at ${newTempFolderPath}`);
      } else if (!(newTempFolder instanceof TFolder)) {
        throw new Error(`"${newTempFolderPath}" exists but is not a folder.`);
      }
    } catch (e) {
      console.log(
        `Something went wrong when trying to create ${newTempFolderPath}: ${e}`
      );
    }
  };

  // ------------ prepare receipe for flow --------------
  private calculateExcludedItemsThenMakeMap = async (
    folderPath: string,
    flowName: string
  ): Promise<void> => {
    const flow: Types.FlowDef = this.plugin.settings.flows[flowName] || {
      sourcePath: folderPath,
      flowFileName: flowName,
      divider: `<hr>`,
      excludedFolders: [],
      includedMetaData: {},
      excludedMetaData: {},
      flowMap: {}, // Flat map
    };
  };

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
    const tempFolder = this.app.vault.getAbstractFileByPath(
      `${this.plugin.settings.tempFolderPlace}/TextFlow_SystemFolder`
    );
    if (tempFolder && tempFolder instanceof TFolder) {
      const tempFilePath = `${this.plugin.settings.tempFolderPlace}/TextFlow_SystemFolder/${flowName}.md`;
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
        this.plugin.settings.tempFolderPlace + "/TextFlow_SystemFolder"
    ) {
      mapValueBasket.flowOrder++; // increment counter if needed
      await this.createInvisibleUID(mapValueBasket);
      // make the proper divider
      //const divider = `\r${mapValueBasket.UID}<hr>\r\r`;

      // make unencoded divider for debugging
      const divider = `\r${mapValueBasket.timestamp}<hr>\r\r`;
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

      // make unencoded divider for debugging
      const divider = `\r${mapValueBasket.timestamp}<hr>\r\r`;
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

    console.log("entering manageYaml for file", file.path);
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
              console.log(
                "existing timestamp found for ",
                file.path,
                ": ",
                timestamp
              );
              console.log(
                "mapValueBasket.timestamp for ",
                file.path,
                ": ",
                mapValueBasket.timestamp
              );
              // look for complete yaml
              const completeYamldMatch = frontmatter.TextFlowUID.match(
                /(【\d{13,}】⟦[\u200B\u200C\u200D]{26,}⟧)/
              );
              if (completeYamldMatch) {
                const [_, timestamp, invisibleUID] = timestampMatch;
                mapValueBasket.UID = invisibleUID;
                console.log("existing invisible UID found");
                // make the proper divider
                //const divider = `\r${encodedTimestamp}<hr>\r\r`;

                // make unencoded divider for debugging
                const divider = `\r${timestamp}<hr>\r\r`;
                mapValueBasket.idDivider = divider.replace(/\\r/g, "\r");
              } else {
                console.log("recreating UID");
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
            console.log("No yaml found for ", file.path);
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
    let createOrEditFlowName: string = "";
    let createOrEditsourcePath: string = "";

    //#######################################################################
    //###########################   Settings Tab   ##########################
    //#######################################################################

    const setUpTextFlow = containerEl.createDiv({
      cls: "headline-container",
    });

    // ###############   SET A TEMP FOLDER   ###########################
    const setTempFolder = new Setting(setUpTextFlow)
      .setName("Choose a place for TextFlow_SystemFolder")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "Don't forget to click 'save'.",
          });
        })
      );
    if (
      // if this is the first initialisation of the plugin
      this.plugin.settings.tempFolderPlace === undefined
    ) {
      this.plugin.settings.tempFolderPlace = "";
      this.plugin.saveSettings();
    }
    // need this to be in wider scope for .addText and .addButton
    let newTempFolderPlace: string = this.plugin.settings.tempFolderPlace;

    setTempFolder
      .addText((text) =>
        text
          .setValue(
            this.plugin.settings.tempFolderPlace === undefined ||
              this.plugin.settings.tempFolderPlace === ""
              ? "root"
              : this.plugin.settings.tempFolderPlace
          )
          .onChange(async (value) => {
            // Normalize the input value
            value = value.trim() === "root" ? "" : value;
            newTempFolderPlace = normalizePath(value);
            this.plugin.settings.tempFolderPlace = newTempFolderPlace;
          })
      )
      .addButton((createButton) => {
        createButton.setButtonText("Create");
        createButton.onClick(async () => {
          console.log("createButton clicked.");

          // Normalize the input value
          if (newTempFolderPlace === "root" || newTempFolderPlace === "/") {
            newTempFolderPlace = "";
          }

          let oldTempFolderPlace = this.plugin.settings.tempFolderPlace
            ? this.plugin.settings.tempFolderPlace
            : (this.plugin.settings.tempFolderPlace = "");
          let oldTempFolderPath = oldTempFolderPlace;
          console.log(`Creating temp folder at: ${oldTempFolderPath}`);
          console.log(`Current tempFolderPlace: ${oldTempFolderPlace}`);

          this.plugin.settings.tempFolderPlace = newTempFolderPlace;
          console.log(`New tempFolderPlace: ${newTempFolderPlace}`);

          let newTempFolderPath = newTempFolderPlace;
          console.log(`Creating temp folder at: ${newTempFolderPath}`);

          let oldTempFolderCheck =
            this.app.vault.getAbstractFileByPath(oldTempFolderPath);
          if (
            newTempFolderPlace !== oldTempFolderPlace &&
            oldTempFolderPlace !== undefined &&
            oldTempFolderCheck instanceof TFolder
          ) {
            // Paths are different - handle folder move/recreation
            console.log(
              `Moving from ${oldTempFolderPath} to ${newTempFolderPath}`
            );

            const deleteOldTempFolder = new Modals.DeleteOldTempFolderModal(
              this.app,
              this.plugin,
              this.newTempFolderCreation,
              this.plugin.discernAndSetTempFolderState,
              oldTempFolderPath,
              newTempFolderPath,
              newTempFolderPlace
            );
            deleteOldTempFolder.open();
          } else {
            try {
              let folder =
                this.app.vault.getAbstractFileByPath(newTempFolderPath);
              if (!folder) {
                await this.newTempFolderCreation(newTempFolderPath);
                new Notice(`Temp folder created at ${newTempFolderPath}`);
              } else if (!(folder instanceof TFolder)) {
                new Notice(`${newTempFolderPath}" exists but is not a folder.`);
                throw new Error(
                  `${newTempFolderPath}" exists but is not a folder.`
                );
              }
            } catch (error) {
              console.error(`Error handling temp folder: ${error.message}`);
            }
            await this.plugin.saveSettings();
            if (this.plugin.settings.tempFolderHidden) {
              this.plugin.discernAndSetTempFolderState(
                true,
                this.plugin.settings.tempFolderPlace
              );
            }
          }
        });
      });

    // -----------   hide temp folder  ---------------
    const hideTempFolder = new Setting(setUpTextFlow)
      .setName("Hide temp folder")
      .setDesc(
        "Hiding the folder is recommended to avoid accidentally messing with it."
      )
      .addToggle((hideTempFolderToggle) => {
        hideTempFolderToggle
          .setValue(this.plugin.settings.tempFolderHidden)
          .onChange(async (value) => {
            this.plugin.settings.tempFolderHidden = value;
            this.plugin.discernAndSetTempFolderState(
              value,
              this.plugin.settings.tempFolderPlace
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

    const chooseFlowName = new Setting(createFlows)
      .setName("Name your Flow")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "Please enter a unique name for your flow.",
          });
          desc.createEl("br");
          desc.createSpan({
            text: "For example: folder name + meta data + meta data",
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

    const chooseSourceFolder = new Setting(createFlows)
      .setName("Choose a source folder")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "Choose a folder to serve as the source of your new Flow.",
          });
          desc.createEl("br");
          desc.createSpan({
            text: "You can have multiple Flows for the same folder that use different criteria for inclusion/exclusion of subfolders and notes.",
          });
        })
      )
      .addText((chooseFlowFolder) =>
        chooseFlowFolder
          .setPlaceholder("Enter the folder path.")
          .onChange(async (value) => {
            createOrEditsourcePath = value.trim();
            console.log(`folder is: ${createOrEditsourcePath}`);
          })
      );

    // #############   excluded folders     #########
    const TextFlow_SystemFolder = `${this.plugin.settings.tempFolderPlace}/TextFlow_SystemFolder`;
    let exclusionList: string[] = [];
    const excludeSubFolders = new Setting(createFlows)
      .setName("Exclude Folders")
      .setDesc(
        "Folders to exclude when building flows (one per line). TextFlow_SystemFloder is always excluded."
      )
      .addTextArea((text) => {
        text
          .setPlaceholder(`folder1, folder2`)
          .setValue(exclusionList.join(", "))
          .onChange(async (value) => {
            // Just store the raw input - we'll process it when saving
            exclusionList = value.split(",");
          });

        text.inputEl.setAttribute("spellcheck", "false");
        text.inputEl.rows = 4;
        text.inputEl.cols = 25;
      });

    // #############   excluded meta data   #########
    // #############   included meta data   #########

    const saveButton = new ButtonComponent(containerEl);
    saveButton.buttonEl.setAttribute("state", "creating");
    saveButton.buttonEl.setAttribute("aria-label", "Save Highlighter");
    saveButton
      .setClass("save-button")
      .setClass("action-button")
      .setClass("action-button-save")
      .setClass("mod-cta")
      .setIcon("save")
      .setTooltip("Save")
      .onClick(async (buttonEl: MouseEvent) => {
        try {
          // Validate source path first
          if (!createOrEditsourcePath) {
            new Notice("Please select a source folder");
            return;
          }
          const sourceExists = await this.app.vault.adapter.exists(
            createOrEditsourcePath
          );
          if (!sourceExists) {
            new Notice("Source folder not found. Please check the path.");
            return;
          }

          // Process exclusion list
          exclusionList.unshift(
            `${this.plugin.settings.tempFolderPlace}/TextFlow_SystemFolder`
          );

          // First pass: normalize and deduplicate
          const processedPaths = [
            ...new Set(
              exclusionList
                .map((f) => f.trim())
                .map((f) => normalizePath(f))
                .filter((f) => f.length > 0)
                .sort((a, b) => a.localeCompare(b))
            ),
          ];

          // Validate all paths
          const invalidPaths: string[] = [];
          for (const path of processedPaths) {
            const exists = await this.app.vault.adapter.exists(path);
            if (!exists) {
              invalidPaths.push(path);
            }
          }

          // If any paths are invalid, stop and show error
          if (invalidPaths.length > 0) {
            const errorMessage = createFragment((fragment) => {
              fragment.createSpan({
                text: "Cannot create flow: The following paths were not found:",
                cls: "error-message",
              });
              fragment.createEl("br");
              invalidPaths.forEach((path) => {
                fragment.createSpan({
                  text: `• ${path}`,
                  cls: "error-path",
                });
                fragment.createEl("br");
              });
              fragment.createSpan({
                text: "Please check the paths and try again.",
                cls: "error-hint",
              });
            });

            new Notice(errorMessage, 10000); // Show for 10 seconds
            return;
          }

          // If we get here, all paths are valid
          const finalExclusionList = processedPaths;

          // Create the flow object
          this.plugin.settings.flows[createOrEditFlowName] = {
            sourcePath: createOrEditsourcePath, // Will be set later when user selects a folder
            flowFileName: createOrEditFlowName, // Using the entered name
            flowFilePath: `${this.plugin.settings.tempFolderPlace}/TextFlow_SystemFolder/${createOrEditFlowName}.md`,
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
            excludedFolders: finalExclusionList,
            flowMap: {},
          };

          await this.plugin.saveSettings();
          this.buildFlatFlowMap(
            this.plugin.settings.flows[createOrEditFlowName].sourcePath,
            createOrEditFlowName
          );

          new Notice("Flow created successfully!");
        } catch (error) {
          console.error("Error creating flow:", error);
          new Notice(
            "An error occurred while creating the flow. Check the console for details."
          );
        }
      });

    // ########### YOUR FLOWS ###################
    // rename flows, change flows, delete flows
  }
}
