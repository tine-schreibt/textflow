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
import fs from "fs/promises";
import path from "path";

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
//-----------------------------------------------------------------------------------------

//--------------------------------------------------------------------------------
//----------- CREATE FLOW FROM FOLDER
//--------------------------------------------------------------------------------

export class CreateFlowFromFolder extends Modal {
  constructor(app: App, private plugin: TextFlowPlugin) {
    super(app);
    this.plugin = plugin;
  }
  onOpen() {
    const { contentEl } = this;

    const modalTitle = contentEl.createEl("h2", {
      text: this.plugin.t("CreateFlowFromFolderModal.headline"),
    });
    const description = contentEl.createSpan({
      text: this.plugin.t(
        "CreateFlowFromFolderModal.description refine def in settings"
      ),
    });
    const chooseFlowName = new Setting(contentEl)
      .setName(
        this.plugin.t("createFlows.chooseFlowName.setName name your flow")
      )
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t(
              "createFlows.chooseFlowName.setDesc some characters can't be part of a flow name"
            ),
          });
          desc.createEl("br");
          desc.createSpan({
            text: '? : # * < > [ ] / | \\ "  ^ `',
          });
        })
      );
    chooseFlowName.addText((setFlowName) => {
      // this value has already been set by the click that also calls this modal
      setFlowName.setValue(this.plugin.settings.flowBuildBasket.flowName);

      setFlowName.onChange(async (value) => {
        this.plugin.settings.flowBuildBasket.flowName = value.trim();
        this.plugin.flowService.debouncedSaveSettings();
      });
    });

    // FOLDER TITLES TOGGLE
    const toggleFolderTitles = new Setting(contentEl)
      .setName(this.plugin.t("modal_toggleFolderTitles.setName include folder"))
      .setDesc(
        this.plugin.t(
          "toggleFolderTitles.setDesc will also turn off titles in nav dropdown"
        )
      )
      .addToggle((sortToggle) => {
        sortToggle
          .setValue(this.plugin.settings.flowBuildBasket.folderTitles)
          .onChange(async (value) => {
            this.plugin.settings.flowBuildBasket.folderTitles = value;
            await this.plugin.saveSettings();
          });
      });

    // SORT ORDER TOGGLE
    const sortFlowPathsTagsProperties = new Setting(contentEl).setName(
      this.plugin.t("sortFlowPathsTagsProperties.setName sort order")
    );
    sortFlowPathsTagsProperties.setDesc(
      createFragment((desc) => {
        desc.createSpan({
          text: this.plugin.t(
            "sortFlowPathsTagsProperties.setDesc.1 note order"
          ),
          cls: "text-emphasis",
        });
        desc.createSpan({
          text: this.plugin.t(
            "sortFlowPathsTagsProperties.setDesc.2 description of note order"
          ),
        });
        desc.createEl("br");
        desc.createSpan({
          text: this.plugin.t(
            "sortFlowPathsTagsProperties.setDesc.3 folder order"
          ),
          cls: "text-emphasis",
        });
        desc.createSpan({
          text: this.plugin.t(
            "sortFlowPathsTagsProperties.setDesc.4 description of folder order"
          ),
        });
        desc.createEl("br");
        desc.createSpan({
          text: this.plugin.t(
            "sortFlowPathsTagsProperties.setDesc.5 test them all out"
          ),
        });
      })
    );

    sortFlowPathsTagsProperties.addDropdown((dropdown) => {
      dropdown
        .addOption(
          "noteOrder",
          this.plugin.t(
            "sortFlowPathsTagsProperties.addDropdown.addOption.1 note order"
          )
        )
        .addOption(
          "folderOrder",
          this.plugin.t(
            "sortFlowPathsTagsProperties.addDropdown.addOption.2 folder order"
          )
        );
      dropdown.setValue(
        // remove "custom" as option
        this.plugin.settings.flowBuildBasket.flowCookbook
          .pathsTagsPropertiesSortOrder
          ? this.plugin.settings.flowBuildBasket.flowCookbook
              .pathsTagsPropertiesSortOrder
          : "noteOrder"
      );
      dropdown.onChange(async (value) => {
        this.plugin.settings.flowBuildBasket.flowCookbook.pathsTagsPropertiesSortOrder =
          value as Types.SortOrder;
        await this.plugin.saveSettings();
      });
    });

    let subfoldersExcluded = false;
    const excludeSubfolders = new Setting(contentEl)
      .setName(
        this.plugin.t("modal_toggleSubfolders.setName exclude subfolders")
      )
      .addToggle((sortToggle) => {
        sortToggle.setValue(subfoldersExcluded).onChange(async (value) => {
          subfoldersExcluded = value;
        });
      });

    const saveButton = new ButtonComponent(contentEl);
    saveButton
      .setButtonText(this.plugin.t("saveButton.setButtonText save flow def"))
      .onClick(async (buttonEl: MouseEvent) => {
        if (!this.plugin.settings.systemFolderPath) {
          new Notice(
            this.plugin.t("saveButton.notice create sys folder first")
          );
          return;
        }

        // if checks and flow creation haven't been performed by the preview button
        const validation = this.plugin.flowService.isValidFlowName(
          this.plugin.settings.flowBuildBasket.flowName
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
            this.plugin.settings.flowBuildBasket.flowCookbook.folderIncluded.split(
              ","
            );
          const excludedArray = [];
          for (let folder of folderArray) {
            excludedArray.push(`${folder}/`);
          }
          this.plugin.settings.flowBuildBasket.flowCookbook.folderIncluded =
            excludedArray.join(",");
        }

        // It really helps to save stuff... -.-
        await this.plugin.saveSettings();

        this.plugin.flowService.createFlowDefinition(
          this.plugin.settings.flowBuildBasket
        );

        if (!this.plugin.settings.flowBuildBasket.success) {
          return;
        }

        // write the whole stuff (also flags for rebuild)
        await this.plugin.flowService.writeFlowDef(
          this.plugin.settings,
          this.plugin.settings.flowBuildBasket
        );

        // update conflicts,
        this.plugin.flowService.syncConflictObjects(
          this.plugin.settings.flowBuildBasket
        );

        // save so we can pull our backup
        await this.plugin.saveSettings();
        await this.plugin.flowService.backupFlowDef(
          this.plugin.settings.flowBuildBasket.flowName
        );

        new Notice(
          this.plugin.t("createFromFolder.notice", {
            flowName: this.plugin.settings.flowBuildBasket.flowName,
          })
        );

        // and clean up the basket.
        this.plugin.flowService.resetFlowBuildBasket(
          this.plugin.settings.flowBuildBasket
        );

        await this.plugin.saveSettings();

        this.close();
      });

    const closeButton = new ButtonComponent(contentEl)
      .setButtonText(this.plugin.t("CreateFlowFromFolderModal.close"))
      .onClick(async () => {
        this.plugin.flowService.resetFlowBuildBasket(
          this.plugin.settings.flowBuildBasket
        );
        this.close();
      });
  }

  async onClose() {
    // and clean up the basket.
    this.plugin.flowService.resetFlowBuildBasket(
      this.plugin.settings.flowBuildBasket
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
    private flowBuildBasket: Types.flowBuildBasket
  ) {
    super(app);
    this.plugin = plugin;
    this.flowBuildBasket = flowBuildBasket;
  }
  onOpen() {
    const { contentEl } = this;

    const modalTitle = contentEl.createEl("h2", {
      text: this.plugin.t("PreviewModal.modalTitle preview for flow", {
        this_flowBuildBasket_flowName: this.flowBuildBasket.flowName,
      }),
    });

    // Show found overlaps
    if (Object.keys(this.flowBuildBasket.conflictObject).length > 0) {
      const conflictText = new Setting(contentEl).setDesc(
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
          Object.keys(this.flowBuildBasket.conflictObject).forEach((flow) => {
            if (flow != this.flowBuildBasket.oldFlowName) {
              // get the paths
              const conflictingPaths = Object.keys(
                this.flowBuildBasket.conflictObject[flow]
              );
              // make the label
              const ariaText = `\n-${conflictingPaths.join("\n")}`;
              // the span itself:
              const overlapList = Object.keys(
                this.flowBuildBasket.conflictObject[flow]
              ).join("\n");

              desc.createEl("br");
              const flowSpan = desc.createSpan({
                text: `- ${flow}`,
                attr: {
                  "aria-label": this.plugin.t(
                    "PreviewModal.modalTitle overlapping notes",
                    { overlapList: overlapList }
                  ),
                },
              });
            }
          });
        })
      );
    }

    const previewContainer = contentEl.createDiv({
      cls: "preview-container",
    });

    const key = this.flowBuildBasket.definitionMode;

    const recipeItems = this.flowBuildBasket.finalRecipe ?? [];
    if (recipeItems.length === 0) {
      previewContainer.setText(
        this.plugin.t(
          "PreviewModal.modalTitle.info your criteria yielded an empty list"
        )
      );
    } else {
      // Format the elements of the array for display
      for (let ingredient of this.flowBuildBasket.finalRecipe!) {
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
    // Close button with info text
    const closeModal = new Setting(contentEl).setDesc(
      createFragment((desc) => {
        desc.createSpan({
          text: this.plugin.t(
            "PreviewModal.modalTitle.info what happens after closing the modal"
          ),
        });
        desc.createEl("br");
        desc.createSpan({
          text: this.plugin.t(
            "PreviewModal.text when does flow creation happen"
          ),
        });
      })
    );
    const closeButton = new ButtonComponent(closeModal.controlEl)
      .setButtonText(this.plugin.t("PreviewModal.button close preview"))
      .onClick(() => {
        this.close();
      });
  }
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
    private flowName: string
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
        "deleteModal.createEl.text this will delete flow file"
      ),
      cls: "Tag-modal-helper",
    });

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
        `${this.plugin.settings.systemFolderPath}/${this.flowName}.md`
      );

      const flowFile = this.app.vault.getAbstractFileByPath(flowFilePath);

      // delete file if present; in two steps to make TypeScript happy
      if (flowFile) {
        if (flowFile instanceof TFile) {
          await this.app.vault.delete(flowFile);
        }
      }

      // delete flowObject
      delete this.plugin.settings.flows[this.flowName];

      // delete entry from activeFlowObject
      delete this.plugin.settings.activeFlowObject[this.flowName];

      // delete conflictObjects for the flow
      Object.keys(this.plugin.settings.flows).forEach((flowName) => {
        if (this.plugin.settings.flows[flowName].conflictObject) {
          if (
            this.plugin.settings.flows[flowName].conflictObject[this.flowName]
          ) {
            delete this.plugin.settings.flows[flowName].conflictObject[
              this.flowName
            ];
          }
        }
      });
      new Notice(
        this.plugin.t("deleteModal.notice successful deletion", {
          this_flowName: this.flowName,
        })
      );

      // if the user was about to edit this flow, unlock the name input field
      if (this.plugin.settings.flowBuildBasket.flowName === this.flowName) {
        this.plugin.settings.flowBuildBasket.createOrEdit = "create";
      }

      await this.plugin.saveSettings();
      this.settingsTab.display();
      this.close();
    });

    const cancelButton = new ButtonComponent(contentEl);
    cancelButton.setClass("action-button");
    cancelButton.setClass("action-button-cancel");
    cancelButton.setCta();
    cancelButton.setTooltip(
      this.plugin.t("deleteModal.cancelButton cancel deletion")
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
    private settingsTab: TextFlowSettingsTab
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
    const backupPath = normalizePath(
      path.join(
        this.app.vault.configDir,
        "plugins",
        this.plugin.manifest.id,
        "textFlowDefBackup.json"
      )
    );

    const fileExists = await this.app.vault.adapter.exists(backupPath);

    console.log("file exists is ", fileExists, "for ", backupPath);

    if (!fileExists) return null;

    // variable to hold the contents if the file exists
    let parsedJson;
    const rawContents = await this.app.vault.adapter.read(backupPath);
    parsedJson = JSON.parse(rawContents);

    if (Object.keys(parsedJson).length === 0) return null;

    return { parsedJson, backupPath };
  };

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

    // check if we have something to display
    const exists = await this.getBackup();
    if (!exists) {
      console.log("backup file not found");
      // if we don't, tell the user how to get something to display
      const flowExplanation = flowDisplay
        .createDiv()
        .setText(this.plugin.t("backup.explanation empty"));

      const dismissButton = new ButtonComponent(contentEl);
      dismissButton
        .setButtonText(
          this.plugin.t("backup.dismissButton.setButtonText dismiss")
        )
        .onClick(async (buttonEl: MouseEvent) => {
          this.close();
        });
    } else {
      // if we do, display that
      const { parsedJson, backupPath } = exists;

      const flowExplanation = new Setting(flowDisplay).setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t("backup.explanation select"),
          });
        })
      );

      const flowSorted: string[] = [];
      Object.keys(parsedJson).forEach((flow) => {
        flowSorted.push(flow);
      });

      flowSorted.sort();

      for (let flowName of flowSorted) {
        const shownFlow = parsedJson[flowName];

        // --- DISPLAY PREPARATIONS ----------------------------------
        // Set up strings to display flow criteria

        // SOURCE
        let source = "";
        if (shownFlow.flowCookbook.bookmarks) {
          source += this.plugin.t("flowDisplay.source.alt bookmark group", {
            shownFlow_flowCookbook_bookmarks: shownFlow.flowCookbook.bookmarks,
          });
        } else if (
          shownFlow.flowCookbook.folderIncluded === "" ||
          shownFlow.flowCookbook.folderIncluded === "/"
        ) {
          source += "/";
        } else {
          source += `/${shownFlow.flowCookbook.folderIncluded}`;
        }

        // INCLUSION
        const included: string[] = [];
        if (shownFlow.flowCookbook.tagsIncluded?.trim()) {
          included.push(
            this.plugin.t("flowDisplay.included tags", {
              shownFlow_flowCookbook_tagsIncluded:
                shownFlow.flowCookbook.tagsIncluded,
            })
          );
        }
        if (shownFlow.flowCookbook.propsIncluded?.trim()) {
          included.push(
            this.plugin.t("flowDisplay.included props", {
              shownFlow_flowCookbook_propsIncluded:
                shownFlow.flowCookbook.propsIncluded,
            })
          );
        }
        const inclusionString = included.length > 0 ? included.join(" / ") : "";

        // EXCLUSION
        const excluded: string[] = [];
        if (
          !shownFlow.flowCookbook.bookmarks &&
          shownFlow.flowCookbook.folderExcluded?.trim()
        ) {
          excluded.push(
            this.plugin.t("flowDisplay.excluded folders", {
              shownFlow_flowCookbook_folderExcluded:
                shownFlow.flowCookbook.folderExcluded,
            })
          );
        }
        if (shownFlow.flowCookbook.tagsExcluded?.trim()) {
          excluded.push(
            this.plugin.t("flowDisplay.excluded tags", {
              shownFlow_flowCookbook_tagsExcluded:
                shownFlow.flowCookbook.tagsExcluded,
            })
          );
        }
        if (shownFlow.flowCookbook.propsExcluded?.trim()) {
          excluded.push(
            this.plugin.t("flowDisplay.excluded props", {
              shownFlow_flowCookbook_propsExcluded:
                shownFlow.flowCookbook.propsExcluded,
            })
          );
        }
        const exclusionString = excluded.length > 0 ? excluded.join(" / ") : "";

        // --- THE DISPLAY ITSELF -------------------------------
        const flowShow = new Setting(flowDisplay);
        flowShow
          .setName(`${flowName.replace("*", " ")}`)
          .setDesc(
            createFragment((desc) => {
              desc.createSpan({
                text: this.plugin.t("flowDisplay.flowShow.setDesc.1 source", {
                  source: source,
                }),
              });
              if (inclusionString != "" && inclusionString != undefined) {
                desc.createEl("br");
                desc.createSpan({
                  text: this.plugin.t(
                    "flowDisplay.flowShow.setDesc.2 inclusion criteria",
                    { inclusionString: inclusionString }
                  ),
                });
              }
              if (exclusionString != "" && exclusionString != undefined) {
                desc.createEl("br");
                desc.createSpan({
                  text: this.plugin.t(
                    "flowDisplay.flowShow.setDesc.3 exclusion criteria",
                    { exclusionString: exclusionString }
                  ),
                });
              }
            })
          )

          .addButton((replaceButton) => {
            replaceButton
              .setIcon("replace")
              .setTooltip(
                this.plugin.t("backup.restoreButton.setButtonText replace")
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

          .addButton((restoreButton) => {
            restoreButton
              .setIcon("download")
              .setTooltip(
                this.plugin.t("backup.restoreButton.setButtonText restore")
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
          .addButton((deleteButton) => {
            deleteButton
              .setIcon("trash")
              .setTooltip(
                this.plugin.t("backup.deleteButton.setButtonText delete")
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
                this.plugin.settings.flows[cleanedFlowName].flowCookbook =
                  parsedJson[flowName].flowCookbook;
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

          console.log("writing backup file");
          await this.app.vault.adapter.write(
            backupPath,
            JSON.stringify(parsedJson, null, 2)
          );
          this.settingsTab.display();
          this.close();
        });

      const dismissButton = new ButtonComponent(contentEl);
      dismissButton
        .setButtonText(
          this.plugin.t("backup.dismissButton.setButtonText dismiss")
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

  constructor(app: App, plugin: TextFlowPlugin, currentActiveLeafID?: string) {
    super(app);
    this.plugin = plugin;
    this.currentActiveLeafID = currentActiveLeafID;
    this.rebuildString = "";
  }

  // the shitload of functions involved when cracking open a flow
  private flowOpeningStuff = async (leaf: WorkspaceLeaf, file: TFile) => {
    await leaf.openFile(file);
    leaf.setPinned(true);
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    await this.plugin.manageActiveFlowObject(); // this is called anyway, but timing matters, so we do it again
    this.updateActiveLeafID();
    this.display();
    this.plugin.syncAllLeaves();
  };

  // so we can highlight the active leaf's entry
  private updateActiveLeafID = () => {
    if (!this.currentActiveLeafID) {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view) {
        this.currentActiveLeafID = (view.leaf as any).id;
      }
    }
  };

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
    Object.keys(this.plugin.settings.activeFlowObject).forEach((flowName) => {
      // initialise
      activeFlowInfoObject[flowName] = {};
      // gather the info on the active flow's leaves:
      if (
        this.plugin.settings.flows[flowName].activeRegions &&
        Object.keys(this.plugin.settings.flows[flowName].activeRegions).length >
          0
      ) {
        Object.keys(this.plugin.settings.flows[flowName].activeRegions).forEach(
          (leafID) => {
            // get the note name; normalisation of path not necessary
            if (
              this.plugin.settings.flows[flowName].activeRegions[leafID].path
            ) {
              if (
                // if it's a file, get the basename
                !this.plugin.settings.flows[flowName].activeRegions[
                  leafID
                ].path.startsWith("#")
              ) {
                const activeRegion = basename(
                  this.plugin.settings.flows[flowName].activeRegions[leafID]
                    .path
                );
                activeFlowInfoObject[flowName][leafID] = activeRegion;
              } else if (
                // if it's a folder, just take the name
                this.plugin.settings.flows[flowName].activeRegions[
                  leafID
                ].path.startsWith("#")
              ) {
                const activeRegion =
                  this.plugin.settings.flows[flowName].activeRegions[leafID]
                    .path;
                activeFlowInfoObject[flowName][leafID] = activeRegion;
              }
            }
          }
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
    const sortedInactiveFlowArray = inactiveFlowArray.sort();

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

      // ------------ All the buttons for the active flowses headers
      // Button that opens in a new tab
      const openActiveTabButton = new ButtonComponent(flowHeader)
        .setIcon("play")
        .setClass(`flow-switch-modal-header-button-${goOpen}`)
        .setClass("clickable-icon")
        .setTooltip(this.plugin.t("switcherModal.buttons new tab"))
        .onClick(async () => {
          if (goOpen === "neutral" || goOpen === "must") {
            await this.plugin.syncAllLeaves();

            const file = this.app.vault.getAbstractFileByPath(
              this.plugin.settings.flows[activeFlow].flowFilePath
            );
            if (file instanceof TFile) {
              const leaf = this.app.workspace.getLeaf("tab");
              await this.flowOpeningStuff(leaf, file);
            }
          }
        });

      // Button that opens in split to the right
      const openActiveRightButton = new ButtonComponent(flowHeader)
        .setIcon("step-forward")
        .setClass(`flow-switch-modal-header-button-${goOpen}`)
        .setClass("clickable-icon")
        .setTooltip(this.plugin.t("switcherModal.buttons split right"))
        .onClick(async () => {
          if (goOpen === "neutral" || goOpen === "must") {
            const file = this.app.vault.getAbstractFileByPath(
              this.plugin.settings.flows[activeFlow].flowFilePath
            );
            if (file instanceof TFile) {
              const leaf = this.app.workspace.getLeaf("split");
              await this.flowOpeningStuff(leaf, file);
            }
          }
        });

      // Button that opens in a split down
      const openActiveDownButton = new ButtonComponent(flowHeader)
        .setIcon("step-forward")
        .setClass(`flow-switch-modal-header-button-${goOpen}`)
        .setClass("flow-switch-modal-header-button-down")
        .setClass("clickable-icon")
        .setTooltip(this.plugin.t("switcherModal.buttons split down"))
        .onClick(async () => {
          if (goOpen === "neutral" || goOpen === "must") {
            const file = this.app.vault.getAbstractFileByPath(
              this.plugin.settings.flows[activeFlow].flowFilePath
            );
            if (file instanceof TFile) {
              const leaf = this.app.workspace.getLeaf("split", "horizontal");
              await this.flowOpeningStuff(leaf, file);
            }
          }
        });

      // Button to sync
      const syncButton = new ButtonComponent(flowHeader)
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

      // Button to rebuild
      const rebuildButton = new ButtonComponent(flowHeader)
        .setIcon("rotate-cw")
        .setClass(`flow-switch-modal-header-button-rebuild-${goRebuild}`)
        .setClass("clickable-icon")
        .onClick(async () => {
          if (goRebuild === "neutral" || goRebuild === "must") {
            const allLeaves = this.app.workspace.getLeavesOfType("markdown");
            for (const leaf of allLeaves) {
              const view = leaf.view as MarkdownView;
              const filePath = view.file?.path;
              if (!filePath) continue;
              const flowName = this.plugin.isFlowFile(filePath);
              if (flowName === activeFlow)
                // make double sure we got everything set up for the overlay,
                // so user doesn't type while we rebuild
                await this.plugin.setupFlowView(activeFlow, view);
            }
            await this.plugin.flowService.rebuildFlow(activeFlow, "switcher");
            await this.plugin.saveSettings();
            await this.display();
          } else if (goRebuild === "no-go") {
            return;
          }
        });

      // Button to close all active leaves that contain this flow
      const closeButton = new ButtonComponent(flowHeader)
        .setIcon("x")
        .setClass(`flow-switcher-modal-neutral`)
        .setClass("clickable-icon")
        .onClick(async () => {
          const leaves = this.app.workspace.getLeavesOfType("markdown");
          Object.keys(activeFlowInfoObject[activeFlow]).forEach(
            async (leafID) => {
              const targetLeaf = leaves.find(
                (leaf) => (leaf as any).id === leafID
              );
              if (targetLeaf) {
                targetLeaf.detach();
                this.plugin.manageActiveFlowObject();
                await this.plugin.saveSettings();
                this.updateActiveLeafID();
                await this.display();
              }
            }
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
            if (this.plugin.settings.flows[activeFlow].conflictObject) {
              if (
                this.plugin.settings.flows[activeFlow].conflictObject[flowName]
              ) {
                const pathArray = Object.keys(
                  this.plugin.settings.flows[activeFlow].conflictObject[
                    flowName
                  ]
                );
                pathArray.forEach((path) => {
                  if (
                    // if we're not handling a title and the region name is the file name
                    !leafID.startsWith("#") &&
                    path.endsWith(activeFlowInfoObject[activeFlow][leafID])
                  ) {
                    if (!overlapArray.contains(flowName)) {
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
            { overlapString: overlapString }
          );
        }

        const regionName = flowRegion.createSpan({
          text: `${
            activeFlowInfoObject[activeFlow][leafID]
          } ${overlap} (${leafID.slice(0, 5)})`,
          cls: "flow-switch-modal-active-region-name",
          attr: {
            "aria-label": `${overlapAriaLabel}`,
          },
        });

        // ----------- GOTO BUTTON ------------
        const navGotoButton = new ButtonComponent(flowRegion)
          .setIcon("arrow-big-right")
          .setClass(`flow-switch-modal-header-button-neutral`)
          .setClass("clickable-icon")
          .onClick(async () => {
            const leaves = this.app.workspace.getLeavesOfType("markdown");
            const targetLeaf = leaves.find(
              (leaf) => (leaf as any).id === leafID
            );
            if (targetLeaf) {
              this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
              /*if (targetLeaf instanceof MarkdownView) {
                await this.plugin.setupFlowView(activeFlow, targetLeaf);
              }*/
            }
            this.currentActiveLeafID = (targetLeaf as any).id;
            this.display();
          });

        // ----------- CLOSE BUTTON ------------
        const navCloseButton = new ButtonComponent(flowRegion)
          .setIcon("x")
          .setClass(`flow-switch-modal-header-button-neutral`)
          .setClass("clickable-icon")
          .onClick(async () => {
            const leaves = this.app.workspace.getLeavesOfType("markdown");
            const targetLeaf = leaves.find(
              (leaf) => (leaf as any).id === leafID
            );
            if (targetLeaf) {
              await targetLeaf.detach();
              this.plugin.manageActiveFlowObject();
              await this.plugin.saveSettings();
              this.updateActiveLeafID();
              await this.display();
            }
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
        goOpen = "neutral"; // don't open
        goRebuild = "no-go";
        goSync = "must"; // must sync
      }

      // if no sync is required, check if there's a file for that flow
      const flowFile = this.app.vault.getAbstractFileByPath(
        this.plugin.settings.flows[inactiveFlow].flowFilePath
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

      // ----------- OPEN BUTTON ------------
      const openInactiveTabButton = new ButtonComponent(inactiveFlowHeader)
        .setIcon("play")
        .setClass(`flow-switch-modal-header-button-${goOpen}`)
        .setClass("clickable-icon")
        .setTooltip(this.plugin.t("switcherModal.buttons new tab"))
        .onClick(async () => {
          if (goOpen === "neutral" || goOpen === "must") {
            const file = this.app.vault.getAbstractFileByPath(
              this.plugin.settings.flows[inactiveFlow].flowFilePath
            );

            if (file instanceof TFile) {
              const leaf = this.app.workspace.getLeaf("tab");
              await this.flowOpeningStuff(leaf, file);
            }
          }
        });

      const openInactiveRightButton = new ButtonComponent(inactiveFlowHeader)
        .setIcon("step-forward")
        .setClass(`flow-switch-modal-header-button-${goOpen}`)
        .setClass("clickable-icon")
        .setTooltip(this.plugin.t("switcherModal.buttons split right"))
        .onClick(async () => {
          if (goOpen === "neutral" || goOpen === "must") {
            const file = this.app.vault.getAbstractFileByPath(
              this.plugin.settings.flows[inactiveFlow].flowFilePath
            );
            if (file instanceof TFile) {
              const leaf = this.app.workspace.getLeaf("split");
              await this.flowOpeningStuff(leaf, file);
            }
          }
        });

      const openInactiveDownButton = new ButtonComponent(inactiveFlowHeader)
        .setIcon("step-forward")
        .setClass(`flow-switch-modal-header-button-${goOpen}`)
        .setClass("flow-switch-modal-header-button-down")
        .setClass("clickable-icon")
        .setTooltip(this.plugin.t("switcherModal.buttons split down"))
        .onClick(async () => {
          if (goOpen === "neutral" || goOpen === "must") {
            const file = this.app.vault.getAbstractFileByPath(
              this.plugin.settings.flows[inactiveFlow].flowFilePath
            );
            if (file instanceof TFile) {
              const leaf = this.app.workspace.getLeaf("split", "horizontal");
              await this.flowOpeningStuff(leaf, file);
            }
          }
        });

      // ----------- Sync BUTTON ------------
      const syncButton = new ButtonComponent(inactiveFlowHeader)
        .setIcon("download")
        .setClass(`flow-switch-modal-header-button-${goSync}`)
        .setClass("clickable-icon")
        .setTooltip(this.plugin.t("switcherModal.buttons sync"))
        .onClick(async () => {
          if (goSync === "neutral" || goSync === "must") {
            if (goSync === "neutral" || goSync === "must") {
              await this.plugin.syncAllLeaves();
              await this.plugin.saveSettings();
              await this.display();
            } else {
              return;
            }
          } else {
            return;
          }
        });

      // ----------- REBUILD BUTTON ------------
      const rebuildButton = new ButtonComponent(inactiveFlowHeader)
        .setIcon("rotate-cw")
        .setClass(`flow-switch-modal-header-button-${goRebuild}`)
        .setClass("clickable-icon")
        .setTooltip(this.plugin.t("switcherModal.buttons rebuild"))
        .onClick(async () => {
          if (goRebuild === "neutral" || goRebuild === "must") {
            await this.plugin.flowService.rebuildFlow(inactiveFlow, "switcher");
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
    private activeFlowName?: string
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
        const currentActiveleafID = (view.leaf as any).id;
        let activePath: string | undefined = "";
        let activeCursorPos: string | number = "";
        if (
          this.plugin.settings.flows[this.activeFlowName].activeRegions[
            currentActiveleafID
          ]
        ) {
          activePath =
            this.plugin.settings.flows[this.activeFlowName].activeRegions[
              currentActiveleafID
            ].path;
          activeCursorPos =
            this.plugin.settings.flows[this.activeFlowName].activeRegions[
              currentActiveleafID
            ].currentCursorPos;
        }
        placeholderText = `? ${
          this.activeFlowName
        }: ${activePath} - (${currentActiveleafID.slice(
          0,
          5
        )}) - crs ${activeCursorPos} `;
      }
    }
    this.setPlaceholder(`${placeholderText}`);

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

  getItems(): Types.SuggestionItem[] {
    const activeFlowItems: Types.SuggestionItem[] = [];
    const otherFlowItems: Types.SuggestionItem[] = [];
    const flowNames: Types.SuggestionItem[] = [];

    // the rest is my code

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

        Object.keys(this.settings.flows[flowName].persistentCursors).forEach(
          (iteratorLeafID) => {
            let leafNickname =
              this.settings.flows[flowName].persistentCursors[iteratorLeafID]
                .leafNickname;
            const cursors =
              this.settings.flows[flowName].persistentCursors[iteratorLeafID]
                .cursors;
            for (let cursorTuple of cursors) {
              activeFlowItems.push({
                type: "active-flow-cursor",
                flowName: flowName,
                region: cursorTuple[0],
                cursorPos: cursorTuple[1],
                leafID: iteratorLeafID,
                path: cursorTuple[0],
                searchableText: `? ${cursorTuple[0]} - (${leafNickname}) - crs ${cursorTuple[1]}`,
              });
            }
          }
        );
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

        Object.keys(this.settings.flows[flowName].persistentCursors).forEach(
          (iteratorLeafID) => {
            const leafNickname =
              this.settings.flows[flowName].persistentCursors[iteratorLeafID]
                .leafNickname;
            const cursors =
              this.settings.flows[flowName].persistentCursors[iteratorLeafID]
                .cursors;
            for (let cursorTuple of cursors) {
              activeFlowItems.push({
                type: "other-flow-cursor",
                flowName: flowName,
                region: cursorTuple[0],
                cursorPos: cursorTuple[1],
                leafID: iteratorLeafID,
                path: cursorTuple[0],
                searchableText: `* ${cursorTuple[0]} - (${leafNickname}) - crs  ${cursorTuple[1]}`,
              });
            }
          }
        );
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

  getItemText(item: Types.SuggestionItem): string {
    return item.searchableText;
  }

  renderSuggestion(
    fuzzyMatch: FuzzyMatch<Types.SuggestionItem>,
    el: HTMLElement
  ) {
    const suggestionItem = fuzzyMatch.item;
    let displayFlowName = `${suggestionItem.flowName} `;
    if (suggestionItem.type === "flow-name") {
      displayFlowName = "";
    }
    const searchText = displayFlowName + suggestionItem.searchableText;

    // make the container
    const contentEl = el.createDiv({ cls: "suggestion-content" });

    // Now do another fuzzy match to find and HIGHLIGHT THE SEARCHED CHARS WITHIN RESULTS
    // Claude 3.5 Sonnet wrote this and I don't really understand it, but it works, so...
    const matchElements = fuzzyMatch.match.matches;
    let lastIndex = 0;
    for (const [start, end] of matchElements) {
      if (start > lastIndex) {
        contentEl.createSpan().setText(searchText.slice(lastIndex, start));
      }
      contentEl
        .createSpan({ cls: "suggestion-highlight" })
        .setText(searchText.slice(start, end));
      lastIndex = end;
    }
    if (lastIndex < searchText.length) {
      contentEl.createSpan().setText(searchText.slice(lastIndex));
    }
  }

  onChooseItem(item: Types.SuggestionItem, evt: MouseEvent | KeyboardEvent) {
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
        this.plugin.settings.flows[item.flowName].activeRegions &&
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
            const iteratorLeafID = (iteratorLeaf as any).id;
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
            cursorPos
          );
          this.app.workspace.setActiveLeaf(leaf, { focus: true });
          if (cursorPos) {
            scrollToTarget(item, cursorPos);
          }
        } else {
        }
      } else if (
        !this.plugin.settings.flows[item.flowName].activeRegions ||
        item.type === "flow-name"
      ) {
        // if there are no active leaves we could target or we want to open a new one
        // I have no idea why this works so well for "flow-name" items
        console.log("no open flow leaf found");
        const file = this.app.vault.getAbstractFileByPath(
          this.plugin.settings.flows[item.flowName].flowFilePath
        );
        if (file instanceof TFile) {
          const leaf = this.app.workspace.getLeaf("tab");
          await leaf.openFile(file);
          leaf.setPinned(true);

          let cursorPos = item.cursorPos;
          if (!item.cursorPos && leaf) {
            cursorPos = await findCursorPos(item, leaf);
          }
          const leafID = (leaf as any).id;
          if (cursorPos) {
            this.plugin.manageCursorPos(item.flowName, leafID, item, cursorPos);
            this.app.workspace.setActiveLeaf(leaf, { focus: true });
            scrollToTarget(item, cursorPos);
          }
        }
      }
    };

    // if we got a region instead of a cursorPos we find its start pos
    const findCursorPos = async (
      item: Types.SuggestionItem,
      leaf: WorkspaceLeaf
    ) => {
      // initialise the leaf

      await leaf.loadIfDeferred();

      let text = "";
      const view = leaf.view as MarkdownView;
      if (view) {
        const editor = view?.editor as ObsidianEditor | null;
        if (editor) {
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
            text
          );
          return startPosInFlow;
        }
      }
    };

    // this only ever cares about the active view, which is why we made sure to open, activate and focus
    const scrollToTarget = async (
      item: Types.SuggestionItem,
      cursorPos?: number
    ) => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      const editor = view?.editor as ObsidianEditor | null;
      if (editor) {
        const cmEditor = editor.cm;
        if (cursorPos) {
          this.plugin.flowService.scrollToPos(editor, cursorPos);
        } else if (item.cursorPos) {
          this.plugin.flowService.scrollToPos(editor, item.cursorPos);
        }
      }
    };

    // -------- DOING STUFF WITH THE HELPER FUNCTIONS --------------
    prepareFlowLeafAndCallScroll(item);
  }
}
