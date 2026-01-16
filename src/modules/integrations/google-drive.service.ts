import { Injectable, Logger } from '@nestjs/common';
import { GoogleService } from './google.service';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  iconLink?: string;
  createdTime?: Date;
  modifiedTime?: Date;
  size?: string;
  owners?: string[];
  shared?: boolean;
  starred?: boolean;
}

export interface DriveFileDetails extends DriveFile {
  description?: string;
  permissions?: Array<{
    email: string;
    role: string;
    type: string;
  }>;
  parents?: string[];
}

@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);

  // Map mime types to friendly names
  private readonly mimeTypeNames: Record<string, string> = {
    'application/vnd.google-apps.document': 'Google Doc',
    'application/vnd.google-apps.spreadsheet': 'Google Sheet',
    'application/vnd.google-apps.presentation': 'Google Slides',
    'application/vnd.google-apps.folder': 'Carpeta',
    'application/vnd.google-apps.form': 'Google Form',
    'application/pdf': 'PDF',
    'image/jpeg': 'Imagen JPEG',
    'image/png': 'Imagen PNG',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
    'text/plain': 'Texto',
    'application/zip': 'ZIP',
  };

  constructor(private readonly googleService: GoogleService) {}

  /**
   * Search files by name or content
   */
  async searchFiles(
    userId: string,
    query: string,
    options: {
      maxResults?: number;
      mimeType?: string;
      folderId?: string;
    } = {},
  ): Promise<DriveFile[]> {
    const drive = await this.googleService.getDriveClient(userId);
    const { maxResults = 20, mimeType, folderId } = options;

    // Build search query
    let q = `name contains '${query}' and trashed = false`;

    if (mimeType) {
      q += ` and mimeType = '${mimeType}'`;
    }

    if (folderId) {
      q += ` and '${folderId}' in parents`;
    }

    const response = await drive.files.list({
      q,
      pageSize: maxResults,
      fields: 'files(id, name, mimeType, webViewLink, iconLink, createdTime, modifiedTime, size, owners, shared, starred)',
      orderBy: 'modifiedTime desc',
    });

    const files = response.data.files || [];
    return files.map((file) => this.mapFileToDriveFile(file));
  }

  /**
   * List recent files
   */
  async listRecentFiles(
    userId: string,
    maxResults: number = 20,
  ): Promise<DriveFile[]> {
    const drive = await this.googleService.getDriveClient(userId);

    const response = await drive.files.list({
      q: 'trashed = false',
      pageSize: maxResults,
      fields: 'files(id, name, mimeType, webViewLink, iconLink, createdTime, modifiedTime, size, owners, shared, starred)',
      orderBy: 'viewedByMeTime desc',
    });

    const files = response.data.files || [];
    return files.map((file) => this.mapFileToDriveFile(file));
  }

  /**
   * List files by type (docs, sheets, slides, etc.)
   */
  async listFilesByType(
    userId: string,
    fileType: 'document' | 'spreadsheet' | 'presentation' | 'folder' | 'pdf',
    maxResults: number = 20,
  ): Promise<DriveFile[]> {
    const drive = await this.googleService.getDriveClient(userId);

    const mimeTypes: Record<string, string> = {
      document: 'application/vnd.google-apps.document',
      spreadsheet: 'application/vnd.google-apps.spreadsheet',
      presentation: 'application/vnd.google-apps.presentation',
      folder: 'application/vnd.google-apps.folder',
      pdf: 'application/pdf',
    };

    const mimeType = mimeTypes[fileType];
    const response = await drive.files.list({
      q: `mimeType = '${mimeType}' and trashed = false`,
      pageSize: maxResults,
      fields: 'files(id, name, mimeType, webViewLink, iconLink, createdTime, modifiedTime, size, owners, shared, starred)',
      orderBy: 'modifiedTime desc',
    });

    const files = response.data.files || [];
    return files.map((file) => this.mapFileToDriveFile(file));
  }

  /**
   * List files shared with me
   */
  async listSharedWithMe(
    userId: string,
    maxResults: number = 20,
  ): Promise<DriveFile[]> {
    const drive = await this.googleService.getDriveClient(userId);

    const response = await drive.files.list({
      q: 'sharedWithMe = true and trashed = false',
      pageSize: maxResults,
      fields: 'files(id, name, mimeType, webViewLink, iconLink, createdTime, modifiedTime, size, owners, shared, starred)',
      orderBy: 'sharedWithMeTime desc',
    });

    const files = response.data.files || [];
    return files.map((file) => this.mapFileToDriveFile(file));
  }

  /**
   * List starred files
   */
  async listStarredFiles(
    userId: string,
    maxResults: number = 20,
  ): Promise<DriveFile[]> {
    const drive = await this.googleService.getDriveClient(userId);

    const response = await drive.files.list({
      q: 'starred = true and trashed = false',
      pageSize: maxResults,
      fields: 'files(id, name, mimeType, webViewLink, iconLink, createdTime, modifiedTime, size, owners, shared, starred)',
      orderBy: 'modifiedTime desc',
    });

    const files = response.data.files || [];
    return files.map((file) => this.mapFileToDriveFile(file));
  }

  /**
   * Get detailed file information
   */
  async getFileInfo(userId: string, fileId: string): Promise<DriveFileDetails | null> {
    const drive = await this.googleService.getDriveClient(userId);

    try {
      const response = await drive.files.get({
        fileId,
        fields: 'id, name, mimeType, webViewLink, iconLink, createdTime, modifiedTime, size, owners, shared, starred, description, parents, permissions(emailAddress, role, type)',
      });

      const file = response.data;
      return {
        ...this.mapFileToDriveFile(file),
        description: file.description || undefined,
        permissions: file.permissions?.map((p) => ({
          email: p.emailAddress || '',
          role: p.role || '',
          type: p.type || '',
        })),
        parents: file.parents || undefined,
      };
    } catch (error) {
      this.logger.warn(`Failed to get file ${fileId}:`, error);
      return null;
    }
  }

  /**
   * Get storage quota information
   */
  async getStorageQuota(userId: string): Promise<{
    used: string;
    total: string;
    usedInDrive: string;
    usedInTrash: string;
  }> {
    const drive = await this.googleService.getDriveClient(userId);

    const response = await drive.about.get({
      fields: 'storageQuota',
    });

    const quota = response.data.storageQuota;
    return {
      used: this.formatBytes(parseInt(quota?.usage || '0')),
      total: this.formatBytes(parseInt(quota?.limit || '0')),
      usedInDrive: this.formatBytes(parseInt(quota?.usageInDrive || '0')),
      usedInTrash: this.formatBytes(parseInt(quota?.usageInDriveTrash || '0')),
    };
  }

  /**
   * Map Google Drive file to our interface
   */
  private mapFileToDriveFile(file: any): DriveFile {
    return {
      id: file.id || '',
      name: file.name || '(Sin nombre)',
      mimeType: file.mimeType || '',
      webViewLink: file.webViewLink,
      iconLink: file.iconLink,
      createdTime: file.createdTime ? new Date(file.createdTime) : undefined,
      modifiedTime: file.modifiedTime ? new Date(file.modifiedTime) : undefined,
      size: file.size ? this.formatBytes(parseInt(file.size)) : undefined,
      owners: file.owners?.map((o: any) => o.displayName || o.emailAddress) || [],
      shared: file.shared || false,
      starred: file.starred || false,
    };
  }

  /**
   * Get friendly name for mime type
   */
  getFriendlyTypeName(mimeType: string): string {
    return this.mimeTypeNames[mimeType] || 'Archivo';
  }

  /**
   * Format bytes to human readable
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
}
