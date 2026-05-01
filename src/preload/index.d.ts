import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      project: {
        scanLanguages: (gamePath: string) => Promise<string[]>
        setup: (config: any) => Promise<void>
        getCurrent: () => Promise<any>
      }
      glossary: {
        getAll: () => Promise<any[]>
        add: (entry: any) => Promise<any>
        update: (id: number, entry: any) => Promise<void>
        delete: (id: number) => Promise<void>
      }
      tm: {
        getAll: () => Promise<any[]>
        delete: (id: number) => Promise<void>
        clearUnused: () => Promise<void>
        search: (query: string) => Promise<any[]>
      }
      search: {
        searchBlocks: (query: string, options: any) => Promise<any[]>
        replaceBlockText: (blockId: number, newText: string, isOriginal: boolean) => Promise<void>
      }
    }
  }
}
