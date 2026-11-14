"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function adminContext() {
  const supabase = await createSupabaseServerClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fadmin");
  const { data } = await supabase.from("admin_users").select("active").eq("user_id", user.id).maybeSingle();
  if (!data?.active) throw new Error("Administrator access required.");
  return { supabase, user };
}
function str(form: FormData, key: string) { return String(form.get(key) ?? "").trim(); }
function num(form: FormData, key: string, fallback = 0) { const raw = str(form,key); const value = raw === "" ? fallback : Number(raw); if (!Number.isFinite(value)) throw new Error(`Enter a valid ${key.replaceAll("_"," ")}.`); return value; }
function slugify(value: string) { return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80); }
function productSpecifications(form: FormData) {
  const raw = str(form, "specifications");
  if (!raw) return {};
  if (raw.length > 5000) throw new Error("Specifications must be 5,000 characters or fewer.");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("Specifications must be valid JSON."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Specifications must be a JSON object.");
  return value as Record<string, unknown>;
}

export async function updateOrderStatusAction(form: FormData) {
  const { supabase, user } = await adminContext(); const orderId = str(form,"order_id"); const status = str(form,"status"); const note = str(form,"note");
  const allowed = ["pending","confirmed","sourcing","packed","ready_for_pickup","out_for_delivery","delivered","cancelled"];
  if (!orderId || !allowed.includes(status)) throw new Error("Invalid order status update.");
  const { error } = await supabase.rpc("admin_update_order_status", { p_order_id: orderId, p_status: status, p_note: null });
  if (error) redirect(`/admin/orders/${orderId}?error=${encodeURIComponent(error.message)}`);
  if (note) { const { error: noteError } = await supabase.from("internal_order_notes").insert({ order_id: orderId, admin_id: user.id, note: note.slice(0,1000) }); if (noteError) redirect(`/admin/orders/${orderId}?error=${encodeURIComponent(noteError.message)}`); }
  revalidatePath("/admin/orders"); revalidatePath(`/admin/orders/${orderId}`); revalidatePath("/account/orders"); revalidatePath(`/account/orders/${orderId}`); redirect(`/admin/orders?message=${encodeURIComponent("Order updated.")}`);
}
export async function updateDeliveryAction(form: FormData) {
  const { supabase } = await adminContext(); const allowed = ["pending","booked","picked_up","in_transit","out_for_delivery","delivered","exception","cancelled"];
  const orderId = str(form,"order_id"); const status = str(form,"status"); const mode = "manual";
  if (!orderId || !allowed.includes(status)) throw new Error("Invalid delivery update.");
  let deliveryError: { code?: string; message?: string } | null = null;
  try {
    const { error } = await supabase.rpc("admin_update_delivery", { p_order_id: orderId, p_status: status, p_tracking: str(form,"tracking_reference"), p_notes: str(form,"notes"), p_mode: mode });
    deliveryError = error;
  } catch (error) {
    console.error("Admin delivery update request failed", error);
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent("Delivery tracking could not be saved. Check the order status and database configuration, then retry.")}`);
  }
  if (deliveryError) {
    console.error("Admin delivery update failed", { code: deliveryError.code, message: deliveryError.message });
    redirect(`/admin/orders/${orderId}?error=${encodeURIComponent("Delivery tracking could not be saved. Check the order status and database configuration, then retry.")}`);
  }
  revalidatePath("/admin/deliveries"); revalidatePath("/admin/orders"); revalidatePath(`/admin/orders/${orderId}`); revalidatePath(`/account/orders/${orderId}`);
  redirect(`/admin/orders/${orderId}?message=Delivery+tracking+updated`);
}
export async function adjustInventoryAction(form: FormData) {
  const { supabase } = await adminContext(); const productId = str(form,"product_id"); const quantity = Math.floor(num(form,"quantity")); const reason = str(form,"reason");
  if (!productId || quantity < 0 || reason.length < 3) throw new Error("Provide a valid stock quantity and adjustment reason.");
  const { error } = await supabase.rpc("admin_adjust_inventory", { p_product_id: productId, p_new_quantity: quantity, p_reason: reason });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/inventory"); revalidatePath("/products"); redirect("/admin/inventory?message=Inventory+updated");
}
export async function createProductAction(form: FormData): Promise<string> {
  const { supabase } = await adminContext(); const name = str(form,"name"); const sku = `BK-${randomUUID().replaceAll("-", "").slice(0, 18).toUpperCase()}`; const price = num(form,"selling_price",NaN); const original = str(form,"original_price");
  if (name.length < 2 || !Number.isFinite(price) || price < 0) throw new Error("Enter a product name and valid selling price.");
  const originalPrice = original ? num(form,"original_price") : null;
  const deliveryRaw = str(form,"product_delivery_charge"); const productDeliveryCharge = deliveryRaw ? num(form,"product_delivery_charge",NaN) : null;
  if (productDeliveryCharge !== null && (!Number.isFinite(productDeliveryCharge) || productDeliveryCharge < 0 || productDeliveryCharge > 9999999999.99 || Math.abs(productDeliveryCharge * 100 - Math.round(productDeliveryCharge * 100)) > 1e-8)) throw new Error("Enter a valid product delivery charge with no more than two decimal places.");
  if (originalPrice !== null && originalPrice < price) throw new Error("Original price must be at least the selling price.");
  const product = { name, slug: slugify(str(form,"slug") || name), description: str(form,"description"), category_id: str(form,"category_id"), sku, selling_price: price, original_price: originalPrice, product_delivery_charge: productDeliveryCharge, is_featured: form.get("is_featured") === "on", is_active: form.get("is_active") === "on", specifications: productSpecifications(form) };
  const { data: productId, error } = await supabase.rpc("admin_create_product", { p_product: product, p_quantity: Math.floor(num(form,"quantity")), p_low_stock: Math.floor(num(form,"low_stock_threshold",5)) });
  if (error || !productId) throw new Error(error?.message || "Product could not be created.");
  revalidatePath("/"); revalidatePath("/products"); revalidatePath("/admin/products");
  return productId;
}
export async function updateProductAction(form: FormData) {
  const { supabase } = await adminContext(); const id = str(form,"product_id"); const name = str(form,"name"); const selling = num(form,"selling_price",NaN); const original = str(form,"original_price");
  if (!id || name.length < 2 || !Number.isFinite(selling)) throw new Error("Check the product details.");
  const { data: existingProduct, error: lookupError } = await supabase.from("products").select("sku").eq("id", id).maybeSingle();
  if (lookupError || !existingProduct) throw new Error("The existing product could not be loaded.");
  const originalPrice = original ? num(form,"original_price") : null;
  const deliveryRaw = str(form,"product_delivery_charge"); const productDeliveryCharge = deliveryRaw ? num(form,"product_delivery_charge",NaN) : null;
  if (productDeliveryCharge !== null && (!Number.isFinite(productDeliveryCharge) || productDeliveryCharge < 0 || productDeliveryCharge > 9999999999.99 || Math.abs(productDeliveryCharge * 100 - Math.round(productDeliveryCharge * 100)) > 1e-8)) throw new Error("Enter a valid product delivery charge with no more than two decimal places.");
  if (originalPrice !== null && originalPrice < selling) throw new Error("Original price must be at least the selling price.");
  const { error } = await supabase.rpc("admin_update_product", { p_product_id: id, p_product: { name, slug: slugify(str(form,"slug") || name), description: str(form,"description"), category_id: str(form,"category_id"), sku: existingProduct.sku, selling_price: selling, original_price: originalPrice, product_delivery_charge: productDeliveryCharge, is_featured: form.get("is_featured") === "on", is_active: form.get("is_active") === "on", specifications: productSpecifications(form) } });
  if (error) throw new Error(error.message);
  revalidatePath("/"); revalidatePath("/products"); redirect("/admin/products?message=Product+updated");
}
export async function deleteProductAction(form: FormData) {
  const { supabase } = await adminContext(); const id = str(form,"product_id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid product reference.");
  const { data: images, error: imageQueryError } = await supabase.from("product_images").select("image_url").eq("product_id", id);
  if (imageQueryError) redirect(`/admin/products?error=${encodeURIComponent("Product images could not be checked; no deletion was made.")}`);
  const { error } = await supabase.rpc("admin_delete_product", { p_product_id: id });
  if (error) {
    const deletionBlockedByHistory = /cannot be deleted|clear the product stock/i.test(error.message);
    if (!deletionBlockedByHistory) redirect(`/admin/products?error=${encodeURIComponent(error.message)}`);

    const currentColumns = "name,slug,description,category_id,sku,selling_price,original_price,product_delivery_charge,specifications,is_featured,is_active";
    let currentProduct = await supabase.from("products").select(currentColumns).eq("id", id).maybeSingle();
    if (currentProduct.error?.message.toLowerCase().includes("product_delivery_charge")) {
      currentProduct = await supabase.from("products").select(currentColumns.replace("product_delivery_charge,", "")).eq("id", id).maybeSingle();
    }
    if (currentProduct.error || !currentProduct.data) redirect(`/admin/products?error=${encodeURIComponent("The product could not be deactivated. No records were removed.")}`);

    const savedProduct = currentProduct.data as Record<string, unknown>;
    const { error: deactivateError } = await supabase.rpc("admin_update_product", {
      p_product_id: id,
      p_product: { ...savedProduct, is_active: false },
    });
    if (deactivateError) redirect(`/admin/products?error=${encodeURIComponent("The product could not be deactivated. No records were removed.")}`);
    revalidatePath("/"); revalidatePath("/products"); revalidatePath("/admin/products");
    redirect(`/admin/products?message=${encodeURIComponent("Product deactivated to preserve its stock and order history.")}`);
  }
  const storagePrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "")}/storage/v1/object/public/product-images/`;
  const paths = (images ?? []).flatMap(({ image_url }) => {
    if (!image_url.startsWith(storagePrefix)) return [];
    try { return [decodeURIComponent(new URL(image_url).pathname.slice(new URL(storagePrefix).pathname.length))]; }
    catch { return []; }
  });
  if (paths.length) {
    const { error: cleanupError } = await supabase.storage.from("product-images").remove(paths);
    if (cleanupError) redirect(`/admin/products?error=${encodeURIComponent("Product deleted; one or more stored images need manual cleanup.")}`);
  }
  revalidatePath("/"); revalidatePath("/products"); revalidatePath("/admin/products");
  redirect("/admin/products?message=Product+deleted");
}
export async function createCategoryAction(form: FormData): Promise<{ id: string }> {
  const { supabase } = await adminContext(); const name = str(form,"name"); if (name.length < 2) throw new Error("Enter a category name.");
  const { data, error } = await supabase.from("categories").insert({ name, slug: slugify(str(form,"slug") || name), description: str(form,"description") || null, is_active: true }).select("id").single();
  if (error || !data) throw new Error(error?.message || "Category could not be created.");
  revalidatePath("/"); revalidatePath("/products");
  return { id: data.id };
}
export async function createCouponAction(form: FormData) {
  const { supabase } = await adminContext(); const code = str(form,"code").toUpperCase(); const type = str(form,"discount_type"); const value = num(form,"discount_value",NaN); const minimum = num(form,"minimum_order_value"); const limit = str(form,"usage_limit"); const expiry = str(form,"expires_at");
  if (!/^[A-Z0-9_-]{3,32}$/.test(code) || !["fixed","percentage"].includes(type) || !Number.isFinite(value) || value <= 0 || (type === "percentage" && value > 100)) throw new Error("Check the coupon code and discount values.");
  const { error } = await supabase.from("coupons").insert({ code, discount_type: type, discount_value: value, minimum_order_value: minimum, usage_limit: limit ? Math.floor(Number(limit)) : null, expires_at: expiry ? new Date(expiry).toISOString() : null, is_active: true });
  if (error) throw new Error(error.message); revalidatePath("/admin/coupons"); redirect("/admin/coupons?message=Coupon+created");
}
export async function toggleCouponAction(form: FormData) {
  const { supabase } = await adminContext(); const id = str(form,"coupon_id"); const active = str(form,"is_active") === "true";
  const { error } = await supabase.from("coupons").update({ is_active: !active }).eq("id",id);
  if (error) throw new Error(error.message); revalidatePath("/admin/coupons"); redirect("/admin/coupons?message=Coupon+updated");
}
export async function updateCouponAction(form: FormData) {
  const { supabase } = await adminContext(); const id = str(form,"coupon_id"); const code = str(form,"code").toUpperCase(); const type = str(form,"discount_type"); const value = num(form,"discount_value",NaN); const minimum = num(form,"minimum_order_value"); const limit = str(form,"usage_limit"); const expiry = str(form,"expires_at");
  if (!id || !/^[A-Z0-9_-]{3,32}$/.test(code) || !["fixed","percentage"].includes(type) || !Number.isFinite(value) || value <= 0 || (type === "percentage" && value > 100)) throw new Error("Check the coupon details.");
  const { error } = await supabase.from("coupons").update({ code, discount_type: type, discount_value: value, minimum_order_value: minimum, usage_limit: limit ? Math.floor(Number(limit)) : null, expires_at: expiry ? new Date(expiry).toISOString() : null, is_active: form.get("is_active") === "on" }).eq("id",id);
  if (error) throw new Error(error.message); revalidatePath("/admin/coupons"); redirect("/admin/coupons?message=Coupon+updated");
}
export async function toggleCategoryAction(form: FormData) {
  const { supabase } = await adminContext(); const id = str(form,"category_id"); const active = str(form,"is_active") === "true";
  const { error } = await supabase.from("categories").update({ is_active: !active }).eq("id",id);
  if (error) throw new Error(error.message); revalidatePath("/"); revalidatePath("/admin/categories"); redirect("/admin/categories?message=Category+updated");
}
export async function setCustomerStatusAction(form: FormData) {
  const { supabase } = await adminContext(); const { error } = await supabase.rpc("admin_set_customer_status", { p_user_id: str(form,"customer_id"), p_status: str(form,"status") });
  if (error) throw new Error(error.message); revalidatePath("/admin/customers"); redirect("/admin/customers?message=Customer+status+updated");
}
export async function createSupplierAction(form: FormData) {
  const { supabase } = await adminContext(); const name = str(form,"name"); if (name.length < 2) throw new Error("Enter a supplier name.");
  const { error } = await supabase.from("suppliers").insert({ name, reference: str(form,"reference") || null, phone: str(form,"phone") || null, email: str(form,"email") || null, notes: str(form,"notes") || null, is_active: true });
  if (error) throw new Error(error.message); revalidatePath("/admin/suppliers"); redirect("/admin/suppliers?message=Supplier+recorded");
}
export async function toggleSupplierAction(form: FormData) {
  const { supabase } = await adminContext(); const id = str(form,"supplier_id"); const active = str(form,"is_active") === "true";
  const { error } = await supabase.from("suppliers").update({ is_active: !active }).eq("id",id);
  if (error) throw new Error(error.message); revalidatePath("/admin/suppliers"); redirect("/admin/suppliers?message=Supplier+updated");
}
export async function createSourcingRecordAction(form: FormData) {
  const { supabase, user } = await adminContext(); const productName = str(form,"product_name"); const quantity = Math.floor(num(form,"quantity")); const cost = num(form,"purchase_cost",NaN);
  if (productName.length < 2 || quantity < 1 || !Number.isFinite(cost) || cost < 0) throw new Error("Enter valid sourcing details.");
  const { error } = await supabase.from("sourcing_records").insert({ supplier_id: str(form,"supplier_id") || null, order_id: str(form,"order_id") || null, product_id: str(form,"product_id") || null, product_name: productName, quantity, purchase_cost: cost, purchase_date: str(form,"purchase_date") || null, status: str(form,"status") || "pending", notes: str(form,"notes") || null, created_by: user.id });
  if (error) throw new Error(error.message); revalidatePath("/admin/sourcing"); redirect("/admin/sourcing?message=Sourcing+record+added");
}
export async function updateSourcingRecordAction(form: FormData) {
  const { supabase } = await adminContext(); const id = str(form,"record_id"); const status = str(form,"status");
  if (!["pending","ordered","received","cancelled"].includes(status)) throw new Error("Invalid sourcing status.");
  const { error } = await supabase.from("sourcing_records").update({ status, notes: str(form,"notes") || null }).eq("id",id);
  if (error) throw new Error(error.message); revalidatePath("/admin/sourcing"); redirect("/admin/sourcing?message=Sourcing+record+updated");
}
export async function updateDeliveryPincodeAction(form: FormData) {
  const { supabase } = await adminContext();
  const id = str(form, "pincode_id");
  const aliasesText = str(form, "locality_aliases");
  const aliases = aliasesText ? [...new Set(aliasesText.split(",").map((alias) => alias.trim()).filter(Boolean))] : [];
  const deliveryCharge = num(form, "delivery_charge", NaN);
  const minimumOrder = num(form, "minimum_order_amount", NaN);
  const etaRaw = str(form, "estimated_delivery_minutes");
  const eta = etaRaw ? Number(etaRaw) : null;
  if (!/^[0-9a-f-]{36}$/i.test(id) || aliases.length > 20 || aliases.some((alias) => alias.length > 100)
    || !Number.isFinite(deliveryCharge) || deliveryCharge < 0 || deliveryCharge > 9999999999.99
    || !Number.isFinite(minimumOrder) || minimumOrder < 0 || minimumOrder > 9999999999.99
    || (eta !== null && (!Number.isInteger(eta) || eta < 1 || eta > 10080))) {
    throw new Error("Check the PIN code aliases, fee, minimum order and delivery estimate.");
  }
  const { data, error } = await supabase.from("delivery_zones").update({
    locality_aliases: aliases,
    delivery_charge: deliveryCharge,
    minimum_order_amount: minimumOrder,
    estimated_delivery_minutes: eta,
    is_active: form.get("is_active") === "on",
  }).eq("id", id).eq("is_directory_verified", true).select("postal_code").maybeSingle();
  if (error || !data) throw new Error("Verified PIN code could not be updated. Apply migration 0008 and try again.");
  revalidatePath("/"); revalidatePath("/admin/pincodes"); revalidatePath("/admin/settings"); revalidatePath("/checkout"); revalidatePath("/products");
  redirect("/admin/pincodes?message=PIN+code+updated");
}

export async function bulkUpdateDeliveryPincodesAction(form: FormData) {
  const { supabase } = await adminContext();
  const ids = [...new Set(form.getAll("pincode_id").map((value) => String(value)).filter((value) => /^[0-9a-f-]{36}$/i.test(value)))];
  if (!ids.length || ids.length > 76) throw new Error("Select at least one verified PIN code.");
  const isActive = str(form, "is_active") === "true";
  const { data, error } = await supabase.from("delivery_zones").update({ is_active: isActive })
    .in("id", ids).eq("is_directory_verified", true).select("id");
  if (error) throw new Error("PIN codes could not be updated. Apply migration 0008 and try again.");
  const count = data?.length ?? 0;
  revalidatePath("/"); revalidatePath("/admin/pincodes"); revalidatePath("/admin/settings"); revalidatePath("/checkout"); revalidatePath("/products");
  redirect(`/admin/pincodes?message=${encodeURIComponent(`${count} PIN codes ${isActive ? "enabled" : "disabled"}.` )}`);
}
export async function createBannerAction(form: FormData) {
  const { supabase } = await adminContext(); const title = str(form,"title"); const body = str(form,"body"); const href = str(form,"href"); const starts = str(form,"starts_at"); const ends = str(form,"ends_at");
  if (title.length < 2 || (href && (!href.startsWith("/") || href.startsWith("//")))) throw new Error("Use a title and a same-site link starting with one slash.");
  const { error } = await supabase.from("promotional_banners").insert({ title, body: body || null, href: href || null, is_active: form.get("is_active") === "on", starts_at: starts ? new Date(starts).toISOString() : null, ends_at: ends ? new Date(ends).toISOString() : null });
  if (error) throw new Error(error.message); revalidatePath("/"); revalidatePath("/admin/settings"); redirect("/admin/settings?message=Promotion+saved");
}
export async function toggleBannerAction(form: FormData) {
  const { supabase } = await adminContext(); const id = str(form,"banner_id"); const active = str(form,"is_active") === "true";
  const { error } = await supabase.from("promotional_banners").update({ is_active: !active }).eq("id",id);
  if (error) throw new Error(error.message); revalidatePath("/"); revalidatePath("/admin/settings"); redirect("/admin/settings?message=Promotion+updated");
}
export async function createSupportRequestAction(form: FormData) {
  const supabase = await createSupabaseServerClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Faccount%2Fsupport");
  const orderId = str(form,"order_id") || null;
  const subject = str(form,"subject");
  const message = str(form,"message");
  if (subject.length < 3 || subject.length > 120 || message.length < 10 || message.length > 3000) throw new Error("Check the subject and message length.");
  if (orderId) {
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new Error("Choose a valid order.");
    const { data: ownedOrder, error: orderError } = await supabase.from("orders").select("id").eq("id",orderId).eq("customer_id",user.id).maybeSingle();
    if (orderError || !ownedOrder) throw new Error("Choose one of your own orders or send a general request.");
  }
  const { error } = await supabase.from("support_requests").insert({ customer_id: user.id, order_id: orderId, subject, message });
  if (error) throw new Error(error.message); revalidatePath("/account/support"); redirect("/account/support?message=Your+request+was+sent");
}
export async function updateSupportRequestAction(form: FormData) {
  const { supabase } = await adminContext(); const id = str(form,"request_id"); const status = str(form,"status");
  if (!["open","in_progress","resolved"].includes(status)) throw new Error("Invalid request status.");
  const { error } = await supabase.rpc("admin_update_support_status", { p_request_id: id, p_status: status });
  if (error) throw new Error(error.message); revalidatePath("/admin/support"); redirect("/admin/support?message=Support+request+updated");
}

export async function createCustomerRequestAction(form: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Faccount%2Frequests");
  const requestType = str(form,"request_type");
  const orderId = str(form,"order_id") || null;
  const reason = str(form,"reason");
  const details = str(form,"details");
  if (!["cancel","return","exchange","account_deletion"].includes(requestType) || reason.length < 3 || reason.length > 120 || details.length > 2000) {
    redirect(`/account/requests?error=${encodeURIComponent("Check the request type, reason and details.")}`);
  }
  if (orderId && !/^[0-9a-f-]{36}$/i.test(orderId)) redirect("/account/requests?error=Choose+a+valid+order");
  const { error } = await supabase.rpc("create_customer_request", {
    p_request_type: requestType,
    p_order_id: orderId,
    p_reason: reason,
    p_details: details || null,
  });
  if (error) {
    console.error("Customer request could not be saved", { code: error.code, message: error.message });
    redirect(`/account/requests?error=${encodeURIComponent(error.message.includes("out for delivery") ? "This order can no longer be cancelled." : error.message.includes("after delivery") ? "Returns and exchanges can be requested after delivery." : "Your request could not be submitted. Check the order and try again.")}`);
  }
  revalidatePath("/account/requests");
  revalidatePath("/admin/requests");
  redirect("/account/requests?message=Request+sent+to+BlitzKart");
}

export async function markCustomerNotificationReadAction(form: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Faccount%2Fnotifications");
  const id = str(form,"notification_id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/account/notifications?error=Invalid+notification");
  const { error } = await supabase.rpc("mark_customer_notification_read", { p_notification_id: id });
  if (error) redirect("/account/notifications?error=Notification+could+not+be+updated");
  revalidatePath("/account/notifications");
  redirect("/account/notifications?message=Notification+marked+as+read");
}

export async function updateCustomerRequestAction(form: FormData) {
  const { supabase } = await adminContext();
  const id = str(form,"request_id");
  const status = str(form,"status");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["open","in_progress","approved","rejected","completed"].includes(status)) {
    redirect("/admin/requests?error=Invalid+request+update");
  }
  const { error } = await supabase.rpc("admin_update_customer_request", { p_request_id: id, p_status: status });
  if (error) {
    console.error("Customer request update failed", { code: error.code, message: error.message });
    redirect(`/admin/requests?error=${encodeURIComponent(error.message.includes("refund") ? "Paid orders need a refund workflow before cancellation can be approved." : error.message.includes("out for delivery") || error.message.includes("cancelled") ? "This order can no longer be cancelled." : error.message.includes("delivered") ? "Return or exchange approval requires a delivered order." : "The request could not be updated. Review its current order status and try again.")}`);
  }
  revalidatePath("/admin/requests");
  revalidatePath("/admin/orders");
  revalidatePath("/account/requests");
  revalidatePath("/account/notifications");
  redirect("/admin/requests?message=Request+updated");
}

export async function deleteCustomerAccountAction(form: FormData) {
  const { supabase } = await adminContext();
  const requestId = str(form,"request_id");
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) redirect("/admin/requests?error=Invalid+deletion+request");
  const { error } = await supabase.rpc("admin_delete_customer_account", { p_request_id: requestId });
  if (error) {
    console.error("Customer account deletion failed", { code: error.code, message: error.message });
    redirect("/admin/requests?error=The account was not removed. Check that an active customer deletion request exists.");
  }
  revalidatePath("/admin/requests");
  revalidatePath("/admin/customers");
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  redirect("/admin/requests?message=Account+removed.+Order+records+were+retained+with+personal+delivery+details+erased.");
}

export async function deleteOrderAction(form: FormData) {
  const { supabase } = await adminContext();
  const id = str(form,"order_id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/admin/orders?error=Invalid+order+reference");
  const { error } = await supabase.rpc("admin_delete_order", { p_order_id: id });
  if (error) {
    console.error("Admin order deletion failed", { code: error.code, message: error.message });
    redirect("/admin/orders?error=The order could not be removed. Check its current status and try again.");
  }
  revalidatePath("/admin/orders");
  revalidatePath("/admin/deliveries");
  revalidatePath("/admin/sourcing");
  revalidatePath("/admin/analytics");
  revalidatePath("/account/orders");
  revalidatePath("/admin");
  redirect("/admin/orders?message=Order+and+its+tracking+record+deleted");
}
