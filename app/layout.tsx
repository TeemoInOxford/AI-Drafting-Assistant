import type { Metadata } from 'next';
import './globals.css';
import { ModalProvider } from './components/ModalProvider';

export const metadata: Metadata = {
  title: 'LOL AI Drafting Assistant - A Stage-Aware Draft Strategist',
  description: 'A decision-support system for professional League of Legends drafting. Built for coaches who understand that drafts are won in the margins.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning translate="no">
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body suppressHydrationWarning>
        <ModalProvider>
          {children}
        </ModalProvider>
      </body>
    </html>
  );
}
