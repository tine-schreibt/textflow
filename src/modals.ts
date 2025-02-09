import TextFlowPlugin from "main";
import {
  App,
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

export class DeleteOldTempFolderModal extends Modal {
  private plugin: TextFlowPlugin;
  private newTempFolderCreation: (path: string) => Promise<void>; // Changed this line
  private discernAndSetTempFolderState: () => void;
  private oldTempFolderPath: string;
  private newTempFolderPath: string;
  private newTempFolderPlace: string;

  constructor(
    app: App,
    plugin: TextFlowPlugin,
    newTempFolderCreation: (path: string) => Promise<void>,
    discernAndSetTempFolderState: (
      tempFolderState?: boolean,
      tempFolderPlace?: string
    ) => void,
    oldTempFolderPath: string,
    newTempFolderPath: string,
    newTempFolderPlace: string
  ) {
    super(app);
    this.plugin = plugin;
    this.newTempFolderCreation = newTempFolderCreation;
    this.discernAndSetTempFolderState = () =>
      discernAndSetTempFolderState(
        this.plugin.settings.tempFolderHidden,
        this.plugin.settings.tempFolderPlace
      );
    this.oldTempFolderPath = oldTempFolderPath;
    this.newTempFolderPath = newTempFolderPath;
    this.newTempFolderPlace = newTempFolderPlace;
  }
  onOpen() {
    const { contentEl } = this;

    const modalTitle = contentEl.createEl("h2", {
      text: `Delete or keep old temporary folder`,
    });
    const modalText = contentEl.createEl("span", {
      text: `Do you want to delete the old temp folder or keep it and unhide it? The new temp folder will be created at the location specified in the settings.`,
    });
    new Setting(modalText)
      .addButton((deleteButton) =>
        deleteButton
          .setButtonText("Delete old temp folder")
          .onClick(async () => {
            console.log(`this.oldTempFolderPath ${this.oldTempFolderPath}`);
            const oldTempFolder = this.app.vault.getAbstractFileByPath(
              this.oldTempFolderPath
            );

            // Check if the folder is either null or not an instance of TFolder
            if (oldTempFolder === null || !(oldTempFolder instanceof TFolder)) {
              console.log(
                `Folder at ${this.oldTempFolderPath} doesn't exist or is not a folder.`
              );
              return; // Exit early, as there's nothing to delete or it's not a folder.
            }
            try {
              // Delete the old folder
              await this.app.vault.delete(oldTempFolder);
              console.log(`Deleted oldTempFolder: ${oldTempFolder}`);

              // Create the new temp folder
              await this.newTempFolderCreation(this.newTempFolderPath);
              new Notice(
                `Successfully deleted old temp folder from ${this.oldTempFolderPath} and created a new hidden temp folder: ${this.newTempFolderPath}`
              );
            } catch (error) {
              console.error(`Failed to delete or create folder:`, error);
            }
            try {
              this.plugin.settings.tempFolderPlace = this.newTempFolderPlace;
              this.discernAndSetTempFolderState();
              await this.plugin.saveSettings();
            } catch (error) {
              console.error("Failed to save settings:", error);
              new Notice("Failed to save settings");
            }
            this.close();
          })
      )
      .addButton((unhideButton) =>
        unhideButton
          .setButtonText("Keep and unhide old temp folder")
          .onClick(async () => {
            const oldTempFolder = this.app.vault.getAbstractFileByPath(
              this.oldTempFolderPath
            );
            if (!oldTempFolder || !(oldTempFolder instanceof TFolder)) {
              console.log(
                `Folder at ${this.oldTempFolderPath} doesn't exist or is not a folder.`
              );
              this.close();
              return;
            }

            try {
              const parentPath = oldTempFolder.parent?.path || "";
              const newPath = `${
                parentPath ? parentPath + "/" : ""
              }oldTempFolder`;
              await this.app.vault.rename(oldTempFolder, newPath);
              await this.newTempFolderCreation(this.newTempFolderPath);
              new Notice(
                `Successfully unhidden old temp folder in ${this.oldTempFolderPath} and created a new hidden temp folder: ${this.newTempFolderPath}`
              );
            } catch (error) {
              console.error(`Failed to rename folder:`, error);
            }
            try {
              this.plugin.settings.tempFolderPlace = this.newTempFolderPlace;
              this.discernAndSetTempFolderState();
              await this.plugin.saveSettings();
            } catch (error) {
              console.error("Failed to save settings:", error);
              new Notice("Failed to save settings");
            }
            this.close();
          })
      );
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
