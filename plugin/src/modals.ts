import TextFlowPlugin from "../main";
import {
  App,
  ButtonComponent,
  Notice,
  setIcon,
  DropdownComponent,
  MarkdownView,
  Modal,
  TextComponent,
  Setting,
  TFolder,
  TFile,
} from "obsidian";
import * as Types from "./types";

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
      text: `Preview for flow ${this.flowBuildBasket.createOrEditFlowName}.`,
    });

    if (this.flowBuildBasket.conflicts.length > 0) {
      const conflictText = new Setting(contentEl).setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: `The following flows overlap with ${this.flowBuildBasket.createOrEditFlowName}:`,
          });
          this.flowBuildBasket.conflicts.forEach((flow) => {
            desc.createEl("br");
            desc.createSpan({
              text: `- ${flow}`,
            });
          });
        })
      );
    }

    const previewContainer = contentEl.createDiv({
      cls: "preview-container",
    });

    let key = this.flowBuildBasket.finalReceipe.bookmarks
      ? "bookmarks"
      : "foldersTagsProps";

    if (this.flowBuildBasket.finalReceipe[key]!.length <= 1) {
      // there's a whole fucking function making sure no fragment of the value is ever undefined, so... ! it is.
      previewContainer.setText(
        "Your criteria yielded no results. Check them for typos and/or make them less restrictive."
      );
    } else {
      for (let ingredient of this.flowBuildBasket.finalReceipe[key]!) {
        if (ingredient.startsWith("#")) {
          previewContainer.createEl("p", {
            text: ingredient.replace("#", ""),
            cls: "preview-group-header",
          });
        } else {
          const ingredientArray = ingredient.split("/");
          let dashes = "";
          for (let i = 0; i < ingredientArray.length - 1; i++) dashes += "-";
          ingredient = `${dashes} ${
            ingredientArray[ingredientArray.length - 1]
          }`;
          previewContainer.createEl("p", {
            text: `${ingredient}`,
            cls: "preview-note-name",
          });
        }
      }
    }
    const closeModal = new Setting(contentEl).setDesc(
      createFragment((desc) => {
        desc.createSpan({
          text: "After closing this modal you can either edit or save your flow definition.",
        });
        desc.createEl("br");
        desc.createSpan({
          text: "Flow creation happens in the next step.",
        });
      })
    );
    const editButton = new ButtonComponent(closeModal.controlEl)
      .setButtonText("Close preview")
      .onClick(() => {
        this.close();
      });
  }
  onClose() {
    this.contentEl.empty();
  }
}

//-------- FLOW SWITCHING
export class FlowSwitcherModal extends Modal {
  private plugin: TextFlowPlugin;

  constructor(app: App, plugin: TextFlowPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    this.display();
  }

  display() {
    const { contentEl, modalEl } = this;
    contentEl.empty();

    modalEl.addClass("textflow-switcher");
    
    const flowContainer = contentEl.createDiv("switcher-modal-container");

    const activeFlowsContainer = flowContainer.createDiv({
      cls: "switcher-modal-active-flow-container",
    });

    activeFlowsContainer.createEl("p", {
      text: "Active flows",
      cls: "switcher-modal-faint-text",
    });

    // ---- PREPARE ACTIVE REGIONS ---------------
    const unsavedRegionsGlobal: string[] = [];
    const activeFlowInfoObject: { [key: string]: { [key: string]: string } } =
      {};
    // activeFlowInfoObject.flowName.leafID.fileName
    // iterate over active flow object
    Object.keys(this.plugin.settings.activeFlowObject).forEach((flow) => {
      // if there's entries for a flow
      if (Object.keys(this.plugin.settings.activeFlowObject[flow]).length > 0) {
        if (this.plugin.settings.flows[flow].unsavedRegionsArray) {
          for (let unsavedRegion of this.plugin.settings.flows[flow]
            .unsavedRegionsArray) {
            if (!unsavedRegionsGlobal.includes(unsavedRegion)) {
              unsavedRegionsGlobal.push(unsavedRegion);
            }
          }
        }
        Object.keys(this.plugin.settings.flows[flow].activeRegions).forEach(
          (leafID) => {
            const activeRegion =
              this.plugin.settings.flows[flow].activeRegions[
                leafID
              ].path?.split("/");
            if (activeRegion) {
              // construct a sub-array that contains the leafID (region) and the leaf's region's note name
              const fileName = activeRegion[activeRegion.length - 1];
              if (!activeFlowInfoObject[flow]) {
                activeFlowInfoObject[flow] = {};
              }
              activeFlowInfoObject[flow][leafID] = fileName;
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

    // ---------- PREPARE INACTIVE REGIONS
    unsavedRegionsGlobal;

    // ---- DISPLAY ACTIVE REGIONS -----------
    for (let shownFlow of sortActiveRegionsArray) {
      const flowInfoRow = activeFlowsContainer.createDiv({
        text: `${shownFlow} - ${this.plugin.settings.flows[shownFlow].timestamp}`,
        cls: "flow-switch-modal-active-headline",
      });

      Object.keys(activeFlowInfoObject[shownFlow]).forEach((leafID) => {
        // ------ NAVIGATION
        const navigationButton = new ButtonComponent(activeFlowsContainer)
          .setButtonText(
            `Active region: ${activeFlowInfoObject[shownFlow][leafID]}`
          )
          .onClick(() => {
            // get leaf with leafID and make it active leaf
          });
      });
      // -------- BUTTONS
      // ---- save conditional
      let goOpen = "neutral";
      let goSave = "neutral";
      let goRebuild = "neutral";

      // check if there is unsaved stuff for the flow
      for (let unsavedRegion of unsavedRegionsGlobal) {
        if (this.plugin.settings.flows[shownFlow].flowMap[unsavedRegion]) {
          goOpen = "no go"; // don't open
          goRebuild = "no go";
          goSave = "must"; // must save
        }
      }
      // if no save is required, check if flow is flagged for rebuild
      if (
        goSave === "neutral" &&
        this.plugin.settings.flows[shownFlow].flaggedForRebuild
      ) {
        goOpen = "no go";
        goRebuild = "must";
        goSave = "no go";
      }
      // if no save and no rebuild are required
      if (goRebuild === "neutral") {
        goOpen = "must";
      }

      const openButton = new ButtonComponent(activeFlowsContainer)
        .setIcon("play")
        .setClass(`flow-switcher-modal-${goOpen}`)
        .onClick(() => {
          if (goOpen === "neutral" || goOpen === "must") {
            //open flow
          } else {
            //open modal
          }
          // your click handler code here
        });

      const closeButton = new ButtonComponent(activeFlowsContainer)
        .setIcon("x")
        .setClass(`flow-switcher-modal-go`)
        .onClick(() => {
          // for each open leaf, save and close leaf
          // your click handler code here
        });

      const saveButton = new ButtonComponent(activeFlowsContainer)
        .setIcon("download")
        .setClass(`flow-switcher-modal-${goSave}`)
        .onClick(() => {
          if (goSave === "neutral" || goSave === "must") {
            //save flow
          } else {
            //open
          }
          // your click handler code here
        });

      const rebuildButton = new ButtonComponent(activeFlowsContainer)
        .setIcon("rotate-cw")
        .setClass(`flow-switcher-modal-${goSave}`)
        .onClick(() => {
          if (goRebuild === "neutral" || goRebuild === "must") {
            //rebuild flow
          } else {
            //open
          }
          // your click handler code here
        });

      ///
      ///
      ///
      ///
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

//----------- FLOW DEF DELETION
export class DeleteFlowDefModal extends Modal {
  constructor(
    app: App,
    private settings: Types.TextFlowSettings,
    private flowName: string,
    private modalSaveAndReload: () => Promise<void>
  ) {
    super(app);
    this.settings = settings;
    this.flowName = flowName;
    this.modalSaveAndReload = modalSaveAndReload;
  }
  onOpen() {
    const { contentEl } = this;
    console.log(this.flowName);
    console.log(this.settings.flows[this.flowName]);
    contentEl.createEl("h2", {
      text: `Delete the definition for "${this.flowName}"`,
    });
    const helperText = contentEl.createEl("p", {
      text: `This will also delete the related flowFile.`,
      cls: "Tag-modal-helper",
    });

    const deleteButton = new ButtonComponent(contentEl);
    deleteButton.setClass("action-button");
    deleteButton.setClass("action-button-delete-modal");
    deleteButton.setWarning();
    deleteButton.setTooltip(`Delete "${this.flowName}".`);
    deleteButton.setIcon("trash");
    deleteButton.onClick(async () => {
      await this.modalSaveAndReload();

      const flowFilePath = `${this.settings.systemFolderPlace}TextFlow_SystemFolder/${this.flowName}.md`;
      const flowFile = this.app.vault.getAbstractFileByPath(flowFilePath);

      try {
        delete this.settings.flows[this.flowName];
        delete this.settings.activeFlowObject[this.flowName];

        if (flowFile) {
          await this.app.vault.delete(flowFile);
        }
        await this.modalSaveAndReload();
        new Notice(
          `The definition and flowFile of "${this.flowName}" were deleted!`
        );
        this.close();
      } catch (error) {
        new Notice(
          `FAILED to delete definition and flowFile for "${this.flowName}": ` +
            error
        );
      }
    });

    const cancelButton = new ButtonComponent(contentEl);
    cancelButton.setClass("action-button");
    cancelButton.setClass("action-button-cancel");
    cancelButton.setCta();
    cancelButton.setTooltip("Cancel.");
    cancelButton.setIcon("x-circle");
    cancelButton.onClick(async () => {
      this.close();
    });
  }
}
