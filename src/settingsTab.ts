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
    this.plugin.settings.divider = `\r\r***\r\r`;
    const divider = this.plugin.settings.divider.replace(/\\r/g, "\r");

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
        divider: `***`,
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
        divider: "***",
        flowMap: {}, // Flat map
      };
      let mapValueBasket: Types.mapValueBasket = {
        tempFileContents: "",
        currentStart: -1,
        currentEnd: 0,
        initialIteration: true,
      };
      this.plugin.saveSettings();

      const rootFolder = this.app.vault.getAbstractFileByPath(folderPath);
      if (!(rootFolder instanceof TFolder) || !rootFolder) {
        console.error(`There's a problem with ${folderPath}`);
        new Notice(`Please check if ${folderPath} exists and is a folder`);
        return;
      }

      // Start processing from the root folder
      await updateFlatMap(rootFolder, flow, shSettings.divider, mapValueBasket);
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
          mapValueBasket.tempFileContents
        );
      } else {
        new Notice("Please create a temp folder first.");
        return;
      }
      // save temp file
    };
    // wider scope variables that can't be reset during iteration

    const updateFlatMap = async (
      item: TAbstractFile,
      flow: Types.FlowDef,
      flowDivider: string,
      mapValueBasket: Types.mapValueBasket
    ): Promise<void> => {
      const fullPath = item.path;
      const itemName = item.name;
      // Calculate new positions once
      if (
        item instanceof TFolder &&
        item.path !== shSettings.tempFolderPlace + "/x_textFlowTemp"
      ) {
        console.log(`Processing ${fullPath}:`, {
          contentLengthBefore: mapValueBasket.tempFileContents.length,
          addedContent:
            item instanceof TFolder
              ? `<center><b>${itemName}</b></center>${shSettings.divider}`
              : `${shSettings.divider}`,
          contentLengthAfter:
            mapValueBasket.tempFileContents.length +
            (item instanceof TFolder
              ? `<center><b>${itemName}</b></center>${shSettings.divider}`
                  .length
              : `${shSettings.divider}`.length),
        });
        flow.flowMap[fullPath] = {
          path: fullPath,
          itemName: item.name,
          lastModifiedInFlow: Date.now(),
          startEndInFlow: {
            start: mapValueBasket.tempFileContents.length,
            end: 0,
          },
          type: "folder",
          minLength: itemName.length,
          lengthPlusDividers: itemName.length + shSettings.divider.length + 28,
        } as Types.FlowMap;
        if (mapValueBasket.initialIteration) {
          flow.flowMap[fullPath].startEndInFlow.start = 0;
        }
        mapValueBasket.initialIteration = false;
        mapValueBasket.tempFileContents += `<center><b>${itemName}</b></center>${shSettings.divider}`;
        mapValueBasket.currentEnd = mapValueBasket.tempFileContents.length;
        flow.flowMap[fullPath].startEndInFlow.end = mapValueBasket.currentEnd;
        /*console.log(
					`start: ${
						flow.flowMap[fullPath].startEndInFlow.start
					} start plus total lenght: ${
						flow.flowMap[fullPath].startEndInFlow.start +
						flow.flowMap[fullPath].lengthPlusDividers
					} = content lenghth: ${
						mapValueBasket.tempFileContents.length
					} = current end ${mapValueBasket.currentEnd}`
				);*/

        // Process folder contents
        for (const subItem of item.children) {
          await updateFlatMap(
            subItem,
            flow,
            shSettings.divider,
            mapValueBasket
          );
        }
      } else if (item instanceof TFile) {
        let fileContent: string = await this.app.vault.read(item);
        console.log(`Processing ${fullPath}:`, {
          contentLengthBefore: mapValueBasket.tempFileContents.length,
          addedContent:
            item instanceof TFolder
              ? `<center><b>${itemName}</b></center>${shSettings.divider}`
              : `${fileContent}${shSettings.divider}`,
          contentLengthAfter:
            mapValueBasket.tempFileContents.length +
            (item instanceof TFolder
              ? `<center><b>${itemName}</b></center>${shSettings.divider}`
                  .length
              : `${fileContent}${shSettings.divider}`.length),
        });
        // find and remove the title line; normalize
        //console.log(fileContent);
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
          path: fullPath,
          itemName: item.name,
          lastModifiedInFlow: Date.now(),
          startEndInFlow: {
            start: mapValueBasket.tempFileContents.length,
            end: 0,
          },
          type: "file",
          sourceLastModified: item.stat.mtime,
          minLength: fileContent.length,
          lengthPlusDividers:
            fileContent.length + shSettings.divider.length + 4,
        } as Types.FlowMap;
        if (mapValueBasket.initialIteration) {
          flow.flowMap[fullPath].startEndInFlow.start = 0;
        }
        mapValueBasket.initialIteration = false;
        mapValueBasket.tempFileContents += `${fileContent}${shSettings.divider}`;
        mapValueBasket.currentEnd = mapValueBasket.tempFileContents.length;
        flow.flowMap[fullPath].startEndInFlow.end = mapValueBasket.currentEnd;
        /*console.log(
					`start: ${
						flow.flowMap[fullPath].startEndInFlow.start
					} start plus total lenght: ${
						flow.flowMap[fullPath].startEndInFlow.start +
						flow.flowMap[fullPath].lengthPlusDividers
					} = content lenghth: ${
						mapValueBasket.tempFileContents.length
					} = current end ${mapValueBasket.currentEnd}`
				);*/
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

    // #############   choose a divider	    ######### (dropdown)
    // ---  /  ***  //  ___

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
