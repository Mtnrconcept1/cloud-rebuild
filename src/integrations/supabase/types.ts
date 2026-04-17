export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type AnyRecord = Record<string, unknown>;

type GenericTable = {
  Row: AnyRecord;
  Insert: AnyRecord;
  Update: AnyRecord;
  Relationships: never[];
};

type GenericView = {
  Row: AnyRecord;
  Relationships: never[];
};

type GenericFunction = {
  Args: AnyRecord;
  Returns: unknown;
};

type ReservationStatus =
  | "pending"
  | "confirmed"
  | "arrived"
  | "cancelled"
  | "no_show"
  | string;

type ReservationCancellationActor = "customer" | "restaurant" | "admin" | "system" | string;

type ReservationRow = {
  id: string;
  restaurant_id: string;
  user_id: string;
  date: string;
  time: string;
  party_size: number;
  status: ReservationStatus;
  feature: string | null;
  notes: string | null;
  total_amount: number | null;
  metadata: Json | null;
  preorder_items: Json | null;
  created_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: ReservationCancellationActor | null;
  cancellation_reason_code: string | null;
  cancellation_reason_details: string | null;
  billing_fee_chf: number | null;
  restaurant_invoice_id: string | null;
  updated_at: string;
};

type ProfileRow = {
  id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  created_at?: string;
  updated_at?: string;
};

type RestaurantRow = {
  id: string;
  owner_id: string | null;
  name: string;
  is_active: boolean | null;
  created_at?: string;
  updated_at?: string;
};

type OrderRow = {
  id: string;
  restaurant_id: string;
  user_id?: string | null;
  order_number: string | null;
  total_amount: number | null;
  status: string | null;
  metadata: Json | null;
  created_at: string;
  updated_at?: string;
  restaurant_invoice_id: string | null;
};

type RestaurantInvoiceRow = {
  id: string;
  restaurant_id: string;
  period_start: string;
  period_end: string;
  amount_ht: number | null;
  amount_tva: number | null;
  amount_ttc: number | null;
  status: string | null;
  pdf_url: string | null;
  due_at: string | null;
  paid_at: string | null;
  invoice_number: string | null;
  created_at: string;
  updated_at?: string;
};

type RestaurantInvoiceSettingsRow = {
  id: string;
  restaurant_id: string;
  logo_url: string | null;
  company_name: string | null;
  company_address: string | null;
  company_city: string | null;
  company_postal_code: string | null;
  company_country?: string | null;
  siret?: string | null;
  vat_number: string | null;
  iban: string | null;
  bic: string | null;
  bank_name: string | null;
  payment_terms: string | null;
  footer_note: string | null;
  email: string | null;
  phone: string | null;
  website?: string | null;
  created_at?: string;
  updated_at?: string;
};

type ReservationCreateResultRow = {
  reservation_id: string | null;
  error_code: string | null;
  error_message: string | null;
};

type ReservationStatusResultRow = {
  updated: boolean | null;
  error_code: string | null;
  error_message: string | null;
};

type ReservationMutationResultRow = {
  ok: boolean | null;
  error_code: string | null;
  error_message: string | null;
};

type ReservationCustomerRow = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
};

type ReservationFeeRow = {
  reservations_count: number;
  reservations_amount: number;
};

type ReservationBillingHistoryRow = {
  id: string;
  restaurant_id: string;
  restaurant_name: string;
  reservation_date: string;
  reservation_time: string;
  party_size: number;
  customer_name: string | null;
  status: string;
  cancelled_by: string | null;
  cancellation_reason_code: string | null;
  cancellation_reason_details: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  billable: boolean;
  billing_fee_chf: number | null;
  invoice_id: string | null;
};

type ReservationFraudMetricRow = {
  restaurant_id: string;
  restaurant_name: string;
  confirmed_count: number;
  cancelled_by_restaurant_count: number;
  cancellation_rate: number;
  late_cancellations_count: number;
  top_reason_code: string | null;
  top_reason_count: number | null;
};

type RestaurantPaymentHistoryRow = {
  event_id: string;
  event_kind: string;
  direction: string;
  occurred_at: string;
  amount: number;
  currency: string;
  status: string;
  title: string;
  subtitle: string | null;
  payment_method: string | null;
  order_id: string | null;
  campaign_id: string | null;
  invoice_id: string | null;
};

export interface Database {
  public: {
    Tables: {
      reservations: {
        Row: ReservationRow;
        Insert: Partial<ReservationRow>;
        Update: Partial<ReservationRow>;
        Relationships: never[];
      };
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow>;
        Update: Partial<ProfileRow>;
        Relationships: never[];
      };
      restaurants: {
        Row: RestaurantRow;
        Insert: Partial<RestaurantRow>;
        Update: Partial<RestaurantRow>;
        Relationships: never[];
      };
      orders: {
        Row: OrderRow;
        Insert: Partial<OrderRow>;
        Update: Partial<OrderRow>;
        Relationships: never[];
      };
      restaurant_invoices: {
        Row: RestaurantInvoiceRow;
        Insert: Partial<RestaurantInvoiceRow>;
        Update: Partial<RestaurantInvoiceRow>;
        Relationships: never[];
      };
      restaurant_invoice_settings: {
        Row: RestaurantInvoiceSettingsRow;
        Insert: Partial<RestaurantInvoiceSettingsRow>;
        Update: Partial<RestaurantInvoiceSettingsRow>;
        Relationships: never[];
      };
      [key: string]: GenericTable;
    };
    Views: {
      [key: string]: GenericView;
    };
    Functions: {
      validate_and_create_reservation_safe: {
        Args: {
          p_restaurant_id: string;
          p_date: string;
          p_time: string;
          p_party_size: number;
          p_feature: string;
          p_metadata: Json;
          p_notes?: string | null;
        };
        Returns: ReservationCreateResultRow[];
      };
      update_restaurant_reservation_status_safe: {
        Args: {
          p_reservation_id: string;
          p_status: string;
        };
        Returns: ReservationStatusResultRow[];
      };
      cancel_reservation_by_customer: {
        Args: {
          p_reservation_id: string;
        };
        Returns: ReservationMutationResultRow[];
      };
      cancel_reservation_by_restaurant: {
        Args: {
          p_reservation_id: string;
          p_reason_code: string;
          p_reason_details?: string | null;
        };
        Returns: ReservationMutationResultRow[];
      };
      get_reservation_customers: {
        Args: {
          p_restaurant_id: string;
        };
        Returns: ReservationCustomerRow[];
      };
      compute_restaurant_reservation_fees: {
        Args: {
          p_restaurant_id: string;
          p_period_start: string;
          p_period_end: string;
        };
        Returns: ReservationFeeRow[];
      };
      admin_get_reservation_billing_history: {
        Args: {
          p_restaurant_id?: string | null;
          p_month: string;
        };
        Returns: ReservationBillingHistoryRow[];
      };
      admin_get_cancellation_fraud_metrics: {
        Args: {
          p_month: string;
        };
        Returns: ReservationFraudMetricRow[];
      };
      get_restaurant_payment_history: {
        Args: {
          p_restaurant_id: string;
          p_limit?: number | null;
          p_before?: string | null;
        };
        Returns: RestaurantPaymentHistoryRow[];
      };
      [key: string]: GenericFunction;
    };
    Enums: {
      app_role: "admin" | "restaurant_owner" | "courier" | "customer";
      [key: string]: string;
    };
  };
}
