import './globals.css'

export const metadata = {
  title: 'AI Readiness Dashboard',
  description: 'Interactive Copilot Readiness Dashboard for SharePoint Sites',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}


