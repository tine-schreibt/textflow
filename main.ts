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

	async onload() {
		await this.loadSettings();

		// Initialize FlowView
		this.flowView = new FlowView(
			this.app.workspace.getLeaf(true),
			this,
			this.settings.flowFolder
		);

		// Add a settings tab
		this.addSettingTab(new TextFlowSettingTab(this.app, this));
	}

	onunload() {
		// Clean up any resources when the plugin is unloaded
		this.app.workspace.detachLeavesOfType(FLOW_VIEW_TYPE);
		console.log("TextFlow plugin unloaded.");
		// Call FlowView's destroy method
		if (this.flowView) {
			this.flowView.destroy();
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
