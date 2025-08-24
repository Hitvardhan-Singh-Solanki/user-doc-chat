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

export interface JwtPayload {
  id: string;
  email: string;
  role?: string;
}

export type Client = { res: any };

export type SSEData = {
  fileId: string;
  status: "failed" | "processed" | "processing";
  progress?: string | boolean | number | object;
  error: string | null;
};
