export function SiteLoading() {
  return <div className="wrap route-skeleton" role="status" aria-label="Loading page">
    <span className="skeleton-block skeleton-hero" />
    <span className="skeleton-block skeleton-heading" />
    <div className="skeleton-grid">{Array.from({ length: 5 }, (_, i) => <span className="skeleton-block skeleton-product" key={i}/>)}</div>
  </div>;
}

export function AdminLoading() {
  return <div className="admin-route-skeleton" role="status" aria-label="Loading admin page">
    <span className="skeleton-block skeleton-heading" />
    <div className="admin-skeleton-metrics">{Array.from({ length: 4 }, (_, i) => <span className="skeleton-block" key={i}/>)}</div>
    <span className="skeleton-block admin-skeleton-table" />
  </div>;
}
