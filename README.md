[de version](https://github.com/tine-schreibt/textflow/blob/main/README_de.md)

### TL;DR

textFlow lets you create **flows** - dynamic documents built from the contents
of multiple notes (think 'Scrivenings'). Flows can be defined from Dataview
queries, from folders, tags and properties, or from bookmark groups. They can be
edited like any other note. All changes to flows and their sources are
registered automatically and synced both ways.

textFlow is intended mainly for long form writers, but can be used by anyone who
wants to see and/or work on multiple notes in context.

The UI has options for keyboard as well as mouse navigation.

**UPDATE:** As of version 0.4.0 you can build **Flows with embeds**; this means
that these Flows don't create any data duplication. You just need to install and
activate the plugin
[Sync Embeds by uthvah](https://github.com/uthvah/sync-embeds) (can only be
installed manually at the moment). _Updates to this readme relating to this
haven't yet been completed._

Right now I'm puttering about putting reigns on the overlap detection for embed
flows. After that I'll implement a toggle with which to conveniently change a
Flow from classic to embed and back.

Please be aware that (outside of the functions I am currently implementing) I
tested textFlow extensively, but you are still the first real users, so I can't
guarantee you won't find some bug or other that I missed. Here's
[a trouble shooting guide](#9-fixing-problems) you can look at before filing a
[bug report](#12-report-a-bug--report-your-love).

Please also run Obsidian's own data recovery plugin,
['Edit history' by Antonio Tejada](https://github.com/antoniotejada/obsidian-edit-history)
or another real time backup service - at least until textFlow has earned your
trust. (Actually you should always run a backup, regardless of what you're
doing. Always. Please run backups! o.o)

---

**Want to jump right in?**

- [Requirements and setup](#5-requirements-and-setup)
- [Getting started](#8-getting-started)
- [Fixing problems](#9-fixing-problems)

**Want to know what you're getting first and understand how to use textFlow
smoothly?**

1. [Functionality](#1-functionality)
2. [Safety features](#2-safety-features)
3. [Limitations and known inconveniences](#3-limitations-and-known-inconveniences)
4. [Use cases](#4-use-cases)
5. [Requirements and setup](#5-requirements-and-setup)
6. [Settings](#6-settings)
7. [Commands](#7-commands)
8. [Getting started](#8-getting-started)
9. [Fixing problems](#9-fixing-problems)
10. [Cheat sheet](#10-cheat-sheet)
11. [Comparing textFlow and Outline](#11-comparing-textflow-and-outline)
12. [Report a bug / report your love](#12-report-a-bug--report-your-love)

<hr>

### 1. Functionality

##### Already implemented:

1. **'Smart' flows:** Define flows from bookmark groups or by using folders,
   tags and [properties](#How-to-properties) as in/exclusion criteria. textFlow
   will copy those notes into a new note (a flow) and mark each one with
   [invisible UUIDs](#what-are-invisible-uuids), so it can keep track of them.
   - **Convenient:**
     - All Flows will be automatically checked whenever you move, add, or delete
       a note (or folder) in their source folder, and flagged for rebuild when
       applicable. For Flows defined from Dataview-Queries or bookmark groups,
       this only work in a limited fashion; but manual rebuilds are always
       possible.
     - Right-click on a folder gives the option:
       `textFlow: Create new flow from this folder`. This also works for a
       selection of multiple folders. You can later refine the definition (using
       tags and properties) in the settings.
2. **Structure your flows:**
   - Flows built from folders, tags or properties have two sorting options:
     1. Mirror the order of your _notes_ as they appear in the file
        explorer[\*](#no-manual-sorting).
     2. Mirror the order of your _folders_ as they appear in the file
        explorer[\*](#no-manual-sorting).
   - Flows built from bookmark groups aren't tied to the alphanumeric thing and
     can also mirror the plain order of items regardless if they are notes or
     groups. Use whatever order feels more intuitive/less confusing to you or
     better fits the respective flow. Some sort orders also work better with
     folder/group title deactivated.
3. **Embeds:** If you install the plugin
   [Sync Embeds by uthvah](https://github.com/uthvah/sync-embeds), your Flow
   will be made of editable embeddings, which are automatically synced with the
   source notes.
4. **Edit flows like any other note:** If your Flow is not build with embeds,
   textFlow keeps track of which region of a flow an edit happens in. It
   automatically syncs it all back to the correct source note whenever you click
   into a different note. You can also sync manually anytime you like (there's a
   command you can bind to a shortcut).
5. **Add frontmatter to your flows:** Just use the properties plugin as usual.
   Properties will be preserved across rebuilds and are useful if you want to
   keep track of your flows beyond the settings tab/flowSwitcher
   modal/textFlow's (hidden) folder.
6. **A flow is really just an ordinary note with some API bling attached:** So
   _everything will still work within your flows_: Your themes still work.
   Inline-styles still work. Dataview tables will still be displayed as usual.
   Outline still works (well, [99%](#3-limitations-and-known-inconveniences)).
   In-note search still works. Callouts, lists, code blocks, tables, tabs, it
   all still works. Because, again, a flow is just a normal note with some API
   bling stuck on.
7. **Navigate within flows via the file explorer:** Yup. I know! textFlow can
   even highlight the active region's source note in one of four styles!
   [It's not perfect, though...](#3-limitations-and-known-inconveniences)
8. **Navigate via fuzzy navigation modal:** If you're used to working with
   Obsidian's Quick switcher modal, you'll be right at home here - with some
   handy tricks included:
   - prefix `?` to limit your search to the flow in the active leaf
   - `*` to search in all flows that are _not_ the active one
   - `:` to search only flow names
   - use no prefix at all if you want to just search everything Details on how
     to navigate using the modal:
     [How to Fuzzy navigation modal](#How-to-Fuzzy-navigation-modal)
9. **Do lots of stuff via the menu bar:**
   1. It has buttons for **syncing** and **rebuilding**.
   2. **A navigation menu**: This dropdown makes it easy to navigate disjointed
      flows, or if the fickle focus thing is too frustrating for you. The menu
      also sports a fuzzy search to help you get around huge flows faster. The
      search term persists in-session, so you don't have to retype it.
   3. **Your cursor history:** Whenever you sync, textFlow saves the last cursor
      position (for the last few regions of the last few leaves), so you can
      more easily jump around your document. textFlow remembers the cursor
      positions across reloads and scrolls there automatically. There's also a
      command to restore the last known cursor position for the active leaf.
   4. **A button to select the active region:** Only for non-embed Flows. In
      case you want to do some copy/paste surgery. There's a command for this,
      too.
   5. **An export button:** This button creates a copy of your flow with all the
      UUIDs stripped out. It will be put in your root folder and named with the
      flow name and a time stamp. For embed Flows it replaces the embeds with
      copies of the embedded note's content.
   6. **A min/max toggle:** There's a button to minimise/maximise the menu bar.
      There's also a command to toggle the menu. In its minimised state the menu
      bar is just a small grey chevron in the upper left corner of your editor-
      or a warning triangle, while the flow isn't setup yet. (Hover over the
      triangle if it doesn't disappear on its own.)
10. **Do stuff via the switcher modal:** In the flow switcher you've got buttons
    to:
    - open flows in a new tab or split
    - switch between a flow's tabs
    - quickly close multiple flow tabs
    - rebuild inactive flows
11. **Little things:**
    - You can hide scroll bars
    - Right-clicking into file explorer gives the option to create a new file in
      the current folder (this is basically just for me -.-)

##### Maybe coming in the future if enough people [ask for it](https://github.com/tine-schreibt/textFlow/issues):

- **Export with properties:** The option to keep properties when exporting a
  flow.
- **Select your own default export location:** Set a folder other than root for
  exported flows.
- **Favourites for the switcher modal:** In case you have a gazillion flows,
  need help staying on top of them, and frontmatter/Dataview seem scary to you.
- **Tags and properties for bookmark flows:** So you can narrow them down if you
  only have them to sort your stuff in file explorer.
- **Right-click define flow from bookmarks folder:** So there's the same
  convenience as for folders in the file explorer.
- **Bespoke artisanal flows:** The option to input a random file list as flow
  source.
- **Tags and properties for artisanal flows:** For people who are using plugins
  with file lists for their manual sorting.
- **Redirect for internal links:** An entry in the context menu for internal
  links that allows you to open the link in a flow instead of the originally
  addressed note.

If I develop motivation on my own, they may show up all by themselves one day.

**Also:**

- **More languages:** So far the plugin has an English and German language file.
  If you'd like to contribute:
  [https://github.com/tine-schreibt/textFlow/tree/main/plugin/src/lang](https://github.com/tine-schreibt/textFlow/tree/main/plugin/src/lang)

<hr>

### 2. Safety features

1. **The menu bar:** Its existence signals that the plugin is up and running.
   Beyond that, the bar also checks if all the CodeMirror bling has been
   attached correctly. If that's not (yet) the case you will see a warning
   triangle instead of the min/max chevron. If you see that triangle, hover your
   mouse over it to get instructions.
2. **Invisible UUIDs are write locked:** UUIDs are random strings of 46
   non-printing characters that textFlow inserts at the end of each source
   note's content to track the cursor's position relative to them. They are
   write protected to guarantee their (and thus your flow's and source notes')
   integrity. This protection of course isn't there when you edit a flow outside
   of textFlow/Obsidian. Some text editors also simply delete non-printing
   characters, so the mere opening of a flow destroys its integrity.
3. **Integrity check for flows:** Whenever you open a flow that isn't rebuilt
   during the course of its setup, textFlow checks the UUIDs contained in the
   file. If any are missing/broken, it lets you know, so you can manually
   rebuild the flow.
4. **Flows are saved by Obsidian:** Since flows are just ordinary notes as far
   as Obsidian is concerned, they are saved the same way all your other notes
   are. Meaning your work is as safe within your flow as it would be within any
   other note, and you won't lose anything if Obsidian crashes.
5. **Automation:**
   1. **Auto-sync:** Whenever you click into/out of a leaf (tab), all new edits
      are automatically synced back to source. You can also sync manually any
      time you want; there's a command for it.
   2. **Auto-rebuild:** Whenever you focus a leaf that holds a flow which has
      been flagged for rebuild, this rebuild is automatically triggered.
      - **A flow is flagged for rebuild when...**
        1. ... you rename, move, create or delete notes or folders that have
           been or likely will be part of that flow.
        2. ... you have opened two overlapping flows and made changes within the
           overlapping regions. **\*IMPORTANT:** This really is **just a safety
           precaution** for accidental edits. It is not intended to be exploited
           in order to routinely work on overlap; **the mechanism will even
           become unstable** if a flow is being rebuilt while open in more than
           one leaf.\* So when textFlow tells you that your cursor is within an
           overlapping region, close the overlapping flows before you start
           editing.
        3. ... you edit a flow's source note directly (this includes edits where
           you only changed irrelevant front matter; sorry)
      - **All rebuilds are complete rebuilds:** The entire data structure in the
        background is recalculated, UUIDs are freshly generated, and the file is
        completely rewritten. This guarantees their and also makes the old and
        current version distinguishable to textFlow. This way you can be
        informed if you ever happen to `ctrl/cmd+z` your way back into an old
        version.
      - **To avoid excessive rebuilds:**
        - Only keep open flows that you are actively working on. Closing a flow
          with all its leaves is just one click in the switcher modal, and
          reopening is just as fast. Also consider keeping flows in separate
          workspaces.
        - Avoid working on overlapping regions.
        - Close all relevant flows before you
          - work on multiple source notes,
          - restructure a source folder,
          - do a lot of editing in your source notes' front matter.
6. **Rebuild checks for UUIDs in source notes:** If something goes wrong during
   a sync, it usually results in several regions with their UUIDs being copied
   into a single source note. Therefore the rebuild function checks notes for
   the UUIDs. If it finds one, it stops the rebuild and notifies you, so you can
   take care of that.
7. **textFlow's folder is protected:** The folder in which textFlow keeps your
   flows is hidden by default. You can unhide it if you want to open flows
   directly from there, though. textFlow is opinionated about what you are
   allowed to do in that folder and it will loudly revert changes it doesn't
   like.
8. **Checks for external edits of source notes:** If you regularly edit source
   notes on devices that can't run textflow (like your phone or tablet), you can
   have textFlow check
   - **time stamp of last modification** - this is fine for most use cases and
     the default setting
   - **time stamp and hash** - activate this if you get too many unnecessary
     rebuilds
   - **always hash** - useful if you don't trust your sync service or are
     working in a high-risk setting (i.e. with git or a 'smart'/storage saving /
     streaming sync service).

   **These automatic checks run**
   - for freshly opened flows,
   - when you interact with a flow after at least 5 minutes of inactivity
     (activating its leaf, scrolling or editing its content),
   - whenever you click into a new region (only for that region, though). In
     case it's important to you, you can also check all your flows manually via
     command.

   **IMPORTANT:** Of course these checks can only work if you give your sync
   service enough time to do its thing. So take care to wait for the sync of
   your vault to finish before you resume work.

9. **Manually mark for rebuild:** If you deactivate automatic checks, you can
   right-click on a note in file explorer and choose to have all flows
   containing that note marked for rebuild.
10. **Definition backup:** If you ever have to un/reinstall the plugin, you can
    create a backup of all your flow definitions. It will be stored as a .json
    file in textFlow's system folder.

<hr>

### 3. Limitations and known inconveniences

#### Mentioned stuff first:

#### **No manual sorting:**

- If the notes/folders in your file explorer are sorted manually, this can not
  be reflected in your flows. This is because textFlow uses Dataview, which
  accesses the alphanumeric file tree at the system level and not any sorting
  that happens at the UI level.
- If you absolutely don't want to number your folders and notes (it's so much
  more robust, though...), you can mirror your custom order in some bookmark
  groups and build your flows from there (I guess some of the manual sort
  plugins are based on bookmarks anyways). You can't use frontmatter to refine
  definitions based on bookmarks, though (at least not yet?).

**Embedded Flows and cursor tracking:** Since the content of embeds are
basically living inside their own, secondary editor, textFlow's cursor listener
can no longer 'see' where the cursor is when it's inside an embed. So when
you're just manually moving in between regions, in order for the navigation
dropdown and file explorer to show the correct region, you have to click once
outside of the embed.

**No automatic checks when editing bookmark groups:**

- Obsidian doesn't give notice when you edit a bookmark group. Therefore you
  have to manually flag/rebuild all flows effected by the changes. This is quick
  though, since you can use the command to flag all flows or the flowSwitcher
  modal to rebuild select ones.

**Reordering stuff in Outline:**

- Since the last section within in any region will contain the write locked
  UUID, this section can't be moved by drag'n'drop in Outline. All the stuff in
  between can be shuffled around like usual, though.

**The limitations of navigation via file explorer:**

1. **Focus:** Navigation relies on leaf focus, which is a fickle beast. So you
   have to click into the flow leaf and take a deep breath to allow the UI to
   settle before clicking into the file explorer. Subsequent clicks work most of
   the time, but sometimes you need to refocus with another click into the leaf.
   Sometimes the listener also just... goes on a strike for some reason? To fix
   that, you have to reload Obsidian.
2. **Interference:**
   1. **Multi-Select:** Multi selection via alt key works as expected, but multi
      selection via shift key tends to get confused about which element is the
      start of the selection. So if you need to select with shift, switch off
      the explorer listener in settings (there's also a command for that).
   2. **Other plugins:** If you are using other plugins which change the way
      clicks into the file explorer are handled, it's possible that some of it
      won't work anymore. So if you encounter problems there, try switching off
      textFlow's listener.

#### The other stuff:

1. **Necessary data duplication:** If you don't build your Flows from embeds,
   they are extra notes which repeat their source notes' contents; it's the only
   way this works. Your flows are all stored in a dedicated folder, though, the
   location of which you can choose in the settings. This folder is hidden by
   default. But if data duplication still makes your blood boil, this isn't the
   plugin for you and you may want to look into
   [Continuous Mode](https://github.com/gasparschott/obsidian-continuous-mode)
   or [sync-embeds](https://github.com/uthvah/sync-embeds/) instead.

#### Not my plugin's fault

1. **Implicit size limit for flows:** Obsidian handles open notes in memory, so
   having your entire quarter-million word epic open - wether in one flow or
   spread over several - will make the UI sluggish. So maybe keep the flows on
   the smaller side and only open what you actually need. For reference: Your
   unfinished 50.000 word novel is under 400kB, while a 250.000 word epos may
   crack 2MB.
2. **Alphabetical order is relative:** If you name files like 'basename',
   'basename 1', 'basename 2', they may be sorted like you'd expect in
   fileExplorer, but JavaScript considers 'basename' to come _after_ 'basename
   1' in the alphabet. So in your flow, all the numbered basename files will
   come before the naked basename file. Solution: 'basename 0'
3. **No auto-sync on closing Obsidian:** Onunload, Obsidian gives plugins barely
   enough time to clean up and save settings, let alone write entire files. But
   your Flows are always saved the way all notes are, so you can always sync
   when you open your vault again.
4. **textFlow's menu bar sometimes overlaps Editing Toolbar or the search bar or
   is being overlapped by the search bar:** Due to certain quirks of CSS and
   Obsidian, it isn't easy to have those elements coexist peacefully. The
   current state is the optimum of what I can achieve with my knowledge. You can
   always solve conflicts by min/maxing the menu bar, though.
   - The only exception: The minimised textFlow menu bar will always cover up
     bars that lie below it. But it's tiny and shouldn't interfere with
     functionality.

<hr>

### 4. Use cases

- You're an author and want to see/work on your various notes/chapters/scenes in
  context
- You want to be able to easily curate multiple contexts to focus on specific
  aspects of your work
- You want to turn the whole or specific excerpts of your work into a single
  file in order to share it with others
- You want to basically have Scrivenings in Obsidian

<hr>

### 5. Requirements and setup

- **Prerequisites:** The Dataview plugin needs to be installed in order for
  textFlow to work. Just open Obsidian's
  `Settings > Community plugins > Browse`, then search for `dataview`, click
  `Install`, then click `Activate` (both the same button).
- **Minimum Obsidian Version:** 1.4.0 (the first version with
  [properties](#how-to-properties))
  - There may be bug in at least one version older than 1.8.10 that prepends the
    note title to every note's content. If you see this issue in your flows,
    please let me know which version you are using so I can include this info
    here.
- **Installation without marketplace:** While the plugin hasn't been released to
  the marketplace yet, you can install it using BRAT or going the manual route:
  - **BRAT guide**: https://tfthacker.com/brat-quick-guide
  - **Manual install:**
    - Download the the `main.js`, `manifest.json` and `styles.css` from the
      release.
    - Create a folder `textFlow` in your vault's `.obsidian/plugins` folder (the
      internet will tell you how to make hidden folders visible).
    - Paste the files to there.
    - Reload your vault.
    - Go to Obsidian's `Settings > Community plugins` and search for textFlow.
    - Toggle to activate, then click the cog to get to the settings.
- **Install via marketplace:** Once textFlow is released to the market place:
  - Go to Obsidian `Settings > Community plugins > Browse`.
  - Search for textFlow, click`Install`, click `Activate`, then click `Options`
    (all the same button, just give it a second).

<hr>

### 6. Settings

- **textFlowSystemFolder location:** TextFlow needs a place for its (hidden by
  default) TextFlow_SystemFolder to store your flows. You can place this folder
  in any existing folder in your vault and move it later, if you change your
  mind.
- **Menu bar default:** What config do you want the menu bar to be displayed in
  for newly opened flows?
- **Access the flow switcher modal via...:** Where do you want to open the flow
  switcher from?
- **File explorer decoration:** How do you want the source notes of your active
  flows to be marked in file explorer?
- **Active region highlight style in file explorer:** Seven styles for you to
  choose from (including 'none').

- **More...**
  - **Enable navigation via file explorer:** There's also a command for this.
  - **Hide scrollbar:** Hide that twitchy fella. There's also a toggle command.
  - **Check for external edits:** In case you often work on devices which can't
    run textFlow, the plugin will look for external edits and rebuild flows
    accordingly.
  - **Show textFlowSystemFolder:** It's recommended to keep it hidden so you
    don't accidentally mess with it.

**Create a new flow**

- **Name your flow:** Names must be unique. They also can't contain certain
  characters because they need to serve as file names.
- **Include group/folder titles:** Some sort orders may work better or worse for
  you without those.
- \*\*Define your flow by...
  - **Dataview query:** Vanilla queries only, no JS.
  - **Folders, tags and [properties](#how-to-properties):** You can include
    and/or exclude.
  - **Bookmarks:** Here you can enter the name or path of a single bookmark
    group.
- **Sort order:** It's up to you wether you want to have your notes in the same
  order as they appear in the file explorer, or wether you'd rather have them
  follow the order of folders in the file explorer[\*](#no-manual-sorting). For
  bookmarks you can also choose to follow manual order, treating notes and
  groups as equals.
- **Preview:** This button opens a modal that will show you the group/folder
  titles and note names in the order in which they will appear in your flow.
  This way you can easily check if you like the result. You'll also see if your
  new flow will overlap with any other flows.
- **Save:** This saves the definition and builds your flow.
- **Clear values:** Resets the input mask.

**Your flows:**

- Here you'll see the three most important pieces of info about your existing
  flows
  - name
  - source
  - definition criteria
- **Rebuild:** This button assembles the flow note according to your definition.
  Use it in case something goes wrong with the menu bar or flow switcher.
- **Edit:** If you need to change something about the flow definition.
- **Delete:** This will delete the flow definition, flow note (if it exists) and
  any trace of them in the data structure (except for backups, which will
  deleted based on time stamp age).
- **Restore old flow definitions:** Here you can create a backup of your flow
  definitions and restore old definitions. The backup will be saved as .json
  file in textFlowSystemFolder. So it won't be visible in Obsidian.

<hr>

### 7. Commands

All commands can be tied to keyboard shortcuts (hotkeys) in Obsidian's settings.

- **Sync all leaves:** This also saves the current cursor position for all
  active leaves.
- **Rebuild flow in active leaf:** Sometimes you need a rebuild.
- **Restore last known cursor position:** Like it says on the tin.
- **Select active region:** Select the text of the active region in the active
  leaf.
- **Export flow in active leaf:** In case you don't like the menu bar button.

- **Open fuzzy navigation modal:** For your keyboard navigation.
- **Open flow switcher modal:** If you don't want to summon the modal with
  buttons, you can use this command instead.
- **Toggle menu bar:** Min/max the menu bar

- **Flag all flows for rebuild:** If you're not sure which notes you edited
  outside of Obsidian, or you are worried about forgetting one.
- **Check vault for external edits:** If you also want to have your inactive
  flows checked (automatic checks only run for your active flows and flows that
  are being opened).

- **Toggle scroll bar visibility:** So you can quickly switch it off when it's
  twitchy and back on when you need it.
- **Toggle explorer navigation:** If you need multi-select to work right, this
  command is your friend and ally.

<hr>

### 8. Getting started

#### Best practice

If you want to know why: [Safety features](#2-safety-features) /
[Limitations](#3-limitations-and-known-inconveniences)

1. Wait for the menu bar to be displayed and the warning triangle to disappear.
   Hover your pointer over the triangle for instructions if it doesn't disappear
   on its own.
2. Open as few flows in as few tabs as possible.
3. Only open and edit flows in Obsidian and while textFlow is active.

#### Quick tutorial

1. Install textFlow (see [Requirements and setup](#5-requirements-and-setup))
2. Open the settings and set up a system folder.
3. Read through the other settings if you like, but the default is the
   recommended setup for new users.
4. Scroll down to `Define a new flow`.
5. Make your selections and inputs, defining your flow either by bookmarks or by
   the notes' path, tag or other meta data.
6. Preview your creation and change or save it.
7. Close the settings tab and open the flow switcher modal.
8. Click one of the arrow buttons to open your flow.
9. Admire the view.
10. Click around the flow and see the navigation modal track your movements.
    Type something. Click the save button.
11. Open the source note to check if the save worked.
12. Stare in amazement (optional).

#### How to properties

- Open Obsidian's Settings > Core Plugins and activate 'Properties View'.
- Open a note of your choice.
- Type `cmd + p` to open the command palette and search for `properties`.
- You'll see the commands `Properties View: Show file properties` (and
  `Properties View: Show all properties`)
- Click it the first to open an overview of the properties for the note in the
  active leaf (or the second to see all properties that exist on any not in your
  vault).
- Now click the `Add property` button.
- There are some default properties to choose from - `tags`, `cssclasses`,
  and `aliases` - but you can also just click the the input field and start
  typing a property name.
- Afterwards, click the hamburger menu to the left to choose a type for your
  property. You can research what they mean, but the names are pretty self
  explanatory.
- You can also go to `Settings > Editor > Properties in document` and choose to
  have properties displayed at the top of you notes.
- I also warmly recommend the plugin
  ['Multi Properties' by technohiker](https://github.com/technohiker/obsidian-multi-properties).
  It allows you to set, remove and edit properties for multiple notes at once.

#### How to Fuzzy navigation modal

- Start your search term with one of the prefixes if you want to narrow its
  scope:
  - `?` for regions of the active flow,
  - `*` for regions of other flows,
  - `:` for flow names.
- Results for the flow in the active leaf always target the active leaf.
- Results for other flows try to target the last active leaf for the flow; if
  there's none, they open a new one.
- Results for flow names always open a new leaf.

<hr>

### 9. Fixing problems

Have you tried turning it off and on again?

- **close and reopen the problem flow**
- **rebuild the problem flow**
- **reload your vault**

If that didn't help and you also can't find your problem on this list,
[let me know](#12-report-a-bug--report-your-love).

**Table of Contents**

1. [Flow creation](#flow-creation)
2. [Flow switcher](#flow-switcher)
3. [Fuzzy navigation modal](#fuzzy-navigation-modal)
4. [Menu bar](#menu-bar)
5. [Flow / leaf](#flow--leaf)
6. [Weird problems](#weird-problems)
7. [More problems](#more-problems)

#### Flow creation

- **Problem**: I have defined a flow but some folders or notes are being
  ignored.
  - **Explanation:** Your file or folder names may contain disallowed characters
    that Dataview doesn't like.
  - **Solution**:
    - Replace the disallowed characters.
    - Don't forget to update your definition, if the root folder's name has been
      changed.

- **Problem:** I am trying to define a flow using a certain property, but it's
  being ignored.
  - **Explanation:** The property type is a list, but in a way that Dataview
    doesn't like.
  - **Solution:** Easiest fix:
    1. Make a base (Obsidian bases),
    2. put the property you want to edit as a column (click on Properties and
       select it)
    3. right-click the property name in the column header and set its type to
       text
    4. right-click the property again and set the type back to list.
    5. If that doesn't work, try going through the notes one by one, switching
       types back and forth.

- **Problem:** I bookmarked a folder but when I try to make a flow from that,
  textFlow says there's no notes in that folder.
  - **Solution:** You have to bookmark the notes within the folder. Before that
    you can create a new bookmarks group with the title of their folder you
    wanted to bookmark.
  - **TIP:** If you want to have a note in a second group, you have to open it
    and click 'Bookmark active tab' in the bookmark view.

- **Problem:** The notes in your flow preview are in a different order than the
  notes in your file explorer, even though you selected 'Notes' as sort order.
  - **Explanation:** textFlow goes by the order of the system level file tree
    (with JavaScript flavour), not by the UI layer.
  - **Solution:**
    - Are you using a plugin to manually sort your notes in the file explorer?
      - You're either going to have to number your notes to get the order right
        or mirror your desired sort order into a **bookmark group** and define
        your flows from there (there'll be no option to refine your flow via
        frontmatter, though)
    - Did you name your files 'basename', 'basename1', 'basename2'....?
      - JavaScript has its own alphabet, in which 'basename' comes _after_
        'basename1'. Also, 'basename10' comes directly after 'basename1'
      - To fix this, rename 'basename' to 'basename00', 'basename1' to
        'basename01' and so on.

#### Flow switcher

- **Problem:** A flow won't open even though it's shown in the switcher modal.
  - **Solution:**
    - Try rebuilding the flow and reloading your vault. If the rebuild button is
      greyed out, trigger the rebuild through the settings panel.
    - Reload Obsidian
    - If all that didn't work, delete the flow definition and recreate it.

- **Problem:** The modal is empty even though you have several flows defined.
  - **Solution:**
    - Check if your definitions really exist. Your sync may have deleted or
      corrupted textFlow's `data.json`
    - If the definitions are gone, you'll have to recreate them and redo the
      setup of the plugin.

#### Fuzzy navigation modal

- **Problem:** When I start a search with a question mark, no results are shown.
  - **Explanation:** The active leaf doesn't contain a flow, and thusly the
    modal can not return results for the active leaf.
  - **Solution:** Click into the leaf with the flow you wish to search in or
    start your search with the flow's name.

#### Menu bar

- **Problem:** The menu bar for one of your flows is only half rendered
  (optional: and the sync button is staying activated)
  - **Solution:**
    - Close the flow and rebuild it. If the rebuild button is greyed out, do it
      through the settings tab.

- **Problem:** textFlow's menu bar covers up Editing Toolbar by Cuman/covers the
  search input/is covered by the search input.
  - **Explanation:**
    - It's simply difficult to impossible to make elements which are attached
      close to each other to coexist peacefully.
  - **Solution:**
    - min/max the menu bar, it will make Editing Toolbar show up again.
    - If the menu bar isn't visible, use the command: `crtl/cmd + p`, then enter
      'menu bar'. You can also bind the command to a keyboard shortcut (in
      Obsidian's settings).

- **Problem:** textFlow's menu bar is always being covered by another toolbar.
- **Solution:** - Have the other toolbar be displayed in a different place or
  hide it completely.

- **Problem**: I clicked out of Obsidian while the navigation menu was expanded,
  and now it won't close when I click outside of it.
  - **Solution:** Yeah... Click an entry in the menu, that will get it back on
    track.

#### Flow / leaf

- **Problem:** The cursor is at the end of a region, right above a grey line,
  and it stopped moving??
  - **Solution:**
    - You found an invisible UUID! Some of the characters in there are
      zero-width, so the cursor stays in place while running through them.
    - To get out of this predicament, try the up or down arrow on your keyboard.

- **Problem:** The grey separation lines are now `<hr>` for some reason, also
  checkboxes and other markdown aren't being rendered?
  - **Solution:**
    - You've got yourself an unenclosed code block somewhere.
      - Maybe it's unintentional code, like `<blah`, then you just need to put a
        space between the pointy bracket and the letters: < blah.
      - But if it's a whole html style tag it needs to be enclose in back ticks
        (accent gràves). Either single ones, if you want to isolate just a
        word - like so: `<boolean>`, `<b>` - or three - ` ``` `- on the line
        above and the line below the text block for Obsidian to understand that
        it should not interpret anything written in that block.
      - Depending on the cause the three backticks may not work.

- **Problem:** You're trying to select an entire flow using `crtl+a`, but it
  doesn't work.
  - **Solution:**
    - Try again. It usually works on the second keypress.
    - But since you likely don't want to have a bunch of invisible UUIDs in your
      copied flow, export it instead (there's a button in the menu bar, and also
      a command). This will remove all UUIDs for you and you can handle the note
      without any restrictions.

#### Weird problems

- **Problem:** You did a find/replace for an invisible character in your
  mathematical paper and now textFlow can't find some of the invisible UUIDs for
  that note.
  - **Solution:** Rebuild your flow.
    - These are the invisible characters textFlow uses to make its UUIDs:
      - \u00A0 - No-Break Space
      - \u200B - Zero-width space
      - \u200C - Zero-width non-joiner
      - \u200D - Zero-width joiner
      - \u2060 - Word joiner
      - \u2061 - Function application
      - \u2062 - Invisible times
      - \u2063 - Invisible separator
      - \u2064 - Invisible plus
      - \uFEFF - Zero-width no-break space

- **Problem:** You input `ctrl/cmd+f` and but the search input doesn't show up.
  - **Solution:**
    - Sometimes search and menu bar get in each other's way and the menu bar
      covers up the search input.
    - Close the menu bar and the search input will show up again.

- **Problem:** textFlow wants you to sync a flow, but when you click the button,
  nothing happens, and you can't rebuild the flow while it has unsynced edits.
  - **Solution:**
    - Did you just fix a sync screwup?
    - Open Obsidian's settings and go to textFlow's settings tab. Here you can
      always rebuild your flows, no matter the sync status.

- **Problem:** With every new rebuild, the title of your notes is added to their
  contents.
  - **Solution:**
    - This is either a problem with your setup or a bug in one (or more) of
      Obsidian's versions. Update the app to 1.8.10 to guarantee that it's not
      Obsidian.
    - If the error still occurs, disable all your plugins and reenable them one
      by one while doing rebuilds to test which one is the culprit
      ([let me know who it was](#12-report-a-bug--report-your-love)).

- **Problem:** Navigation via file explorer doesn't work even though it's
  definitely toggled on.
  - **Solution:**
    - Check if your flow definitions are still there.

#### More problems

- **Problem:** You opened a flow and now Obsidian is super sluggish.
  - **Solution:** Obsidian has an implicit size limit for notes and can't really
    handle 2MB or more at the same time.
  - Close the big flow, reload your vault to clear Obsidian's working memory,
    then redefine the flow to be smaller.

- **Problem:** Something else is going on and rebuilding/reloading doesn't help.
  - **Solution:** [Send-me-a-bug-report](#12-report-a-bug--report-your-love)

<hr>

### 10. Cheat sheet

**Lingo and concepts used by textFlow**

- **Basic idea:** textFlow copies the contents of certain (source) notes into a
  new note (a flow), then syncs things you change within that new note back into
  the source notes. That's it. That's the plugin. Still needs a 6.000+ word
  Readme, though, apparently.
- **Frontmatter:** Also called YAML or [properties](#how-to-properties).
  Metadata that you can add to notes in Obsidian. You can use frontmatter to
  make very specific flows. Your source notes' frontmatter is _not_ included in
  flows, but you can add frontmatter to any of your flows as a whole, if you
  want.
- **Invisible UUID:** A long string of various non-printing and mostly
  zero-width characters used to represent the base16 UUID that is generated for
  each source note when it is included into a flow. See also: Region.
- **Leaf:** A leaf is basically just what Obsidian calls a tab.
- **Overlap:** An overlap happens when two or more flows are made up of some of
  the same source notes. If you open several overlapping flows and edit text in
  the region of overlap, this can cause frequent rebuilds and problems with
  Tracking.
- **Rebuild:** The process of transferring content from source notes into flows.
  This process checks source notes for UUIDs, generates a new UUID for each note
  and constructs and writes a completely new flow. This is why it can take up to
  a few seconds for long flows.
- **Region:** The contents of any single note within a flow. Regions are
  separated by invisible UUIDs and grey lines, so textFlow can attribute your
  edits to the correct note and sync them back to it.
- **Tracking:** textFlow attaches three compartments with extensions to every
  leaf that contains a flow:
  1.  A cursor listener, so textFlow knows, where im Flow your are. This
      listener calls a function which looks for UUIDs, to see which region you
      are in.
  2.  An update listener for the document in the editor, so textFlow notices
      when you edit a region. This listener calls a function that saves to
      `/.obsidian/plugins/textFlow/data.json` which region was edited.
  3.  A transaction filter which continually checks the 60 characters before and
      after the cursor for UUIDs - using a regEx - to see if the cursor is
      touching a UUID. If the test returns true, all transactions are blocked,
      thus protecting the UUID. **This tracking does _not_ send any data to any
      servers!** textFlow doesn't even know the internet exists.

<hr>

### 11 Comparing textFlow and Outline

Obsidian already offers a way of browsing through a single, large document in
the form of the core plugin 'Outline' - so when is textFlow worth a try? And
when should you use both together?

**The advantages of textFlow, aka the reasons why I wrote this plugin (ascending
order):**

- **Automation and Flexibility:**
  - With textFlow you can work on a dozen of differently composed excerpts of
    your vault without ever having to copy/paste anything by hand, missing
    parts, forgetting to update or getting confused as to which excerpt has
    which edit, because textFlow handles it all for you.
- **Snapshots:**
  - With Outline, if you want to take a snapshot of a certain part of your
    document, you have to copy-paste it out into a new document and title it by
    hand.
  - With textFlow, your source notes all still exist; just take a snapshot (try
    ['Backitup' by hammadXP](https://github.com/hammadxp/back-it-up) - best used
    together with
    ['Diff view' by Till Friebe](https://github.com/friebetill/obsidian-file-diff)
    to compare and selectively restore).
- **File explorer:**
  - The plugin
    ['Quiet outline' by guopenghui](https://github.com/guopenghui/obsidian-quiet-outline)
    allows you to decorate headlines in Outline and to auto-expand the
    headline(s) under which you are working. But to change the deco, you have to
    browse your document instead of just clicking on note titles in a sidebar.
    And if you prefer a specific set of headlines to be expanded, you have to
    remake your workspace every time you reload your vault.

**The advantages of Outline, aka why you might disagree with my reasons:**

- No data duplication the way textFlow necessitates.
- You can open and edit your note in whatever editor you want.
- You can drag and drop to change the order of all sections throughout the
  document, whereas with textFlow, you have to rename source notes to change
  their order.
- Navigating through headlines is much more sturdy and reliable than textFlow's
  navigation via file explorer
- You'll never have to wait for a rebuild to complete.

**Together they shine:**

- But why choose when you can just use both for their greatest strengths -
  textFlow to create flexible documents and Outline to granularly navigate them.

<hr>

### 12. Report a bug / Report your love

If you encounter any bugs or weird behaviour that the chapter on
[fixing problems](#9-fixing-problems) doesn't cover, hit me up on github:
https://github.com/tine-schreibt/textFlow/issues You can also send the report
via email: tine at tine-schreibt dot de.

If you just love this plugin and got some coin to spare, you can tip me on
Ko-fi: https://ko-fi.com/tine_schreibt
