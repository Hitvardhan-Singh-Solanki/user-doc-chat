export interface FileJob {
  bucket: string;
  key: string;
  userId: string;
}

export type Vector = { id: string; values: number[]; metadata?: any };
