FEATURE CONTEXT: High-Density CAT Tool UI/UX Refactoring

1. The UX Problem

Based on user testing, the current TranslationCard component is too bulky. It acts like a large web form rather than a professional Computer-Assisted Translation (CAT) data grid.
Users need to review thousands of lines. The current design wastes vertical space (massive textareas for 1-word strings, excessive padding), allowing only 3-4 blocks to fit on screen.

2. Design Goal: The "Spreadsheet" Density

We must refactor the TranslationCard and the TranslationWorkspace to be highly dense, clean, and visually scanable (similar to SDL Trados, MemoQ, or Excel).

3. UI Implementation Instructions (src/renderer/src/components/cat-tool/TranslationCard.tsx)

A. Layout & Padding Reduction

Change the container from a bulky Card to a streamlined Row.

Reduce padding drastically: p-4 or p-6 should become p-2 or px-3 py-2.

Remove thick borders. Use a subtle bottom border (border-b border-border/50) to separate rows.

B. Auto-Resizing Inputs (Crucial)

Do NOT use a fixed multi-row <textarea> for the translation input.

Replace it with a component that behaves like an <input type="text"> by default (1 line high), but auto-expands its height ONLY if the text wraps to multiple lines.

Tailwind/React Tip: Use a textarea with rows={1} and onInput logic to adjust e.target.style.height, or use a library like react-textarea-autosize.

C. Grid Structure

Restructure the card into a strict 3-column grid to maximize horizontal space:

<div className="group flex w-full border-b border-border/40 hover:bg-accent/50 transition-colors">

  {/* Column 1: Meta & Status (Width: ~100px) */}
  <div className="flex flex-col items-center justify-start p-2 gap-2 border-r border-border/40">
     <Checkbox />
     <StatusIndicator /> {/* A tiny colored dot or thin line, not a huge badge */}
     <span className="text-[10px] text-muted-foreground">{block.line_index}</span>
  </div>

  {/* Column 2: Content (Width: Flex Grow, Grid 2 Cols) */}
  <div className="flex-1 grid grid-cols-2 gap-4 p-2">
     {/* Original Text */}
     <div className="text-sm text-foreground/80 font-mono whitespace-pre-wrap">
        {block.original_text}
     </div>

     {/* Translated Text (Auto-resize textarea) */}
     <div className="relative">
        <TextareaAutosize
           className="w-full text-sm bg-transparent border border-transparent hover:border-border focus:border-primary focus:bg-background rounded px-2 py-1 outline-none resize-none transition-all"
           minRows={1}
           value={block.translated_text || ''}
        />
     </div>
  </div>

  {/* Column 3: Actions (Width: ~120px) */}
  {/* Make opacity-0 by default, group-hover:opacity-100 so it doesn't clutter the screen unless hovered */}
  <div className="flex items-start justify-end p-2 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <Button variant="ghost" size="icon" title="AI Translate"><Sparkles className="w-4 h-4"/></Button>
      <Button variant="ghost" size="icon" title="Revert"><Undo className="w-4 h-4"/></Button>
      <Button variant="ghost" size="icon" title="Approve"><Check className="w-4 h-4 text-green-500"/></Button>
  </div>
</div>


4. Typography & Readability

Font: Use a highly legible font for the texts. Consider font-mono (monospace) for the original text to easily spot Ren'Py tags and brackets.

Colors:

Empty: Subtle gray background on the input.

Draft: Subtle blue left-border.

Approved: Subtle green left-border.

Hide large textual badges (like "Empty" or "Approved") from the main view to save space. Use color codes instead.

5. Agent Execution

Please refactor TranslationCard.tsx using the principles above. The goal is to fit at least 10-12 translation blocks on a standard 1080p screen without scrolling.
