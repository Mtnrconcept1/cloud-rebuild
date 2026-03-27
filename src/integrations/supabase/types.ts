export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type GenericRow = Record<string, any>;

type GenericTable = {
  Row: GenericRow;
  Insert: Record<string, any>;
  Update: Record<string, any>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: Record<string, GenericTable>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, never>;
  };
};
