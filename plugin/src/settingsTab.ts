/*Functions that are called from this file: 

CHECKED AND TESTED
- this.flowService.createSystemFolder(path)
- this.flowService.isValidFlowName()
- this.flowService.radioButtonManager()
- this.flowService.updateScrollbarVisibility()
- this.flowService.debouncedSaveSettings() 

- this.plugin.decorateSourceFiles(); 
- this.plugin.undecorateSourceFiles();
- this.plugin.discernAndSetSystemFolderState(folderState, path)

UNCHECKED

*/

import * as Modals from "./modals";
import {
  App,
  ButtonComponent,
  setIcon,
  normalizePath,
  Notice,
  PluginSettingTab,
  Setting,
} from "obsidian";
import TextFlow from "../main";
import { FlowService } from "./flowService";
import * as Types from "./types";
import { dirname } from "path";

export const TEXTFLOW_SYSTEMFOLDER = "TextFlow_SystemFolder";

// --- The class that defines the settings tab
export class TextFlowSettingsTab extends PluginSettingTab {
  plugin: TextFlow;
  flowService: FlowService;

  constructor(app: App, plugin: TextFlow) {
    super(app, plugin);
    this.plugin = plugin;
    this.flowService = new FlowService(plugin, app);
  }

  // ----- Helper functions

  //#######################################################################
  //###########################   Settings Tab   ##########################
  //#######################################################################

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.plugin.settings.firstLaunch = false;
    this.plugin.saveSettings();

    const setUpTextFlow = containerEl.createDiv({
      cls: "headline-container",
    });

    // ###############   SET UP A SYSTEM FOLDER   ###########################
    //CHECKED AND TESTED
    const systemFolder = this.flowService.checkSystemFolder();
    let newSystemFolderParent = ".";

    const setSystemFolder = new Setting(setUpTextFlow)
      .setName("Choose an existing folder to put TextFlow_SystemFolder in")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "TextFlow needs a (hidden) system folder to store its flows in.",
          });
          desc.createEl("br");
          desc.createSpan({
            text: "Enter / or . to choose the root folder.",
          });
        })
      );

    this.plugin.ensureSystemFolder();

    setSystemFolder
      .addText((newSystemFolderInput) =>
        newSystemFolderInput
          .setValue(
            this.plugin.settings.systemFolderPath
              ? normalizePath(dirname(this.plugin.settings.systemFolderPath))
              : "/"
          )
          .onChange(async (value) => {
            newSystemFolderParent = normalizePath(value);
            await this.flowService.debouncedSaveSettings();
          })
      )
      .addButton((systemFolderCreateOrMoveButton) => {
        systemFolderCreateOrMoveButton
          .setButtonText(!systemFolder ? "Create" : "Move")
          .onClick(async () => {
            const newPath = normalizePath(
              `${newSystemFolderParent}/${TEXTFLOW_SYSTEMFOLDER}`
            );
            this.plugin.settings.systemFolderPath = newPath;
            await this.plugin.saveSettings();

            // Create SystemFolder
            if (!systemFolder) {
              await this.flowService.createSystemFolder(newPath);

              // set the folder hidden if appropriate
              this.plugin.discernAndSetSystemFolderState(
                this.plugin.settings.systemFolderHidden,
                newSystemFolderParent
              );
            } else {
              // Move SystemFolder
              try {
                await this.app.vault.rename(systemFolder, newPath);

                // hide if appropriate
                this.plugin.discernAndSetSystemFolderState(
                  this.plugin.settings.systemFolderHidden,
                  newSystemFolderParent
                );

                // Update the flowFilePaths
                if (this.plugin.settings.flows) {
                  Object.keys(this.plugin.settings.flows).forEach(
                    (flowName) => {
                      this.plugin.settings.flows[flowName].flowFilePath =
                        normalizePath(
                          `${this.plugin.settings.systemFolderPath}/${flowName}.md`
                        );
                    }
                  );
                  await this.plugin.saveSettings();
                }
                new Notice(
                  `textFlow: TextFlow_SystemFolder moved to ${newSystemFolderParent}`
                );
              } catch (error) {
                new Notice(`textFlow: Failed to move folder: ${error.message}`);
              }
            }
          });
      });
    // ^CHECKED AND TESTED

    // --------------------- UI settings
    // -----------   flowSwitcherModal  ---------------
    //CHECKED AND TESTED
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

    //^CHECKED AND TESTED

    //CHECKED
    // ------------ explorer Deco
    // Claude 3.5 Sonnet wrote this to preserve my sanity, which is also why it looks much more refined than my usual stuff
    const explorerDeco = new Setting(setUpTextFlow)
      .setName("Choose file explorer decoration")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "Marks the source notes of all currently active (opened) flows.",
          });
          desc.createEl("br");
          desc.createSpan({
            text: "First symbol: up to date; second symbol: waiting for sync.",
          });
          desc.createEl("br");
          desc.createSpan({
            text: "The colour is the accent you chose in Obsidian's 'Appearance' settings.",
          });
        })
      );

    const dropdownContainer = explorerDeco.controlEl.createDiv({
      cls: "explorer-deco-system",
    });

    const flowModeExplorerDecoHeadline = dropdownContainer.createDiv({
      cls: "explorer-deco-dropdown-trigger",
    });

    const flowModeExplorerDecoContainer = dropdownContainer.createDiv({
      cls: "explorer-deco-dropdown-container",
    });

    const updateHeadlineDisplay = (decoration: any[]) => {
      flowModeExplorerDecoHeadline.empty();
      flowModeExplorerDecoHeadline.createSpan({
        text: decoration[0],
        cls: decoration[2],
      });
      flowModeExplorerDecoHeadline.createSpan({
        text: decoration[1],
        cls: decoration[3],
      });
      const iconSpan = flowModeExplorerDecoHeadline.createSpan();
      setIcon(iconSpan, "chevrons-up-down");
    };

    updateHeadlineDisplay(this.plugin.settings.explorerDecoStyle);

    // Handle dropdown toggle
    const toggleDropdown = async (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const isOpen = flowModeExplorerDecoContainer.classList.contains("show");
      flowModeExplorerDecoContainer.classList.toggle("show");
      this.plugin.settings.explorerDecoDropdownOpen = !isOpen;
      await this.plugin.saveSettings();
    };

    flowModeExplorerDecoHeadline.addEventListener("click", toggleDropdown);

    // Create entries
    const allEntries = [
      ...this.flowService.flowModeInitalEntryArray,
      ...this.flowService.flowModeExtendedEntryArray,
    ];
    allEntries.forEach((entry) => {
      const explorerDecoEntry = flowModeExplorerDecoContainer.createDiv({
        cls: "explorer-deco-dropdown-entry",
      });
      explorerDecoEntry.createSpan({
        text: entry[0],
        cls: entry[2],
      });
      explorerDecoEntry.createSpan({
        text: entry[1],
        cls: entry[3],
      });

      explorerDecoEntry.addEventListener("click", async (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        this.plugin.settings.explorerDecoStyle = entry;
        this.plugin.settings.explorerDecoDropdownOpen = false;
        flowModeExplorerDecoContainer.classList.remove("show");
        updateHeadlineDisplay(entry);
        this.plugin.decorateSourceNotes("redo");
        await this.plugin.saveSettings();
      });
    });

    // Handle outside clicks
    const handleOutsideClick = async (event: MouseEvent) => {
      if (!dropdownContainer.contains(event.target as HTMLElement)) {
        flowModeExplorerDecoContainer.classList.remove("show");
        this.plugin.settings.explorerDecoDropdownOpen = false;
        await this.plugin.saveSettings();
      }
    };

    document.addEventListener("click", handleOutsideClick);

    // Clean up event listeners when the tab is closed
    this.plugin.register(() => {
      document.removeEventListener("click", handleOutsideClick);
      flowModeExplorerDecoHeadline.removeEventListener("click", toggleDropdown);
    });

    // --- And we're back to my own beginner style, though Claude still helps me to get better at this -.-

    // ------------ The Quality of Life stuff
    const qol = setUpTextFlow.createEl("details", {
      cls: "advancedSettings-container",
    });

    qol
      .createEl("summary", {
        cls: "advancedSettings-headline",
      })
      .createSpan({ text: "Some quality of life settings" });

    const qolSettings = qol.createDiv();

    // hide explorer deco
    const hideExplorerDeco = new Setting(qol)
      .setName("Hide explorer deco")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "For when you don't want to see it right now. There's a command, too. ",
          });
        })
      )
      .addToggle((decoToggle) => {
        decoToggle
          .setValue(!this.plugin.settings.showExplorerDeco)
          .onChange(async (value) => {
            this.plugin.settings.showExplorerDeco = !value;
            if (value) {
              this.plugin.unDecorateSourceNotes();
            } else {
              this.plugin.decorateSourceNotes("redo");
            }
            await this.plugin.saveSettings();
          });
      });

    // -------------- Multi-select -----------------
    const navListener = new Setting(qol)
      .setName("Disable navigation via file explorer")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "Toggle this on if you need multi-select to work correctly. There's command, too.",
          });
        })
      )
      .addToggle((navListenerToggle) => {
        navListenerToggle
          .setValue(!this.plugin.settings.explorerListener)
          .onChange(async (value) => {
            this.plugin.settings.explorerListener = !value;
            await this.plugin.saveSettings();
          });
      });

    // ------------- scrollbar ------------
    const scrollbar = new Setting(qol)
      .setName("Hide scrollbar")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "When long notes/sections are on the screen, the scroll bar starts twitching. If that annoys you, you can hide it.",
          });
          desc.createEl("br");
          desc.createSpan({
            text: "There's also a command to toggle between 'hide everywhere' and 'don't hide'.",
          });
        })
      )
      .addDropdown((dropdown) => {
        dropdown
          .addOption("flows", "Hide only in flows")
          .addOption("all", "Hide everywhere")
          .addOption("none", "Don't hide")
          .setValue(this.plugin.settings.hideScrollbar)
          .onChange(async (value) => {
            this.plugin.settings.hideScrollbar = value;
            await this.plugin.saveSettings();
            this.flowService.updateScrollbarVisibility();
          });
      });

    // -----------   hide system folder  ---------------
    const hidesystemFolder = new Setting(qol)
      .setName("Hide TextFlow_SystemFolder")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "Hiding this folder is recommended to protect its contents, but ultimately, it's an aesthetic and practical choice.",
          });
          desc.createEl("br");
          desc.createSpan({
            text: "If you open flows directly from the folder, they will still be protected and tracked.",
          });
          desc.createEl("br");
          desc.createSpan({
            text: "Unhiding the folder needs a vault reload to take effect.",
          });
        })
      )
      .addToggle((hideSystemFolderToggle) => {
        hideSystemFolderToggle
          .setValue(this.plugin.settings.systemFolderHidden)
          .onChange(async (value) => {
            this.plugin.settings.systemFolderHidden = value;
            if (this.plugin.settings.systemFolderPath) {
              this.plugin.discernAndSetSystemFolderState(
                value,
                normalizePath(this.plugin.settings.systemFolderPath)
              );
            }
            await this.plugin.saveSettings();
          });
      });
    //^CHECKED
    // --------   CREATE / EDIT FLOWS   ----------------
    const createFlows = containerEl.createDiv({
      cls: "headline-container",
    });
    createFlows.createEl("h3", {
      text: "Create a new flow",
      cls: "headline-text",
    });

    //--------- FLOW NAME -----------------
    // CHECKED AND TESTED
    const chooseFlowName = new Setting(createFlows)
      .setName("Name your flow")
      .setDesc(
        createFragment((desc) => {
          if (this.plugin.settings.flowBuildBasket.createOrEdit != "edit") {
            desc.createSpan({
              text: "The following characters can not be part of your flow name:",
              cls: "text-emphasis",
            });
            desc.createEl("br");
            desc.createSpan({
              text: '? : # * < > [ ] / | \\ "  ^ `',
              cls: "text-emphasis",
            });
            desc.createEl("br");
            desc.createSpan({
              text: "Also note that the name can not be changed later.",
            });
          } else {
            desc.createSpan({
              text: `Your flow is called "${this.plugin.settings.flowBuildBasket.flowName}"`,
            });
          }
        })
      );
    if (this.plugin.settings.flowBuildBasket.createOrEdit != "edit") {
      chooseFlowName.addText((setFlowName) => {
        setFlowName.setPlaceholder("Enter a unique name");
        setFlowName.setValue(
          this.plugin.settings.flowBuildBasket.createOrEdit != "edit"
            ? this.plugin.settings.flowBuildBasket.flowName
            : ""
        );

        setFlowName.onChange(async (value) => {
          this.plugin.settings.flowBuildBasket.flowName = value.trim();
          this.flowService.debouncedSaveSettings();
        });
      });
    }
    //^CHECKED AND TESTED

    // --------- FOLDER TITLES ------------------
    // CHECKED
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
        sortToggle
          .setValue(this.plugin.settings.flowBuildBasket.folderTitles)
          .onChange(async (value) => {
            this.plugin.settings.flowBuildBasket.folderTitles = value;
            this.plugin.saveSettings();
          });
      });

    // ^CHECKED

    //------- DEFINE FLOW --------------------
    //CHECKED
    const defineFlow = new Setting(createFlows)
      .setName("Define your Flow...")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "Only the active definition method will be used for your definition.",
          });
          desc.createEl("br");
          desc.createSpan({
            text: "If you don't enter any criteria, your enitre vault will be included in your flow.",
            cls: "text-emphasis",
          });
        })
      );
    //^CHECKED

    //------- RADIO BUTTONS
    const radioButtonContainer = defineFlow.controlEl.createDiv({
      cls: "radio-button-group",
    });
    const buttons: { [key: string]: ButtonComponent } = {};

    // -------- Radio Buttons ---------------
    // Just creating and styling the buttons; the dependent UI and .onClick behaviour
    // are below the input element setup because I want to keep the hide/show with its elements
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
    //CHECKED

    const bookmarksSortOrder = new Setting(createFlows);
    bookmarksSortOrder.settingEl.hide(); // HIDE INITIALLY
    bookmarksSortOrder
      .setName("Sort order")
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "Depth first: ",
            cls: "text-emphasis",
          });
          desc.createSpan({
            text: "Note order overrides group order. Best for flat hierarchy (and group titles off).",
          });
          desc.createEl("br");
          desc.createSpan({
            text: "Notes first: ",
            cls: "text-emphasis",
          });
          desc.createSpan({
            text: "Group order overrides note order. Best for deep hierarchy (and group titles on).",
          });
          desc.createEl("br");
          desc.createSpan({
            text: "Custom: ",
            cls: "text-emphasis",
          });
          desc.createSpan({
            text: "Exact order of groups and notes is preserved. Best with group titles off.",
          });
          desc.createEl("br");
          desc.createSpan({
            text: "Test out all options in the preview to see which order fits you best.",
          });
        })
      )
      .addDropdown((dropdown) => {
        dropdown
          .addOption("depthFirst", "Depth first")
          .addOption("filesFirst", "Files first")
          .addOption("custom", "Custom");
        dropdown.setValue(
          this.plugin.settings.flowBuildBasket.flowCookbook
            .bookmarksSortOrder ?? "depthFirst"
        );
        dropdown.onChange((value) => {
          this.plugin.settings.flowBuildBasket.flowCookbook.bookmarksSortOrder =
            value as Types.SortOrder;
          this.plugin.saveSettings();
        });
      });

    const chooseBookmarks = new Setting(createFlows);
    chooseBookmarks.settingEl.hide(); // HIDE INITIALLY
    chooseBookmarks.settingEl.addClass("input-width-200");
    chooseBookmarks.setDesc(
      createFragment((desc) => {
        desc.createSpan({
          text: "Input the name of a bookmarks group.",
        });
        desc.createEl("br");
        desc.createSpan({
          text: "To choose a subgroup, enter its path like this:",
        });
        desc.createEl("br");
        desc.createSpan({
          text: "rootGroup/subGroupOfRoot/subGroupOfSubgroup",
        });
        desc.createEl("br");
        desc.createSpan({
          text: "To exclude a group's subgroups end its name or path with /",
        });
      })
    );
    chooseBookmarks.addText((setBookmarksGroup) => {
      setBookmarksGroup.onChange(async (value) => {
        this.plugin.settings.flowBuildBasket.previewUsed = false;
        this.plugin.settings.flowBuildBasket.flowCookbook.bookmarks =
          value.trim();
        this.flowService.debouncedSaveSettings();
      });
    });
    //^CHECKED

    // ---------- FOLDERS, TAGS AND PROPERTIES INPUT ELEMENT -----------------------------------------
    // This function used to be called IHateCSSAndHTML.
    // I just can't get the layout to work with containers and
    // I am NOT going to try again.

    //CHECKED
    const showOrHideAlLFoldersTagsProps = (state: string) => {
      if (state === "show") {
        sortFlowPathsTagsProperties.settingEl.show();
        headlineChoosePathsTagsProperties.settingEl.show();
        folderIncludeInput.settingEl.show();
        folderExcludeInput.settingEl.show();
        tagsIncludeInput.settingEl.show();
        tagsExcludeInput.settingEl.show();
        propertiesIncludeInput.settingEl.show();
        propertiesExcludeInput.settingEl.show();
      }
      if (state === "hide") {
        sortFlowPathsTagsProperties.settingEl.hide();
        headlineChoosePathsTagsProperties.settingEl.hide();
        folderIncludeInput.settingEl.hide();
        folderExcludeInput.settingEl.hide();
        tagsIncludeInput.settingEl.hide();
        tagsExcludeInput.settingEl.hide();
        propertiesIncludeInput.settingEl.hide();
        propertiesExcludeInput.settingEl.hide();
      }
    };
    //^CHECKED

    //CHECKED
    // --- headline object ------

    // ---- SORT FLOW ---------
    // CHECKED
    const sortFlowPathsTagsProperties = new Setting(createFlows).setName(
      "Sort order"
    );
    sortFlowPathsTagsProperties.settingEl.hide();
    sortFlowPathsTagsProperties.setDesc(
      createFragment((desc) => {
        desc.createSpan({
          text: "Depth first: ",
          cls: "text-emphasis",
        });
        desc.createSpan({
          text: "Note order overrides folder order. Best for flat hierarchy (and folder titles off).",
        });
        desc.createEl("br");
        desc.createSpan({
          text: "Notes first: ",
          cls: "text-emphasis",
        });
        desc.createSpan({
          text: "Folder order overrides note order. Best for deep hierarchy (and folder titles on).",
        });
        desc.createEl("br");
        desc.createSpan({
          text: "Test out all options in the preview to see which order fits you best.",
        });
      })
    );

    sortFlowPathsTagsProperties.addDropdown((dropdown) => {
      dropdown
        .addOption("depthFirst", "Depth first")
        .addOption("filesFirst", "Files first");
      dropdown.setValue(
        // remove "custom" as option
        this.plugin.settings.flowBuildBasket.flowCookbook
          .pathsTagsPropertiesSortOrder
          ? this.plugin.settings.flowBuildBasket.flowCookbook
              .pathsTagsPropertiesSortOrder
          : "depthFirst"
      );
      dropdown.onChange((value) => {
        this.plugin.settings.flowBuildBasket.flowCookbook.pathsTagsPropertiesSortOrder =
          value as Types.SortOrder;
        this.plugin.saveSettings();
      });
    });
    // ^ CHECKED

    const headlineChoosePathsTagsProperties = new Setting(createFlows);
    headlineChoosePathsTagsProperties.settingEl.hide();
    headlineChoosePathsTagsProperties.setClass("input-width").setDesc(
      createFragment((desc) => {
        desc.createSpan({
          text: "All six inputs are optional. For inclusion, all given criteria must be true; for exclusion only one criterion must me true.",
        });
        desc.createEl("br");
        desc.createSpan({
          text: "If you need more complex logic, consider defining your flow using a dataview query and tagging the results with your flow's name.",
        });
      })
    );
    //^CHECKED

    //CHECKED
    // ----- Folder include
    const folderIncludeInput = new Setting(createFlows);
    folderIncludeInput.settingEl.hide();
    folderIncludeInput.settingEl.addClass("border-top-none");
    folderIncludeInput.settingEl.addClass("input-width-400");
    folderIncludeInput.setDesc(
      createFragment((desc) => {
        desc.createSpan({
          text: "Choose a single source folder.",
        });
        desc.createEl("br");
        desc.createSpan({
          text: "Default is root.",
        });
        desc.createEl("br");
        desc.createSpan({
          text: "End path with / to not include subfolders.",
        });
      })
    );

    folderIncludeInput.addText((folderIncludeInput) => {
      const storedValue =
        this.plugin.settings.flowBuildBasket.flowCookbook.folderIncluded;

      // this is so setValue is either a filled string or undefined;
      // with an empty string for some reason not all folders get included when editing
      if (
        !storedValue ||
        storedValue === "" ||
        storedValue === "root" ||
        storedValue === "/" ||
        storedValue === "//" ||
        storedValue === "."
      ) {
        delete this.plugin.settings.flowBuildBasket.flowCookbook.folderIncluded;
      }
      // When displaying the value
      folderIncludeInput.setValue(
        this.plugin.settings.flowBuildBasket.flowCookbook.folderIncluded
      );

      folderIncludeInput.onChange(async (value) => {
        // do not normalize because we need those trailing slashes!
        this.plugin.settings.flowBuildBasket.previewUsed = false;
        // When storing the value; "root/" is handled by getPathsByFoldersTagsProps()
        this.plugin.settings.flowBuildBasket.flowCookbook.folderIncluded =
          !value ||
          value === "" ||
          value === "root" ||
          value === "/" ||
          value === "//" ||
          value === "."
            ? ""
            : value;
        this.flowService.debouncedSaveSettings();
      });
    });
    //^CHECKED

    //CHECKED
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
          desc.createEl("br");
          desc.createSpan({
            text: "Input comma separated list.",
          });
        })
      )
      .addText((chooseExcludedFolders) => {
        chooseExcludedFolders.setValue(
          this.plugin.settings.flowBuildBasket.flowCookbook.folderExcluded
        );
        chooseExcludedFolders.onChange(async (value) => {
          this.plugin.settings.flowBuildBasket.previewUsed = false;

          // cleanup happens on preview/save
          this.plugin.settings.flowBuildBasket.flowCookbook.folderExcluded =
            value;

          this.flowService.debouncedSaveSettings();
        });
      });

    //^CHECKED
    //CHECKED
    // ----- Tags
    const tagsIncludeInput = new Setting(createFlows);
    tagsIncludeInput.settingEl.hide();
    tagsIncludeInput.settingEl.addClass("border-top-none");
    tagsIncludeInput.settingEl.addClass("input-width-400");
    tagsIncludeInput
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "INclude by #TAG.",
          });
          desc.createEl("br");
          desc.createSpan({
            text: "Input comma separated list.",
          });
        })
      )
      .addText((chooseIncludedTags) => {
        chooseIncludedTags.setValue(
          this.plugin.settings.flowBuildBasket.flowCookbook.tagsIncluded
        );
        chooseIncludedTags.onChange(async (value) => {
          this.plugin.settings.flowBuildBasket.previewUsed = false;

          // cleanup happens on preview/save
          this.plugin.settings.flowBuildBasket.flowCookbook.tagsIncluded =
            value;

          this.flowService.debouncedSaveSettings();
        });
      });
    //^CHECKED
    //CHECKED
    const tagsExcludeInput = new Setting(createFlows);
    tagsExcludeInput.settingEl.hide();
    tagsExcludeInput.settingEl.addClass("border-top-none");
    tagsExcludeInput.settingEl.addClass("input-width-400");
    tagsExcludeInput
      .setDesc(
        createFragment((desc) => {
          desc.createSpan({
            text: "EXclude by #TAG.",
          });
          desc.createEl("br");
          desc.createSpan({
            text: "Input comma separated list.",
          });
        })
      )
      .addText((chooseExcludedTags) => {
        chooseExcludedTags.setValue(
          this.plugin.settings.flowBuildBasket.flowCookbook.tagsExcluded
        );
        chooseExcludedTags.onChange(async (value) => {
          this.plugin.settings.flowBuildBasket.previewUsed = false;

          // cleanup happens on preview/save
          this.plugin.settings.flowBuildBasket.flowCookbook.tagsExcluded =
            value;
          this.flowService.debouncedSaveSettings();
        });
      });
    //^CHECKED
    //CHECKED
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
          desc.createEl("br");
          desc.createSpan({
            text: "Input comma separated list.",
          });
          desc.createEl("br");
          desc.createSpan({
            text: `You can use property = "value"`,
          });
        })
      )
      .addText((chooseIncludedProperties) => {
        chooseIncludedProperties.setValue(
          this.plugin.settings.flowBuildBasket.flowCookbook.propsIncluded
        );
        chooseIncludedProperties.onChange(async (value) => {
          this.plugin.settings.flowBuildBasket.previewUsed = false;

          // cleanup happens on preview/save
          this.plugin.settings.flowBuildBasket.flowCookbook.propsIncluded =
            value;
          this.flowService.debouncedSaveSettings();
        });
      });
    //^CHECKED
    //CHECKED
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
          desc.createEl("br");
          desc.createSpan({
            text: "Input comma separated list.",
          });
          desc.createEl("br");
          desc.createSpan({
            text: `You can use property = "value"`,
          });
        })
      )
      .addText((chooseExcludedProperties) => {
        chooseExcludedProperties.setValue(
          this.plugin.settings.flowBuildBasket.flowCookbook.propsExcluded
        );
        chooseExcludedProperties.onChange(async (value) => {
          this.plugin.settings.flowBuildBasket.previewUsed = false;

          // cleanup happens on preview/save
          this.plugin.settings.flowBuildBasket.flowCookbook.propsExcluded =
            value;
          this.flowService.debouncedSaveSettings();
        });
      });
    //^CHECKED

    //CHECKED
    // ---- RADIO BUTTON SETTINGS AND LOGIC
    // --- Presets for the BOOKMARKS button
    if (this.plugin.settings.flowBuildBasket.definitionMode === "bookmarks") {
      showOrHideAlLFoldersTagsProps("hide");
      bookmarksSortOrder.settingEl.show();
      chooseBookmarks.settingEl.show();
    }

    // onClick for the BOOKMARKS button
    buttons.bookmarks.onClick(() => {
      // set correct definition mode and show/hide correct elements
      this.plugin.settings.flowBuildBasket.definitionMode = "bookmarks";
      this.plugin.settings.flowBuildBasket.previewUsed = false;

      console.log(
        this.plugin.settings.flowBuildBasket.flowCookbook.bookmarksSortOrder
      );
      // update button
      this.flowService.radioButtonManager(
        buttons.bookmarks,
        buttons.foldersTagsProps
      );

      // hide/show input elements
      bookmarksSortOrder.settingEl.show();
      chooseBookmarks.settingEl.show();
      showOrHideAlLFoldersTagsProps("hide");
      this.plugin.saveSettings();
      this.display();
    });

    // ---- Presets for the foldersTagsProps button
    if (
      this.plugin.settings.flowBuildBasket.definitionMode === "foldersTagsProps"
    ) {
      bookmarksSortOrder.settingEl.hide();
      chooseBookmarks.settingEl.hide();
      showOrHideAlLFoldersTagsProps("show");
    }

    // onClick for the foldersTagsProps button
    buttons.foldersTagsProps.onClick(() => {
      this.plugin.settings.flowBuildBasket.definitionMode = "foldersTagsProps";
      this.plugin.settings.flowBuildBasket.previewUsed = false;

      this.flowService.radioButtonManager(
        buttons.foldersTagsProps,
        buttons.bookmarks
      );

      bookmarksSortOrder.settingEl.hide();
      chooseBookmarks.settingEl.hide();
      showOrHideAlLFoldersTagsProps("show");
      this.plugin.saveSettings();
      this.display();
    });
    //^CHECKED

    // ----------- Preview and save BUTTONS --------------------
    //CHECKED
    const previewButton = new ButtonComponent(containerEl);
    previewButton
      .setButtonText("Preview your flow structure")
      .onClick(async (buttonEl: MouseEvent) => {
        // set up missing values
        this.plugin.settings.flowBuildBasket.previewUsed = true;
        this.plugin.settings.flowBuildBasket.dataviewSearchPath = "";
        this.plugin.settings.flowBuildBasket.success = false;

        // Make sure the flow name is okay
        const validation = await this.flowService.isValidFlowName(
          this.plugin.settings.flowBuildBasket.flowName
        );
        if (!validation.valid && validation.reason) {
          new Notice(validation.reason);
          return;
        }
        // do the logic that leads to a list of note paths
        await this.flowService.createFlowDefinition(
          this.plugin.settings.flowBuildBasket
        );

        // make the modal
        if (this.plugin.settings.flowBuildBasket.success) {
          const previewModal = new Modals.previewModal(
            this.app,
            this.plugin,
            this.plugin.settings.flowBuildBasket
          );
          previewModal.open();
        }
      });
    //^CHECKED

    //CHECKED
    const saveButton = new ButtonComponent(containerEl);
    saveButton
      .setButtonText("Save flow definition")
      .onClick(async (buttonEl: MouseEvent) => {
        // if checks and flow creation haven't been performed by the preview button
        if (!this.plugin.settings.flowBuildBasket.previewUsed) {
          const validation = await this.flowService.isValidFlowName(
            this.plugin.settings.flowBuildBasket.flowName
          );
          if (!validation.valid && validation.reason) {
            new Notice(validation.reason);
            return;
          }

          await this.flowService.createFlowDefinition(
            this.plugin.settings.flowBuildBasket
          );
          if (!this.plugin.settings.flowBuildBasket.success) {
            return;
          }
        }

        // write the whole stuff,
        await this.flowService.writeFlowDef(
          this.plugin.settings,
          this.plugin.settings.flowBuildBasket
        );

        // update conflicts,
        await this.flowService.syncConflictObjects(
          this.plugin.settings.flowBuildBasket
        );

        // and clean up the basket.
        await this.flowService.resetFlowBuildBasket(
          this.plugin.settings.flowBuildBasket
        );

        // save
        this.plugin.saveSettings();
        this.display();
      });
    //^CHECKED

    //CHECKED
    // ----- Clear the input mask
    const clearValues = new ButtonComponent(containerEl);
    clearValues
      .setButtonText("Clear values")
      .onClick(async (buttonEl: MouseEvent) => {
        // Clear all input values and reset the basket
        this.plugin.settings.flowBuildBasket.previewUsed = false;
        this.flowService.resetFlowBuildBasket(
          this.plugin.settings.flowBuildBasket
        );
        this.plugin.saveSettings();
        this.display();
      });
    //^CHECKED
    //CHECKED
    // ------- FLOW DISPLAY -----------------------------
    const flowDisplay = containerEl.createDiv({
      cls: "headline-container",
    });
    flowDisplay.createEl("h3", {
      text: "Your flow definitions",
      cls: "headline-text",
    });

    const flowSorted: string[] = [];
    Object.keys(this.plugin.settings.flows).forEach((flowName) => {
      flowSorted.push(flowName);
    });

    flowSorted.sort();

    for (let flowName of flowSorted) {
      const shownFlow = this.plugin.settings.flows[flowName];

      // --- DISPLAY PREPARATIONS ----------------------------------
      // Set up strings to display flow criteria

      // SOURCE
      let source = "";
      if (shownFlow.flowCookbook.bookmarks) {
        source += `Bookmark group "${shownFlow.flowCookbook.bookmarks}"`;
      } else if (
        shownFlow.flowCookbook.folderIncluded === "" ||
        shownFlow.flowCookbook.folderIncluded === "/"
      ) {
        source += "/";
      } else {
        source += `/${shownFlow.flowCookbook.folderIncluded}`;
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
      flowShow
        .setName(`${shownFlow.flowName}`)
        .setDesc(
          createFragment((desc) => {
            desc.createSpan({
              text: `Source: ${source}`,
            });
            if (inclusionString != "" && inclusionString != undefined) {
              desc.createEl("br");
              desc.createSpan({
                text: `Inclusion criteria: ${inclusionString}`,
              });
            }
            if (exclusionString != "" && exclusionString != undefined) {
              desc.createEl("br");
              desc.createSpan({
                text: `Exclusion criteria: ${exclusionString}`,
              });
            }
          })
        )
        //^CHECKED
        //CHECKED  AND TESTED
        .addButton((rebuildButton) =>
          rebuildButton.setButtonText("(Re)build").onClick(async () => {
            // delete unneeded flowDef information
            if (
              shownFlow.definitionMode === "bookmarks" &&
              shownFlow.flowCookbook.foldersTagsProps
            ) {
              delete shownFlow.flowCookbook.foldersTagsProps;
              delete shownFlow.flowCookbook.foldersTagsPropsSortOrder;
            } else if (
              shownFlow.definitionMode === "foldersTagsProps" &&
              shownFlow.flowCookbook.bookmarks
            ) {
              delete shownFlow.flowCookbook.bookmarks;
              delete shownFlow.flowCookbook.bookmarksSortOrder;
            }

            // gather all info for the flowDefinition
            this.flowService.rebuildFlow(flowName, "settingsTab");
            await this.plugin.saveSettings();
            this.display();
          })
        )
        //^CHECKED AND TESTED
        //CHECKED AND TESTED
        .addButton((editFlow) => {
          editFlow.setButtonText("Edit").onClick(async () => {
            // putting values in the flowBuildBasket
            this.plugin.settings.flowBuildBasket = {
              createOrEdit: "edit",
              dataviewSearchPath: "",
              previewUsed: false,
              success: true,
              flowName: shownFlow.flowName,
              definitionMode: shownFlow.definitionMode,
              folderTitles: shownFlow.folderTitles,
              flowCookbook: shownFlow.flowCookbook,
              finalRecipe: shownFlow.flowRecipe,
              conflictObject: shownFlow.conflictObject,
              activeRegions: shownFlow.activeRegions,
              persistentCursors: shownFlow.persistentCursors,
            };

            // save to make them stick
            this.plugin.saveSettings();

            // rebuild display so values are shown in the input mask
            this.display();
          });
        })
        //^CHECKED AND TESTED

        //CHECKED AND TESTED
        .addButton((deleteDef) => {
          deleteDef.setButtonText("Delete definition").onClick(async () => {
            const DeleteFlowDefModal = new Modals.DeleteFlowDefModal(
              this.app,
              this.plugin,
              this,
              shownFlow.flowName
            );
            DeleteFlowDefModal.open();
          });
        });
    }
  }
}
