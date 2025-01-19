import {
	App,
	Editor,
	ItemView,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	TFolder,
	Vault,
	WorkspaceLeaf,
} from "obsidian";
import { EditorState } from "@codemirror/state";
import { defaultHighlightStyle } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { FlowView, FLOW_VIEW_TYPE } from "src/flowView";
import { DEFAULT_SETTINGS, TextFlowSettings } from "src/types";
import { TextFlowSettingTab } from "src/settingsTab";

//#######################################################################
//###########################                ############################
//###########################     main.ts    ############################
//###########################                ############################
//#######################################################################

export default class TextFlow extends Plugin {
	// here we extend the Plugin class
	private flowViews: Map<WorkspaceLeaf, FlowView> = new Map(); // what exactly is a map and what does it do?
	private boundFileOpenHandler: (file: TFile | null) => Promise<void>; // this I don't understand, but I'll ask more about it when it comes up again later
	settings: TextFlowSettings; // those are the settings; right now there's just a single setting; we also have an interface called TextFlow, but I don't know what it's for, exactly, and if it might be the missing piece in some of the problems here
	private tempFile: TFile | null = null; // this is the temp file, and I guess at least its name/path should be part of the settings
	private tempFilePath: string; // the file path; I don't think we should need this as well as tempFile, should we? Saying once where the file is and what it's called should suffice?
	private initialized = false; // This checks if the plugin is initialized, but in a different iteration we had decided that Obsidian would handle the plugin state. I don't quite know why it's back now

	async onload() {
		// we load the plugin
		try {
			// Load settings first
			await this.loadSettings(); // we load the settings

			// Ensure temp file exists
			await this.ensureTempFile(); // we ensure the temp file exists

			// Initialize the bound handler
			this.boundFileOpenHandler = this.handleFileOpen.bind(this); // here we got the boundFile stuff. This feels redundant.
			// I also don't understand what handleFileOpen.bind(this) means or does.

			// Register view
			this.registerView(FLOW_VIEW_TYPE, (leaf) => {
				// we're registering the view that's created by the FlowView class
				const view = new FlowView(
					leaf,
					this.settings.flowFolder,
					this.tempFile! // the arguments the class needs for creation
				);
				this.flowViews.set(leaf, view); // here we're using the map
				return view;
			});

			// Add settings tab
			this.addSettingTab(new TextFlowSettingTab(this.app, this));

			// Register file handler
			this.registerEvent(
				this.app.workspace.on("file-open", this.boundFileOpenHandler) // The event listener that triggers the handleFileOpen function when a file is opened. That function doesn't seem to work at the moment.
			);

			this.initialized = true; // We flagged this, but I'm not sure why we should need this. There was an issue of stuff loading multiple times, but this flag didn't solve that.
			console.log("Plugin initialization completed"); // this message was logged.
		} catch (error) {
			console.error("Failed to initialize plugin:", error); // this was also logged quite a couple of times.
			new Notice("Failed to initialize Text Flow plugin");
			throw error; // Re-throw to prevent partial initialization <- Is this really necessary?
		}
	}

	async onunload() {
		// here we clean up stuff when the plugin is unloaded
		try {
			// Remove event listeners
			if (this.boundFileOpenHandler) {
				this.app.workspace.off("file-open", this.boundFileOpenHandler); // here we remove the event listener
			}

			// Clean up flow views
			this.flowViews.clear(); // here we clear the map

			// Delete temp file if it exists <- Doesn't work.
			if (
				this.tempFile &&
				(await this.app.vault.adapter.exists(this.tempFilePath))
			) {
				await this.app.vault.delete(this.tempFile); // why does this not work? How can we find out?
				console.log("Temp file deleted during cleanup"); // this is never logged
			}

			// Clear references
			this.tempFile = null;
			this.initialized = false;

			console.log("Plugin cleanup completed"); // this is logged, though.
		} catch (error) {
			console.error("Error during plugin cleanup:", error);
		}
	}

	async loadSettings() {
		// here's what we call during onload.
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		// saving
		await this.saveData(this.settings);
	}

	private async ensureTempFile(): Promise<void> {
		// checking if the temp file exists
		console.log("Starting ensureTempFile");
		try {
			this.tempFilePath = "_textflow.md";
			console.log("Temp file path:", this.tempFilePath);

			// Check if file exists using the adapter directly
			const fileExists = await this.app.vault.adapter.exists(this.tempFilePath);
			console.log("File exists check:", fileExists); // all of this works.

			if (fileExists) {
				// Get the existing file
				this.tempFile = this.app.vault.getAbstractFileByPath(
					this.tempFilePath
				) as TFile;
				if (!this.tempFile) {
					// File exists but we can't get a reference (is this surely the reason why we get false for a file that exists? a missing reference?)
					await this.app.vault.adapter.remove(this.tempFilePath);
					this.tempFile = await this.app.vault.create(this.tempFilePath, "");
					console.log("Recreated file after inconsistent state"); // this is always logged, so even though the file exists, as far as the plugin is concerned it doesn't really?
				} else {
					// Clear existing file
					await this.app.vault.modify(this.tempFile, "");
					console.log("Cleared existing file"); // this is never logged, and I don't know why this part is even here; why would we delete the file we've been looking for?
				}
			} else {
				// Create new file
				console.log("Creating new file");
				this.tempFile = await this.app.vault.create(this.tempFilePath, "");
			}

			console.log("Temp file setup complete"); // this is also always logged.
		} catch (error) {
			console.error("Error in ensureTempFile:", error);
			throw error;
		}
	}

	// Check if the clicked file is part of the flowFolder
	private isFileInFlowFolder(file: TFile): boolean {
		// this function seems completely nonsensical and doesn't do what it's supposed to do
		if (!file) {
			return false; // Add this check to prevent reading properties of null
		}
		const flowFolder = this.settings.flowFolder;
		return file.path.startsWith(flowFolder);
		// the actual check for whether the file is in the flow folder is completely missing.
	}

	// Open a new FlowView or focus on an existing one
	private async openOrFocusFlowView() {
		// this function is crucial in order for the plugin to work, but it's never called.
		const existingLeaf = this.app.workspace.getLeavesOfType(FLOW_VIEW_TYPE)[0]; // this delves into the inner workings of Obsidian; could you explain what happens here?

		if (existingLeaf) {
			// if we have a flowView leaf
			await this.app.workspace.setActiveLeaf(existingLeaf, { focus: true }); // focus the leaf
		} else {
			const leaf = this.app.workspace.getLeaf("split"); // if we don't, we split the editor an make one.
			await leaf.setViewState({
				type: FLOW_VIEW_TYPE,
				state: {},
			});
		}
	}

	private async handleFileOpen(file: TFile | null): Promise<void> { // Still I feel like this is redundant in some way
		if (!file || !this.tempFile) return;

		// Check if this file is in our flow folder
		if (this.isFileInFlowFolder(file)) { // the check that doesn't check anything 
			console.log("Flow folder file clicked:", file.path); 

			// Open or focus our flow view
			const existingLeaf =
				this.app.workspace.getLeavesOfType(FLOW_VIEW_TYPE)[0];
			if (existingLeaf) { // so existingLeaf needs to be able to be null? 
				console.log("Focusing existing flow view");
				await this.app.workspace.setActiveLeaf(existingLeaf, { focus: true }); // here we got the focusing logic again, instead of using the function we wrote
			} else {
				console.log("Creating new flow view");
				const leaf = this.app.workspace.getLeaf("split");
				await leaf.setViewState({
					type: FLOW_VIEW_TYPE,
					state: { folder: this.settings.flowFolder },
				});
			}
		}
	}
}

// In colclusion: This code is a mess and it's no wonder it's not working. 
// Would you please answer the questions I asked in my comments and tell me if I got anything wrong? 
// I also need help to figure out what a good structure for this file would look like, so if you have any suggestions, please let me know. 