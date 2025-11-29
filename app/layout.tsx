import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CareSync AI - Medical Patient Assistant',
  description: 'AI-powered patient health companion with WhatsApp integration',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
