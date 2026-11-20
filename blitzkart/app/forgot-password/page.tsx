import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };
export default function ForgotPasswordPage() {
  return <main className="wrap auth-recovery-page"><Link href="/" className="recovery-brand"><Image src="/blitzkart-logo.png" alt="BlitzKart" width={2172} height={724} priority/></Link><ForgotPasswordForm/></main>;
}
