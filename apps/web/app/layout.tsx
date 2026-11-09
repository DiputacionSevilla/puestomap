import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PuestoMap", template: "%s · PuestoMap" },
  description:
    "Panel para localizar, inventariar y asistir en remoto los puestos de trabajo del Ayuntamiento de Mairena del Alcor",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
