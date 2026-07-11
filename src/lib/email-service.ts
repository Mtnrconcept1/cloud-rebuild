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
    metadata: Record<string, unknown>;
}

export function generateOrderReference(): string {
    const id = globalThis.crypto?.randomUUID?.().replace(/-/g, "").slice(0, 12).toUpperCase();
    if (!id) {
        throw new Error("Secure random generation is unavailable.");
    }
    return `#MZ-${id}`;
}

export async function sendOrderConfirmationEmail(_details: OrderDetails) {
    // Checkout Edge Functions own transactional email delivery. The frontend must
    // never log customer or order data as a fallback.
    return true;
}
