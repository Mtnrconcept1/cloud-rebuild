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
    await new Promise((resolve) => setTimeout(resolve, 800));

    const itemsList = details.items
        .map((item) => `- ${item.name} (x${item.quantity}) : ${(item.price * item.quantity).toFixed(2)} CHF`)
        .join("\n");

    const emailBody = `
========= CONFIRMATION DE COMMANDE MIAMZ =========
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

INFORMATIONS COMPLÉMENTAIRES :
Feature : ${details.metadata.feature || "Standard"}
${details.metadata.arrival_time ? `Heure d'arrivée prévue : ${details.metadata.arrival_time}` : ""}
${details.metadata.delivery_address ? `Adresse de livraison : ${details.metadata.delivery_address}` : ""}
Méthode de paiement : ${details.metadata.payment_method || "Carte"}

Merci d'avoir accordé votre confiance à Miamz !
==================================================
  `;

    console.log("%c[Simulated Email Sent]", "color: #ec4899; font-weight: bold; font-size: 1.2em;");
    console.log(emailBody);

    return true;
}