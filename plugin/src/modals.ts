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

  private getFlowStatus(flowName: string): Types.ModalFlowStatus {
    // Check if flow is currently active
    if (this.plugin.settings.activeFlowObject) {
      if (this.plugin.settings.activeFlowObject[flowName]) {
        return "on";
      }
    }

    // Check if flow exists and is valid
    const flow = this.plugin.settings.flows[flowName];
    if (!flow || !this.app.vault.getAbstractFileByPath(flow.flowFilePath)) {
      return "incompatible";
    }

    return "off";
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("textflow-switcher");

    const flowContainer = contentEl.createDiv("textflow-switcher-container");

    Object.entries(this.plugin.settings.flows).forEach(([flowName, flow]) => {
      const flowStatus = this.getFlowStatus(flowName);
      const flowOption = flowContainer.createDiv("textflow-switcher-option");
      flowOption.addClass("clickable-icon");
      flowOption.addClass(`flow-status-${flowStatus}`);

      setIcon(flowOption.createSpan(), "file-text");
      flowOption.createSpan({ text: flowName });

      if (flowStatus !== "incompatible") {
        flowOption.addEventListener("click", async () => {
          if (flowStatus === "on") {
            // Find and focus existing leaf
            const existingLeaf = this.app.workspace
              .getLeavesOfType("markdown")
              .find(
                (leaf) =>
                  leaf.view instanceof MarkdownView &&
                  leaf.view.file?.path === flow.flowFilePath
              );
            if (existingLeaf) {
              await this.app.workspace.setActiveLeaf(existingLeaf);
            }
          } else {
            // Open new flow
            await this.plugin.activateFlow(flowName);
          }
          this.close();
        });
      }
    });
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
