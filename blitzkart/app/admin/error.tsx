"use client";

import { AdminErrorState } from "@/components/admin-error-state";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <AdminErrorState
    error={error}
    reset={reset}
    title="We couldn’t load this admin page"
    description="Store data or an admin service could not be reached. Retry the page, or return to the storefront and check the Vercel function logs if the issue continues."
    backHref="/"
    backLabel="View storefront"
  />;
}
