# Fast Folder Jump 0.1.5

This release adds an optional Buy me a coffee link in Settings. All folder indexing, keyboard shortcuts, Move/Copy/Jump operations and exclusions are unchanged from 0.1.4.

A separate Thunderbird MailExtension for instant Move / Copy / Jump-to folder search.

## Changes in 0.1.3
- ignore exclusions by adding `!` **at the end** of the search, e.g. `archive!`
- previous `!archive` prefix syntax no longer overrides exclusions

## Changes in 0.1.2
- tiny red **−** action on the right of every folder result, with tooltip **Exclude from search**
- clicking excludes just that folder (not subfolders), without performing Move/Copy/Jump
- results update immediately; type a trailing `!` to see excluded folders again
- exclusion can be removed in Settings

## Changes retained from 0.1.1
- fully opaque overlay (no transparent background)
- Local Folders only
- all UI text in English
- header mode switcher: **Move / Copy / Jump to**
- same fast cached folder index as in 0.1.0

## Shortcuts (mail 3-pane only)
- **Shift+M** — move selected messages
- **Shift+C** — copy selected messages
- **Shift+G** — jump to a folder
- Up / Down — change highlighted folder
- Enter — use selected folder
- Ctrl+Enter — move/copy and open destination folder
- Escape — close
- F5 within search — refresh folder index
- Type `!` at the end of a query to temporarily bypass exclusions.

## Settings
- visible result count: 4–30
- exclude a single folder or an entire subtree
- manually refresh the cached folder list

## Notes
- Local Folders only — no IMAP / POP folder scope switch.
- Move/Copy use Thunderbird's `messages.move()` / `messages.copy()` API with `isUserAction: true`.
- Compatibility target: Thunderbird 140+.

## 0.1.4 visual fix
The exclude control is a fixed 20×20px circle instead of a Thunderbird-native button, preventing the system button min-width from stretching it. All actions, folder filtering and shortcut logic are unchanged.
