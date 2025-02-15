import * as jsYaml from "js-yaml";
import * as Modals from "./modals";
import {
  App,
  PluginSettingTab,
  Setting,
  TFolder,
  TFile,
  TAbstractFile,
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

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    //#######################################################################
    //###########################   Shorthands/Globals   ####################
    //#######################################################################
    const shFlowObjects: { [key: string]: Types.FlowDef } =
      this.plugin.settings.flows;
    const shSettings: Types.TextFlowSettings = this.plugin.settings;
    let createOrEditFlowName: string = "";
    let createOrEditsourcePath: string = "";

    //#######################################################################
    //###########################    Functions   ############################
    //#######################################################################

    const newTempFolderCreation = async (newTempFolderPath: string) => {
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

    // to avoid leading slashes
    const constructTempFolderPath = (basePath: string) => {
      if (basePath === "") {
        return "x_textFlowTemp"; // No leading slash for root
      }
      return `${basePath}/x_textFlowTemp`;
    };

    const calculateExcludedItemsThenMakeMap = async (
      folderPath: string,
      flowName: string
    ): Promise<void> => {
      const flow: Types.FlowDef = shFlowObjects[flowName] || {
        sourcePath: folderPath,
        flowFileName: flowName,
        divider: `<hr>`,
        excludedFolders: [],
        includedMetaData: {},
        excludedMetaData: {},
        flowMap: {}, // Flat map
      };
    };

    const buildFlatFlowMap = async (
      folderPath: string,
      flowName: string
    ): Promise<void> => {
      const flow: Types.FlowDef = shFlowObjects[flowName] || {
        sourcePath: folderPath,
        flowFileName: flowName,
        divider: "<hr>",
        flowMap: {}, // Flat map
      };
      let mapValueBasket: Types.mapValueBasket = {
        concatenatedFileContents: "",
        initialIteration: true,
        timeStamp: 0,
        flowOrder: 0,
        UID: "",
        yamlMini: "",
        yamlComplete: "",
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
      await updateFlatMap(rootFolder, flow, mapValueBasket);
      // Save back the updated FlowDef
      shFlowObjects[flowName] = flow;

      // Check if temp folder exists before writing
      const tempFolder = this.app.vault.getAbstractFileByPath(
        `${shSettings.tempFolderPlace}/x_textFlowTemp`
      );
      if (tempFolder && tempFolder instanceof TFolder) {
        const tempFilePath = `${shSettings.tempFolderPlace}/x_textFlowTemp/${flowName}.md`;
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
    const updateFlatMap = async (
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
        item.path !== shSettings.tempFolderPlace + "/x_textFlowTemp"
      ) {
        mapValueBasket.flowOrder++; // increment counter if needed
        await createInvisibleUID(mapValueBasket);

        flow.flowMap[fullPath] = {
          type: "folder",
          path: fullPath,
          itemName: item.name,
          UID: mapValueBasket.UID,
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
          await updateFlatMap(subItem, flow, mapValueBasket);
        }
      } else if (item instanceof TFile) {
        mapValueBasket.flowOrder++; // increment counter if needed
        const modificationTimestamp = Date.now();
        let fileContent: string = await this.app.vault.read(item);

        // Extract, fix or create YAML and separate it from other content
        // this also calls UID creation
        await manageYaml(item, mapValueBasket);
        fileContent = mapValueBasket.singleFileContent;

        // find and remove the title line; normalize
        const titleLine = `## ${item.name.replace(/\.md$/, "")}`;
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
          yamlComplete: mapValueBasket.yamlComplete,
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
    const manageYaml = async (
      file: TFile,
      mapValueBasket: Types.mapValueBasket
    ) => {
      let foundUID = false;

      try {
        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
          if (frontmatter?.TextFlowUID) {
            const uidMatch = frontmatter.TextFlowUID.match(
              /【(\d{13,})】⟦([\u200B\u200C\u200D]{26,})⟧/
            );

            if (uidMatch) {
              const [_, timestamp, invisibleUID] = uidMatch;
              mapValueBasket.UID = invisibleUID;
              mapValueBasket.timeStamp = Number(timestamp);
              foundUID = true;
            } else {
              throw new Error(
                "TextFlow: Invalid UID format in properties.\n" +
                  "This file seems to be part of a flow but its UID is corrupted.\n" +
                  "Please restore from backup or remove TextFlowUID from properties to treat as new file."
              );
            }
          }

          if (!foundUID) {
            // No TextFlowUID, create one
            createInvisibleUID(mapValueBasket);
            frontmatter.TextFlowUID = `【${mapValueBasket.timeStamp}】⟦${mapValueBasket.UID}⟧`;
          }
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

      debugMarker(mapValueBasket.UID);
      return mapValueBasket;
    };

    // ----------- translate timestamp into invisible base2 UID and make YAML entry
    const createInvisibleUID = (mapValueBasket: Types.mapValueBasket) => {
      const INVISIBLE_CHARS = [
        "\u200B", // Zero-width space (0)
        "\u200C", // Zero-width non-joiner (1)
        "\u200D", // Zero-width joiner (2)
      ];

      const timestamp = Date.now();
      //console.log(`createInvisibleUID timestamp ${timestamp}`);
      const base3 = timestamp.toString(3);
      const encodedTimestamp = [...base3]
        .map((digit) => INVISIBLE_CHARS[parseInt(digit)])
        .join("");
      //console.log(`base3 timestamp: ${base3}`);
      // debugMarker(encodedTimestamp);

      // make the divider
      const divider = `\r${encodedTimestamp}<hr>\r\r`;

      mapValueBasket.timeStamp = timestamp;
      mapValueBasket.UID = encodedTimestamp;
      mapValueBasket.yamlMini = `\nTextFlowUID: 【${timestamp}】⟦${encodedTimestamp}⟧`;
      mapValueBasket.idDivider = divider.replace(/\\r/g, "\r");
    };

    // ----------------- If invisible UID got eaten by external editor -----------
    const reCreateInvisibleUID = (timestamp: number) => {
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
    const debugMarker = (marker: string) => {
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

    //#######################################################################
    //###########################   Settings Tab   ##########################
    //#######################################################################

    const setUpTextFlow = containerEl.createDiv({
      cls: "headline-container",
    });
    setUpTextFlow.createEl("h3", {
      text: "Set up TextFlow",
      cls: "headline-text",
    });

    // ###############   SET A TEMP FOLDER   ###########################
    const setTempFolder = new Setting(setUpTextFlow)
      .setName("Create a folder for your Flows")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "TextFlow needs a folder to keep its temporary Flow files in.",
          });
          desc.createEl("br");
          desc.createSpan({
            text: "If you don't specify a folder here, the temp folder will be created in the root folder of your vault.",
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
            newTempFolderPlace = value.trim() === "root" ? "" : value.trim();
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
          let oldTempFolderPath = constructTempFolderPath(oldTempFolderPlace);
          console.log(`Creating temp folder at: ${oldTempFolderPath}`);
          console.log(`Current tempFolderPlace: ${oldTempFolderPlace}`);

          this.plugin.settings.tempFolderPlace = newTempFolderPlace;
          console.log(`New tempFolderPlace: ${newTempFolderPlace}`);

          let newTempFolderPath = constructTempFolderPath(newTempFolderPlace);
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
              newTempFolderCreation,
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
                await this.app.vault.createFolder(newTempFolderPath);
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
    // ############   HIDE FOLDER?   #####################
    const hideTempFolder = new Setting(setUpTextFlow)
      .setName("Hide temp folder")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "Toggle visibility of the temporary folder in your vault.",
          });
          desc.createEl("br");
          desc.createSpan({
            text: "Hiding the folder is advisable to avoid accidentally messing with it.",
          });
        })
      )
      .addToggle((hideTempFolderToggle) => {
        hideTempFolderToggle
          .setValue(shSettings.tempFolderHidden)
          .onChange(async (value) => {
            shSettings.tempFolderHidden = value;
            this.plugin.discernAndSetTempFolderState(
              value,
              this.plugin.settings.tempFolderPlace
            );
            await this.plugin.saveSettings();
          });
      });

    // ###############   Create a new flowObject   #############################

    const createFlows = containerEl.createDiv({
      cls: "headline-container",
    });
    createFlows.createEl("h3", {
      text: "Create a Flow",
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
      .addText((text) =>
        text.setPlaceholder("Enter a unique name").onChange(async (value) => {
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
        shFlowObjects[createOrEditFlowName] = {
          sourcePath: createOrEditsourcePath, // Will be set later when user selects a folder
          flowFileName: createOrEditFlowName, // Using the entered name
          flowFilePath: `${shSettings.tempFolderPlace}/x_textFlowTemp/${createOrEditFlowName}.md`,
          flowActive: false,
          activeRegion: {
            lastCursorPosition: 0,
            path: "",
            UID: "",
            flowOrder: 1,
            startInFlow: 0,
            endInFlow: 1,
          },
          persistentCursorPos: 0,
          modifiedRegionsArray: [],
          flowMap: {}, // Empty flowMap to start with
        };
        await this.plugin.saveSettings();
        buildFlatFlowMap(
          shFlowObjects[createOrEditFlowName].sourcePath,
          createOrEditFlowName
        );
      });

    // name the flow  - > this.plugin.settings.flowObjects.flow (save on input)
    // Input a file path to make the flow out of this file; input a hashtag to make an abstract flow.
  }

  // ########### YOUR FLOWS ###################
  // rename flows, change flows, delete flows
}
