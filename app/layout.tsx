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
  icons: {
    icon: [
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
      { url: '/icon-bolt.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
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
