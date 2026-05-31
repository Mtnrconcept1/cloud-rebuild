export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ad_campaign_events: {
        Row: {
          campaign_id: string
          conversion_type: string | null
          created_at: string
          dedupe_key: string
          event_type: string
          id: string
          occurred_at: string
          page: string | null
          payload: Json
          restaurant_id: string
          source: string | null
          user_id: string | null
        }
        Insert: {
          campaign_id: string
          conversion_type?: string | null
          created_at?: string
          dedupe_key: string
          event_type: string
          id?: string
          occurred_at?: string
          page?: string | null
          payload?: Json
          restaurant_id: string
          source?: string | null
          user_id?: string | null
        }
        Update: {
          campaign_id?: string
          conversion_type?: string | null
          created_at?: string
          dedupe_key?: string
          event_type?: string
          id?: string
          occurred_at?: string
          page?: string | null
          payload?: Json
          restaurant_id?: string
          source?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaign_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_campaign_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_campaigns: {
        Row: {
          activated_at: string | null
          body: string | null
          budget_daily: number | null
          conversion_rate: number
          channels: Json | null
          clicks: number | null
          cpc_rate: number
          conversions: number | null
          cpm_rate: number
          created_at: string | null
          daily_spent: number
          daily_spent_date: string
          ends_at: string | null
          id: string
          image_url: string | null
          impressions: number | null
          paid_amount: number
          paid_at: string | null
          payment_method: string | null
          payment_status: string
          pricing_strategy: string
          restaurant_id: string
          scheduled_at: string | null
          spent: number | null
          starts_at: string | null
          status: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          target_criteria: Json | null
          target_pages: Json | null
          title: string
          total_budget: number | null
          type: string
          updated_at: string | null
        }
        Insert: {
          activated_at?: string | null
          body?: string | null
          budget_daily?: number | null
          conversion_rate?: number
          channels?: Json | null
          clicks?: number | null
          cpc_rate?: number
          conversions?: number | null
          cpm_rate?: number
          created_at?: string | null
          daily_spent?: number
          daily_spent_date?: string
          ends_at?: string | null
          id?: string
          image_url?: string | null
          impressions?: number | null
          paid_amount?: number
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string
          pricing_strategy?: string
          restaurant_id: string
          scheduled_at?: string | null
          spent?: number | null
          starts_at?: string | null
          status?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          target_criteria?: Json | null
          target_pages?: Json | null
          title: string
          total_budget?: number | null
          type: string
          updated_at?: string | null
        }
        Update: {
          activated_at?: string | null
          body?: string | null
          budget_daily?: number | null
          conversion_rate?: number
          channels?: Json | null
          clicks?: number | null
          cpc_rate?: number
          conversions?: number | null
          cpm_rate?: number
          created_at?: string | null
          daily_spent?: number
          daily_spent_date?: string
          ends_at?: string | null
          id?: string
          image_url?: string | null
          impressions?: number | null
          paid_amount?: number
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string
          pricing_strategy?: string
          restaurant_id?: string
          scheduled_at?: string | null
          spent?: number | null
          starts_at?: string | null
          status?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          target_criteria?: Json | null
          target_pages?: Json | null
          title?: string
          total_budget?: number | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      allergens: {
        Row: {
          icon_url: string | null
          id: string
          name: string
        }
        Insert: {
          icon_url?: string | null
          id?: string
          name: string
        }
        Update: {
          icon_url?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      anti_waste_offers: {
        Row: {
          available_date: string
          created_at: string
          description: string | null
          discounted_price: number
          id: string
          image_url: string | null
          is_active: boolean | null
          offer_type: string
          original_price: number
          pickup_end: string
          pickup_start: string
          quantity_available: number
          restaurant_id: string
          title: string
        }
        Insert: {
          available_date: string
          created_at?: string
          description?: string | null
          discounted_price: number
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          offer_type?: string
          original_price: number
          pickup_end: string
          pickup_start: string
          quantity_available?: number
          restaurant_id: string
          title: string
        }
        Update: {
          available_date?: string
          created_at?: string
          description?: string | null
          discounted_price?: number
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          offer_type?: string
          original_price?: number
          pickup_end?: string
          pickup_start?: string
          quantity_available?: number
          restaurant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "anti_waste_offers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      cart_item_modifiers: {
        Row: {
          cart_item_id: string
          id: string
          modifier_option_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          cart_item_id: string
          id?: string
          modifier_option_id: string
          quantity?: number
          unit_price: number
        }
        Update: {
          cart_item_id?: string
          id?: string
          modifier_option_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "cart_item_modifiers_cart_item_id_fkey"
            columns: ["cart_item_id"]
            isOneToOne: false
            referencedRelation: "cart_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_item_modifiers_modifier_option_id_fkey"
            columns: ["modifier_option_id"]
            isOneToOne: false
            referencedRelation: "dish_modifier_options"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          dish_id: string
          id: string
          quantity: number
          special_instructions: string | null
          unit_price: number
        }
        Insert: {
          cart_id: string
          created_at?: string
          dish_id: string
          id?: string
          quantity?: number
          special_instructions?: string | null
          unit_price: number
        }
        Update: {
          cart_id?: string
          created_at?: string
          dish_id?: string
          id?: string
          quantity?: number
          special_instructions?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          restaurant_id: string
          session_id: string | null
          status: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          restaurant_id: string
          session_id?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          restaurant_id?: string
          session_id?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "restaurant_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      chef_table_drops: {
        Row: {
          chef_name: string
          created_at: string | null
          description: string | null
          dish_name: string
          drop_time: string
          id: string
          image_url: string | null
          is_active: boolean | null
          original_price: number | null
          price: number
          remaining_portions: number
          restaurant_id: string | null
          total_portions: number
          updated_at: string | null
        }
        Insert: {
          chef_name: string
          created_at?: string | null
          description?: string | null
          dish_name: string
          drop_time: string
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          original_price?: number | null
          price: number
          remaining_portions: number
          restaurant_id?: string | null
          total_portions: number
          updated_at?: string | null
        }
        Update: {
          chef_name?: string
          created_at?: string | null
          description?: string | null
          dish_name?: string
          drop_time?: string
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          original_price?: number | null
          price?: number
          remaining_portions?: number
          restaurant_id?: string | null
          total_portions?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chef_table_drops_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      clicks: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          impression_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          impression_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          impression_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clicks_impression_id_fkey"
            columns: ["impression_id"]
            isOneToOne: false
            referencedRelation: "impressions"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_restaurants: {
        Row: {
          collection_id: string
          restaurant_id: string
          sort_order: number | null
        }
        Insert: {
          collection_id: string
          restaurant_id: string
          sort_order?: number | null
        }
        Update: {
          collection_id?: string
          restaurant_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "collection_restaurants_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_restaurants_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          start_date: string | null
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          start_date?: string | null
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          start_date?: string | null
          title?: string
        }
        Relationships: []
      }
      compensations: {
        Row: {
          amount: number
          created_at: string
          id: string
          issued_by: string | null
          reason: string
          ticket_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          issued_by?: string | null
          reason: string
          ticket_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          issued_by?: string | null
          reason?: string
          ticket_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compensations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          order_id: string | null
          participant_ids: string[]
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id?: string | null
          participant_ids?: string[]
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string | null
          participant_ids?: string[]
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_documents: {
        Row: {
          courier_id: string
          created_at: string
          document_type: string
          expires_at: string | null
          file_url: string
          id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          courier_id: string
          created_at?: string
          document_type: string
          expires_at?: string | null
          file_url: string
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          courier_id?: string
          created_at?: string
          document_type?: string
          expires_at?: string | null
          file_url?: string
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_documents_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_earnings: {
        Row: {
          amount: number
          courier_id: string
          created_at: string
          description: string | null
          dispatch_job_id: string | null
          id: string
          type: string
        }
        Insert: {
          amount: number
          courier_id: string
          created_at?: string
          description?: string | null
          dispatch_job_id?: string | null
          id?: string
          type: string
        }
        Update: {
          amount?: number
          courier_id?: string
          created_at?: string
          description?: string | null
          dispatch_job_id?: string | null
          id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_earnings_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_earnings_dispatch_job_id_fkey"
            columns: ["dispatch_job_id"]
            isOneToOne: false
            referencedRelation: "dispatch_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_locations: {
        Row: {
          accuracy: number | null
          courier_id: string
          heading: number | null
          id: string
          lat: number
          lng: number
          recorded_at: string
          speed: number | null
        }
        Insert: {
          accuracy?: number | null
          courier_id: string
          heading?: number | null
          id?: string
          lat: number
          lng: number
          recorded_at?: string
          speed?: number | null
        }
        Update: {
          accuracy?: number | null
          courier_id?: string
          heading?: number | null
          id?: string
          lat?: number
          lng?: number
          recorded_at?: string
          speed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "courier_locations_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_shifts: {
        Row: {
          courier_id: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          start_time: string
          zone: string | null
        }
        Insert: {
          courier_id: string
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          start_time: string
          zone?: string | null
        }
        Update: {
          courier_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          start_time?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courier_shifts_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
        ]
      }
      couriers: {
        Row: {
          acceptance_rate: number | null
          avg_delivery_time_min: number | null
          completion_rate: number | null
          created_at: string
          current_lat: number | null
          current_lng: number | null
          first_name: string | null
          iban: string | null
          id: string
          is_online: boolean | null
          last_location_at: string | null
          last_name: string | null
          license_plate: string | null
          phone: string | null
          rating: number | null
          status: string
          total_deliveries: number | null
          updated_at: string
          user_id: string
          vehicle_type: string
        }
        Insert: {
          acceptance_rate?: number | null
          avg_delivery_time_min?: number | null
          completion_rate?: number | null
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          first_name?: string | null
          iban?: string | null
          id?: string
          is_online?: boolean | null
          last_location_at?: string | null
          last_name?: string | null
          license_plate?: string | null
          phone?: string | null
          rating?: number | null
          status?: string
          total_deliveries?: number | null
          updated_at?: string
          user_id: string
          vehicle_type?: string
        }
        Update: {
          acceptance_rate?: number | null
          avg_delivery_time_min?: number | null
          completion_rate?: number | null
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          first_name?: string | null
          iban?: string | null
          id?: string
          is_online?: boolean | null
          last_location_at?: string | null
          last_name?: string | null
          license_plate?: string | null
          phone?: string | null
          rating?: number | null
          status?: string
          total_deliveries?: number | null
          updated_at?: string
          user_id?: string
          vehicle_type?: string
        }
        Relationships: []
      }
      credit_notes: {
        Row: {
          amount: number
          credit_note_number: string
          id: string
          invoice_id: string
          issued_at: string
          reason: string | null
        }
        Insert: {
          amount: number
          credit_note_number: string
          id?: string
          invoice_id: string
          issued_at?: string
          reason?: string | null
        }
        Update: {
          amount?: number
          credit_note_number?: string
          id?: string
          invoice_id?: string
          issued_at?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      cuisines: {
        Row: {
          created_at: string
          icon_url: string | null
          id: string
          keywords: string[]
          name: string
          slug: string | null
        }
        Insert: {
          created_at?: string
          icon_url?: string | null
          id?: string
          keywords?: string[]
          name: string
          slug?: string | null
        }
        Update: {
          created_at?: string
          icon_url?: string | null
          id?: string
          keywords?: string[]
          name?: string
          slug?: string | null
        }
        Relationships: []
      }
      delivery_batches: {
        Row: {
          courier_id: string | null
          created_at: string
          estimated_total_distance_meters: number | null
          estimated_total_duration_minutes: number | null
          id: string
          status: string | null
        }
        Insert: {
          courier_id?: string | null
          created_at?: string
          estimated_total_distance_meters?: number | null
          estimated_total_duration_minutes?: number | null
          id?: string
          status?: string | null
        }
        Update: {
          courier_id?: string | null
          created_at?: string
          estimated_total_distance_meters?: number | null
          estimated_total_duration_minutes?: number | null
          id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_batches_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_routes: {
        Row: {
          actual_arrival_at: string | null
          batch_id: string
          dispatch_job_id: string
          estimated_arrival_at: string | null
          id: string
          location_lat: number
          location_lng: number
          stop_sequence: number
          stop_type: string
        }
        Insert: {
          actual_arrival_at?: string | null
          batch_id: string
          dispatch_job_id: string
          estimated_arrival_at?: string | null
          id?: string
          location_lat: number
          location_lng: number
          stop_sequence: number
          stop_type: string
        }
        Update: {
          actual_arrival_at?: string | null
          batch_id?: string
          dispatch_job_id?: string
          estimated_arrival_at?: string | null
          id?: string
          location_lat?: number
          location_lng?: number
          stop_sequence?: number
          stop_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_routes_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "delivery_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_routes_dispatch_job_id_fkey"
            columns: ["dispatch_job_id"]
            isOneToOne: false
            referencedRelation: "dispatch_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_tracking: {
        Row: {
          created_at: string
          current_lat: number | null
          current_lng: number | null
          delivered_at: string | null
          delivery_lat: number | null
          delivery_lng: number | null
          driver_name: string | null
          driver_phone: string | null
          estimated_arrival: string | null
          id: string
          order_id: string
          picked_up_at: string | null
          restaurant_lat: number | null
          restaurant_lng: number | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          delivered_at?: string | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          driver_name?: string | null
          driver_phone?: string | null
          estimated_arrival?: string | null
          id?: string
          order_id: string
          picked_up_at?: string | null
          restaurant_lat?: number | null
          restaurant_lng?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          delivered_at?: string | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          driver_name?: string | null
          driver_phone?: string | null
          estimated_arrival?: string | null
          id?: string
          order_id?: string
          picked_up_at?: string | null
          restaurant_lat?: number | null
          restaurant_lng?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_tracking_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          last_seen: string | null
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_seen?: string | null
          platform?: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_seen?: string | null
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      dish_allergens: {
        Row: {
          allergen_id: string
          dish_id: string
        }
        Insert: {
          allergen_id: string
          dish_id: string
        }
        Update: {
          allergen_id?: string
          dish_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dish_allergens_allergen_id_fkey"
            columns: ["allergen_id"]
            isOneToOne: false
            referencedRelation: "allergens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dish_allergens_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
        ]
      }
      dish_availability_windows: {
        Row: {
          day_of_week: number
          dish_id: string
          end_time: string
          id: string
          start_time: string
        }
        Insert: {
          day_of_week: number
          dish_id: string
          end_time: string
          id?: string
          start_time: string
        }
        Update: {
          day_of_week?: number
          dish_id?: string
          end_time?: string
          id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "dish_availability_windows_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
        ]
      }
      dish_images: {
        Row: {
          dish_id: string
          id: string
          image_url: string
          is_primary: boolean | null
          sort_order: number | null
        }
        Insert: {
          dish_id: string
          id?: string
          image_url: string
          is_primary?: boolean | null
          sort_order?: number | null
        }
        Update: {
          dish_id?: string
          id?: string
          image_url?: string
          is_primary?: boolean | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dish_images_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
        ]
      }
      dish_modifier_groups: {
        Row: {
          dish_id: string
          id: string
          is_required: boolean | null
          max_selections: number | null
          min_selections: number | null
          name: string
          sort_order: number | null
        }
        Insert: {
          dish_id: string
          id?: string
          is_required?: boolean | null
          max_selections?: number | null
          min_selections?: number | null
          name: string
          sort_order?: number | null
        }
        Update: {
          dish_id?: string
          id?: string
          is_required?: boolean | null
          max_selections?: number | null
          min_selections?: number | null
          name?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dish_modifier_groups_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
        ]
      }
      dish_modifier_options: {
        Row: {
          group_id: string
          id: string
          is_available: boolean | null
          name: string
          price_adjustment: number | null
          sort_order: number | null
        }
        Insert: {
          group_id: string
          id?: string
          is_available?: boolean | null
          name: string
          price_adjustment?: number | null
          sort_order?: number | null
        }
        Update: {
          group_id?: string
          id?: string
          is_available?: boolean | null
          name?: string
          price_adjustment?: number | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dish_modifier_options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "dish_modifier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      dish_tags: {
        Row: {
          dish_id: string
          tag: string
        }
        Insert: {
          dish_id: string
          tag: string
        }
        Update: {
          dish_id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "dish_tags_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
        ]
      }
      dish_variants: {
        Row: {
          dish_id: string
          id: string
          is_available: boolean | null
          name: string
          price: number
        }
        Insert: {
          dish_id: string
          id?: string
          is_available?: boolean | null
          name: string
          price: number
        }
        Update: {
          dish_id?: string
          id?: string
          is_available?: boolean | null
          name?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "dish_variants_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
        ]
      }
      dishes: {
        Row: {
          base_price: number
          calories: number | null
          created_at: string
          description: string | null
          id: string
          is_available: boolean | null
          is_popular: boolean | null
          menu_category_id: string
          name: string
          preparation_time_min: number | null
          updated_at: string
        }
        Insert: {
          base_price: number
          calories?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_available?: boolean | null
          is_popular?: boolean | null
          menu_category_id: string
          name: string
          preparation_time_min?: number | null
          updated_at?: string
        }
        Update: {
          base_price?: number
          calories?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_available?: boolean | null
          is_popular?: boolean | null
          menu_category_id?: string
          name?: string
          preparation_time_min?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dishes_menu_category_id_fkey"
            columns: ["menu_category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_attempts: {
        Row: {
          courier_id: string
          dispatch_job_id: string
          distance_to_pickup_meters: number | null
          estimated_earnings: number | null
          id: string
          offered_at: string
          responded_at: string | null
          status: string
          timeout_seconds: number | null
        }
        Insert: {
          courier_id: string
          dispatch_job_id: string
          distance_to_pickup_meters?: number | null
          estimated_earnings?: number | null
          id?: string
          offered_at?: string
          responded_at?: string | null
          status?: string
          timeout_seconds?: number | null
        }
        Update: {
          courier_id?: string
          dispatch_job_id?: string
          distance_to_pickup_meters?: number | null
          estimated_earnings?: number | null
          id?: string
          offered_at?: string
          responded_at?: string | null
          status?: string
          timeout_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_attempts_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_attempts_dispatch_job_id_fkey"
            columns: ["dispatch_job_id"]
            isOneToOne: false
            referencedRelation: "dispatch_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_jobs: {
        Row: {
          accepted_at: string | null
          actual_duration_minutes: number | null
          arrived_dropoff_at: string | null
          arrived_pickup_at: string | null
          assigned_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          courier_id: string | null
          created_at: string
          delivered_at: string | null
          distance_meters: number | null
          dropoff_lat: number | null
          dropoff_lng: number | null
          earnings_base: number | null
          earnings_bonus: number | null
          earnings_tip: number | null
          estimated_duration_minutes: number | null
          id: string
          order_id: string
          picked_up_at: string | null
          pickup_lat: number | null
          pickup_lng: number | null
          proof_photo_url: string | null
          route_geometry: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          actual_duration_minutes?: number | null
          arrived_dropoff_at?: string | null
          arrived_pickup_at?: string | null
          assigned_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          courier_id?: string | null
          created_at?: string
          delivered_at?: string | null
          distance_meters?: number | null
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          earnings_base?: number | null
          earnings_bonus?: number | null
          earnings_tip?: number | null
          estimated_duration_minutes?: number | null
          id?: string
          order_id: string
          picked_up_at?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          proof_photo_url?: string | null
          route_geometry?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          actual_duration_minutes?: number | null
          arrived_dropoff_at?: string | null
          arrived_pickup_at?: string | null
          assigned_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          courier_id?: string | null
          created_at?: string
          delivered_at?: string | null
          distance_meters?: number | null
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          earnings_base?: number | null
          earnings_bonus?: number | null
          earnings_tip?: number | null
          estimated_duration_minutes?: number | null
          id?: string
          order_id?: string
          picked_up_at?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          proof_photo_url?: string | null
          route_geometry?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_jobs_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      edge_function_audit_logs: {
        Row: {
          action: string
          actor_roles: string[]
          actor_user_id: string | null
          created_at: string
          error_message: string | null
          function_name: string
          id: string
          is_service_role: boolean
          request_metadata: Json
          status: string
          target_entity_id: string | null
          target_entity_type: string | null
        }
        Insert: {
          action?: string
          actor_roles?: string[]
          actor_user_id?: string | null
          created_at?: string
          error_message?: string | null
          function_name: string
          id?: string
          is_service_role?: boolean
          request_metadata?: Json
          status: string
          target_entity_id?: string | null
          target_entity_type?: string | null
        }
        Update: {
          action?: string
          actor_roles?: string[]
          actor_user_id?: string | null
          created_at?: string
          error_message?: string | null
          function_name?: string
          id?: string
          is_service_role?: boolean
          request_metadata?: Json
          status?: string
          target_entity_id?: string | null
          target_entity_type?: string | null
        }
        Relationships: []
      }
      email_queue: {
        Row: {
          body_html: string | null
          body_text: string | null
          created_at: string | null
          error: string | null
          id: string
          metadata: Json | null
          sent_at: string | null
          status: string | null
          subject: string
          to_email: string
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          created_at?: string | null
          error?: string | null
          id?: string
          metadata?: Json | null
          sent_at?: string | null
          status?: string | null
          subject: string
          to_email: string
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          created_at?: string | null
          error?: string | null
          id?: string
          metadata?: Json | null
          sent_at?: string | null
          status?: string | null
          subject?: string
          to_email?: string
        }
        Relationships: []
      }
      event_store: {
        Row: {
          entity_id: string
          entity_type: string
          event_name: string
          id: string
          occurred_at: string
          payload: Json | null
        }
        Insert: {
          entity_id: string
          entity_type: string
          event_name: string
          id?: string
          occurred_at?: string
          payload?: Json | null
        }
        Update: {
          entity_id?: string
          entity_type?: string
          event_name?: string
          id?: string
          occurred_at?: string
          payload?: Json | null
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          restaurant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          restaurant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          restaurant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean
          label: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          label: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          label?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      feature_store: {
        Row: {
          computed_at: string
          entity_id: string
          entity_type: string
          feature_name: string
          feature_value: number
        }
        Insert: {
          computed_at?: string
          entity_id: string
          entity_type: string
          feature_name: string
          feature_value: number
        }
        Update: {
          computed_at?: string
          entity_id?: string
          entity_type?: string
          feature_name?: string
          feature_value?: number
        }
        Relationships: []
      }
      flash_sales: {
        Row: {
          created_at: string
          delivery_available: boolean
          description: string | null
          discounted_price: number
          id: string
          image_url: string | null
          is_active: boolean
          original_price: number
          quantity_available: number
          restaurant_id: string
          sale_date: string
          sale_end: string
          sale_start: string
          takeaway_available: boolean
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_available?: boolean
          description?: string | null
          discounted_price: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          original_price: number
          quantity_available?: number
          restaurant_id: string
          sale_date: string
          sale_end: string
          sale_start: string
          takeaway_available?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_available?: boolean
          description?: string | null
          discounted_price?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          original_price?: number
          quantity_available?: number
          restaurant_id?: string
          sale_date?: string
          sale_end?: string
          sale_start?: string
          takeaway_available?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flash_sales_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_signals: {
        Row: {
          created_at: string
          id: string
          metadata: Json | null
          order_id: string | null
          risk_score: number
          signal_type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json | null
          order_id?: string | null
          risk_score: number
          signal_type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json | null
          order_id?: string | null
          risk_score?: number
          signal_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fraud_signals_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_signals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      gift_cards: {
        Row: {
          code: string
          created_at: string
          currency: string
          current_balance: number
          expires_at: string | null
          id: string
          initial_balance: number
          purchaser_id: string | null
          recipient_email: string | null
          status: string | null
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          current_balance: number
          expires_at?: string | null
          id?: string
          initial_balance: number
          purchaser_id?: string | null
          recipient_email?: string | null
          status?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          current_balance?: number
          expires_at?: string | null
          id?: string
          initial_balance?: number
          purchaser_id?: string | null
          recipient_email?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_cards_purchaser_id_fkey"
            columns: ["purchaser_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      gift_points: {
        Row: {
          claim_code: string | null
          claimed_at: string | null
          created_at: string
          expires_at: string
          id: string
          message: string | null
          points_amount: number
          recipient_email: string
          recipient_id: string | null
          sender_id: string
          status: string
        }
        Insert: {
          claim_code?: string | null
          claimed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          message?: string | null
          points_amount: number
          recipient_email: string
          recipient_id?: string | null
          sender_id: string
          status?: string
        }
        Update: {
          claim_code?: string | null
          claimed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          message?: string | null
          points_amount?: number
          recipient_email?: string
          recipient_id?: string | null
          sender_id?: string
          status?: string
        }
        Relationships: []
      }
      group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          order_id: string | null
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          order_id?: string | null
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          order_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "order_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      impressions: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          source: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          source?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          source?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      incident_reports: {
        Row: {
          created_at: string
          description: string
          id: string
          incident_type: string
          reporter_id: string
          reporter_role: string
          status: string | null
          target_id: string | null
          target_role: string | null
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          incident_type: string
          reporter_id: string
          reporter_role: string
          status?: string | null
          target_id?: string | null
          target_role?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          incident_type?: string
          reporter_id?: string
          reporter_role?: string
          status?: string | null
          target_id?: string | null
          target_role?: string | null
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          branch_id: string
          dish_id: string | null
          id: string
          is_managed: boolean | null
          low_stock_threshold: number | null
          name: string
          quantity: number | null
          updated_at: string
        }
        Insert: {
          branch_id: string
          dish_id?: string | null
          id?: string
          is_managed?: boolean | null
          low_stock_threshold?: number | null
          name: string
          quantity?: number | null
          updated_at?: string
        }
        Update: {
          branch_id?: string
          dish_id?: string | null
          id?: string
          is_managed?: boolean | null
          low_stock_threshold?: number | null
          name?: string
          quantity?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "restaurant_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_dish_id_fkey"
            columns: ["dish_id"]
            isOneToOne: false
            referencedRelation: "dishes"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          quantity_change: number
          reason: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          quantity_change: number
          reason: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          quantity_change?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          currency: string
          file_url: string | null
          id: string
          invoice_number: string
          issued_at: string
          order_id: string | null
          recipient_id: string
          recipient_type: string
          subtotal: number
          tax_total: number
          total: number
        }
        Insert: {
          currency?: string
          file_url?: string | null
          id?: string
          invoice_number: string
          issued_at?: string
          order_id?: string | null
          recipient_id: string
          recipient_type: string
          subtotal: number
          tax_total: number
          total: number
        }
        Update: {
          currency?: string
          file_url?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string
          order_id?: string | null
          recipient_id?: string
          recipient_type?: string
          subtotal?: number
          tax_total?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      launch_pack_service_fulfillments: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          id: string
          metadata: Json
          notes: string | null
          restaurant_pack_id: string
          scheduled_at: string | null
          service_label: string
          service_slug: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          notes?: string | null
          restaurant_pack_id: string
          scheduled_at?: string | null
          service_label: string
          service_slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          notes?: string | null
          restaurant_pack_id?: string
          scheduled_at?: string | null
          service_label?: string
          service_slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "launch_pack_service_fulfillments_restaurant_pack_id_fkey"
            columns: ["restaurant_pack_id"]
            isOneToOne: false
            referencedRelation: "restaurant_launch_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      launch_packs: {
        Row: {
          badge_label: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          position: number
          price_chf: number
          services: Json
          slug: string
          stripe_price_id: string | null
          updated_at: string
        }
        Insert: {
          badge_label?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          position?: number
          price_chf: number
          services?: Json
          slug: string
          stripe_price_id?: string | null
          updated_at?: string
        }
        Update: {
          badge_label?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          position?: number
          price_chf?: number
          services?: Json
          slug?: string
          stripe_price_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      loyalty_accounts: {
        Row: {
          created_at: string
          current_points: number | null
          lifetime_points: number | null
          tier_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_points?: number | null
          lifetime_points?: number | null
          tier_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_points?: number | null
          lifetime_points?: number | null
          tier_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "loyalty_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      loyalty_tiers: {
        Row: {
          benefits: Json | null
          created_at: string
          id: string
          min_points: number
          multiplier: number | null
          name: string
        }
        Insert: {
          benefits?: Json | null
          created_at?: string
          id?: string
          min_points: number
          multiplier?: number | null
          name: string
        }
        Update: {
          benefits?: Json | null
          created_at?: string
          id?: string
          min_points?: number
          multiplier?: number | null
          name?: string
        }
        Relationships: []
      }
      loyalty_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          order_id: string | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          transaction_type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_formula_categories: {
        Row: {
          category: string
          course_order: number
          formula_id: string
          id: string
        }
        Insert: {
          category: string
          course_order?: number
          formula_id: string
          id?: string
        }
        Update: {
          category?: string
          course_order?: number
          formula_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_formula_categories_formula_id_fkey"
            columns: ["formula_id"]
            isOneToOne: false
            referencedRelation: "meal_formulas"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_formulas: {
        Row: {
          applies_to: string
          availability: Json | null
          created_at: string
          description: string | null
          discount_percent: number
          formula_key: string
          id: string
          image_url: string | null
          is_active: boolean
          is_standard: boolean | null
          name: string
          restaurant_id: string
        }
        Insert: {
          applies_to: string
          availability?: Json | null
          created_at?: string
          description?: string | null
          discount_percent: number
          formula_key: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_standard?: boolean | null
          name: string
          restaurant_id: string
        }
        Update: {
          applies_to?: string
          availability?: Json | null
          created_at?: string
          description?: string | null
          discount_percent?: number
          formula_key?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_standard?: boolean | null
          name?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_formulas_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          branch_id: string
          category_id: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
        }
        Insert: {
          branch_id: string
          category_id?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
        }
        Update: {
          branch_id?: string
          category_id?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "restaurant_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          exclusive_type: string | null
          id: string
          image_url: string | null
          is_available: boolean | null
          is_exclusive: boolean | null
          name: string
          price: number
          restaurant_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          exclusive_type?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean | null
          is_exclusive?: boolean | null
          name: string
          price: number
          restaurant_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          exclusive_type?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean | null
          is_exclusive?: boolean | null
          name?: string
          price?: number
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          message_type: string
          metadata: Json | null
          read_at: string | null
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          message_type?: string
          metadata?: Json | null
          read_at?: string | null
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          message_type?: string
          metadata?: Json | null
          read_at?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_predictions: {
        Row: {
          actual_value: number | null
          confidence_score: number | null
          created_at: string
          entity_id: string
          id: string
          predicted_value: number
          prediction_type: string
        }
        Insert: {
          actual_value?: number | null
          confidence_score?: number | null
          created_at?: string
          entity_id: string
          id?: string
          predicted_value: number
          prediction_type: string
        }
        Update: {
          actual_value?: number | null
          confidence_score?: number | null
          created_at?: string
          entity_id?: string
          id?: string
          predicted_value?: number
          prediction_type?: string
        }
        Relationships: []
      }
      notification_campaigns: {
        Row: {
          body: string
          category: string
          channels: Json
          created_at: string
          created_by: string | null
          id: string
          image_url: string | null
          scheduled_at: string | null
          sent_at: string | null
          status: string
          target_cities: string[]
          target_roles: string[]
          title: string
        }
        Insert: {
          body: string
          category?: string
          channels?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          target_cities?: string[]
          target_roles?: string[]
          title: string
        }
        Update: {
          body?: string
          category?: string
          channels?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          target_cities?: string[]
          target_roles?: string[]
          title?: string
        }
        Relationships: []
      }
      notification_deliveries: {
        Row: {
          attempts: number
          channel: string
          created_at: string
          id: string
          last_error: string | null
          notification_id: string
          provider: string | null
          scheduled_at: string | null
          sent_at: string | null
          status: string
          target: string | null
        }
        Insert: {
          attempts?: number
          channel: string
          created_at?: string
          id?: string
          last_error?: string | null
          notification_id: string
          provider?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          target?: string | null
        }
        Update: {
          attempts?: number
          channel?: string
          created_at?: string
          id?: string
          last_error?: string | null
          notification_id?: string
          provider?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          target?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          categories: Json
          channels: Json
          created_at: string
          quiet_hours: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          categories?: Json
          channels?: Json
          created_at?: string
          quiet_hours?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          categories?: Json
          channels?: Json
          created_at?: string
          quiet_hours?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_subscriptions: {
        Row: {
          created_at: string
          filters: Json
          id: string
          topic: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          topic: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          topic?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          category: string
          created_at: string
          data: Json
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          category: string
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      order_addresses: {
        Row: {
          access_code: string | null
          address_line_1: string
          address_line_2: string | null
          city: string
          country: string
          delivery_instructions: string | null
          id: string
          latitude: number | null
          longitude: number | null
          order_id: string
          postal_code: string
          type: string
        }
        Insert: {
          access_code?: string | null
          address_line_1: string
          address_line_2?: string | null
          city: string
          country: string
          delivery_instructions?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          order_id: string
          postal_code: string
          type: string
        }
        Update: {
          access_code?: string | null
          address_line_1?: string
          address_line_2?: string | null
          city?: string
          country?: string
          delivery_instructions?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          order_id?: string
          postal_code?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_addresses_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          order_id: string
          payload: Json | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          order_id: string
          payload?: Json | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          order_id?: string
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_fees: {
        Row: {
          amount: number
          fee_type: string
          id: string
          order_id: string
        }
        Insert: {
          amount: number
          fee_type: string
          id?: string
          order_id: string
        }
        Update: {
          amount?: number
          fee_type?: string
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_fees_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_groups: {
        Row: {
          area: string
          created_at: string
          creator_id: string
          discount_percentage: number | null
          expires_at: string
          id: string
          is_active: boolean | null
          max_members: number | null
          restaurant_id: string
          time_slot: string
        }
        Insert: {
          area: string
          created_at?: string
          creator_id: string
          discount_percentage?: number | null
          expires_at?: string
          id?: string
          is_active?: boolean | null
          max_members?: number | null
          restaurant_id: string
          time_slot: string
        }
        Update: {
          area?: string
          created_at?: string
          creator_id?: string
          discount_percentage?: number | null
          expires_at?: string
          id?: string
          is_active?: boolean | null
          max_members?: number | null
          restaurant_id?: string
          time_slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_groups_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_issues: {
        Row: {
          created_at: string
          description: string | null
          id: string
          issue_type: string
          order_id: string
          reporter_id: string | null
          reporter_type: string
          resolution_notes: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          issue_type: string
          order_id: string
          reporter_id?: string | null
          reporter_type: string
          resolution_notes?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          issue_type?: string
          order_id?: string
          reporter_id?: string | null
          reporter_type?: string
          resolution_notes?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_issues_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_modifiers: {
        Row: {
          id: string
          modifier_option_id: string | null
          name: string
          order_item_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          id?: string
          modifier_option_id?: string | null
          name: string
          order_item_id: string
          quantity?: number
          unit_price: number
        }
        Update: {
          id?: string
          modifier_option_id?: string | null
          name?: string
          order_item_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_item_modifiers_modifier_option_id_fkey"
            columns: ["modifier_option_id"]
            isOneToOne: false
            referencedRelation: "dish_modifier_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_modifiers_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          anti_waste_offer_id: string | null
          id: string
          menu_item_id: string | null
          metadata: Json | null
          order_id: string
          quantity: number
          restaurant_id: string | null
          total_price: number
          unit_price: number
        }
        Insert: {
          anti_waste_offer_id?: string | null
          id?: string
          menu_item_id?: string | null
          metadata?: Json | null
          order_id: string
          quantity?: number
          restaurant_id?: string | null
          total_price: number
          unit_price: number
        }
        Update: {
          anti_waste_offer_id?: string | null
          id?: string
          menu_item_id?: string | null
          metadata?: Json | null
          order_id?: string
          quantity?: number
          restaurant_id?: string | null
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_anti_waste_offer_id_fkey"
            columns: ["anti_waste_offer_id"]
            isOneToOne: false
            referencedRelation: "anti_waste_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_notes: {
        Row: {
          author_id: string | null
          author_type: string
          created_at: string
          id: string
          note: string
          order_id: string
        }
        Insert: {
          author_id?: string | null
          author_type: string
          created_at?: string
          id?: string
          note: string
          order_id: string
        }
        Update: {
          author_id?: string | null
          author_type?: string
          created_at?: string
          id?: string
          note?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_refunds: {
        Row: {
          amount: number
          created_at: string
          id: string
          issue_id: string | null
          order_id: string
          processed_at: string | null
          reason: string | null
          status: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          issue_id?: string | null
          order_id: string
          processed_at?: string | null
          reason?: string | null
          status?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          issue_id?: string | null
          order_id?: string
          processed_at?: string | null
          reason?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_refunds_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "order_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          order_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          status: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_taxes: {
        Row: {
          amount: number
          id: string
          order_id: string
          tax_name: string
          tax_rate: number
        }
        Insert: {
          amount: number
          id?: string
          order_id: string
          tax_name: string
          tax_rate: number
        }
        Update: {
          amount?: number
          id?: string
          order_id?: string
          tax_name?: string
          tax_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_taxes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_at: string | null
          actual_delivered_at: string | null
          branch_id: string | null
          cancellation_reason: string | null
          checkout_id: string | null
          courier_id: string | null
          created_at: string
          currency: string | null
          delivered_at: string | null
          delivery_address: string
          delivery_fee: number | null
          delivery_fee_amount: number | null
          discount_amount: number | null
          donate_earned_xp: boolean | null
          estimated_delivery_at: string | null
          fulfillment_status: string | null
          id: string
          idempotency_key: string | null
          metadata: Json | null
          notes: string | null
          order_number: string | null
          original_total: number | null
          payment_status: string | null
          picked_up_at: string | null
          ready_at: string | null
          restaurant_id: string
          restaurant_invoice_id: string | null
          scheduled_at: string | null
          scheduled_for: string | null
          service_fee_amount: number | null
          source: string | null
          status: string
          subtotal_amount: number | null
          tax_amount: number | null
          tip_amount: number | null
          total_amount: number
          type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          actual_delivered_at?: string | null
          branch_id?: string | null
          cancellation_reason?: string | null
          checkout_id?: string | null
          courier_id?: string | null
          created_at?: string
          currency?: string | null
          delivered_at?: string | null
          delivery_address: string
          delivery_fee?: number | null
          delivery_fee_amount?: number | null
          discount_amount?: number | null
          donate_earned_xp?: boolean | null
          estimated_delivery_at?: string | null
          fulfillment_status?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          notes?: string | null
          order_number?: string | null
          original_total?: number | null
          payment_status?: string | null
          picked_up_at?: string | null
          ready_at?: string | null
          restaurant_id: string
          restaurant_invoice_id?: string | null
          scheduled_at?: string | null
          scheduled_for?: string | null
          service_fee_amount?: number | null
          source?: string | null
          status?: string
          subtotal_amount?: number | null
          tax_amount?: number | null
          tip_amount?: number | null
          total_amount?: number
          type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          actual_delivered_at?: string | null
          branch_id?: string | null
          cancellation_reason?: string | null
          checkout_id?: string | null
          courier_id?: string | null
          created_at?: string
          currency?: string | null
          delivered_at?: string | null
          delivery_address?: string
          delivery_fee?: number | null
          delivery_fee_amount?: number | null
          discount_amount?: number | null
          donate_earned_xp?: boolean | null
          estimated_delivery_at?: string | null
          fulfillment_status?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          notes?: string | null
          order_number?: string | null
          original_total?: number | null
          payment_status?: string | null
          picked_up_at?: string | null
          ready_at?: string | null
          restaurant_id?: string
          restaurant_invoice_id?: string | null
          scheduled_at?: string | null
          scheduled_for?: string | null
          service_fee_amount?: number | null
          source?: string | null
          status?: string
          subtotal_amount?: number | null
          tax_amount?: number | null
          tip_amount?: number | null
          total_amount?: number
          type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "restaurant_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_invoice_id_fkey"
            columns: ["restaurant_invoice_id"]
            isOneToOne: false
            referencedRelation: "restaurant_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey_profiles"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      payment_intents: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          order_id: string | null
          provider: string
          provider_intent_id: string
          status: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          order_id?: string | null
          provider: string
          provider_intent_id: string
          status?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          order_id?: string | null
          provider?: string
          provider_intent_id?: string
          status?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_intents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          metadata: Json | null
          order_id: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json | null
          order_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json | null
          order_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_batches: {
        Row: {
          created_at: string
          id: string
          payout_period_end: string
          payout_period_start: string
          processed_at: string | null
          status: string | null
          total_amount: number
        }
        Insert: {
          created_at?: string
          id?: string
          payout_period_end: string
          payout_period_start: string
          processed_at?: string | null
          status?: string | null
          total_amount: number
        }
        Update: {
          created_at?: string
          id?: string
          payout_period_end?: string
          payout_period_start?: string
          processed_at?: string | null
          status?: string | null
          total_amount?: number
        }
        Relationships: []
      }
      payouts: {
        Row: {
          amount: number
          batch_id: string | null
          created_at: string
          currency: string
          id: string
          provider_transfer_id: string | null
          recipient_id: string
          recipient_type: string
          status: string | null
        }
        Insert: {
          amount: number
          batch_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          provider_transfer_id?: string | null
          recipient_id: string
          recipient_type: string
          status?: string | null
        }
        Update: {
          amount?: number
          batch_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          provider_transfer_id?: string | null
          recipient_id?: string
          recipient_type?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payouts_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "payout_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          city: string | null
          created_at: string
          current_tier: Database["public"]["Enums"]["loyalty_tier"] | null
          full_name: string | null
          id: string
          loyalty_points: number | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          current_tier?: Database["public"]["Enums"]["loyalty_tier"] | null
          full_name?: string | null
          id?: string
          loyalty_points?: number | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          current_tier?: Database["public"]["Enums"]["loyalty_tier"] | null
          full_name?: string | null
          id?: string
          loyalty_points?: number | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      promo_code_uses: {
        Row: {
          created_at: string
          discount_applied: number
          id: string
          order_id: string | null
          promo_code_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          discount_applied: number
          id?: string
          order_id?: string | null
          promo_code_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          discount_applied?: number
          id?: string
          order_id?: string | null
          promo_code_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_code_uses_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_uses_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string
          current_uses: number | null
          id: string
          is_active: boolean | null
          is_first_order_only: boolean | null
          is_stackable: boolean | null
          max_discount: number | null
          max_uses: number | null
          min_order_amount: number | null
          per_user_limit: number | null
          restaurant_id: string | null
          type: string
          valid_from: string
          valid_until: string | null
          value: number
        }
        Insert: {
          code: string
          created_at?: string
          current_uses?: number | null
          id?: string
          is_active?: boolean | null
          is_first_order_only?: boolean | null
          is_stackable?: boolean | null
          max_discount?: number | null
          max_uses?: number | null
          min_order_amount?: number | null
          per_user_limit?: number | null
          restaurant_id?: string | null
          type: string
          valid_from?: string
          valid_until?: string | null
          value: number
        }
        Update: {
          code?: string
          created_at?: string
          current_uses?: number | null
          id?: string
          is_active?: boolean | null
          is_first_order_only?: boolean | null
          is_stackable?: boolean | null
          max_discount?: number | null
          max_uses?: number | null
          min_order_amount?: number | null
          per_user_limit?: number | null
          restaurant_id?: string | null
          type?: string
          valid_from?: string
          valid_until?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      proof_of_delivery: {
        Row: {
          courier_id: string
          dispatch_job_id: string
          id: string
          notes: string | null
          photo_urls: string[] | null
          recorded_at: string
          signature_url: string | null
          verification_method: string
          verification_payload: Json
          verified_at: string
        }
        Insert: {
          courier_id: string
          dispatch_job_id: string
          id?: string
          notes?: string | null
          photo_urls?: string[] | null
          recorded_at?: string
          signature_url?: string | null
          verification_method?: string
          verification_payload?: Json
          verified_at?: string
        }
        Update: {
          courier_id?: string
          dispatch_job_id?: string
          id?: string
          notes?: string | null
          photo_urls?: string[] | null
          recorded_at?: string
          signature_url?: string | null
          verification_method?: string
          verification_payload?: Json
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proof_of_delivery_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proof_of_delivery_dispatch_job_id_fkey"
            columns: ["dispatch_job_id"]
            isOneToOne: false
            referencedRelation: "dispatch_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_buckets: {
        Row: {
          function_name: string
          last_hit_at: string
          request_count: number
          subject: string
          window_start: string
        }
        Insert: {
          function_name: string
          last_hit_at?: string
          request_count?: number
          subject: string
          window_start?: string
        }
        Update: {
          function_name?: string
          last_hit_at?: string
          request_count?: number
          subject?: string
          window_start?: string
        }
        Relationships: []
      }
      recommendation_logs: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          model_version: string
          recommended_items: string[]
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          model_version: string
          recommended_items: string[]
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          model_version?: string
          recommended_items?: string[]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          reward_referee: number | null
          reward_referrer: number | null
          total_referrals: number | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          reward_referee?: number | null
          reward_referrer?: number | null
          total_referrals?: number | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          reward_referee?: number | null
          reward_referrer?: number | null
          total_referrals?: number | null
          user_id?: string
        }
        Relationships: []
      }
      reservation_slots: {
        Row: {
          created_at: string
          id: string
          reservation_id: string
          table_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reservation_id: string
          table_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reservation_id?: string
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_slots_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_slots_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "reservation_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          notes: string | null
          reservation_id: string
          status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          reservation_id: string
          status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          reservation_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_status_history_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_table_layout_overrides: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          layout: Json
          reservation_table_id: string
          service_date: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          layout: Json
          reservation_table_id: string
          service_date: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          layout?: Json
          reservation_table_id?: string
          service_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_table_layout_overrides_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "restaurant_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_table_layout_overrides_reservation_table_id_fkey"
            columns: ["reservation_table_id"]
            isOneToOne: false
            referencedRelation: "reservation_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_tables: {
        Row: {
          branch_id: string
          capacity: number
          id: string
          is_active: boolean | null
          layout: Json | null
          sector: string | null
          table_number: string
        }
        Insert: {
          branch_id: string
          capacity: number
          id?: string
          is_active?: boolean | null
          layout?: Json | null
          sector?: string | null
          table_number: string
        }
        Update: {
          branch_id?: string
          capacity?: number
          id?: string
          is_active?: boolean | null
          layout?: Json | null
          sector?: string | null
          table_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_tables_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "restaurant_branches"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          billing_fee_chf: number
          branch_id: string | null
          cancellation_reason_code: string | null
          cancellation_reason_details: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          checkout_id: string | null
          confirmed_at: string | null
          created_at: string
          date: string
          feature: string
          id: string
          metadata: Json
          notes: string | null
          order_reference: string | null
          party_size: number
          payment_method: string | null
          preorder_items: Json
          reservation_time: string | null
          reservation_fee_invoice_id: string | null
          restaurant_id: string
          restaurant_invoice_id: string | null
          special_requests: string | null
          status: string
          time: string
          total_amount: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          billing_fee_chf?: number
          branch_id?: string | null
          cancellation_reason_code?: string | null
          cancellation_reason_details?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          checkout_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          date: string
          feature?: string
          id?: string
          metadata?: Json
          notes?: string | null
          order_reference?: string | null
          party_size: number
          payment_method?: string | null
          preorder_items?: Json
          reservation_time?: string | null
          reservation_fee_invoice_id?: string | null
          restaurant_id: string
          restaurant_invoice_id?: string | null
          special_requests?: string | null
          status?: string
          time: string
          total_amount?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          billing_fee_chf?: number
          branch_id?: string | null
          cancellation_reason_code?: string | null
          cancellation_reason_details?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          checkout_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          date?: string
          feature?: string
          id?: string
          metadata?: Json
          notes?: string | null
          order_reference?: string | null
          party_size?: number
          payment_method?: string | null
          preorder_items?: Json
          reservation_time?: string | null
          reservation_fee_invoice_id?: string | null
          restaurant_id?: string
          restaurant_invoice_id?: string | null
          special_requests?: string | null
          status?: string
          time?: string
          total_amount?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "restaurant_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_invoice_fk"
            columns: ["restaurant_invoice_id"]
            isOneToOne: false
            referencedRelation: "restaurant_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_reservation_fee_invoice_id_fkey"
            columns: ["reservation_fee_invoice_id"]
            isOneToOne: false
            referencedRelation: "restaurant_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_restaurant_invoice_id_fkey"
            columns: ["restaurant_invoice_id"]
            isOneToOne: false
            referencedRelation: "restaurant_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_branches: {
        Row: {
          address: string
          city: string
          country: string
          created_at: string
          id: string
          is_active: boolean | null
          latitude: number | null
          longitude: number | null
          name: string
          phone_number: string | null
          postal_code: string
          restaurant_id: string
        }
        Insert: {
          address: string
          city: string
          country: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name: string
          phone_number?: string | null
          postal_code: string
          restaurant_id: string
        }
        Update: {
          address?: string
          city?: string
          country?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone_number?: string | null
          postal_code?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_branches_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_cuisines: {
        Row: {
          cuisine_id: string
          restaurant_id: string
        }
        Insert: {
          cuisine_id: string
          restaurant_id: string
        }
        Update: {
          cuisine_id?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_cuisines_cuisine_id_fkey"
            columns: ["cuisine_id"]
            isOneToOne: false
            referencedRelation: "cuisines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_cuisines_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_daily_kpis: {
        Row: {
          avg_ticket: number
          cancel_rate: number
          created_at: string
          id: string
          kpi_date: string
          orders_count: number
          reservations_count: number
          restaurant_id: string
          revenue: number
          reviews_count: number
          satisfaction_score: number
          updated_at: string
        }
        Insert: {
          avg_ticket?: number
          cancel_rate?: number
          created_at?: string
          id?: string
          kpi_date: string
          orders_count?: number
          reservations_count?: number
          restaurant_id: string
          revenue?: number
          reviews_count?: number
          satisfaction_score?: number
          updated_at?: string
        }
        Update: {
          avg_ticket?: number
          cancel_rate?: number
          created_at?: string
          id?: string
          kpi_date?: string
          orders_count?: number
          reservations_count?: number
          restaurant_id?: string
          revenue?: number
          reviews_count?: number
          satisfaction_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_daily_kpis_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_delivery_rules: {
        Row: {
          branch_id: string
          fee_amount: number
          free_delivery_threshold: number | null
          id: string
          max_distance_km: number | null
          min_distance_km: number | null
        }
        Insert: {
          branch_id: string
          fee_amount: number
          free_delivery_threshold?: number | null
          id?: string
          max_distance_km?: number | null
          min_distance_km?: number | null
        }
        Update: {
          branch_id?: string
          fee_amount?: number
          free_delivery_threshold?: number | null
          id?: string
          max_distance_km?: number | null
          min_distance_km?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_delivery_rules_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "restaurant_branches"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_documents: {
        Row: {
          created_at: string
          document_type: string
          file_url: string
          id: string
          restaurant_id: string
          status: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          document_type: string
          file_url: string
          id?: string
          restaurant_id: string
          status?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          document_type?: string
          file_url?: string
          id?: string
          restaurant_id?: string
          status?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_documents_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_hours: {
        Row: {
          branch_id: string
          close_time: string
          day_of_week: number
          id: string
          is_closed: boolean | null
          open_time: string
        }
        Insert: {
          branch_id: string
          close_time: string
          day_of_week: number
          id?: string
          is_closed?: boolean | null
          open_time: string
        }
        Update: {
          branch_id?: string
          close_time?: string
          day_of_week?: number
          id?: string
          is_closed?: boolean | null
          open_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_hours_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "restaurant_branches"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_invoice_settings: {
        Row: {
          bank_name: string | null
          bic: string | null
          company_address: string | null
          company_city: string | null
          company_country: string | null
          company_name: string | null
          company_postal_code: string | null
          created_at: string
          email: string | null
          footer_note: string | null
          iban: string | null
          id: string
          logo_url: string | null
          payment_terms: string | null
          phone: string | null
          restaurant_id: string
          siret: string | null
          updated_at: string
          vat_number: string | null
          website: string | null
        }
        Insert: {
          bank_name?: string | null
          bic?: string | null
          company_address?: string | null
          company_city?: string | null
          company_country?: string | null
          company_name?: string | null
          company_postal_code?: string | null
          created_at?: string
          email?: string | null
          footer_note?: string | null
          iban?: string | null
          id?: string
          logo_url?: string | null
          payment_terms?: string | null
          phone?: string | null
          restaurant_id: string
          siret?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Update: {
          bank_name?: string | null
          bic?: string | null
          company_address?: string | null
          company_city?: string | null
          company_country?: string | null
          company_name?: string | null
          company_postal_code?: string | null
          created_at?: string
          email?: string | null
          footer_note?: string | null
          iban?: string | null
          id?: string
          logo_url?: string | null
          payment_terms?: string | null
          phone?: string | null
          restaurant_id?: string
          siret?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_invoice_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_invoices: {
        Row: {
          amount_ht: number
          amount_ttc: number
          amount_tva: number
          created_at: string
          due_at: string | null
          id: string
          invoice_number: string | null
          invoice_type: string
          paid_at: string | null
          pdf_url: string | null
          period_end: string
          period_start: string
          restaurant_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_ht?: number
          amount_ttc?: number
          amount_tva?: number
          created_at?: string
          due_at?: string | null
          id?: string
          invoice_number?: string | null
          invoice_type?: string
          paid_at?: string | null
          pdf_url?: string | null
          period_end: string
          period_start: string
          restaurant_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_ht?: number
          amount_ttc?: number
          amount_tva?: number
          created_at?: string
          due_at?: string | null
          id?: string
          invoice_number?: string | null
          invoice_type?: string
          paid_at?: string | null
          pdf_url?: string | null
          period_end?: string
          period_start?: string
          restaurant_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_invoices_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_invoice_line_items: {
        Row: {
          amount_ht: number
          amount_ttc: number
          amount_tva: number
          base_amount: number
          created_at: string
          id: string
          invoice_id: string
          item_kind: string
          metadata: Json
          occurred_at: string
          quantity: number
          rate_label: string | null
          rate_value: number | null
          restaurant_id: string
          source_id: string | null
          source_label: string | null
          source_table: string | null
          unit_amount: number
          updated_at: string
        }
        Insert: {
          amount_ht?: number
          amount_ttc?: number
          amount_tva?: number
          base_amount?: number
          created_at?: string
          id?: string
          invoice_id: string
          item_kind: string
          metadata?: Json
          occurred_at: string
          quantity?: number
          rate_label?: string | null
          rate_value?: number | null
          restaurant_id: string
          source_id?: string | null
          source_label?: string | null
          source_table?: string | null
          unit_amount?: number
          updated_at?: string
        }
        Update: {
          amount_ht?: number
          amount_ttc?: number
          amount_tva?: number
          base_amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          item_kind?: string
          metadata?: Json
          occurred_at?: string
          quantity?: number
          rate_label?: string | null
          rate_value?: number | null
          restaurant_id?: string
          source_id?: string | null
          source_label?: string | null
          source_table?: string | null
          unit_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "restaurant_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_invoice_line_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_launch_packs: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          metadata: Json
          notes: string | null
          pack_id: string
          paid_at: string | null
          purchased_by: string
          restaurant_id: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          notes?: string | null
          pack_id: string
          paid_at?: string | null
          purchased_by: string
          restaurant_id: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          notes?: string | null
          pack_id?: string
          paid_at?: string | null
          purchased_by?: string
          restaurant_id?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_launch_packs_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "launch_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_launch_packs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_media: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          is_cover: boolean
          media_type: string
          media_url: string
          position: number
          restaurant_id: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_cover?: boolean
          media_type?: string
          media_url: string
          position?: number
          restaurant_id: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_cover?: boolean
          media_type?: string
          media_url?: string
          position?: number
          restaurant_id?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_media_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_payout_settings: {
        Row: {
          commission_rate: number | null
          created_at: string
          payout_schedule: string | null
          restaurant_id: string
          stripe_account_id: string | null
        }
        Insert: {
          commission_rate?: number | null
          created_at?: string
          payout_schedule?: string | null
          restaurant_id: string
          stripe_account_id?: string | null
        }
        Update: {
          commission_rate?: number | null
          created_at?: string
          payout_schedule?: string | null
          restaurant_id?: string
          stripe_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_payout_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_promotions: {
        Row: {
          active: boolean
          created_at: string
          end_at: string
          id: string
          name: string
          promotion_type: string
          promotion_value: number
          restaurant_id: string
          start_at: string
          target: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          end_at: string
          id?: string
          name: string
          promotion_type: string
          promotion_value: number
          restaurant_id: string
          start_at: string
          target?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          end_at?: string
          id?: string
          name?: string
          promotion_type?: string
          promotion_value?: number
          restaurant_id?: string
          start_at?: string
          target?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_promotions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_recommendations: {
        Row: {
          created_at: string
          generated_at: string
          id: string
          payload: Json
          priority: number
          recommendation_type: string
          restaurant_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          generated_at?: string
          id?: string
          payload?: Json
          priority?: number
          recommendation_type: string
          restaurant_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          generated_at?: string
          id?: string
          payload?: Json
          priority?: number
          recommendation_type?: string
          restaurant_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_recommendations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_service_areas: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          max_delivery_radius_km: number | null
          polygon_geojson: Json
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          max_delivery_radius_km?: number | null
          polygon_geojson: Json
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          max_delivery_radius_km?: number | null
          polygon_geojson?: Json
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_service_areas_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "restaurant_branches"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_settings: {
        Row: {
          auto_accept_orders: boolean | null
          created_at: string
          pos_integration_provider: string | null
          print_orders_automatically: boolean | null
          restaurant_id: string
        }
        Insert: {
          auto_accept_orders?: boolean | null
          created_at?: string
          pos_integration_provider?: string | null
          print_orders_automatically?: boolean | null
          restaurant_id: string
        }
        Update: {
          auto_accept_orders?: boolean | null
          created_at?: string
          pos_integration_provider?: string | null
          print_orders_automatically?: boolean | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_staff: {
        Row: {
          created_at: string
          id: string
          restaurant_id: string
          role: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          restaurant_id: string
          role: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          restaurant_id?: string
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_staff_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          address: string
          avg_delivery_time_min: number | null
          avg_prep_time_min: number | null
          avg_rating: number | null
          base_delivery_fee: number | null
          city: string
          commission_rate: number | null
          created_at: string
          cuisine_type: string | null
          delivery_available: boolean | null
          delivery_fee: number | null
          description: string | null
          disabled_dashboard_features: string[]
          disabled_payment_methods: string[] | null
          id: string
          image_url: string | null
          is_active: boolean | null
          is_featured: boolean | null
          latitude: number | null
          legal_name: string | null
          longitude: number | null
          min_order_amount: number | null
          name: string
          opening_hours: Json | null
          owner_id: string
          phone: string | null
          points_multiplier: number | null
          price_range: number | null
          rating: number | null
          rating_count: number | null
          review_count: number | null
          search_vector: unknown
          status: string | null
          stripe_account_id: string | null
          supports_dinein: boolean | null
          supports_group_orders: boolean | null
          supports_pickup: boolean | null
          supports_reservation: boolean | null
          supports_scheduled: boolean | null
          supports_scheduled_orders: boolean | null
          updated_at: string
        }
        Insert: {
          address: string
          avg_delivery_time_min?: number | null
          avg_prep_time_min?: number | null
          avg_rating?: number | null
          base_delivery_fee?: number | null
          city: string
          commission_rate?: number | null
          created_at?: string
          cuisine_type?: string | null
          delivery_available?: boolean | null
          delivery_fee?: number | null
          description?: string | null
          disabled_dashboard_features?: string[]
          disabled_payment_methods?: string[] | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          latitude?: number | null
          legal_name?: string | null
          longitude?: number | null
          min_order_amount?: number | null
          name: string
          opening_hours?: Json | null
          owner_id: string
          phone?: string | null
          points_multiplier?: number | null
          price_range?: number | null
          rating?: number | null
          rating_count?: number | null
          review_count?: number | null
          search_vector?: unknown
          status?: string | null
          stripe_account_id?: string | null
          supports_dinein?: boolean | null
          supports_group_orders?: boolean | null
          supports_pickup?: boolean | null
          supports_reservation?: boolean | null
          supports_scheduled?: boolean | null
          supports_scheduled_orders?: boolean | null
          updated_at?: string
        }
        Update: {
          address?: string
          avg_delivery_time_min?: number | null
          avg_prep_time_min?: number | null
          avg_rating?: number | null
          base_delivery_fee?: number | null
          city?: string
          commission_rate?: number | null
          created_at?: string
          cuisine_type?: string | null
          delivery_available?: boolean | null
          delivery_fee?: number | null
          description?: string | null
          disabled_dashboard_features?: string[]
          disabled_payment_methods?: string[] | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          latitude?: number | null
          legal_name?: string | null
          longitude?: number | null
          min_order_amount?: number | null
          name?: string
          opening_hours?: Json | null
          owner_id?: string
          phone?: string | null
          points_multiplier?: number | null
          price_range?: number | null
          rating?: number | null
          rating_count?: number | null
          review_count?: number | null
          search_vector?: unknown
          status?: string | null
          stripe_account_id?: string | null
          supports_dinein?: boolean | null
          supports_group_orders?: boolean | null
          supports_pickup?: boolean | null
          supports_reservation?: boolean | null
          supports_scheduled?: boolean | null
          supports_scheduled_orders?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      review_replies: {
        Row: {
          author_id: string
          author_type: string
          created_at: string
          id: string
          reply_text: string
          review_id: string
        }
        Insert: {
          author_id: string
          author_type: string
          created_at?: string
          id?: string
          reply_text: string
          review_id: string
        }
        Update: {
          author_id?: string
          author_type?: string
          created_at?: string
          id?: string
          reply_text?: string
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_replies_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: true
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          courier_id: string | null
          courier_rating: number | null
          created_at: string
          food_rating: number | null
          id: string
          order_id: string | null
          quality_rating: number
          rating: number
          restaurant_id: string
          restaurant_rating: number | null
          service_rating: number
          speed_rating: number
          status: string | null
          tags: string[] | null
          user_id: string
        }
        Insert: {
          comment?: string | null
          courier_id?: string | null
          courier_rating?: number | null
          created_at?: string
          food_rating?: number | null
          id?: string
          order_id?: string | null
          quality_rating: number
          rating: number
          restaurant_id: string
          restaurant_rating?: number | null
          service_rating: number
          speed_rating: number
          status?: string | null
          tags?: string[] | null
          user_id: string
        }
        Update: {
          comment?: string | null
          courier_id?: string | null
          courier_rating?: number | null
          created_at?: string
          food_rating?: number | null
          id?: string
          order_id?: string | null
          quality_rating?: number
          rating?: number
          restaurant_id?: string
          restaurant_rating?: number | null
          service_rating?: number
          speed_rating?: number
          status?: string | null
          tags?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      search_logs: {
        Row: {
          created_at: string
          id: string
          location_lat: number | null
          location_lng: number | null
          results_count: number | null
          search_query: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          results_count?: number | null
          search_query: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          results_count?: number | null
          search_query?: string
          user_id?: string | null
        }
        Relationships: []
      }
      signup_application_documents: {
        Row: {
          application_id: string
          created_at: string
          document_type: string
          file_name: string | null
          file_path: string
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          document_type: string
          file_name?: string | null
          file_path: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          application_id?: string
          created_at?: string
          document_type?: string
          file_name?: string | null
          file_path?: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signup_application_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "signup_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_applications: {
        Row: {
          address: string | null
          business_name: string | null
          business_registration_number: string | null
          city: string | null
          created_at: string
          full_name: string
          iban: string | null
          id: string
          legal_name: string | null
          license_plate: string | null
          metadata: Json
          phone: string | null
          requested_role: Database["public"]["Enums"]["app_role"]
          restaurant_description: string | null
          restaurant_name: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          tax_id: string | null
          updated_at: string
          user_id: string
          vehicle_type: string | null
        }
        Insert: {
          address?: string | null
          business_name?: string | null
          business_registration_number?: string | null
          city?: string | null
          created_at?: string
          full_name: string
          iban?: string | null
          id?: string
          legal_name?: string | null
          license_plate?: string | null
          metadata?: Json
          phone?: string | null
          requested_role: Database["public"]["Enums"]["app_role"]
          restaurant_description?: string | null
          restaurant_name?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          tax_id?: string | null
          updated_at?: string
          user_id: string
          vehicle_type?: string | null
        }
        Update: {
          address?: string | null
          business_name?: string | null
          business_registration_number?: string | null
          city?: string | null
          created_at?: string
          full_name?: string
          iban?: string | null
          id?: string
          legal_name?: string | null
          license_plate?: string | null
          metadata?: Json
          phone?: string | null
          requested_role?: Database["public"]["Enums"]["app_role"]
          restaurant_description?: string | null
          restaurant_name?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          tax_id?: string | null
          updated_at?: string
          user_id?: string
          vehicle_type?: string | null
        }
        Relationships: []
      }
      solidarity_donations: {
        Row: {
          created_at: string
          id: string
          meals_count: number
          points_amount: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          meals_count?: number
          points_amount: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          meals_count?: number
          points_amount?: number
          user_id?: string | null
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          event_id: string
          event_type: string
          livemode: boolean
          processed_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          livemode?: boolean
          processed_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          livemode?: boolean
          processed_at?: string
        }
        Relationships: []
      }
      subscription_benefits: {
        Row: {
          benefit_type: string
          created_at: string
          id: string
          plan_id: string
          value: Json | null
        }
        Insert: {
          benefit_type: string
          created_at?: string
          id?: string
          plan_id: string
          value?: Json | null
        }
        Update: {
          benefit_type?: string
          created_at?: string
          id?: string
          plan_id?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_benefits_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "user_subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          attachments: Json | null
          content: string
          created_at: string
          id: string
          is_internal: boolean | null
          sender_id: string
          ticket_id: string
        }
        Insert: {
          attachments?: Json | null
          content: string
          created_at?: string
          id?: string
          is_internal?: boolean | null
          sender_id: string
          ticket_id: string
        }
        Update: {
          attachments?: Json | null
          content?: string
          created_at?: string
          id?: string
          is_internal?: boolean | null
          sender_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string
          compensation_amount: number | null
          created_at: string
          description: string | null
          id: string
          order_id: string | null
          priority: string
          resolution_type: string | null
          resolved_at: string | null
          sla_deadline: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          category: string
          compensation_amount?: number | null
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          priority?: string
          resolution_type?: string | null
          resolved_at?: string | null
          sla_deadline?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          compensation_amount?: number | null
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          priority?: string
          resolution_type?: string | null
          resolved_at?: string | null
          sla_deadline?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      tok_one_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          plan_id: string
          status: string
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          plan_id: string
          status?: string
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          plan_id?: string
          status?: string
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tok_one_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "user_subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_addresses: {
        Row: {
          access_code: string | null
          address_line_1: string
          address_line_2: string | null
          city: string
          country: string
          created_at: string
          delivery_instructions: string | null
          id: string
          is_default: boolean | null
          label: string | null
          latitude: number | null
          longitude: number | null
          postal_code: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_code?: string | null
          address_line_1: string
          address_line_2?: string | null
          city: string
          country: string
          created_at?: string
          delivery_instructions?: string | null
          id?: string
          is_default?: boolean | null
          label?: string | null
          latitude?: number | null
          longitude?: number | null
          postal_code: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_code?: string | null
          address_line_1?: string
          address_line_2?: string | null
          city?: string
          country?: string
          created_at?: string
          delivery_instructions?: string | null
          id?: string
          is_default?: boolean | null
          label?: string | null
          latitude?: number | null
          longitude?: number | null
          postal_code?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_analytics: {
        Row: {
          city: string | null
          created_at: string | null
          cuisine_type: string | null
          event_data: Json | null
          event_type: string
          id: string
          restaurant_id: string | null
          user_id: string
        }
        Insert: {
          city?: string | null
          created_at?: string | null
          cuisine_type?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          restaurant_id?: string | null
          user_id: string
        }
        Update: {
          city?: string | null
          created_at?: string | null
          cuisine_type?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          restaurant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_analytics_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_devices: {
        Row: {
          app_version: string | null
          created_at: string
          device_id: string
          device_type: string | null
          id: string
          last_active_at: string | null
          os_version: string | null
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_id: string
          device_type?: string | null
          id?: string
          last_active_at?: string | null
          os_version?: string | null
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_id?: string
          device_type?: string | null
          id?: string
          last_active_at?: string | null
          os_version?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_notification_settings: {
        Row: {
          created_at: string
          flash_sales_alerts: boolean | null
          newsletter: boolean | null
          order_updates_push: boolean | null
          order_updates_sms: boolean | null
          promotional_emails: boolean | null
          promotional_push: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          flash_sales_alerts?: boolean | null
          newsletter?: boolean | null
          order_updates_push?: boolean | null
          order_updates_sms?: boolean | null
          promotional_emails?: boolean | null
          promotional_push?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          flash_sales_alerts?: boolean | null
          newsletter?: boolean | null
          order_updates_push?: boolean | null
          order_updates_sms?: boolean | null
          promotional_emails?: boolean | null
          promotional_push?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notification_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_payment_methods: {
        Row: {
          card_brand: string | null
          card_last4: string | null
          created_at: string
          expiry_month: number | null
          expiry_year: number | null
          id: string
          is_default: boolean | null
          provider: string
          provider_payment_method_id: string
          user_id: string
        }
        Insert: {
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          expiry_month?: number | null
          expiry_year?: number | null
          id?: string
          is_default?: boolean | null
          provider: string
          provider_payment_method_id: string
          user_id: string
        }
        Update: {
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          expiry_month?: number | null
          expiry_year?: number | null
          id?: string
          is_default?: boolean | null
          provider?: string
          provider_payment_method_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_payment_methods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          dietary_tags: string[] | null
          id: string
          max_budget: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          dietary_tags?: string[] | null
          id?: string
          max_budget?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          dietary_tags?: string[] | null
          id?: string
          max_budget?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          date_of_birth: string | null
          first_name: string | null
          last_name: string | null
          phone_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          first_name?: string | null
          last_name?: string | null
          phone_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          first_name?: string | null
          last_name?: string | null
          phone_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_referrals: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          referral_code: string
          referred_id: string | null
          referrer_id: string
          reward_amount: number | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          referral_code: string
          referred_id?: string | null
          referrer_id: string
          reward_amount?: number | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          referral_code?: string
          referred_id?: string | null
          referrer_id?: string
          reward_amount?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_subscription_plans: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          free_delivery_min_order: number | null
          id: string
          name: string
          price_monthly: number
          price_yearly: number
          status: string | null
          stripe_product_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          free_delivery_min_order?: number | null
          id?: string
          name: string
          price_monthly: number
          price_yearly: number
          status?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          free_delivery_min_order?: number | null
          id?: string
          name?: string
          price_monthly?: number
          price_yearly?: number
          status?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          created_at: string
          day_of_week: string
          id: string
          is_active: boolean | null
          menu_item_id: string | null
          preferred_time: string | null
          restaurant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_of_week: string
          id?: string
          is_active?: boolean | null
          menu_item_id?: string | null
          preferred_time?: string | null
          restaurant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: string
          id?: string
          is_active?: boolean | null
          menu_item_id?: string | null
          preferred_time?: string | null
          restaurant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_subscriptions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_wallets: {
        Row: {
          balance: number
          currency: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          currency?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          currency?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          reference_id: string | null
          type: string
          wallet_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          type: string
          wallet_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          type?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "user_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_activate_all_feature_flags: { Args: never; Returns: number }
      admin_dispatch_notification_campaign: {
        Args: { p_campaign_id: string }
        Returns: {
          deliveries_failed: number
          deliveries_queued: number
          deliveries_sent: number
          deliveries_total: number
          email_total: number
          in_app_total: number
          notifications_count: number
          push_total: number
          recipients: number
        }[]
      }
      dispatch_due_notification_campaigns: {
        Args: { p_limit?: number }
        Returns: {
          campaign_id: string
          deliveries_failed: number
          deliveries_queued: number
          deliveries_sent: number
          deliveries_total: number
          email_total: number
          in_app_total: number
          notifications_count: number
          push_total: number
          recipients: number
        }[]
      }
      admin_get_cancellation_fraud_metrics: {
        Args: { p_month: string }
        Returns: {
          cancellation_rate: number
          cancelled_by_restaurant_count: number
          confirmed_count: number
          late_cancellations_count: number
          restaurant_id: string
          restaurant_name: string
          top_reason_code: string
          top_reason_count: number
        }[]
      }
      admin_get_reservation_billing_history: {
        Args: { p_month: string; p_restaurant_id: string }
        Returns: {
          billable: boolean
          billing_fee_chf: number
          cancellation_reason_code: string
          cancellation_reason_details: string
          cancelled_at: string
          cancelled_by: string
          confirmed_at: string
          customer_name: string
          id: string
          invoice_id: string
          party_size: number
          reservation_date: string
          reservation_time: string
          restaurant_id: string
          restaurant_name: string
          status: string
        }[]
      }
      admin_list_users: {
        Args: never
        Returns: {
          city: string
          email: string
          full_name: string
          roles: string[]
          user_id: string
        }[]
      }
      admin_review_courier_profile: {
        Args: {
          p_courier_id: string
          p_review_note?: string
          p_status: string
        }
        Returns: {
          courier_id: string
          courier_status: string
        }[]
      }
      admin_review_signup_application: {
        Args: {
          p_application_id: string
          p_review_note?: string
          p_status: string
        }
        Returns: {
          application_id: string
          application_status: string
        }[]
      }
      admin_seed_default_flags: { Args: { p_flags: Json }; Returns: undefined }
      admin_set_user_roles: {
        Args: {
          p_roles: Database["public"]["Enums"]["app_role"][]
          p_user_id: string
        }
        Returns: undefined
      }
      admin_toggle_feature_flag: {
        Args: { p_flag_name: string; p_is_active: boolean }
        Returns: Json
      }
      auth_can_manage_dispatch_job: {
        Args: { p_dispatch_job_id: string }
        Returns: boolean
      }
      auth_can_manage_order_delivery: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      auth_can_view_courier: {
        Args: { p_courier_id: string }
        Returns: boolean
      }
      auth_can_view_dispatch_job: {
        Args: { p_dispatch_job_id: string }
        Returns: boolean
      }
      auth_can_view_order_delivery: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      auth_is_admin: { Args: never; Returns: boolean }
      auth_owns_courier: { Args: { p_courier_id: string }; Returns: boolean }
      auth_owns_restaurant: {
        Args: { p_restaurant_id: string }
        Returns: boolean
      }
      broadcast_topic_notification: {
        Args: {
          p_body: string
          p_category: string
          p_data?: Json
          p_title: string
          p_topic: string
          p_type: string
        }
        Returns: number
      }
      cancel_reservation_by_customer: {
        Args: { p_reservation_id: string }
        Returns: {
          error_code: string
          error_message: string
          ok: boolean
        }[]
      }
      cancel_reservation_by_restaurant: {
        Args: {
          p_reason_code: string
          p_reason_details?: string
          p_reservation_id: string
        }
        Returns: {
          error_code: string
          error_message: string
          ok: boolean
        }[]
      }
      claim_gift_points: { Args: { claim_code_param: string }; Returns: number }
      cleanup_expired_groups: { Args: never; Returns: undefined }
      compute_order_discount_from_payload: {
        Args: {
          p_delivery_fee: number
          p_items_total: number
          p_metadata: Json
          p_total_amount: number
        }
        Returns: number
      }
      compute_restaurant_reservation_fees: {
        Args: {
          p_period_end: string
          p_period_start: string
          p_restaurant_id: string
        }
        Returns: {
          reservations_amount: number
          reservations_count: number
        }[]
      }
      create_order_with_items: {
        Args: {
          checkout_id_param?: string
          delivery_address_param: string
          delivery_fee_param?: number
          items_param?: Json
          metadata_param?: Json
          notes_param?: string
          restaurant_id_param: string
          total_amount_param: number
        }
        Returns: string
      }
      decrement_stock: {
        Args: { p_id: string; p_qty: number; p_table: string }
        Returns: boolean
      }
      delete_user_gdpr_cascade: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      donate_points_for_meal: {
        Args: { description_param?: string; points_param: number }
        Returns: boolean
      }
      enqueue_deliveries: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      enqueue_notification: {
        Args: {
          p_body: string
          p_category: string
          p_data?: Json
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      ensure_guest_profile: {
        Args: {
          p_restaurant_id: string
          p_source_channel?: string
          p_user_id: string
        }
        Returns: string
      }
      estimate_campaign_audience: {
        Args: { p_criteria?: Json; p_restaurant_id: string }
        Returns: number
      }
      find_nearby_couriers: {
        Args: {
          p_lat: number
          p_limit?: number
          p_lng: number
          p_radius_km?: number
        }
        Returns: {
          acceptance_rate: number
          courier_id: string
          distance_km: number
          rating: number
          user_id: string
          vehicle_type: string
        }[]
      }
      generate_monthly_invoices: { Args: { p_month?: string }; Returns: number }
      generate_restaurant_payout_invoice:
        | {
            Args: { p_month?: string; p_restaurant_id: string }
            Returns: number
          }
        | {
            Args: { p_month?: string; p_restaurant_id: string }
            Returns: number
          }
      generate_tok_reservation_fee_invoice: {
        Args: { p_month?: string; p_restaurant_id: string }
        Returns: string
      }
      generate_tok_reservation_fee_invoices_all: {
        Args: { p_month?: string }
        Returns: number
      }
      generate_tok_payable_invoice: {
        Args: { p_month?: string; p_restaurant_id: string }
        Returns: string
      }
      generate_tok_payable_invoices_all: {
        Args: { p_month?: string }
        Returns: number
      }
      get_campaign_stats: {
        Args: { campaign_ids?: string[] }
        Returns: {
          campaign_id: string
          deliveries_failed: number
          deliveries_queued: number
          deliveries_sent: number
          deliveries_total: number
          email_total: number
          in_app_total: number
          notifications_count: number
          push_total: number
          read_count: number
          recipients: number
        }[]
      }
      get_customer_orders_dashboard: {
        Args: never
        Returns: {
          checkout_id: string
          created_at: string
          delivery_address: string
          delivery_fee: number
          delivery_tracking: Json
          dispatch_job: Json
          id: string
          metadata: Json
          notes: string
          order_items: Json
          order_number: string
          restaurant: Json
          restaurant_id: string
          status: string
          total_amount: number
          user_id: string
        }[]
      }
      get_gift_stats: { Args: never; Returns: Json }
      get_order_customers: {
        Args: { p_restaurant_id: string }
        Returns: {
          full_name: string
          phone: string
          user_id: string
        }[]
      }
      get_reservation_customers: {
        Args: { p_restaurant_id: string }
        Returns: {
          full_name: string
          phone: string
          user_id: string
        }[]
      }
      get_reservation_fee_invoice_lines: {
        Args: { p_invoice_id: string }
        Returns: {
          billing_fee_chf: number
          cancellation_reason_code: string
          cancelled_by: string
          party_size: number
          reservation_date: string
          reservation_id: string
          reservation_time: string
          status: string
        }[]
      }
      get_payable_invoice_lines: {
        Args: { p_invoice_id: string }
        Returns: {
          amount_ht: number
          amount_ttc: number
          amount_tva: number
          base_amount: number
          item_kind: string
          line_id: string
          metadata: Json
          occurred_at: string
          quantity: number
          rate_label: string
          rate_value: number | null
          source_id: string | null
          source_label: string | null
          source_table: string | null
          unit_amount: number
        }[]
      }
      get_restaurant_comparison: {
        Args: { p_period: string; p_restaurant_id: string }
        Returns: Json
      }
      get_restaurant_orders_dashboard: {
        Args: { p_restaurant_id: string }
        Returns: {
          checkout_id: string
          created_at: string
          customer: Json
          delivery_address: string
          delivery_fee: number
          delivery_tracking: Json
          dispatch_job: Json
          id: string
          metadata: Json
          notes: string
          order_items: Json
          order_number: string
          restaurant_id: string
          status: string
          total_amount: number
          user_id: string
        }[]
      }
      get_restaurant_payment_history: {
        Args: { p_before?: string; p_limit?: number; p_restaurant_id: string }
        Returns: {
          amount: number
          campaign_id: string
          currency: string
          direction: string
          event_id: string
          event_kind: string
          invoice_id: string
          occurred_at: string
          order_id: string
          payment_method: string
          status: string
          subtitle: string
          title: string
        }[]
      }
      get_restaurant_performance: {
        Args: { p_from: string; p_restaurant_id: string; p_to: string }
        Returns: Json
      }
      get_restaurant_recommendations: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      get_total_donated_meals: { Args: never; Returns: number }
      get_total_donated_points: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_ad_campaign_metric: {
        Args: { p_campaign_id: string; p_metric: string }
        Returns: undefined
      }
      is_feature_flag_active: {
        Args: { p_flag_name: string }
        Returns: boolean
      }
      mark_noshow_reservations: { Args: never; Returns: number }
      normalize_search_text: { Args: { p_text: string }; Returns: string }
      queue_notification_deliveries: {
        Args: {
          p_category: string
          p_data?: Json
          p_notification_id: string
          p_user_id: string
        }
        Returns: number
      }
      rate_limit_consume: {
        Args: {
          p_function_name: string
          p_max_requests: number
          p_subject: string
          p_window_seconds: number
        }
        Returns: boolean
      }
      recompute_restaurant_review_stats: {
        Args: { p_restaurant_id: string }
        Returns: undefined
      }
      record_ad_campaign_event: {
        Args: {
          p_campaign_id: string
          p_conversion_type?: string
          p_dedupe_key: string
          p_event_type: string
          p_page?: string
          p_payload?: Json
          p_restaurant_id: string
          p_source?: string
          p_user_id?: string
        }
        Returns: boolean
      }
      redeem_loyalty_points: {
        Args: {
          description_param?: string
          points_to_redeem: number
          user_id_param: string
        }
        Returns: boolean
      }
      refresh_restaurant_daily_kpis_for_date: {
        Args: { p_day: string; p_restaurant_id: string }
        Returns: undefined
      }
      refresh_restaurant_daily_kpis_recent_days: {
        Args: { p_days_back?: number }
        Returns: undefined
      }
      search_restaurants_catalog: {
        Args: {
          p_city?: string
          p_cuisine?: string
          p_delivery_only?: boolean
          p_limit?: number
          p_min_rating?: number
          p_offset?: number
          p_price_range?: number
          p_query?: string
          p_sort_by?: string
          p_sort_direction?: string
        }
        Returns: {
          address: string
          category_names: string[]
          category_slugs: string[]
          city: string
          created_at: string
          cuisine_type: string
          delivery_available: boolean
          delivery_fee: number
          description: string
          id: string
          image_url: string
          matched_via_menu: boolean
          monthly_orders: number
          monthly_reservations: number
          name: string
          price_range: number
          promotion_score: number
          rating: number
          relevance_score: number
          review_count: number
        }[]
      }
      search_restaurants_nearby: {
        Args: {
          p_cuisine?: string
          p_delivery_only?: boolean
          p_lat: number
          p_limit?: number
          p_lng: number
          p_max_price_range?: number
          p_min_rating?: number
          p_offset?: number
          p_radius_km?: number
          p_search_text?: string
        }
        Returns: {
          address: string
          avg_prep_time_min: number
          city: string
          cuisine_type: string
          delivery_fee: number
          description: string
          distance_km: number
          id: string
          image_url: string
          latitude: number
          longitude: number
          name: string
          price_range: number
          rating: number
          review_count: number
        }[]
      }
      send_gift_points: {
        Args: {
          message_param?: string
          points_param: number
          recipient_email_param: string
        }
        Returns: string
      }
      sync_signup_application: {
        Args: {
          p_address?: string
          p_business_name?: string
          p_business_registration_number?: string
          p_city?: string
          p_documents?: Json
          p_full_name: string
          p_iban?: string
          p_legal_name?: string
          p_license_plate?: string
          p_metadata?: Json
          p_phone?: string
          p_requested_role: Database["public"]["Enums"]["app_role"]
          p_restaurant_description?: string
          p_restaurant_name?: string
          p_tax_id?: string
          p_vehicle_type?: string
        }
        Returns: {
          application_id: string
          application_status: string
          courier_id: string
          restaurant_id: string
        }[]
      }
      update_restaurant_reservation_status_safe: {
        Args: { p_reservation_id: string; p_status: string }
        Returns: {
          error_code: string
          error_message: string
          updated: boolean
        }[]
      }
      validate_and_create_reservation: {
        Args: {
          p_date: string
          p_feature?: string
          p_metadata?: Json
          p_notes?: string
          p_party_size: number
          p_restaurant_id: string
          p_time: string
        }
        Returns: string
      }
      validate_and_create_reservation_safe: {
        Args: {
          p_date: string
          p_feature?: string
          p_metadata?: Json
          p_notes?: string
          p_party_size: number
          p_restaurant_id: string
          p_time: string
        }
        Returns: {
          error_code: string
          error_message: string
          reservation_id: string
        }[]
      }
      validate_service_settings_json: {
        Args: { _opening_hours: Json }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "client" | "restaurateur" | "admin" | "courier"
      loyalty_tier: "bronze" | "silver" | "gold" | "platinum"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["client", "restaurateur", "admin", "courier"],
      loyalty_tier: ["bronze", "silver", "gold", "platinum"],
    },
  },
} as const
