// Recursively collect files from a drag-and-drop FileSystemEntry (file or directory)
export async function entryToFiles(entry: any): Promise<File[]> {
  if (entry.isFile) {
    return new Promise(resolve => entry.file((f: File) => resolve([f]), () => resolve([])))
  }
  if (entry.isDirectory) {
    const reader = entry.createReader()
    const readBatch = (): Promise<any[]> =>
      new Promise(resolve => reader.readEntries(resolve, () => resolve([])))
    const entries: any[] = []
    let batch = await readBatch()
    while (batch.length > 0) {
      entries.push(...batch)
      batch = await readBatch()
    }
    const nested = await Promise.all(entries.map(entryToFiles))
    return nested.flat()
  }
  return []
}
