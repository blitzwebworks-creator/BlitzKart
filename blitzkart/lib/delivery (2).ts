export type DeliveryModeId = "blitz" | "standard";
export type DeliveryZoneMethods = {
  is_active?: boolean;
  is_serviceable?: boolean;
  blitz_enabled?: boolean;
  standard_enabled?: boolean;
  blitz_price?: number | string | null;
  standard_price?: number | string | null;
  blitz_eta?: string | null;
  standard_eta?: string | null;
};
export type AvailableDeliveryMethod = {
  id: DeliveryModeId;
  name: string;
  description: string;
  price: number;
  eta: string;
};

export function availableDeliveryMethods(zone: DeliveryZoneMethods): AvailableDeliveryMethod[] {
  const zoneEnabled = zone.is_active ?? zone.is_serviceable ?? false;
  if (!zoneEnabled) return [];
  const methods: AvailableDeliveryMethod[] = [];
  if (zone.blitz_enabled) {
    const rawPrice = zone.blitz_price; const price = Number(rawPrice); const eta = zone.blitz_eta?.trim() ?? "";
    if (rawPrice !== null && rawPrice !== undefined && rawPrice !== "" && Number.isFinite(price) && price >= 0 && eta.length > 0) methods.push({ id: "blitz", name: "Blitz Delivery", description: "Get your order delivered today.", price, eta });
  }
  if (zone.standard_enabled) {
    const rawPrice = zone.standard_price; const price = Number(rawPrice); const eta = zone.standard_eta?.trim() ?? "";
    if (rawPrice !== null && rawPrice !== undefined && rawPrice !== "" && Number.isFinite(price) && price >= 0 && eta.length > 0) methods.push({ id: "standard", name: "Standard Delivery", description: "Reliable and economical delivery.", price, eta });
  }
  return methods;
}

export function selectedDeliveryMethod(zone: DeliveryZoneMethods, id: DeliveryModeId | undefined) {
  return id ? availableDeliveryMethods(zone).find((method) => method.id === id) ?? null : null;
}
