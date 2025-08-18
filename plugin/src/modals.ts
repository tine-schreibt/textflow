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
  TextAreaComponent,
  TFile,
  WorkspaceLeaf,
} from "obsidian";
import * as Types from "./types";
import TextFlow from "../main";
import { TextFlowSettingsTab } from "./settingsTab";
import { basename } from "path";
import { FlowService } from "./flowService";
import { EditorView } from "@codemirror/view";
import fs from "fs/promises";
import path from "path";

export class ExportModal extends Modal {
  constructor(app: App, private plugin: TextFlowPlugin) {
    super(app);
    this.plugin = plugin;
  }
  onOpen() {
    const { contentEl } = this;

    new Setting(contentEl)
      .setName(`Export settings for textFlow`)
      .then((setting) => {
        const exportObj = structuredClone(this.plugin.settings);

        // clean out activeFlowObject:
        exportObj.activeFlowObject = {};

        // Clean up each flow
        Object.values(exportObj.flows).forEach((flow) => {
          flow.flowRecipe = {};
          flow.flaggedForRebuild = true;
          flow.flowMap = {};
        });

        const output = JSON.stringify(exportObj, null, 2);

        // Build a copy to clipboard link
        setting.controlEl.createEl(
          "a",
          {
            cls: "style-settings-copy",
            text: "Copy to clipboard",
            href: "#",
          },
          (copyButton) => {
            new TextAreaComponent(contentEl)
              .setValue(output)
              .then((textarea) => {
                copyButton.addEventListener("click", async (e) => {
                  e.preventDefault();

                  try {
                    // Use the Clipboard API to copy the value directly
                    await navigator.clipboard.writeText(textarea.inputEl.value);

                    // Add a success class to the button for feedback
                    copyButton.addClass("success");
                  } catch (err) {
                    console.error("Failed to copy to clipboard", err);
                  }
                });
              });
            setTimeout(() => {
              // If the button is still in the dom, remove the success class
              if (copyButton.parentNode) {
                copyButton.removeClass("success");
              }
            }, 2000);
          }
        );
      });
  }

  onClose() {
    this.contentEl.empty();
  }
}

//
//
//
//
//

export class ImportModal extends Modal {
  constructor(app: App, private plugin: TextFlowPlugin) {
    super(app);
    this.plugin = plugin;
  }
  onOpen() {
    const { contentEl } = this;

    new Setting(contentEl).then((setting) => {
      // Build an error message container
      const errorSpan = createSpan({
        cls: "style-settings-import-error",
        text: "Error importing config",
      });

      setting.nameEl.appendChild(errorSpan);

      // Attempt to parse the imported data and close if successful
      const importAndClose = async (str: string) => {
        if (str) {
          try {
            const importedSettings = JSON.parse(str);
            Object.assign(this.plugin.settings, importedSettings);
            await this.plugin.saveSettings();
            this.plugin.settingsTab.display();
            this.close();
          } catch (e) {
            errorSpan.addClass("active");
            errorSpan.setText(`Error importing confic`);
          }
        } else {
          errorSpan.addClass("active");
          errorSpan.setText(`Error importing config: config is empty`);
        }
      };

      // Build a file input
      setting.controlEl.createEl(
        "input",
        {
          cls: "style-settings-import-input",
          attr: {
            id: "style-settings-import-input",
            name: "style-settings-import-input",
            type: "file",
            accept: ".json",
          },
        },
        (importInput) => {
          // Set up a FileReader so we can parse the file contents
          importInput.addEventListener("change", (e) => {
            const reader = new FileReader();
            reader.onload = async (e: ProgressEvent<FileReader>) => {
              if (e.target?.result) {
                await importAndClose(
                  e.target && e.target.result.toString().trim()
                );
              }
            };
            let files = (e.target as HTMLInputElement).files;
            if (files?.length) reader.readAsText(files[0]);
          });
        }
      );

      // Build a label we will style as a link
      setting.controlEl.createEl("label", {
        cls: "style-settings-import-label",
        text: "Import from file",
        attr: {
          for: "style-settings-import-input",
        },
      });

      new TextAreaComponent(contentEl)
        .setPlaceholder("Paste config here...")
        .then((ta) => {
          new ButtonComponent(contentEl)
            .setButtonText("Save")
            .onClick(async () => {
              await importAndClose(ta.getValue().trim());
            });
        });
    });
  }

  onClose() {
    let { contentEl } = this;
    contentEl.empty();
  }
}

//CHECKED AND TESTED
export class previewModal extends Modal {
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
      text: this.plugin.t("previewModal.modalTitle preview for flow", {
        this_flowBuildBasket_flowName: this.flowBuildBasket.flowName,
      }),
    });

    // Show found overlaps
    if (Object.keys(this.flowBuildBasket.conflictObject).length > 0) {
      const conflictText = new Setting(contentEl).setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: this.plugin.t("previewModal.modalTitle overlap for flow", {
              this_flowBuildBasket_flowName: this.flowBuildBasket.flowName,
            }),
          });
          desc.createEl("br");
          const flowSpan = desc.createSpan({
            text: this.plugin.t("previewModal.modalTitle hover for details"),
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
                    "previewModal.modalTitle overlapping notes",
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

    const recipeItems = this.flowBuildBasket.finalRecipe[key] ?? [];
    if (recipeItems.length === 0) {
      previewContainer.setText(
        this.plugin.t(
          "previewModal.modalTitle.info your criteria yielded an empty list"
        )
      );
    } else {
      // Format the elements of the array for display
      for (let ingredient of this.flowBuildBasket.finalRecipe[key]!) {
        if (ingredient.startsWith("#")) {
          previewContainer.createEl("p", {
            text: ingredient.replace("#", ""),
            cls: "preview-group-header",
          });
        } else {
          const ingredientArray = ingredient.split("/");
          if (this.flowBuildBasket.finalRecipe.foldersTagsProps) {
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
            "previewModal.modalTitle.info what happens after closing the modal"
          ),
        });
        desc.createEl("br");
        desc.createSpan({
          text: this.plugin.t(
            "previewModal.text when does flow creation happen"
          ),
        });
      })
    );
    const editButton = new ButtonComponent(closeModal.controlEl)
      .setButtonText(this.plugin.t("previewModal.button close preview"))
      .onClick(() => {
        this.close();
      });
  }
  onClose() {
    this.contentEl.empty();
  }
}
//^CHECKED AND TESTED

// ^CHECKED AND TESTED
//----------- FLOW DEF DELETION
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
// ^CHECKED AND TESTED
//
//
//
//
//
//
//
//
//
//
//
//
//
//

//----------- RESTORE FLOW DEFS
export class RestoreFlowDefModal extends Modal {
  constructor(
    app: App,
    private plugin: TextFlowPlugin,
    private settingsTab: TextFlowSettingsTab
  ) {
    super(app);
    this.settingsTab = settingsTab;
  }

  // check if the file exists
  private doesFileExist = async (filePath: string): Promise<boolean> => {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  };

  private getBackup = async () => {
    // make the path of the backup.json
    const basePath = (this.app.vault.adapter as any).basePath;
    const backupPath = path.join(
      basePath,
      this.app.vault.configDir,
      "plugins",
      this.plugin.manifest.id,
      "textFlowSettingsBackup.json"
    );

    const fileExists = await this.doesFileExist(backupPath);

    // variable to hold the contents if the file exists
    let parsedJson;
    console.log("file found; parsing json");
    const rawContents = await fs.readFile(backupPath, "utf-8");
    parsedJson = JSON.parse(rawContents);

    return { parsedJson, backupPath };
  };

  onOpen = async () => {
    const { contentEl } = this;

    const { parsedJson, backupPath } = await this.getBackup();

    const flowDisplay = contentEl.createDiv({
      cls: "headline-container",
    });
    flowDisplay.createEl("h3", {
      text: this.plugin.t("backup.description restore"),
      cls: "headline-text",
    });

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
        .setName(`${flowName}`)
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

        .addButton((restore) => {
          restore
            .setButtonText(
              this.plugin.t("backup.restoreButton.setButtonText restore")
            )
            .onClick(async () => {
              this.plugin.settings.flows[flowName] = shownFlow;
              await this.plugin.saveSettings();
              this.settingsTab.display();
            });
        })
        .addButton((deleteBackup) => {
          deleteBackup
            .setButtonText(
              this.plugin.t("backup.deleteButton.setButtonText delete")
            )
            .onClick(async () => {
              delete parsedJson[flowName];
            });
        });
    }
    const closeButton = new ButtonComponent(contentEl);
    closeButton
      .setButtonText(this.plugin.t("backup.closeButton.setButtonText close"))
      .onClick(async (buttonEl: MouseEvent) => {
        await fs.writeFile(
          backupPath,
          JSON.stringify(parsedJson, null, 2),
          "utf-8"
        );
        this.settingsTab.display();
        this.close();
      });
  };
}

//-------- FLOW SWITCHING
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
      if (this.plugin.settings.flows[flowName].activeRegions) {
        Object.keys(this.plugin.settings.flows[flowName].activeRegions).forEach(
          (leafID) => {
            // get the note name; normalisation of path not necessary
            if (
              this.plugin.settings.flows[flowName].activeRegions[leafID].path
            ) {
              if (
                // if it's a file, get the basename
                this.plugin.settings.flows[flowName].activeRegions[leafID]
                  .type === "file"
              ) {
                const activeRegion = basename(
                  this.plugin.settings.flows[flowName].activeRegions[leafID]
                    .path
                );
                activeFlowInfoObject[flowName][leafID] = activeRegion;
              } else if (
                // if it's a folder, just take the name
                this.plugin.settings.flows[flowName].activeRegions[leafID]
                  .type === "folder"
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
    Object.keys(this.plugin.settings.flows).forEach((flow) => {
      // if there's entries for a flow
      if (
        !sortActiveRegionsArray.includes(
          this.plugin.settings.flows[flow].flowName
        )
      ) {
        inactiveFlowArray.push(this.plugin.settings.flows[flow].flowName);
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
        text: `${this.plugin.settings.flows[activeFlow].flowName}`,
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
        .onClick(async () => {
          if (goOpen === "neutral" || goOpen === "must") {
            await this.plugin.syncAllLeaves();

            const file = this.app.vault.getAbstractFileByPath(
              this.plugin.settings.flows[activeFlow].flowFilePath
            );
            if (file instanceof TFile) {
              const leaf = this.app.workspace.getLeaf("tab");
              this.flowOpeningStuff(leaf, file);
            }
          }
        });

      // Button that opens in split to the right
      const openActiveRightButton = new ButtonComponent(flowHeader)
        .setIcon("step-forward")
        .setClass(`flow-switch-modal-header-button-${goOpen}`)
        .setClass("clickable-icon")
        .onClick(async () => {
          if (goOpen === "neutral" || goOpen === "must") {
            const file = this.app.vault.getAbstractFileByPath(
              this.plugin.settings.flows[activeFlow].flowFilePath
            );
            if (file instanceof TFile) {
              const leaf = this.app.workspace.getLeaf("split");
              this.flowOpeningStuff(leaf, file);
            }
          }
        });

      // Button that opens in a split down
      const openActiveDownButton = new ButtonComponent(flowHeader)
        .setIcon("step-forward")
        .setClass(`flow-switch-modal-header-button-${goOpen}`)
        .setClass("flow-switch-modal-header-button-down")
        .setClass("clickable-icon")
        .onClick(async () => {
          if (goOpen === "neutral" || goOpen === "must") {
            const file = this.app.vault.getAbstractFileByPath(
              this.plugin.settings.flows[activeFlow].flowFilePath
            );
            if (file instanceof TFile) {
              const leaf = this.app.workspace.getLeaf("split", "horizontal");
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
        .setClass(`menu-bar-button-rebuild-${goRebuild}`)
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
                await targetLeaf.detach();
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
          .onClick(() => {
            const leaves = this.app.workspace.getLeavesOfType("markdown");
            const targetLeaf = leaves.find(
              (leaf) => (leaf as any).id === leafID
            );
            if (targetLeaf) {
              this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
              this.currentActiveLeafID = (targetLeaf as any).id;
              this.display();
            }
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
        text: `${this.plugin.settings.flows[inactiveFlow].flowName}`,
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
        .onClick(async () => {
          if (goOpen === "neutral" || goOpen === "must") {
            const file = this.app.vault.getAbstractFileByPath(
              this.plugin.settings.flows[inactiveFlow].flowFilePath
            );
            if (file instanceof TFile) {
              const leaf = this.app.workspace.getLeaf("split");
              this.flowOpeningStuff(leaf, file);
            }
          }
        });

      const openInactiveDownButton = new ButtonComponent(inactiveFlowHeader)
        .setIcon("step-forward")
        .setClass(`flow-switch-modal-header-button-${goOpen}`)
        .setClass("flow-switch-modal-header-button-down")
        .setClass("clickable-icon")
        .onClick(async () => {
          if (goOpen === "neutral" || goOpen === "must") {
            const file = this.app.vault.getAbstractFileByPath(
              this.plugin.settings.flows[inactiveFlow].flowFilePath
            );
            if (file instanceof TFile) {
              const leaf = this.app.workspace.getLeaf("split", "horizontal");
              this.flowOpeningStuff(leaf, file);
            }
          }
        });

      // ----------- Sync BUTTON ------------
      const syncButton = new ButtonComponent(inactiveFlowHeader)
        .setIcon("download")
        .setClass(`flow-switch-modal-header-button-${goSync}`)
        .setClass("clickable-icon")
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

// ------------------------ FUZZY NAVIGATON MODAL ------------------------
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

    // Set placeholder text in the search input

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
        purpose: this.plugin.t(
          "fuzzyNavigabiotnModal.info flow in active leaf"
        ),
      },
      {
        command: "*",
        purpose: this.plugin.t("fuzzyNavigabiotnModal.info other flows"),
      },
      {
        command: ":",
        purpose: this.plugin.t("fuzzyNavigabiotnModal.info flow names"),
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

      if (this.settings.flows[flowName].activeRegions) {
        Object.keys(this.settings.flows[flowName].activeRegions).forEach(
          (iteratorLeafID) => {
            flowNames.push({
              type: "active-region",
              flowName: flowName,
              leafID: iteratorLeafID,
              region:
                this.settings.flows[flowName].activeRegions[iteratorLeafID]
                  .path,
              path: this.settings.flows[flowName].activeRegions[iteratorLeafID]
                .path,
              searchableText: `: ${flowName} - ${iteratorLeafID.slice(
                0,
                5
              )} - ${
                this.settings.flows[flowName].activeRegions[iteratorLeafID].path
              }`,
            });
          }
        );
      }
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
    const searchText = suggestionItem.searchableText;

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
    const prepareFlowLeafAndCallScroll = async (item: Types.SuggestionItem) => {
      let leafID = "";

      // if we have open leaves for the flow
      if (this.plugin.settings.flows[item.flowName].activeRegions) {
        if (
          // if we have a leafID we want and it's still valid
          item.leafID &&
          this.plugin.settings.flows[item.flowName].activeRegions[item.leafID]
        ) {
          leafID = item.leafID;
        } else {
          // if it's stale or we don't want a particular leafID
          leafID = this.plugin.settings.flows[item.flowName].lastActiveLeaf;
        }
        // Now get that leaf and do the thing
        const leaves = this.app.workspace.getLeavesOfType("markdown");
        const targetLeaf = leaves.find((leaf) => (leaf as any).id === leafID);
        if (targetLeaf) {
          this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
          scrollToTarget(item);
          return;
        }
      }

      // if there are no active leaves we could target, open a new one
      const file = this.app.vault.getAbstractFileByPath(
        this.plugin.settings.flows[item.flowName].flowFilePath
      );
      if (file instanceof TFile) {
        const leaf = this.app.workspace.getLeaf("tab");
        await leaf.openFile(file);
        leaf.setPinned(true);
        this.app.workspace.setActiveLeaf(leaf, { focus: true });
      }
    };

    // this only ever cares about the active view, which is why above we make sure to open, activate and focus
    const scrollToTarget = (item: Types.SuggestionItem) => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      const editor = view?.editor as ObsidianEditor | null;
      if (editor) {
        const cmEditor = editor.cm;

        // if we have a cursor pos, just scroll there
        if (item.cursorPos) {
          this.plugin.flowService.scrollToPos(editor, item.cursorPos);
        } else {
          // IF WE DON'T HAVE ONE find a cursor pos to scroll to
          let text = "";
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

          if (startPosInFlow) {
            // then we call scrollToPos
            this.plugin.flowService.scrollToPos(editor, startPosInFlow);
            // it also automatically focuses the editor
          }
        }
      }
    };

    // -------- DOING STUFF WITH THE HELPER FUNCTIONS --------------

    if (
      this.activeFlowName &&
      (item.type === "active-flow-path" || item.type === "active-flow-cursor")
    ) {
      // If we're looking at the active leaf, just target that
      scrollToTarget(item);
    } else {
      // if not, go on a little journey...
      prepareFlowLeafAndCallScroll(item);
    }
  }
}
