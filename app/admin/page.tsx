'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

type Product = {
  id: string
  name: string
  description: string
  price: number
  available: boolean
}

type OrderItem = {
  id: string
  quantity: number
  unit_price: number
  product: Product
}

type Order = {
  id: string
  customer_name: string
  pickup_slot: string
  status: 'recibido' | 'en_preparacion' | 'listo'
  total: number
  created_at: string
  order_items: OrderItem[]
}

type StatProduct = {
  name: string
  total_quantity: number
  total_revenue: number
}

type Combo = {
  product1: string
  product2: string
  count: number
}

type HistorialFilter = 'dia' | 'semana' | 'mes'

const STATUS_LABELS = {
  recibido: 'Recibido',
  en_preparacion: 'En preparación',
  listo: 'Listo',
}

const STATUS_COLORS = {
  recibido: 'bg-blue-900/50 text-blue-300',
  en_preparacion: 'bg-yellow-900/50 text-yellow-300',
  listo: 'bg-green-900/50 text-green-300',
}

const PIN = '1234'

function getDateRange(filter: HistorialFilter, selectedDate: string) {
  const date = new Date(selectedDate + 'T00:00:00')
  let from: Date
  let to: Date

  if (filter === 'dia') {
    from = new Date(date)
    to = new Date(date)
    to.setDate(to.getDate() + 1)
  } else if (filter === 'semana') {
    const day = date.getDay()
    from = new Date(date)
    from.setDate(date.getDate() - day)
    to = new Date(from)
    to.setDate(from.getDate() + 7)
  } else {
    from = new Date(date.getFullYear(), date.getMonth(), 1)
    to = new Date(date.getFullYear(), date.getMonth() + 1, 1)
  }

  return { from: from.toISOString(), to: to.toISOString() }
}

export default function AdminPage() {
  const [auth, setAuth] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [tab, setTab] = useState<'kds' | 'historial' | 'stats' | 'menu'>('kds')
  const [orders, setOrders] = useState<Order[]>([])
  const [history, setHistory] = useState<Order[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [topProducts, setTopProducts] = useState<StatProduct[]>([])
  const [combos, setCombos] = useState<Combo[]>([])
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', price: '', available: true })

  const today = new Date().toISOString().split('T')[0]
  const [historialFilter, setHistorialFilter] = useState<HistorialFilter>('dia')
  const [selectedDate, setSelectedDate] = useState(today)

  const fetchOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*, product:products(*))')
      .neq('status', 'listo')
      .order('pickup_slot', { ascending: true })
    setOrders(data || [])
  }, [])

  const fetchHistory = useCallback(async (filter: HistorialFilter, date: string) => {
    const { from, to } = getDateRange(filter, date)
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*, product:products(*))')
      .eq('status', 'listo')
      .gte('created_at', from)
      .lt('created_at', to)
      .order('created_at', { ascending: false })
    setHistory(data || [])
  }, [])

  const fetchProducts = useCallback(async () => {
    const { data } = await supabase.from('products').select('*').order('name')
    setProducts(data || [])
  }, [])

  const fetchStats = useCallback(async () => {
    const { data: items } = await supabase
      .from('order_items')
      .select('quantity, unit_price, product:products(name)')

    if (!items) return

    const productMap: Record<string, StatProduct> = {}
    items.forEach((item: any) => {
      const name = item.product?.name || 'Desconocido'
      if (!productMap[name]) productMap[name] = { name, total_quantity: 0, total_revenue: 0 }
      productMap[name].total_quantity += item.quantity
      productMap[name].total_revenue += item.quantity * item.unit_price
    })
    setTopProducts(Object.values(productMap).sort((a, b) => b.total_quantity - a.total_quantity))

    const { data: orderItemsGrouped } = await supabase
      .from('order_items')
      .select('order_id, product:products(name)')

    if (!orderItemsGrouped) return

    const orderMap: Record<string, string[]> = {}
    orderItemsGrouped.forEach((item: any) => {
      if (!orderMap[item.order_id]) orderMap[item.order_id] = []
      orderMap[item.order_id].push(item.product?.name || '')
    })

    const comboMap: Record<string, number> = {}
    Object.values(orderMap).forEach(names => {
      if (names.length < 2) return
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const key = [names[i], names[j]].sort().join(' + ')
          comboMap[key] = (comboMap[key] || 0) + 1
        }
      }
    })

    setCombos(
      Object.entries(comboMap)
        .map(([key, count]) => {
          const [product1, product2] = key.split(' + ')
          return { product1, product2, count }
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
    )
  }, [])

  useEffect(() => {
  if (!auth) return
  fetchOrders()
  fetchHistory(historialFilter, selectedDate)
  fetchProducts()
  fetchStats()

  const channel = supabase
    .channel('admin-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => {
      fetchOrders()
      fetchHistory(historialFilter, selectedDate)
      fetchStats()
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => {
  fetchOrders()
  fetchHistory(historialFilter, selectedDate)
  fetchStats()
})
.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => {
  fetchOrders()
  fetchHistory(historialFilter, selectedDate)
  fetchStats()
})
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_items' }, () => {
      fetchStats()
    })
    .subscribe((status) => {
      console.log('Realtime status:', status)
    })

  const interval = setInterval(() => {
    fetchOrders()
  }, 5000)

  return () => { 
    supabase.removeChannel(channel)
    clearInterval(interval)
  }
}, [auth, fetchOrders, fetchHistory, fetchStats, historialFilter, selectedDate])
  useEffect(() => {
    if (!auth) return
    fetchHistory(historialFilter, selectedDate)
  }, [historialFilter, selectedDate, fetchHistory, auth])

  const advanceStatus = async (order: Order) => {
    const next = order.status === 'recibido' ? 'en_preparacion' : 'listo'
    await supabase.from('orders').update({ status: next }).eq('id', order.id)
    fetchOrders()
  }

  const openNewProduct = () => {
    setEditingProduct(null)
    setForm({ name: '', description: '', price: '', available: true })
    setShowForm(true)
  }

  const openEditProduct = (p: Product) => {
    setEditingProduct(p)
    setForm({ name: p.name, description: p.description || '', price: p.price.toString(), available: p.available })
    setShowForm(true)
  }

  const saveProduct = async () => {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      price: parseFloat(form.price),
      available: form.available,
    }
    if (editingProduct) {
      await supabase.from('products').update(payload).eq('id', editingProduct.id)
    } else {
      await supabase.from('products').insert(payload)
    }
    setShowForm(false)
    setEditingProduct(null)
    setForm({ name: '', description: '', price: '', available: true })
    fetchProducts()
  }

  const deleteProduct = async (id: string) => {
    if (!confirm('¿Eliminar este producto?')) return
    await supabase.from('products').delete().eq('id', id)
    fetchProducts()
  }

  const toggleAvailable = async (p: Product) => {
    await supabase.from('products').update({ available: !p.available }).eq('id', p.id)
    fetchProducts()
  }

  const historialTotal = history.reduce((sum, o) => sum + o.total, 0)

  const tabs = [
    { key: 'kds', label: '🍳 KDS' },
    { key: 'historial', label: '📋 Historial' },
    { key: 'stats', label: '📊 Stats' },
    { key: 'menu', label: '🛒 Menú' },
  ]

  if (!auth) return (
    <main className="min-h-screen bg-zinc-900 flex items-center justify-center p-4">
      <div className="bg-zinc-800 rounded-xl p-8 shadow-md w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold text-amber-400 text-center">Panel Admin</h1>
        <p className="text-zinc-400 text-sm text-center">Mercadito Los Almendros</p>
        <input
          type="password"
          placeholder="PIN"
          value={pinInput}
          onChange={e => setPinInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && pinInput === PIN && setAuth(true)}
          className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-3 text-center text-xl tracking-widest text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <button
          onClick={() => pinInput === PIN && setAuth(true)}
          className="w-full bg-amber-500 hover:bg-amber-400 text-white font-bold py-3 rounded-lg transition"
        >
          Entrar
        </button>
        {pinInput && pinInput !== PIN && <p className="text-red-400 text-sm text-center">PIN incorrecto</p>}
      </div>
    </main>
  )

  return (
    <main className="min-h-screen bg-zinc-900 text-white">
      <div className="bg-zinc-800 border-b border-zinc-700 px-4 py-3 flex items-center justify-between">
        <h1 className="font-bold text-amber-400 text-lg">Los Almendros</h1>
        <div className="flex gap-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as any)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${tab === t.key ? 'bg-amber-500 text-white' : 'text-zinc-400 hover:text-white'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 max-w-5xl mx-auto">

        {/* KDS */}
        {tab === 'kds' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-zinc-300">Pedidos activos</h2>
              <span className="text-xs bg-zinc-700 text-zinc-400 px-2 py-1 rounded-full">{orders.length} pedidos</span>
            </div>
            {orders.length === 0 && (
              <div className="text-center py-20 text-zinc-600">
                <p className="text-4xl mb-3">🍽️</p>
                <p>No hay pedidos activos</p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {orders.map(order => {
                const pickupTime = new Date(order.pickup_slot).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })
                return (
                  <div key={order.id} className="bg-zinc-800 rounded-xl p-4 border border-zinc-700">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-bold text-white text-lg">{order.customer_name}</p>
                        <p className="text-zinc-400 text-sm">⏰ {pickupTime}</p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_COLORS[order.status]}`}>
                        {STATUS_LABELS[order.status]}
                      </span>
                    </div>
                    <div className="space-y-1 mb-4 border-t border-zinc-700 pt-3">
                      {order.order_items?.map(item => (
                        <div key={item.id} className="flex justify-between text-sm">
                          <span className="text-zinc-300">{item.product?.name} <span className="text-zinc-500">x{item.quantity}</span></span>
                          <span className="text-amber-400">L {(item.unit_price * item.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-amber-400">L {order.total.toFixed(2)}</span>
                      {order.status !== 'listo' && (
                        <button
                          onClick={() => advanceStatus(order)}
                          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold rounded-lg transition"
                        >
                          {order.status === 'recibido' ? '👨‍🍳 Preparar' : '✅ Listo'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Historial */}
        {tab === 'historial' && (
          <div>
            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
              <div className="flex gap-1 bg-zinc-800 rounded-lg p-1">
                {(['dia', 'semana', 'mes'] as HistorialFilter[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setHistorialFilter(f)}
                    className={`px-4 py-1.5 rounded-md text-sm font-semibold transition capitalize ${historialFilter === f ? 'bg-amber-500 text-white' : 'text-zinc-400 hover:text-white'}`}
                  >
                    {f === 'dia' ? 'Día' : f === 'semana' ? 'Semana' : 'Mes'}
                  </button>
                ))}
              </div>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                onClick={() => setSelectedDate(today)}
                className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm rounded-lg transition"
              >
                Hoy
              </button>
            </div>

            {/* Resumen */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-700">
                <p className="text-zinc-400 text-xs mb-1">Pedidos</p>
                <p className="text-2xl font-bold text-white">{history.length}</p>
              </div>
              <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-700">
                <p className="text-zinc-400 text-xs mb-1">Total vendido</p>
                <p className="text-2xl font-bold text-amber-400">L {historialTotal.toFixed(2)}</p>
              </div>
            </div>

            {history.length === 0 && (
              <div className="text-center py-20 text-zinc-600">
                <p className="text-4xl mb-3">📋</p>
                <p>No hay pedidos en este período</p>
              </div>
            )}
            <div className="space-y-3">
              {history.map(order => {
                const date = new Date(order.created_at).toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' })
                const time = new Date(order.created_at).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })
                return (
                  <div key={order.id} className="bg-zinc-800 rounded-xl p-4 border border-zinc-700">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-white">{order.customer_name}</p>
                        <p className="text-zinc-500 text-xs">{date} · {time}</p>
                      </div>
                      <span className="font-bold text-amber-400">L {order.total.toFixed(2)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {order.order_items?.map(item => (
                        <span key={item.id} className="text-xs bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded-full">
                          {item.product?.name} x{item.quantity}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Stats */}
        {tab === 'stats' && (
          <div className="space-y-6">
            <div>
              <h2 className="font-bold text-zinc-300 mb-3">Productos más vendidos</h2>
              {topProducts.length === 0 && <p className="text-zinc-600 text-sm">No hay datos aún</p>}
              <div className="space-y-2">
                {topProducts.map((p, i) => (
                  <div key={p.name} className="bg-zinc-800 rounded-xl p-4 flex items-center gap-4 border border-zinc-700">
                    <span className="text-2xl font-bold text-zinc-600 w-8">#{i + 1}</span>
                    <div className="flex-1">
                      <p className="font-semibold text-white">{p.name}</p>
                      <p className="text-zinc-400 text-sm">{p.total_quantity} unidades vendidas</p>
                    </div>
                    <span className="font-bold text-amber-400">L {p.total_revenue.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="font-bold text-zinc-300 mb-1">Combos frecuentes</h2>
              <p className="text-zinc-500 text-xs mb-3">Productos que la gente pide juntos</p>
              {combos.length === 0 && <p className="text-zinc-600 text-sm">Necesitas más pedidos para ver combos</p>}
              <div className="space-y-2">
                {combos.map((c, i) => (
                  <div key={i} className="bg-zinc-800 rounded-xl p-4 flex items-center justify-between border border-zinc-700">
                    <div>
                      <p className="font-semibold text-white">{c.product1} <span className="text-zinc-500">+</span> {c.product2}</p>
                      <p className="text-zinc-400 text-sm">Pedidos juntos {c.count} {c.count === 1 ? 'vez' : 'veces'}</p>
                    </div>
                    <span className="text-2xl">🔥</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Menú */}
        {tab === 'menu' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-zinc-300">Productos</h2>
              <button onClick={openNewProduct} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold rounded-lg transition">+ Nuevo</button>
            </div>

            {showForm && (
              <div className="bg-zinc-800 rounded-xl p-5 border border-zinc-700 mb-4 space-y-3">
                <h3 className="font-semibold text-white">{editingProduct ? 'Editar producto' : 'Nuevo producto'}</h3>
                <input placeholder="Nombre" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500" />
                <input placeholder="Descripción (opcional)" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500" />
                <input placeholder="Precio (ej. 45.00)" type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500" />
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input type="checkbox" checked={form.available} onChange={e => setForm({ ...form, available: e.target.checked })} />
                  Disponible
                </label>
                <div className="flex gap-2">
                  <button onClick={saveProduct} className="flex-1 bg-amber-500 hover:bg-amber-400 text-white font-semibold py-2 rounded-lg text-sm transition">Guardar</button>
                  <button onClick={() => { setShowForm(false); setEditingProduct(null) }}
                    className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 font-semibold py-2 rounded-lg text-sm transition">Cancelar</button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {products.map(p => (
                <div key={p.id} className="bg-zinc-800 rounded-xl p-4 border border-zinc-700 flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-white">{p.name}</p>
                    {p.description && <p className="text-xs text-zinc-400">{p.description}</p>}
                    <p className="text-amber-400 font-bold text-sm mt-1">L {p.price.toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleAvailable(p)}
                      className={`text-xs px-2 py-1 rounded-full font-semibold ${p.available ? 'bg-green-900/50 text-green-400' : 'bg-zinc-700 text-zinc-500'}`}>
                      {p.available ? 'Activo' : 'Inactivo'}
                    </button>
                    <button onClick={() => openEditProduct(p)} className="text-xs px-2 py-1 bg-blue-900/50 text-blue-400 rounded-full font-semibold">Editar</button>
                    <button onClick={() => deleteProduct(p.id)} className="text-xs px-2 py-1 bg-red-900/50 text-red-400 rounded-full font-semibold">Eliminar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}