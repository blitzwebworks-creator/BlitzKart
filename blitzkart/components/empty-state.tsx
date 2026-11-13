import Link from "next/link";
export function EmptyState({ title, body, action, href }: { title: string; body: string; action?: string; href?: string }) { return <div className="empty"><strong>{title}</strong><div>{body}</div>{action && href ? <p><Link className="btn btn-outline btn-small" href={href}>{action}</Link></p> : null}</div>; }
