import type { Metadata } from 'next';
import { AuthProvider } from '@/components/auth';
import './globals.css';

export const metadata: Metadata = {
  title: 'Echo - Your AI Companion',
  description: 'A voice-first personal AI companion with persistent memory',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
