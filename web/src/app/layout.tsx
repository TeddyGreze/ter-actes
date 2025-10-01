// web/src/app/layout.tsx
import './styles/ui.css'
import { ToastProvider } from '../components/Toast'

export const metadata = {
  title: 'TER — Portail des actes',
  description: 'Back-office & portail de consultation des actes',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body>
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  )
}
