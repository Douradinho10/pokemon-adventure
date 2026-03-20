import type { Metadata } from 'next'
import { Noto_Sans, Noto_Sans_Mono, Press_Start_2P } from 'next/font/google'
import './globals.css'

const notoSans = Noto_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-ui',
})

const notoSansMono = Noto_Sans_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono-ui',
})

const pressStart2P = Press_Start_2P({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-pixel-ui',
  weight: '400',
})

export const metadata: Metadata = {
  title: 'Pokemon Adventure',
  description: 'Pokemon Adventure',
  generator: 'v0.dev',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt">
      <body className={`${notoSans.variable} ${notoSansMono.variable} ${pressStart2P.variable} font-sans`}>{children}</body>
    </html>
  )
}
