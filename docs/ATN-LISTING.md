# Thunderbird Add-ons listing — Fast Folder Jump

**Name:** Fast Folder Jump

**Short description:** Lightning-fast Move, Copy and Jump-to-folder search for Thunderbird Local Folders, with folder exclusions and keyboard shortcuts.

## Long description

### Fast Folder Jump — File messages instantly. Stay in control.

Fast Folder Jump is a lightweight, keyboard-first folder navigator for Thunderbird, inspired by the productivity workflows of **Nostalgy**, **Nostalgy++** and **Quick Folder Move** by Philipp Kewisch. This is an independent add-on, not a code fork of those projects.

**Built for speed:** the search panel is prepared inside Thunderbird's existing mail view, while the folder list is cached in advance. Opening the panel does not need to launch a new window or wait for a full folder scan. Type, select and file your email with minimal interruption.

**Three actions, one familiar interface**
- **Shift+M — Move:** move selected messages to a matching folder.
- **Shift+C — Copy:** copy selected messages to a matching folder.
- **Shift+G — Jump to:** go directly to a selected folder.
- Switch between **Move / Copy / Jump to** directly in the panel header.

**Features**
- Fast search by folder name or full path, including deeply nested folders.
- Last used destination appears first, with recently used folders prioritized.
- Exclude individual folders with the small red minus beside any result.
- Exclude entire folder branches in Settings.
- Add **! at the end** of a search to temporarily include excluded folders (for example `archive!`).
- Configurable list length: 4–30 visible results.
- Keyboard navigation with Up/Down, Enter, Ctrl+Enter and Escape.
- Opaque, readable interface; no separate search window.
- Locally cached folder index, refreshed when needed.

**Local Folders only:** the extension deliberately does not search IMAP or other remote account folders.

**Privacy:** no telemetry, no cloud account and no automatic data transfer. The extension stores folder preferences and recent destinations locally. An optional donation link is available in Settings; all functionality is free.

**Compatibility:** Thunderbird 140 and later. A bundled Experiment API is used for immediate access to the panel and Shift-only keyboard shortcuts. This may require granting full access to Thunderbird. Shortcuts may conflict with other extensions such as Nostalgy++; disable conflicting bindings if needed.

**Acknowledgements:** Thanks to the authors and contributors of Nostalgy (Alain Frisch), Nostalgy++ (opto/Klaus Buecher) and Quick Folder Move (Philipp Kewisch), whose workflows inspired this independent implementation.
