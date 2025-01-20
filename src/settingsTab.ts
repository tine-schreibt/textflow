//#######################################################################
//###########################                ############################
//###########################  SETTINGS TAB  ############################
//###########################                ############################
//#######################################################################

import { Setting, App, PluginSettingTab } from "obsidian";
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

		new Setting(containerEl)
			.setName("Setting #1")
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder("Enter your secret")
					.setValue(this.plugin.settings.mySetting)
					.onChange(async (value) => {
						this.plugin.settings.mySetting = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
