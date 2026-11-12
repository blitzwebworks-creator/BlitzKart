import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/components/cart-provider";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: { default: "BlitzKart | Everyday essentials, delivered", template: "%s | BlitzKart" },
  description: "Shop products available in the BlitzKart catalogue.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-IN"><body><CartProvider><Header/><main>{children}</main><Footer/></CartProvider></body></html>;
}
