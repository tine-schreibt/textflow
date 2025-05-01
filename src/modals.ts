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
      for (let i = 0; this.finalReceipe.length > i; i++) {
        let item = this.finalReceipe[i];
        if (item.startsWith("§")) {
          previewContent.push(item.replace("§", "#"));
        } else {
          const itemArray = item.split("/");
          item = `-- ${itemArray[itemArray.length - 1]}`;
          previewContent.push(item);
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

export class HandleOrphanedFiles extends Modal {
  private flowPath: string;
  private orphanPath: string;
  private flow: Types.FlowDef;
  private flowName: string;

  constructor(
    app: App,
    flowPath: string,
    orphanPath: string,
    flow: Types.FlowDef,
    flowName: string
  ) {
    super(app);
    this.flowPath = flowPath;
    this.orphanPath = orphanPath;
    this.flow = flow;
    this.flowName = flowName;
  }

  private closeOrphanFile = () => {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView) {
      activeView.leaf.detach();
    }
  };

  private closeFlow = (flowPath: string) => {
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    const targetLeaf = leaves.find(
      (leaf) =>
        leaf.view instanceof MarkdownView && leaf.view.file?.path === flowPath
    );
    if (targetLeaf) {
      targetLeaf.detach();
    }
  };

  onOpen() {
    const { contentEl } = this;
    const modalTitle = contentEl.createEl("h2", {
      text: `Orphaned flow source`,
    });
    const modalText = contentEl.createEl("span", {
      text:
        `The file ${this.orphanPath} is part of the active flow ${this.flowName}.\r` +
        `Editing it now could lead to data loss.\r` +
        `How would you like to proceed?`,
    });

    new Setting(modalText)
      .addButton((viewInFlow) =>
        viewInFlow
          .setButtonText("View in Flow")
          .setCta()
          .onClick(async () => {
            console.log("View in Flow button clicked");

            try {
              // Find and focus the flow file
              const flowFile = this.app.vault.getAbstractFileByPath(
                this.flow.flowFilePath
              );
              if (flowFile instanceof TFile) {
                console.log("Opening flow file");
                const leaf = this.app.workspace.getMostRecentLeaf();
                await leaf?.openFile(flowFile);
                const startPos =
                  this.flow.flowMap[this.orphanPath].startEndInFlow.start;
                if (leaf?.view instanceof MarkdownView) {
                  const editor = leaf.view.editor;
                  editor.setCursor(editor.offsetToPos(startPos));
                }
              }

              // Try different close approaches
              console.log("Attempting to close modal");
              super.close();
              this.contentEl.empty();
              this.modalEl.remove();
            } catch (error) {
              console.error("Error in modal close:", error);
            }
          })
      )
      .addButton((closeFlow) =>
        closeFlow.setButtonText("Close Flow").onClick(async () => {
          // Close flow and open this file
          this.closeFlow(this.flow.flowFilePath);
          super.close();
        })
      )
      .addButton((closeFile) =>
        closeFile.setButtonText("Close orphan file").onClick(() => {
          this.closeOrphanFile(); // Close the constituent file
          super.close();
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
