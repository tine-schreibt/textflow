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
import * as Modals from "./modals";
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
    // wider scope variables that can't be reset during iteration

    const extractYAML = async (
      content: string,
      mapValueBasket: Types.mapValueBasket
    ) => {
      const yamlRegex = /^(---\n[\s\S]*?\n---)\n*/;
      const match = content.match(yamlRegex);

      if (match) {
        const yaml = match[1];
        const cleanContent = content.slice(match[0].length).trim();

        // Look for TextFlowUID line
        const textFlowPropertyRegEx =
          /TextFlowUID:\s*(【\d{13}】⟦[\u200B\u200C\u200D]{10}⟧)/;
        const textFlowPropertyMatch = yaml.match(textFlowPropertyRegEx);

        if (textFlowPropertyMatch) {
          // Then to extract just the invisible UID:
          const invisibleUIDRegex = /⟦([\u200B\u200C\u200D]{10})⟧/;
          const invisibleMatch =
            textFlowPropertyMatch[1].match(invisibleUIDRegex);

          // And to extract just the timestamp:
          const timestampRegex = /【(\d{13})】/;
          const timestampMatch = textFlowPropertyMatch[1].match(timestampRegex);

          if (timestampMatch) {
            // If timestamp is there
            if (invisibleMatch) {
              // if the invisible UID is also there
              mapValueBasket.UID = invisibleMatch[0];
              mapValueBasket.yamlMini = `TextFlowUID: 【${timestampMatch[0]}】⟦${invisibleMatch[0]}⟧`;
              mapValueBasket.yamlComplete = `${textFlowPropertyMatch[0]}`;
              mapValueBasket.singleFileContent = cleanContent;
              console.log(
                `good yaml found on file no ${mapValueBasket.flowOrder}`
              );
            } else {
              // If there is no invisible UID, recreate it
              const timestamp = Number(timestampMatch[1]);
              mapValueBasket.UID = await reCreateInvisibleUID(timestamp);

              // Replace the YAML line with complete version
              console.log(
                `repairing yaml for file no ${mapValueBasket.flowOrder}`
              );
              const updatedYaml = yaml.replace(
                textFlowPropertyRegEx,
                `TextFlowUID: 【${timestamp}】⟦${mapValueBasket.UID}⟧`
              );
              mapValueBasket.yamlComplete = `${updatedYaml}`;
              mapValueBasket.singleFileContent = cleanContent;
              return mapValueBasket;
            }
          } else {
            // If there is only the property name but no valid value
            throw new Error(
              "TextFlow: Invalid UID format in properties.\n" +
                "This file seems to be part of a flow but its UID is corrupted.\n" +
                "Please restore from backup or remove TextFlowUID from properties to treat as new file."
            );
          }
        } else {
          // There is YAML but not TextFlowID porperty
          console.log(
            `missing yaml found on file no ${mapValueBasket.flowOrder}`
          );
          await createInvisibleUID(mapValueBasket);

          const completedYaml = `${yaml}\r${mapValueBasket.yamlMini}`;
          console.log(`yaml appended: ${completedYaml}`);
          mapValueBasket.yamlComplete = `${yaml}\r${mapValueBasket.yamlMini}`;
          mapValueBasket.singleFileContent = cleanContent;
          return mapValueBasket;
        }
      } else {
        // No YAML at all
        console.log(`no yaml found on file no ${mapValueBasket.flowOrder}`);
        await createInvisibleUID(mapValueBasket);
        mapValueBasket.yamlMini = `TextFlowUID: 【${mapValueBasket.timeStamp}】⟦${mapValueBasket.UID}⟧`;
        mapValueBasket.yamlComplete = `TextFlowUID: 【${mapValueBasket.timeStamp}】⟦${mapValueBasket.UID}⟧`;
        mapValueBasket.singleFileContent = content;
        return mapValueBasket;
      }
    };

    // ----------- translate timestamp into invisible base2 UID and make YAML entry
    const createInvisibleUID = (mapValueBasket: Types.mapValueBasket) => {
      const INVISIBLE_CHARS = [
        "\u200B", // Zero-width space (0)
        "\u200C", // Zero-width non-joiner (1)
        "\u200D", // Zero-width joiner (2)
      ];

      const timestamp = Date.now();
      const base3 = timestamp.toString(3);

      const encodedTimestamp = [...base3]
        .map((digit) => INVISIBLE_CHARS[parseInt(digit)])
        .join("");

      mapValueBasket.UID = encodedTimestamp;
      mapValueBasket.yamlMini = `\nTextFlowUID: 【${timestamp}】⟦${encodedTimestamp}⟧`;
      mapValueBasket.idDivider = `\r${encodedTimestamp}<hr>\r\r`;
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

    const updateFlatMap = async (
      item: TAbstractFile,
      flow: Types.FlowDef,
      mapValueBasket: Types.mapValueBasket
    ): Promise<void> => {
      const fullPath = item.path;
      const itemName = item.name;

      // Calculate new positions once
      if (
        item instanceof TFolder &&
        item.path !== shSettings.tempFolderPlace + "/x_textFlowTemp"
      ) {
        mapValueBasket.flowOrder++; // increment counter if needed
        const idDivider = await createInvisibleUID(mapValueBasket);

        if (mapValueBasket.initialIteration) {
          flow.flowMap[fullPath].startEndInFlow.start = 0;
          mapValueBasket.initialIteration = false;
        } else {
          flow.flowMap[fullPath].startEndInFlow.start =
            mapValueBasket.concatenatedFileContents.length;
        }

        flow.flowMap[fullPath] = {
          type: "folder",
          path: fullPath,
          itemName: item.name,
          UID: mapValueBasket.UID,
          flowOrder: mapValueBasket.flowOrder,
          minLength: itemName.length,
          lengthPlusDividers: itemName.length + mapValueBasket.idDivider.length,
          startEndInFlow: {
            // start: defined further up depending on iteration status
            end: itemName.length + mapValueBasket.idDivider.length,
          },
        } as Types.SourceFileObject;

        // Add content with marker before divider
        mapValueBasket.concatenatedFileContents += `<center><b>${itemName}</b></center>${idDivider}`;
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
        // this calls UID creation, too
        await extractYAML(fileContent, mapValueBasket);
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

        if (mapValueBasket.initialIteration) {
          flow.flowMap[fullPath].startEndInFlow.start = 0;
          mapValueBasket.initialIteration = false;
        } else {
          flow.flowMap[fullPath].startEndInFlow.start =
            mapValueBasket.concatenatedFileContents.length;
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
            // start: defined further up depending on iteration status
            end:
              mapValueBasket.concatenatedFileContents.length +
              fileContent.length +
              mapValueBasket.idDivider.length,
          },
          yamlComplete: mapValueBasket.yamlComplete,
          yamlMini: mapValueBasket.yamlMini,
        } as Types.SourceFileObject;

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
