import { getSupabase } from "@/integrations/supabase/client";

export interface OrderDetails {
    orderReference: string;
    restaurantName: string;
    items: Array<{
        name: string;
        quantity: number;
        price: number;
    }>;
    subtotal: number;
    deliveryFee: number;
    formulaDiscount?: number;
    formulaName?: string | null;
    pointsDiscount?: number;
    finalTotal: number;
    customerEmail: string;
    metadata: Record<string, any>;
}

export function generateOrderReference(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `#MZ-${result}`;
}

export async function sendOrderConfirmationEmail(details: OrderDetails) {
    // Queue email via edge function instead of simulating
    try {
        const { error } = await getSupabase().from("email_queue" as any).insert({
            to_email: details.customerEmail,
            subject: `Confirmation de commande ${details.orderReference} - Tok`,
            body_text: buildEmailText(details),
            metadata: {
                order_reference: details.orderReference,
                restaurant_name: details.restaurantName,
                total: details.finalTotal,
                feature: details.metadata.feature || "standard",
            },
        });

        if (error) {
            console.warn("[Email Queue] Failed to queue email, falling back to log:", error.message);
            logEmailFallback(details);
        } else {
            console.log(`[Email Queued] Confirmation for ${details.orderReference} to ${details.customerEmail}`);
        }
    } catch (e) {
        console.warn("[Email Queue] Exception, falling back to log:", e);
        logEmailFallback(details);
    }

    return true;
}

function buildEmailText(details: OrderDetails): string {
    const itemsList = details.items
        .map((item) => `- ${item.name} (x${item.quantity}) : ${(item.price * item.quantity).toFixed(2)} CHF`)
        .join("\n");

    return `
CONFIRMATION DE COMMANDE MIAMZ
Référence : ${details.orderReference}
Restaurant : ${details.restaurantName}
Destinataire : ${details.customerEmail}

DÉTAILS DES ARTICLES :
${itemsList}

RÉCAPITULATIF FINANCIER :
Sous-total : ${details.subtotal.toFixed(2)} CHF
${details.formulaDiscount ? `Réduction Formule (${details.formulaName}) : -${details.formulaDiscount.toFixed(2)} CHF` : ""}
Frais : ${details.deliveryFee.toFixed(2)} CHF
${details.pointsDiscount ? `Réduction Fidélité : -${details.pointsDiscount.toFixed(2)} CHF` : ""}
TOTAL : ${details.finalTotal.toFixed(2)} CHF

Merci d'avoir accordé votre confiance à Tok !
    `.trim();
}

function logEmailFallback(details: OrderDetails) {
    console.log("%c[Email Fallback]", "color: #ec4899; font-weight: bold;");
    console.log(buildEmailText(details));
}
