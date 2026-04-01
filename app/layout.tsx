import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Exec Voice Replic8 | Security Awareness Training',
  description: 'Executive Voice Replication Platform for Security Awareness Training',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <body className="antialiased min-h-screen" style={{ background: 'var(--bg-base)', color: 'var(--text-1)' }}>
        {children}
      </body>
    </html>
  )
}
