# Fast Folder Jump 0.1.5 — ATN submission notes

## Identity and scope
- Thunderbird add-on ID: `gawkla.fast-folder-jump@addons.thunderbird.net`
- Target: Thunderbird 140+ (140 ESR / 141 tested by author in development versions; compatibility with other builds is not verified)
- Version 0.1.5 differs from working 0.1.4 only by the optional Ko-fi section in Settings, its CSS, and manifest version/ID. The 0.1.5 Local build has the development ID and the same executable logic.
- This is an **independent implementation inspired by** Nostalgy (Alain Frisch), Nostalgy++ (opto/Klaus Buecher) and Quick Folder Move (Philipp Kewisch). It is **not a source-code fork** of any of them. No code was copied from these add-ons.

## Reviewer test steps
1. Create/identify a `Local Folders` account with a few folders. Select one or more non-critical messages in the 3-pane message list.
2. Press **Shift+M**. The already-mounted search panel should open without needing to enumerate folders first.
3. Type a partial folder name, choose a destination with the arrow keys and press Enter. Verify the message moves into the destination.
4. Use **Shift+C** for copy, or **Shift+G** to navigate to a Local Folders folder. The three operations can also be selected from the panel header.
5. Click the small red minus beside one result to exclude that folder; confirm the result disappears. Append `!` to the search term to show excluded folders again (e.g., `archive!`).
6. In Settings, set visible result count to 4–30 and exclude one folder or an entire subtree. Verify these persist after restarting Thunderbird.
7. The most recently used destination appears first when the search is empty.
8. Open Settings to see the **optional** Ko-fi donation link. It is a plain external HTTPS link. No Ko-fi content is embedded or loaded automatically.
9. The add-on intentionally indexes **Local Folders only** (`account.type === "none"`), not IMAP.

## Privileged API explanation
The bundled `fastJump` Experiment API provides a pre-mounted panel in the existing mail 3-pane window and captures Shift-only shortcuts (not available from standard WebExtension commands). It reads in-memory folder index data handed over by the background script; it does not need network access. Thunderbird may display a broad privileged-API permission prompt. The add-on also uses accountsRead, messagesRead, messagesMove, and local storage.

## Shortcut conflicts
Shift+C is a pre-existing Thunderbird shortcut and may also be used by Nostalgy++. Disable conflicting keyboard shortcuts before testing.

## Privacy
Follow the enclosed `PRIVACY_POLICY.md`. The add-on does not automatically contact third-party services and does not collect telemetry.
