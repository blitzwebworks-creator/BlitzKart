"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CartLine, Product } from "@/lib/types";

type CartValue = { lines: CartLine[]; count: number; add: (product: Product) => void; setQuantity: (id: string, quantity: number) => void; remove: (id: string) => void; clear: () => void };
const CartContext = createContext<CartValue | null>(null);
const CART_KEY = "blitzkart-cart-v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [accountCartReady, setAccountCartReady] = useState(false);
  const syncQueue = useRef<Promise<void>>(Promise.resolve());
  const cartEdited = useRef(false);
  useEffect(() => {
    let storedLines: CartLine[] = [];
    try {
      const stored = localStorage.getItem(CART_KEY);
      if (stored) storedLines = JSON.parse(stored) as CartLine[];
      setLines(storedLines);
    } catch { localStorage.removeItem(CART_KEY); }
    setReady(true);
    void fetch("/api/cart").then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { hasCart?: boolean; lines?: CartLine[] };
      if (!cartEdited.current && result.hasCart && result.lines?.length) setLines(result.lines);
    }).catch(() => undefined).finally(() => setAccountCartReady(true));
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(CART_KEY, JSON.stringify(lines)); }, [lines, ready]);
  useEffect(() => {
    if (!ready || !accountCartReady) return;
    const timer = setTimeout(() => {
      const payload = { lines: lines.map(({ product, quantity }) => ({ product_id: product.id, quantity })) };
      syncQueue.current = syncQueue.current.catch(() => undefined).then(async () => {
        const response = await fetch("/api/cart", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), keepalive: true });
        if (!response.ok && response.status !== 401 && response.status !== 403) throw new Error("Cart sync failed");
      }).catch(() => undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [lines, ready, accountCartReady]);
  const value = useMemo<CartValue>(() => ({
    lines,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    add: (product) => { cartEdited.current = true; setLines((old) => { const found = old.find((line) => line.product.id === product.id); return found ? old.map((line) => line.product.id === product.id ? { ...line, quantity: Math.min(50, line.quantity + 1) } : line) : [...old, { product, quantity: 1 }]; }); },
    setQuantity: (id, quantity) => { cartEdited.current = true; setLines((old) => quantity < 1 ? old.filter((line) => line.product.id !== id) : old.map((line) => line.product.id === id ? { ...line, quantity: Math.min(50, quantity) } : line)); },
    remove: (id) => { cartEdited.current = true; setLines((old) => old.filter((line) => line.product.id !== id)); },
    clear: () => { cartEdited.current = true; setLines([]); },
  }), [lines]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
export function useCart() { const context = useContext(CartContext); if (!context) throw new Error("CartProvider is missing"); return context; }
