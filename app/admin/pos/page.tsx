'use client';

import { useEffect, useMemo, useState } from 'react';
import { db, storage } from '@/lib/firebase';
import {
  addDoc,
  arrayUnion,
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

// If you want to show currency consistently
const money = (n: number) => `Rs ${Number(n || 0).toFixed(2)}`;

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
  const [status, setStatus] = useState<'In Process' | 'Urgent' | 'Completed' | ''>('');
  const [payment, setPayment] = useState<'Full Payment' | 'Part Payment' | ''>('');
  const [partAmount, setPartAmount] = useState<number | ''>('');

  // -------- Flow flags --------
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [holdId, setHoldId] = useState<string | null>(null);
  const [holds, setHolds] = useState<any[]>([]);
  const USER_NAME = 'mo-owner'; // if you want dynamic, pull from auth/session

  // ---------- Init: invoice + live products ----------
  useEffect(() => {
    // live products
    const q = query(collection(db, 'products'));
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as ProductDoc) }));
      setProducts(list);
    });

    // invoice
    (async () => {
      try {
        const ref = doc(db, 'invoiceSettings', 'currentInvoice');
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setInvoice((snap.data() as any).invoiceNumber || 1);
        } else {
          await setDoc(ref, { invoiceNumber: 1 });
          setInvoice(1);
        }
      } finally {
        setFetchingInvoice(false);
      }
    })();

    const unsubHolds = onSnapshot(query(collection(db, 'posHolds')), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      setHolds(list.sort((a,b)=> (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).slice(0,20));
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
    return row ? Object.keys(row.sizes) : [];
  }, [currentProduct, selectedColor]);

  const availableQty = useMemo(() => {
    if (!currentProduct || !selectedColor || !selectedSize) return 0;
    const row = currentProduct.colors.find(c => c.color === selectedColor);
    if (!row) return 0;
    return row.sizes[selectedSize] || 0;
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
      const match = snap.docs.find(d => ((d.data() as any).customerName || '').toLowerCase() === name);
      if (match) {
        const data = match.data() as any;
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
        const data = snap.docs[0].data() as any;
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
      const match = snap.docs.find(d => ((d.data() as any).customerEmail || '').toLowerCase() === emailLower);
      if (match) {
        const data = match.data() as any;
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
    } catch (e:any) {
      alert(e?.message || 'Failed to hold');
    }
  };

  const loadHold = (h: any) => {
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

  const releaseHold = async (h: any) => {
    try {
      for (const it of (h.items||[])) {
        const ref = doc(db, 'products', it.productId);
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists()) return;
          const data = snap.data() as ProductDoc;
          const idx = data.colors.findIndex(c => c.color === it.color);
          if (idx < 0) return;
          const cur = Number(data.colors[idx].sizes[it.size] || 0);
          const copy = JSON.parse(JSON.stringify(data)) as ProductDoc;
          copy.colors[idx].sizes[it.size] = cur + Number(it.quantity||0);
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

    // Decrement stock transactionally (so qty can’t go negative)
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(productRef);
        if (!snap.exists()) throw new Error('Product not found');
        const data = snap.data() as ProductDoc;

        const colorIdx = data.colors.findIndex(c => c.color === selectedColor);
        if (colorIdx < 0) throw new Error('Color not found');

        const current = data.colors[colorIdx].sizes[selectedSize!];
        if (!Number.isFinite(current) || current < (selectedQty!)) {
          throw new Error('Insufficient quantity available');
        }

        const copy = JSON.parse(JSON.stringify(data)) as ProductDoc;
        copy.colors[colorIdx].sizes[selectedSize!] = current - (selectedQty!);

        tx.update(productRef, { colors: copy.colors });
      });
    } catch (e: any) {
      return alert(e?.message || 'Failed to update stock');
    }

    const price = Number(unitPrice || 0);
    const item: CartItem = {
      productId: selectedProductId,
      productName: currentProduct.productName,
      color: selectedColor!,
      size: selectedSize!,
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
        const cur = Number(data.colors[colorIdx].sizes[item.size] || 0);
        const copy = JSON.parse(JSON.stringify(data)) as ProductDoc;
        copy.colors[colorIdx].sizes[item.size] = cur + item.quantity;
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
    } catch (e: any) {
      console.error(e);
      alert(e?.message || 'Failed to complete transaction');
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
    } catch (e: any) {
      alert(e?.message || 'Failed to send email');
    } finally {
      setBusy(false);
    }
  };

  const canHold = !done && cart.length > 0;

  // ---------- UI ----------
  return (
    <main className="relative min-h-screen">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-12rem] h-80 w-80 rounded-full bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.35),transparent_70%)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[-10rem] top-40 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_top,rgba(14,116,144,0.25),transparent_70%)] blur-3xl"
      />
      <div className="relative mx-auto max-w-7xl space-y-6 px-6 py-8">
        {/* Hero */}
        <section
          className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm backdrop-blur"
          style={{ animation: 'fadeUp 0.6s ease-out both' }}
        >
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.08),transparent_60%)]"
          />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-600">
                POS
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl">
                POS Transaction
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
                Fast checkout with live stock control, part payments, and instant PDF receipts.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <FiShoppingCart className="h-4 w-4" /> Live cart + stock
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                  <FiCreditCard className="h-4 w-4" /> Part payments
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  <FiFileText className="h-4 w-4" /> PDF receipt
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={saveHold}
                disabled={!canHold}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
              >
                <FiPauseCircle className="h-4 w-4" /> Hold Current
              </button>
              <button
                onClick={clearAll}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                <FiPlayCircle className="h-4 w-4" /> New Transaction
              </button>
            </div>
          </div>
          <div className="relative mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1">
              <FiFileText className="h-4 w-4" />
              {fetchingInvoice
                ? 'Fetching invoice number…'
                : `Invoice #${String(invoice || 0).padStart(5, '0')}`}
            </span>
            {holdId && (
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
                <FiPauseCircle className="h-4 w-4" /> Hold id: {holdId}
              </span>
            )}
          </div>
        </section>

        {/* Stats */}
        <section
          className="grid grid-cols-2 gap-4 md:grid-cols-4"
          style={{ animation: 'fadeUp 0.6s ease-out both', animationDelay: '0.08s' }}
        >
          <StatCard label="Cart items" value={cartItems} tone="sky" icon={<FiShoppingCart className="h-4 w-4" />} />
          <StatCard label="Cart total" value={money(cartTotal)} tone="emerald" icon={<FiDollarSign className="h-4 w-4" />} />
          <StatCard label="Active holds" value={holds.length} tone="amber" icon={<FiPauseCircle className="h-4 w-4" />} />
          <StatCard label="Status" value={status || 'Not set'} tone="slate" icon={<FiClipboard className="h-4 w-4" />} />
        </section>

        {/* Holds */}
        <section
          className="rounded-3xl border border-slate-200/70 bg-white/90 p-4 shadow-sm backdrop-blur"
          style={{ animation: 'fadeUp 0.6s ease-out both', animationDelay: '0.14s' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Holds</div>
              <div className="mt-1 text-sm text-slate-600">Pause a checkout and resume later.</div>
            </div>
            <button
              onClick={saveHold}
              disabled={!canHold}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
            >
              <FiPauseCircle className="h-4 w-4" /> Hold Current
            </button>
          </div>
          {holds.length > 0 ? (
            <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
              {holds.map(h => (
                <div
                  key={h.id}
                  className="min-w-[190px] rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-sm text-slate-800 truncate" title={h.customerName || '—'}>
                      {h.customerName || '—'}
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500">{money(h.total || 0)}</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => loadHold(h)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Resume
                    </button>
                    <button
                      onClick={() => releaseHold(h)}
                      className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-100"
                    >
                      Release
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 text-sm text-slate-500">No holds yet.</div>
          )}
        </section>

        {/* Grid: Customer | Add Item */}
        <section
          className="grid grid-cols-1 gap-6 lg:grid-cols-2"
          style={{ animation: 'fadeUp 0.6s ease-out both', animationDelay: '0.2s' }}
        >
          {/* Customer */}
          <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <FiUser className="h-4 w-4" /> Customer Information
            </div>
            <div className="mt-4 space-y-3">
              <Input label="Customer Name" value={customerName} onChange={setCustomerName} disabled={done} />
              <Input label="Phone" value={phone} onChange={setPhone} disabled={done} />
              <Input label="Address" value={address} onChange={setAddress} disabled={done} />
              <Input label="Email" value={email} onChange={setEmail} disabled={done} />
            </div>

            {!done && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={searchCustomer} className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700">
                  Search Customer
                </button>
                <button onClick={clearAll} className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700">
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Add product */}
          <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <FiTag className="h-4 w-4" /> Add Product
            </div>

            {!done && (
              <>
                {/* Product */}
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
                    options={[{ label: 'Select…', value: '' }, ...availableSizes.map(s => ({ label: s, value: s }))]}
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
                    <button onClick={addToCart} disabled={!selectedQty || unitPrice === ''} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60">
                      Add to Cart
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Cart list */}
            <div className="mt-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <FiShoppingCart className="h-4 w-4" /> Items
              </div>
              {cart.length === 0 ? (
                <div className="mt-3 text-sm text-slate-500">No items yet.</div>
              ) : (
                <div className="mt-3 space-y-3">
                  {cart.map((it, i) => (
                    <div key={i} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="text-sm">
                          <div className="font-semibold text-slate-800">{it.productName}</div>
                          <div className="text-xs text-slate-500">Color: {it.color} • Size: {it.size} • Qty: {it.quantity}</div>
                          <div className="text-emerald-700 text-xs font-semibold mt-1">{money(it.lineTotal)} ({money(it.unitPrice)} x {it.quantity})</div>
                        </div>
                        {!done && (
                          <button onClick={() => removeCartItem(i)} className="text-rose-600 text-xs font-semibold hover:underline">
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {cart.length > 0 && (
                <div className="mt-3 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                  <span>Order total</span>
                  <span>{money(cartTotal)}</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Status / Payment */}
        {cart.length > 0 && !done && (
          <section
            className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-sm"
            style={{ animation: 'fadeUp 0.6s ease-out both', animationDelay: '0.26s' }}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <FiClipboard className="h-4 w-4" /> Status & Payment
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <Select
                label="Status"
                value={status}
                onChange={(v) => setStatus(v as any)}
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
                onChange={(v) => setPayment(v as any)}
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
              <button
                onClick={complete}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
              >
                <FiCheckCircle className="h-4 w-4" />
                {busy ? 'Saving…' : 'Complete Transaction'}
              </button>
            </div>
          </section>
        )}

        {/* After completion */}
        {done && (
          <section
            className="rounded-3xl border border-emerald-200/70 bg-emerald-50/70 p-5 shadow-sm"
            style={{ animation: 'fadeUp 0.6s ease-out both', animationDelay: '0.26s' }}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <FiCheckCircle className="h-4 w-4" /> Success
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              {pdfUrl && (
                <a href={pdfUrl} target="_blank" className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700">
                  View / Download Receipt PDF
                </a>
              )}
              <button onClick={sendEmail} disabled={!pdfUrl || busy} className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60">
                {busy ? 'Sending…' : 'Send Receipt by Email'}
              </button>
              <button onClick={clearAll} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">
                New Transaction
              </button>
            </div>
          </section>
        )}

        <style jsx>{`
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
        `}</style>
      </div>
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
      border: 'border-slate-200',
      bg: 'from-slate-50 via-white to-white',
      accent: 'bg-slate-100 text-slate-700',
      glow: 'bg-slate-200/40',
      value: 'text-slate-900',
    },
    sky: {
      border: 'border-sky-100',
      bg: 'from-sky-50 via-white to-white',
      accent: 'bg-sky-100 text-sky-700',
      glow: 'bg-sky-200/40',
      value: 'text-slate-900',
    },
    emerald: {
      border: 'border-emerald-100',
      bg: 'from-emerald-50 via-white to-white',
      accent: 'bg-emerald-100 text-emerald-700',
      glow: 'bg-emerald-200/40',
      value: 'text-slate-900',
    },
    amber: {
      border: 'border-amber-100',
      bg: 'from-amber-50 via-white to-white',
      accent: 'bg-amber-100 text-amber-700',
      glow: 'bg-amber-200/40',
      value: 'text-slate-900',
    },
  } as const;
  const theme = tones[tone] ?? tones.slate;

  return (
    <div className={`relative overflow-hidden rounded-2xl border ${theme.border} bg-gradient-to-br ${theme.bg} p-4 shadow-sm`}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          {label}
        </div>
        {icon && (
          <span className={`flex h-9 w-9 items-center justify-center rounded-full ${theme.accent}`}>
            {icon}
          </span>
        )}
      </div>
      <div className={`mt-3 text-2xl font-semibold ${theme.value}`}>{value}</div>
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full blur-2xl ${theme.glow}`}
      />
    </div>
  );
}

/* ---------------- Helpers & Inputs ---------------- */

function Input({ label, value, onChange, disabled=false }:{
  label: string; value: string; onChange: (v:string)=>void; disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      <input
        value={value}
        onChange={(e)=>onChange(e.target.value)}
        disabled={disabled}
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      />
    </label>
  );
}

function InputNumber({ label, value, onChange, disabled=false }:{
  label: string; value: number|''; onChange: (v:number|'')=>void; disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e)=>onChange(e.target.value === '' ? '' : Number(e.target.value))}
        disabled={disabled}
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
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
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(e)=>onChange(e.target.value)}
        disabled={disabled}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
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
      (it.product + (it.color ? ` (${it.color}/${it.size})` : '')).padEnd(27).slice(0,27) +
      String(it.quantity).padStart(4) + '  ' +
      String(it.unitPrice.toFixed(2)).padStart(7) + '  ' +
      String(it.price.toFixed(2)).padStart(7);
    doc.text(line, 14, y);
    y += 5;
  });

  y += 5;
  doc.text('--------------------------------------------------', 14, y); y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(`TOTAL: Rs ${input.total.toFixed(2)}`, 14, y); y += 6;

  doc.setFont('helvetica', 'normal');
  const payLine = input.payment === 'Part Payment'
    ? `Payment: Part • Paid Rs ${input.partAmount.toFixed(2)} • Due Rs ${(input.total - input.partAmount).toFixed(2)}`
    : 'Payment: Full';
  doc.text(payLine, 14, y); y += 5;
  doc.text(`Status: ${input.status}`, 14, y); y += 5;
  doc.text(`Processed by: ${input.userName}`, 14, y); y += 10;

  doc.text('Thank you for your business!', 14, y);

  return doc.output('blob');
}
