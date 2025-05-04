import TextFlowPlugin from "main";
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
import * as Types from "src/types";

export class previewModal extends Modal {
  private plugin: TextFlowPlugin;
  private finalReceipe: string[];

  constructor(app: App, plugin: TextFlowPlugin, finalReceipe: string[]) {
    super(app);
    this.plugin = plugin;
    this.finalReceipe = finalReceipe;
  }
  onOpen() {
    const { contentEl } = this;

    const modalTitle = contentEl.createEl("h2", {
      text: `Here is a preview of the notes that your flow will contain.`,
    });

    const previewContainer = contentEl.createDiv({
      cls: "preview-container",
    });

    if (this.finalReceipe.length <= 1) {
      previewContainer.setText(
        "Your criteria yielded no results. Try editing them to be less restrictive."
      );
    } else {
      let previewContent: string[] = [];
      for (let ingretient of this.finalReceipe) {
        if (ingretient.startsWith("§")) {
          previewContent.push(ingretient.replace("§", "#"));
        } else {
          const ingredientArray = ingretient.split("/");
          ingretient = `-- ${ingredientArray[ingredientArray.length - 1]}`;
          previewContent.push(ingretient);
        }
      }
      const finishedPreviewContent = previewContent.join("\n");
      previewContainer.setText(`${finishedPreviewContent}`);
    }
    const closeModal = new Setting(contentEl).setDesc(
      createFragment((desc) => {
        desc.createSpan({
          text: "After closing this modal you can either edit your flow definition or save it.",
        });
        desc.createEl("br");
        desc.createSpan({
          text: "Flow creation happens after you saved the definition.",
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

//--------------------------

export class ProtectSourceFilesModal extends Modal {
  private leafArray: MarkdownView[];
  private flowName: string;
  private dismissedSourceWarnings: Record<string, boolean>;
  //  private rebuildFlow(): function;

  constructor(
    app: App,
    leafArray: MarkdownView[],
    flowName: string,
    dismissedSourceWarnings: Record<string, boolean>
    //  rebuildFlow(): function
  ) {
    super(app);
    this.leafArray = leafArray;
    this.flowName = flowName;
    this.dismissedSourceWarnings = dismissedSourceWarnings;
    //   this.rebuildFlow = rebuildFlow();
  }

  private closeSourceFiles = () => {
    for (let view of this.leafArray) {
      view.leaf.detach();
    }
  };
  private getNoteNames = () => {
    const noteNamesArray: string[] = [];
    for (let view of this.leafArray) {
      if (view.file) {
        const path = view.file.path;
        const noteNameSplit = path.split("/");
        const noteName = noteNameSplit[noteNameSplit.length - 1];
        noteNamesArray.push(noteName);
      }
    }
    return noteNamesArray.join(", ");
  };

  onOpen() {
    const { contentEl } = this;
    const modalTitle = contentEl.createEl("h2", {
      text: `Recently opened source files detected`,
    });

    const modalText = contentEl.createEl("span", {
      text:
        `The following source files of flow ${
          this.flowName
        } have recently been active: ${this.getNoteNames()}.\r` +
        `To transfer any changes made to the contents of these files into the flow, please rebuild the flow.`,
    });

    let closeFiles = false;
    let rebuildFlow = false;
    let dontShowAgain = false;

    new Setting(modalText)
      .addToggle((closeToggle) => {
        closeToggle
          .setValue(false)
          .setTooltip("Close all source files")
          .onChange((value) => (closeFiles = value));
      })
      .addToggle((rebuildToggle) => {
        rebuildToggle
          .setValue(false)
          .setTooltip(`Rebuild ${this.flowName}`)
          .onChange((value) => (rebuildFlow = value));
      })
      .addToggle((dismissToggle) => {
        dismissToggle
          .setValue(false)
          .setTooltip(`Don't show this warning again`)
          .onChange((value) => (dontShowAgain = value));
      })

      .addButton((okayButton) =>
        okayButton.setButtonText("Okay").onClick(async () => {
          try {
            if (closeFiles) this.closeSourceFiles();
            if (rebuildFlow) this.rebuildFlow(this.flowName);
            if (dontShowAgain)
              this.dismissedSourceWarnings[this.flowName] = true;
            super.close();
          } catch (error) {
            console.error(
              "Error when trying to close leaves or rebuild flow",
              error
            );
          }
        })
      );
  }

  onClose() {
    const { contentEl } = this;
    this.contentEl.empty();
  }
}

export class FlowSwitcherModal extends Modal {
  private plugin: TextFlowPlugin;

  constructor(app: App, plugin: TextFlowPlugin) {
    super(app);
    this.plugin = plugin;
  }

  private getFlowStatus(flowName: string): Types.ModalFlowStatus {
    // Check if flow is currently active
    if (this.plugin.settings.activeFlows) {
      if (this.plugin.settings.activeFlows.includes(flowName)) {
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
