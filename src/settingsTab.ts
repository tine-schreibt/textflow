import {
	App,
	PluginSettingTab,
	Setting,
	TFolder,
	TFile,
	Notice,
	ButtonComponent,
} from "obsidian";
import TextFlow from "main";
import * as Modals from "./modals";
import * as Types from "./types";

export class TextFlowSettingsTab extends PluginSettingTab {
	plugin: TextFlow;

	constructor(app: App, plugin: TextFlow) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		//#######################################################################
		//###########################   Shorthands   ############################
		//#######################################################################
		const shFlowObjects = this.plugin.settings.flowObjects;
		const shSettings = this.plugin.settings;

		//#######################################################################
		//###########################    Functions   ############################
		//#######################################################################

		const newTempFolderCreation = async (newTempFolderPath: string) => {
			try {
				// Ensure the folder exists, create it if necessary
				let newTempFolder =
					this.app.vault.getAbstractFileByPath(newTempFolderPath);
				if (!newTempFolder) {
					await this.app.vault.createFolder(newTempFolderPath);
					console.log(`Temp folder created at ${newTempFolderPath}`);
				} else if (!(newTempFolder instanceof TFolder)) {
					throw new Error(`"${newTempFolderPath}" exists but is not a folder.`);
				}
			} catch (e) {
				console.log(
					`Something went wrong when trying to create ${newTempFolderPath}: ${e}`
				);
			}
		};

		// to avoid leading slashes
		const constructTempFolderPath = (basePath: string) => {
			if (basePath === "") {
				return "x_textFlowTemp"; // No leading slash for root
			}
			return `${basePath}/x_textFlowTemp`;
		};

		let hiddenStyle = document.createElement("style");

		// inject CSS to hide the temp folder when appropriate
		const discernAndSetTempFolderState = () => {
			if (shSettings.tempFolderHidden) {
				let tempFolderPath = `${shSettings.tempFolderPlace}/x_textFlowTemp`; // Ensure correct relative path
				hiddenStyle.textContent = `
            div[data-path='${tempFolderPath}'], 
            div[data-path='${tempFolderPath}'] + div.nav-folder-children {
                display: none;
            }
        `;
				if (!document.head.contains(hiddenStyle)) {
					document.head.appendChild(hiddenStyle);
				}
			} else {
				if (document.head.contains(hiddenStyle)) {
					document.head.removeChild(hiddenStyle);
				}
			}
		};

		const flowFileMaker = async () => {};
		Object.keys(shFlowObjects).forEach((flow) => {});
		// create temp file with name
		// read content
		// read and save start and end
		// read and save last modified
		// concatenate content
		// ... existing code ...

		const handleSubFolder = async (
			flowName: string,
			folderPath: string
		): Promise<Types.FlowMap> => {
			return await scanFolder(flowName, folderPath);
		};

		const scanFolder = async (
			flowName: string,
			folderPath: string
		): Promise<Types.FlowMap> => {
			// Initialize or get the FlowDef
			const flow: Types.FlowDef = shFlowObjects[flowName] || {
				sourcePath: folderPath,
				flowFileName: flowName,
				flowMap: {},
			};

			// Initialize or get the FlowMap for this folder
			const shFlowMap: Types.FlowMap = flow.flowMap[folderPath] || {
				type: "folder",
				path: folderPath,
				lastModifiedInFlow: Date.now(),
				minLength: "",
				lengthPlusDividers: "",
				startEndInFlow: "",
				children: {},
			};

			const folder = this.app.vault.getAbstractFileByPath(folderPath);

			if (!(folder instanceof TFolder) || folder === null) {
				console.error(`${folderPath} is not a folder`);
				return shFlowMap;
			}

			const contents = folder.children;
			if (!shFlowMap.children) shFlowMap.children = {};

			for (const item of contents) {
				if (item instanceof TFolder) {
					shFlowMap.children[item.name] = {
						type: "folder",
						path: item.path,
						lastModifiedInFlow: Date.now(),
						minLength: "",
						lengthPlusDividers: "",
						startEndInFlow: "",
						children: await handleSubFolder(flowName, item.path).then(
							(result) => result.children
						),
					};
				} else if (item instanceof TFile) {
					const file = this.app.vault.getAbstractFileByPath(item.path);
					if (file instanceof TFile) {
						shFlowMap.children[item.name] = {
							type: "file",
							path: item.path,
							sourceLastModified: file.stat.mtime,
							lastModifiedInFlow: Date.now(),
							minLength: "",
							lengthPlusDividers: "",
							startEndInFlow: "",
						};
					}
				}
			}

			// Update the settings
			flow.flowMap[folderPath] = shFlowMap;
			shFlowObjects[flowName] = flow;

			return shFlowMap;
		};

		//#######################################################################
		//###########################   Settings Tab   ##########################
		//#######################################################################

		const setUpTextFlow = containerEl.createDiv({
			cls: "headline-container",
		});
		setUpTextFlow.createEl("h3", {
			text: "Set up TextFlow",
			cls: "headline-text",
		});

		// ###############   SET A TEMP FOLDER   ###########################
		const setTempFolder = new Setting(setUpTextFlow)
			.setName("Create a folder for your Flows")
			.setDesc(
				createFragment((desc) => {
					desc.createSpan({
						text: "TextFlow needs a folder to keep its temporary Flow files in.",
					});
					desc.createEl("br");
					desc.createSpan({
						text: "If you don't specify a folder here, the temp folder will be created in the root folder of your vault.",
					});
				})
			);
		if (
			// if this is the first initialisation of the plugin
			this.plugin.settings.tempFolderPlace === null ||
			this.plugin.settings.tempFolderPlace === undefined
		) {
			this.plugin.settings.tempFolderPlace = "not set yet";
		}
		let newTempFolderPlace: string = "not set yet";
		setTempFolder
			.addText((text) =>
				text
					.setValue(
						this.plugin.settings.tempFolderPlace === "not set yet" ||
							this.plugin.settings.tempFolderPlace === ""
							? "root"
							: this.plugin.settings.tempFolderPlace
					)
					.onChange(async (value) => {
						newTempFolderPlace = value.trim();
						console.log(`newTempFolderPlace = ${value};`);
					})
			)
			.addButton((createButton) => {
				createButton.setButtonText("Create");
				createButton.onClick(async () => {
					console.log("createButton clicked.");
					// make sure newTempFolderPlace is at least ""
					if (
						newTempFolderPlace === "not set yet" ||
						newTempFolderPlace === "root" ||
						newTempFolderPlace === "/" ||
						newTempFolderPlace === undefined ||
						newTempFolderPlace === null
					) {
						newTempFolderPlace = "";
						console.log(`newTempFolderPlace changed to = ""`);
					}

					if (this.plugin.settings.tempFolderPlace === "not set yet") {
						// if this is the first init of the plugin
						this.plugin.settings.tempFolderPlace = "";
						console.log(`It's the first init of the plugin`);
						let initTempFolderPath: string = constructTempFolderPath(
							this.plugin.settings.tempFolderPlace
						);
						console.log(`initTempFolderPath: ${initTempFolderPath}`);
						try {
							let initTempFolder =
								this.app.vault.getAbstractFileByPath(initTempFolderPath);
							console.log(`make ${initTempFolder} at ${initTempFolderPath}`);
							if (!initTempFolder) {
								await this.app.vault.createFolder(initTempFolderPath);
								console.log(
									`Initial temp folder created at ${initTempFolderPath}`
								);
								await this.plugin.saveSettings();
								new Notice(
									`Successfully created a new hidden temp folder: ${initTempFolderPath}`
								);
							} else if (!(initTempFolder instanceof TFolder)) {
								throw new Error(
									`"${initTempFolderPath}" exists but is not a folder.`
								);
							}
						} catch (e) {
							console.log(
								`Something went wrong when trying to create ${initTempFolderPath}: ${e}`
							);
						}
					} else if (this.plugin.settings.tempFolderPlace !== "not set yet") {
						console.log(`Plugin has been set up before.`);
						// if the plugin has been setup before
						let oldTempFolderPlace: string =
							this.plugin.settings.tempFolderPlace;
						console.log(`oldTempFolderPlace: ${oldTempFolderPlace}`);
						console.log(`newTempFolderPlace: ${newTempFolderPlace}`);
						// get get path of old temp folder
						let oldTempFolderPath: string =
							constructTempFolderPath(oldTempFolderPlace);
						// make get path for new temp folder
						let newTempFolderPath: string =
							constructTempFolderPath(newTempFolderPlace);
						if (
							// check if new and old name are different
							newTempFolderPlace !== oldTempFolderPlace
						) {
							console.log(
								`New place ${newTempFolderPlace} is different from old place ${oldTempFolderPlace}`
							);
							// if they are different, ask user if they want to delete or rename the old temp folder
							const deleteOldTempFolder = new Modals.DeleteOldTempFolderModal(
								this.app,
								this.plugin,
								newTempFolderCreation,
								oldTempFolderPath,
								newTempFolderPath
							);
							deleteOldTempFolder.open();
						} else {
							return;
						}
					}
				});
			});
		// ############   HIDE FOLDER?   #####################
		const hideTempFolder = new Setting(setUpTextFlow)
			.setName("Hide temp folder")
			.setDesc(
				createFragment((desc) => {
					desc.createSpan({
						text: "Toggle visibility of the temporary folder in your vault.",
					});
					desc.createEl("br");
					desc.createSpan({
						text: "Hiding the folder is advisable to avoid accidentally messing with it.",
					});
				})
			)
			.addToggle((hideTempFolderToggle) => {
				hideTempFolderToggle.toggleEl.setAttribute(
					"aria-label",
					shSettings.tempFolderHidden ? `Show temp folder` : `Hide temp Folder`
				);
				discernAndSetTempFolderState();
				hideTempFolderToggle.toggleEl.addClass("hideTempFolderToggle");
				hideTempFolderToggle
					.setValue(shSettings.tempFolderHidden)
					.onChange(async (value) => {
						shSettings.tempFolderHidden = value;

						await this.plugin.saveSettings();
						discernAndSetTempFolderState();

						hideTempFolderToggle.toggleEl.setAttribute(
							"aria-label",
							value ? `Show temp folder` : `Hide temp folder`
						);
					});
			});

		// ###############   Create a new flowObject   #############################

		const createFlows = containerEl.createDiv({
			cls: "headline-container",
		});
		createFlows.createEl("h3", {
			text: "Create a Flow",
			cls: "headline-text",
		});

		const chooseFlowName = new Setting(createFlows)
			.setName("Name your Flow")
			.setDesc(
				createFragment((desc) => {
					desc.createSpan({
						text: "Please enter a unique name for your flow.",
					});
					desc.createEl("br");
					desc.createSpan({
						text: "For example: folder name + meta data + meta data",
					});
				})
			)
			.addText((text) =>
				text.setPlaceholder("Enter a unique name").onChange(async (value) => {
					// state check creating vs editing
					const newFlowName = value.trim();
					shFlowObjects[newFlowName] = {
						sourcePath: "", // Will be set later when user selects a folder
						flowFileName: value, // Using the entered name
						flowMap: {}, // Empty flowMap to start with
					};
				})
			);

		const chooseSourceFolder = new Setting(createFlows)
			.setName("Choose a source folder")
			.setDesc(
				createFragment((desc) => {
					desc.createSpan({
						text: "Choose a folder to serve as the source of your new Flow.",
					});
					desc.createEl("br");
					desc.createSpan({
						text: "You can have multiple Flows for the same folder that use different criteria for inclusion/exclusion of subfolders and notes.",
					});
				})
			)
			.addText((chooseFlowFolder) =>
				chooseFlowFolder
					.setPlaceholder("Enter the folder path.")
					.onChange(async (value) => {
						shFlowObjects.flow.sourcePath = value.trim();
					})
			);
		// #############   excluded folders   ###########
		// #############   excluded meta data   #########
		// #############   included meta data   #########

		const saveButton = new ButtonComponent(containerEl);
		saveButton.buttonEl.setAttribute("state", "creating");
		saveButton.buttonEl.setAttribute("aria-label", "Save Highlighter");
		saveButton
			.setClass("save-button")
			.setClass("action-button")
			.setClass("action-button-save")
			.setClass("mod-cta")
			.setIcon("save")
			.setTooltip("Save")
			.onClick(async (buttonEl: MouseEvent) => {
				await this.plugin.saveSettings();
			});

		// name the flow  - > this.plugin.settings.flowObjects.flow (save on input)
		// Input a file path to make the flow out of this file; input a hashtag to make an abstract flow.
	}

	// ########### YOUR FLOWS ###################
	// rename flows, change flows, delete flows
}
