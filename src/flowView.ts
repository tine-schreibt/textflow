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
import {
	defaultHighlightStyle,
	syntaxHighlighting,
} from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { TextFlow } from "./types";

export const FLOW_VIEW_TYPE = "flow-view"; // The name of the view

export class FlowView extends ItemView {
	// Properties
	app: App; // Provides access to Obsidian's core functionality.
	plugin: Plugin; // Gives access to your plugin instance.
	editorView: EditorView; // A CodeMirror instance for text rendering and editing.
	flowFolder: string;

	constructor(leaf: WorkspaceLeaf, plugin: Plugin, flowFolder: string) {
		super(leaf);
		console.log("=== FlowView Constructor ===");
		console.log("Leaf state:", leaf.getViewState());
		console.log("FlowView created for leaf:", leaf);
		this.plugin = plugin;
		this.flowFolder = flowFolder;
		this.initView();
	}

	getViewType(): string {
		return FLOW_VIEW_TYPE; // Unique identifier for the view.
	}

	getDisplayText(): string {
		return "Flow View"; // What shows in the UI (tab title, listings, etc.).
	}

	initView(): void {
		console.log("Initializing FlowView...");
		this.leaf.getViewState().state;
		console.log(
			"this.leaf.getViewState().state is: ",
			this.leaf.getViewState().state
		);
		const container = this.containerEl;
		// Create the CodeMirror editor
		this.editorView = new EditorView({
			state: EditorState.create({
				doc: "",
				extensions: [basicSetup, syntaxHighlighting(defaultHighlightStyle)],
			}),
			parent: container,
		});
		this.loadContent();
		console.log("FlowView initialized.");
	}

	async loadContent(): Promise<void> {
		const plugin = this.plugin as TextFlow;

		if (!(plugin as any).isPluginActive) {
			console.log("Plugin is not active, skipping content load");
			return;
		}
		try {
			let combinedText = "";

			const folder = this.app.vault.getAbstractFileByPath(this.flowFolder);
			//	console.log("Looking for folder: ", folder); // Debug log

			if (!folder || !(folder instanceof TFolder)) {
				console.error("Invalid flow folder: ", this.flowFolder);
				return;
			}
			//	console.log("Found folder :", folder); // Debug log

			combinedText += `${folder.name}\n***\n`;

			for (const note of folder.children) {
				try {
					//	console.log("Checking: ", note); // Debug log
					if (note instanceof TFile) {
						const noteName = note.name;
						//console.log("We got: ", note.name); // Debug log
						const noteContent = await this.app.vault.read(note);
						combinedText += `${noteName}\n*\n${noteContent}\n---\n`;
						//console.log("Added contents of: ", note.name); // Debug log
					} else if (note instanceof TFolder) {
						//	console.log("We a subfolder:", note.name); // Debug log
						combinedText += await this.getSubfolderContent(note);
					}
				} catch (error) {
					console.error("Error processing note:", error);
				}
			}

			//console.log("Combined text:", combinedText); // Debug log

			this.editorView.dispatch({
				changes: {
					from: 0,
					to: this.editorView.state.doc.length,
					insert: combinedText,
				},
			});
			console.log("Editor updated"); // Debug log
		} catch (error) {
			console.error("Error loading content:", error);
		}
	}
	private async getSubfolderContent(folder: TFolder): Promise<string> {
		let subfolderContent = `${folder.name}\n***\n`;
		for (const child of folder.children) {
			if (child instanceof TFile) {
				const noteName = child.name;
				const noteContent = await this.app.vault.read(child);

				subfolderContent += `${noteName}\n*\n${noteContent}\n---\n`;
			} else if (child instanceof TFolder) {
				subfolderContent += await this.getSubfolderContent(child); // Recursive call.
			}
		}
		return subfolderContent;
	}

	async saveChanges(): Promise<void> {
		const content = this.editorView.state.doc.toString();
		// TODO: Add logic to save content back to respective notes.
		console.log("Saving changes:", content);
	}

	destroy(): void {
		// Cleanup the editorView only if it's not null or undefined
		if (this.editorView) {
			console.log("Destroying editorView.");
			this.editorView.destroy();
		} else {
			console.log("No editorView to destroy.");
		}
		super.onunload();
	}
}
