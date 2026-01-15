import type { Metadata } from 'next';
import './globals.css';
import { ModalProvider } from './components/ModalProvider';

export const metadata: Metadata = {
  title: 'LOL Ban/Pick Tool - 英雄联盟BP工具',
  description: 'League of Legends Ban/Pick tool with tournament rules - 正规比赛BP规则',
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
          <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
            {children}
          </div>
        </ModalProvider>
      </body>
    </html>
  );
}
