import TextFlowPlugin from "../main";
import {
  App,
  ButtonComponent,
  Editor,
  FuzzyMatch,
  FuzzySuggestModal,
  Notice,
  setIcon,
  MarkdownView,
  Modal,
  normalizePath,
  Setting,
  TFile,
  WorkspaceLeaf,
} from "obsidian";
import * as Types from "./types";
import TextFlow from "../main";
import { TextFlowSettingsTab } from "./settingsTab";
import { basename } from "path";
import { EditorView } from "@codemirror/view";
import path from "path";

// Any code that was actually written by AI is labelled

//--------------------------------------------------------------------------------
// TOC
//--------------------------------------------------------------------------------
// - CreateFlowFromFolder
// - PreviewModal
// - DeleteFlowDefModal
// - RestoreFlowDefModal
// - FlowSwitcherModal
// - FuzzyNavModal
//--------------------------------------------------------------------------------
//--------------------------------------------------------------------------------

//--------------------------------------------------------------------------------
//----------- CREATE FLOW FROM FOLDER
//--------------------------------------------------------------------------------

export class CreateFlowFromFolder extends Modal {
  constructor(
    app: App,
    private plugin: TextFlowPlugin,
  ) {
    super(app);
    this.plugin = plugin;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // modalTitle =
    contentEl.createEl("h2", {
      text: this.plugin.t("CreateFlowFromFolderModal.headline"),
    });

    // description
    contentEl.createSpan({
      text: this.plugin.t(
        "CreateFlowFromFolderModal.description refine def in settings",
      ),
    });

    //--------------------------------------------------------------------------------
    const chooseFlowName = new Setting(contentEl);
    chooseFlowName
      .setName(
        this.plugin.t("createFlows.chooseFlowName.setName name your flow"),
      )
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "createFlows.chooseFlowName.setDesc some characters can't be part of a flow name",
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: '? : # * < > [ ] / | \\ "  ^ `',
          });
        }),
      );

    //--------------------------------------------------------------------------------
    chooseFlowName.addText((setFlowName) => {
      // this value has already been set by the click that also calls this modal
      setFlowName.setValue(this.plugin.settings.flowBuildBasket.flowName);

      setFlowName.onChange(async (value) => {
        this.plugin.settings.flowBuildBasket.flowName = value.trim();
        this.plugin.settingsTabFunctions.debouncedSaveSettings();
      });
    });

    //--------------------------------------------------------------------------------
    // FOLDER TITLES TOGGLE
    const toggleFolderTitles = new Setting(contentEl);
    toggleFolderTitles
      .setName(this.plugin.t("modal_toggleFolderTitles.setName include folder"))
      .setDesc(
        this.plugin.t(
          "toggleFolderTitles.setDesc will also turn off titles in nav dropdown",
        ),
      )
      .addToggle((sortToggle) => {
        sortToggle
          .setValue(this.plugin.settings.flowBuildBasket.folderTitles)
          .onChange(async (value) => {
            this.plugin.settings.flowBuildBasket.folderTitles = value;
            await this.plugin.saveSettings();
          });
      });

    if (this.plugin.settings.embeds) {
      // --------- TOGGLE EMBEDS ------------------
      const toggleEmbed = new Setting(contentEl);
      toggleEmbed
        .setName(this.plugin.t("toggleEmbed name"))
        .addToggle((sortToggle) => {
          sortToggle
            .setValue(this.plugin.settings.flowBuildBasket.embed ?? false)
            .onChange(async (value) => {
              const plugins = (this.app as any).plugins;
              const isInstalled = !!plugins.manifests["sync-embeds"];
              if (!isInstalled) {
                new Notice(this.plugin.t("Please install sync embeds"), 0);
              }
              this.plugin.settings.flowBuildBasket.embed = value;
            });
        });
    }

    //--------------------------------------------------------------------------------
    // SORT ORDER TOGGLE
    const sortFlowPathsTagsProperties = new Setting(contentEl).setName(
      this.plugin.t("sortFlowPathsTagsProperties.setName sort order"),
    );
    sortFlowPathsTagsProperties.setDesc(
      createFragment((desc) => {
        desc.createSpan({
          text: this.plugin.t(
            "sortFlowPathsTagsProperties.setDesc.1 note order",
          ),
          cls: "text-emphasis",
        });
        desc.createSpan({
          text: this.plugin.t(
            "sortFlowPathsTagsProperties.setDesc.2 description of note order",
          ),
        });
        desc.createEl("br");
        desc.createSpan({
          text: this.plugin.t(
            "sortFlowPathsTagsProperties.setDesc.3 folder order",
          ),
          cls: "text-emphasis",
        });
        desc.createSpan({
          text: this.plugin.t(
            "sortFlowPathsTagsProperties.setDesc.4 description of folder order",
          ),
        });
        desc.createEl("br");
        desc.createSpan({
          text: this.plugin.t(
            "sortFlowPathsTagsProperties.setDesc.5 test them all out",
          ),
        });
      }),
    );

    //--------------------------------------------------------------------------------
    sortFlowPathsTagsProperties.addDropdown((dropdown) => {
      dropdown
        .addOption(
          "noteOrder",
          this.plugin.t(
            "sortFlowPathsTagsProperties.addDropdown.addOption.1 note order",
          ),
        )
        .addOption(
          "folderOrder",
          this.plugin.t(
            "sortFlowPathsTagsProperties.addDropdown.addOption.2 folder order",
          ),
        );
      dropdown.setValue(
        // remove "custom" as option
        this.plugin.settings.flowBuildBasket.flowDefinition
          .pathsTagsPropertiesSortOrder
          ? this.plugin.settings.flowBuildBasket.flowDefinition
              .pathsTagsPropertiesSortOrder
          : "noteOrder",
      );
      dropdown.onChange(async (value) => {
        this.plugin.settings.flowBuildBasket.flowDefinition.pathsTagsPropertiesSortOrder =
          value as Types.SortOrder;
        await this.plugin.saveSettings();
      });
    });

    //--------------------------------------------------------------------------------
    let subfoldersExcluded = false;
    const excludeSubfolders = new Setting(contentEl);
    excludeSubfolders
      .setName(
        this.plugin.t("modal_toggleSubfolders.setName exclude subfolders"),
      )
      .addToggle((sortToggle) => {
        sortToggle.setValue(subfoldersExcluded).onChange(async (value) => {
          subfoldersExcluded = value;
        });
      });

    //--------------------------------------------------------------------------------
    const saveButton = new ButtonComponent(contentEl);
    saveButton
      .setButtonText(this.plugin.t("saveButton.setButtonText save flow def"))
      .onClick(async (buttonEl: MouseEvent) => {
        if (!this.plugin.settings.systemFolderPath) {
          new Notice(
            this.plugin.t("saveButton.notice create sys folder first"),
          );
          return;
        }

        // if checks and flow creation haven't been performed by the preview button
        const validation = this.plugin.settingsTabFunctions.isValidFlowName(
          this.plugin.settings.flowBuildBasket.flowName,
        );
        if (!validation.valid && validation.reason) {
          new Notice(validation.reason);
          return;
        }

        // set this so it won't trigger the rename thing
        this.plugin.settings.flowBuildBasket.oldFlowName =
          this.plugin.settings.flowBuildBasket.flowName;

        if (subfoldersExcluded) {
          const folderArray =
            this.plugin.settings.flowBuildBasket.flowDefinition.folderIncluded.split(
              ",",
            );
          const excludedArray = [];
          for (let folder of folderArray) {
            excludedArray.push(`${folder}/`);
          }
          this.plugin.settings.flowBuildBasket.flowDefinition.folderIncluded =
            excludedArray.join(",");
        }

        // It really helps to save stuff... -.-
        await this.plugin.saveSettings();

        await this.plugin.settingsTabFunctions.createSourceNotePathArray(
          this.plugin.settings.flowBuildBasket,
        );

        if (!this.plugin.settings.flowBuildBasket.success) {
          return;
        }

        // write the whole stuff (also flags for rebuild)
        await this.plugin.settingsTabFunctions.writeAndSaveFlowDef(
          this.plugin.settings.flowBuildBasket,
        );

        // build
        this.plugin.settingsTabFunctions.flowBuildingBundle(
          this.plugin.settings.flowBuildBasket.flowName,
          "settingsTab",
        );

        // update overlaps,
        this.plugin.settingsTabFunctions.syncOverlaps(
          this.plugin.settings.flowBuildBasket,
        );

        new Notice(
          this.plugin.t("createFromFolder.notice", {
            flowName: this.plugin.settings.flowBuildBasket.flowName,
          }),
        );

        // and clean up the basket.
        this.plugin.settingsTabFunctions.resetFlowBuildBasket(
          this.plugin.settings.flowBuildBasket,
        );

        await this.plugin.saveSettings();

        this.close();
      });

    //--------------------------------------------------------------------------------
    const closeButton = new ButtonComponent(contentEl);
    closeButton
      .setButtonText(this.plugin.t("CreateFlowFromFolderModal.close"))
      .onClick(async () => {
        this.plugin.settingsTabFunctions.resetFlowBuildBasket(
          this.plugin.settings.flowBuildBasket,
        );
        this.close();
      });
  }

  //--------------------------------------------------------------------------------
  async onClose() {
    // and clean up the basket.
    this.plugin.settingsTabFunctions.resetFlowBuildBasket(
      this.plugin.settings.flowBuildBasket,
    );
    await this.plugin.saveSettings();
  }
}

// --------------------------------------------------------------------------------
// ---------- CREATE ITEM MODAL -------------------
// --------------------------------------------------------------------------------

export class CreateNewFile extends Modal {
  constructor(
    app: App,
    private plugin: TextFlowPlugin,
    private parentFolder: string,
  ) {
    super(app);
    this.plugin = plugin;
    this.parentFolder = parentFolder;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    let choice: string = "";

    const modalTitle = contentEl.createEl("h2", {
      text: this.plugin.t("CreateNewFile.headline"),
    });

    //--------------------------------------------------------------------------------
    const selectItemDropdown = new Setting(modalTitle);
    selectItemDropdown.setClass("deco-dropdown").addDropdown((dropdown) => {
      const selectItemDropdownComponent = dropdown;
      dropdown.selectEl.setAttribute(
        "aria-label",
        this.plugin.t("CreateNewFilerModal.description"),
      );
      dropdown
        .addOption(
          "file",
          this.plugin.t("CreateNewFilerModal.description note"),
        )
        .addOption(
          "folder",
          this.plugin.t("CreateNewFilerModal.description folder"),
        )
        .onChange((value) => {
          choice = value;
        });
    });

    //--------------------------------------------------------------------------------
    const chooseTitle = new Setting(modalTitle).setName(
      this.plugin.t("CreateNewFilerModal.description title"),
    );

    let elementTitle: string = "";
    chooseTitle.addText((chooseTitleInput) =>
      chooseTitleInput.onChange(async (value) => {
        elementTitle = value;
      }),
    );

    //--------------------------------------------------------------------------------
    const saveButton = new ButtonComponent(contentEl);
    saveButton
      .setButtonText(this.plugin.t("CreateNewFilerModal.createButton"))
      .onClick(async (buttonEl: MouseEvent) => {
        const newFileName = this.plugin.getUniqueFileName(this.parentFolder);
        this.close();
      });

    //--------------------------------------------------------------------------------
    const closeButton = new ButtonComponent(contentEl);
    closeButton
      .setButtonText(this.plugin.t("CreateFlowFromFolderModal.close"))
      .onClick(async () => {
        this.plugin.settingsTabFunctions.resetFlowBuildBasket(
          this.plugin.settings.flowBuildBasket,
        );
        this.close();
      });
  }

  //--------------------------------------------------------------------------------
  async onClose() {
    // and clean up the basket.
    this.plugin.settingsTabFunctions.resetFlowBuildBasket(
      this.plugin.settings.flowBuildBasket,
    );
    await this.plugin.saveSettings();
  }
}

// --------------------------------------------------------------------------------
// ---------- PREVIEW MODAL
// --------------------------------------------------------------------------------

export class PreviewModal extends Modal {
  constructor(
    app: App,
    private plugin: TextFlowPlugin,
    private flowBuildBasket: Types.flowBuildBasket,
  ) {
    super(app);
    this.plugin = plugin;
    this.flowBuildBasket = flowBuildBasket;
  }
  onOpen() {
    const { contentEl } = this;

    const _modalTitle = contentEl.createEl("h2", {
      text: this.plugin.t("PreviewModal.modalTitle preview for flow", {
        this_flowBuildBasket_flowName: this.flowBuildBasket.flowName,
      }),
    });

    //--------------------------------------------------------------------------------
    // Show found overlaps
    if (Object.keys(this.flowBuildBasket.overlapObject).length > 0) {
      const overlapText = new Setting(contentEl).setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t("PreviewModal.modalTitle overlap for flow", {
              this_flowBuildBasket_flowName: this.flowBuildBasket.flowName,
            }),
          });
          desc.createEl("br");
          const flowSpan = desc.createSpan({
            text: this.plugin.t("PreviewModal.modalTitle hover for details"),
          });
          Object.keys(this.flowBuildBasket.overlapObject).forEach((flow) => {
            if (flow != this.flowBuildBasket.oldFlowName) {
              // get the paths
              const overlapingPaths = Object.keys(
                this.flowBuildBasket.overlapObject[flow],
              );
              // make the label
              const ariaText = `\n-${overlapingPaths.join("\n")}`;
              // the span itself:
              const overlapList = Object.keys(
                this.flowBuildBasket.overlapObject[flow],
              ).join("\n");

              desc.createEl("br");
              const flowSpan = desc.createSpan({
                text: `- ${flow}`,
                attr: {
                  "aria-label": this.plugin.t(
                    "PreviewModal.modalTitle overlapping notes",
                    { overlapList: overlapList },
                  ),
                },
              });
            }
          });
        }),
      );
    }

    //--------------------------------------------------------------------------------
    const previewContainer = contentEl.createDiv({
      cls: "preview-container",
    });

    const recipeItems = this.flowBuildBasket.flowNotesPathArray ?? [];
    if (recipeItems.length === 0) {
      previewContainer.setText(
        this.plugin.t(
          "PreviewModal.modalTitle.info your criteria yielded an empty list",
        ),
      );
    } else {
      // Format the elements of the array for display
      for (let ingredient of this.flowBuildBasket.flowNotesPathArray!) {
        if (ingredient.startsWith("#")) {
          previewContainer.createEl("p", {
            text: ingredient.replace("#", ""),
            cls: "preview-group-header",
          });
        } else {
          const ingredientArray = ingredient.split("/");
          if (this.flowBuildBasket.definitionMode === "foldersTagsProps") {
            // if we are not working with bookmarks
            let dashes = "";
            for (let i = 0; i < ingredientArray.length - 1; i++) dashes += "-";
            ingredient = `${dashes} ${
              ingredientArray[ingredientArray.length - 1]
            }`;
          } else {
            ingredient = `- ${ingredientArray[ingredientArray.length - 1]}`;
          }
          previewContainer.createEl("p", {
            text: `${ingredient}`,
            cls: "preview-note-name",
          });
        }
      }
    }

    //--------------------------------------------------------------------------------
    // Close button with info text
    const closeModal = new Setting(contentEl).setDesc(
      createFragment((desc) => {
        desc.createSpan({
          text: this.plugin.t(
            "PreviewModal.modalTitle.info what happens after closing the modal",
          ),
        });
        desc.createEl("br");
        desc.createSpan({
          text: this.plugin.t(
            "PreviewModal.text when does flow creation happen",
          ),
        });
      }),
    );

    //--------------------------------------------------------------------------------
    const closeButton = new ButtonComponent(closeModal.controlEl);
    closeButton
      .setButtonText(this.plugin.t("PreviewModal.button close preview"))
      .onClick(() => {
        this.close();
      });
  }

  //--------------------------------------------------------------------------------
  onClose() {
    this.contentEl.empty();
  }
}

// --------------------------------------------------------------------------------
//----------- FLOW DEF DELETION
// --------------------------------------------------------------------------------

export class DeleteFlowDefModal extends Modal {
  constructor(
    app: App,
    private plugin: TextFlowPlugin,
    private settingsTab: TextFlowSettingsTab,
    private flowName: string,
  ) {
    super(app);
    this.settingsTab = settingsTab;
    this.flowName = flowName;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", {
      text: `Delete the definition for "${this.flowName}"`,
    });
    const helperText = contentEl.createEl("p", {
      text: this.plugin.t(
        "deleteModal.createEl.text this will delete flow file",
      ),
      cls: "Tag-modal-helper",
    });

    //--------------------------------------------------------------------------------
    const deleteButton = new ButtonComponent(contentEl);
    deleteButton.setClass("action-button");
    deleteButton.setClass("action-button-delete-modal");
    deleteButton.setWarning();
    deleteButton.setTooltip(`Delete "${this.flowName}".`);
    deleteButton.setIcon("trash");
    deleteButton.onClick(async () => {
      // sync all, just to be thorough
      this.plugin.syncAllLeaves();

      // Get the file path
      const flowFilePath = normalizePath(
        `${this.plugin.settings.systemFolderPath}/${this.flowName}.md`,
      );

      const flowFile = this.app.vault.getAbstractFileByPath(flowFilePath);

      // delete file if present; in two steps to make TypeScript happy
      if (flowFile) {
        if (flowFile instanceof TFile) {
          await this.app.fileManager.trashFile(flowFile);
        }
      }

      // delete flowObject
      delete this.plugin.settings.flows[this.flowName];

      // delete entry from activeRegions
      delete this.plugin.settings.activeRegions[this.flowName];

      // delete overlapObjects for the flow
      Object.keys(this.plugin.settings.flows).forEach((flowName) => {
        if (this.plugin.settings.flows[flowName].overlapObject) {
          if (
            this.plugin.settings.flows[flowName].overlapObject[this.flowName]
          ) {
            delete this.plugin.settings.flows[flowName].overlapObject[
              this.flowName
            ];
          }
        }
      });
      new Notice(
        this.plugin.t("deleteModal.notice successful deletion", {
          this_flowName: this.flowName,
        }),
      );

      // if the user was about to edit this flow, unlock the name input field
      if (this.plugin.settings.flowBuildBasket.flowName === this.flowName) {
        this.plugin.settings.flowBuildBasket.createOrEdit = "create";
      }

      await this.plugin.saveSettings();
      this.settingsTab.display();
      this.close();
    });

    //--------------------------------------------------------------------------------
    const cancelButton = new ButtonComponent(contentEl);
    cancelButton.setClass("action-button");
    cancelButton.setClass("action-button-cancel");
    cancelButton.setCta();
    cancelButton.setTooltip(
      this.plugin.t("deleteModal.cancelButton cancel deletion"),
    );
    cancelButton.setIcon("x-circle");
    cancelButton.onClick(async () => {
      this.settingsTab.display();
      this.close();
    });
  }
}

// --------------------------------------------------------------------------------
//----------- RESTORE FLOW DEFS (backup)
// --------------------------------------------------------------------------------

export class RestoreFlowDefModal extends Modal {
  constructor(
    app: App,
    private plugin: TextFlowPlugin,
    private settingsTab: TextFlowSettingsTab,
  ) {
    super(app);
    this.settingsTab = settingsTab;
  }

  private decisionBasket: { [key: string]: { [key: string]: boolean } } = {
    replace: {},
    restore: {},
    delete: {},
  };

  private getBackup = async () => {
    // make the path of the backup.json
    let backupPath = "";
    if (this.plugin.settings.systemFolderPath) {
      backupPath = normalizePath(
        path.join(
          this.plugin.settings.systemFolderPath,
          "textFlowDefBackup.json",
        ),
      );
    }

    const fileExists = await this.app.vault.adapter.exists(backupPath);

    if (!fileExists) return null;

    // variable to hold the contents if the file exists
    let parsedJson;
    const rawContents = await this.app.vault.adapter.read(backupPath);
    parsedJson = JSON.parse(rawContents);

    if (Object.keys(parsedJson).length === 0) return null;

    return { parsedJson, backupPath };
  };

  //--------------------------------------------------------------------------------
  onOpen = async () => {
    this.display();
  };

  display = async () => {
    const { contentEl } = this;
    contentEl.empty();

    const flowDisplay = contentEl.createDiv({
      cls: "headline-container",
    });

    flowDisplay.createEl("h3", {
      text: this.plugin.t("backup.headline"),
      cls: "headline-text",
    });

    //--------------------------------------------------------------------------------
    // check if we have something to display
    const exists = await this.getBackup();
    if (!exists) {
      // if we don't, tell the user how to get something to display
      const flowExplanation = flowDisplay
        .createDiv()
        .setText(this.plugin.t("backup.explanation empty"));

      const dismissButton = new ButtonComponent(contentEl);
      dismissButton
        .setButtonText(
          this.plugin.t("backup.dismissButton.setButtonText dismiss"),
        )
        .onClick(async (buttonEl: MouseEvent) => {
          this.close();
        });
    } else {
      //------------------------------------------------------------------------
      // if we do, display that
      const { parsedJson, backupPath } = exists;

      const flowExplanation = new Setting(flowDisplay).setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t("backup.explanation select"),
          });
        }),
      );

      //--------------------------------------------------------------------------------
      const flowsSorted: string[] = [];
      Object.keys(parsedJson).forEach((flow) => {
        flowsSorted.push(flow);
      });

      flowsSorted.sort((a, b) => a.localeCompare(b));

      for (let flowName of flowsSorted) {
        const shownFlow = parsedJson[flowName];

        // --- DISPLAY PREPARATIONS ----------------------------------
        // Set up strings to display flow criteria

        // SOURCE
        let source = "";
        if (shownFlow.definitionMode === "dvQuery") {
          source +=
            this.plugin.t("flowDisplay.flowShow. source dvQuery") +
            `(${shownFlow.flowDefinition.dvQuery}`;
        }

        if (shownFlow.definitionMode === "foldersTagsProps") {
          source += this.plugin.t("flowDisplay.flowShow.setDesc.1 source");

          if (
            shownFlow.flowDefinition.folderIncluded === "" ||
            shownFlow.flowDefinition.folderIncluded === "/"
          ) {
            source += "/";
          } else {
            source += `${shownFlow.flowDefinition.folderIncluded}`;
          }
        }

        if (shownFlow.definitionMode === "bookmarks") {
          source +=
            this.plugin.t("flowDisplay.source.alt bookmark group") +
            shownFlow.flowDefinition.bookmarks;
        }

        // string creation for foldersTagsProps
        // INCLUSION
        const included: string[] = [];
        if (shownFlow.flowDefinition.tagsIncluded?.trim()) {
          included.push(
            this.plugin.t("flowDisplay.included tags", {
              shownFlow_flowDefinition_tagsIncluded:
                shownFlow.flowDefinition.tagsIncluded,
            }),
          );
        }
        if (shownFlow.flowDefinition.propsIncluded?.trim()) {
          included.push(
            this.plugin.t("flowDisplay.included props", {
              shownFlow_flowDefinition_propsIncluded:
                shownFlow.flowDefinition.propsIncluded,
            }),
          );
        }
        const inclusionString = included.length > 0 ? included.join(" | ") : "";

        // EXCLUSION
        const excluded: string[] = [];
        if (
          !shownFlow.flowDefinition.bookmarks &&
          shownFlow.flowDefinition.folderExcluded?.trim()
        ) {
          excluded.push(
            this.plugin.t("flowDisplay.excluded folders", {
              shownFlow_flowDefinition_folderExcluded:
                shownFlow.flowDefinition.folderExcluded,
            }),
          );
        }
        if (shownFlow.flowDefinition.tagsExcluded?.trim()) {
          excluded.push(
            this.plugin.t("flowDisplay.excluded tags", {
              shownFlow_flowDefinition_tagsExcluded:
                shownFlow.flowDefinition.tagsExcluded,
            }),
          );
        }
        if (shownFlow.flowDefinition.propsExcluded?.trim()) {
          excluded.push(
            this.plugin.t("flowDisplay.excluded props", {
              shownFlow_flowDefinition_propsExcluded:
                shownFlow.flowDefinition.propsExcluded,
            }),
          );
        }
        const exclusionString = excluded.length > 0 ? excluded.join(" | ") : "";

        // --- THE DISPLAY ITSELF -------------------------------
        const flowShow = new Setting(flowDisplay);
        flowShow
          .setName(`${flowName}`)
          .setDesc(
            createFragment((desc) => {
              desc.createSpan({
                text: source,
              });
              if (inclusionString != "" && inclusionString != undefined) {
                desc.createEl("br");
                desc.createSpan({
                  text: this.plugin.t(
                    "flowDisplay.flowShow.setDesc.2 inclusion criteria",
                    { inclusionString: inclusionString },
                  ),
                });
              }
              if (exclusionString != "" && exclusionString != undefined) {
                desc.createEl("br");
                desc.createSpan({
                  text: this.plugin.t(
                    "flowDisplay.flowShow.setDesc.3 exclusion criteria",
                    { exclusionString: exclusionString },
                  ),
                });
              }
            }),
          )

          //---------------------------------------------------------------------------
          .addButton((replaceButton) => {
            replaceButton
              .setIcon("replace")
              .setTooltip(
                this.plugin.t("backup.restoreButton.setButtonText replace"),
              )
              .onClick(async () => {
                // if the button has not been clicked yet
                if (!this.decisionBasket.replace[flowName]) {
                  replaceButton.buttonEl.classList.add("mod-cta");
                  this.decisionBasket.replace[flowName] = true;
                } else {
                  replaceButton.buttonEl.classList.remove("mod-cta");
                  delete this.decisionBasket.replace[flowName];
                }
              });
          })

          //---------------------------------------------------------------------------
          .addButton((restoreButton) => {
            restoreButton
              .setIcon("download")
              .setTooltip(
                this.plugin.t("backup.restoreButton.setButtonText restore"),
              )
              .onClick(async () => {
                // if the button has not been clicked yet
                if (!this.decisionBasket.restore[flowName]) {
                  restoreButton.buttonEl.classList.add("mod-cta");
                  this.decisionBasket.restore[flowName] = true;
                } else {
                  restoreButton.buttonEl.classList.remove("mod-cta");
                  delete this.decisionBasket.restore[flowName];
                }
              });
          })
          //---------------------------------------------------------------------------
          .addButton((deleteButton) => {
            deleteButton
              .setIcon("trash")
              .setTooltip(
                this.plugin.t("backup.deleteButton.setButtonText delete"),
              )
              .onClick(async () => {
                // if the button has not been clicked yet
                if (!this.decisionBasket.delete[flowName]) {
                  deleteButton.buttonEl.classList.add("mod-warning");
                  this.decisionBasket.delete[flowName] = true;
                } else {
                  deleteButton.buttonEl.classList.remove("mod-warning");
                  delete this.decisionBasket.delete[flowName];
                }
              });
          });
      }

      //------------------------------------------------------------------------------
      const okayButton = new ButtonComponent(contentEl);
      okayButton
        .setClass("setting-tab-button-spacing")
        .setButtonText(this.plugin.t("backup.okayButton.setButtonText okay"))
        .onClick(async (buttonEl: MouseEvent) => {
          // function that replaces existing definitions or puts defs back with a cleaned up name
          const replaceDef = () => {
            Object.keys(this.decisionBasket.replace).forEach((flowName) => {
              const starIndex = flowName.indexOf("*");
              const cleanedFlowName = flowName.slice(0, starIndex);
              // check if we have a flow by this name and replace the definition
              if (this.plugin.settings.flows[cleanedFlowName]) {
                this.plugin.settings.flows[cleanedFlowName].definitionMode =
                  parsedJson[flowName].definitionMode;
                this.plugin.settings.flows[cleanedFlowName].flowDefinition =
                  parsedJson[flowName].flowDefinition;
                this.plugin.settings.flows[cleanedFlowName].folderTitles =
                  parsedJson[flowName].folderTitles;
                this.plugin.settings.flows[cleanedFlowName].flaggedForRebuild =
                  true;
              } else {
                // otherwise create it fresh
                this.plugin.settings.flows[cleanedFlowName] =
                  parsedJson[flowName];
              }
            });
          };

          //--------------------------------------------------------------------------
          // function that just puts the definition back as is
          const restoreDef = () => {
            Object.keys(this.decisionBasket.restore).forEach((flowName) => {
              const cleanedName = flowName.replace("*", " ");
              this.plugin.settings.flows[cleanedName] = parsedJson[flowName];
            });
          };

          // function that deletes definitions.
          const deleteDef = () => {
            Object.keys(this.decisionBasket.delete).forEach((flowName) => {
              delete parsedJson[flowName];
            });
          };

          // the calls
          replaceDef();
          restoreDef();
          deleteDef();

          await this.plugin.saveSettings();

          await this.app.vault.adapter.write(
            backupPath,
            JSON.stringify(parsedJson, null, 2),
          );
          this.settingsTab.display();
          this.close();
        });

      //---------------------------------------------------------------------------
      const dismissButton = new ButtonComponent(contentEl);
      dismissButton
        .setButtonText(
          this.plugin.t("backup.dismissButton.setButtonText dismiss"),
        )
        .onClick(async (buttonEl: MouseEvent) => {
          this.close();
        });
    }
  };
}

// --------------------------------------------------------------------------------
//-------- FLOW SWITCHING ---------------------------------------------------------
// --------------------------------------------------------------------------------

export class FlowSwitcherModal extends Modal {
  private plugin: TextFlowPlugin;
  private currentActiveLeafID: string | undefined;
  private rebuildString: string | undefined;
  private listeners: Array<{
    element: HTMLElement | Document;
    type: string;
    handler: EventListener;
  }> = [];

  constructor(app: App, plugin: TextFlowPlugin) {
    super(app);
    this.plugin = plugin;
    this.currentActiveLeafID = this.getActiveLeafID();
    this.rebuildString = "";
  }

  // the shitload of functions involved when cracking open a flow
  private flowOpeningStuff = async (
    flowName: string,
    leaf: WorkspaceLeaf,
    file: TFile,
  ) => {
    await leaf.openFile(file);
    leaf.setPinned(true);
    if (leaf.view instanceof MarkdownView)
      await this.plugin.setUpFlow(flowName, leaf.view);
    this.display();
    this.plugin.syncAllLeaves();
  };

  //-----------------------------------------------------------------------------
  // so we can highlight the active leaf's entry
  private getActiveLeafID = (): string => {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view) {
      const currentActiveLeafID = this.plugin.settingsTabFunctions.getLeafID(
        view.leaf,
      );
      return currentActiveLeafID;
    }
    return "";
  };

  //--------------------------------------------------------------------------------
  // To keep track of our listeners
  private addManagedListener(
    element: HTMLElement | Document,
    type: string,
    handler: EventListener,
  ) {
    this.listeners.push({ element, type, handler });
    element.addEventListener(type, handler);
  }

  private focusLeaf = (leafID: string) => {
    const targetLeaf = this.app.workspace.getLeafById(leafID);
    if (targetLeaf) {
      this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
      /*if (targetLeaf instanceof MarkdownView) {
      await this.plugin.setUpFlow(activeFlow, targetLeaf);
    }*/
      this.currentActiveLeafID =
        this.plugin.settingsTabFunctions.getLeafID(targetLeaf);
    }
    this.display();
  };

  //--------------------------------------------------------------------------------
  private closeLeaf = async (leafID: string) => {
    const targetLeaf = this.app.workspace.getLeafById(leafID);
    if (targetLeaf) {
      targetLeaf.detach();
      this.plugin.manageActiveRegions();
      await this.plugin.saveSettings();
      this.currentActiveLeafID = this.getActiveLeafID();
      await this.display();
    }
  };

  //--------------------------------------------------------------------------------
  async onOpen() {
    await this.display();
    this.plugin.registerModalUpdateCallback(async () => await this.display());
  }

  async display() {
    const { contentEl, modalEl } = this;
    contentEl.empty();

    // ----------------------------------------------------------
    // -------- GATHERING AND PRE-PROCESSING OF FLOW DATA -------
    // ----------------------------------------------------------
    // ---- PREPARE ACTIVE REGIONS ---------------
    // object to make flow info easier to grab
    // activeFlowInfoObject: {flowName: {leafID: regionName}
    const activeFlowInfoObject: { [key: string]: { [key: string]: string } } =
      {};

    // iterate over active flow object
    Object.keys(this.plugin.settings.activeRegions).forEach((flowName) => {
      // initialise
      activeFlowInfoObject[flowName] = {};
      // gather the info on the active flow's leaves:
      if (
        this.plugin.settings.activeRegions[flowName] &&
        Object.keys(this.plugin.settings.activeRegions[flowName]).length > 0
      ) {
        Object.keys(this.plugin.settings.activeRegions[flowName]).forEach(
          (leafID) => {
            // get the note name; normalisation of path not necessary
            if (this.plugin.settings.activeRegions[flowName][leafID].path) {
              if (
                // if it's a file, get the basename
                !this.plugin.settings.activeRegions[flowName][
                  leafID
                ].path.startsWith("#")
              ) {
                const activeRegion = basename(
                  this.plugin.settings.activeRegions[flowName][leafID].path,
                );
                activeFlowInfoObject[flowName][leafID] = activeRegion;
              } else if (
                // if it's a folder, just take the name
                this.plugin.settings.activeRegions[flowName][
                  leafID
                ].path.startsWith("#")
              ) {
                const activeRegion =
                  this.plugin.settings.activeRegions[flowName][leafID].path;
                activeFlowInfoObject[flowName][leafID] = activeRegion;
              }
            }
          },
        );
      }
    });

    // Now we sort it all to make the display predictable to the user
    const sortActiveRegionsArray: string[] = [];
    Object.keys(activeFlowInfoObject).forEach((flow) => {
      sortActiveRegionsArray.push(flow);
    });
    sortActiveRegionsArray.sort();

    // ---------- PREPARE INACTIVE REGIONS --------------------
    const inactiveFlowArray: string[] = [];
    Object.keys(this.plugin.settings.flows).forEach((flowName) => {
      // if there's entries for a flow
      if (!sortActiveRegionsArray.includes(flowName)) {
        inactiveFlowArray.push(flowName);
      }
    });
    const sortedInactiveFlowArray = inactiveFlowArray.sort((a, b) =>
      a.localeCompare(b),
    );

    // ----------------------------------------------------------
    // --------------------- DISPLAY LOGIC  ---------------------
    // ----------------------------------------------------------

    // main container that holds active and inactive flows
    const mainContainer = contentEl.createDiv({
      cls: "textflow-switcher-main-container",
    });

    // ---- DISPLAY ACTIVE FLOWS -----------
    // sub-container that holds only active flows
    const activeFlowContainer = mainContainer.createDiv({
      text:
        sortActiveRegionsArray.length > 0
          ? ""
          : this.plugin.t("switcherModal.info no active flows found"),
      cls: "textflow-switcher-active-container textflow-switcher-border-rounded-accent",
    });

    // container for each flow's two parts: header with its buttons and the regions with their buttons
    for (let activeFlow of sortActiveRegionsArray) {
      const activeFlowEntry = activeFlowContainer.createDiv({
        cls: "flow-switch-modal-active-entry",
      });

      // container for the header
      const flowHeader = activeFlowEntry.createDiv({
        cls: "flow-switch-modal-active-header",
      });

      // ------------- HEADER FLOW NAME
      const flowIconSpan = flowHeader.createSpan();
      setIcon(flowIconSpan, "file-text");

      const flowName = flowHeader.createSpan({
        text: `${activeFlow}`,
        cls: "flow-switch-modal-active-header-flow-name",
      });

      // -------- HEADER BUTTONS -------
      // ---- conditionals for styling
      let goOpen = "neutral";
      let goSync = "neutral";
      let goRebuild = "neutral";

      // check if there is unsynced stuff for the flow
      if (
        this.plugin.settings.flows[activeFlow].unsyncedRegionsArray.length > 0
      ) {
        goOpen = "neutral";
        goSync = "must"; // must sync
        goRebuild = "no-go"; // don't rebuild; it would overwrite the unsynced stuff
      }

      // if no sync is required, check if flow is flagged for rebuild
      if (
        goSync === "neutral" &&
        this.plugin.settings.flows[activeFlow].flaggedForRebuild
      ) {
        goOpen = "no-go";
        goSync = "no-go";
        goRebuild = "must";
      }

      if (this.plugin.flowOutOfSync.includes(activeFlow)) {
        goSync = "no-go";
        goRebuild = "must";
      }

      // ------------ All the buttons for the active flowses headers --------
      // Button that opens in a new tab
      const openActiveTabButton = new ButtonComponent(flowHeader);
      openActiveTabButton
        .setIcon("play")
        .setClass(`flow-switch-modal-header-button-${goOpen}`)
        .setClass("clickable-icon")
        .setTooltip(this.plugin.t("switcherModal.buttons new tab"))
        .onClick(async () => {
          if (goOpen === "neutral" || goOpen === "must") {
            await this.plugin.syncAllLeaves();

            const file = this.app.vault.getAbstractFileByPath(
              this.plugin.settings.flows[activeFlow].flowFilePath,
            );
            if (file instanceof TFile) {
              const leaf = this.app.workspace.getLeaf("tab");
              const flowName = this.plugin.isFlowFile(file.path);
              if (!flowName) return;
              await this.flowOpeningStuff(flowName, leaf, file);
            }
          }
        });

      //------------------------------------------------------------------------------
      // Button that opens in split to the right
      const openActiveRightButton = new ButtonComponent(flowHeader);
      openActiveRightButton
        .setIcon("step-forward")
        .setClass(`flow-switch-modal-header-button-${goOpen}`)
        .setClass("clickable-icon")
        .setTooltip(this.plugin.t("switcherModal.buttons split right"))
        .onClick(async () => {
          if (goOpen === "neutral" || goOpen === "must") {
            const file = this.app.vault.getAbstractFileByPath(
              this.plugin.settings.flows[activeFlow].flowFilePath,
            );
            if (file instanceof TFile) {
              const leaf = this.app.workspace.getLeaf("split");
              const flowName = this.plugin.isFlowFile(file.path);
              if (!flowName) return;
              await this.flowOpeningStuff(flowName, leaf, file);
            }
          }
        });

      //-----------------------------------------------------------------------------
      // Button that opens in a split down
      const openActiveDownButton = new ButtonComponent(flowHeader);
      openActiveDownButton
        .setIcon("step-forward")
        .setClass(`flow-switch-modal-header-button-${goOpen}`)
        .setClass("flow-switch-modal-header-button-down")
        .setClass("clickable-icon")
        .setTooltip(this.plugin.t("switcherModal.buttons split down"))
        .onClick(async () => {
          if (goOpen === "neutral" || goOpen === "must") {
            const file = this.app.vault.getAbstractFileByPath(
              this.plugin.settings.flows[activeFlow].flowFilePath,
            );
            if (file instanceof TFile) {
              const leaf = this.app.workspace.getLeaf("split", "horizontal");
              const flowName = this.plugin.isFlowFile(file.path);
              if (!flowName) return;
              await this.flowOpeningStuff(flowName, leaf, file);
            }
          }
        });

      //-----------------------------------------------------------------------------
      // SyncButton
      new ButtonComponent(flowHeader)
        .setIcon("download")
        .setClass(`flow-switch-modal-header-button-${goSync}`)
        .setClass("clickable-icon")
        .onClick(async () => {
          if (goSync === "neutral" || goSync === "must") {
            await this.plugin.syncAllLeaves();
            await this.plugin.saveSettings();
            await this.display();
          } else {
            return;
          }
        });

      //----------------------------------------------------------------------------
      // Button to rebuild
      new ButtonComponent(flowHeader)
        .setIcon("rotate-cw")
        .setClass(`flow-switch-modal-header-button-rebuild-${goRebuild}`)
        .setClass("clickable-icon")
        .onClick(async () => {
          if (goRebuild === "neutral" || goRebuild === "must") {
            const allLeaves = this.app.workspace.getLeavesOfType("markdown");
            for (const leaf of allLeaves) {
              const view =
                this.plugin.settingsTabFunctions.getMarkdownView(leaf);
              if (!view) continue;
              const filePath = view.file?.path;
              if (!filePath) continue;
              const flowName = this.plugin.isFlowFile(filePath);
              if (flowName === activeFlow)
                // make double sure we got everything set up for the overlay,
                // so user doesn't type while we rebuild
                await this.plugin.setUpFlow(activeFlow, view);
            }
            await this.plugin.settingsTabFunctions.flowBuildingBundle(
              activeFlow,
              "switcher",
            );
            await this.plugin.saveSettings();
            await this.display();
          } else if (goRebuild === "no-go") {
            return;
          }
        });

      //---------------------------------------------------------------------------
      // Button to close all active leaves that contain this flow
      new ButtonComponent(flowHeader)
        .setIcon("x")
        .setClass(`flow-switcher-modal-neutral`)
        .setClass("clickable-icon")
        .onClick(async () => {
          const leaves = this.app.workspace.getLeavesOfType("markdown");
          Object.keys(activeFlowInfoObject[activeFlow]).forEach(
            async (leafID) => {
              this.closeLeaf(leafID);
            },
          );
        });

      // ------ ACTIVE FLOW LEAVES (navigation area) --------------
      // if many leaves are open, we want some visual distinction
      let activeRegionBorderColorCounter = 0;

      Object.keys(activeFlowInfoObject[activeFlow]).forEach((leafID) => {
        // check if the leaf is the active one, so we can highlight it
        const active = leafID === this.currentActiveLeafID ? "active" : "nope";
        activeRegionBorderColorCounter += 1;
        let activeRegionBorderColorCalculator =
          activeRegionBorderColorCounter % 2;

        // region container
        const flowRegion = activeFlowEntry.createDiv({
          cls: `flow-switch-modal-active-region textflow-switcher-border-bottom-${activeRegionBorderColorCalculator} ${active}`,
        });

        // region icon
        const regionIconSpan = flowRegion.createSpan({
          cls: `flow-switch-modal-active-region-down-arrow`,
        });
        setIcon(regionIconSpan, "corner-down-right");

        // region name
        // first the logic to find and display overlap
        let overlap = "";

        const overlapArray: string[] = [];
        Object.keys(activeFlowInfoObject).forEach((flowName) => {
          if (flowName != activeFlow) {
            if (this.plugin.settings.flows[activeFlow].overlapObject) {
              if (
                this.plugin.settings.flows[activeFlow].overlapObject[flowName]
              ) {
                const pathArray = Object.keys(
                  this.plugin.settings.flows[activeFlow].overlapObject[
                    flowName
                  ],
                );
                pathArray.forEach((path) => {
                  if (
                    // if we're not handling a title and the region name is the file name
                    !leafID.startsWith("#") &&
                    path.endsWith(activeFlowInfoObject[activeFlow][leafID])
                  ) {
                    if (!overlapArray[0].contains(flowName)) {
                      overlapArray.push(flowName);
                      overlap = "⚭";
                    }
                  }
                });
              }
            }
          }
        });

        let overlapAriaLabel = ``;
        if (overlap === "⚭") {
          const overlapString = overlapArray.join(", ");
          overlapAriaLabel = this.plugin.t(
            "switcherModal.info overlapping regions",
            { overlapString: overlapString },
          );
        }

        const regionName = flowRegion.createSpan({
          text: `${activeFlowInfoObject[activeFlow][leafID]} ${overlap}`,
          cls: "flow-switch-modal-active-region-name",
          attr: {
            "aria-label": `${overlapAriaLabel}`,
          },
        });

        this.addManagedListener(regionName, "click", (_event) => {
          this.focusLeaf(leafID);
        });

        // ----------- GOTO BUTTON ------------
        const navGotoButton = new ButtonComponent(flowRegion);
        navGotoButton
          .setIcon("arrow-big-right")
          .setClass(`flow-switch-modal-header-button-neutral`)
          .setClass("clickable-icon")
          .onClick(async () => {
            this.focusLeaf(leafID);
          });

        // ----------- CLOSE BUTTON ------------
        const navCloseButton = new ButtonComponent(flowRegion);
        navCloseButton
          .setIcon("x")
          .setClass(`flow-switch-modal-header-button-neutral`)
          .setClass("clickable-icon")
          .onClick(async () => {
            this.closeLeaf(leafID);
          });
      });
    }

    // ---- DISPLAY INACTIVE FLOWS -----------
    const inactiveFlowContainer = mainContainer.createDiv({
      text:
        sortedInactiveFlowArray.length > 0
          ? ""
          : this.plugin.t("switcherModal.info no inactive flows found"),
      cls: "textflow-switcher-INactive-container textflow-switcher-border-rounded-faint",
    });

    let inactiveRegionBorderColorCounter = 0;
    // container for each flow's two parts: header and regions
    for (let inactiveFlow of sortedInactiveFlowArray) {
      inactiveRegionBorderColorCounter += 1;
      let inactiveRegionBorderColorCalculator =
        inactiveRegionBorderColorCounter % 2;

      // container for the header
      const inactiveFlowHeader = inactiveFlowContainer.createDiv({
        cls: `flow-switch-modal-INactive-header textflow-switcher-border-bottom-${inactiveRegionBorderColorCalculator}`,
      });

      // ------------- HEADER FLOW NAME
      const inactiveFlowIconSpan = inactiveFlowHeader.createSpan();
      setIcon(inactiveFlowIconSpan, "file-text");

      const inactiveFlowName = inactiveFlowHeader.createSpan({
        text: `${inactiveFlow}`,
        cls: "flow-switch-modal-INactive-header-flow-name",
      });

      // -------- INACTIVE FLOWS HEADER BUTTONS -------
      // ---- conditionals for styling
      let goOpen = "neutral";
      let goSync = "neutral";
      let goRebuild = "neutral";

      // check if there is unsynced stuff for the flow
      if (
        this.plugin.settings.flows[inactiveFlow].unsyncedRegionsArray.length > 0
      ) {
        goOpen = "neutral";
        goRebuild = "no-go";
        goSync = "must"; // must sync
      }

      // if no sync is required, check if there's a file for that flow
      const flowFile = this.app.vault.getAbstractFileByPath(
        this.plugin.settings.flows[inactiveFlow].flowFilePath,
      );
      if (!flowFile) {
        goOpen = "no-go";
        goRebuild = "must";
        goSync = "no-go";
      }

      // check if flow is flagged for rebuild
      if (
        goSync === "neutral" &&
        this.plugin.settings.flows[inactiveFlow].flaggedForRebuild
      ) {
        goOpen = "no-go";
        goRebuild = "must";
        goSync = "no-go";
      }

      if (this.plugin.flowOutOfSync.includes(inactiveFlow)) {
        goRebuild = "must";
        goSync = "no-go";
      }

      // ----------- OPEN BUTTON ------------
      const openInactiveTabButton = new ButtonComponent(inactiveFlowHeader);
      openInactiveTabButton
        .setIcon("play")
        .setClass(`flow-switch-modal-header-button-${goOpen}`)
        .setClass("clickable-icon")
        .setTooltip(this.plugin.t("switcherModal.buttons new tab"))
        .onClick(async () => {
          if (goOpen === "neutral" || goOpen === "must") {
            const file = this.app.vault.getAbstractFileByPath(
              this.plugin.settings.flows[inactiveFlow].flowFilePath,
            );

            if (file instanceof TFile) {
              const leaf = this.app.workspace.getLeaf("tab");
              const flowName = this.plugin.isFlowFile(file.path);
              if (!flowName) return;
              await this.flowOpeningStuff(flowName, leaf, file);
            }
          }
        });

      //----------------------------------------------------------------------------
      const openInactiveRightButton = new ButtonComponent(inactiveFlowHeader);
      openInactiveRightButton
        .setIcon("step-forward")
        .setClass(`flow-switch-modal-header-button-${goOpen}`)
        .setClass("clickable-icon")
        .setTooltip(this.plugin.t("switcherModal.buttons split right"))
        .onClick(async () => {
          if (goOpen === "neutral" || goOpen === "must") {
            const file = this.app.vault.getAbstractFileByPath(
              this.plugin.settings.flows[inactiveFlow].flowFilePath,
            );
            if (file instanceof TFile) {
              const leaf = this.app.workspace.getLeaf("split");
              const flowName = this.plugin.isFlowFile(file.path);
              if (!flowName) return;
              await this.flowOpeningStuff(flowName, leaf, file);
            }
          }
        });

      //--------------------------------------------------------------------------
      const openInactiveDownButton = new ButtonComponent(inactiveFlowHeader);
      openInactiveDownButton
        .setIcon("step-forward")
        .setClass(`flow-switch-modal-header-button-${goOpen}`)
        .setClass("flow-switch-modal-header-button-down")
        .setClass("clickable-icon")
        .setTooltip(this.plugin.t("switcherModal.buttons split down"))
        .onClick(async () => {
          if (goOpen === "neutral" || goOpen === "must") {
            const file = this.app.vault.getAbstractFileByPath(
              this.plugin.settings.flows[inactiveFlow].flowFilePath,
            );
            if (file instanceof TFile) {
              const leaf = this.app.workspace.getLeaf("split", "horizontal");
              const flowName = this.plugin.isFlowFile(file.path);
              if (!flowName) return;
              await this.flowOpeningStuff(flowName, leaf, file);
            }
          }
        });

      // ----------- REBUILD BUTTON --------------------------------------
      const rebuildButton = new ButtonComponent(inactiveFlowHeader);
      rebuildButton
        .setIcon("rotate-cw")
        .setClass(`flow-switch-modal-header-button-${goRebuild}`)
        .setClass("clickable-icon")
        .setTooltip(this.plugin.t("switcherModal.buttons rebuild"))
        .onClick(async () => {
          if (goRebuild === "neutral" || goRebuild === "must") {
            await this.plugin.settingsTabFunctions.flowBuildingBundle(
              inactiveFlow,
              "switcher",
            );
            await this.plugin.saveSettings();
            await this.display();
          } else {
            return;
          }
        });
    }
  }

  onClose() {
    this.plugin.unregisterModalUpdateCallback();
    const { contentEl } = this;
    contentEl.empty();
  }
}
// --------------------------------------------------------------------------------
// ------------------------ FUZZY NAVIGATON MODAL ------------------------
// --------------------------------------------------------------------------------
// This modal was largely written by Claude 3.5 Sonnet,
// but I put it all together and debugged it
export class FuzzyNavModal extends FuzzySuggestModal<Types.SuggestionItem> {
  constructor(
    app: App,
    private plugin: TextFlow,
    private settings: Types.TextFlowSettings,
    private activeFlowName?: string,
  ) {
    super(app);
  }

  onOpen() {
    super.onOpen();

    let placeholderText = "Search for flows and paths...";
    if (this.activeFlowName) {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) {
        const currentActiveleafID = "";
      } else {
        const currentActiveleafID = this.plugin.settingsTabFunctions.getLeafID(
          view.leaf,
        );
        let activePath: string | undefined = "";
        if (
          this.plugin.settings.activeRegions[this.activeFlowName][
            currentActiveleafID
          ]
        ) {
          activePath =
            this.plugin.settings.activeRegions[this.activeFlowName][
              currentActiveleafID
            ].path;
        }
        placeholderText = `? ${this.activeFlowName}: ${activePath}`;
      }
    }

    this.setPlaceholder(`${placeholderText}`);

    //----------------------------------------------------------------------------
    // Add instructions below the search box
    this.setInstructions([
      {
        command: "?",
        purpose: this.plugin.t("fuzzyNavigationModal.info flow in active leaf"),
      },
      {
        command: "*",
        purpose: this.plugin.t("fuzzyNavigationModal.info other flows"),
      },
      {
        command: ":",
        purpose: this.plugin.t("fuzzyNavigationModal.info flow names"),
      },
      // Add any other custom shortcuts you plan to implement
    ]);
  }

  //---------------------------------------------------------------------------
  getItems(): Types.SuggestionItem[] {
    const activeFlowItems: Types.SuggestionItem[] = [];
    const otherFlowItems: Types.SuggestionItem[] = [];
    const flowNames: Types.SuggestionItem[] = [];

    // Contents of the flow in the ACTIVE LEAF if it exists
    Object.keys(this.settings.flows).forEach((flowName) => {
      if (flowName === this.activeFlowName) {
        Object.keys(this.settings.flows[flowName].flowMap).forEach((region) => {
          const filePath = this.settings.flows[flowName].flowMap[region].path;

          otherFlowItems.push({
            type: "active-flow-path",
            flowName: flowName,
            region: region,
            path: filePath,
            searchableText: `? ${region}`,
          });
        });
      }
    });

    // contents of flows that are NOT IN THE ACTIVE LEAF
    Object.keys(this.settings.flows).forEach((flowName) => {
      if (flowName != this.activeFlowName) {
        Object.keys(this.settings.flows[flowName].flowMap).forEach((region) => {
          const filePath = this.settings.flows[flowName].flowMap[region].path;

          otherFlowItems.push({
            type: "other-flow-path",
            flowName: flowName,
            region: region,
            path: filePath,
            searchableText: `* ${region}`,
          });
        });
      }
    });

    // all the FLOW NAMES
    Object.keys(this.settings.flows).forEach((flowName) => {
      const filePath = this.settings.flows[flowName].flowFilePath;

      flowNames.push({
        type: "flow-name",
        flowName: flowName,
        region: "",
        path: filePath,
        searchableText: `: ${flowName}`,
      });
    });

    return [...activeFlowItems, ...otherFlowItems, ...flowNames];
  }

  //--------------------------------------------------------------------------------
  getItemText(item: Types.SuggestionItem): string {
    return item.searchableText;
  }

  //--------------------------------------------------------------------------------
  renderSuggestion(
    fuzzyMatch: FuzzyMatch<Types.SuggestionItem>,
    el: HTMLElement,
  ) {
    const suggestionItem = fuzzyMatch.item;
    let displayFlowName = `${suggestionItem.flowName} `;
    if (suggestionItem.type === "flow-name") {
      displayFlowName = "";
    }

    // make the container
    const contentEl = el.createDiv({ cls: "suggestion-content" });
    contentEl.setText(displayFlowName);

    // Now do another fuzzy match to find and HIGHLIGHT THE SEARCHED CHARS WITHIN RESULTS
    // Claude 3.5 Sonnet wrote this and I don't really understand it, but it works, so...
    const matchElements = fuzzyMatch.match.matches;
    let lastIndex = 0;
    for (const [start, end] of matchElements) {
      if (start > lastIndex) {
        contentEl
          .createSpan()
          .setText(suggestionItem.searchableText.slice(lastIndex, start));
      }
      contentEl
        .createSpan({ cls: "suggestion-highlight" })
        .setText(suggestionItem.searchableText.slice(start, end));
      lastIndex = end;
    }
    if (lastIndex < suggestionItem.searchableText.length) {
      contentEl
        .createSpan()
        .setText(suggestionItem.searchableText.slice(lastIndex));
    }
  }

  //--------------------------------------------------------------------------------
  onChooseItem(item: Types.SuggestionItem, _evt: MouseEvent | KeyboardEvent) {
    interface ObsidianEditor extends Editor {
      cm?: EditorView;
    }

    // this is all my own code again

    // ------------- HELPER FUNCTIONS --------------
    // For items that need leaf and cursor stuff done
    const prepareFlowLeafAndCallScroll = async (item: Types.SuggestionItem) => {
      let lastActiveLeafID = "";

      // if we have open leaves for the flow
      if (
        this.plugin.settings.activeRegions[item.flowName] &&
        item.type != "flow-name"
      ) {
        // targeting the last active leaf
        lastActiveLeafID =
          this.plugin.settings.flows[item.flowName].lastActiveLeaves[0];

        // Now get that leaf and do the thing
        let leaf: WorkspaceLeaf | null = null;
        this.app.workspace.iterateAllLeaves((iteratorLeaf) => {
          const leafViewState = iteratorLeaf.getViewState();
          if (leafViewState.type === "markdown") {
            const iteratorLeafID =
              this.plugin.settingsTabFunctions.getLeafID(iteratorLeaf);
            if (lastActiveLeafID === iteratorLeafID) {
              leaf = iteratorLeaf;
            }
          }
        });

        if (leaf) {
          let cursorPos = item.cursorPos;
          if (!item.cursorPos && leaf) {
            cursorPos = await findCursorPos(item, leaf);
          }
          // Set this for convenience but maybe also necessary for scrolling when activating leaf
          // I don't even know anymore, I've been fighting with this part of the code for so long
          this.plugin.manageCursorPos(
            item.flowName,
            lastActiveLeafID,
            item,
            cursorPos,
          );
          this.app.workspace.setActiveLeaf(leaf, { focus: true });
          if (cursorPos) {
            scrollToTarget(item, cursorPos);
          }
        } else {
        }
      } else if (
        !this.plugin.settings.activeRegions[item.flowName] ||
        item.type === "flow-name"
      ) {
        // if there are no active leaves we could target or we want to open a new one
        // I have no idea why this works so well for "flow-name" items
        const file = this.app.vault.getAbstractFileByPath(
          this.plugin.settings.flows[item.flowName].flowFilePath,
        );
        if (file instanceof TFile) {
          const leaf = this.app.workspace.getLeaf("tab");
          await leaf.openFile(file);
          leaf.setPinned(true);

          let cursorPos = item.cursorPos;
          if (!item.cursorPos && leaf) {
            cursorPos = await findCursorPos(item, leaf);
          }
          const leafID = this.plugin.settingsTabFunctions.getLeafID(leaf);
          if (cursorPos) {
            this.plugin.manageCursorPos(item.flowName, leafID, item, cursorPos);
            this.app.workspace.setActiveLeaf(leaf, { focus: true });
            scrollToTarget(item, cursorPos);
          }
        }
      }
    };

    //--------------------------------------------------------------------------------
    // if we got a region instead of a cursorPos we find its start pos
    const findCursorPos = async (
      item: Types.SuggestionItem,
      leaf: WorkspaceLeaf,
    ) => {
      // initialise the leaf

      await leaf.loadIfDeferred();

      let text = "";
      const view = this.plugin.settingsTabFunctions.getMarkdownView(leaf);
      if (!view) return;
      const editor = this.plugin.settingsTabFunctions.getEditor(view);
      if (!editor) return;
      const cmEditor = editor.cm;
      if (cmEditor) {
        text = cmEditor.state.doc.toString();
      }
      let flowOrder = 0;
      if (item.region) {
        flowOrder =
          this.plugin.settings.flows[item.flowName].flowMap[item.region]
            .flowOrder;
      }
      const startPosInFlow = this.plugin.findStartOfRegion(
        this.settings.flows[item.flowName],
        flowOrder,
        text,
      );
      return startPosInFlow;
    };

    //--------------------------------------------------------------------------------
    // this only ever cares about the active view, which is why we made sure to open, activate and focus
    const scrollToTarget = async (
      item: Types.SuggestionItem,
      cursorPos?: number,
    ) => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) return;
      const editor = this.plugin.settingsTabFunctions.getEditor(view);
      if (!editor) return;
      if (cursorPos) {
        this.plugin.settingsTabFunctions.scrollToPos(editor, cursorPos);
      } else if (item.cursorPos) {
        this.plugin.settingsTabFunctions.scrollToPos(editor, item.cursorPos);
      }
    };

    // -------- DOING STUFF WITH THE HELPER FUNCTIONS --------------
    prepareFlowLeafAndCallScroll(item);
  }
}
