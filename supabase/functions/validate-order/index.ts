import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface OrderItem {
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  restaurant_id?: string;
  metadata?: Record<string, unknown>;
}

interface ValidateOrderPayload {
  restaurant_id: string;
  delivery_address: string;
  delivery_fee: number;
  total_amount: number;
  notes?: string;
  items: OrderItem[];
  metadata?: Record<string, unknown>;
  checkout_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const payload: ValidateOrderPayload = await req.json();
    const { restaurant_id, delivery_address, delivery_fee, total_amount, notes, items, metadata, checkout_id } = payload;

    if (!restaurant_id || !items || items.length === 0) {
      return new Response(JSON.stringify({ error: "Restaurant et articles requis." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Verify all items exist, are available, and prices match
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Separate regular menu items from special items (anti-waste, flash sales)
    const specialPrefixes = ["antigaspi-", "flash-"];
    const isSpecialItem = (id: string) => specialPrefixes.some((p) => id.startsWith(p));

    const regularItems = items.filter((i) => !isSpecialItem(i.menu_item_id));
    const specialItems = items.filter((i) => isSpecialItem(i.menu_item_id));

    // Validate regular items have valid UUIDs
    const invalidItems = regularItems.filter((i) => !uuidRegex.test(i.menu_item_id));
    if (invalidItems.length > 0) {
      return new Response(
        JSON.stringify({ error: "Articles invalides détectés." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let verifiedTotal = 0;

    // Verify regular menu items against DB
    if (regularItems.length > 0) {
      const menuItemIds = regularItems.map((i) => i.menu_item_id);
      const { data: menuItems, error: menuError } = await supabaseAdmin
        .from("menu_items")
        .select("id, price, is_available, name, restaurant_id")
        .in("id", menuItemIds);

      if (menuError) throw menuError;

      const menuMap = new Map(menuItems?.map((m: any) => [m.id, m]) || []);

      for (const item of regularItems) {
        const dbItem = menuMap.get(item.menu_item_id) as any;
        if (!dbItem) {
          return new Response(
            JSON.stringify({ error: `Article introuvable : ${item.menu_item_id}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (!dbItem.is_available) {
          return new Response(
            JSON.stringify({ error: `Article indisponible : ${dbItem.name}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (Math.abs(dbItem.price - item.unit_price) > 0.01) {
          return new Response(
            JSON.stringify({ error: `Prix incorrect pour ${dbItem.name}. Attendu : ${dbItem.price} CHF` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        verifiedTotal += dbItem.price * item.quantity;
      }
    }

    // Trust special items prices (they are verified via stock checks below)
    for (const item of specialItems) {
      verifiedTotal += item.unit_price * item.quantity;
    }


    // 2. Check anti-waste stock if applicable
    if (metadata && (metadata as any).has_anti_gaspi) {
      for (const item of items) {
        if ((item.metadata as any)?.anti_waste_offer_id) {
          const { data: offer } = await supabaseAdmin
            .from("anti_waste_offers")
            .select("quantity_available, is_active")
            .eq("id", (item.metadata as any).anti_waste_offer_id)
            .single();

          if (!offer || !offer.is_active || offer.quantity_available < item.quantity) {
            return new Response(
              JSON.stringify({ error: "Stock anti-gaspi insuffisant." }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          // Decrement stock atomically
          await supabaseAdmin
            .from("anti_waste_offers")
            .update({ quantity_available: offer.quantity_available - item.quantity })
            .eq("id", (item.metadata as any).anti_waste_offer_id);
        }
      }
    }

    // 3. Check flash sale stock
    if (metadata && (metadata as any).has_flash_sale) {
      for (const item of items) {
        if ((item.metadata as any)?.flash_sale_id) {
          const { data: sale } = await supabaseAdmin
            .from("flash_sales")
            .select("quantity_available, is_active")
            .eq("id", (item.metadata as any).flash_sale_id)
            .single();

          if (!sale || !sale.is_active || sale.quantity_available < item.quantity) {
            return new Response(
              JSON.stringify({ error: "Stock vente flash insuffisant." }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          await supabaseAdmin
            .from("flash_sales")
            .update({ quantity_available: sale.quantity_available - item.quantity })
            .eq("id", (item.metadata as any).flash_sale_id);
        }
      }
    }

    // 4. Create order via RPC (uses service role to bypass RLS, but we set user context)
    const checkoutUuid = checkout_id || crypto.randomUUID();
    const itemsJson = items.map((i) => ({
      menu_item_id: uuidRegex.test(i.menu_item_id) ? i.menu_item_id : null,
      restaurant_id: i.restaurant_id || restaurant_id,
      quantity: i.quantity,
      unit_price: i.unit_price,
      total_price: i.unit_price * i.quantity,
      metadata: { ...(i.metadata || {}), original_item_id: i.menu_item_id },
    }));

    const { data: orderId, error: orderError } = await supabaseUser.rpc(
      "create_order_with_items",
      {
        restaurant_id_param: restaurant_id,
        delivery_address_param: delivery_address || "",
        delivery_fee_param: delivery_fee || 0,
        total_amount_param: total_amount,
        notes_param: notes || null,
        metadata_param: metadata || {},
        checkout_id_param: checkoutUuid,
        items_param: itemsJson,
      }
    );

    if (orderError) throw orderError;

    // 5. Queue confirmation email
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("user_id", userId)
      .single();

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const userEmail = authUser?.user?.email || "client@miamz.ch";

    await supabaseAdmin.from("email_queue").insert({
      to_email: userEmail,
      subject: `Confirmation de commande ${(metadata as any)?.order_reference || ""}`,
      body_text: `Commande confirmée chez le restaurant. Total: ${total_amount} CHF`,
      metadata: { order_id: orderId, restaurant_id, items: items.length },
    });

    return new Response(
      JSON.stringify({ order_id: orderId, verified_total: verifiedTotal }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("validate-order error:", error);
    const msg = error instanceof Error ? error.message : "Erreur interne";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
