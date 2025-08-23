export interface FileJob {
  key: string;
  userId: string;
  fileId: string;
}

export type Vector = { id: string; values: number[]; metadata?: any };

export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination?: string;
  filename?: string;
  path?: string;
  buffer?: Buffer;
}
