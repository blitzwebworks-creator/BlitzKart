"use client";

import { AdminErrorState } from "@/components/admin-error-state";

export default function AdminOrderError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <AdminErrorState
    error={error}
    reset={reset}
    title="Delivery tracking couldn’t load"
    description="Order or delivery details could not be read. Retry this page. If the error returns, use the reference below when checking the Vercel function logs."
    backHref="/admin/orders"
    backLabel="Back to orders"
  />;
}
