import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ToastProvider } from "@/components/toast";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sports Meet Manager",
  description: "Registration, bibs, results, points and certificates for an interschool sports meet",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* Browser extensions often inject attributes into <body>; don't treat that as a hydration error. */}
      <body className={`${geistSans.variable} antialiased`} suppressHydrationWarning>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
