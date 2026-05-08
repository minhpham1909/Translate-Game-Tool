CRITICAL HOTFIX: The .rpyc Deletion Rule

1. The Bug

Translations are successfully exporting to .rpy files, but the game still shows the old language. This is because Ren'Py prioritizes the old, compiled .rpyc files over the newly written .rpy files.

2. The Solution (Force Recompilation)

We DO NOT generate .rpyc files. Instead, we MUST DELETE the existing .rpyc files so the Ren'Py engine is forced to recompile the game using our new .rpy files on its next launch.

3. Agent Instructions

Go to src/main/services/exportService.ts (inside your export function, right after successfully writing the new .rpy file).

Implement this exact logic:

Determine the path of the .rpyc file (simply replace .rpy with .rpyc on the targetPath or sourcePath).

Use fs.pathExists() to check if the .rpyc file exists.

If it exists, use fs.unlink() or fs.remove() to delete it.

Example snippet to integrate:

const rpycPath = sourceFilePath + 'c'; // e.g., script.rpy -> script.rpyc
if (await fs.pathExists(rpycPath)) {
    await fs.remove(rpycPath);
    console.log(`[Export] Deleted old compiled file to force recompilation: ${rpycPath}`);
}
