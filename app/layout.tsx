import type { Metadata } from 'next';
import './globals.css';
import { ModalProvider } from './components/ModalProvider';

export const metadata: Metadata = {
  title: 'AI Drafting Assistant - LOL Ban/Pick Tool',
  description: 'League of Legends Ban/Pick tool with AI recommendations and tournament rules',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ModalProvider>
          {children}
        </ModalProvider>
      </body>
    </html>
  );
}
