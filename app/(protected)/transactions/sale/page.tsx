'use client';

import { useState, useEffect, useRef } from 'react';
import { useProducts, useCreateSale, useAccounts, useRecentSales, useDeleteSale, useCustomerByCedula } from '@/hooks/use-queries';
import { useDebounce } from '@/hooks/use-debounce';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Plus, Minus, Check, Loader2, Clock, User, Users, Trash2, AlertCircle, Search, ChevronDown, ChevronUp, Edit2 } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';
import { Producto, Customer } from '@/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface SaleItem {
  productId: string;
  quantity: number;
  price: number;
}

const RECENT_PRODUCTS_KEY = 'recent-products-v1';

export default function NewSalePage() {
  const router = useRouter();
  const { data: accounts } = useAccounts();
  const { mutate: createSale, isPending } = useCreateSale();

  // History Hooks
  const { data: recentSales, isLoading: loadingHistory } = useRecentSales();
  const { mutate: deleteSale, isPending: isDeleting } = useDeleteSale();

  const [items, setItems] = useState<SaleItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Customer State
  // Customer State
  const [clientType, setClientType] = useState<'CONSUMER' | 'CLIENT'>('CONSUMER');

  // New Customer Fields
  const [customerIdNumber, setCustomerIdNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  // Search & Retract Logic
  const debouncedCedula = useDebounce(customerIdNumber, 500);
  const { data: foundCustomer, isLoading: searchingCustomer } = useCustomerByCedula(debouncedCedula);

  const [isFormExpanded, setIsFormExpanded] = useState(true);
  const [isCustomerFound, setIsCustomerFound] = useState(false);

  // Effect: Handle Customer Search Result
  useEffect(() => {
    if (foundCustomer) {
      setIsCustomerFound(true);
      setCustomerName(foundCustomer.name);
      setCustomerPhone(foundCustomer.phone || '');
      setCustomerEmail(foundCustomer.email || '');
      setCustomerCity(foundCustomer.city || '');
      setCustomerAddress(foundCustomer.address || '');
      setIsFormExpanded(false); // Retract on find
    } else {
      if (debouncedCedula.length >= 10 && !searchingCustomer) {
        // Optionally reset fields if not found, or keep them if user is typing
        setIsCustomerFound(false);
        setIsFormExpanded(true); // Expand if not found so user can type
      }
    }
  }, [foundCustomer, debouncedCedula, searchingCustomer]);


  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [shippingAccount, setShippingAccount] = useState<string>('');
  const [shippingCost, setShippingCost] = useState<number>(0);
  const [discount, setDiscount] = useState(0);
  const [userNote, setUserNote] = useState(''); // New state for optional note

  // Recommendations State
  const [recentProducts, setRecentProducts] = useState<Producto[]>([]);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Load recents on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_PRODUCTS_KEY);
      if (stored) {
        setRecentProducts(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load recent products', e);
    }
  }, []);

  // Close recommendations on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowRecommendations(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Standard server-side search
  // Do NOT fetch 100000 items. Fetch standard page size (e.g., 50) and let Supabase filter.
  // We use useDebounce for searchTerm to avoid hitting API on every keystroke
  const debouncedSearch = useDebounce(searchTerm, 300);

  const { data: productsData, isLoading: loadingProducts } = useProducts({
    search: debouncedSearch,
    pageSize: 50 // Reasonable limit
  });

  const filteredProducts = productsData?.data || [];


  const addToRecent = (product: Producto) => {
    const newRecents = [product, ...recentProducts.filter(p => p.id !== product.id)].slice(0, 5);
    setRecentProducts(newRecents);
    localStorage.setItem(RECENT_PRODUCTS_KEY, JSON.stringify(newRecents));
  };

  const addItem = (product: Producto) => {
    addToRecent(product);
    const existing = items.find((i) => i.productId === product.id);
    if (existing) {
      setItems(
        items.map((i) =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      );
    } else {
      setItems([...items, { productId: product.id, quantity: 1, price: product.selling_price }]);
    }
  };

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const total = subtotal - discount;
  const netInflow = total - (shippingCost || 0);

  // Validate Stock
  const insufficientStockItems = items.filter(item => {
    const product = filteredProducts?.find((p) => p.id === item.productId) || recentProducts.find(p => p.id === item.productId);
    return product ? item.quantity > product.current_stock : false;
  });

  const hasStockIssues = insufficientStockItems.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedAccount || items.length === 0) {
      alert('Por favor completa todos los campos');
      return;
    }

    if (clientType === 'CLIENT') {
      if (!customerIdNumber) {
        alert('Por favor ingresa la Cédula/RUC del cliente');
        return;
      }
      if (!customerName) {
        alert('Por favor ingresa el nombre del cliente');
        return;
      }
      if (!customerPhone) {
        alert('Por favor ingresa el teléfono del cliente');
        return;
      }
      // City is mandatory per requirements
      if (!customerCity) {
        alert('Por favor ingresa la ciudad del cliente');
        return;
      }
    }

    if (shippingCost > 0 && !shippingAccount) {
      alert('Selecciona la cuenta desde la que se pagará el envío');
      return;
    }

    // Construct notes with City if provided (Legacy support or just additional info)
    // We now send dedicated fields, but keeping it in notes doesn't hurt.
    let finalNotes = userNote;
    if (clientType === 'CLIENT') {
      // Optional: Add some info to notes just in case
    }

    const saleData = {
      id_cuenta: selectedAccount,

      // Customer Data
      nombre_cliente: clientType === 'CLIENT' ? customerName : 'Consumidor Final',
      cedula_cliente: clientType === 'CLIENT' ? customerIdNumber : undefined,
      telefono_cliente: clientType === 'CLIENT' ? customerPhone : undefined,
      email_cliente: clientType === 'CLIENT' ? customerEmail : undefined,
      ciudad_cliente: clientType === 'CLIENT' ? customerCity : undefined,
      direccion_cliente: clientType === 'CLIENT' ? customerAddress : undefined,

      metodo_pago: 'EFECTIVO' as const, // Default, se podría agregar selector
      articulos: items.map((item) => ({
        id_producto: item.productId,
        cantidad: item.quantity,
        precio_unitario: item.price,
      })),
      descuento: discount,
      costo_envio: shippingCost || 0,
      id_cuenta_envio: shippingAccount || undefined,
      notas: finalNotes || undefined
    };

    createSale(saleData, {
      onSuccess: () => {
        router.push('/');
      },
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24 transition-colors">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors">
        <div className="max-w-md md:max-w-4xl mx-auto flex h-16 items-center gap-4 px-4">
          <Link href="/">
            <button className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
              <ArrowLeft className="h-5 w-5 text-slate-700 dark:text-slate-200" />
            </button>
          </Link>
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Nueva Venta</h1>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-md md:max-w-4xl mx-auto p-4 space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4 md:space-y-0 md:grid md:grid-cols-2 md:gap-6">
          {/* Customer Type Selection */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 transition-colors">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Tipo de Cliente</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setClientType('CONSUMER')}
                className={`p-3 rounded-lg border flex items-center justify-center gap-2 text-sm font-bold transition-all ${clientType === 'CONSUMER'
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 dark:border-blue-400 text-blue-700 dark:text-blue-400'
                  : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900'
                  }`}
              >
                <Users className="w-4 h-4" />
                Consumidor Final
              </button>
              <button
                type="button"
                onClick={() => setClientType('CLIENT')}
                className={`p-3 rounded-lg border flex items-center justify-center gap-2 text-sm font-bold transition-all ${clientType === 'CLIENT'
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 dark:border-blue-400 text-blue-700 dark:text-blue-400'
                  : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900'
                  }`}
              >
                <User className="w-4 h-4" />
                Cliente
              </button>
            </div>

            {/* Dynamic Customer Fields */}
            {clientType === 'CLIENT' && (
              <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">

                {/* Search / Identity Field */}
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1 block flex items-center justify-between">
                    <span>Cédula / RUC *</span>
                    {searchingCustomer && <span className="text-blue-500">Buscando...</span>}
                  </label>
                  <div className="relative">
                    <Input
                      placeholder="Ingrese Cédula para buscar..."
                      value={customerIdNumber}
                      onChange={(e) => setCustomerIdNumber(e.target.value)}
                      className={`w-full bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 dark:text-slate-100 pl-10 h-11 text-base ${isCustomerFound ? 'border-green-500 ring-1 ring-green-500/20' : ''
                        }`}
                      autoFocus
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                    {isCustomerFound && (
                      <Check className="w-4 h-4 text-green-500 absolute right-3 top-3.5" />
                    )}
                  </div>
                </div>

                {/* Customer Found Alert / Header */}
                {isCustomerFound && !isFormExpanded && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 flex justify-between items-center">
                    <div>
                      <p className="text-sm font-bold text-green-700 dark:text-green-400">{customerName}</p>
                      <p className="text-xs text-green-600 dark:text-green-500">Cliente registrado</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsFormExpanded(true)}
                      className="p-2 hover:bg-green-100 dark:hover:bg-green-900/40 rounded-full transition-colors text-green-700 dark:text-green-400"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Detailed Fields (Expandable) */}
                {(isFormExpanded || !isCustomerFound) && (
                  <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800/50">
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Datos del Cliente</label>
                      {isCustomerFound && (
                        <button type="button" onClick={() => setIsFormExpanded(false)} className="text-xs text-blue-500 flex items-center gap-1">
                          Ocultar <ChevronUp className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <div>
                      <label className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1 block">Nombre *</label>
                      <Input
                        placeholder="Nombre Completo"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 dark:text-slate-100 text-base"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1 block">Teléfono *</label>
                        <Input
                          placeholder="099..."
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 dark:text-slate-100 text-base"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1 block">Ciudad *</label>
                        <Input
                          placeholder="Quito..."
                          value={customerCity}
                          onChange={(e) => setCustomerCity(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 dark:text-slate-100 text-base"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1 block">Dirección (Opcional)</label>
                      <Input
                        placeholder="Calle Principal y Secundaria..."
                        value={customerAddress}
                        onChange={(e) => setCustomerAddress(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 dark:text-slate-100 text-base"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1 block">Email (Opcional)</label>
                      <Input
                        type="email"
                        placeholder="cliente@email.com"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 dark:text-slate-100 text-base"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Account Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Cuenta *
            </label>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-full p-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              required
            >
              <option value="" className="dark:bg-slate-900 text-slate-500">Selecciona una cuenta</option>
              {accounts
                ?.filter(acc => acc.name !== 'Caja Grande') // Filter out Caja Grande for small transactions
                .sort((a, b) => {
                  const priority = ['Banco Pichincha Katiuska', 'Banco Guayaquil Katiuska', 'Efectivo'];
                  const idxA = priority.indexOf(a.name);
                  const idxB = priority.indexOf(b.name);
                  if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                  if (idxA !== -1) return -1;
                  if (idxB !== -1) return 1;
                  return a.name.localeCompare(b.name);
                })
                .map((acc) => (
                  <option key={acc.id} value={acc.id} className="dark:bg-slate-900">
                    {acc.name} ({formatCurrency(acc.balance)})
                  </option>
                ))}
            </select>
          </div>

          {/* Product Search */}
          <div className="relative" ref={searchContainerRef}>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Agregar Productos
            </label>
            <Input
              placeholder="Buscar por SKU o nombre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setShowRecommendations(true)}
              className="w-full p-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />

            {/* Recommendations / Search Results dropdown */}
            {showRecommendations && (
              <div className="absolute z-50 left-0 right-0 mt-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl max-h-64 overflow-y-auto">
                {searchTerm ? (
                  // Search Results
                  filteredProducts?.length > 0 ? (
                    filteredProducts.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => {
                          addItem(product);
                          setSearchTerm('');
                          setShowRecommendations(false);
                        }}
                        className="w-full text-left p-3 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between transition-colors"
                      >
                        <div>
                          <p className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                            {product.name}
                          </p>
                          <div className="flex gap-2 text-xs">
                            <p className="text-slate-500 dark:text-slate-400">
                              Stock: {product.current_stock}
                            </p>
                            {product.cost_price > 0 && (
                              <p className="text-amber-600 dark:text-amber-500 font-medium">
                                Costo+IVA: {formatCurrency(product.cost_price * 1.15)}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-sm text-blue-600 dark:text-blue-400">
                            {formatCurrency(product.selling_price)}
                          </p>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="p-4 text-center text-slate-500 dark:text-slate-400 text-sm">
                      No se encontraron productos
                    </div>
                  )
                ) : (
                  // Recent Recommendations
                  recentProducts.length > 0 ? (
                    <div className="py-2">
                      <div className="px-3 pb-2 pt-1 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Recientes
                      </div>
                      {recentProducts.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => {
                            addItem(product);
                            setShowRecommendations(false);
                          }}
                          className="w-full text-left p-3 border-b border-slate-50 dark:border-slate-800 last:border-0 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center justify-between group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-200 dark:bg-blue-600 group-hover:bg-blue-500 dark:group-hover:bg-blue-400 transition-colors" />
                            <div>
                              <p className="font-medium text-sm text-slate-700 dark:text-slate-300 group-hover:text-blue-700 dark:group-hover:text-blue-400">
                                {product.name}
                              </p>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                {formatCurrency(product.selling_price)}
                              </p>
                            </div>
                          </div>
                          <Plus className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-blue-500 dark:group-hover:text-blue-400" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-slate-500 dark:text-slate-400 text-xs italic">
                      Escribe para buscar productos...
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          {/* Items List */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 transition-colors">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center transition-colors">
              <p className="font-semibold text-slate-800 dark:text-slate-100">
                Artículos ({items.length})
              </p>
            </div>
            {items.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((item, index) => {
                  const product = filteredProducts?.find((p) => p.id === item.productId) || recentProducts.find(p => p.id === item.productId);
                  const isStockIssue = product ? item.quantity > product.current_stock : false;
                  return (
                    <div key={index} className={`p-4 flex justify-between items-center gap-4 ${isStockIssue ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                      <div className="flex-1">
                        <p className="font-medium text-slate-800 dark:text-slate-200 text-sm line-clamp-1">
                          {product?.name || 'Producto'}
                        </p>
                        {isStockIssue && (
                          <p className="text-xs text-red-600 dark:text-red-400 font-bold flex items-center gap-1 mt-0.5">
                            <AlertCircle className="w-3 h-3" />
                            Stock insuficiente (Máx: {product?.current_stock})
                          </p>
                        )}
                        <div className="flex flex-col mt-1">
                          <p className="text-xs text-blue-600 dark:text-blue-400 font-bold">
                            {formatCurrency(item.price)} unit.
                          </p>
                          {product?.cost_price && (
                            <div className="flex flex-col">
                              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                Costo+IVA: {formatCurrency(product.cost_price * 1.15)}
                              </p>
                              <p className="text-[10px] text-amber-600 dark:text-amber-500 font-medium">
                                Ganancia: {formatCurrency(item.price - (product.cost_price * 1.15))}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 rounded-lg p-1 border border-slate-200 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={() => {
                            if (item.quantity > 1) {
                              setItems(items.map((i, idx) => idx === index ? { ...i, quantity: i.quantity - 1 } : i));
                            } else {
                              setItems(items.filter((_, idx) => idx !== index));
                            }
                          }}
                          className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-md shadow-sm dark:shadow-none text-slate-600 dark:text-slate-400 transition-all"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-sm font-bold w-4 text-center text-slate-800 dark:text-slate-200">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setItems(items.map((i, idx) => idx === index ? { ...i, quantity: i.quantity + 1 } : i));
                          }}
                          className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-md shadow-sm dark:shadow-none text-blue-600 dark:text-blue-400 transition-all"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                <p className="text-sm">No hay artículos agregados</p>
              </div>
            )}
          </div>

          {/* Note Field (Optional) */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Nota Opcional
            </label>
            <Input
              placeholder="Ej: Pendiente de entrega, Cliente frecuente..."
              value={userNote}
              onChange={(e) => setUserNote(e.target.value)}
              className="w-full p-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
            />
          </div>

          {/* Totals */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 transition-colors md:col-span-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
              <span className="font-medium text-slate-800 dark:text-slate-200">{formatCurrency(subtotal)}</span>
            </div>

            {/* Total Profit Display */}
            <div className="flex justify-between text-xs pt-1 border-t border-dashed border-slate-200 dark:border-slate-800">
              <span className="text-emerald-600 dark:text-emerald-500 font-semibold">Ganancia Estimada Total</span>
              <span className="text-emerald-600 dark:text-emerald-500 font-bold">
                {formatCurrency(items.reduce((acc, item) => {
                  const product = filteredProducts?.find((p) => p.id === item.productId) || recentProducts.find(p => p.id === item.productId);
                  if (!product) return acc;
                  // Profit = (Selling Price - Discount Share) - (Cost + IVA)
                  // Simplified: (Item Total - 0) - (Item Cost + IVA)
                  // Note: Discount is global, so it's subtracted at the end. Here we just sum up gross profit
                  const costWithIva = (product.cost_price || 0) * 1.15;
                  return acc + ((item.price - costWithIva) * item.quantity);
                }, 0) - discount - shippingCost)}
              </span>
            </div>

            <div className="flex justify-between items-center text-sm pt-2">
              <span className="text-slate-500 dark:text-slate-400">Valor de Venta (Total)</span>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={items.length > 0 ? (Math.round((subtotal - discount) * 100) / 100) : ''}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (isNaN(val)) {
                      setDiscount(0);
                      return;
                    }
                    // Si el valor ingresado es 80 y subtotal es 100, descuento es 20 (Positivo)
                    // Si el valor ingresado es 120 y subtotal es 100, descuento es -20 (Negativo - Sobreprecio)
                    setDiscount(subtotal - val);
                  }}
                  placeholder="0.00"
                  className="w-28 text-right h-9 text-base font-bold bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 dark:text-slate-200"
                />
              </div>
            </div>

            {/* Difference Indicator */}
            {items.length > 0 && discount !== 0 && (
              <div className="flex justify-end text-xs animate-in fade-in slide-in-from-top-1 border-b border-dashed border-slate-200 dark:border-slate-800 pb-2">
                <span className={discount > 0 ? "text-amber-600 dark:text-amber-500 font-medium" : "text-emerald-600 dark:text-emerald-400 font-medium"}>
                  {discount > 0 ? "↓ Descuento aplicado: " : "↑ Ganancia extra: "}
                  {formatCurrency(Math.abs(discount))}
                </span>
              </div>
            )}

            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 dark:text-slate-400">Costo de Envío</span>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={shippingCost || ''}
                  onChange={(e) => setShippingCost(Number(e.target.value))}
                  placeholder="0.00"
                  className="w-20 text-right h-8 text-sm bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 dark:text-slate-200"
                />
              </div>
            </div>

            {shippingCost > 0 && (
              <div className="pt-2 animate-in fade-in slide-in-from-top-1">
                <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Pagar envío desde:</label>
                <select
                  value={shippingAccount}
                  onChange={(e) => setShippingAccount(e.target.value)}
                  className="w-full p-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300"
                  required
                >
                  <option value="">Selecciona cuenta...</option>
                  {accounts?.map((acc) => (
                    <option key={acc.id} value={acc.id} className="dark:bg-slate-900">
                      {acc.name} ({formatCurrency(acc.balance)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-end">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Total a Cobrar</p>
                {shippingCost > 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Diferencia: <span className="font-medium text-emerald-600 dark:text-emerald-500">{formatCurrency(netInflow)}</span>
                  </p>
                )}
              </div>
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatCurrency(total)}</span>
            </div>
          </div>


          {/* Submit Button - Mobile Optimized */}
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 md:static md:bg-transparent md:border-0 md:p-0 md:col-span-2 z-40">
            <button
              type="submit"
              disabled={isPending || items.length === 0 || hasStockIssues}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              {isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : hasStockIssues ? (
                <>
                  <AlertCircle className="w-5 h-5" />
                  Stock Insuficiente
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  Confirmar Venta {formatCurrency(total)}
                </>
              )}
            </button>
          </div>

          {/* Spacer for fixed bottom button on mobile */}
          <div className="h-20 md:hidden"></div>

        </form>

        {/* Recent History Section */}
        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            Historial Reciente
          </h2>

          {loadingHistory ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400 dark:text-slate-500" />
            </div>
          ) : recentSales && recentSales.length > 0 ? (
            <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4">
              {recentSales.map((sale) => (
                <div key={sale.id} className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-3 transition-colors">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-100">
                        Venta #{sale.sale_number}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {formatDateTime(sale.created_at)}
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                        {sale.customer_name || 'Consumidor Final'}
                      </div>
                      {sale.customer_document && (
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          CI/RUC: {sale.customer_document}
                        </div>
                      )}
                      {sale.customer_city && (
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {sale.customer_city} {sale.customer_address ? `- ${sale.customer_address}` : ''}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-slate-900 dark:text-slate-100">
                        {formatCurrency(sale.total)}
                      </div>
                      <div className={`text-[10px] px-2 py-0.5 rounded-full inline-block mt-1 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 font-bold`}>
                        PAGADO
                      </div>
                    </div>
                  </div>

                  {/* Product Details */}
                  {sale.items && sale.items.length > 0 && (
                    <div className="bg-white dark:bg-slate-950 rounded-lg p-2 border border-slate-100 dark:border-slate-800/50 text-xs">
                      <p className="font-semibold text-slate-500 dark:text-slate-400 mb-1">Detalle:</p>
                      <div className="space-y-1">
                        {sale.items.map((item: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-start">
                            <div className="flex gap-1 text-slate-700 dark:text-slate-300">
                              <span className="font-bold">{item.quantity}x</span>
                              <span className="line-clamp-1">{item.product?.name || 'Producto eliminado'}</span>
                            </div>
                            <span className="text-slate-500 font-medium">
                              {formatCurrency(item.quantity * item.unit_price)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Delete Button */}
                  <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 flex items-center gap-1 font-semibold px-2 py-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">
                          <Trash2 className="w-3 h-3" />
                          Eliminar Venta
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta acción eliminará la venta #{sale.sale_number}, revertirá el stock de los productos y descontará el dinero de la cuenta. No se puede deshacer.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteSale(sale.id)}
                            className="bg-red-600 hover:bg-red-700 text-white dark:text-white"
                          >
                            {isDeleting ? 'Eliminando...' : 'Sí, Eliminar'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-slate-400 dark:text-slate-500 text-sm italic">
              No hay ventas recientes
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
