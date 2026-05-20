'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Product = {
  id: string
  name: string
  description: string
  price: number
  available: boolean
}

type CartItem = {
  product: Product
  quantity: number
}

const SLOTS = Array.from({ length: 16 }, (_, i) => {
  const hour = Math.floor(i / 4) + 7
  const min = (i % 4) * 15
  return `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`
})

export default function Home() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [name, setName] = useState('')
  const [slot, setSlot] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase
      .from('products')
      .select('*')
      .eq('available', true)
      .then(({ data }) => setProducts(data || []))
  }, [])

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id)
      if (existing) return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { product, quantity: 1 }]
    })
  }

  const removeFromCart = (productId: string) => {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === productId)
      if (!existing) return prev
      if (existing.quantity === 1) return prev.filter(i => i.product.id !== productId)
      return prev.map(i => i.product.id === productId ? { ...i, quantity: i.quantity - 1 } : i)
    })
  }

  const total = cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0)

  const handleOrder = async () => {
    if (!name.trim() || !slot || cart.length === 0) return
    setLoading(true)

    const today = new Date().toISOString().split('T')[0]
    const pickupSlot = new Date(`${today}T${slot}:00`)

    const { data: order, error } = await supabase
      .from('orders')
      .insert({ customer_name: name.trim(), pickup_slot: pickupSlot, status: 'recibido', total })
      .select()
      .single()

    if (error || !order) { setLoading(false); return }

    await supabase.from('order_items').insert(
      cart.map(i => ({
        order_id: order.id,
        product_id: i.product.id,
        quantity: i.quantity,
        unit_price: i.product.price
      }))
    )

    router.push(`/status/${order.id}`)
  }

  return (
    <main className="min-h-screen bg-zinc-900 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-amber-400">Mercadito Los Almendros</h1>
          <p className="text-zinc-400 mt-1">Haz tu pedido para recoger</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          {products.map(p => {
            const inCart = cart.find(i => i.product.id === p.id)
            return (
              <div key={p.id} className="bg-zinc-800 rounded-xl p-4 flex justify-between items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white truncate">{p.name}</p>
                  {p.description && <p className="text-sm text-zinc-400 truncate">{p.description}</p>}
                  <p className="text-amber-400 font-bold mt-1">L {p.price.toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {inCart ? (
                    <>
                      <button onClick={() => removeFromCart(p.id)} className="w-8 h-8 rounded-full bg-zinc-700 text-white font-bold hover:bg-zinc-600">−</button>
                      <span className="w-5 text-center font-semibold text-white">{inCart.quantity}</span>
                      <button onClick={() => addToCart(p)} className="w-8 h-8 rounded-full bg-amber-500 text-white font-bold hover:bg-amber-400">+</button>
                    </>
                  ) : (
                    <button onClick={() => addToCart(p)} className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-400">Agregar</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {cart.length > 0 && (
          <div className="bg-zinc-800 rounded-xl p-5 space-y-4">
            <h2 className="font-bold text-white text-lg">Tu pedido</h2>
            {cart.map(i => (
              <div key={i.product.id} className="flex justify-between text-sm text-zinc-300">
                <span>{i.product.name} x{i.quantity}</span>
                <span>L {(i.product.price * i.quantity).toFixed(2)}</span>
              </div>
            ))}
            <div className="border-t border-zinc-700 pt-2 flex justify-between font-bold text-white">
              <span>Total</span>
              <span>L {total.toFixed(2)}</span>
            </div>
            <input
              type="text"
              placeholder="Tu nombre"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <select
              value={slot}
              onChange={e => setSlot(e.target.value)}
              className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">Hora de recogida</option>
              {SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button
              onClick={handleOrder}
              disabled={loading || !name.trim() || !slot}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition"
            >
              {loading ? 'Enviando...' : 'Confirmar pedido — Pago en efectivo'}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}