export interface FileJob {
  key: string;
  userId: string;
  fileId: string;
}

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export type VectorStoreType = "pinecone" | "pgvector";

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

export type DocStatus = "new" | "processing" | "processed" | "failed";
export type ISODateString = string;

export interface LegalDocument {
  id: string;
  source_name: string;
  source_url: string;
  law_type: string | null;
  jurisdiction: string | null;
  last_crawled: ISODateString | null;
  last_updated: ISODateString | null;
  status: DocStatus;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface LegalDocumentJobData {
  id: string;
  source_url: string;
  law_type?: string;
  jurisdiction?: string;
}
