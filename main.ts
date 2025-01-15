import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	TFolder,
	Vault,
} from "obsidian";

// Remember to rename these classes and interfaces!

//#######################################################################
//###########################                ############################
//###########################  settings.ts   ############################
//###########################                ############################
//#######################################################################

interface TextFlowSettings {
	flowFolder: string;
}

const DEFAULT_SETTINGS: TextFlowSettings = {
	flowFolder: "default",
};

//#######################################################################
//###########################                ############################
//###########################     main.ts    ############################
//###########################                ############################
//#######################################################################

export default class TextFlow extends Plugin {
	settings: TextFlowSettings;

	async onload() {
		await this.loadSettings();
		console.log("------------ RELOAD ---------------");
		this.logFiles(this.settings.flowFolder);

		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: "open-sample-modal-complex",
			name: "Open sample modal (complex)",
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new TextFlowSettingTab(this.app, this));

		/*// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, "click", (evt: MouseEvent) => {
			console.log("click", evt);
		});*/
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
	async logFiles(folderPath: string) {
		const folder = this.app.vault.getAbstractFileByPath(folderPath);

		if (folder instanceof TFolder) {
			console.log(`- ${folder.name}`);

			// Process each child
			for (const child of folder.children) {
				if (child instanceof TFile) {
					console.log(`-- ${child.name}`);
					const content = await this.app.vault.read(child);
					console.log(`${content}`);
				} else if (child instanceof TFolder) {
					// Recursive call for subfolders
					await this.logFiles(child.path);
				}
			}
		} else {
			console.error(
				`The path "${folderPath}" is not a folder or doesn't exist.`
			);
		}
	}
}

//#######################################################################
//###########################                ############################
//###########################     modal      ############################
//###########################                ############################
//#######################################################################

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText("Woah!");
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

//#######################################################################
//###########################                ############################
//###########################  SETTINGS TAB  ############################
//###########################                ############################
//#######################################################################

class TextFlowSettingTab extends PluginSettingTab {
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
