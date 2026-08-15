
import { dbService } from './db';

/**
 * Service to handle local file storage using IndexedDB.
 * Acts as a virtual local file system for the application.
 */
export const localFileStorage = {
  /**
   * Save a file to the local encrypted database.
   * @param file The file object from input[type=file]
   * @returns The unique ID of the stored file
   */
  save: async (file: File): Promise<string> => {
    return await dbService.saveFile(file);
  },

  /**
   * Retrieve a file URL for preview or download.
   * Creates a temporary object URL from the stored Blob.
   * @param id The unique ID of the stored file
   * @returns Object URL string or null if not found
   */
  getUrl: async (id: string): Promise<string | null> => {
    return await dbService.getFile(id);
  },

  /**
   * Retrieve a stored Blob without creating an object URL.
   * Used by the PDF preview pipeline so Electron never renders through blob URLs.
   */
  getBlob: async (id: string): Promise<Blob | null> => {
    return await dbService.getFileBlob(id);
  },
  
  /**
   * Revoke an object URL to free memory.
   * @param url The object URL to revoke
   */
  revoke: (url: string) => {
    URL.revokeObjectURL(url);
  }
};
