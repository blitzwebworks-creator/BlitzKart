import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  return <div className="wrap not-found-page">
    <span className="section-kicker">PAGE NOT FOUND</span>
    <h1>We couldn’t find that page.</h1>
    <p className="muted">The link may be outdated, or the page may have moved.</p>
    <div className="not-found-actions"><Link className="btn" href="/products"><Search size={16}/> Browse products</Link><Link className="btn btn-outline" href="/"><ArrowLeft size={16}/> Back home</Link></div>
  </div>;
}
