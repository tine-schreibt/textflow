#### 0.4.16

- stored search terms for the navDropdown perform a search again

#### 0.4.15

- added a new bug when fixing the previous bug...

#### 0.4.14

- fixed bug where fuzzNav modal would only show up when a file is open

#### 0.4.13

- Killed vaults using a MutationObserver onload
- So sorry about that.
- To fix, remove the settings files that are directly inside the .obsidian folder
- Again, I am so sorry for this -.-

#### 0.4.12

- This should finally actually really fix that bug where the hidden systemFolder would show up again after restart
- It also fixes the bug where the menuBar would blow you two a raspberries after restart
- also, some more stuff for the linter (builtin-modules, an !important and some relics from when I replaced fixed numbers with default variables in styles.css)

#### 0.4.11

- Fixed a bug where I forgot to set firsLaunch to false. I call it bug to save face. It was a silliness.
- also, fixed a ton of missing awaits and turned bad awaits into void plus catch.
- also had to up the min-version to 1.8.7 to fit with the APIs I'm using

### 0.4.10

- fixed the mess that was the getUniqueFileName function; it no longer crashes and burns when trying to iterate

### 0.4.9

- fixed bug that caused symbols to persist even after flow was closed
- also, forgot to remove my console.logs -.-

### 0.4.8

- updated Readmes
- added menu bar button to toggle classic/embed flow when embedding is active

### 0.4.7

- fixed overlap detection
- fixed overlap warnings to only warn when receiving flow is classic
- fixed rebuild flagging for embed flows

### 0.4.6

- added main toggle for embedding in order to put an inescapable disclaimer into
  the UI

### 0.4.5

- too much flagging. Reversed that.

### 0.4.4

- fixed always-on embed toggle

### 0.4.3

- added check for presence of Sync Embeds plugin when toggling embeds

### 0.4.2

- implemented export for embed flows
- flagged out of some unnecessary checks for embed flows

### 0.4.1

- added embed toggle to context modal
- removed sync button from embed menu bar

### 0.4.0

- Flows can be built via embeds if you install Sync Embeds

### 0.3.3

- UI update

### 0.3.2

- Fixed bug where I was overly aggressively correcting for user not starting
  dvQuery with LIST

### 0.3.1

- UI fix

### 0.3.0

- New feature: Define flows from Dataview queries

### 0.2.17

- just testing if the new release.yml works

### 0.2.16

- Fixed sources not being shown in backup modal
- removed some unused dependencies

### 0.2.15

- moved most deps to devDeps in hopes it will fix the tweaking of the bot

### 0.2.14

- All dependencies are up to date now

### 0.2.13

- Version bump to @types/node because that's the only place where I found
  something about url.parse(), which is what the bot keeps complaining about

### 0.2.12

- Updated sconfig. Maybe that'll fix it?

### 0.2.11

- updated some dependencies in the hopes that the url parse warning goes away

### 0.2.10

- some bugfixing and stuff under the hood, as they say

### 0.2.9

- Trying to submit to Obsidian

### 0.2.8

- just some small stuff updated/fixed in the UI

### 0.2.7

- some minor stuff under the hood

### 0.2.6

- edited the en lang file to be closer to Global English
- simplified some language in en readme

### 0.2.5

- fixed and improved a ton of stuff around reliability and UI
