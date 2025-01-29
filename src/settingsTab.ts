import {
	App,
	PluginSettingTab,
	Setting,
	TFolder,
	TFile,
	TAbstractFile,
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
		//###########################   Shorthands/Globals   ####################
		//#######################################################################
		const shFlowObjects: { [key: string]: Types.FlowDef } =
			this.plugin.settings.flows;
		const shSettings: Types.TextFlowSettings = this.plugin.settings;
		let createOrEditFlowName: string = "";
		let createOrEditsourcePath: string = "";

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

		const calculateExcludedItemsThenMakeMap = async (
			folderPath: string,
			flowName: string
		): Promise<void> => {
			const flow: Types.FlowDef = shFlowObjects[flowName] || {
				sourcePath: folderPath,
				flowFileName: flowName,
				divider: `---`,
				excludedFolders: [],
				includedMetaData: {},
				excludedMetaData: {},
				flowMap: {}, // Flat map
			};
		};

		const buildFlatFlowMap = async (
			folderPath: string,
			flowName: string
		): Promise<void> => {
			const flow: Types.FlowDef = shFlowObjects[flowName] || {
				sourcePath: folderPath,
				flowFileName: flowName,
				divider: "~*~*~",
				flowMap: {}, // Flat map
			};
			let mapValueBasket: Types.mapValueBasket = {
				tempFileContents: "",
				currentStart: -1,
				currentEnd: 0,
				initialIteration: true,
			};
			this.plugin.saveSettings();

			const rootFolder = this.app.vault.getAbstractFileByPath(folderPath);
			if (!(rootFolder instanceof TFolder) || !rootFolder) {
				console.error(`There's a problem with ${folderPath}`);
				new Notice(`Please check if ${folderPath} exists and is a folder`);
				return;
			}

			// Start processing from the root folder
			await updateFlatMap(rootFolder, flow, shSettings.divider, mapValueBasket);
			// Save back the updated FlowDef
			shFlowObjects[flowName] = flow;

			// Check if temp folder exists before writing
			const tempFolder = this.app.vault.getAbstractFileByPath(
				`${shSettings.tempFolderPlace}/x_textFlowTemp`
			);
			if (tempFolder && tempFolder instanceof TFolder) {
				const tempFilePath = `${shSettings.tempFolderPlace}/x_textFlowTemp/${flowName}.md`;
				this.app.vault.adapter.write(
					tempFilePath,
					mapValueBasket.tempFileContents
				);
			} else {
				new Notice("Please create a temp folder first.");
				return;
			}
			// save temp file
		};
		// wider scope variables that can't be reset during iteration

		const updateFlatMap = async (
			item: TAbstractFile,
			flow: Types.FlowDef,
			flowDivider: string,
			mapValueBasket: Types.mapValueBasket
		): Promise<void> => {
			const fullPath = item.path;
			const itemName = item.name;
			// Calculate new positions once
			if (
				item instanceof TFolder &&
				item.path !== shSettings.tempFolderPlace + "/x_textFlowTemp"
			) {
				flow.flowMap[fullPath] = {
					path: fullPath,
					itemName: item.name,
					lastModifiedInFlow: Date.now(),
					startEndInFlow: {
						start: mapValueBasket.tempFileContents.length + 1,
						end: 0,
					},
					type: "folder",
					minLength: itemName.length,
					lengthPlusDividers: itemName.length + shSettings.divider.length + 28,
				} as Types.FlowMap;
				if (mapValueBasket.initialIteration) {
					flow.flowMap[fullPath].startEndInFlow.start = 0;
				}
				mapValueBasket.initialIteration = false;
				mapValueBasket.tempFileContents += `<center><b>${itemName}</b></center>\r\r${shSettings.divider}\r\r`;
				mapValueBasket.currentEnd = mapValueBasket.tempFileContents.length;
				flow.flowMap[fullPath].startEndInFlow.end = mapValueBasket.currentEnd;
				/*console.log(
					`start: ${
						flow.flowMap[fullPath].startEndInFlow.start
					} start plus total lenght: ${
						flow.flowMap[fullPath].startEndInFlow.start +
						flow.flowMap[fullPath].lengthPlusDividers
					} = content lenghth: ${
						mapValueBasket.tempFileContents.length
					} = current end ${mapValueBasket.currentEnd}`
				);*/

				// Process folder contents
				for (const subItem of item.children) {
					await updateFlatMap(
						subItem,
						flow,
						shSettings.divider,
						mapValueBasket
					);
				}
			} else if (item instanceof TFile) {
				let fileContent: string = await this.app.vault.read(item);
				// find and remove the title line; normalize
				//console.log(fileContent);
				const titleLine = `## ${item.name.replace(/\.md$/, "")}`;
				const normalize = (fileContent: string) =>
					fileContent.replace(/\uFEFF|\s+$/g, "").trim();
				const normalizedTitleLine = normalize(titleLine);
				const normalizedFileContent = normalize(fileContent);

				if (normalizedFileContent.startsWith(normalizedTitleLine)) {
					fileContent = fileContent
						.substring(normalizedTitleLine.length + 1)
						.trimStart();
				}
				flow.flowMap[fullPath] = {
					path: fullPath,
					itemName: item.name,
					lastModifiedInFlow: Date.now(),
					startEndInFlow: {
						start: mapValueBasket.tempFileContents.length + 1,
						end: 0,
					},
					type: "file",
					sourceLastModified: item.stat.mtime,
					minLength: fileContent.length,
					lengthPlusDividers:
						fileContent.length + shSettings.divider.length + 4,
				} as Types.FlowMap;
				if (mapValueBasket.initialIteration) {
					flow.flowMap[fullPath].startEndInFlow.start = 0;
				}
				mapValueBasket.initialIteration = false;
				mapValueBasket.tempFileContents += `${fileContent}\r\r${shSettings.divider}\r\r`;
				mapValueBasket.currentEnd = mapValueBasket.tempFileContents.length;
				flow.flowMap[fullPath].startEndInFlow.end = mapValueBasket.currentEnd;
				/*console.log(
					`start: ${
						flow.flowMap[fullPath].startEndInFlow.start
					} start plus total lenght: ${
						flow.flowMap[fullPath].startEndInFlow.start +
						flow.flowMap[fullPath].lengthPlusDividers
					} = content lenghth: ${
						mapValueBasket.tempFileContents.length
					} = current end ${mapValueBasket.currentEnd}`
				);*/
			} else {
				console.error("The given path does not point to a valid file.");
			}
			this.plugin.saveSettings();
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
			this.plugin.saveSettings();
		} else {
		}
		let newTempFolderPlace: string = "not set yet";
		let oldTempFolderPlace: string = this.plugin.settings.tempFolderPlace;
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
						this.plugin.settings.tempFolderPlace = newTempFolderPlace;
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
								this.plugin.discernAndSetTempFolderState,
								oldTempFolderPath,
								newTempFolderPath,
								newTempFolderPlace
							);
							deleteOldTempFolder.open();
							this.plugin.saveSettings();
						} else {
							this.plugin.saveSettings();

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
				this.plugin.discernAndSetTempFolderState();
				hideTempFolderToggle.toggleEl.addClass("hideTempFolderToggle");
				hideTempFolderToggle
					.setValue(shSettings.tempFolderHidden)
					.onChange(async (value) => {
						shSettings.tempFolderHidden = value;

						await this.plugin.saveSettings();
						this.plugin.discernAndSetTempFolderState();

						hideTempFolderToggle.toggleEl.setAttribute(
							"aria-label",
							value ? `Show temp folder` : `Hide temp folder`
						);
					});
			});

		// #############   choose a divider	    ######### (dropdown)
		// ---  /  ***  //  ___

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
					createOrEditFlowName = value.trim();
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
						createOrEditsourcePath = value.trim();
						console.log(`folder is: ${createOrEditsourcePath}`);
					})
			);
		// #############   excluded folders     #########
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
				shFlowObjects[createOrEditFlowName] = {
					sourcePath: createOrEditsourcePath, // Will be set later when user selects a folder
					flowFileName: createOrEditFlowName, // Using the entered name
					flowFilePath: `${shSettings.tempFolderPlace}./x_textFlowTemp/+${createOrEditFlowName}+.md`,
					activeRegionStartEnd: { start: 0, end: 0 },
					flowMap: {}, // Empty flowMap to start with
				};
				await this.plugin.saveSettings();
				buildFlatFlowMap(
					shFlowObjects[createOrEditFlowName].sourcePath,
					createOrEditFlowName
				);
			});

		// name the flow  - > this.plugin.settings.flowObjects.flow (save on input)
		// Input a file path to make the flow out of this file; input a hashtag to make an abstract flow.
	}

	// ########### YOUR FLOWS ###################
	// rename flows, change flows, delete flows
}
