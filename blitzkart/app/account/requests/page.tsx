import Link from "next/link";
import { ArrowRight, ClipboardList, ShieldAlert } from "lucide-react";
import { redirect } from "next/navigation";
import { AccountLayout } from "@/components/account-layout";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CustomerOrderRequestForm } from "@/components/customer-order-request-form";
import { createCustomerRequestAction } from "@/lib/actions/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/datetime";

type Query = { message?: string; error?: string; order_id?: string };
const requestLabels: Record<string,string> = { cancel: "Cancellation", return: "Return", exchange: "Exchange", account_deletion: "Account deletion" };

export default async function CustomerRequestsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return <div className="wrap"><div className="notice">Customer requests become available after Supabase is configured.</div></div>;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Faccount%2Frequests");
  const [{ data: orders, error: ordersError }, { data: requests, error: requestsError }] = await Promise.all([
    supabase.from("orders").select("id,order_number,status").eq("customer_id",user.id).eq("payment_environment","live").order("created_at",{ascending:false}).limit(100),
    supabase.from("customer_requests").select("id,order_number,request_type,reason,details,status,created_at,processed_at").eq("customer_id",user.id).order("created_at",{ascending:false}).limit(100),
  ]);
  const deletionRequest = (requests ?? []).find((request) => request.request_type === "account_deletion" && ["open","in_progress","approved"].includes(request.status));
  const selectedOrder = query.order_id ? (orders ?? []).find((order) => order.id === query.order_id) : null;
  const requestableOrders = selectedOrder ? [selectedOrder] : orders ?? [];
  return <AccountLayout active="requests"><div className="account-requests-page">
    <header className="account-subpage-heading"><div><span className="section-kicker">ORDER CARE</span><h1>Returns, exchanges & cancellations</h1><p>Send a request and the BlitzKart team will review it.</p></div><span className="account-heading-icon"><ClipboardList size={20}/></span></header>
    {query.message ? <p className="notice account-message" role="status">{query.message}</p> : null}
    {query.error ? <p className="error account-message" role="alert">{query.error}</p> : null}
    <section className="account-card customer-request-card"><div className="account-card-heading"><div><h2>Start an order request</h2><p>Cancellation is blocked once an order is out for delivery. Returns and exchanges can be requested after delivery.</p></div></div>
      {ordersError ? <p className="error">Orders could not be loaded. Refresh this page and try again.</p> : <CustomerOrderRequestForm orders={requestableOrders} initialOrderId={selectedOrder?.id}/>}
    </section>
    <section className="account-card customer-request-history"><div className="account-card-heading"><div><h2>Your requests</h2><p>Requests sent from your BlitzKart account</p></div></div>
      {requestsError ? <p className="error">Request history could not be loaded. Apply migration 0007 and try again.</p> : requests?.length ? <div className="customer-request-list">{requests.map((request) => <article key={request.id}><div className="customer-request-list-heading"><strong>{requestLabels[request.request_type] ?? "Customer request"}{request.order_number ? ` · ${request.order_number}` : ""}</strong><span className={`status status-${request.status}`}>{request.status.replaceAll("_"," ")}</span></div><p>{request.reason}</p>{request.details ? <small>{request.details}</small> : null}<time>{formatDateTime(request.created_at)}</time></article>)}</div> : <p className="muted account-section-empty">You haven’t sent a request yet.</p>}
    </section>
    <section className="account-card account-deletion-card"><span className="account-deletion-icon"><ShieldAlert size={20}/></span><div><h2>Request account deletion</h2><p>Our admin team will review the request and remove your sign-in account and personal delivery details. Order and payment records are retained with personal delivery details erased.</p>{deletionRequest ? <p className="notice">Your account deletion request is {deletionRequest.status.replaceAll("_"," ")}.</p> : <form action={createCustomerRequestAction}><input type="hidden" name="request_type" value="account_deletion"/><input type="hidden" name="reason" value="Account deletion request"/><input type="hidden" name="order_id" value=""/><label className="field"><span>Message <small>Optional</small></span><textarea name="details" maxLength={2000} rows={3} placeholder="Add any context for your request"/></label><ConfirmSubmitButton className="btn btn-outline" message="Send an account deletion request to BlitzKart? Your account will remain active until an administrator reviews it.">Request account deletion</ConfirmSubmitButton></form>}</div></section>
    <p className="account-support-back"><Link href="/account/orders">Back to my orders <ArrowRight size={15}/></Link></p>
  </div></AccountLayout>;
}
