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

  // -------- Status & Payment --------
  const [status, setStatus] = useState<'In Process' | 'Urgent' | 'Completed' | ''>('');
  const [payment, setPayment] = useState<'Full Payment' | 'Part Payment' | ''>('');
  const [partAmount, setPartAmount] = useState<number | ''>('');

  // -------- Flow flags --------
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
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

    return () => unsub();
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
      await setDoc(doc(db, 'account', txRef.id), {
        customerName: customerName.trim(),
        type: 'income',
        amount: total,
        description: `POS transaction for invoice #${invoice}`,
        transactionDate: serverTimestamp(),
        status,
      });

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

  // ---------- UI ----------
  return (
    <main className="min-h-screen px-6 py-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">🧾 POS Transaction</h1>

      {/* Invoice number */}
      <div className="mb-6">
        {fetchingInvoice ? (
          <div className="text-gray-500">Fetching invoice number…</div>
        ) : (
          <input
            readOnly
            value={`Invoice #${String(invoice || 0).padStart(5, '0')}`}
            className="border rounded-lg px-3 py-2 w-60 bg-gray-50"
          />
        )}
      </div>

      {/* Grid: Customer | Add Item */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer */}
        <section className="bg-white border rounded-2xl p-5 shadow-sm">
          <h2 className="font-semibold text-lg mb-3">Customer Information</h2>
          <div className="space-y-3">
            <Input label="Customer Name" value={customerName} onChange={setCustomerName} disabled={done} />
            <Input label="Phone" value={phone} onChange={setPhone} disabled={done} />
            <Input label="Address" value={address} onChange={setAddress} disabled={done} />
            <Input label="Email" value={email} onChange={setEmail} disabled={done} />
          </div>

          {!done && (
            <div className="mt-4 flex gap-2">
              <button onClick={searchCustomer} className="bg-blue-600 text-white px-4 py-2 rounded-lg">Search Customer</button>
              <button onClick={clearAll} className="bg-red-600 text-white px-4 py-2 rounded-lg">Clear</button>
            </div>
          )}
        </section>

        {/* Add product */}
        <section className="bg-white border rounded-2xl p-5 shadow-sm">
          <h2 className="font-semibold text-lg mb-3">Add Product</h2>

          {!done && (
            <>
              {/* Product */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <InputNumber label="Unit Price (Rs)" value={unitPrice} onChange={setUnitPrice} disabled={!selectedQty} />
                <div className="flex items-end">
                  <button onClick={addToCart} disabled={!selectedQty || unitPrice === ''} className="bg-black text-white px-4 py-2 rounded-lg disabled:opacity-60">
                    Add to Cart
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Cart list */}
          <div className="mt-5">
            <h3 className="font-medium mb-2">Items</h3>
            {cart.length === 0 ? (
              <div className="text-gray-500 text-sm">No items yet.</div>
            ) : (
              <div className="space-y-2">
                {cart.map((it, i) => (
                  <div key={i} className="border rounded-lg px-3 py-2 flex items-center justify-between">
                    <div className="text-sm">
                      <div className="font-semibold">{it.productName}</div>
                      <div className="text-gray-600">Color: {it.color} • Size: {it.size} • Qty: {it.quantity}</div>
                      <div className="text-green-700">{money(it.lineTotal)} ({money(it.unitPrice)} x {it.quantity})</div>
                    </div>
                    {!done && (
                      <button onClick={() => removeCartItem(i)} className="text-red-600 hover:underline text-sm">Remove</button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {cart.length > 0 && (
              <div className="mt-3 text-right font-semibold">
                Total: {money(cartTotal)}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Status / Payment */}
      {cart.length > 0 && !done && (
        <section className="bg-white border rounded-2xl p-5 shadow-sm mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
              className="bg-green-600 text-white px-5 py-2 rounded-lg disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Complete Transaction'}
            </button>
          </div>
        </section>
      )}

      {/* After completion */}
      {done && (
        <section className="bg-white border rounded-2xl p-5 shadow-sm mt-6">
          <h3 className="font-semibold mb-3">Success</h3>
          <div className="flex flex-wrap gap-3">
            {pdfUrl && (
              <a href={pdfUrl} target="_blank" className="bg-green-600 text-white px-4 py-2 rounded-lg">
                View / Download Receipt PDF
              </a>
            )}
            <button onClick={sendEmail} disabled={!pdfUrl || busy} className="bg-blue-600 text-white px-4 py-2 rounded-lg disabled:opacity-60">
              {busy ? 'Sending…' : 'Send Receipt by Email'}
            </button>
            <button onClick={clearAll} className="bg-gray-900 text-white px-4 py-2 rounded-lg">
              New Transaction
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

/* ---------------- Helpers & Inputs ---------------- */

function Input({ label, value, onChange, disabled=false }:{
  label: string; value: string; onChange: (v:string)=>void; disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm text-gray-600">{label}</span>
      <input
        value={value}
        onChange={(e)=>onChange(e.target.value)}
        disabled={disabled}
        className="border rounded-lg px-3 py-2 w-full"
      />
    </label>
  );
}

function InputNumber({ label, value, onChange, disabled=false }:{
  label: string; value: number|''; onChange: (v:number|'')=>void; disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm text-gray-600">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e)=>onChange(e.target.value === '' ? '' : Number(e.target.value))}
        disabled={disabled}
        className="border rounded-lg px-3 py-2 w-full"
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
      <span className="text-sm text-gray-600">{label}</span>
      <select
        value={value}
        onChange={(e)=>onChange(e.target.value)}
        disabled={disabled}
        className="border rounded-lg px-3 py-2 w-full bg-white"
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
