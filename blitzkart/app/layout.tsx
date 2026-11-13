import type { Metadata } from "next";
import "./globals.css";
import "./motion.css";
import "./storefront.css";
import { CartProvider } from "@/components/cart-provider";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { NavigationFeedback } from "@/components/navigation-feedback";
import { MobileBottomNavigation } from "@/components/mobile-bottom-navigation";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: { default: "BlitzKart | Everything you need, delivered", template: "%s | BlitzKart" },
  description: "Browse the live BlitzKart catalogue, check availability and manage your orders.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-IN"><body><CartProvider><Suspense fallback={null}><NavigationFeedback/></Suspense><Header/><main>{children}</main><Footer/><MobileBottomNavigation/></CartProvider></body></html>;
}
