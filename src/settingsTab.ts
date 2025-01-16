//#######################################################################
//###########################                ############################
//###########################  SETTINGS TAB  ############################
//###########################                ############################
//#######################################################################

import { Setting, App, PluginSettingTab } from "obsidian";
import TextFlow from "main";

export class TextFlowSettingTab extends PluginSettingTab {
	plugin: TextFlow;

	constructor(app: App, plugin: TextFlow) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Folder to flow")
			.setDesc("Full path")
			.addText((text) =>
				text
					.setPlaceholder("Enter the path")
					.setValue(this.plugin.settings.flowFolder)
					.onChange(async (value) => {
						this.plugin.settings.flowFolder = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
