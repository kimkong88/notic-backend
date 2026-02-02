export interface CreateCheckoutSessionOptions {
  successUrl?: string;
  cancelUrl?: string;
  priceKey?: 'monthly' | 'yearly' | 'trial';
}

export interface IBillingProvider {
  createCheckoutSession(userId: string, options: CreateCheckoutSessionOptions): Promise<{ url: string }>;
  createPortalSession(userId: string, returnUrl?: string): Promise<{ url: string }>;
}
