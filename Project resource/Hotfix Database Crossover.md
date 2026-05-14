HOTFIX CONTEXT: Database Identity Crossover (The "Cuckoo" Bug)

1. The Critical Bug (Projects Overwriting Each Other)

When importing a new game (Game B), the application loads the database and recent project data of an existing game (Game A).

Root Cause:
In src/main/store/database.ts, the findExistingDbPath function uses a fallback array that includes translation_project.sqlite. If Game B's specific database doesn't exist yet, the system falsely detects the legacy default database (which belongs to Game A) and forcefully binds Game B to Game A's database. This causes massive data crossover and corrupts the recentProjects state in electron-store.

2. The Solution: Strict Database Identity

We must completely remove the legacy fallback from findExistingDbPath. A game MUST ONLY resolve to its dynamically generated vnt_<GameName>.sqlite path.

A. Update findExistingDbPath (src/main/store/database.ts)

Locate findExistingDbPath and replace it entirely with this strict version:

/**
 * Tìm đường dẫn file DB thực tế cho gameName (không tạo mới).
 * CHỈ quét các file vnt_{gameName}.sqlite, vnt_{gameName}_2.sqlite, ...
 * TUYỆT ĐỐI KHÔNG dùng fallback translation_project.sqlite để tránh lỗi chéo DB (Crossover).
 */
export function findExistingDbPath(gameName: string): string | null {
  const customFolder = getCustomDbFolder()

  let dbDir: string
  if (customFolder && fs.existsSync(customFolder)) {
    dbDir = customFolder
  } else {
    dbDir = path.join(app.getPath('userData'), 'db')
  }

  const baseName = \`vnt_\${gameName}\`

  // STRICT IDENTITY: Only look for files matching this specific game's base name
  const candidates = [
    path.join(dbDir, \`\${baseName}.sqlite\`)
  ]

  // Handle collision variants (_2, _3, etc.)
  for (let i = 2; i <= 10; i++) {
    candidates.push(path.join(dbDir, \`\${baseName}_\${i}.sqlite\`))
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return null
}


B. Strengthen Game Folder Naming (Optional but Recommended)

To prevent two entirely different games that just happen to be inside a folder named "Game" from colliding, ensure getGameFolderName behaves strictly. (The current logic in getGameFolderName jumping to the parent if the folder is named 'game' is good, but ensure it handles paths safely).

3. Agent Execution Steps

Open src/main/store/database.ts.

Completely replace the findExistingDbPath function with the strict version provided above.

Inform the user that they MUST delete the corrupted projects from their "Recent Projects" list on the Welcome Screen (using the Hard Delete function) to reset the corrupted state, or manually clear the recentProjects array in their config.json (electron-store).
