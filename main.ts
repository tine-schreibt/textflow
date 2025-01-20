import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";
import { TextFlowSettingsTab } from "./src/settingsTab";
import { TextFlowSettings, DEFAULT_SETTINGS } from "./src/types";
// import { TextFlow } from "./src/flowMaker";

export default class TextFlowPlugin extends Plugin {
	settings: TextFlowSettings;
	tempFilePath: string;

	async onload() {
		console.log("TextFlow Plugin loaded.");

		// Load settings
		this.settings = await this.loadSettings();

		// Initialize the temp file
		this.tempFilePath = await this.createTempFile();

		// Add DOM event listeners
		this.addListeners();

		// Register settings tab
		this.addSettingTab(new TextFlowSettingsTab(this.app, this));
	}

	onunload() {
		console.log("TextFlow Plugin unloaded.");

		// Remove listeners or clean up if needed
		this.removeListeners();
	}

	async loadSettings(): Promise<TextFlowSettings> {
		const loadedSettings = await this.loadData();
		return Object.assign({}, DEFAULT_SETTINGS, loadedSettings);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async createTempFile(): Promise<string> {
		const tempFolderPath = this.settings.tempFolder || "Temp";
		const tempFileName = "textFlow-temp.md";

		// Ensure the folder exists
		await this.createFileInFolder(tempFolderPath, tempFileName);
		return `${tempFolderPath}/${tempFileName}`;
	}

	addListeners() {
		// Example: Add DOM or file system event listeners here
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				console.log(`File modified: ${file.path}`);
			})
		);
	}

	removeListeners() {
		// Clean up any registered listeners (if needed)
	}

	async createFileInFolder(
		folderPath: string,
		fileName: string,
		content: string = ""
	) {
		// Your file creation logic goes here
	}
}
