# Projet : AgroScan IA

## Description
AgroScan IA est une application mobile (PWA) de pointe conçue pour les agronomes et les agriculteurs. Elle utilise l'Intelligence Artificielle (Gemini API) pour identifier les espèces végétales, analyser leur stade phénologique (échelle BBCH), et détecter les maladies à partir de simples photos prises sur le terrain. L'application intègre également des données météorologiques de précision et une cartographie interactive pour le suivi géolocalisé des cultures.

## Fonctionnalités Principales
- **Analyse IA Directe** : Identification instantanée des variétés, stades de croissance et pathologies via Gemini Vision.
- **Cartographie Interactive** : Visualisation des observations sur une carte Leaflet avec filtrage par région et domaine.
- **Météo Agricole** : Tableaux de bord climatiques complets (Température, Humidité, ET0, DPV, PAR) intégrant historique et prévisions.
- **Répertoire Collaboratif** : Partage d'observations entre utilisateurs avec gestion des droits (Admin/User).
- **Mode Hors-ligne (PWA)** : Enregistrement local des observations en zone sans réseau avec synchronisation automatique.
- **Export de Données** : Génération de rapports au format Excel (XLSX).

## Stack Technique
- **Frontend** : React 19, Vite, Tailwind CSS.
- **Animations** : Motion (motion/react).
- **Icônes** : Lucide React.
- **Backend/Base de données** : Firebase (Firestore, Auth, Storage).
- **IA** : Google Gemini API (@google/genai).
- **Cartographie** : Leaflet / React-Leaflet.
- **Visualisation de données** : Recharts.

## Identité Visuelle
- **Thème** : Moderne, professionnel, inspiré par la nature (Vert Émeraude, Ardoise, Blanc Cassé).
- **Typographie** : Sans-serif propre (Inter ou système).
- **Design** : Mobile-first, cartes épurées avec ombres douces et transitions fluides.

## Structure du Projet
- `/src/App.tsx` : Point d'entrée principal et gestion des écrans.
- `/src/services/geminiService.ts` : Logique d'analyse IA.
- `/src/components/` : Composants modulaires (Caméra, Carte, Météo).
- `/src/hooks/` : Hooks personnalisés pour la gestion des données Firebase.
- `/src/lib/db.ts` : Gestion de la base de données locale IndexDB pour le mode offline.
