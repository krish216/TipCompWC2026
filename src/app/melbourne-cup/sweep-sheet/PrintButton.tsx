'use client'

import { track } from '@vercel/analytics'

export function PrintButton() {
  return (
    <button onClick={() => { track('sweep_sheet_print'); window.print() }}
      className="bg-gray-900 hover:bg-black text-white text-sm font-bold px-4 py-2.5 rounded-xl">
      🖨️ Print the sweep sheet
    </button>
  )
}
