"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { createCustomerRequestAction } from "@/lib/actions/admin";

type CustomerOrder = { id: string; order_number: string; status: string };
type RequestType = "cancel" | "return" | "exchange";

const labels: Record<RequestType,string> = { cancel: "Cancel order", return: "Return item", exchange: "Exchange item" };

export function CustomerOrderRequestForm({ orders, initialOrderId = "" }: { orders: CustomerOrder[]; initialOrderId?: string }) {
  const availableTypes = useMemo(() => ( ["cancel","return","exchange"] as RequestType[]).filter((type) =>
    orders.some((order) => type === "cancel"
      ? !["out_for_delivery","delivered","cancelled"].includes(order.status)
      : order.status === "delivered")), [orders]);
  const [requestType, setRequestType] = useState<RequestType>(availableTypes[0] ?? "cancel");
  const [orderId, setOrderId] = useState(initialOrderId);
  const eligibleOrders = orders.filter((order) => requestType === "cancel"
    ? !["out_for_delivery","delivered","cancelled"].includes(order.status)
    : order.status === "delivered");
  const selectedOrder = eligibleOrders.find((order) => order.id === orderId) ?? eligibleOrders[0];
  const whatsappText = selectedOrder
    ? `Hello BlitzKart, I would like to request a ${requestType} for order ${selectedOrder.order_number}. Please contact me about the next steps.`
    : "Hello BlitzKart, I need help with a return or exchange request.";
  const whatsappHref = `https://wa.me/918506006599?text=${encodeURIComponent(whatsappText)}`;

  if (!availableTypes.length) return <div className="account-section-empty"><strong>No eligible order requests right now</strong><span>Cancellation requests are unavailable after an order is out for delivery. Return and exchange requests can be sent after delivery.</span></div>;

  return <form action={createCustomerRequestAction} className="customer-order-request-form">
    <label className="field"><span>Request type</span><select name="request_type" value={requestType} onChange={(event) => { setRequestType(event.target.value as RequestType); setOrderId(""); }}>
      {availableTypes.map((type) => <option value={type} key={type}>{labels[type]}</option>)}
    </select></label>
    <label className="field"><span>Order</span><select name="order_id" value={selectedOrder?.id ?? ""} onChange={(event) => setOrderId(event.target.value)} required>
      {eligibleOrders.map((order) => <option key={order.id} value={order.id}>{order.order_number} · {order.status.replaceAll("_"," ")}</option>)}
    </select></label>
    <label className="field"><span>Reason</span><input name="reason" required minLength={3} maxLength={120} placeholder="Briefly describe what you need"/></label>
    <label className="field"><span>Details <small>Optional</small></span><textarea name="details" maxLength={2000} rows={3} placeholder="Add any details that will help our team"/></label>
    <button className="btn" type="submit">Send {labels[requestType].toLowerCase()} request</button>
    {requestType === "return" || requestType === "exchange" ? <div className="request-whatsapp"><p>You can also message our returns team directly on WhatsApp at <a href="tel:+918506006599">+91 8506006599</a>.</p><Link className="btn btn-outline" href={whatsappHref} target="_blank" rel="noreferrer">Continue on WhatsApp <ArrowUpRight size={15}/></Link><small>WhatsApp messages are handled directly and won’t appear in this account request history.</small></div> : null}
  </form>;
}
