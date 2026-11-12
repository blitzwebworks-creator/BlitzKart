"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function safeNext(value: FormDataEntryValue | null) {
  const path = String(value ?? "/account");
  return path.startsWith("/") && !path.startsWith("//") ? path : "/account";
}
export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim(); const password = String(formData.get("password") ?? ""); const next = safeNext(formData.get("next"));
  if (!email || !password) redirect(`/login?error=${encodeURIComponent("Enter your email and password.")}`);
  const supabase = await createSupabaseServerClient(); const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);
  redirect(next);
}
export async function registerAction(formData: FormData) {
  const full_name = String(formData.get("full_name") ?? "").trim(); const email = String(formData.get("email") ?? "").trim(); const password = String(formData.get("password") ?? "");
  if (full_name.length < 1 || full_name.length > 100 || !email || password.length < 10) redirect(`/register?error=${encodeURIComponent("Use your name, a valid email and a password of at least 10 characters.")}`);
  const supabase = await createSupabaseServerClient(); const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name } } });
  if (error) redirect(`/register?error=${encodeURIComponent(error.message)}`);
  if (!data.session) redirect(`/login?message=${encodeURIComponent("Check your email to finish creating your account.")}`);
  redirect("/account");
}
export async function signOutAction() {
  const supabase = await createSupabaseServerClient(); await supabase.auth.signOut(); redirect("/");
}

export async function updateProfileAction(formData: FormData) {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (fullName.length < 1 || fullName.length > 100) redirect(`/account?error=${encodeURIComponent("Enter a name between 1 and 100 characters.")}`);
  if (phone && (phone.length > 30 || !/^[+()0-9 .-]{7,30}$/.test(phone))) redirect(`/account?error=${encodeURIComponent("Enter a valid phone number or leave the field empty.")}`);

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Faccount");
  const { error } = await supabase.from("profiles").update({ full_name: fullName, phone: phone || null }).eq("id", user.id);
  if (error) redirect(`/account?error=${encodeURIComponent("Your profile couldn’t be updated. Please try again.")}`);
  revalidatePath("/account");
  redirect(`/account?message=${encodeURIComponent("Profile updated.")}`);
}

function addressValues(formData: FormData) {
  return {
    recipient_name: String(formData.get("recipient_name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    address_line1: String(formData.get("address_line1") ?? "").trim(),
    address_line2: String(formData.get("address_line2") ?? "").trim(),
    locality: String(formData.get("locality") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    state: String(formData.get("state") ?? "").trim(),
    postal_code: String(formData.get("postal_code") ?? "").trim(),
    landmark: String(formData.get("landmark") ?? "").trim(),
  };
}

function validAddress(value: ReturnType<typeof addressValues>) {
  return value.recipient_name.length >= 1 && value.recipient_name.length <= 100
    && value.phone.length >= 7 && value.phone.length <= 20 && /^[+()0-9 .-]+$/.test(value.phone)
    && value.address_line1.length >= 1 && value.address_line1.length <= 200
    && value.address_line2.length <= 200
    && value.locality.length >= 1 && value.locality.length <= 100
    && value.city.length >= 1 && value.city.length <= 100
    && value.state.length >= 1 && value.state.length <= 100
    && /^\d{6}$/.test(value.postal_code)
    && value.landmark.length <= 100;
}

async function isDeliveryZoneConfigured(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, postalCode: string) {
  const { data, error } = await supabase.from("delivery_zones").select("postal_code").eq("postal_code", postalCode).eq("is_active", true).maybeSingle();
  return error ? null : Boolean(data);
}

export async function createAddressAction(formData: FormData) {
  const address = addressValues(formData);
  if (!validAddress(address)) redirect(`/account/addresses?error=${encodeURIComponent("Check the required address fields and PIN code.")}`);
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Faccount%2Faddresses");
  const createZoneAvailable = await isDeliveryZoneConfigured(supabase, address.postal_code);
  if (createZoneAvailable === null) redirect(`/account/addresses?error=${encodeURIComponent("Delivery availability couldn’t be checked. Please try again.")}`);
  if (!createZoneAvailable) redirect(`/account/addresses?error=${encodeURIComponent("Delivery isn’t configured for that PIN code yet.")}`);
  const { count, error: countError } = await supabase.from("addresses").select("id", { count: "exact", head: true }).eq("customer_id", user.id);
  if (countError) redirect(`/account/addresses?error=${encodeURIComponent("Saved addresses couldn’t be checked.")}`);
  const { error } = await supabase.from("addresses").insert({
    customer_id: user.id, recipient_name: address.recipient_name, phone: address.phone,
    address_line1: address.address_line1, address_line2: address.address_line2 || null,
    locality: address.locality, city: address.city, state: address.state,
    postal_code: address.postal_code, landmark: address.landmark || null, is_default: count === 0,
  });
  if (error) redirect(`/account/addresses?error=${encodeURIComponent(error.code === "23505" ? "This address is already saved." : "Address couldn’t be saved. Please try again.")}`);
  revalidatePath("/account");
  revalidatePath("/account/addresses");
  redirect(`/account/addresses?message=${encodeURIComponent("Address saved.")}`);
}

export async function updateAddressAction(formData: FormData) {
  const id = String(formData.get("address_id") ?? "").trim();
  const address = addressValues(formData);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !validAddress(address)) redirect(`/account/addresses?error=${encodeURIComponent("Check the address details and try again.")}`);
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Faccount%2Faddresses");
  const updateZoneAvailable = await isDeliveryZoneConfigured(supabase, address.postal_code);
  if (updateZoneAvailable === null) redirect(`/account/addresses?error=${encodeURIComponent("Delivery availability couldn’t be checked. Please try again.")}`);
  if (!updateZoneAvailable) redirect(`/account/addresses?error=${encodeURIComponent("Delivery isn’t configured for that PIN code yet.")}`);
  const { data, error } = await supabase.from("addresses").update({
    recipient_name: address.recipient_name, phone: address.phone,
    address_line1: address.address_line1, address_line2: address.address_line2 || null,
    locality: address.locality, city: address.city, state: address.state,
    postal_code: address.postal_code, landmark: address.landmark || null,
  }).eq("id", id).eq("customer_id", user.id).select("id").maybeSingle();
  if (error || !data) redirect(`/account/addresses?error=${encodeURIComponent("Address couldn’t be updated. Please try again.")}`);
  revalidatePath("/account");
  revalidatePath("/account/addresses");
  redirect(`/account/addresses?message=${encodeURIComponent("Address updated.")}`);
}
