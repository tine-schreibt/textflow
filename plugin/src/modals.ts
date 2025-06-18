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
  WorkspaceLeaf,
} from "obsidian";
import * as Types from "./types";
import { FlowService } from "./flowService";

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
  flowService: FlowService;

  constructor(app: App, plugin: TextFlowPlugin) {
    super(app);
    this.plugin = plugin;
    this.flowService = new FlowService(plugin, app);
  }

  onOpen() {
    this.display();
    this.plugin.registerModalUpdateCallback(() => this.display());
  }

  display() {
    const { contentEl, modalEl } = this;
    contentEl.empty();

    // ------------------------------------------------------------
    // ------------ FUNCTIONS ------------
    // ------------------------------------------------------------

    // -------- rebuilding

    // ----------------------------------------------------------
    // -------- GATHERING AND PRE-PROCESSING OF FLOW DATA -------
    // ----------------------------------------------------------
    // ---- PREPARE ACTIVE REGIONS ---------------
    // object to make flow info easier to grab
    // activeFlowInfoObject: {flowName: {leafID: regionName}
    const activeFlowInfoObject: { [key: string]: { [key: string]: string } } =
      {};

    // iterate over active flow object
    Object.keys(this.plugin.settings.activeFlowObject).forEach((flow) => {
      // gather the info on the active flow's leaves:
      Object.keys(this.plugin.settings.flows[flow].activeRegions).forEach(
        (leafID) => {
          const activeRegion =
            this.plugin.settings.flows[flow].activeRegions[leafID].path?.split(
              "/"
            );
          if (activeRegion) {
            const fileName = activeRegion[activeRegion.length - 1];
            if (!activeFlowInfoObject[flow]) {
              activeFlowInfoObject[flow] = {};
            }
            activeFlowInfoObject[flow][leafID] = fileName;
          }
        }
      );
    });

    // Now we sort it all to make the display predictable to the user
    const sortActiveRegionsArray: string[] = [];
    Object.keys(activeFlowInfoObject).forEach((flow) => {
      sortActiveRegionsArray.push(flow);
    });
    sortActiveRegionsArray.sort();

    // ---------- PREPARE INACTIVE REGIONS
    // ------------------------------------------------------------
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
      text: sortActiveRegionsArray.length > 0 ? "" : "No active flows found",
      cls: "textflow-switcher-active-container textflow-switcher-border-rounded-accent",
    });

    // container for each flow's two parts: header and regions
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
      let goSave = "neutral";
      let goRebuild = "neutral";

      // check if there is unsaved stuff for the flow
      if (
        this.plugin.settings.flows[activeFlow].unsavedRegionsArray.length > 0
      ) {
        goOpen = "no-go"; // don't open
        goRebuild = "no-go";
        goSave = "must"; // must save
      }

      // if no save is required, check if flow is flagged for rebuild
      if (
        goSave === "neutral" &&
        this.plugin.settings.flows[activeFlow].flaggedForRebuild
      ) {
        goOpen = "no-go";
        goRebuild = "must";
        goSave = "no-go";
      }

      // if no save and no rebuild are required
      if (goRebuild === "neutral") {
        goOpen = "neutral";
      }

      const openTabButton = new ButtonComponent(flowHeader)
        .setIcon("play")
        .setClass(`flow-switch-modal-header-button-${goOpen}`)
        .setClass("clickable-icon")
        .onClick(async () => {
          if (goOpen === "neutral" || goOpen === "must") {
            const file = this.app.vault.getAbstractFileByPath(
              this.plugin.settings.flows[activeFlow].flowFilePath
            );
            if (file instanceof TFile) {
              const leaf = this.app.workspace.getLeaf("tab");
              await leaf.openFile(file);
              leaf.setPinned(true);
              this.app.workspace.setActiveLeaf(leaf, { focus: true });
            }
          }
        });

      const openRightButton = new ButtonComponent(flowHeader)
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
              await leaf.openFile(file);
              leaf.setPinned(true);
              this.app.workspace.setActiveLeaf(leaf, { focus: true });
            }
          }
        });

      const openDownButton = new ButtonComponent(flowHeader)
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
              await leaf.openFile(file);
              leaf.setPinned(true);
              this.app.workspace.setActiveLeaf(leaf, { focus: true });
            }
          }
        });

      const saveButton = new ButtonComponent(flowHeader)
        .setIcon("download")
        .setClass(`flow-switch-modal-header-button-${goSave}`)
        .setClass("clickable-icon")
        .onClick(async () => {
          if (goSave === "neutral" || goSave === "must") {
            await this.plugin.saveAllLeavesManual();
            await this.plugin.saveSettings();
            this.display();
          } else {
            return;
          }
        });

      const rebuildButton = new ButtonComponent(flowHeader)
        .setIcon("rotate-cw")
        .setClass(`flow-switch-modal-header-button-${goRebuild}`)
        .setTooltip(
          goRebuild === "no-go"
            ? `To overwrite unsaved changes, please use the settings tab.`
            : ""
        )
        .setClass("clickable-icon")
        .onClick(async () => {
          if (goRebuild === "neutral" || goRebuild === "must") {
            await this.flowService.rebuildFlow(activeFlow);
            await this.plugin.saveSettings();
            this.display();
          } else if (goRebuild === "no-go") {
            return;
          }
        });

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
                this.display();
              }
            }
          );
        });

      // ------ ACTIVE FLOW LEAF NAVIGATION --------------
      let activeRegionBorderColorCounter = 0;

      Object.keys(activeFlowInfoObject[activeFlow]).forEach((leafID) => {
        activeRegionBorderColorCounter += 1;
        let activeRegionBorderColorCalculator =
          activeRegionBorderColorCounter % 2;

        // region container
        const flowRegion = activeFlowEntry.createDiv({
          cls: `flow-switch-modal-active-region textflow-switcher-border-bottom-${activeRegionBorderColorCalculator}`,
        });

        // region icon
        const regionIconSpan = flowRegion.createSpan({
          cls: `flow-switch-modal-active-region-down-arrow`,
        });
        setIcon(regionIconSpan, "corner-down-right");

        // region name
        const regionName = flowRegion.createSpan({
          text: `${activeFlowInfoObject[activeFlow][leafID].replace("#", "")}`,
          cls: "flow-switch-modal-active-region-name",
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
              this.display();
            }
          });
      });
    }

    // ---- DISPLAY INACTIVE FLOWS -----------
    const inactiveFlowContainer = mainContainer.createDiv({
      text: sortedInactiveFlowArray.length > 0 ? "" : "No inactive flows found",
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
      let goSave = "neutral";
      let goRebuild = "neutral";

      // check if there is unsaved stuff for the flow
      if (
        this.plugin.settings.flows[inactiveFlow].unsavedRegionsArray.length > 0
      ) {
        goOpen = "neutral"; // don't open
        goRebuild = "no-go";
        goSave = "must"; // must save
      }
      // check if flow is flagged for rebuild
      if (
        goSave === "neutral" &&
        this.plugin.settings.flows[inactiveFlow].flaggedForRebuild
      ) {
        goOpen = "no-go";
        goRebuild = "must";
        goSave = "no-go";
      }
      // check for conflicts
      const conflictsWithActive: string[] = [];
      Object.keys(activeFlowInfoObject).forEach((flow) => {
        if (
          this.plugin.settings.flows[inactiveFlow].conflictArray.includes(flow)
        ) {
          goOpen = "no-go";
          conflictsWithActive.push(flow);
        }
      });

      // ----------- OPEN BUTTON ------------
      const openTabButton = new ButtonComponent(inactiveFlowHeader)
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
              await leaf.openFile(file);
              leaf.setPinned(true);
              this.app.workspace.setActiveLeaf(leaf, { focus: true });
            }
          }
        });

      const openRightButton = new ButtonComponent(inactiveFlowHeader)
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
              await leaf.openFile(file);
              leaf.setPinned(true);
              this.app.workspace.setActiveLeaf(leaf, { focus: true });
            }
          }
        });

      const openDownButton = new ButtonComponent(inactiveFlowHeader)
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
              await leaf.openFile(file);
              leaf.setPinned(true);
              this.app.workspace.setActiveLeaf(leaf, { focus: true });
            }
          }
        });

      // ----------- SAVE BUTTON ------------
      const saveButton = new ButtonComponent(inactiveFlowHeader)
        .setIcon("download")
        .setClass(`flow-switch-modal-header-button-${goSave}`)
        .setClass("clickable-icon")
        .onClick(async () => {
          if (goSave === "neutral" || goSave === "must") {
            if (goSave === "neutral" || goSave === "must") {
              await this.plugin.saveAllLeavesManual();
              await this.plugin.saveSettings();
              this.display();
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
            await this.flowService.rebuildFlow(inactiveFlow);
            await this.plugin.saveSettings();
            this.display();
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
