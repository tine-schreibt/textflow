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
	settings: TextFlowSettings;
	private flowView: FlowView; // Declare flowView
	editorView: EditorView;
	private isPluginActive: boolean = false; // Add this line

	async onload() {
		await this.loadSettings();
		this.isPluginActive = true; // Set the plugin state to active
		this.registerView(
			FLOW_VIEW_TYPE, // The unique type string for your FlowView
			(leaf) => {
				this.flowView = new FlowView(leaf, this, this.settings.flowFolder); // Assign the instance to this.flowView
				return this.flowView; // Return the FlowView instance as required by registerView
			}
		);

		// Ensure workspace is initialized before proceeding
		this.app.workspace.on("layout-change", () => {
			// Check if there is already a FlowView
			this.openOrFocusFlowView();
		});

		// Add a settings tab
		this.addSettingTab(new TextFlowSettingTab(this.app, this));

		// Add event listener for file explorer clicks
		this.addFileExplorerClickListener();
		console.log("loaded plugin textFlow");
	}
	/*	private fileOpenHandler = (file: TFile | null) => {
		if (!this.isPluginActive) {
			console.log("Plugin is not active, ignoring file open event");
			return;
		}

		if (!file) {
			console.error(`File is null or undefined.`);
			return;
		}

		console.log(`File clicked: ${file.path}`);
		if (this.isFileInFlowFolder(file)) {
			console.log(`File "${file.path}" is part of the flow folder.`);
			this.openOrFocusFlowView();
		}
	};*/

	async onunload() {
		console.log("=== FlowView onUnload ===");
		await super.onunload();
		this.isPluginActive = false;
		// Remove the workspace event listeners
		this.app.workspace.off("file-open", this.addFileExplorerClickListener);

		// Clean up any open FlowViews
		this.app.workspace.getLeavesOfType(FLOW_VIEW_TYPE).forEach((leaf) => {
			if (leaf.view instanceof FlowView) {
				(leaf.view as FlowView).destroy();
			}
			leaf.detach();
		});
		console.log("Plugin unloaded successfully.");
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Add a listener for file clicks in the file explorer
	private addFileExplorerClickListener() {
		this.app.workspace.on("file-open", (file: TFile | null) => {
			console.log("=== File-open event triggered ===");
			console.log(
				"Active view before handling:",
				this.app.workspace.getActiveViewOfType(MarkdownView)?.getState()
			);
			console.log(
				"All markdown leaves:",
				this.app.workspace.getLeavesOfType("markdown")
			);
			console.log(
				"All leaves:",
				this.app.workspace.getLeavesOfType("markdown")
			);

			if (!this.isPluginActive) {
				console.log("Plugin is not active, ignoring file open event");
				return;
			}

			if (!file) {
				console.error(`File is null or undefined.`);
				return;
			}
			console.log(`File clicked: ${file.path}`);

			// Only open/focus FlowView if the clicked file is in the flow folder
			if (this.isFileInFlowFolder(file)) {
				console.log(`File "${file.path}" is part of the flow folder.`);
				this.openOrFocusFlowView();
			} else {
				console.log(`Clicked on non-flow file: ${file.path}`);
			}
			console.log(
				"Active leaf after handling:",
				this.app.workspace.getActiveViewOfType(MarkdownView)?.getState()
			);
		});
	}

	// Check if the clicked file is part of the flowFolder
	private isFileInFlowFolder(file: TFile): boolean {
		if (!file) {
			return false; // Add this check to prevent reading properties of null
		}
		const flowFolder = this.settings.flowFolder;
		return file.path.startsWith(flowFolder);
	}

	// Open a new FlowView or focus on an existing one
	private async openOrFocusFlowView() {
		console.log("=== openOrFocusFlowView called ===");
		console.log(
			"Current active view:",
			this.app.workspace.getActiveViewOfType(MarkdownView)
		);

		if (!this.isPluginActive) {
			console.log("Plugin is not active, cannot open flow view");
			return;
		}

		const allLeaves = this.app.workspace.getLeavesOfType(FLOW_VIEW_TYPE);
		console.log("All flow view leaves:", allLeaves);

		const flowViewLeaf = allLeaves[0];
		console.log("Selected flow view leaf:", flowViewLeaf);

		if (flowViewLeaf) {
			console.log(
				"Before setActiveLeaf - current active:",
				this.app.workspace.getActiveViewOfType(MarkdownView)?.getState()
			);
			await this.app.workspace.setActiveLeaf(flowViewLeaf);
			console.log(
				"After setActiveLeaf - new active:",
				this.app.workspace.getActiveViewOfType(MarkdownView)?.getState()
			);
		} else {
			console.log("No existing FlowView found. Creating a new one.");
			const leaf = this.app.workspace.getLeaf(true);
			if (leaf) {
				await leaf.setViewState({
					type: FLOW_VIEW_TYPE,
					state: {},
				});
				await this.app.workspace.setActiveLeaf(leaf);
				console.log(`flow leaf created for ${this.settings.flowFolder}`);
			} else {
				console.error("Failed to create a new leaf for FlowView.");
			}
		}
	}

	// Proper cleanup for flow views (to ensure the plugin doesn't get detached)
	private detachFlowView() {
		const flowViewLeaf = this.app.workspace.getLeavesOfType(FLOW_VIEW_TYPE)[0];
		console.log("FlowView leaf found:", flowViewLeaf);
		if (flowViewLeaf) {
			// Ensure we're not detaching a valid flow view prematurely
			this.app.workspace.setActiveLeaf(flowViewLeaf);
		} else {
			console.log("No FlowView leaf found.");
		}
	}
}
