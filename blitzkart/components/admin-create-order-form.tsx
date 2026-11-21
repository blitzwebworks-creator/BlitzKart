"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createAdminOrderAction } from "@/lib/actions/admin";
import { money } from "@/lib/types";

type Product = { id: string; name: string; sku: string; selling_price: number; product_delivery_charge: number | null; inventory: { quantity: number; reserved_quantity: number } | null };
type DeliveryOption = { id: string; name: string; price: number; eta: string };
type Address = { id: string; recipient_name: string; phone: string; address_line1: string; address_line2: string | null; locality: string; city: string; state: string; postal_code: string; landmark: string | null; is_default: boolean; available_delivery_methods: DeliveryOption[] };
type Customer = { id: string; full_name: string; email: string; phone: string | null; account_status: string };
type FeeSettings = { packaging_enabled: boolean; packaging_amount: number; platform_enabled: boolean; platform_amount: number; handling_enabled: boolean; handling_amount: number };
type ProductLine = { product_id: string; quantity: number; unit_price: number };

export function AdminCreateOrderForm({ products, productLoadError = false }: { products: Product[]; productLoadError?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [fees, setFees] = useState<FeeSettings | null>(null);
  const [addressId, setAddressId] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("");
  const [lines, setLines] = useState<ProductLine[]>([]);
  const [discount, setDiscount] = useState("0");
  const [orderStatus, setOrderStatus] = useState("pending");
  const [adminNote, setAdminNote] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const currentProduct = (id: string) => products.find((product) => product.id === id);
  const address = addresses.find((item) => item.id === addressId);
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
  const productDeliveryTotal = lines.reduce((sum, line) => sum + line.quantity * Number(currentProduct(line.product_id)?.product_delivery_charge ?? 0), 0);
  const selectedDelivery = address?.available_delivery_methods.find((method) => method.id === deliveryMethod);
  const packaging = fees?.packaging_enabled ? Number(fees.packaging_amount) : 0;
  const platform = fees?.platform_enabled ? Number(fees.platform_amount) : 0;
  const handling = fees?.handling_enabled ? Number(fees.handling_amount) : 0;
  const previewTotal = Math.max(0, subtotal - (Number(discount) || 0) + Number(selectedDelivery?.price ?? 0) + productDeliveryTotal + packaging + platform + handling);
  const availableProducts = products.filter((product) => product.inventory && product.inventory.quantity > product.inventory.reserved_quantity);

  async function lookupCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLookupBusy(true); setError(""); setSuccess(""); setCustomer(null); setAddresses([]); setAddressId(""); setDeliveryMethod("");
    try {
      const response = await fetch(`/api/admin/customer-lookup?email=${encodeURIComponent(email.trim())}`, { cache: "no-store" });
      const result = await response.json() as { error?: string; customer?: Customer; addresses?: Address[]; fees?: FeeSettings };
      if (!response.ok || !result.customer) throw new Error(result.error || "Customer could not be found.");
      setCustomer(result.customer); setAddresses(result.addresses ?? []); setFees(result.fees ?? null);
      const defaultAddress = (result.addresses ?? []).find((item) => item.is_default) ?? result.addresses?.[0];
      if (defaultAddress) {
        setAddressId(defaultAddress.id);
        const firstMethod = defaultAddress.available_delivery_methods[0]?.id ?? "";
        setDeliveryMethod(firstMethod);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Customer lookup failed. Try again."); }
    finally { setLookupBusy(false); }
  }

  function setLine(index: number, update: Partial<ProductLine>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...update } : line));
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    if (!customer || !address) { setError("Find a registered customer and choose one of their saved addresses."); setBusy(false); return; }
    if (!lines.length || lines.some((line) => !line.product_id || line.quantity < 1 || line.quantity > 50 || !Number.isFinite(line.unit_price) || line.unit_price < 0)) { setError("Add valid products, quantities and prices."); setBusy(false); return; }
    if (!address.available_delivery_methods.some((method) => method.id === deliveryMethod)) { setError("The selected delivery option is not currently available for this address."); setBusy(false); return; }
    const form = new FormData(event.currentTarget);
    form.set("customer_email", customer.email); form.set("address_id", address.id); form.set("delivery_method", deliveryMethod);
    form.set("lines", JSON.stringify(lines)); form.set("discount", discount); form.set("order_status", orderStatus); form.set("admin_note", adminNote);
    try {
      const orderId = await createAdminOrderAction(form);
      setSuccess("Order created. Payment is pending verification; no payment was recorded.");
      router.push(`/admin/orders/${orderId}?message=${encodeURIComponent("Order created for customer. Payment is pending verification.")}`);
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Order could not be created."); }
    finally { setBusy(false); }
  }

  return <details className="panel admin-create-record">
    <summary className="admin-create-record-summary"><span><strong>+ Create Order</strong><small>Create a real order using an existing customer, product, address and configured delivery service.</small></span></summary>
    {productLoadError ? <p className="error">Product catalog could not be loaded. Apply migration 0017 or refresh the page.</p> : null}
    {!products.length && !productLoadError ? <p className="muted">There are no active catalog products available to add.</p> : null}
    <form onSubmit={lookupCustomer} className="form-grid admin-create-lookup">
      <label className="field"><span>Customer email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={320} autoComplete="off" placeholder="customer@example.com"/></label>
      <button className="btn btn-outline" type="submit" disabled={lookupBusy}>{lookupBusy ? "Searching…" : "Find customer"}</button>
    </form>
    {customer ? <div className="notice admin-create-customer"><strong>{customer.full_name || "Customer"}</strong> · {customer.email}{customer.phone ? ` · ${customer.phone}` : ""}</div> : null}
    {customer && !addresses.length ? <p className="error">This account has no saved delivery address. Add a verified customer address before placing an order.</p> : null}
    {customer && addresses.length ? <form onSubmit={submitOrder} className="admin-create-order-form">
      <div className="form-grid">
        <label className="field"><span>Saved delivery address</span><select value={addressId} onChange={(event) => { setAddressId(event.target.value); const next = addresses.find((item) => item.id === event.target.value); setDeliveryMethod(next?.available_delivery_methods[0]?.id ?? ""); }} required>
          {addresses.map((item) => <option value={item.id} key={item.id}>{item.recipient_name} · {item.locality}, {item.postal_code}{item.is_default ? " · Default" : ""}</option>)}
        </select></label>
      <label className="field"><span>Delivery method · configured price and availability</span><select value={deliveryMethod} onChange={(event) => setDeliveryMethod(event.target.value)} required disabled={!address?.available_delivery_methods.length}>
          {address?.available_delivery_methods.map((method) => <option value={method.id} key={method.id}>{method.id === "blitz" ? "⚡ " : "🚚 "}{method.name} · {money(method.price)} · {method.eta}</option>)}
          {!address?.available_delivery_methods.length ? <option value="">No delivery mode available now</option> : null}
        </select></label>
      </div>
      {address ? <p className="muted">{address.address_line1}{address.address_line2 ? `, ${address.address_line2}` : ""}, {address.locality}, {address.city}, {address.state} {address.postal_code}{address.landmark ? ` · ${address.landmark}` : ""}</p> : null}
      {address && !address.available_delivery_methods.length ? <p className="error">No configured delivery method is available for this PIN code at this time.</p> : null}
      <div className="admin-create-lines">
        <div className="admin-create-lines-heading"><h3>Products</h3><button className="btn btn-outline btn-small" type="button" onClick={() => setLines((current) => [...current, { product_id: availableProducts[0]?.id ?? "", quantity: 1, unit_price: Number(availableProducts[0]?.selling_price ?? 0) }])} disabled={!availableProducts.length}>Add product</button></div>
        {lines.map((line, index) => {
          const product = currentProduct(line.product_id);
          const available = product ? Math.max(0, product.inventory ? product.inventory.quantity - product.inventory.reserved_quantity : 0) : 0;
          return <div className="form-grid admin-create-product-line" key={`${index}-${line.product_id}`}>
            <label className="field"><span>Catalog product</span><select value={line.product_id} onChange={(event) => { const next = currentProduct(event.target.value); setLine(index, { product_id: event.target.value, unit_price: Number(next?.selling_price ?? 0) }); }} required>
          {products.map((item) => { const available = Math.max(0, (item.inventory?.quantity ?? 0) - (item.inventory?.reserved_quantity ?? 0)); return <option value={item.id} key={item.id} disabled={available < 1}>{item.name} · {item.sku} · {money(item.selling_price)}{available < 1 ? " · Out of stock" : ""}</option>; })}
            </select><small>{available} available</small></label>
            <label className="field"><span>Quantity</span><input type="number" min="1" max={Math.min(50, available || 1)} value={line.quantity} onChange={(event) => setLine(index, { quantity: Number(event.target.value) })} required/></label>
            <label className="field"><span>Unit price (₹) · authorized adjustment</span><input type="number" min="0" max="99999999.99" step="0.01" value={line.unit_price} onChange={(event) => setLine(index, { unit_price: Number(event.target.value) })} required/></label>
            <button className="btn btn-outline btn-small" type="button" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>Remove</button>
          </div>;
        })}
      </div>
      <div className="form-grid">
        <label className="field"><span>Discount amount (₹)</span><input type="number" min="0" max={subtotal} step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} required/></label>
        <label className="field"><span>Order status</span><select value={orderStatus} onChange={(event) => setOrderStatus(event.target.value)}><option value="pending">Pending</option></select><small>Fulfillment cannot begin until payment is verified.</small></label>
        <label className="field"><span>Payment status</span><input value="Pending · verified by payment gateway only" readOnly/></label>
        <label className="field admin-create-wide"><span>Internal admin note <small>Optional</small></span><textarea maxLength={1000} rows={2} value={adminNote} onChange={(event) => setAdminNote(event.target.value)} placeholder="Internal note for this order"/></label>
      </div>
      <div className="admin-create-total"><span>Product subtotal · {money(subtotal)}</span><span>Discount · −{money(Number(discount) || 0)}</span><span>{selectedDelivery?.name ?? "Delivery"} · {money(Number(selectedDelivery?.price ?? 0))}</span>{productDeliveryTotal > 0 ? <span>Product delivery fees · {money(productDeliveryTotal)}</span> : null}{packaging ? <span>Packaging fee · {money(packaging)}</span> : null}{platform ? <span>Platform fee · {money(platform)}</span> : null}{handling ? <span>Handling fee · {money(handling)}</span> : null}<strong>Estimated total · {money(previewTotal)}. The server recalculates using current settings when saved.</strong></div>
      <button className="btn" type="submit" disabled={busy || !lines.length || !address?.available_delivery_methods.some((method) => method.id === deliveryMethod) || productLoadError}>{busy ? "Creating order…" : "Create order · payment pending"}</button>
    </form> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}{success ? <p className="notice" role="status">{success}</p> : null}
  </details>;
}
