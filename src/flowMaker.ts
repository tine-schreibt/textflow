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
	TAbstractFile,
} from "obsidian";
import { EditorState } from "@codemirror/state";
import {
	defaultHighlightStyle,
	syntaxHighlighting,
} from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
// import { TextFlow } from "./types";

export class FlowMaker {}
