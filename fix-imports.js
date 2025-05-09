import fs from "fs/promises"
import path from "path"
import { glob } from "glob"

// Define the root directory of your project
const ROOT_DIR = process.cwd()
const BACKUP_DIR = path.join(ROOT_DIR, "backup-imports")

// Create a backup function
async function createBackup(filePath) {
  const backupPath = path.join(BACKUP_DIR, path.relative(ROOT_DIR, filePath) + ".bak")

  try {
    // Create backup directory structure
    await fs.mkdir(path.dirname(backupPath), { recursive: true })

    // Copy the file content
    const content = await fs.readFile(filePath, "utf8")
    await fs.writeFile(backupPath, content, "utf8")

    return true
  } catch (error) {
    console.error(`Failed to backup ${filePath}:`, error)
    return false
  }
}

// Find all files that import from @/lib/kitespots-server
async function findFilesWithImport() {
  console.log("Searching for files importing from @/lib/kitespots-server...")

  // Find all TypeScript and JavaScript files in the app directory
  const files = await glob("src/app/**/*.{ts,tsx,js,jsx}", { cwd: ROOT_DIR })

  const results = []

  for (const file of files) {
    const fullPath = path.join(ROOT_DIR, file)

    try {
      const content = await fs.readFile(fullPath, "utf8")

      // Check if the file imports from @/lib/kitespots-server
      if (content.includes('from "@/lib/kitespots-server"') || content.includes("from '@/lib/kitespots-server'")) {
        results.push(file)
      }
    } catch (error) {
      console.error(`Error reading file ${file}:`, error)
    }
  }

  return results
}

// Update imports in a file
async function updateImportsInFile(filePath) {
  const fullPath = path.join(ROOT_DIR, filePath)

  try {
    // Create a backup first
    await createBackup(fullPath)

    // Read the file content
    let content = await fs.readFile(fullPath, "utf8")

    // Find what's being imported from kitespots-server
    const importMatch = content.match(/import\s+{([^}]+)}\s+from\s+["']@\/lib\/kitespots-server["']/)

    if (importMatch) {
      const imports = importMatch[1].split(",").map((i) => i.trim())

      // Replace the import with the correct path
      content = content.replace(
        /import\s+{([^}]+)}\s+from\s+["']@\/lib\/kitespots-server["']/,
        `import {$1} from "@/services/api-service"`,
      )

      // Write the updated content back to the file
      await fs.writeFile(fullPath, content, "utf8")
      console.log(`Updated imports in: ${filePath}`)

      return imports
    } else {
      console.log(`No matching import pattern found in: ${filePath}`)
      return []
    }
  } catch (error) {
    console.error(`Failed to update imports in ${filePath}:`, error)
    return []
  }
}

// Ensure kitespots-server.ts has the necessary exports
async function updateKitespotsServer(importedFunctions) {
  const filePath = path.join(ROOT_DIR, "src/lib/kitespots-server.ts")

  try {
    // Create a backup first
    await createBackup(filePath)

    // Read the current content
    let content = await fs.readFile(filePath, "utf8")

    // Add imports from api-service if they don't exist
    if (!content.includes('from "@/services/api-service"')) {
      content = `import { ${Array.from(new Set(importedFunctions)).join(", ")} } from "@/services/api-service";\n${content}`
    }

    // Add export functions for each imported function if they don't exist
    for (const func of new Set(importedFunctions)) {
      if (!content.includes(`export async function ${func}`)) {
        content += `\n\n// Re-export for backward compatibility
export async function ${func}(...args) {
  console.warn('${func} from kitespots-server.ts is deprecated. Use the client-side API service instead.');
  return ${func}(...args);
}`
      }
    }

    // Write the updated content back to the file
    await fs.writeFile(filePath, content, "utf8")
    console.log(`Updated kitespots-server.ts with re-exports for: ${Array.from(new Set(importedFunctions)).join(", ")}`)
  } catch (error) {
    console.error("Failed to update kitespots-server.ts:", error)
  }
}

async function main() {
  console.log("Starting import fix process...")

  // Create backup directory
  await fs.mkdir(BACKUP_DIR, { recursive: true })
  console.log(`Backup directory created at: ${BACKUP_DIR}`)

  // Find files with imports from @/lib/kitespots-server
  const files = await findFilesWithImport()
  console.log(`Found ${files.length} files with imports from @/lib/kitespots-server:`)
  files.forEach((file) => console.log(`- ${file}`))

  if (files.length === 0) {
    console.log("No files to update. Exiting.")
    return
  }

  // Update imports in each file and collect imported functions
  const allImportedFunctions = []

  for (const file of files) {
    const importedFunctions = await updateImportsInFile(file)
    allImportedFunctions.push(...importedFunctions)
  }

  // Update kitespots-server.ts to re-export the functions
  await updateKitespotsServer(allImportedFunctions)

  console.log("\nImport fix process completed!")
  console.log("Please check that everything is working correctly.")
  console.log("If there are any issues, you can restore from the backups at:", BACKUP_DIR)
}

main().catch((error) => {
  console.error("An error occurred during the import fix process:", error)
})

