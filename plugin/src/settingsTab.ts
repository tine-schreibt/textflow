import { getAPI } from "obsidian-dataview";
import * as Modals from "./modals";
import {
  App,
  ButtonComponent,
  setIcon,
  MarkdownView,
  normalizePath,
  Notice,
  PluginSettingTab,
  Setting,
  TFolder,
  TFile,
  TAbstractFile,
  TextComponent,
  ToggleComponent,
} from "obsidian";
import TextFlow from "../main";
import * as Types from "./types";
import Pickr from "@simonwep/pickr";
import { FlowService } from "./flowService";

// --- The class that defines the settings tab
export class TextFlowSettingsTab extends PluginSettingTab {
  plugin: TextFlow;
  private pickrInstance: Pickr;
  flowService: FlowService;

  constructor(app: App, plugin: TextFlow) {
    super(app, plugin);
    this.plugin = plugin;
    this.flowService = new FlowService(plugin, app);
  }

  // ---- Function that bundles saving an reloading
  // Enable modals save and redraw the display
  modalSaveAndReload = async () => {
    await this.plugin.saveSettings();
    this.display(); // Refresh the UI after saving
  };

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    //#######################################################################
    //###########################   Settings Tab   ##########################
    //#######################################################################

    const setUpTextFlow = containerEl.createDiv({
      cls: "headline-container",
    });

    // ###############   SET UP A SYSTEM FOLDER   ###########################
    const systemFolder = this.flowService.checkSystemFolder();
    let newSystemFolderPlace = ""; // container for the new path
    // -------------------
    const setSystemFolder = new Setting(setUpTextFlow)
      .setName("Choose a place for TextFlow_SystemFolder")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "TextFlow needs a system folder to store its flows and snapshots.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "Enter / to choose the root folder.",
          });
        })
      );

    if (!systemFolder) {
      this.plugin.settings.systemFolderPlace = "";
      this.plugin.settings.systemFolderPath = "TextFlow_SystemFolder";
      this.plugin.saveSettings();
    } else if (
      this.plugin.settings.systemFolderPath != systemFolder.path ||
      this.plugin.settings.systemFolderPlace !=
        (systemFolder.parent?.path ?? "") // if parent is null, use "" as the path
    ) {
      this.plugin.settings.systemFolderPath = systemFolder.path;
      this.plugin.settings.systemFolderPlace = systemFolder.parent?.path ?? "";
      this.plugin.saveSettings();
    }

    setSystemFolder
      .addText((newSystemFolderInput) =>
        newSystemFolderInput
          .setValue(
            this.plugin.settings.systemFolderPlace
              ? this.plugin.settings.systemFolderPlace
              : ""
          )
          .onChange(async (value) => {
            newSystemFolderPlace = normalizePath(value);
            await this.flowService.debouncedSaveSettings();
          })
      )
      .addButton((systemFolderCreateOrMoveButton) => {
        systemFolderCreateOrMoveButton
          .setButtonText(systemFolder ? "Move" : "Create")
          .onClick(async () => {
            // Create SystemFolder
            if (!systemFolder) {
              const newPath = normalizePath(
                `${newSystemFolderPlace}/TextFlow_SystemFolder`
              );
              await this.flowService.createSystemFolder(newPath);
              this.plugin.discernAndSetSystemFolderState(
                this.plugin.settings.systemFolderHidden,
                newSystemFolderPlace
              );
            } else {
              //Move SystemFolder
              try {
                const newPath = normalizePath(
                  `${newSystemFolderPlace}/TextFlow_SystemFolder`
                );
                await this.app.vault.rename(systemFolder, newPath);
                this.plugin.discernAndSetSystemFolderState(
                  this.plugin.settings.systemFolderHidden,
                  newSystemFolderPlace
                );
                // Update settings with new location
                this.plugin.settings.systemFolderPath = newPath;
                this.plugin.settings.systemFolderPlace = newSystemFolderPlace;

                Object.keys(this.plugin.settings.flows).forEach((flow) => {
                  this.plugin.settings.flows[flow].flowFilePath = normalizePath(
                    `${this.plugin.settings.systemFolderPath}/${flow}.md`
                  );
                });
                await this.plugin.saveSettings();

                new Notice(`SystemFolder moved to ${newSystemFolderPlace}`);
              } catch (error) {
                new Notice(`Failed to move folder: ${error.message}`);
              }
            }
          });
      });

    // --------------------- UI settings
    // -----------   flowSwitcherModal  ---------------

    const switcherModalPosition = new Setting(setUpTextFlow)
      .setName("Access to the flow switcher modal via...")
      .setDesc("Changes need a vault reload to take effect.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("statusBar", "Status bar")
          .addOption("ribbon", "Ribbon")
          .addOption("command", "Command palette only");
        dropdown.setValue(this.plugin.settings.switcherPos);
        dropdown.onChange((value) => {
          this.plugin.settings.switcherPos = value;
          this.plugin.saveSettings();
        });
      });

    // ------------- scrollbar ------------
    const scrollbar = new Setting(setUpTextFlow)
      .setName("Hide scrollbar on flows")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "If your scroll bar twitches, just hide it.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "Needs a reload to take effect.",
          });
        })
      )
      .addToggle((explorerDeco) => {
        explorerDeco
          .setValue(this.plugin.settings.hideScrollbar)
          .onChange(async (value) => {
            this.plugin.settings.hideScrollbar = value;
            await this.plugin.saveSettings();
          });
      });

    // -------------- Multi-select -----------------
    const navListener = new Setting(setUpTextFlow)
      .setName("Enable navigation via file explorer")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "Toggle this off, if you need multi-select to work correctly.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "There's also a command for this.",
          });
        })
      )
      .addToggle((explorerDeco) => {
        explorerDeco
          .setValue(this.plugin.settings.explorerListener)
          .onChange(async (value) => {
            this.plugin.settings.explorerListener = value;
            await this.plugin.saveSettings();
          });
      });

    // --------   CREATE / EDIT FLOWS   ----------------
    const createFlows = containerEl.createDiv({
      cls: "headline-container",
    });
    createFlows.createEl("h3", {
      text: "Create a new flow",
      cls: "headline-text",
    });

    //--------- FLOW NAME -----------------
    const chooseFlowName = new Setting(createFlows)
      .setName("Name your flow")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "Please enter a unique name for your flow.",
          });
        })
      )
      .addText((flowName) => {
        flowName.setPlaceholder("Enter a unique name");
        if (!this.plugin.settings.flowBuildBasket?.fresh) {
          flowName.setValue(this.plugin.settings.flowBuildBasket.oldFlowName);
          this.plugin.settings.flowBuildBasket.createOrEditFlowName =
            this.plugin.settings.flowBuildBasket.oldFlowName;
        }
        flowName.onChange(async (value) => {
          this.plugin.settings.flowBuildBasket.createOrEditFlowName =
            value.trim();
          this.plugin.settings.flowBuildBasket.fresh = false;
          this.flowService.debouncedSaveSettings();
        });
      });

    // ---- SORT FLOW ---------
    const sortFlow = new Setting(createFlows)
      .setName("Follow note order in file explorer (ignored for bookmarks)")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "Note order overrides folder order. Best for flat hierarchy (and folder titles off).",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "If toggled off, folder order overrides note order. Best for deep hierarchy (and folder titles on).",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "Test all options to see which one works best for each flow.",
          });
        })
      )
      .addToggle((sortToggle) => {
        const toggleSetting = sortToggle.setValue(true);
        if (!this.plugin.settings.flowBuildBasket?.fresh) {
          sortToggle.setValue(this.plugin.settings.flowBuildBasket.depthFirst);
        }
        sortToggle.onChange(async (value) => {
          this.plugin.settings.flowBuildBasket.depthFirst = value;
          this.plugin.saveSettings();
        });
      });

    // --------- FOLDER TITLES ------------------
    const toggleFolderTitles = new Setting(createFlows)
      .setName("Include folder / bookmark group titles in flow")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "This will also turn off folder titles in the flow navigation dropdown.",
          });
        })
      )
      .addToggle((sortToggle) => {
        const toggleSetting = sortToggle.setValue(true);
        if (!this.plugin.settings.flowBuildBasket?.fresh) {
          sortToggle.setValue(
            this.plugin.settings.flowBuildBasket.folderTitles
          );
        }
        sortToggle.onChange(async (value) => {
          this.plugin.settings.flowBuildBasket.folderTitles = value;
          this.plugin.saveSettings();
        });
      });

    //------- DEFINE FLOW --------------------
    const defineFlow = new Setting(createFlows)
      .setName("Define your Flow...")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "Changing definition modes will clear all values.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "If you don't enter any criteria, your enitre vault will be included in your flow.",
            cls: "text-emphasis",
          });
        })
      );

    //------- RADIO BUTTONS
    const radioButtonContainer = defineFlow.controlEl.createDiv({
      cls: "radio-button-group",
    });
    const buttons: { [key: string]: ButtonComponent } = {};

    // -------- Radio Buttons ---------------
    // Creating just the buttons to keep UI order; settings and .onClick
    // are below the input element setup
    buttons.bookmarks = new ButtonComponent(radioButtonContainer)
      .setButtonText("... by a bookmark group")
      .setClass("settings-radio-button");
    if (this.plugin.settings.flowBuildBasket.definitionMode === "bookmarks") {
      buttons.bookmarks.buttonEl.addClass("settings-radio-button-active");
    }

    buttons.foldersTagsProps = new ButtonComponent(radioButtonContainer)
      .setButtonText("... by folders, tags, properties")
      .setClass("settings-radio-button");
    if (
      this.plugin.settings.flowBuildBasket.definitionMode === "foldersTagsProps"
    ) {
      buttons.foldersTagsProps.buttonEl.addClass(
        "settings-radio-button-active"
      );
    }

    // ------ BOOKMARKS INPUT ELEMENT AND STUFF --------------------------------------
    const chooseBookmarks = new Setting(createFlows);
    chooseBookmarks.settingEl.hide(); // HIDE INITIALLY
    chooseBookmarks.settingEl.addClass("border-top-none");
    chooseBookmarks.settingEl.addClass("input-width-200");
    chooseBookmarks.setDesc(
      createFragment((desc) => {
        desc.createSpan({
          text: "Input the name of a bookmarks group.",
        });
        desc.createEl("br"); // Add line break
        desc.createSpan({
          text: "To choose a subgroup, enter its path like this:",
        });
        desc.createEl("br"); // Add line break
        desc.createSpan({
          text: "rootLevelGroup/subGroup1/subGroup2",
        });
        desc.createEl("br"); // Add line break
        desc.createSpan({
          text: "To exclude a group's subgroups end its name/path with /",
        });
      })
    );
    chooseBookmarks.addText((setBookmarksGroup) => {
      if (!this.plugin.settings.flowBuildBasket?.fresh) {
        setBookmarksGroup.setValue(
          this.plugin.settings.flowBuildBasket.flowCookbook.bookmarks
        );
      }
      setBookmarksGroup.onChange(async (value) => {
        this.plugin.settings.flowBuildBasket.previewUsed = false;
        this.plugin.settings.flowBuildBasket.flowCookbook.bookmarks =
          value.trim();
        this.plugin.settings.flowBuildBasket.fresh = false;
        this.flowService.debouncedSaveSettings();
      });
    });

    // ---------- FOLDERS, TAGS AND PROPERTIES INPUT ELEMENT -----------------------------------------
    const showOrHideAlLFoldersTagsProps = (state: string) => {
      if (state === "show") {
        headlineChoosePathsTagsProperties.settingEl.show();
        folderIncludeInput.settingEl.show();
        folderExcludeInput.settingEl.show();
        tagsIncludeInput.settingEl.show();
        tagsExcludeInput.settingEl.show();
        propertiesIncludeInput.settingEl.show();
        propertiesExcludeInput.settingEl.show();
      }
      if (state === "hide") {
        headlineChoosePathsTagsProperties.settingEl.hide();
        folderIncludeInput.settingEl.hide();
        folderExcludeInput.settingEl.hide();
        tagsIncludeInput.settingEl.hide();
        tagsExcludeInput.settingEl.hide();
        propertiesIncludeInput.settingEl.hide();
        propertiesExcludeInput.settingEl.hide();
      }
    };
    // --- headline object ------
    const headlineChoosePathsTagsProperties = new Setting(createFlows);
    headlineChoosePathsTagsProperties.settingEl.hide();
    headlineChoosePathsTagsProperties
      .setClass("border-top-none")
      .setClass("input-width")
      //.setClass("paths-props-setting")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "All six inputs are optional. For inclusion, all criteria must be true; for exclusion only one criterion must me true.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "If you need more complex logic, consider defining your flow using a Dataview query and tagging the results. ",
          });
        })
      );

    // ----- Folder include
    const folderIncludeInput = new Setting(createFlows);
    folderIncludeInput.settingEl.hide();
    folderIncludeInput.settingEl.addClass("border-top-none");
    folderIncludeInput.settingEl.addClass("input-width-400");
    folderIncludeInput.setDesc(
      createFragment((desc) => {
        desc.createSpan({
          text: "Choose a source folder.",
        });
        desc.createEl("br"); // Add line break
        desc.createSpan({
          text: "Default is root.",
        });
        desc.createEl("br"); // Add line break
        desc.createSpan({
          text: "End path with / to not include subfolders.",
        });
      })
    );

    folderIncludeInput.addText((folderIncludeInput) => {
      const storedValue =
        this.plugin.settings.flowBuildBasket.flowCookbook.folderIncluded;

      if (!this.plugin.settings.flowBuildBasket?.fresh) {
        // this is so setValue is either a filled string or undefined;
        // with an empty string for some reason not all folders get included on editing
        if (!storedValue || storedValue === "/" || storedValue === "") {
          delete this.plugin.settings.flowBuildBasket.flowCookbook
            .folderIncluded;
        }
        // When displaying the value
        folderIncludeInput.setValue(
          this.plugin.settings.flowBuildBasket.flowCookbook.folderIncluded
        );
      }
      folderIncludeInput.onChange(async (value) => {
        this.plugin.settings.flowBuildBasket.previewUsed = false;
        // When storing the value
        this.plugin.settings.flowBuildBasket.flowCookbook.folderIncluded =
          !value || value === "" || value === "root" || value === "/"
            ? ""
            : value;
        this.plugin.settings.flowBuildBasket.fresh = false;
        this.flowService.debouncedSaveSettings();
      });
    });

    // ----- Folder exclude
    const folderExcludeInput = new Setting(createFlows);
    folderExcludeInput.settingEl.hide();
    folderExcludeInput.settingEl.addClass("border-top-none");
    folderExcludeInput.settingEl.addClass("input-width-400");
    folderExcludeInput
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "EXclude subfolder(s) by PATH.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "Input comma separated list.",
          });
        })
      )
      .addText((chooseExcludedFolders) => {
        if (!this.plugin.settings.flowBuildBasket?.fresh) {
          chooseExcludedFolders.setValue(
            this.plugin.settings.flowBuildBasket.flowCookbook.folderExcluded
          );
        }
        chooseExcludedFolders.onChange(async (value) => {
          this.plugin.settings.flowBuildBasket.previewUsed = false;
          this.plugin.settings.flowBuildBasket.flowCookbook.folderExcluded =
            value.trim();
          this.plugin.settings.flowBuildBasket.fresh = false;
          this.flowService.debouncedSaveSettings();
        });
      });

    // ----- Tags
    const tagsIncludeInput = new Setting(createFlows);
    tagsIncludeInput.settingEl.hide();
    tagsIncludeInput.settingEl.addClass("border-top-none");
    tagsIncludeInput.settingEl.addClass("input-width-400");
    tagsIncludeInput
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "INclude by TAG.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "Input comma separated list.",
          });
        })
      )
      .addText((chooseIncludedTags) => {
        if (!this.plugin.settings.flowBuildBasket?.fresh) {
          chooseIncludedTags.setValue(
            this.plugin.settings.flowBuildBasket.flowCookbook.tagsIncluded
          );
        }
        chooseIncludedTags.onChange(async (value) => {
          this.plugin.settings.flowBuildBasket.previewUsed = false;
          this.plugin.settings.flowBuildBasket.flowCookbook.tagsIncluded =
            value.trim();
          this.plugin.settings.flowBuildBasket.fresh = false;
          this.flowService.debouncedSaveSettings();
        });
      });

    const tagsExcludeInput = new Setting(createFlows);
    tagsExcludeInput.settingEl.hide();
    tagsExcludeInput.settingEl.addClass("border-top-none");
    tagsExcludeInput.settingEl.addClass("input-width-400");
    tagsExcludeInput
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "EXclude by TAG.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "Input comma separated list.",
          });
        })
      )
      .addText((chooseExcludedTags) => {
        if (!this.plugin.settings.flowBuildBasket?.fresh) {
          chooseExcludedTags.setValue(
            this.plugin.settings.flowBuildBasket.flowCookbook.tagsExcluded
          );
        }
        chooseExcludedTags.onChange(async (value) => {
          this.plugin.settings.flowBuildBasket.previewUsed = false;
          this.plugin.settings.flowBuildBasket.flowCookbook.tagsExcluded =
            value.trim();
          this.plugin.settings.flowBuildBasket.fresh = false;
          this.flowService.debouncedSaveSettings();
        });
      });

    // ----- Properties
    const propertiesIncludeInput = new Setting(createFlows);
    propertiesIncludeInput.settingEl.hide();
    propertiesIncludeInput.settingEl.addClass("border-top-none");
    propertiesIncludeInput.settingEl.addClass("input-width-400");
    propertiesIncludeInput
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "INclude by PROPERTY.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "Input comma separated list.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: `You can use property = "value"`,
          });
        })
      )
      .addText((chooseIncludedProperties) => {
        if (!this.plugin.settings.flowBuildBasket?.fresh) {
          chooseIncludedProperties.setValue(
            this.plugin.settings.flowBuildBasket.flowCookbook.propsIncluded
          );
        }
        chooseIncludedProperties.onChange(async (value) => {
          this.plugin.settings.flowBuildBasket.previewUsed = false;
          this.plugin.settings.flowBuildBasket.flowCookbook.propsIncluded =
            value.trim();
          this.plugin.settings.flowBuildBasket.fresh = false;
          this.flowService.debouncedSaveSettings();
        });
      });

    const propertiesExcludeInput = new Setting(createFlows);
    propertiesExcludeInput.settingEl.hide();
    propertiesExcludeInput.settingEl.addClass("border-top-none");
    propertiesExcludeInput.settingEl.addClass("input-width-400");
    propertiesExcludeInput
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "EXclude by PROPERTY.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "Input comma separated list.",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: `You can use property = "value"`,
          });
        })
      )
      .addText((chooseExcludedProperties) => {
        if (!this.plugin.settings.flowBuildBasket?.fresh) {
          chooseExcludedProperties.setValue(
            this.plugin.settings.flowBuildBasket.flowCookbook.propsExcluded
          );
        }
        chooseExcludedProperties.onChange(async (value) => {
          this.plugin.settings.flowBuildBasket.previewUsed = false;
          this.plugin.settings.flowBuildBasket.flowCookbook.propsExcluded =
            value.trim();
          this.plugin.settings.flowBuildBasket.fresh = false;
          this.flowService.debouncedSaveSettings();
        });
      });

    // ---- RADIO BUTTON SETTINGS AND LOGIC
    // ---------------- Presets for the BOOKMARKS button
    if (!this.plugin.settings.flowBuildBasket?.fresh) {
      if (this.plugin.settings.flowBuildBasket.definitionMode === "bookmarks") {
        showOrHideAlLFoldersTagsProps("hide");
        chooseBookmarks.settingEl.show();
      }
    }
    // onClick for the BOOKMARKS button
    buttons.bookmarks.onClick(() => {
      if (
        this.plugin.settings.flowBuildBasket.definitionMode ===
        "foldersTagsProps"
      ) {
        this.plugin.settings.flowBuildBasket.flowCookbook = {};
        this.plugin.saveSettings();
      }
      this.plugin.settings.flowBuildBasket.definitionMode = "bookmarks";
      this.plugin.settings.flowBuildBasket.previewUsed = false;
      this.flowService.radioButtonManager(
        buttons.bookmarks,
        buttons.foldersTagsProps
      );
      chooseBookmarks.settingEl.show();
      showOrHideAlLFoldersTagsProps("hide");
    });

    // ------------ Presets for the foldersTagsProps button
    if (!this.plugin.settings.flowBuildBasket?.fresh) {
      if (
        this.plugin.settings.flowBuildBasket.definitionMode ===
        "foldersTagsProps"
      ) {
        chooseBookmarks.settingEl.hide();
        showOrHideAlLFoldersTagsProps("show");
      }
    }

    // onClick for the foldersTagsProps button
    buttons.foldersTagsProps.onClick(() => {
      if (this.plugin.settings.flowBuildBasket.definitionMode === "bookmarks") {
        this.plugin.settings.flowBuildBasket.flowCookbook = {};
        this.plugin.saveSettings();
      }
      this.plugin.settings.flowBuildBasket.definitionMode = "foldersTagsProps";
      this.plugin.settings.flowBuildBasket.previewUsed = false;
      this.flowService.radioButtonManager(
        buttons.foldersTagsProps,
        buttons.bookmarks
      );
      chooseBookmarks.settingEl.hide();
      showOrHideAlLFoldersTagsProps("show");
    });

    // ----------- Preview and save BUTTONS --------------------

    const previewButton = new ButtonComponent(containerEl);
    previewButton
      .setButtonText("Preview your flow structure")
      .onClick(async (buttonEl: MouseEvent) => {
        this.plugin.settings.flowBuildBasket = {
          createOrEditFlowName:
            this.plugin.settings.flowBuildBasket.createOrEditFlowName,
          oldFlowName: this.plugin.settings.flowBuildBasket.oldFlowName,
          createOrEdit: this.plugin.settings.flowBuildBasket.createOrEdit,
          depthFirst: this.plugin.settings.flowBuildBasket.depthFirst,
          folderTitles: this.plugin.settings.flowBuildBasket.folderTitles,
          definitionMode: this.plugin.settings.flowBuildBasket.definitionMode,
          flowCookbook: this.plugin.settings.flowBuildBasket.flowCookbook,
          cleanCookbook: {},
          finalReceipe: this.plugin.settings.flowBuildBasket.finalReceipe,
          conflictObject: this.plugin.settings.flowBuildBasket.conflictObject,
          dataviewSearchPath: "",
          previewUsed: true,
          success: false,
          fresh: false,
        };
        await this.flowService.createFlowDefinition(
          this.plugin.settings.flowBuildBasket
        );
        this.plugin.settings.flowBuildBasket.previewUsed = true;
        if (this.plugin.settings.flowBuildBasket.success === true) {
          const previewModal = new Modals.previewModal(
            this.app,
            this.plugin,
            this.plugin.settings.flowBuildBasket
          );
          previewModal.open();
        }
      });

    const saveButton = new ButtonComponent(containerEl);
    saveButton
      .setButtonText("Save flow definition")
      .onClick(async (buttonEl: MouseEvent) => {
        // if no flow name is given

        if (!this.plugin.settings.flowBuildBasket.createOrEditFlowName) {
          new Notice("Please give your flow a name first.");
          return;
        }
        // if we're creating and a flow with the given name already exists
        if (
          this.plugin.settings.flowBuildBasket.createOrEdit === "create" &&
          this.plugin.settings.flows[
            this.plugin.settings.flowBuildBasket.createOrEditFlowName
          ]
        ) {
          new Notice(
            "A flow by this name already exists. Rename your new flow or delete the old one."
          );
          return;
        }

        // If we're editing the flow and changing its name
        let currentFlowName =
          this.plugin.settings.flowBuildBasket.createOrEditFlowName;
        let oldFlowName = this.plugin.settings.flowBuildBasket.oldFlowName;

        if (
          this.plugin.settings.flowBuildBasket.createOrEdit === "edit" &&
          currentFlowName != oldFlowName
        ) {
          // delete the old flow object
          delete this.plugin.settings.flows[oldFlowName];
        }

        // Build a flow definition if preview hasn't done that yet
        if (!this.plugin.settings.flowBuildBasket.previewUsed) {
          await this.flowService.createFlowDefinition(
            this.plugin.settings.flowBuildBasket
          );
          if (!this.plugin.settings.flowBuildBasket.success) {
            return;
          }
        }

        await this.flowService.writeFlowDef(
          this.plugin.settings,
          this.plugin.settings.flowBuildBasket
        );
        // reset all values
        this.flowService.syncConflicts(this.plugin.settings.flowBuildBasket);
        this.flowService.resetFlowBuildBasket(
          this.plugin.settings.flowBuildBasket
        );
        this.plugin.saveSettings();
        this.display();
      });

    // ----- Clear the input mask
    const clearValues = new ButtonComponent(containerEl);
    clearValues.setButtonText("Reset").onClick(async (buttonEl: MouseEvent) => {
      this.plugin.settings.flowBuildBasket.previewUsed = false;
      this.flowService.resetFlowBuildBasket(
        this.plugin.settings.flowBuildBasket
      );
      this.plugin.saveSettings();
      this.display();
    });

    const flowDisplay = containerEl.createDiv({
      cls: "headline-container",
    });
    flowDisplay.createEl("h3", {
      text: "Your flow definitions",
      cls: "headline-text",
    });

    Object.keys(this.plugin.settings.flows).forEach((flow) => {
      const shownFlow = this.plugin.settings.flows[flow];

      // --- DISPLAY PREPARATIONS ----------------------------------
      // Set up strings to display flow criteria

      // SOURCE
      let source = "";
      if (shownFlow.flowCookbook.bookmarks) {
        source += `Bookmark group "${shownFlow.flowCookbook.bookmarks}"`;
      } else if (shownFlow.flowCookbook.folderIncluded === "") {
        source += `Root folder`;
      } else {
        source += `Folder ${shownFlow.flowCookbook.folderIncluded}`;
      }

      // INCLUSION
      const included: string[] = [];
      if (shownFlow.flowCookbook.tagsIncluded?.trim()) {
        included.push(`Tags: ${shownFlow.flowCookbook.tagsIncluded}`);
      }
      if (shownFlow.flowCookbook.propsIncluded?.trim()) {
        included.push(`Props: ${shownFlow.flowCookbook.propsIncluded}`);
      }
      const inclusionString = included.length > 0 ? included.join(" / ") : "";

      // EXCLUSION
      const excluded: string[] = [];
      if (
        !shownFlow.flowCookbook.bookmarks &&
        shownFlow.flowCookbook.folderExcluded?.trim()
      ) {
        excluded.push(`Folders: ${shownFlow.flowCookbook.folderExcluded}`);
      }
      if (shownFlow.flowCookbook.tagsExcluded?.trim()) {
        excluded.push(`Tags: ${shownFlow.flowCookbook.tagsExcluded}`);
      }
      if (shownFlow.flowCookbook.propsExcluded?.trim()) {
        excluded.push(`Props: ${shownFlow.flowCookbook.propsExcluded}`);
      }
      const exclusionString = excluded.length > 0 ? excluded.join(" / ") : "";

      // --- THE DISPLAY ITSELF -------------------------------
      const flowShow = new Setting(flowDisplay);
      let modWarning = "";
      if (shownFlow.unsavedRegionsArray.length > 0) {
        modWarning = " - UNSAVED CHANGES!";
      }
      flowShow
        .setName(`${shownFlow.flowName}${modWarning}`)
        .setDesc(
          createFragment((desc) => {
            desc.createSpan({
              text: `Source: ${source}`,
            });
            if (inclusionString != "" && inclusionString != undefined) {
              desc.createEl("br"); // Add line break
              desc.createSpan({
                text: `Inclusion criteria: ${inclusionString}`,
              });
            }
            if (exclusionString != "" && exclusionString != undefined) {
              desc.createEl("br"); // Add line break
              desc.createSpan({
                text: `Exclusion criteria: ${exclusionString}`,
              });
            }
            if (Object.keys(shownFlow.conflictObject).length > 0) {
              const conflictArray: string[] = [];
              Object.keys(shownFlow.conflictObject).forEach((flow) => {
                conflictArray.push(flow);
              });
              const conflictString = conflictArray.join(" ,");
              desc.createEl("br"); // Add line break
              desc.createSpan({
                text: `Overlaps with: ${conflictString}`,
              });
            }
          })
        )
        .addButton((rebuildButton) =>
          rebuildButton.setButtonText("(Re)build)").onClick(async () => {
            // gather all info for the flowDefinition
            this.flowService.rebuildFlow(flow);
            await this.plugin.saveSettings();
            this.display();
          })
        )

        .addButton((editFlow) => {
          editFlow.setButtonText("Edit").onClick(async () => {
            // state check creating vs editing

            this.plugin.settings.flowBuildBasket = {
              createOrEditFlowName: "",
              oldFlowName: shownFlow.flowName,
              createOrEdit: "edit",
              depthFirst: shownFlow.depthFirst,
              folderTitles: shownFlow.folderTitles,
              definitionMode: Object.keys(shownFlow.flowReceipe)[0],
              flowCookbook: shownFlow.flowCookbook,
              cleanCookbook: {},
              finalReceipe: shownFlow.flowReceipe,
              conflictObject: shownFlow.conflictObject,
              dataviewSearchPath: "",
              previewUsed: false,
              success: true,
              fresh: false,
            };

            this.plugin.saveSettings();
            this.display();
          });
        })
        .addButton((deleteDef) => {
          deleteDef.setButtonText("Delete definition").onClick(async () => {
            const DeleteFlowDefModal = new Modals.DeleteFlowDefModal(
              this.app,
              this.plugin.settings,
              shownFlow.flowName,
              this.modalSaveAndReload
            );
            DeleteFlowDefModal.open();
          });
        });
    });

    const advancedSettings = containerEl.createEl("details", {
      cls: "advancedSettings-container",
    });

    advancedSettings
      .createEl("summary", {
        cls: "advancedSettings-headline",
      })
      .createSpan({ text: "Advanced settings" });

    // The content div where your advanced settings will go
    const advancedContent = advancedSettings.createDiv();

    // -----------   hide system folder  ---------------
    const hidesystemFolder = new Setting(advancedContent)
      .setName("Hide TextFlow_SystemFolder")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "Hiding this folder is strongly recommended (messing with it can lose you data).",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "Unhiding the folder requires a reload of the vault.",
          });
        })
      )
      .addToggle((hideSystemFolderToggle) => {
        hideSystemFolderToggle
          .setValue(this.plugin.settings.systemFolderHidden)
          .onChange(async (value) => {
            this.plugin.settings.systemFolderHidden = value;
            this.plugin.discernAndSetSystemFolderState(
              value,
              this.plugin.settings.systemFolderPlace
            );
            await this.plugin.saveSettings();
          });
      });

    // -----------   Auto-save  ---------------
    const autoSave = new Setting(advancedContent)
      .setName("Automatically sync back to source")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "Syncs to source all inactive leaves when you change the active leaf or click outside of the editor.",
          });
          desc.createEl("br"); // Add line break

          desc.createSpan({
            text: "!! Auto-sync does NOT trigger when you close or open your vault / Obsidan !!",
            cls: "text-emphasis",
          });
          desc.createEl("br"); // Add line break
          desc.createSpan({
            text: "You can always save manually via command palette / hotkey.",
          });
        })
      )
      .addToggle((activateAutoSave) => {
        activateAutoSave
          .setValue(this.plugin.settings.flowMode.autoSave)
          .onChange(async (value) => {
            this.plugin.settings.flowMode.autoSave = value;
            await this.plugin.saveSettings();
          });
      });
    let setAutoRebuildToggle: ToggleComponent;

    // ----------- Auto-rebuild ----------------

    const contextAware = new Setting(advancedContent)
      .setName("Context aware auto-sync and auto-rebuild")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            cls: "text-emphasis",
            text: "Use this feature wisely: ",
          });
          desc.createEl("br");
          desc.createSpan({
            text: "It allows you to open and edit conflicting flows in parallel.",
          });
          desc.createEl("br");
          desc.createSpan({
            cls: "text-emphasis",
            text: "But ",
          });
          desc.createSpan({
            text: "rebuilds destroy your undo-history and may take a few moments. Overlapping regions will be marked in the flows.",
          });
        })
      )
      .addToggle((toggle) => {
        setAutoRebuildToggle = toggle; // Store reference
        toggle
          .setValue(this.plugin.settings.flowMode.context)
          .onChange(async (value) => {
            this.plugin.settings.flowMode.context = value;
            await this.plugin.saveSettings();
          });
      });

    // ------------ explorer Deco
    const explorerDeco = new Setting(advancedContent)
      .setName("Mark (unsynced) source notes in file explorer")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "Turning this off requires a vault reload to take effect.",
          });
        })
      )
      .addToggle((explorerDeco) => {
        const modeSettings =
          this.plugin.settings.mode === "flow"
            ? this.plugin.settings.flowMode
            : this.plugin.settings.sourceMode;
        explorerDeco
          .setValue(modeSettings.explorerDeco)
          .onChange(async (value) => {
            const modeSettings =
              this.plugin.settings.mode === "flow"
                ? (this.plugin.settings.flowMode.explorerDeco = value)
                : (this.plugin.settings.sourceMode.explorerDeco = value);
            await this.plugin.saveSettings();
          });
      });
  }
}
