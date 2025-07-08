import { promises as fs } from 'fs';
import { dirname, resolve, extname } from 'path';

/**
 * Writes markdown content to a file, creating directories as needed
 */
export async function writeMarkdownFile(filePath: string, content: string): Promise<void> {
  try {
    // Validate the output path
    await validateOutputPath(filePath);
    
    // Ensure the directory exists
    await ensureDirectoryExists(dirname(filePath));
    
    // Write the file
    await fs.writeFile(filePath, content, 'utf8');
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to write markdown file to ${filePath}: ${error.message}`);
    }
    throw new Error(`Failed to write markdown file to ${filePath}: Unknown error`);
  }
}

/**
 * Ensures a directory exists, creating it recursively if needed
 */
export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch (error) {
    // Directory doesn't exist, try to create it
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (mkdirError) {
      if (mkdirError instanceof Error) {
        throw new Error(`Failed to create directory ${dirPath}: ${mkdirError.message}`);
      }
      throw new Error(`Failed to create directory ${dirPath}: Unknown error`);
    }
  }
}

/**
 * Validates that the output path is valid and writable
 */
export async function validateOutputPath(filePath: string): Promise<void> {
  const resolvedPath = resolve(filePath);
  const dir = dirname(resolvedPath);
  const ext = extname(resolvedPath);
  
  // Check if the file extension is appropriate for markdown
  if (ext && ext !== '.md' && ext !== '.markdown') {
    throw new Error(`Invalid file extension: ${ext}. Expected .md or .markdown`);
  }
  
  // Check if the file already exists and is writable
  try {
    await fs.access(resolvedPath, fs.constants.F_OK);
    // File exists, check if it's writable
    try {
      await fs.access(resolvedPath, fs.constants.W_OK);
    } catch (error) {
      throw new Error(`File ${resolvedPath} exists but is not writable. Check file permissions.`);
    }
  } catch (error) {
    // File doesn't exist, check if the directory is writable
    try {
      await fs.access(dir, fs.constants.W_OK);
    } catch (dirError) {
      throw new Error(`Directory ${dir} is not writable. Check directory permissions.`);
    }
  }
}

/**
 * Checks if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads a file and returns its content as a string
 */
export async function readFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to read file ${filePath}: ${error.message}`);
    }
    throw new Error(`Failed to read file ${filePath}: Unknown error`);
  }
}

/**
 * Gets file stats for a given path
 */
export async function getFileStats(filePath: string): Promise<fs.FileStats> {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to get file stats for ${filePath}: ${error.message}`);
    }
    throw new Error(`Failed to get file stats for ${filePath}: Unknown error`);
  }
}

/**
 * Creates a backup of an existing file by appending .bak to the filename
 */
export async function createBackup(filePath: string): Promise<string> {
  const backupPath = `${filePath}.bak`;
  
  try {
    const exists = await fileExists(filePath);
    if (!exists) {
      throw new Error(`Cannot create backup: file ${filePath} does not exist`);
    }
    
    const content = await readFile(filePath);
    await fs.writeFile(backupPath, content, 'utf8');
    
    return backupPath;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to create backup of ${filePath}: ${error.message}`);
    }
    throw new Error(`Failed to create backup of ${filePath}: Unknown error`);
  }
}