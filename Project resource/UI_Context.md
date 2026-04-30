UI PROMPTS COLLECTION FOR VN TRANSLATOR

Instructions for the user: Copy each block separately and paste it into your UI generator (v0/Bolt). Start your prompt with the "Context Rule" below to maintain consistency.

CONTEXT RULE (Paste this at the beginning of EVERY prompt below)

"I am building a Desktop CAT Tool for Visual Novel translation. Maintain the exact same Design System as the main workspace: Slate/Zinc dark mode, high-density layout, Tailwind CSS, Lucide icons, and shadcn/ui components. "

1. Welcome Screen (Empty State)

Prompt:
Create the "Welcome Screen" (Empty State) for when the app first launches and no project is loaded.

Center the layout. Use a subtle, modern logo placeholder at the top.

Below the logo, display a large, friendly welcome message.

Provide two primary Action Cards side-by-side: "Create New Project" (with a Plus/Folder icon) and "Open Existing Project" (with a Folder Open icon).

Below the action cards, display a "Recent Projects" section using a simple list or grid. Each item should show the folder path and last opened date.

Add a subtle yellow warning banner at the top of the screen if the user hasn't set their API Key yet: "API Key is missing. Please configure it in Settings."

2. Project Setup Wizard (Modal)

Prompt:
Create a Dialog (Modal) component for the "New Project Setup Wizard".

It should have a Stepper or numbered layout.

Step 1: "Select Game Folder". Use an input field with a "Browse..." button next to it.

Step 2: "Select Source Language". Use a Select dropdown menu. (Options: "Root Scripts", "english", "chinese").

Step 3: "Target Language". Use a standard text input (Placeholder: "e.g., vietnamese").

Footer: A "Cancel" button and a primary "Start Parsing" button.

Show a mock "Loading State" inside the modal (a spinner with text "Parsing .rpy files... 45%") to simulate the backend process.

3. Global Settings (Modal)

(Note: Use this if you haven't finalized the settings UI yet)
Prompt:
Create a large Dialog (Modal) for "Global Settings".

Layout: Vertical Tabs on the left (width: ~200px), Content area on the right.

Tab 1 ("AI & API"): Select dropdown for 'Active Provider'. Password inputs for 'API Keys'. A slider for 'Temperature' (0.0 to 1.0). A "Test Connection" button.

Tab 2 ("Prompt Logic"): Input for 'Target Language'. A large Textarea for 'Custom System Prompt'.

Tab 3 ("Translation Memory"): A Switch (toggle) for "Enable Auto-fill". A slider for "Fuzzy Match Threshold".

Footer: "Cancel" and "Save Changes" buttons.

4. Glossary / Dictionary Manager (Modal or Full View)

Prompt:
Create a "Glossary Manager" UI. It can be a large Modal.

Header: Title and an "Add New Term" button.

Top bar: A Search input to filter terms.

Main content: A highly dense Table component.

Columns: "Source Term" (e.g., English), "Target Term" (e.g., Vietnamese), "Notes" (optional context), and "Actions".

Actions column: Edit and Trash/Delete icons.

Add a mock row being in "Edit Mode" (showing small input fields instead of plain text).

5. Pre-flight & Bulk Translate (Modal)

Prompt:
Create a Dialog for "Pre-flight Analytics & Bulk Translation". This appears before the user starts auto-translating the whole game.

Top section: Three summary Card components side-by-side: "Pending Lines" (e.g., 5,430), "Estimated Tokens" (e.g., 215k), and "Estimated Cost" (e.g., ~$1.50 USD). Color the Cost text in Amber/Yellow.

Middle section: Radio buttons or a Dropdown: "Translate entire project" vs "Translate current file only".

Footer: "Cancel" and a prominent "Confirm & Start Translation" button.

6. Export & Backup Status (Modal)

Prompt:
Create an "Export Project" Dialog.

Content: Two Checkbox options with descriptive labels: "Create .backup files for original scripts" (checked by default) and "Only export Approved lines (Fallback to source if draft/empty)".

Below the checkboxes, show a Progress bar (e.g., 70% complete).

Below the progress bar, place a small, scrollable black terminal area (Courier font) showing mock export logs: "Exporting chapter1.rpy... Success!".

Footer: "Close" button (disabled while exporting).

7. Global Search & Replace (Floating Tool Window)

Prompt:
Create a compact "Global Search & Replace" floating window or modal.

Inputs: "Find what..." and "Replace with...".

Toggles (small icon buttons next to the find input): Aa (Match Case), " " (Whole Word), .* (Regex).

Below the inputs, show a scrollable preview list of affected lines. Each list item should highlight the matched word in yellow.

Action buttons: "Replace", "Replace All", "Skip".

8. QA Report Dashboard (Full Overlay or Modal)

Prompt:
Create a "QA Report Dashboard" designed to catch formatting errors (missing brackets/braces).

Top bar: "QA Linter Results" with a badge showing "15 Warnings found".

Main content: A Table.

Columns: "File", "Line", "Severity" (use red/yellow Badge components), "Description" (e.g., "Missing [player_name] tag"), and "Action".

Action column: "Go to line" icon button.

Make the rows look clickable so the user knows they can jump to the error.

9. Translation Memory Manager (Modal)

Prompt:
Create a "Translation Memory (TM) Manager" Dialog.

Purpose: Let users view and clean up cached translations.

Header: Search input and a "Clear All Unused" button.

Content: A Table with columns: "Original Sentence", "Cached Translation", "Usage Count" (e.g., "Used 42 times").

Add a trash icon button on each row to delete bad AI translations from the cache.

10. Keyboard Shortcuts Cheat Sheet (Modal)

Prompt:
Create a "Keyboard Shortcuts" Dialog.

Layout: A clean CSS Grid categorizing the shortcuts.

Categories: "Navigation", "Translation Actions", "System".

Use the HTML <kbd> styling to make the keys look like physical keyboard buttons (e.g., Ctrl + Enter).

Pair each key combination with a short description (e.g., "Approve translation and move to next").