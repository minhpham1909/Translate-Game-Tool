SYSTEM PATCH CONTEXT: Handling Edge Cases & Vulnerabilities

1. Overview

As we solidify the MVP, we must address critical vulnerabilities related to File System permissions, Ren'Py engine quirks, and SQLite data integrity. Implement the following safeguards immediately.

2. File System Safeguards (The EPERM & .rpyc Fixes)

Agent must update src/main/services/exportService.ts.

A. Write Permission Pre-flight Check

Before exporting, the system must verify it has write access to the target game directory. (Games in C:\Program Files will reject writes unless running as Admin).

Implementation: Create a dummy file .vnt_write_test in the target directory and immediately delete it.

Action: If this throws an EPERM error, abort the export and throw a user-friendly error: "Write permission denied. Please run the app as Administrator or move the game folder to a different location (e.g., Desktop or D: drive)."

B. Force Recompilation (Delete .rpyc)

Ren'Py prioritizes .rpyc (compiled) files over .rpy (script) files. Overwriting .rpy is not enough.

Implementation: When successfully overwriting a file (e.g., script.rpy), the exporter MUST check if script.rpyc exists in the same directory.

Action: If the .rpyc file exists, delete it (fs.unlink). This forces Ren'Py to generate a fresh compiled file containing the new Vietnamese translations on next launch.

C. Strict UTF-8 Encoding

Ensure utf8 is explicitly passed to ALL fs.readFile and fs.writeFile operations. Vietnamese characters will break in-game if saved with OS-default legacy encodings.

3. Database & Queue Integrity Safeguards

Agent must update src/main/store/database.ts and projectIpc.ts.

A. Orphaned Tasks Recovery (Startup Cleanup)

If the app crashes or is closed while the AI Queue is running, blocks will be stuck in an in_progress or translating state forever.

Implementation: In src/main/services/parserService.ts (when loading a project) or database init, run an update query:
UPDATE translation_blocks SET status = 'empty' WHERE status = 'translating' OR status = 'in_progress';

This ensures any interrupted translations are picked up again.

B. Database Vacuuming (Preventing Bloat)

Because we use FTS5 and WAL mode, the DB file will grow continuously with frequent updates/deletes.

Implementation: Expose a utility function in database.ts called vacuumDatabase().

Action: Call db.exec('VACUUM;'); after a Project is Hard Deleted to reclaim disk space to the OS.

4. Agent Execution Steps

Update exportService.ts to implement the Write Permission Check and .rpyc deletion logic. Double-check all fs calls for utf8.

Add the Orphaned Tasks Recovery SQL query to the project loading sequence.

Add the VACUUM execution to the end of the Project Deletion handler in projectIpc.ts.
