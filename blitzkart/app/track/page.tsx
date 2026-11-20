import Link from "next/link";
export default function TrackPage() { return <div className="wrap"><div className="form-card"><h1>Track your order</h1><p className="muted">For account security, order and delivery details are visible after sign in.</p><Link className="btn" href="/account/orders">Sign in to view tracking</Link></div></div>; }
