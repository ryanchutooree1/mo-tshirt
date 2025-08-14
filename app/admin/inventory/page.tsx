'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  updateDoc,
  doc,
  deleteDoc
} from 'firebase/firestore';

type SizeMap = { [size: string]: number };
type Color = { color: string; sizes: SizeMap };
type Product = { id: string; productName: string; colors: Color[] };

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddColor, setShowAddColor] = useState<string | null>(null);

  // Form states
  const [newProductName, setNewProductName] = useState('');
  const [newColorName, setNewColorName] = useState('');
  const [newSize, setNewSize] = useState('');
  const [newQty, setNewQty] = useState<number>(0);

  useEffect(() => {
    const q = query(collection(db, 'products'), orderBy('productName'));
    const unsub = onSnapshot(q, (snap) => {
      const list: Product[] = snap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Product, 'id'>),
      }));
      setProducts(list);
    });
    return () => unsub();
  }, []);

  // Add product
  const handleAddProduct = async () => {
    if (!newProductName.trim()) return;
    await addDoc(collection(db, 'products'), {
      productName: newProductName.trim(),
      colors: []
    });
    setNewProductName('');
    setShowAddProduct(false);
  };

  // Add color/size to existing product
  const handleAddColorSize = async (productId: string) => {
    if (!newColorName.trim() || !newSize.trim()) return;

    const prodRef = doc(db, 'products', productId);
    const product = products.find(p => p.id === productId);
    if (!product) return;

    let updatedColors = [...product.colors];
    const existingColorIndex = updatedColors.findIndex(c => c.color === newColorName.trim());

    if (existingColorIndex >= 0) {
      updatedColors[existingColorIndex].sizes[newSize.trim()] = newQty;
    } else {
      updatedColors.push({ color: newColorName.trim(), sizes: { [newSize.trim()]: newQty } });
    }

    await updateDoc(prodRef, { colors: updatedColors });
    setNewColorName('');
    setNewSize('');
    setNewQty(0);
    setShowAddColor(null);
  };

  // Inline quantity update
  const updateQty = async (productId: string, colorIndex: number, sizeKey: string, qty: number) => {
    const prodRef = doc(db, 'products', productId);
    const product = products.find(p => p.id === productId);
    if (!product) return;

    let updatedColors = [...product.colors];
    updatedColors[colorIndex].sizes[sizeKey] = qty;

    await updateDoc(prodRef, { colors: updatedColors });
  };

  // Delete product with password confirmation
  const handleDeleteProduct = async (productId: string) => {
    const pass = prompt('Enter password to delete:');
    if (pass === 'delete123') {
      await deleteDoc(doc(db, 'products', productId));
    } else {
      alert('Incorrect password. Deletion cancelled.');
    }
  };

  return (
    <main className="min-h-screen px-6 py-10 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">📦 Inventory</h1>
        <div className="flex gap-4">
          <button
            onClick={() => setShowAddProduct(true)}
            className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg"
          >
            ➕ Add Product
          </button>
          {expanded && (
            <button
              onClick={() => setShowAddColor(expanded)}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg"
            >
              🎨 Add Color/Size
            </button>
          )}
        </div>
      </div>

      {products.map((prod) => (
        <div
          key={prod.id}
          className="mb-4 border rounded-lg shadow-sm bg-white overflow-hidden"
        >
          <div className="flex justify-between items-center">
            <button
              onClick={() => setExpanded(expanded === prod.id ? null : prod.id)}
              className="flex-1 text-left px-4 py-3 text-lg font-semibold bg-gray-100 hover:bg-gray-200"
            >
              {prod.productName}
            </button>
            <button
              onClick={() => handleDeleteProduct(prod.id)}
              className="px-3 text-red-500 hover:underline"
            >
              Delete
            </button>
          </div>

          {expanded === prod.id && (
            <div className="p-4 space-y-4">
              {prod.colors.map((col, cIdx) => (
                <div key={cIdx} className="border rounded-lg">
                  <div className="bg-gray-50 px-3 py-2 font-medium">{col.color}</div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="text-left px-3 py-2">Size</th>
                        <th className="text-right px-3 py-2">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(col.sizes).map(([size, qty], sIdx) => (
                        <tr key={sIdx} className="border-t">
                          <td className="px-3 py-2">{size}</td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              value={qty}
                              onChange={(e) =>
                                updateQty(prod.id, cIdx, size, parseInt(e.target.value) || 0)
                              }
                              className="w-16 border rounded px-1"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {products.length === 0 && (
        <p className="text-gray-500 text-center">No products found in inventory.</p>
      )}

      {/* Add Product Modal */}
      {showAddProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-80">
            <h2 className="text-lg font-bold mb-4">Add Product</h2>
            <input
              value={newProductName}
              onChange={(e) => setNewProductName(e.target.value)}
              placeholder="Product name"
              className="w-full border px-3 py-2 rounded-lg mb-4"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddProduct(false)}>Cancel</button>
              <button
                onClick={handleAddProduct}
                className="bg-green-500 text-white px-3 py-1 rounded-lg"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Color/Size Modal */}
      {showAddColor && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-96">
            <h2 className="text-lg font-bold mb-4">Add Color & Size</h2>
            <input
              value={newColorName}
              onChange={(e) => setNewColorName(e.target.value)}
              placeholder="Color name"
              className="w-full border px-3 py-2 rounded-lg mb-2"
            />
            <input
              value={newSize}
              onChange={(e) => setNewSize(e.target.value)}
              placeholder="Size (e.g., S, M, L)"
              className="w-full border px-3 py-2 rounded-lg mb-2"
            />
            <input
              type="number"
              value={newQty}
              onChange={(e) => setNewQty(parseInt(e.target.value) || 0)}
              placeholder="Quantity"
              className="w-full border px-3 py-2 rounded-lg mb-4"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddColor(null)}>Cancel</button>
              <button
                onClick={() => handleAddColorSize(showAddColor)}
                className="bg-blue-500 text-white px-3 py-1 rounded-lg"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
