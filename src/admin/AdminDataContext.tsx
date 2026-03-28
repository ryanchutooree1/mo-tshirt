"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

type ProductLine = { quantity?: number; unitPrice?: number; price?: number };
type FirestoreDateValue = Date | { toDate?: () => Date } | null | undefined;
function resolveTxnDate(value: FirestoreDateValue) {
  if (value instanceof Date) return value;
  if (value?.toDate) return value.toDate();
  return new Date();
}

type Txn = {
  amount?: number;
  status?: string;
  products?: ProductLine[];
  customerName?: string;
  phoneNumber?: string;
  email?: string;
  transactionDate?: FirestoreDateValue;
};

export type AdminMetrics = {
  ready: boolean;
  todayRevenue: number;
  ordersToday: number;
  aovToday: number;
  pendingOrders: number;
  completedOrders: number;
  repeatClientsCount: number;
  efficiencyPct: number; // completed / total (last N)
};

const AdminDataCtx = createContext<AdminMetrics | null>(null);

function sumProducts(products?: ProductLine[]) {
  if (!products) return 0;
  return products.reduce((acc, p) => acc + (typeof p.price === "number" ? p.price : (p.unitPrice || 0) * (p.quantity || 0)), 0);
}

export function AdminDataProvider({ children }: { children: React.ReactNode }) {
  const [metrics, setMetrics] = useState<AdminMetrics>({
    ready: false,
    todayRevenue: 0,
    ordersToday: 0,
    aovToday: 0,
    pendingOrders: 0,
    completedOrders: 0,
    repeatClientsCount: 0,
    efficiencyPct: 0,
  });

  useEffect(() => {
    let cancelled = false;

    async function compute() {
      try {
        // Pull the latest 300 transactions for a fast, reasonably fresh snapshot
        const snap = await getDocs(query(collection(db, "transactions"), orderBy("transactionDate", "desc"), limit(300)));
        const now = new Date();
        const todayKey = now.toISOString().slice(0, 10);
        let todayRevenue = 0;
        let ordersToday = 0;
        let pending = 0;
        let completed = 0;
        let total = 0;
        const clients = new Set<string>();

        snap.forEach((d) => {
          const m = d.data() as Txn;
          const amount = typeof m.amount === "number" ? m.amount : sumProducts(m.products);
          const ts = resolveTxnDate(m.transactionDate);
          const key = ts.toISOString().slice(0, 10);
          if (key === todayKey) {
            todayRevenue += amount;
            ordersToday += 1;
          }
          if ((m.status || "").toLowerCase() === "pending") pending += 1;
          if ((m.status || "").toLowerCase() === "completed" || (m.status || "").toLowerCase() === "delivered") completed += 1;
          const who = m.customerName || m.phoneNumber || m.email;
          if (who) clients.add(String(who));
          total += 1;
        });

        const aovToday = ordersToday ? Math.round(todayRevenue / ordersToday) : 0;
        const efficiencyPct = total ? Math.round((completed / total) * 100) : 0;

        const value: AdminMetrics = {
          ready: true,
          todayRevenue,
          ordersToday,
          aovToday,
          pendingOrders: pending,
          completedOrders: completed,
          repeatClientsCount: clients.size,
          efficiencyPct,
        };
        if (!cancelled) {
          setMetrics(value);
        }
      } catch {
        // Keep the provider mounted even if the snapshot fails.
      }
    }

    compute();
    const id = setInterval(compute, 60_000); // refresh every minute
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const value = useMemo(() => metrics, [metrics]);
  return <AdminDataCtx.Provider value={value}>{children}</AdminDataCtx.Provider>;
}

export function useAdminMetrics() {
  const ctx = useContext(AdminDataCtx);
  return ctx;
}
