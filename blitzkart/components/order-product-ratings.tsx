"use client";

import { Star } from "lucide-react";
import { submitProductReviewAction } from "@/lib/actions/reviews";

type OrderItem = { product_id: string | null; product_name: string; sku: string; quantity: number };
type ExistingReview = { product_id: string; rating: number; review_text: string | null };

export function OrderProductRatings({ orderId, items, reviews }: { orderId: string; items: OrderItem[]; reviews: ExistingReview[] }) {
  const reviewByProduct = new Map(reviews.map((review) => [review.product_id, review]));
  const rateableItems = items.filter((item): item is OrderItem & { product_id: string } => Boolean(item.product_id));
  if (!rateableItems.length) return <p className="muted">Ratings aren’t available for the items on this order.</p>;
  return <div className="order-rating-list">{rateableItems.map((item) => {
    const review = reviewByProduct.get(item.product_id);
    return <form className="order-rating-card" action={submitProductReviewAction} key={item.product_id}>
      <input type="hidden" name="order_id" value={orderId}/><input type="hidden" name="product_id" value={item.product_id}/>
      <div><strong>{item.product_name}</strong><small>Verified purchase · Quantity {item.quantity}</small></div>
      <label className="field"><span>Your rating</span><select name="rating" required defaultValue={review?.rating ?? ""}><option value="" disabled>Select stars</option>{[5,4,3,2,1].map((stars)=><option value={stars} key={stars}>{stars} {stars === 1 ? "star" : "stars"}</option>)}</select></label>
      <label className="field"><span>Review <small>Optional</small></span><textarea name="review_text" maxLength={1000} rows={2} defaultValue={review?.review_text ?? ""} placeholder="Share useful product feedback"/></label>
      <button className="btn btn-outline btn-small"><Star size={15}/> {review ? "Update rating" : "Save rating"}</button>
    </form>;
  })}</div>;
}
