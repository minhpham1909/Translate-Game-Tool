HOTFIX CONTEXT: Standardizing the Restore Backup Workflow

1. The Bug (Vanishing Blocks on Restore)

When a user clicks "Restore" for a backup file, the blocks inside that file disappear from the UI/Database.
This happens because the current logic is likely either corrupting the physical file during the copy process OR attempting a destructive "Delete and Re-parse" action on the database that fails.

2. The Solution: DB Reset (No Re-parsing)

Since the translation_blocks table already contains the perfect original_text, we DO NOT need to re-parse the file when restoring.
We simply overwrite the physical file, delete the .rpyc, and reset the database status back to empty.

A. The Standardized Restore Function (src/main/services/exportService.ts)

Locate your restoreFileBackup function (or similar) in exportService.ts. Rewrite it to follow this EXACT 4-step logic:

import fs from 'fs-extra';
import { getDatabase } from '../store/database';
// Make sure to import syncAllFilesProgress from wherever you placed it in the previous hotfix (e.g., workspaceService.ts or database.ts)
import { syncAllFilesProgress } from '../store/database';

export async function restoreFileBackup(fileId: number, targetRpyPath: string, backupFilePath: string): Promise<void> {
  try {
    // STEP 1: Overwrite the physical file with the backup safely
    if (!(await fs.pathExists(backupFilePath))) {
      throw new Error(`Backup file not found: ${backupFilePath}`);
    }
    await fs.copy(backupFilePath, targetRpyPath, { overwrite: true });

    // STEP 2: Force Ren'Py to recompile by deleting the .rpyc file
    const rpycPath = targetRpyPath + 'c';
    if (await fs.pathExists(rpycPath)) {
      await fs.remove(rpycPath);
    }

    // STEP 3: Reset the Database blocks for this file (Wipe translations)
    const db = getDatabase();
    if (db) {
      db.prepare(`
        UPDATE translation_blocks
        SET translated_text = NULL, status = 'empty'
        WHERE file_id = ?
      `).run(fileId);
    }

    // STEP 4: Sync the UI progress (Total vs Translated count)
    syncAllFilesProgress();

  } catch (error) {
    console.error(`[Restore] Failed to restore backup for fileId ${fileId}:`, error);
    throw error;
  }
}


B. IPC Handler Update (src/main/ipcHandler.ts)

Ensure the IPC handler that triggers the restore is passing the correct arguments (the fileId from the database, the active .rpy path, and the .backup path) and calling this updated function.

3. Agent Execution Steps

Update src/main/services/exportService.ts with the new restoreFileBackup logic.

Ensure fs.copy is used (from fs-extra) as it safely handles overwrites without creating 0-byte files.

Verify that the UI (React) calls the IPC handler correctly and then refetches the block list so the UI reflects the reset state (empty status).
