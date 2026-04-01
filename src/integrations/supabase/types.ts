export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

export interface Database {
  public: {
    Tables: {
      [key: string]: {
        Row: AnyRow;
        Insert: AnyRow;
        Update: AnyRow;
      };
    };
    Views: {
      [key: string]: {
        Row: AnyRow;
      };
    };
    Functions: {
      [key: string]: {
        Args: AnyRow;
        Returns: AnyRow;
      };
    };
    Enums: {
      [key: string]: string;
    };
  };
}
