//#######################################################################
//###########################                ############################
//###########################  SETTINGS TAB  ############################
//###########################                ############################
//#######################################################################

import { Setting, App, PluginSettingTab, TFolder } from "obsidian";
import TextFlow from "main";

export class TextFlowSettingsTab extends PluginSettingTab {
	plugin: TextFlow;

	constructor(app: App, plugin: TextFlow) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// Set a temp folder in which all temp files will be stored
		const setTempFolder = new Setting(containerEl)
			.setName("tempFolder")
			.setDesc("The folder that will hold your temporary files.")
			.addText((text) =>
				text
					.setPlaceholder("Enter the complete folder path")
					.setValue(this.plugin.settings.tempFolder)
					.onChange(async (value) => {
						this.plugin.settings.flowObjects.flow.flowFolder = value;
						await this.plugin.saveSettings();
					})
			)
			.addButton((button) => {
				button.setButtonText("Create Temp Folder");
				button.onClick(async () => {
					const tempFolder: string = this.plugin.settings.tempFolder;
					try {
						// Ensure the folder exists, create it if necessary
						let folder = this.app.vault.getAbstractFileByPath(tempFolder);
						if (!folder) {
							await this.app.vault.createFolder(tempFolder);
							console.log(`Folder created: ${tempFolder}`);
						} else if (!(folder instanceof TFolder)) {
							throw new Error(`"${tempFolder}" exists but is not a folder.`);
						}
					} catch {}
				});
			});

		// Create a new flow
		// name the flow  - > this.plugin.settings.flowObjects.flow (save on input)
		// Input a file path to make the flow out of this file; input a hashtag to make an abstract flow.
		const setFlowFolder = new Setting(containerEl)
			.setName("flowFolder")
			.setDesc(
				"The folder that will be used to build a flow; enter the complete folder path relative to you vault's root folder. Default is that root, but if you have notes that you might want to have displayed alongside your flow, you should put them in a separate folder on the same level."
			)
			.addText((text) =>
				text
					.setPlaceholder("Enter the complete folder path")
					.setValue(this.plugin.settings.flowObjects.flow.flowFolder)
					.onChange(async (value) => {
						this.plugin.settings.flowObjects.flow.flowFolder = value;
						await this.plugin.saveSettings();
					})
			);
	}
	// ########### YOUR FLOWS ###################
	// rename flows, change flows, delete flows
}
