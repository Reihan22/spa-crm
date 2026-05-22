import './globals.css';

export const metadata = {
  title: 'Spa CRM',
  description: 'WhatsApp AI CRM for spa service business',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
