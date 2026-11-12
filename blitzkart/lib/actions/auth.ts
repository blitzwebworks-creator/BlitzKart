"use server";
import { redirect } from "next/navigation";
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
