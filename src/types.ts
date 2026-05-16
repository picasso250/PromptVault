export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  BUCKET: R2Bucket;
  ADMIN_PASSWORD_HASH: string;
  SESSION_SECRET: string;
}

export type Status = "pending" | "approved" | "rejected";

export interface PromptRow {
  id: string;
  title: string;
  prompt_text: string;
  description: string | null;
  tags: string | null;
  image_key: string;
  image_type: string;
  image_size: number;
  status: Status;
  created_at: string;
  updated_at: string;
  moderated_at: string | null;
}
