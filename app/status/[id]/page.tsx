'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams } from 'next/navigation'

type Order = {
  id: string
  customer_name: string
  pickup_slot: string
  status: 'recibido' | 'en_preparacion' | 'listo'
  total: number
}

const STATUS_STEPS = [
  { key: 'recibido', label: 'Recibido', emoji: '🧾' },
  { key: 'en_preparacion', label: 'En preparación', emoji: '👨‍🍳' },
  { key: 'listo', label: 'Listo para recoger', emoji: '✅' },
]

export default function StatusPage() {
  const { id } = useParams()
  const [order, setOrder] = useState<Order | null>(null)

  useEffect(() => {
    if (!id) return

    supabase.from('orders').select('*').eq('id', id).single()
      .then(({ data }) => setOrder(data))

    const channel = supabase
      .channel('order-status')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${id}`
      }, payload => setOrder(payload.new as Order))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [id])

  if (!order) return (
    <main className="min-h-screen bg-zinc-900 flex items-center justify-center">
      <p className="text-zinc-400">Cargando pedido...</p>
    </main>
  )

  const currentStep = STATUS_STEPS.findIndex(s => s.key === order.status)
  const pickupTime = new Date(order.pickup_slot).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })

  return (
    <main className="min-h-screen bg-zinc-900 p-4 md:p-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8 mt-6">
          <h1 className="text-2xl md:text-3xl font-bold text-amber-400">Mercadito Los Almendros</h1>
          <p className="text-zinc-400 mt-1">Hola, <span className="font-semibold text-white">{order.customer_name}</span> 👋</p>
        </div>

        <div className="bg-zinc-800 rounded-xl p-6 mb-6">
          <div className="flex justify-between text-sm text-zinc-400 mb-6">
            <span>Recogida a las <strong className="text-white">{pickupTime}</strong></span>
            <span>Total <strong className="text-amber-400">L {order.total.toFixed(2)}</strong></span>
          </div>

          <div className="space-y-5">
            {STATUS_STEPS.map((step, i) => {
              const done = i <= currentStep
              const active = i === currentStep
              return (
                <div key={step.key} className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all ${done ? 'bg-amber-500' : 'bg-zinc-700'}`}>
                    {step.emoji}
                  </div>
                  <span className={`font-medium text-lg ${done ? 'text-white' : 'text-zinc-600'}`}>{step.label}</span>
                  {active && (
                    <span className="ml-auto text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded-full font-semibold animate-pulse">Actual</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {order.status === 'listo' && (
  <div className="bg-green-900/40 border border-green-700 rounded-xl p-5 text-center space-y-4">
    <p className="text-5xl">🎉</p>
    <p className="text-green-400 font-bold text-2xl">Tu pedido esta listo!</p>
    <p className="text-green-500 text-sm">Pasa a recogerlo y paga en efectivo. Gracias!</p>
    <a href="/" className="block w-full bg-amber-500 hover:bg-amber-400 text-white font-bold py-3 rounded-xl transition mt-2">
      Hacer nuevo pedido
    </a>
  </div>
)}
    </div>
    </main>
  )
}