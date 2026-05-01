import fs from 'fs-extra'
import path from 'path'
import { parseRpyFile, importRpyToDatabase } from '../parser/rpyParser'

/**
 * Lấy tất cả các file có đuôi mở rộng chỉ định trong một thư mục (đệ quy)
 */
async function getAllFiles(dir: string, ext: string): Promise<string[]> {
  let results: string[] = []
  
  try {
    const list = await fs.readdir(dir, { withFileTypes: true })
    for (const item of list) {
      const fullPath = path.join(dir, item.name)
      if (item.isDirectory()) {
        results = results.concat(await getAllFiles(fullPath, ext))
      } else if (item.name.endsWith(ext)) {
        results.push(fullPath)
      }
    }
  } catch (error) {
    console.error(`Lỗi khi quét thư mục ${dir}:`, error)
  }
  
  return results
}

/**
 * Bắt đầu quá trình parse toàn bộ project
 * @param gameFolderPath Đường dẫn tuyệt đối đến game/
 * @param sourceLanguage Ngôn ngữ nguồn (vd: english)
 */
export async function parseProject(gameFolderPath: string, sourceLanguage: string): Promise<void> {
  const targetDir = path.join(gameFolderPath, 'tl', sourceLanguage)
  
  const exists = await fs.pathExists(targetDir)
  if (!exists) {
    throw new Error(`Thư mục ngôn ngữ không tồn tại: ${targetDir}`)
  }

  // Lấy tất cả các file .rpy
  const rpyFiles = await getAllFiles(targetDir, '.rpy')
  if (rpyFiles.length === 0) {
    throw new Error(`Không tìm thấy file .rpy nào trong thư mục ${targetDir}`)
  }

  console.log(`[ParserService] Tìm thấy ${rpyFiles.length} files. Đang tiến hành parse...`)

  // Parse và Import từng file
  let processedFiles = 0
  for (const filePath of rpyFiles) {
    try {
      // Đường dẫn tương đối dùng để hiển thị (vd: script.rpy hoặc route1/script.rpy)
      const relativePath = path.relative(targetDir, filePath)
      
      const parseResult = await parseRpyFile(filePath, relativePath)
      
      // Import vào DB nếu file có dữ liệu (có blocks hoặc file rỗng thì tạo record rỗng)
      importRpyToDatabase(parseResult)
      
      processedFiles++
      // TODO: Có thể bắn event IPC ra renderer để show progress bar nếu cần
    } catch (error) {
      console.error(`[ParserService] Lỗi khi parse file ${filePath}:`, error)
    }
  }

  console.log(`[ParserService] Đã parse xong ${processedFiles}/${rpyFiles.length} files.`)
}
