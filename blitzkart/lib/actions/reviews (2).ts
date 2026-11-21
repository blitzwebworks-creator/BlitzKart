"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { removeCustomerImages, uploadCustomerImages, validateCustomerImageFiles } from "@/lib/uploads/customer-images";

export async function submitProductReviewAction(form: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Faccount%2Forders");
  const orderId = String(form.get("order_id") ?? "").trim();
  const productId = String(form.get("product_id") ?? "").trim();
  const rating = Number(form.get("rating"));
  const reviewText = String(form.get("review_text") ?? "").trim();
  let images;
  try { images = await validateCustomerImageFiles(form.getAll("review_images")); }
  catch (error) { redirect(`/account/orders/${encodeURIComponent(orderId)}?review_error=${encodeURIComponent(error instanceof Error ? error.message : "Review images could not be checked")}`); }
  if (!/^[0-9a-f-]{36}$/i.test(orderId) || !/^[0-9a-f-]{36}$/i.test(productId) || !Number.isInteger(rating) || rating < 1 || rating > 5 || reviewText.length > 1000) {
    redirect(`/account/orders/${encodeURIComponent(orderId)}?review_error=Check+the+rating+and+review+text`);
  }
  const { data: previousReviews } = await supabase.rpc("get_order_product_reviews", { p_order_id: orderId });
  const previous = (previousReviews ?? []).find((review: { product_id: string }) => review.product_id === productId) as { review_images?: string[] } | undefined;
  let imagePaths = previous?.review_images ?? [];
  if (images.length) {
    try { imagePaths = await uploadCustomerImages("product-review-images", user.id, images); }
    catch (error) { redirect(`/account/orders/${encodeURIComponent(orderId)}?review_error=${encodeURIComponent(error instanceof Error ? error.message : "Review images could not be uploaded")}`); }
  }
  const { error } = await supabase.rpc("submit_product_review", { p_order_id: orderId, p_product_id: productId, p_rating: rating, p_review_text: reviewText || null, p_review_images: imagePaths });
  if (error) {
    if (images.length) await removeCustomerImages("product-review-images", imagePaths);
    console.error("Verified product rating could not be saved", { code: error.code, message: error.message });
    redirect(`/account/orders/${encodeURIComponent(orderId)}?review_error=This+product+could+not+be+rated.+Only+paid%2C+delivered+orders+can+be+rated.`);
  }
  if (images.length && previous?.review_images?.length) await removeCustomerImages("product-review-images", previous.review_images);
  revalidatePath("/products/[slug]", "page");
  revalidatePath(`/account/orders/${orderId}`);
  redirect(`/account/orders/${orderId}?review_message=Your+verified+product+rating+was+saved`);
}
