# en_Readme

<hr>

### TL;DR 

**textFlow** lets you define flows - dynamic documents built from the contents
of multiple notes - and edit them, with changes being tracked and automatically
synced back to their sources. It's intended mainly for long form writers, but
can be used by anyone who wants to see or work on multiple notes in context.
Basically, textFlow is an attempt to bring Scrivenings to Obsidian - intuitive,
flexible and easy to integrate into most workflows, whether you prefer the
keyboard or the mouse.

That being advertisement speech'd: Under the hood textFlow is still just one big
workaround for the fact that Obsidian is explicitly intended to be used with
lots of small notes. And while textFlow arguably does its thing with a certain
grace, it has its limitations and inconveniences which are explained by this
readme. Or do they explain this readme? I guess both...

Also, this thing is new, so not all quirks are known/fixed yet. If you find
anything not mentioned in this Readme
[let me know](#12-report-a-bug-report-your-love).

_Please consider running Obsidian's own data recovery plugin or 'Edit history'
by Antonio Tejada until you've gotten into a groove with textFlow._

**Still want to jump right in?**

- [Requirements and setup](#5-requirements-and-setup)
- [Getting started](#8-getting-started)
- [Fixing problems](#9-fixing-problems)

**Want to know what you're getting first and understand how to use textFlow
safely?**

1. [Feature features](#1-feature-features) (including
   [Tips and tricks](#tips-and-tricks))
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
12. [Report a bug / report your love](#12-report-a-bug-report-your-love) ​​​

<hr>

### 1. Feature features

##### Already implemented:

1. **Build 'smart' flows:** Select notes by using bookmark groups or folders,
   tags and [properties](#How-to-properties) as in/exclusion criteria and have
   textFlow stitch them into a single note (a flow). When you move, add, or
   delete a note (or folder) in your bookmarks or vault, textFlow will register
   these actions and automatically rebuild the relevant flow to reflect the
   changes. If you change a note's front matter so it gets included in a new
   flow, you will have to rebuild manually.
2. **Structure your flows:**
   - Flows built from folders, tags or properties have two sorting options:
     1. Mirror the order of your _notes_ as they appear in the file explorer.
     2. Mirror the order of your _folders_ as they appear in the file explorer.
   - Flows built from bookmark groups can also mirror the plain order of objects
     regardless if they are notes or groups. Use whatever order feels more
     intuitive/less confusing to you or fits better for the respective flow.
     Some sort orders also work better with folder/group title deactivated.
3. **Edit flows like any other note:** textFlow keeps track of which region an
   edit happens in and automatically syncs it all back to the correct source
   note whenever you click outside of your editor window (leaf).
4. **Add frontmatter to your flows:** Just use the properties plugin as usual.
   It will be preserved across rebuilds and is useful if you want to keep track
   of your flows without having to use the settings tab.
5. **A flow is really just an ordinary note with some listeners and extensions
   attached:** So _everything will still work within your flows_: Your themes
   still work. Inline-styles still work. Dataview tables will be displayed as
   usual. Outline still works
   - [for the most part](#3-limitations-and-known-inconveniences)
. In-note
   search still works. Callouts, lists, code blocks, tables, tabs, it all still
   works. Because, again, a flow is just a normal note with some API bling stuck
   on.
6. **Manually sync back to source:** It's not strictly necessary <small>(except
   before you close Obsidian using hotkeys)</small>, but I know that feel - so
   you can sync any time you like.
7. **Navigate within flows via the file explorer:** Yup. I know! It even
   highlights the active region's source note in one of four styles!
   [It's not perfect, though...](#4-limitations-and-known-inconveniences)
8. **Navigate via fuzzy navigation modal:** If you're used to working with
   Obsidian's Quick switcher modal, you'll be right at home here - with some
   handy tricks included:
   - prefix `?` to limit your search to the flow in the active leaf
   - prefix `*` to search in all flows that are _not_ the active one
   - prefix `:` to search only flow names
   - use no prefix at all if you want to just search everything, including
     leafIDs and cursor positions
   - the placeholder text in the input field shows you all of that information
     about the currently active leaf (if it contains a flow) - flow name, active
     region, leafID and current cursor position Details on how to navigate using
     the modal: [How to Fuzzy navigation modal](#How-to-Fuzzy-navigation-modal)
9. **Convenience in a menu bar:** If you prefer buttons, textFlow has with a
   neat little (hidable) menu bar for you. In it you'll find a sync and a
   rebuild button and also:
   1. **A navigation menu**: This dropdown makes it easy to navigate disjointed
      flows, or if the fickle focus thing is too frustrating for you. The menu
      also sports a fuzzy search to help you get around huge flows faster.
   2. **Your cursor history:** textFlow saves the last five cursor positions for
      the newest five leaves (updated with every sync) and there's a button as
      well as a command to restore the last known cursor position for a leaf.
   3. **An export button:** This button makes a copy of your flow with all the
      UUIDs stripped out. It will be put in your root folder and named
      `${flowName}_${yyyy-mm-dd_hh-mm}.md`.
   4. **A button to select the active region:** In case you want to do some
      copy/paste surgery. There's a command for this, too.
   5. **A min/max toggle:** There's a button to minimise/maximise the menu bar,
      in case you like to click your UI. There's also a command to toggle the
      menu bar on/off completely, in case you're more the typing type.
10. **Convenience in a switcher modal:** In the flow switcher modal you've got
    buttons to:
    - open flows in a new tab or split
    - switch between a flow's tabs
    - quickly close multiple flow tabs
    - rebuild inactive flows
11. **A language file:** There's an Englisch and German version already. If you
    want to contribute another language, let me know.

##### Maybe coming in the future if enough people ask for it:

- **Favourites for the switcher modal:** In case you have a gazillion flows,
  need help staying on top of them, and frontmatter/dataview seem scary to you.
- **Open wiki-links inside flow:** This would be a right-click thing, I guess.
- **Custom name for system folder:** It's not hard to do in principle, I just
  don't feel like doing it right now.

### Tips and tricks

- To make a quick flow 'on the go':
  - select the notes you want to include in your flow
  - tag them with the flow name you'll want to give them
  - (use 'Multi Properties' by fez-github if they are multiple consecutive
    notes)
  - build a flow from that tag
- To return to where you were after looking up something elsewhere in the flow:
  - before you move, click into the text and do a manual sync to save that
    cursor position
  - go to the other place
  - click the target button in the menu bar or use the hotkey to return to the
    last know cursor position, which is where you synced just then

<hr>

### 2. Safety features

1. **Your understanding that this plugin is complex and that Obsidian and
   CodeMirror may need a second to set up a flow leaf:** So you give them that
   second to process stuff and don't click spam - for example - to open several
   new flow leaves in quick succession. Just take a deep breath in between
   clicks.
2. **Write protection**
   1. **Invisible UUIDs:** UUIDs are random strings of 46 non-printing
      characters that textFlow inserts at the end of each source note's content
      to track the cursor's position relative to them. They are write protected
      to guarantee their (and thus your flow's and source notes') integrity.
      This is the reason why...**\*\***
      - **... it is _never safe_ to edit a flow outside of textFlow's context.**
        You might damage the UUIDs, thus screwing up subsequent syncs. At best
        you'll have to do some tedious picking apart of mushed-together regions,
        at worst you will lose some of your data.
      - **... it is _never safe_ to open a flow in a text editor other than
        Obsidian.** Some text editors by default delete non-printing characters,
        such as the ones that UUIDs are made up of. And you already know what
        that would lead to.
   2. **Flows are write protected during syncs and rebuilds**. This is to avoid
      accidentally corrupting your data during the process.
3. **Flows are saved by Obsidian:** Since flows are just ordinary notes as far
   as Obsidian is concerned, they are saved the same way all your other notes
   are. Meaning your work is as safe within your flow as it would be within any
   other note.
4. **Automation:**
   1. **Auto-sync:** Whenever you click into/out of a leaf (tab), all new edits
      are automatically synced back to source. That's aggressive but necessary.
      <small>(If it scares you, you can use Obsidian's data restoration plugin -
      or 'Edit history' by Antonio Tejada, which allows for an even more
      granular history. Functionality to compare and selectively restore is
      built-in for both plugins.) </small>)
   2. **Auto-rebuild:** Whenever you focus a leaf that holds a flow which has
      been flagged for rebuild, this rebuild is automatically triggered.
      - **A flow is flagged for rebuild when...**
        1. ... you rename, move, create or delete stuff that has been or likely
           will be* part of that flow, <small>(* due to the folder it's in, not
           due to its frontmatter)</small>
        2. ... you have two overlapping flows active and make changes within the
           overlapping regions (they're marked in the navigation dropdown, or
           you get a notification when entering an overlap), **\*IMPORTANT:**
           This really is **just a safety precaution** for accidental edits and
           not intended to be exploited in order to routinely work on overlap;
           **it will even become unstable** if a flow is being rebuilt while
           open in more than one leaf, leading to screw-ups with tracking and
           syncing.\*
        3. ... you edit a flow's source note directly (this includes edits where
           you only changed irrelevant front matter; sorry)
        4. ... **but not** when you edit a non-source note's front matter in a
           way that makes it now fit a flow's definition. Here you have to
           remember to rebuild yourself.
      - **All rebuilds are complete rebuilds:** The entire data structure in the
        background is recalculated, and the file is completely rewritten, so
        they're always in agreement with each other and your source notes. This
        also means that large rebuilds may take a moment.
      - **To avoid excessive rebuilds:**
        - Only keep flows open that you are actively working on. Closing a flow
          with all its leaves is just one click in the switcher modal, and all
          your cursor positions are saved for up to five different leaves and
          available for navigation in the menu bar/via hotkey once you reopen
          the flow. Also consider keeping different flows in separate
          workspaces.
        - Aim to keep the amount of overlap between your flows small and/or
          avoid working on overlapping regions.
        - Close all your flows before you
          - do extensive work on source notes,
          - restructure your vault,
          - do a lot of editing in your source notes' front matter.
5. **Rebuild checks for UUIDs in source notes:** If something goes wrong during
   a sync, it usually results in several regions being copied into a single
   source note. Therefore the rebuild function checks notes for the UUIDs that
   can thus land within source notes. It will stop the rebuild and notify you,
   so you can take care of that.
6. **No stale edits in inactive flows:** When you close a flow completely (all
   its leaves), there's an automatic sync action performed. This is to prevent
   stale versions which might overwrite newer edits from any overlapping flows.
   If you want to keep an old version of a region, take a snapshot of the source
   note before you start to edit <small>(try 'Backitup' by hammadXP - best used
   together with 'Diff view' by Till Friebe to compare and selectively
   restore)</small>.
7. **Sensitive stuff is hidden:** The folder in which textFlow keeps your flows
   is hidden by default, so you don't screw with it. You can unhide it, though,
   if you want to open flows directly from there. Just don't rename them.
8. **State indicators:** The flow switcher modal indicates required rebuilds for
   flows. Also, you'll see indicators for pending syncs in the menu bar and - if
   you choose - the file explorer.
9. **Checks for external edits of source notes:** If you regularly edit source
   notes on devices that can't run textflow (like your phone or tablet), you can
   have textFlow check
   - **time stamp of last modification** - this is fine for most use cases and
     the default setting
   - **time stamp and hash** - activate this if you get too many unnecessary
     rebuilds
   - **always hash** - only useful if you don't trust your sync service or are
     working in a high-risk setting (with git or a 'smart'/storage saving sync
     service) **These automatic checks run**
   - for freshly opened flows,
   - if you interact with a flow after at least 5 minutes of inactivity
     (activating a leaf or editing content),
   - and whenever you click into a new region (only for that region, though). In
     case it's important to you you can also check all your flows - active as
     well as inactive - manually via command. **IMPORTANT:** Checks only work if
     you give your sync service enough time to do its thing! So take care to
     wait for the sync to your vault to finish before you resume work.
10. **Manually mark for rebuild:** If you deactivate automatic checks, you can
    still right-click on a note in file explorer and have all flows containing
    it marked for rebuild. There will also be a command to blanket-mark all your
    flows for rebuild.
11. **Definition backup:** Whenever you create or edit a flow definition, a copy
    of that definition will be saved together with a timestamp (up to three
    versions per flow), so you can restore old definitions. If you ever have to
    un/reinstall the plugin, you can store that file in your vault's root folder
    temporarily (you won't be able to see it in Obsidian, though, since it's a
    `.json` file). Upon restarting the plugin the file will be automatically
    read and then deleted from your vault. So you can quickly restore all your
    flow definitions via the modal.

<hr>

### 3. Limitations and known inconveniences

#### Mentioned stuff first:

**Reordering stuff in Outline:** Since the last section within in any region
will contain the write locked UUID, this headline can't be moved by dragondrop
in the Outline. All the stuff in between can be shuffled around like usual,
though.

**The problems with navigation via file explorer:**

1. **Focus:** Navigation relies on leaf focus - which is a fickle beast. So you
   have to click into the flow leaf and take a deep breath to allow the UI to
   settle before clicking into the file explorer. Subsequent clicks work most of
   the time, but sometimes you need to refocus with another click into the leaf.
2. **Interference:**
   1. **Multi-select:** To make navigation work without UI twitches, textFlow
      catches clicks and prevents all default behaviour. This causes
      multi-select to still work, but with a few bugs. To ease the pain, there's
      a command to turn off the click listener -
      `textFlow: Toggle explorer navigation`. So if you need the normal
      behaviour back, it's right there in the command palette / your hotkeys.
   2. **Other plugins:** If you are using other plugins which change the way
      left-clicks into the file explorer are handled, there will likely be
      interference from textFlow's prevendDefault functionality. So if you
      encounter problems there, try switching off textFlow's listener the same
      way you would for multi-select.

#### The other stuff sorted by category:

##### Things you can do but that will screw up your undo history even more than you are used to:

1. **Open a flow in multiple leaves and edit it in more than one:** You can open
   a single flow in as many leaves as you want and edit a different region in
   each; every edit will still be tracked and synced.
   - **But:** There is essentially just one single undo history for all those
     leaves, so if you switch between editing region1 in leaf1 and region2 in
     leaf2, their undo histories will be inextricably intertwined (mixed
     together).
   - **So instead:** Make smaller flows that each contain only one of the
     regions you want to work on - by chapter or act for example, or by
     narrative thread. Or if you have to work on multiple scenes that are quite
     close together, consider just opening them as single notes.
2. **Open overlapping flows and edit the overlap aka rebuild active flows:** You
   can open overlapping flows and also edit the regions where they overlap.
   Auto-rebuild will ensure that no edit gets lost. **IMPORTANT:** This is
   **just a safety precaution** for accidental edits and not intended to be
   exploited in order to routinely work on overlap; **it will even become
   unstable** if a flow is being rebuilt while open in more than one leaf,
   leading to screwups with tracking and saving.\*
   - **Also:** Even if you open just two overlapping flows in a single leaf
     each, surprise, the undo history will be rendered useless. This time
     because you can't undo your way past the rebuild without screwing up region
     tracking. I'd even block undoing your way there, but CodeMirror 6 doesn't
     seem to have an API for that. So instead I send you a toast with info on
     how to proceed (redo your way back onto the other side or rebuild the flow
     if you already screwed up).
   - **So instead:** Do not undo past rebuild boundaries and do not edit
     overlapping regions, _especially not_ in multiple leaves. The overlap is
     marked in the navigation dropdown so you can avoid it. Also, maybe smaller
     flows will help here.
3. **Edit a source note while its flow is active:** Auto-sync and auto-rebuild
   will take care that no edit is lost.
   - **But:** Staying on topic... Once you edit the source, the flow will be
     marked for rebuild, and as soon as you focus the flow's leaf, it will be
     rebuilt and the history before this point is lost. The source note's undo
     history remains unscathed, though, and if you undo, that counts as a
     rebuild reason, so it will be reflected in your flow.
   - **Still, instead:** Just edit the region within the flow or close the flow
     before you get going.

##### Further limitations

1. **Necessary data duplication:** Flows are extra notes which repeat their
   source notes' contents ; it's the only way this works. So if data duplication
   makes your blood boil, this isn't the plugin for you.
2. **Flows can NOT be safely opened in other text editors:** The non-printing
   characters that comprise the invisible UUIDs used to delineate regions within
   a flow are deleted by default by some text editors. So merely opening a flow
   in one of those will destroy region tracking, even if you don't edit the flow
   anywhere near a region boundary.
3. **No manual sorting:** If you use a plugin to manually sort your notes in
   file explorer, sorry, textFlow goes by the the actual file tree, not any
   sorting that happens at the UI level. If you absolutely don't want to number
   your folders and notes (it's so much more robust, though), mirror your custom
   order in some bookmark groups and build your flows from there (I guess some
   of the manual sort plugins make you do that anyways). You can't use
   frontmatter to refine definitions based on bookmarks, though.
4. **Wiki-links don't work:** Right now wiki-links don't work inside of flows. I
   might fix it some day, maybe, if enough people ask for it.
5. **No extra stuff in reading mode:** textFlow is an editing tool, so there is
   nothing specially implemented to work with reading mode.

##### Known inconveniences

1. **Rebuilds may take a moment:** Especially for large flows. So you might have
   to wait a hot second when you switch leaves and trigger a rebuild. There's a
   little progress bar, though, so yay.
2. **Creation of new notes:** If you tell Obsidian to create new notes in the
   same folder as the currently active note, this will lead to new notes being
   created in textFlow's system folder, if you have a flow note active at the
   time of creating. This is annoying, especially if you have the system folder
   hidden. Therefore I have created a command accessible via right-click onto
   any note or folder in the file explorer:
   `textFlow: Create a new note in this folder`. This will do what it says and -
   I think - be useful in general. The new file will be called `_untitled`, so
   it appears at the top of the folder.

##### Not my plugin's fault (I think), but still... (I got workarounds for some of those)

Sorted in no particular order:

1. **Some things need time to settle:** Leaf focus isn't the only thing about
   Obsidian (and CodeMirror) that sometimes needs a second to settle. So if
   something seems buggy, try doing it again, but slower. If it still seems
   buggy, hit me up on [github](#12-report-a-bug-report-your-love).
2. **Twitchy scroll bar:** If you are in the middle of a wall of text with no
   headlines or other separators in sight, the scroll bar handle will start to
   twitch - because... ask the CodeMirror community. If that bothers you and
   your theme doesn't allow for hiding the scroll bar, just use the toggle in
   textFlow's settings.
3. **Implicit size limit for flows:** Obsidian handles open notes in memory, so
   having your entire quarter-million word epic open - wether in one flow or
   spread over several - will make the UI a bit sluggish. So maybe keep the
   flows on the smaller side and only open what you actually need. Also:
4. **Full writes of flows:** Obsidian doesn't do partial updates of files. So if
   you have a large flow, Obsidian will write that entire thing, top to bottom,
   over and over while you edit it. _This is not a problem for modern SSDs_, but
   if you're working with a very small, very old SSD, you, again, may want to
   keep your flows on the less large side. (For reference: Your unfinished
   50.000 word novel is under 400kB, while a 250.000 word epos may crack 2MB)
5. **No auto-sync on closing Obsidian:** Onunload, Obsidian gives plugins barely
   enough time to clean up and save settings. So you'll have to manually
   sync/rebuild last thing before you close your vault, if you use ctrl/cmd+q to
   do so (and don't trigger blur which would sync before Obsidian has a chance
   to shut down). Flows and sources are always saved as separate notes, though,
   so you can always sync/rebuild when you open your vault again.
6. **Alphabetical order is relative:** If you name files like 'basename',
   'basename 1', 'basename 2', they may be sorted like you'd expect in
   fileExplorer, but JavaScript considers 'basename' to come _after_ 'basename
   1' in the alphabet. So in your flow, all the numbered basename files will
   come before the naked basename file. Solution: 'basename 0'
7. **'Editing toolbar' overlaps textFlow menu bar:** If you're using the plugin
   'Editing toolbar' by Cuman set in the 'top' position, you will notice that it
   covers up most of textFlow's menu bar. I've spent several hours vainly trying
   to work around this without introducing bugs to my menu bar.
   [The result](#9-fixing-problems)

<hr>

### 4. Use cases

#### 1. Maximal use

- You have every chapter or act of your book in a flow and do all your work
  there.
- You only use your source notes for their frontmatter and to shuttle edits from
  your main work flows into the more disjointed ones you use to focus in on a
  particular aspect of your text.
- You maybe use textFlow in combination with
  [Outline](#comparing-textflow-and-outline), and the various safety features
  and indicators help you trust that your work is safe with textFlow.

#### 2. Minimal use

- You do all your work in single notes and only use textFlow occasionally to see
  them in context or to export them for someone else to see.
- Some of the visual UI features are unnecessary for you, so you turn them off.
- textFlow stays in the background and doesn't get in your way.

#### 3. Medium use

- You so something in between the two other use cases, switching work methods as
  it suits you, your work phase and your project.
- You do you.
- Go live your best life.

<hr>

### 5. Requirements and setup

- **Prerequisites:** The Dataview plugin needs to be installed in order for
  textFlow to work. Just open Obsidian's
  `Settings > Community plugins > Browse`, then search for `dataview`, click
  `Install`, then click `Activate` (both the same button).
- **Minimum Obsidian Version:** 1.4.0 (the first version with
  [properties](#how-to-properties))
  - There may be bug in at least one version older than 1.8.10 that prepends the
    note title to note content. If you see this issue in your flows, please let
    me know which version you are using so I can include this info here.
- **Install via BRAT:** While the plugin isn't released to the market place, you
  can only install it manually or using BRAT.
  - **BRAT guide**: https://tfthacker.com/brat-quick-guide
  - **Manual install:** Download the the `main.js`, `manifest.json` and
    `styles.css` from the release. Create a folder `textFlow` in your vault's
    `.obsidian/plugins` folder and past the files there. Reload your vault. Go
    to Obsidian's `Settings > Community plugins`. Search for textFlow. Toggle to
    activate, then click the cog to get to the settings.
- **Install via marketplace:** Once textFlow is released to the market place: Go
  to Obsidian `Settings > Community plugins > Browse`, search for textFlow,
  click`Install`, click `Activate`, then click `Options` (all the same button,
  just give it a second).

<hr>

### 6. Settings

- **Basic settings**

  - **Choose a place for textFlow's stuff:** TextFlow needs a place for its
    (hidden by default) TextFlow_SystemFolder to store your flows. You can place
    this folder in any existing folder in your vault and move it later, if you
    change your mind.
  - **Place flow switcher modal:** Where do you want to open the flow switcher
    from?
  - **Choose file explorer deco:** Some cute Unicode characters to mark source
    notes of your currently active flows. Also indicates unsynced edits. Can be
    hidden.
  - **Choose active region highlighting style:** Four styles for you to choose
    from.

- **Advanced settings**
  - **Hide explorer decoration:** In case you don't want to see it right now.
    There's also a command for this.
  - **Disable navigation via file explorer:** Toggle this if you need
    multi-select to work properly or want to open source notes in new tabs with
    a simple left-click. There's also a command for this.
  - **Hide scrollbar:** Hide that twitchy fella - either on flows or everywhere
    (which includes file explorer, outline, tag view etc.). There's a toggle
    command for all/none.
  - **Check for external edits:** In case you often work on devices which can't
    run textFlow, the plugin will look for external edits and rebuild flows
    accordingly.
  - **Hide textFlowSystemFolder:** It's recommended to keep it hidden so you
    don't accidentally mess with it.

**Create a new flow**

- **Name your flow:** Names must be unique. They also can't contain certain
  characters because they need to serve as file names.
- **Include folder/group titles:** Some sort orders may work better or worse for
  you without those.
- **Define your flow by...**
  - **Bookmarks:** Here you can enter the name or path of a single bookmark
    group. To exclude subgroups, just end the path with a `/`
  - **Paths, tags and [properties](#how-to-properties):** You can include or
    exclude. You can add a value to your properties. However, the logic is
    basic, so if you want an elaborate definition, you'll have to use dataview
    to define a query and then tag the results to replicate it by including this
    tag.
- **Sort order:** It's up to you wether you want to have your notes in the same
  order as they appear in the file explorer, or wether you'd rather have them
  follow the order of folders in the file explorer. For bookmarks you can also
  choose to follow manual order, treating notes and groups as equals.
- **Preview:** This button opens a modal that will show you the folder/group
  titles and note names in the order in which they will appear in your flow.
  This way you can easily check if you like the result. You'll also see if your
  new flow will overlap with any other flows.
- **Save:** This only saves the definition to the plugin settings. The actual
  building of the flow file is another step.
- **Clear values:** This resets the input mask.

**Your flows:**

- Here you'll see the three most important pieces of info about your existing
  flows
  - name
  - source
  - definition criteria
- **(Re)build:** This button assembles the flow note according to your
  definition. It's also useful to get rid of a bunch of error messages since it
  also recreates most of the flow's data structure in the background.
- **Edit:** If you need to change something about the flow definition.
- **Delete:** This will delete the flow definition, flow note (if it exists) and
  any trace of them in the data structure (except for backups, which will
  deleted based on time stamp age).

<hr>

### 7. Commands

All commands can be tied to hotkeys in Obsidian's settings.

- **Sync all leaves:** This also saves the current cursor position for all
  active leaves.
- Depending on your settings (check for external edits enabled or not):
  - **Flag all flows for rebuild:** If you're not sure which notes you edited
    outside of Obsidian, or you are worried about forgetting one.
  - **Check vault for external edits:** If you also want to have your inactive
    flows checked (automatic checks only run for your active flows)
- **Open fuzzy navigation modal:** For your keyboard navigation.
- **Open flow switcher modal:** If you don't want to summon the modal with
  buttons, you can use this command instead.
- **Toggle menu bar:** This command allows you to completely hide / summon the
  menu bar. It also helps, should the bar ever fail to refresh.
- **Restore last known cursor position:** Like it says on the tin.
- **Select active region:** Select the text of the active region in the active
  leaf.
- **Toggle scroll bar visibility:** So you can quickly switch it off when it's
  twitchy and back on when you need it.
- **Toggle explorer navigation:** If you need multi-select to work right, this
  command is your friend and ally.

<hr>

### 8. Getting started

#### Best practice

If you want to know why: [Safety features](#2-safety-features) /
[Limitations](#4-limitations-and-known-inconveniences)

- Go slooow when opening multiple new flow leaves, but also in general.
- Only ever open and edit flows in Obsidian and while textFlow is active.
- Only edit regions that do not overlap with other active flows.
- If you edit your source notes on devices that can't run textFlow, activate
  checks for external edits in the settings.

#### Quick tutorial

1. Install textFlow (see [Requirements and setup](#5-requirements-and-setup))
2. Open the settings and set up a system folder.
3. Read through the other settings if you like, though the default is the
   recommended setup for new users.
4. Scroll down to `Create a new flow`.
5. Make your selections and inputs, defining your flow either by bookmarks or by
   the notes' path, tag or other meta data.
6. Preview your creation, then save it.
7. (Re)build the flow.
8. Close the settings tab and open the flow switcher modal.
9. Click one of the arrow buttons to open your flow.
10. Admire the view.
11. Click around the flow and see the navigation modal track your movements.
    Type something. Click the save button.
12. Open the source note to check if the save worked.
13. Stare in amazement (optional).

#### How to properties

- Go to `Settings > Editor > Properties in document` and choose `visible`
- Type `cmd + p` to open the command palette.
- Type the word `properties`.
- You'll see the command `Show file properties`
- Click it to open an overview of the properties for the note in the active
  leaf.
- Now click the `Add property` button. This calls a little modal that offers
  some property types to choose from, but you can also just click into the input
  field and start typing a property name.
- Afterwards, click the hamburger menu to the left to choose a type for your
  property. You can research what they mean, but the names are pretty self
  explanatory
- I warmly recommend the plugin 'Multi Properties' by fez-github. It allows you
  to set, remove and edit properties for multiple notes at once.

#### How to Fuzzy navigation modal

**Here's what the entries will look like**

- General structure:
  - `flowName: prefix path/to/region - crs cursor position (leafID)`
- Examples:
  - **Region** of the flow in the active leaf:
    - `ActiveFlowName: ? path/to/region `
  - **Saved cursor position** for the flow in the active leaf:
    - `ActiveFlowName: ? path/to/region - crs 123456 (1a2b3)`
  - **Region** for another flow:
    - `OtherFlowName: \* path/to/region
  - **Saved cursor position** for a region of another flow:
    - `OtherFlowName: * path/to/region - crs 123456 (1a2b3)`
  - **Flow name**:
    - `: FlowName`

**How to navigate with the modal** Results for the flow in the active leaf
always target the active leaf. Results for other flows try to target their
attached leafID. If the ID is stale they default to the last active leaf for the
flow; if there's no leaf for the flow, they open a new one. Results for flows
always open a new leaf.

So by choosing which leaf is active when you open the modal, and which exact
result you click, you can target your navigation quite a bit. To get an overview
over your workspace (as it pertains to flows) as well as active leafIDs, open
the flow switcher modal.

<hr>

### 9. Fixing problems

If you didn't do any of the stuff that I [recommended](#2-safety-features) you
[don't](#4-limitations-and-known-inconveniences]), your problem can likely be
solved by turning it off and on again:

- **rebuild the problem flow and/or**
- **reload your vault**

In case you had to see for yourself (or textFlow is colliding with some of your
settings/other plugins or something really did go wrong), here's a list of
problems I myself managed to cause, plus explanations and solutions. If you
don't find your problem on this list, let me know (see
[Report a bug / report your love](#12-report-a-bug-report-your-love))

**Table of Contents**

1. [Flow creation problems](#flow-creation-problems)
2. [Flow switcher problems](#flow-switcher-problems)
3. [Menu bar problems](#menu-bar-problems)
4. [Flow / leaf problems](#flow-leaf-problems)
5. [Weird problems](#weird-problems)
6. [More problems](#more-problems)

#### Flow creation problems

- **Problem:** The notes in the flow preview are in a different order than the
  notes in your file explorer, even though you selected 'Depth first', and
  choosing 'Folders first' doesn't help either. Btw. these namings are confusing
  - **Solution:**
    - I know.
    - Are you using a plugin to manually sort your notes in the file explorer?
      - Sorry, but textFlow goes by the actual file tree order, not by the UI
        layer. You're either going to have to number your notes to get the order
        right or mirror your desired sort order into a bookmark group (or maybe
        you're already using the plugin that sorts from bookmarks?) and define
        your flows from there (there'll be no option to refine your flow via
        frontmatter, though)
    - Do you name your files 'basename', 'basename1', 'basename2'....?
      - JavaScript has its own alphabet, in which 'basename' comes after
        'basename${number}'.
      - So to fix this, rename 'basename' to 'basename0'

#### Flow switcher problems

- **Problem:** A flow won't open even though it's shown in the switcher modal.

  - **Solution:**
    - Try rebuilding the flow and reloading your vault. If the button is greyed
      out, rebuild through the settings panel.
    - If that didn't work, delete the flow definition and recreate it.
    - If that didn't work either, quit Obsidian, go to the
      `.obsidian/plugins/textFlow` folder in you vault and delete the file
      `data.json`.
    - `.obsidian` is a hidden folder, but the internet will tell you how to
      reveal such folders on your operating system.
    - After that, restart Obsidian and restore your flow definitions from your
      backups.

- **Problem:** The modal is empty even though you know you have several flows
  defined.
  - **Solution:**
    - Sometimes Obsidian eats textFlow's `data.json` and I don't understand why.
      I hope that's a development problem and won't pop up during actual use.
      However:
    - Restore your definitions from your backup.
- **Problem:** I closed all leaves of a flow via the switcher modal, but it
  still shows the flow's main entry.
  - **Solution:**
    - Yeah, that happens when you reload your vault while a flow is open but
      none of its leaves are active.
    - Just open another leaf for that flow and close it again.
    - Or next time before you close a leaf, activate it first.

#### Menu bar problems

- **Problem:** The menu bar for one of your flows is only half rendered
  (optional: and the sync button is staying activated)

  - **Solution:**
    - Try a flow rebuild. If the button is greyed out, do it through the
      settings tab.

- **Problem:** The menu bar vanished.

  - **Solution:**
    - Did you make the bar vanish by using the menu-bar-vanish command? Try
      using the command again... and once more, just to be sure.
    - If that wasn't it, close the leaf in question and rebuild the flow, then
      reload your vault.
    - Still not working? Are you using 'Editing toolbar'? Read the next entry.
    - Is textFlow activated?
    - Are there any flows ln the switcher modal? If there are not, sorry,
      Obsidian ate your config -.- Import your backup or redefine your flows.

- **Problem:** The menu bar is mostly covered up by the Editing toolbar.

  - **Solution:**
    - Go to Editing toolbar's settings.
    - In `General` select `body` as `append method`.
    - In `Appearance` select `following` (will show the bar when you select
      text) or `fixed` (will show the bar in the lower third of the screen).

- **Problem**: I clicked out of Obsidian while the navigation menu was expanded,
  and now it won't close when I click outside of it
  - **Solution:** Yeah... no idea why. Click an entry in the menu, that will get
    it back on track.

#### Flow / leaf problems

- **Problem:** You edited a flow note in a different text editor and now the
  navigation and tracking don't work and the edits you made aren't synced.

  - **Solution:**
    - Your text editor deleter the UUIDs or your accidentally broke one.
    - Also textflow doesn't know what you did outside of Obsidian since it
      couldn't track that, so it doesn't know what to sync.
    - You're going to have to copy your edits over into your source files
      manually and then rebuild the flow.
    - Also read the chapter on [Safety features](#2-safety-features)

- **Problem:** The **cursor** is at the end of a region, right above a grey
  line, and it stopped moving??

  - **Solution:**
    - You found an invisible UUID! Some of the characters in there are
      zero-width, so the cursor stays in place while running through them.
    - To get out of this predicament, try the up or down arrow on your keyboard.

- **Problem:** The grey separation lines are now `<hr>` for some reason, also
  checkboxes and other markdown aren't being rendered?
  - **Solution:**
    - Either you've got yourself an unenclosed code block somewhere.
      - Maybe it's unintentional code, like `<blah`, then you just need to put a
        space between the pointy and the letters: < blah.
      - But if it's a whole html style tag - `<>` - it needs to be enclose in
        back ticks (accent gràves). Either single ones, if you want to isolate
        just a word - like so: `<boolean>`, `<b>` - or three - ` ``` `- on the
        line above and the line below the text block for Obsidian to understand
        that it should not interpret anything written in that block
    - Or you deactivated textFlow while a flow was open.
      - This completely kills all extensions - even though I am using
        `reconfigure.of(extension)`, wtf is up with that? - and thus the editor
        can't render markdown anymore.
      - Either reopen the leaf in question or reload your vault.

#### Weird problems

- **Problem:** textFlow wants me to sync a flow, but when I click the button,
  nothing happens, and I can't rebuild the flow while it has unsynced edits.

  - **Solution:**
    - Did you just fix a sync screwup?
    - Open Obsidian's settings and go to textFlow's settings tab. Here you can
      always rebuild your flows, no matter the sync status.
    - If you're worried, `ctrl/cmd + i` to open the console. There you'll see
      red error messages. They likely say `No matching region found for UID`
      and/or
      `Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'flowOrder') at ... syncBackToSource`)
    - This is sometimes the aftermath of a sync screw-up and nothing to worry
      about. A rebuild will fix it.

- **Problem:** With every new rebuild, the title of your notes is added to their
  contents.

  - **Solution:**
    - This is either a problem with your setup or a bug in one (or more) of
      Obsidian's versions. Update the app to 1.8.10 to guarantee that it's not
      Obsidian.
    - If the error still occurs, disable all your plugins and reenable them one
      by one while doing rebuilds to test which one is the culprit (let me know
      who it was).

- **Problem:** Navigation via file explorer doesn't work even though it's
  definitely toggled on.
  - **Solution:**
    - Sometimes Obsidian eats textFlow's data.json and I don't understand why.
      So check if your switcher modal shows any flows. It likely doesn't.
    - Restore your flow definitions from the backup.

#### More problems

- **Problem:** Something else is going on and rebuilding/reloading/reinstalling
  doesn't help.
  - **Solution:** Send me a bug report:
    - In Obsidian, use the keycombo `cmd/ctrl+alt+i` to open the console.
    - Reproduce the problem and copy the contents of the Console.
    - Then on github, post a bug report, describing exactly what you were trying
      to do, what happened instead, including the console output

<hr>

### 10. Cheat sheet

**Lingo and concepts used by textFlow**

- **Basic idea:** textFlow copies the contents of certain notes into a new note,
  then syncs things you change within that new note back into the original
  notes. That's it. That's the plugin. Still needs a 7.000+ word Readme, though,
  apparently.
- **Flow:** A note that has been created (concatenated) from a selection of
  notes and equipped with UUIDs in order to allow for functionality like the
  tracking of the cursor position and edits as well as syncing edits back to the
  correct source note.
- **Frontmatter:** Also called YAML or [properties](#how-to-properties).
  Metadata that you can add to notes in Obsidian. You can use frontmatter to
  make very specific flows. Your source notes' frontmatter is _not_ included in
  flows, but you can add frontmatter to any of your flows as a whole, if you
  want.
- **Invisible UUID:** A long string of various non-printing and mostly
  zero-width characters used to represent the base16 UUID that is generated for
  each source note when it is included into a flow. See also: Region.
- **Leaf and leafID:** A leaf is just a tab, including tons of background
  information about what's being displayed within it. Each leaf has a unique ID,
  which is, as far as it concerns average use, persistent across reloads of
  Obsidian. textFlow uses leafIDs to keep a tally of what flow is open where,
  which region is being displayed and which cursor positions have been saved.
- **Overlap:** An overlap arises when two or more flows are made up of some of
  the same source notes. If you edit within the overlapping region and sync back
  to source, the conflicting flows diverge from the source notes. Therefore they
  are flagged for rebuild and will be rebuilt as soon as you interact with them.
- **(Re)build:** The process of transferring content from source notes into
  Flows. This process constructs and rewrites the entire flow. This is why it
  can take up to a few seconds for long flows.
- **Region:** The contents of any single note within a flow. Regions are marked
  with invisible UUIDs, so textFlow can track your edits and sync them back to
  your source.
- **Source Note:** A note whose contents are part of a flow.
- **Sync back to source:** The process of transferring edits from a flow into
  the respective source note. Syncing can happen automatically or manually.
- **Tracking:** textFlow tracks your cursor position, mouse events and keyboard
  events in order to determine where in your flow your are and if you have
  performed an edit that warrants a sync flag and any rebuild flags. **This
  tracking does _not_ send any stuff to any servers.** It only saves stuff to
  textFlow's `data.json` file in your `.obsidian/plugins/textFlow` folder. Like
  so:

```js
- update: (state, tr) => { let ranges = state.ranges;...}
- this.settings.flows[flowName].activeRegions[leafID].currentCursorPos =
	update.state.selection.main.from;
- this.settings.flows[isItFlow].unsavedRegionsArray.push(activePath);
- this.settings.flows[otherFlow].flaggedForRebuild = true;
```

<hr>

### 11 Comparing textFlow and Outline

Obsidian already offers a way of browsing through a single, large document in
the form of the core plugin Outline - so when is textFlow worth a try? And when
should you use both together?

**Advantages of textFlow:**

- **Automation and Flexibility:**
  - With textFlow you can work on a dozen of differently composed excerpts of
    your vault without ever having to copy/paste anything by hand, missing
    parts, forgetting to update or getting confused as to which excerpt has
    which edit, because textFlow handles it all for you.
- **File explorer:**
  - The plugin 'Quiet outline' by the_tree allows you to decorate headlines in
    Outline and to auto-expand the headline(s) under which you are working. But
    to change the deco, you have to browse your document instead of just
    clicking on note titles in a sidebar. And if you prefer a specific set of
    headlines to be expanded, you have to remake your workspace every time you
    reload your vault.
- **Snapshots:**
  - With Outline, if you want to take a snapshot of a certain part of your
    document, you have to copy-paste a region out into a new document and title
    it by hand.
  - With textFlow, your source files all still exist; just take a snapshot (try
    'Backitup' by hammadXP - best used together with 'Diff view' by Till Friebe
    to compare and selectively restore).

**Advantages of Outline:**

- No data duplication the way textFlow necessitates
- You can open the document in whatever editor you want, edit it however you
  want, and forget all about it without the risk of losing data
- You can dragondrop to change the order of all sections throughout the
  document, whereas with textFlow, you have to rename source notes to change
  their order.
- Your Wiki-links are already set up to work in this environment.
- Navigating through headlines is much more sturdy and reliable than textFlow's
  navigation via file explorer
- You'll never have to wait for a rebuild to complete.

**Together they shine:**

- But why choose when you can just use both - textFlow to create flexible
  documents and make snapshots and Outline to granularly navigate your flows.

<hr>

### 12. Report a bug / Report your love

If you encounter any bugs or weird behaviour that the chapter on
[fixing problems](#9-fixing-problems) doesn't cover, hit me up on github:
https://github.com/tine-schreibt/aDHL/issues I can help you best if you take a
peek at the developer console for any error messages first. To do that:

- In Obsidian, use the keycombo `cmd/ctrl+alt+i` to open the console.
- Copy the error messages you see in there.
- Then post your bug report, describing exactly what you were trying to do and
  what happened instead, including the console output.
- You can also send the report via email: tine@tine-schreibt.de - or contact me
  on mastodon: https://literatur.social/@tine_schreibt

If you just love this plugin and want to tell me that, an email or a dm are a
good way of doing that. Or if you got some coin to spare, you can tip me on
kofi: https://ko-fi.com/tine_schreibt
