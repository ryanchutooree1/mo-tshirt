'use client';

import { useEffect, useMemo, useState } from 'react';
import { db, storage } from '@/lib/firebase';
import { normalizeInventoryColors, normalizeInventorySizeMap } from '@/lib/inventory-stock';
import { formatSizeLabel, normalizeSizeLabel, sortSizes } from '@/lib/shops';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  FiCheckCircle,
  FiClipboard,
  FiCreditCard,
  FiDollarSign,
  FiFileText,
  FiPauseCircle,
  FiPlayCircle,
  FiShoppingCart,
  FiTag,
  FiUser,
} from 'react-icons/fi';
import { formatMoney as formatDisplayMoney, formatMoneyValue } from '@/lib/money';

// If you want to show currency consistently
const money = (n: number) => formatDisplayMoney(n);

// Firestore shapes we expect
type SizeMap = Record<string, number>;
type ColorRow = { color: string; sizes: SizeMap };
type ProductDoc = { productName: string; colors: ColorRow[]; price?: number };
type CartItem = {
  productId: string;
  productName: string;
  color: string;
  size: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};
type InvoiceSettingsDoc = { invoiceNumber?: number };
type CustomerDoc = {
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerEmail?: string;
};
type FirestoreTimestampLike = { seconds?: number };
type HoldDoc = {
  id: string;
  customerName?: string;
  phone?: string;
  address?: string;
  email?: string;
  items?: CartItem[];
  total?: number;
  status?: string;
  createdAt?: FirestoreTimestampLike | null;
  reservedBy?: string;
};
type CheckoutStatus = 'In Process' | 'Urgent' | 'Completed';
type PaymentType = 'Full Payment' | 'Part Payment';

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export default function POSPage() {
  // -------- Invoice number --------
  const [invoice, setInvoice] = useState<number | null>(null);
  const [fetchingInvoice, setFetchingInvoice] = useState(true);

  // -------- Products (live) --------
  const [products, setProducts] = useState<(ProductDoc & { id: string })[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const currentProduct = useMemo(
    () => products.find(p => p.id === selectedProductId) || null,
    [products, selectedProductId]
  );
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedQty, setSelectedQty] = useState<number | null>(null);
  const [unitPrice, setUnitPrice] = useState<number | ''>('');

  // -------- Customer --------
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');

  // -------- Cart --------
  const [cart, setCart] = useState<CartItem[]>([]);
  const cartTotal = useMemo(() => cart.reduce((a, c) => a + c.lineTotal, 0), [cart]);
  const cartItems = useMemo(() => cart.reduce((a, c) => a + c.quantity, 0), [cart]);

  // -------- Status & Payment --------
  const [status, setStatus] = useState<CheckoutStatus | ''>('');
  const [payment, setPayment] = useState<PaymentType | ''>('');
  const [partAmount, setPartAmount] = useState<number | ''>('');

  // -------- Flow flags --------
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [holdId, setHoldId] = useState<string | null>(null);
  const [holds, setHolds] = useState<HoldDoc[]>([]);
  const USER_NAME = 'mo-owner'; // if you want dynamic, pull from auth/session

  // ---------- Init: invoice + live products ----------
  useEffect(() => {
    // live products
    const q = query(collection(db, 'products'));
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => {
        const data = d.data() as ProductDoc;
        return {
          id: d.id,
          ...data,
          colors: normalizeInventoryColors(data.colors),
        };
      });
      setProducts(list);
    });

    // invoice
    (async () => {
      try {
        const ref = doc(db, 'invoiceSettings', 'currentInvoice');
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setInvoice((snap.data() as InvoiceSettingsDoc).invoiceNumber || 1);
        } else {
          await setDoc(ref, { invoiceNumber: 1 });
          setInvoice(1);
        }
      } finally {
        setFetchingInvoice(false);
      }
    })();

    const unsubHolds = onSnapshot(query(collection(db, 'posHolds')), snap => {
      const list = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<HoldDoc, 'id'>),
      }));
      setHolds(list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 20));
    });

    return () => { unsub(); unsubHolds(); };
  }, []);

  // ---------- Derived: colors/sizes for current product ----------
  const availableColors = useMemo(() => {
    if (!currentProduct) return [];
    return currentProduct.colors.map(c => c.color);
  }, [currentProduct]);

  const availableSizes = useMemo(() => {
    if (!currentProduct || !selectedColor) return [];
    const row = currentProduct.colors.find(c => c.color === selectedColor);
    return row ? sortSizes(Object.keys(row.sizes)) : [];
  }, [currentProduct, selectedColor]);

  const availableQty = useMemo(() => {
    if (!currentProduct || !selectedColor || !selectedSize) return 0;
    const row = currentProduct.colors.find(c => c.color === selectedColor);
    if (!row) return 0;
    return row.sizes[normalizeSizeLabel(selectedSize)] || 0;
  }, [currentProduct, selectedColor, selectedSize]);

  // ---------- Customer search (by name/phone/email) ----------
  const searchCustomer = async () => {
    const name = customerName.trim().toLowerCase();
    const phoneClean = phone.trim();
    const emailLower = email.trim().toLowerCase();

    if (!name && !phoneClean && !emailLower) {
      alert('Enter a name, phone or email to search');
      return;
    }

    // by name (case insensitive-like; fetch & filter)
    if (name) {
      const snap = await getDocs(collection(db, 'customers'));
      const match = snap.docs.find((docSnap) => {
        const data = docSnap.data() as CustomerDoc;
        return (data.customerName || '').toLowerCase() === name;
      });
      if (match) {
        const data = match.data() as CustomerDoc;
        setCustomerName(data.customerName || '');
        setPhone(data.customerPhone || '');
        setAddress(data.customerAddress || '');
        setEmail(data.customerEmail || '');
        return alert('Customer found by name');
      }
    }

    // by phone (exact)
    if (phoneClean) {
      const q = query(collection(db, 'customers'), where('customerPhone', '==', phoneClean));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = snap.docs[0].data() as CustomerDoc;
        setCustomerName(data.customerName || '');
        setPhone(data.customerPhone || '');
        setAddress(data.customerAddress || '');
        setEmail(data.customerEmail || '');
        return alert('Customer found by phone');
      }
    }

    // by email (case insensitive-like; fetch & filter)
    if (emailLower) {
      const snap = await getDocs(collection(db, 'customers'));
      const match = snap.docs.find((docSnap) => {
        const data = docSnap.data() as CustomerDoc;
        return (data.customerEmail || '').toLowerCase() === emailLower;
      });
      if (match) {
        const data = match.data() as CustomerDoc;
        setCustomerName(data.customerName || '');
        setPhone(data.customerPhone || '');
        setAddress(data.customerAddress || '');
        setEmail(data.customerEmail || '');
        return alert('Customer found by email');
      }
    }

    alert('No customer found');
  };

  // ---------- Hold System ----------
  const saveHold = async () => {
    if (!cart.length) return alert('Add items to cart before holding.');
    try {
      const ref = await addDoc(collection(db, 'posHolds'), {
        customerName: customerName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        email: email.trim(),
        items: cart,
        total: cartTotal,
        status: 'held',
        createdAt: serverTimestamp(),
        reservedBy: USER_NAME,
      });
      setHoldId(ref.id);
      alert('Order put on hold. You can resume from the Holds list.');
    } catch (error: unknown) {
      alert(getErrorMessage(error, 'Failed to hold'));
    }
  };

  const loadHold = (h: HoldDoc) => {
    setCustomerName(h.customerName || '');
    setPhone(h.phone || '');
    setAddress(h.address || '');
    setEmail(h.email || '');
    setCart(h.items || []);
    setHoldId(h.id);
    setStatus('In Process');
    setPayment('');
    setPartAmount('');
    setDone(false);
    setPdfUrl(null);
  };

  const releaseHold = async (h: HoldDoc) => {
    try {
      for (const it of h.items || []) {
        const ref = doc(db, 'products', it.productId);
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) return;
          const data = snap.data() as ProductDoc;
          const idx = data.colors.findIndex(c => c.color === it.color);
          if (idx < 0) return;
          const sizeKey = normalizeSizeLabel(it.size);
          const sizes = normalizeInventorySizeMap(data.colors[idx].sizes);
          const cur = Number(sizes[sizeKey] || 0);
          const copy = JSON.parse(JSON.stringify(data)) as ProductDoc;
          copy.colors[idx].sizes = {
            ...sizes,
            [sizeKey]: cur + Number(it.quantity || 0),
          };
          tx.update(ref, { colors: copy.colors });
        });
      }
    } catch { /* ignore */ }
    try { await updateDoc(doc(db, 'posHolds', h.id), { status: 'released' }); } catch {}
    if (holdId === h.id) setHoldId(null);
    alert('Hold released and stock restored.');
  };

  const clearAll = () => {
    setCustomerName('');
    setPhone('');
    setAddress('');
    setEmail('');
    setSelectedProductId(null);
    setSelectedColor(null);
    setSelectedSize(null);
    setSelectedQty(null);
    setUnitPrice('');
    setCart([]);
    setStatus('');
    setPayment('');
    setPartAmount('');
    setPdfUrl(null);
    setDone(false);
    setHoldId(null);
  };

  // ---------- Add item (with stock-safe decrement) ----------
  const addToCart = async () => {
    if (!selectedProductId || !currentProduct || !selectedColor || !selectedSize || !selectedQty || !unitPrice && unitPrice !== 0) {
      return alert('Complete product, color, size, quantity, and price.');
    }
    if (selectedQty <= 0) return alert('Quantity must be > 0');

    const productRef = doc(db, 'products', selectedProductId);
    const sizeKey = normalizeSizeLabel(selectedSize);

    // Decrement stock transactionally (so qty can’t go negative)
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(productRef);
        if (!snap.exists()) throw new Error('Product not found');
        const data = snap.data() as ProductDoc;

        const colorIdx = data.colors.findIndex(c => c.color === selectedColor);
        if (colorIdx < 0) throw new Error('Color not found');

        const sizes = normalizeInventorySizeMap(data.colors[colorIdx].sizes);
        const current = sizes[sizeKey];
        if (!Number.isFinite(current) || current < (selectedQty!)) {
          throw new Error('Insufficient quantity available');
        }

        const copy = JSON.parse(JSON.stringify(data)) as ProductDoc;
        copy.colors[colorIdx].sizes = {
          ...sizes,
          [sizeKey]: current - selectedQty!,
        };

        tx.update(productRef, { colors: copy.colors });
      });
    } catch (error: unknown) {
      return alert(getErrorMessage(error, 'Failed to update stock'));
    }

    const price = Number(unitPrice || 0);
    const item: CartItem = {
      productId: selectedProductId,
      productName: currentProduct.productName,
      color: selectedColor!,
      size: sizeKey,
      quantity: selectedQty!,
      unitPrice: price,
      lineTotal: price * selectedQty!,
    };

    setCart(prev => [...prev, item]);
    // reset product selectors
    setSelectedProductId(null);
    setSelectedColor(null);
    setSelectedSize(null);
    setSelectedQty(null);
    setUnitPrice('');
  };

  const removeCartItem = async (index: number) => {
    // Optional: Restock when removing from cart (nice UX)
    const item = cart[index];
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'products', item.productId);
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        const data = snap.data() as ProductDoc;
        const colorIdx = data.colors.findIndex(c => c.color === item.color);
        if (colorIdx < 0) return;
        const sizeKey = normalizeSizeLabel(item.size);
        const sizes = normalizeInventorySizeMap(data.colors[colorIdx].sizes);
        const cur = Number(sizes[sizeKey] || 0);
        const copy = JSON.parse(JSON.stringify(data)) as ProductDoc;
        copy.colors[colorIdx].sizes = {
          ...sizes,
          [sizeKey]: cur + item.quantity,
        };
        tx.update(ref, { colors: copy.colors });
      });
    } catch { /* ignore */ }

    setCart(prev => prev.filter((_, i) => i !== index));
  };

  // ---------- Complete transaction ----------
  const complete = async () => {
    if (!invoice) return alert('No invoice number yet. Try again.');
    if (!customerName.trim() || !phone.trim() || !email.trim()) return alert('Fill customer name, phone, email.');
    if (!cart.length) return alert('Add at least one product.');
    if (!status) return alert('Select status.');
    if (!payment) return alert('Select payment method.');
    if (payment === 'Part Payment' && (partAmount === '' || Number(partAmount) <= 0)) {
      return alert('Enter a valid part payment amount.');
    }

    setBusy(true);
    try {
      // Upsert customer
      let customerId: string | null = null;
      // Try phone first
      const qPhone = query(collection(db, 'customers'), where('customerPhone', '==', phone.trim()));
      const snapPhone = await getDocs(qPhone);
      if (!snapPhone.empty) {
        customerId = snapPhone.docs[0].id;
        await updateDoc(doc(db, 'customers', customerId), {
          customerName: customerName.trim(),
          customerEmail: email.trim(),
          customerAddress: address.trim(),
        });
      } else {
        // Create new
        const ref = await addDoc(collection(db, 'customers'), {
          customerName: customerName.trim(),
          customerEmail: email.trim(),
          customerPhone: phone.trim(),
          customerAddress: address.trim(),
          createdAt: serverTimestamp(),
        });
        await updateDoc(ref, { id: ref.id });
        customerId = ref.id;
      }

      // Transaction Data
      const txPayload = {
        customerName: customerName.trim(),
        phoneNumber: phone.trim(),
        address: address.trim(),
        email: email.trim(),
        products: cart.map(i => ({
          product: i.productName,
          color: i.color,
          size: i.size,
          quantity: i.quantity,
          price: i.lineTotal,
          unitPrice: i.unitPrice,
        })),
        transactionDate: serverTimestamp(),
        invoiceNumber: invoice,
        userName: USER_NAME,
        status,
        paymentMethod: payment,
        partPaymentAmount: payment === 'Part Payment' ? Number(partAmount) : null,
        customerId,
      };

      // Create transaction -> use generated ID as account doc ID
      const txRef = await addDoc(collection(db, 'transactions'), txPayload);

      const total = cartTotal;
      const incomeAmount = payment === 'Part Payment' ? Number(partAmount) : total;
      await setDoc(doc(db, 'account', txRef.id), {
        customerName: customerName.trim(),
        type: 'income',
        amount: incomeAmount,
        description: payment === 'Part Payment'
          ? `POS part-payment for invoice #${invoice}`
          : `POS transaction for invoice #${invoice}`,
        transactionDate: serverTimestamp(),
        status: payment === 'Part Payment' ? 'Partially Paid' : 'Completed',
        paymentMethod: payment,
      });

      if (payment === 'Part Payment') {
        await updateDoc(txRef, { dueAmount: Number(total) - Number(partAmount || 0) });
      }

      // Increment invoice counter
      await updateDoc(doc(db, 'invoiceSettings', 'currentInvoice'), {
        invoiceNumber: (invoice || 0) + 1,
      });
      setInvoice((invoice || 0) + 1);

      // Generate & upload PDF, get URL
      const pdfBlob = await generateInvoicePDFBlob({
        invoiceNumber: txPayload.invoiceNumber,
        customerName: txPayload.customerName,
        phone: txPayload.phoneNumber,
        email: txPayload.email,
        address: txPayload.address,
        items: txPayload.products,
        total,
        status,
        payment,
        partAmount: payment === 'Part Payment' ? Number(partAmount) : 0,
        userName: USER_NAME,
      });
      const fileRef = ref(storage, `documents/Invoice/Invoice_${txPayload.invoiceNumber}.pdf`);
      await uploadBytes(fileRef, pdfBlob);
      const url = await getDownloadURL(fileRef);
      setPdfUrl(url);

      setDone(true);
      alert('Transaction completed!');
    } catch (error: unknown) {
      console.error(error);
      alert(getErrorMessage(error, 'Failed to complete transaction'));
    } finally {
      setBusy(false);
    }
  };

  // ---------- Send receipt email (serverless API) ----------
  const sendEmail = async () => {
    if (!pdfUrl) return alert('Generate the PDF first by completing the transaction.');
    try {
      setBusy(true);
      const res = await fetch('/api/send-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          subject: `Your Receipt • Invoice #${invoice}`,
          text: `Dear ${customerName},\n\nPlease find your receipt attached.\n\nThank you!`,
          pdfUrl,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      alert('Email sent!');
    } catch (error: unknown) {
      alert(getErrorMessage(error, 'Failed to send email'));
    } finally {
      setBusy(false);
    }
  };

  const canHold = !done && cart.length > 0;
  const customerReady = Boolean(customerName.trim() && phone.trim() && email.trim());
  const checkoutSteps = [customerReady, cart.length > 0, Boolean(status), Boolean(payment)];
  const progressPct = done
    ? 100
    : Math.round((checkoutSteps.filter(Boolean).length / checkoutSteps.length) * 100);
  const checkoutStage = done
    ? 'Transaction completed'
    : progressPct < 25
      ? 'Capture customer details'
      : progressPct < 50
        ? 'Build cart with products'
        : progressPct < 75
          ? 'Select order status'
          : progressPct < 100
            ? 'Choose payment type'
            : 'Ready to complete';

  // ---------- UI ----------
  return (
    <main className="pos-performance relative min-h-screen overflow-x-hidden pb-10">
      <div aria-hidden className="posperf-grid" />
      <div aria-hidden className="posperf-glow posperf-glow-left" />
      <div aria-hidden className="posperf-glow posperf-glow-right" />

      <div className="relative mx-auto max-w-[1520px] space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="posperf-panel posperf-hero" style={{ animation: 'fadeUp 0.6s ease-out both' }}>
          <div className="posperf-hero-main">
            <div>
              <p className="posperf-kicker">Retail Engine</p>
              <h1 className="posperf-title">POS Command Deck</h1>
              <p className="posperf-copy">
                High-speed checkout lane with live stock guardrails, hold/resume workflow, and instant invoice handoff.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="posperf-chip posperf-chip-sky"><FiShoppingCart className="h-4 w-4" /> Live stock link</span>
                <span className="posperf-chip posperf-chip-emerald"><FiCreditCard className="h-4 w-4" /> Split payment ready</span>
                <span className="posperf-chip posperf-chip-slate"><FiFileText className="h-4 w-4" /> PDF + email receipt</span>
              </div>
            </div>
            <div className="flex flex-wrap items-start justify-end gap-2">
              <button onClick={saveHold} disabled={!canHold} className="posperf-btn posperf-btn-ghost">
                <FiPauseCircle className="h-4 w-4" /> Hold Current
              </button>
              <button onClick={clearAll} className="posperf-btn posperf-btn-solid">
                <FiPlayCircle className="h-4 w-4" /> New Transaction
              </button>
            </div>
          </div>
          <div className="posperf-hero-rail">
            <div className="posperf-rail-item">
              <span>Invoice Stream</span>
              <strong>{fetchingInvoice ? 'Loading…' : `#${String(invoice || 0).padStart(5, '0')}`}</strong>
            </div>
            <div className="posperf-rail-item">
              <span>Checkout Readiness</span>
              <strong>{progressPct}%</strong>
            </div>
            <div className="posperf-rail-item">
              <span>Live Stage</span>
              <strong>{checkoutStage}</strong>
            </div>
            <div className="posperf-rail-item">
              <span>Held Orders</span>
              <strong>{holds.length}</strong>
            </div>
            {holdId && (
              <div className="posperf-rail-item">
                <span>Current Hold ID</span>
                <strong className="break-all">{holdId}</strong>
              </div>
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5" style={{ animation: 'fadeUp 0.6s ease-out both', animationDelay: '0.08s' }}>
          <StatCard label="Cart Items" value={cartItems} tone="sky" icon={<FiShoppingCart className="h-4 w-4" />} />
          <StatCard label="Cart Total" value={money(cartTotal)} tone="emerald" icon={<FiDollarSign className="h-4 w-4" />} />
          <StatCard label="Active Holds" value={holds.length} tone="amber" icon={<FiPauseCircle className="h-4 w-4" />} />
          <StatCard label="Current Status" value={status || 'Not set'} tone="slate" icon={<FiClipboard className="h-4 w-4" />} />
          <FlowCard progress={progressPct} stage={checkoutStage} />
        </section>

        <section className="posperf-panel" style={{ animation: 'fadeUp 0.6s ease-out both', animationDelay: '0.14s' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="posperf-eyebrow">Hold Queue</div>
              <div className="posperf-copy">Pause a checkout and recover it instantly.</div>
            </div>
            <button onClick={saveHold} disabled={!canHold} className="posperf-btn posperf-btn-ghost">
              <FiPauseCircle className="h-4 w-4" /> Hold Current
            </button>
          </div>
          {holds.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {holds.map(h => (
                <div key={h.id} className="posperf-subcard">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-semibold" title={h.customerName || '—'}>
                      {h.customerName || '—'}
                    </div>
                    <span className="text-xs font-semibold">{money(h.total || 0)}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--pos-soft)]">ID: {h.id}</div>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => loadHold(h)} className="posperf-btn posperf-btn-mini">
                      Resume
                    </button>
                    <button onClick={() => releaseHold(h)} className="posperf-btn posperf-btn-danger-mini">
                      Release
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 text-sm text-[var(--pos-muted)]">No holds yet.</div>
          )}
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2" style={{ animation: 'fadeUp 0.6s ease-out both', animationDelay: '0.2s' }}>
          <div className="posperf-panel">
            <div className="posperf-section-header">
              <div className="posperf-icon-wrap"><FiUser className="h-4 w-4" /></div>
              <div>
                <div className="posperf-section-title">Customer Intelligence</div>
                <div className="posperf-section-copy">Search existing client or prepare a new checkout profile.</div>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <Input label="Customer Name" value={customerName} onChange={setCustomerName} disabled={done} />
              <Input label="Phone" value={phone} onChange={setPhone} disabled={done} />
              <Input label="Address" value={address} onChange={setAddress} disabled={done} />
              <Input label="Email" value={email} onChange={setEmail} disabled={done} />
            </div>
            {!done && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={searchCustomer} className="posperf-btn posperf-btn-primary">
                  Search Customer
                </button>
                <button onClick={clearAll} className="posperf-btn posperf-btn-danger">
                  Clear
                </button>
              </div>
            )}
          </div>

          <div className="posperf-panel">
            <div className="posperf-section-header">
              <div className="posperf-icon-wrap"><FiTag className="h-4 w-4" /></div>
              <div>
                <div className="posperf-section-title">Product Injector</div>
                <div className="posperf-section-copy">Compose the line items with stock-safe quantity control.</div>
              </div>
            </div>

            {!done && (
              <>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Select
                    label="Product"
                    value={selectedProductId || ''}
                    onChange={(v) => { setSelectedProductId(v || null); setSelectedColor(null); setSelectedSize(null); setSelectedQty(null); }}
                    options={[{ label: 'Select…', value: '' }, ...products.map(p => ({ label: p.productName, value: p.id }))]}
                  />
                  <Select
                    label="Color"
                    value={selectedColor || ''}
                    onChange={(v) => { setSelectedColor(v || null); setSelectedSize(null); setSelectedQty(null); }}
                    options={[{ label: 'Select…', value: '' }, ...availableColors.map(c => ({ label: c, value: c }))]}
                    disabled={!currentProduct}
                  />
                  <Select
                    label="Size"
                    value={selectedSize || ''}
                    onChange={(v) => { setSelectedSize(v || null); setSelectedQty(null); }}
                    options={[{ label: 'Select…', value: '' }, ...availableSizes.map(s => ({ label: formatSizeLabel(s), value: s }))]}
                    disabled={!selectedColor}
                  />
                  <Select
                    label={`Quantity ${availableQty ? `(max ${availableQty})` : ''}`}
                    value={String(selectedQty ?? '')}
                    onChange={(v) => setSelectedQty(v ? Number(v) : null)}
                    options={[{ label: 'Select…', value: '' }, ...Array.from({ length: Math.max(availableQty, 0) }, (_, i) => i + 1).map(n => ({ label: String(n), value: String(n) }))]}
                    disabled={!selectedSize}
                  />
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <InputNumber label="Unit Price (Rs)" value={unitPrice} onChange={setUnitPrice} disabled={!selectedQty} />
                  <div className="flex items-end">
                    <button onClick={addToCart} disabled={!selectedQty || unitPrice === ''} className="posperf-btn posperf-btn-solid disabled:opacity-60">
                      Add to Cart
                    </button>
                  </div>
                </div>
              </>
            )}

            <div className="mt-6">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <FiShoppingCart className="h-4 w-4" /> Items
              </div>
              {cart.length === 0 ? (
                <div className="mt-3 text-sm text-[var(--pos-muted)]">No items yet.</div>
              ) : (
                <div className="mt-3 space-y-3">
                  {cart.map((it, i) => (
                    <div key={i} className="posperf-subcard">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="text-sm">
                          <div className="font-semibold">{it.productName}</div>
                          <div className="text-xs text-[var(--pos-muted)]">Color: {it.color} • Size: {formatSizeLabel(it.size)} • Qty: {it.quantity}</div>
                          <div className="mt-1 text-xs font-semibold text-[var(--pos-accent-2)]">
                            {money(it.lineTotal)} ({money(it.unitPrice)} x {it.quantity})
                          </div>
                        </div>
                        {!done && (
                          <button onClick={() => removeCartItem(i)} className="posperf-link-danger">
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {cart.length > 0 && (
                <div className="mt-3 flex items-center justify-between rounded-2xl border border-[var(--pos-border)] bg-[var(--pos-chip-bg)] px-4 py-3 text-sm font-semibold">
                  <span>Order total</span>
                  <span>{money(cartTotal)}</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {cart.length > 0 && !done && (
          <section className="posperf-panel" style={{ animation: 'fadeUp 0.6s ease-out both', animationDelay: '0.26s' }}>
            <div className="posperf-section-header">
              <div className="posperf-icon-wrap"><FiClipboard className="h-4 w-4" /></div>
              <div>
                <div className="posperf-section-title">Finalize Checkout Lane</div>
                <div className="posperf-section-copy">Set operational status and payment split before posting transaction.</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <Select
                label="Status"
                value={status}
                onChange={(v) => setStatus(v as CheckoutStatus | '')}
                options={[
                  { label: 'Select…', value: '' },
                  { label: 'In Process', value: 'In Process' },
                  { label: 'Urgent', value: 'Urgent' },
                  { label: 'Completed', value: 'Completed' },
                ]}
              />
              <Select
                label="Payment"
                value={payment}
                onChange={(v) => setPayment(v as PaymentType | '')}
                options={[
                  { label: 'Select…', value: '' },
                  { label: 'Full Payment', value: 'Full Payment' },
                  { label: 'Part Payment', value: 'Part Payment' },
                ]}
              />
              {payment === 'Part Payment' && (
                <InputNumber label="Part Payment Amount (Rs)" value={partAmount} onChange={setPartAmount} />
              )}
            </div>

            <div className="mt-4">
              <button onClick={complete} disabled={busy} className="posperf-btn posperf-btn-success">
                <FiCheckCircle className="h-4 w-4" />
                {busy ? 'Saving…' : 'Complete Transaction'}
              </button>
            </div>
          </section>
        )}

        {done && (
          <section className="posperf-panel posperf-success" style={{ animation: 'fadeUp 0.6s ease-out both', animationDelay: '0.26s' }}>
            <div className="posperf-section-header">
              <div className="posperf-icon-wrap"><FiCheckCircle className="h-4 w-4" /></div>
              <div>
                <div className="posperf-section-title">Transaction Closed</div>
                <div className="posperf-section-copy">Receipt is ready for download, sharing, and customer notification.</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              {pdfUrl && (
                <a href={pdfUrl} target="_blank" className="posperf-btn posperf-btn-success">
                  View / Download Receipt PDF
                </a>
              )}
              <button onClick={sendEmail} disabled={!pdfUrl || busy} className="posperf-btn posperf-btn-primary disabled:opacity-60">
                {busy ? 'Sending…' : 'Send Receipt by Email'}
              </button>
              <button onClick={clearAll} className="posperf-btn posperf-btn-solid">
                New Transaction
              </button>
            </div>
          </section>
        )}
      </div>

      <style jsx global>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .pos-performance {
          --pos-bg-main: #ffffff;
          --pos-bg-panel: #ffffff;
          --pos-bg-panel-strong: #ffffff;
          --pos-border: rgba(15, 23, 42, 0.12);
          --pos-border-strong: rgba(15, 23, 42, 0.12);
          --pos-text: #0f172a;
          --pos-muted: #536176;
          --pos-soft: #7b8aa1;
          --pos-accent: #475569;
          --pos-accent-2: #475569;
          --pos-accent-3: #475569;
          --pos-danger: #f43f5e;
          --pos-chip-bg: #ffffff;
          --pos-input-bg: #ffffff;
          color: var(--pos-text);
          background: var(--pos-bg-main);
        }

        .admin-root.admin-dark .pos-performance {
          --pos-bg-main: #ffffff;
          --pos-bg-panel: #ffffff;
          --pos-bg-panel-strong: #ffffff;
          --pos-border: rgba(15, 23, 42, 0.12);
          --pos-border-strong: rgba(15, 23, 42, 0.12);
          --pos-text: #0f172a;
          --pos-muted: #536176;
          --pos-soft: #7b8aa1;
          --pos-accent: #475569;
          --pos-accent-2: #475569;
          --pos-accent-3: #475569;
          --pos-danger: #e11d48;
          --pos-chip-bg: #ffffff;
          --pos-input-bg: #ffffff;
          background: #ffffff;
        }

        .posperf-grid {
          pointer-events: none;
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(to right, rgba(148, 163, 184, 0.08) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(148, 163, 184, 0.08) 1px, transparent 1px);
          background-size: 42px 42px;
          mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.55), transparent 80%);
        }

        .admin-root.admin-dark .posperf-grid {
          background-image:
            linear-gradient(to right, rgba(148, 163, 184, 0.08) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(148, 163, 184, 0.08) 1px, transparent 1px);
        }

        .posperf-glow {
          pointer-events: none;
          position: absolute;
          width: 420px;
          height: 420px;
          border-radius: 9999px;
          filter: blur(80px);
          opacity: 0.45;
        }

        .posperf-glow-left {
          left: -160px;
          top: 160px;
          background: transparent;
        }

        .posperf-glow-right {
          right: -160px;
          top: 20px;
          background: transparent;
        }

        .posperf-panel {
          border-radius: 28px;
          border: 1px solid var(--pos-border);
          background: var(--pos-bg-panel-strong);
          box-shadow: 0 16px 35px rgba(15, 23, 42, 0.12);
          padding: 1.35rem;
        }

        .admin-root.admin-dark .posperf-panel {
          box-shadow: 0 20px 45px rgba(2, 6, 23, 0.5);
        }

        .posperf-hero {
          position: relative;
          overflow: hidden;
          border-color: var(--pos-border-strong);
        }

        .posperf-hero::after {
          content: '';
          position: absolute;
          inset: 0;
          background: none;
          pointer-events: none;
        }

        .posperf-hero-main {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          justify-content: space-between;
        }

        @media (min-width: 1024px) {
          .posperf-hero-main {
            flex-direction: row;
            align-items: flex-start;
          }
        }

        .posperf-kicker {
          text-transform: uppercase;
          letter-spacing: 0.3em;
          font-size: 0.72rem;
          font-weight: 700;
          color: var(--pos-soft);
        }

        .posperf-title {
          margin-top: 0.55rem;
          font-size: clamp(2rem, 4vw, 3.45rem);
          line-height: 1.05;
          font-weight: 700;
          letter-spacing: -0.02em;
        }

        .posperf-copy {
          margin-top: 0.8rem;
          max-width: 70ch;
          color: var(--pos-muted);
          font-size: 0.98rem;
        }

        .posperf-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          border-radius: 9999px;
          border: 1px solid var(--pos-border);
          background: var(--pos-chip-bg);
          padding: 0.42rem 0.85rem;
          font-size: 0.74rem;
          font-weight: 700;
          letter-spacing: 0.04em;
        }

        .posperf-chip-sky {
          color: var(--pos-text);
        }

        .posperf-chip-emerald {
          color: var(--pos-text);
        }

        .posperf-chip-slate {
          color: var(--pos-muted);
        }

        .posperf-hero-rail {
          position: relative;
          z-index: 1;
          margin-top: 1.2rem;
          display: grid;
          grid-template-columns: repeat(1, minmax(0, 1fr));
          gap: 0.6rem;
        }

        @media (min-width: 768px) {
          .posperf-hero-rail {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (min-width: 1280px) {
          .posperf-hero-rail {
            grid-template-columns: repeat(5, minmax(0, 1fr));
          }
        }

        .posperf-rail-item {
          border: 1px solid var(--pos-border);
          background: var(--pos-chip-bg);
          border-radius: 14px;
          padding: 0.65rem 0.8rem;
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
          min-height: 65px;
        }

        .posperf-rail-item span {
          font-size: 0.68rem;
          text-transform: uppercase;
          letter-spacing: 0.22em;
          color: var(--pos-soft);
          font-weight: 700;
        }

        .posperf-rail-item strong {
          font-size: 0.9rem;
          line-height: 1.3;
          font-weight: 700;
          color: var(--pos-text);
        }

        .posperf-eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.28em;
          font-size: 0.7rem;
          color: var(--pos-soft);
          font-weight: 700;
        }

        .posperf-subcard {
          border-radius: 18px;
          border: 1px solid var(--pos-border);
          background: #ffffff;
          padding: 0.85rem;
        }

        .posperf-metric-icon {
          width: 2.1rem;
          height: 2.1rem;
          border-radius: 9999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--pos-border);
        }

        .posperf-metric-icon-slate {
          color: #475569;
          background: #ffffff;
        }

        .posperf-metric-icon-sky {
          color: #475569;
          background: #ffffff;
        }

        .posperf-metric-icon-emerald {
          color: #475569;
          background: #ffffff;
        }

        .posperf-metric-icon-amber {
          color: #475569;
          background: #ffffff;
        }

        .posperf-metric-glow-slate {
          background: transparent;
        }

        .posperf-metric-glow-sky {
          background: transparent;
        }

        .posperf-metric-glow-emerald {
          background: transparent;
        }

        .posperf-metric-glow-amber {
          background: transparent;
        }

        .posperf-btn {
          border: 1px solid transparent;
          border-radius: 9999px;
          padding: 0.55rem 1rem;
          font-size: 0.85rem;
          font-weight: 700;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          transition: transform 160ms ease, opacity 160ms ease, background-color 160ms ease, border-color 160ms ease, color 160ms ease;
        }

        .posperf-btn:hover {
          transform: translateY(-1px);
        }

        .posperf-btn:disabled {
          opacity: 0.58;
          cursor: not-allowed;
          transform: none;
        }

        .posperf-btn-solid {
          background: #0f172a;
          color: #f8fafc;
          border-color: rgba(15, 23, 42, 0.9);
        }

        .admin-root.admin-dark .posperf-btn-solid {
          background: #0f172a;
          border-color: rgba(15, 23, 42, 0.9);
        }

        .posperf-btn-ghost {
          background: var(--pos-chip-bg);
          border-color: var(--pos-border);
          color: var(--pos-text);
        }

        .posperf-btn-primary {
          background: #0f172a;
          color: white;
          border-color: rgba(15, 23, 42, 0.9);
        }

        .posperf-btn-success {
          background: #0f172a;
          color: white;
          border-color: rgba(15, 23, 42, 0.9);
        }

        .posperf-btn-danger {
          background: #ffffff;
          color: var(--pos-danger);
          border-color: rgba(244, 63, 94, 0.35);
        }

        .posperf-btn-mini,
        .posperf-btn-danger-mini {
          border-radius: 9999px;
          padding: 0.38rem 0.8rem;
          font-size: 0.72rem;
          font-weight: 700;
          border: 1px solid var(--pos-border);
          background: var(--pos-chip-bg);
        }

        .posperf-btn-danger-mini {
          color: var(--pos-danger);
          border-color: rgba(244, 63, 94, 0.35);
          background: #ffffff;
        }

        .posperf-link-danger {
          color: var(--pos-danger);
          font-size: 0.72rem;
          font-weight: 700;
        }

        .posperf-link-danger:hover {
          text-decoration: underline;
        }

        .posperf-section-header {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
        }

        .posperf-icon-wrap {
          width: 32px;
          height: 32px;
          border-radius: 9999px;
          border: 1px solid var(--pos-border);
          background: var(--pos-chip-bg);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--pos-accent);
          flex-shrink: 0;
        }

        .posperf-section-title {
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          color: var(--pos-text);
        }

        .posperf-section-copy {
          color: var(--pos-muted);
          font-size: 0.83rem;
          margin-top: 0.15rem;
        }

        .posperf-field-label {
          display: block;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.17em;
          color: var(--pos-soft);
          font-weight: 700;
          margin-bottom: 0.38rem;
        }

        .posperf-input,
        .posperf-select {
          width: 100%;
          border-radius: 14px;
          border: 1px solid var(--pos-border);
          background: var(--pos-input-bg);
          color: var(--pos-text);
          padding: 0.6rem 0.78rem;
          font-size: 0.95rem;
          transition: border-color 150ms ease, box-shadow 150ms ease, background-color 150ms ease;
        }

        .posperf-input:focus,
        .posperf-select:focus {
          outline: none;
          border-color: rgba(15, 23, 42, 0.22);
          box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.18);
        }

        .posperf-input:disabled,
        .posperf-select:disabled {
          cursor: not-allowed;
          opacity: 0.62;
        }

        .posperf-flow {
          border-radius: 18px;
          border: 1px solid var(--pos-border);
          background: #ffffff;
          padding: 0.95rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-height: 128px;
        }

        .posperf-flow-label {
          text-transform: uppercase;
          letter-spacing: 0.2em;
          font-size: 0.67rem;
          color: var(--pos-soft);
          font-weight: 700;
        }

        .posperf-flow-value {
          margin-top: 0.2rem;
          font-size: 1.6rem;
          line-height: 1.1;
          font-weight: 700;
        }

        .posperf-flow-track {
          margin-top: 0.55rem;
          height: 8px;
          border-radius: 9999px;
          background: rgba(148, 163, 184, 0.28);
          overflow: hidden;
        }

        .posperf-flow-track > span {
          display: block;
          height: 100%;
          border-radius: 9999px;
          background: #94a3b8;
          transition: width 300ms ease;
        }

        .posperf-flow-note {
          margin-top: 0.4rem;
          font-size: 0.78rem;
          color: var(--pos-muted);
        }

        .posperf-success {
          border-color: var(--pos-border);
          background: #ffffff;
        }
      `}</style>
    </main>
  );
}

function StatCard({
  label,
  value,
  tone = 'slate',
  icon,
}: {
  label: string;
  value: string | number;
  tone?: 'slate' | 'sky' | 'emerald' | 'amber';
  icon?: React.ReactNode;
}) {
  const tones = {
    slate: {
      icon: 'posperf-metric-icon-slate',
      glow: 'posperf-metric-glow-slate',
    },
    sky: {
      icon: 'posperf-metric-icon-sky',
      glow: 'posperf-metric-glow-sky',
    },
    emerald: {
      icon: 'posperf-metric-icon-emerald',
      glow: 'posperf-metric-glow-emerald',
    },
    amber: {
      icon: 'posperf-metric-icon-amber',
      glow: 'posperf-metric-glow-amber',
    },
  } as const;
  const theme = tones[tone] ?? tones.slate;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--pos-border)] bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--pos-soft)]">{label}</div>
        {icon && <span className={`posperf-metric-icon ${theme.icon}`}>{icon}</span>}
      </div>
      <div className="mt-3 text-[1.8rem] font-semibold leading-none text-[var(--pos-text)]">{value}</div>
      <div aria-hidden className={`pointer-events-none absolute -right-12 -top-12 h-28 w-28 rounded-full blur-2xl ${theme.glow}`} />
    </div>
  );
}

function FlowCard({ progress, stage }: { progress: number; stage: string }) {
  return (
    <div className="posperf-flow">
      <div className="posperf-flow-label">Checkout Progress</div>
      <div className="posperf-flow-value">{progress}%</div>
      <div className="posperf-flow-track">
        <span style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }} />
      </div>
      <div className="posperf-flow-note">{stage}</div>
    </div>
  );
}

/* ---------------- Helpers & Inputs ---------------- */

function Input({ label, value, onChange, disabled=false }:{
  label: string; value: string; onChange: (v:string)=>void; disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="posperf-field-label">{label}</span>
      <input
        value={value}
        onChange={(e)=>onChange(e.target.value)}
        disabled={disabled}
        className="posperf-input"
      />
    </label>
  );
}

function InputNumber({ label, value, onChange, disabled=false }:{
  label: string; value: number|''; onChange: (v:number|'')=>void; disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="posperf-field-label">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e)=>onChange(e.target.value === '' ? '' : Number(e.target.value))}
        disabled={disabled}
        className="posperf-input"
      />
    </label>
  );
}

function Select({ label, value, onChange, options, disabled=false }:{
  label: string; value: string; onChange: (v:string)=>void;
  options: {label:string; value:string}[]; disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="posperf-field-label">{label}</span>
      <select
        value={value}
        onChange={(e)=>onChange(e.target.value)}
        disabled={disabled}
        className="posperf-select"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

/* ---------------- PDF (client) ---------------- */
// Lightweight, simple PDF using the browser
async function generateInvoicePDFBlob(input: {
  invoiceNumber: number;
  customerName: string;
  phone: string;
  email: string;
  address: string;
  items: { product: string; quantity: number; unitPrice: number; price: number; color: string; size: string }[];
  total: number;
  status: string;
  payment: string;
  partAmount: number;
  userName: string;
}): Promise<Blob> {
  // Use a minimal inline PDF via jsPDF-like structure without extra deps:
  // To keep dependencies light, we’ll render a simple HTML -> Blob (PDF-like) via print service.
  // If you want a richer PDF, install jspdf: npm i jspdf, then build with jsPDF.
  const { jsPDF } = await import('jspdf'); // ensure: npm i jspdf
  const doc = new jsPDF();

  let y = 10;
  doc.setFontSize(16);
  doc.text('INVOICE', 105, y, { align: 'center' }); y += 8;

  doc.setFontSize(10);
  doc.text(`Invoice #${input.invoiceNumber}`, 14, y); y += 5;
  doc.text(`Customer: ${input.customerName}`, 14, y); y += 5;
  doc.text(`Phone: ${input.phone}`, 14, y); y += 5;
  doc.text(`Email: ${input.email}`, 14, y); y += 5;
  doc.text(`Address: ${input.address}`, 14, y); y += 8;

  doc.text('Items:', 14, y); y += 5;
  doc.setFont('courier', 'normal');
  doc.text('Product                     Qty   Unit      Total', 14, y); y += 5;
  doc.text('--------------------------------------------------', 14, y); y += 5;

  input.items.forEach(it => {
    const line =
      (it.product + (it.color ? ` (${it.color}/${formatSizeLabel(it.size)})` : '')).padEnd(27).slice(0,27) +
      String(it.quantity).padStart(4) + '  ' +
      formatMoneyValue(it.unitPrice).padStart(12) + '  ' +
      formatMoneyValue(it.price).padStart(12);
    doc.text(line, 14, y);
    y += 5;
  });

  y += 5;
  doc.text('--------------------------------------------------', 14, y); y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(`TOTAL: ${formatDisplayMoney(input.total)}`, 14, y); y += 6;

  doc.setFont('helvetica', 'normal');
  const payLine = input.payment === 'Part Payment'
    ? `Payment: Part • Paid ${formatDisplayMoney(input.partAmount)} • Due ${formatDisplayMoney(input.total - input.partAmount)}`
    : 'Payment: Full';
  doc.text(payLine, 14, y); y += 5;
  doc.text(`Status: ${input.status}`, 14, y); y += 5;
  doc.text(`Processed by: ${input.userName}`, 14, y); y += 10;

  doc.text('Thank you for your business!', 14, y);

  return doc.output('blob');
}
