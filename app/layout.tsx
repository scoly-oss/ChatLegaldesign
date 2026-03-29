import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DAIRIA — Assistant Juridique Droit Social",
  description:
    "Chatbot juridique spécialisé en droit social français. Posez vos questions et obtenez des réponses citant les articles de loi pertinents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
