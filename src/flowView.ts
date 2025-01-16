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

export const FLOW_VIEW_TYPE = "flow-view"; // The name of the view

export class FlowView extends ItemView {
	// Properties
	app: App; // Provides access to Obsidian's core functionality.
	plugin: Plugin; // Gives access to your plugin instance.
	editorView: EditorView; // A CodeMirror instance for text rendering and editing.
	flowFolder: string;

	constructor(leaf: WorkspaceLeaf, plugin: Plugin, flowFolder: string) {
		super(leaf); // Represents a workspace "pane" in Obsidian. Your view gets attached to this leaf.
		this.plugin = plugin;
		this.flowFolder = flowFolder;

		// Initialize the CodeMirror view
		this.initView();
	}

	getViewType(): string {
		return FLOW_VIEW_TYPE; // Unique identifier for the view.
	}

	getDisplayText(): string {
		return "Flow View"; // What shows in the UI (tab title, listings, etc.).
	}

	initView(): void {
		const container = this.containerEl; // The DOM element provided by ItemView where custom content should be rendered.

		// Create the CodeMirror editor
		this.editorView = new EditorView({
			state: EditorState.create({
				doc: "", // Empty document for now.
				extensions: [basicSetup, syntaxHighlighting(defaultHighlightStyle)], // Extensions for CodeMirror.
			}),
			parent: container, // Attach the editor to the container.
		});
	}

	async loadContent(): Promise<void> {
		let combinedText = ""; // Combine all folder and file contents into one string.

		const folder = this.app.vault.getAbstractFileByPath(this.flowFolder);
		if (folder instanceof TFolder) {
			combinedText += `${folder.name}\n***\n`;

			for (const note of folder.children) {
				if (note instanceof TFile) {
					const noteName = note.name;
					const noteContent = await this.app.vault.read(note);

					combinedText += `${noteName}\n*\n${noteContent}\n---\n`;
				} else if (note instanceof TFolder) {
					// Recursive call for subfolders.
					combinedText += await this.getSubfolderContent(note);
				}
			}
		}

		// Update the editor content.
		this.editorView.dispatch({
			changes: {
				from: 0,
				to: this.editorView.state.doc.length,
				insert: combinedText,
			},
		});
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
		// Cleanup the editorView.
		if (this.editorView) {
			this.editorView.destroy();
		}
		super.onunload();
	}
}
