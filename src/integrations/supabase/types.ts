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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
