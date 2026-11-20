export type CheckoutFeeKey = "packaging" | "platform" | "handling";

export type CheckoutFeeSettings = {
  packaging_enabled: boolean;
  packaging_amount: number;
  platform_enabled: boolean;
  platform_amount: number;
  handling_enabled: boolean;
  handling_amount: number;
};

export type CheckoutFeeBreakdown = {
  packaging_fee: number;
  platform_fee: number;
  handling_fee: number;
};

const toPaise = (amount: number) => Math.round((amount + Number.EPSILON) * 100);
const fromPaise = (amount: number) => Number((amount / 100).toFixed(2));

export function calculateCheckoutFees(settings: CheckoutFeeSettings): CheckoutFeeBreakdown {
  const calculate = (enabled: boolean, amount: number) => {
    if (!Number.isFinite(amount) || amount < 0) throw new Error("Checkout fee settings are invalid.");
    const paise = enabled ? toPaise(amount) : 0;
    if (!Number.isSafeInteger(paise)) throw new Error("Checkout fee settings exceed supported payment limits.");
    return fromPaise(paise);
  };

  return {
    packaging_fee: calculate(settings.packaging_enabled, settings.packaging_amount),
    platform_fee: calculate(settings.platform_enabled, settings.platform_amount),
    handling_fee: calculate(settings.handling_enabled, settings.handling_amount),
  };
}

export function calculateCheckoutTotal(input: {
  subtotal: number;
  discount: number;
  fees: CheckoutFeeBreakdown;
  delivery: number;
  productDelivery: number;
}) {
  const values = [input.subtotal, input.discount, input.delivery, input.productDelivery,
    input.fees.packaging_fee, input.fees.platform_fee, input.fees.handling_fee];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) throw new Error("Checkout totals are invalid.");
  const subtotal = toPaise(input.subtotal);
  const discount = Math.min(subtotal, toPaise(input.discount));
  const total = subtotal - discount + toPaise(input.delivery) + toPaise(input.productDelivery)
    + toPaise(input.fees.packaging_fee) + toPaise(input.fees.platform_fee) + toPaise(input.fees.handling_fee);
  if (!Number.isSafeInteger(total)) throw new Error("The order total exceeds supported payment limits.");
  return fromPaise(total);
}
