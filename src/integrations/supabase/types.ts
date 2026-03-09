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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ad_campaigns: {
        Row: {
          body: string | null
          budget_daily: number | null
          channels: Json | null
          clicks: number | null
          conversions: number | null
          created_at: string | null
          ends_at: string | null
          id: string
          image_url: string | null
          impressions: number | null
          restaurant_id: string
          scheduled_at: string | null
          spent: number | null
          starts_at: string | null
          status: string | null
          target_criteria: Json | null
          target_pages: Json | null
          title: string
          total_budget: number | null
          type: string
          updated_at: string | null
        }
        Insert: {
          body?: string | null
          budget_daily?: number | null
          channels?: Json | null
          clicks?: number | null
          conversions?: number | null
          created_at?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          impressions?: number | null
          restaurant_id: string
          scheduled_at?: string | null
          spent?: number | null
          starts_at?: string | null
          status?: string | null
          target_criteria?: Json | null
          target_pages?: Json | null
          title: string
          total_budget?: number | null
          type: string
          updated_at?: string | null
        }
        Update: {
          body?: string | null
          budget_daily?: number | null
          channels?: Json | null
          clicks?: number | null
          conversions?: number | null
          created_at?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          impressions?: number | null
          restaurant_id?: string
          scheduled_at?: string | null
          spent?: number | null
          starts_at?: string | null
          status?: string | null
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
      loyalty_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          transaction_type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          transaction_type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          transaction_type?: string
          user_id?: string
        }
        Relationships: []
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
          created_at: string
          description: string | null
          discount_percent: number
          formula_key: string
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          restaurant_id: string
        }
        Insert: {
          applies_to: string
          created_at?: string
          description?: string | null
          discount_percent: number
          formula_key: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          restaurant_id: string
        }
        Update: {
          applies_to?: string
          created_at?: string
          description?: string | null
          discount_percent?: number
          formula_key?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
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
      orders: {
        Row: {
          checkout_id: string | null
          created_at: string
          delivery_address: string
          delivery_fee: number | null
          discount_amount: number | null
          donate_earned_xp: boolean | null
          id: string
          idempotency_key: string | null
          metadata: Json | null
          notes: string | null
          order_number: string | null
          original_total: number | null
          restaurant_id: string
          status: string
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          checkout_id?: string | null
          created_at?: string
          delivery_address: string
          delivery_fee?: number | null
          discount_amount?: number | null
          donate_earned_xp?: boolean | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          notes?: string | null
          order_number?: string | null
          original_total?: number | null
          restaurant_id: string
          status?: string
          total_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          checkout_id?: string | null
          created_at?: string
          delivery_address?: string
          delivery_fee?: number | null
          discount_amount?: number | null
          donate_earned_xp?: boolean | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          notes?: string | null
          order_number?: string | null
          original_total?: number | null
          restaurant_id?: string
          status?: string
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
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
      reservations: {
        Row: {
          checkout_id: string | null
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
          restaurant_id: string
          status: string
          time: string
          total_amount: number
          user_id: string
        }
        Insert: {
          checkout_id?: string | null
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
          restaurant_id: string
          status?: string
          time: string
          total_amount?: number
          user_id: string
        }
        Update: {
          checkout_id?: string | null
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
          restaurant_id?: string
          status?: string
          time?: string
          total_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_restaurant_id_fkey"
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
      restaurants: {
        Row: {
          address: string
          city: string
          created_at: string
          cuisine_type: string | null
          delivery_available: boolean | null
          delivery_fee: number | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          latitude: number | null
          longitude: number | null
          min_order_amount: number | null
          name: string
          opening_hours: Json | null
          owner_id: string
          phone: string | null
          points_multiplier: number | null
          price_range: number | null
          rating: number | null
          review_count: number | null
          updated_at: string
        }
        Insert: {
          address: string
          city: string
          created_at?: string
          cuisine_type?: string | null
          delivery_available?: boolean | null
          delivery_fee?: number | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          min_order_amount?: number | null
          name: string
          opening_hours?: Json | null
          owner_id: string
          phone?: string | null
          points_multiplier?: number | null
          price_range?: number | null
          rating?: number | null
          review_count?: number | null
          updated_at?: string
        }
        Update: {
          address?: string
          city?: string
          created_at?: string
          cuisine_type?: string | null
          delivery_available?: boolean | null
          delivery_fee?: number | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          min_order_amount?: number | null
          name?: string
          opening_hours?: Json | null
          owner_id?: string
          phone?: string | null
          points_multiplier?: number | null
          price_range?: number | null
          rating?: number | null
          review_count?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          quality_rating: number
          rating: number
          restaurant_id: string
          service_rating: number
          speed_rating: number
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          quality_rating: number
          rating: number
          restaurant_id: string
          service_rating: number
          speed_rating: number
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          quality_rating?: number
          rating?: number
          restaurant_id?: string
          service_rating?: number
          speed_rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_reservation: {
        Args: { p_reservation_id: string }
        Returns: boolean
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
      generate_monthly_invoices: { Args: { p_month?: string }; Returns: number }
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
      get_gift_stats: { Args: never; Returns: Json }
      get_restaurant_comparison: {
        Args: { p_period: string; p_restaurant_id: string }
        Returns: Json
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
      mark_noshow_reservations: { Args: never; Returns: number }
      recompute_restaurant_review_stats: {
        Args: { p_restaurant_id: string }
        Returns: undefined
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
      send_gift_points: {
        Args: {
          message_param?: string
          points_param: number
          recipient_email_param: string
        }
        Returns: string
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
      validate_service_settings_json: {
        Args: { _opening_hours: Json }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "client" | "restaurateur" | "admin"
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
      app_role: ["client", "restaurateur", "admin"],
      loyalty_tier: ["bronze", "silver", "gold", "platinum"],
    },
  },
} as const
