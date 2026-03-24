# DAIRIA Tool — Guidelines pour Claude

## Mode de travail
- Tu travailles en AUTONOMIE TOTALE. Ne pose JAMAIS de questions.
- Prends toutes les decisions techniques toi-meme.
- Code tout ce qui est demande, puis ouvre une PR quand c'est termine.

## Deploiement (OBLIGATOIRE)
- Deploy sur Render. Ton travail n est PAS termine tant que ca ne tourne pas.
- Itere jusqu a ce que ca marche en production.

## Notification de livraison (OBLIGATOIRE)
Quand termine, poste un commentaire avec URL + identifiants admin.

## Charte graphique DAIRIA (OBLIGATOIRE)
- Fond : #f8f8f6 / Navy : #1e2d3d / Orange : #e8842c / Gris : #6b7280
- Cards blanches, border-radius 14px, ombre legere
- Design professionnel, elegant, epure

## Stack
- Next.js + TypeScript + Tailwind
- Supabase (URL: https://noqzwkkdfpbmglewsozo.supabase.co)
- IMPORTANT Next.js 16 : proxy.ts au lieu de middleware.ts

## Securite
- OWASP Top 10, pas de secrets en dur, RGPD
