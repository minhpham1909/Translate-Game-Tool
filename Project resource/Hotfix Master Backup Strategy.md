HOTFIX CONTEXT: Master Backup & Database-Driven Restore Strategy

1. The Paradigm Shift: From Physical Backups to Data-Driven Reverts

The current approach of creating a .backup_[timestamp] file every time we export clutters the game directory and makes restoration buggy. We are shifting to a "Golden Mean" Hybrid Strategy:

The Master Backup: We only save ONE original physical copy (.vnt_orig) to protect the developer's raw file.

Database-Driven Restore: We use the original_text already stored in our SQLite DB to revert translations, rather than copying physical files back and forth.

2. Part 1: The Master Backup Implementation (src/main/services/exportService.ts)

Update the exportFile function.

REMOVE the old timestamp backup logic:

// DELETE THIS OLD LOGIC
const backupPath = `${targetPath}.backup_${Date.now()}`;
await fs.copy(sourceFilePath, backupPath);


REPLACE it with the Master Backup logic:

// NEW MASTER BACKUP LOGIC
const masterBackupPath = `${targetPath}.vnt_orig`;
// Only create the backup if it doesn't already exist. Preserve the pristine original forever.
if (!(await fs.pathExists(masterBackupPath))) {
  await fs.copy(sourceFilePath, masterBackupPath, { overwrite: false });
  console.log(`[Export] Created Master Backup: ${masterBackupPath}`);
}


(The rest of the export logic: direct overwrite, Trojan Horse header preservation, and .rpyc deletion remains exactly the same).

3. Part 2: The DB-Driven Restore Implementation (src/main/services/exportService.ts)

Rewrite the restoreFileBackup function (or whatever function currently handles restoring a file). It MUST NOT copy physical files anymore. Instead, it resets the database and triggers a re-export.

New Restore Logic:

import { getDatabase } from '../store/database';
// Ensure syncAllFilesProgress is imported correctly (from database.ts or workspaceService.ts)
import { syncAllFilesProgress } from '../store/database';

/**
 * Restores a file to its original language by resetting DB state and re-exporting.
 */
export async function restoreFileToOriginal(fileId: number, sourceFilePath: string): Promise<void> {
  try {
    const db = getDatabase();
    if (!db) throw new Error("Database not initialized");

    // STEP 1: Wipe all translations for this file in the DB
    db.prepare(`
      UPDATE translation_blocks
      SET translated_text = NULL, status = 'empty'
      WHERE file_id = ?
    `).run(fileId);

    // STEP 2: Sync the UI progress immediately
    syncAllFilesProgress();

    // STEP 3: Re-export the file.
    // Since translated_text is now NULL, the exporter will use original_text,
    // effectively restoring the physical .rpy file to its original language!
    // Note: Agent MUST ensure this calls the actual exportFile logic.
    await exportFile(fileId, sourceFilePath); // Pass whatever args exportFile requires

    console.log(`[Restore] Successfully restored fileId ${fileId} via DB reset.`);
  } catch (error) {
    console.error(`[Restore] Failed to restore fileId ${fileId}:`, error);
    throw error;
  }
}


4. Agent Execution Steps

Open src/main/services/exportService.ts.

Find the backup creation logic inside exportFile and replace it with the Master Backup (.vnt_orig) logic.

Rewrite the restore function to use the DB-Driven Restore logic (Wipe DB -> Sync Progress -> Re-export).

Update src/main/ipcHandler.ts: Ensure the IPC handler for restoring a file uses the new restoreFileToOriginal function.

Update the React UI (e.g., ExportModal.tsx or similar): The UI no longer needs to list timestamped backups. It just needs a single "Restore to Original" button for each file that calls the updated IPC handler.
