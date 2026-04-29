import fs from 'fs-extra';
import path from 'path';

/**
 * Quét thư mục đệ quy để tìm tất cả các file .rpy
 * @param dirPath Thư mục cần quét (thường là game/tl/)
 * @returns Danh sách các đường dẫn tuyệt đối đến file .rpy
 */
export async function scanDirectoryForRpy(dirPath: string): Promise<string[]> {
  const files: string[] = [];
  
  async function scan(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.rpy')) {
        files.push(fullPath);
      }
    }
  }

  await scan(dirPath);
  return files;
}

/**
 * Đọc nội dung file, chia thành mảng các dòng (bảo toàn UTF-8)
 * Hỗ trợ cả CRLF (Windows) và LF (Linux/Mac)
 */
export async function readFileLines(filePath: string): Promise<string[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  return content.split(/\r?\n/);
}

/**
 * Ghi đè file với một mảng dòng mới
 * (Hàm này sẽ gọi tới hàm tạo backup trước khi ghi trong các phase sau)
 */
export async function writeFileLines(filePath: string, lines: string[]): Promise<void> {
  const content = lines.join('\n');
  await fs.writeFile(filePath, content, 'utf-8');
}
