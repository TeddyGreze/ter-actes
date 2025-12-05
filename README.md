### Aifeze SIMBA (42002605) / Teddy GREZE (42002568)

# TER - Portail public de consultation des actes administratifs communaux

Application web de gestion et consultation publique des actes administratifs pour la mairie de Saint-André.

## Fonctionnalités

### Portail public
- **Consultation des actes** : Liste paginée avec filtres (type, service, dates)
- **Recherche avancée** : Recherche plein texte dans le contenu des PDF (OCR)
- **Visionneuse PDF intégrée** : Navigation, zoom, téléchargement
- **Envoi par e-mail** : Partage d'actes avec pièce jointe PDF
- **Téléchargement multiple** : Sélection et téléchargement groupé

### Back-office administrateur
- **Dépôt d'actes** : Upload simple ou multiple avec extraction automatique des métadonnées (OCR)
- **Gestion CRUD** : Création, modification, suppression des actes
- **Gestion des utilisateurs** : Création de comptes admin/agent
- **Journal d'audit** : Traçabilité des actions (création, modification, suppression)
- **Export CSV** : Export du journal d'audit

### Extraction automatique (OCR)
- Détection automatique du **type d'acte** (Arrêté, Délibération, Décision)
- Détection automatique du **service émetteur**
- Détection automatique de la **date de signature**
- Indexation plein texte pour la recherche

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| **Frontend** | Next.js 14, React 18, TypeScript |
| **Backend** | FastAPI (Python 3.11) |
| **Base de données** | PostgreSQL 16 |
| **Visionneuse PDF** | PDF.js |
| **OCR** | Tesseract + pytesseract |
| **Conteneurisation** | Docker & Docker Compose |

## Lancement

### Prérequis
- Docker et Docker Compose installés

### Démarrage

```bash
docker compose build

docker compose up
```

### Accès
| Service | URL |
|---------|-----|
| Portail public | http://localhost:3000 |
| Back-office | http://localhost:3000/admin |
| API Swagger | http://localhost:8000/docs |

### Identifiants par défaut
- **Email** : `admin@local`
- **Mot de passe** : `admin123`

## Configuration

### Variables d'environnement (.env)

```env
# Frontend
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

# Backend
DATABASE_URL=postgresql+psycopg://app:dev@db:5432/actes
CORS_ORIGINS=http://localhost:3000
UPLOAD_DIR=/data/uploads
SECRET_KEY=votre-cle-secrete
ADMIN_EMAIL=admin@local
ADMIN_PASSWORD=admin123
MAX_UPLOAD_MB=20

# SMTP (envoi d'e-mails)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=compte@example.com
SMTP_PASSWORD=mot_de_passe
SMTP_FROM="Recueil des actes <no-reply@example.fr>"
SMTP_USE_TLS=true

# URL publique pour les liens dans les e-mails
PUBLIC_FRONT_BASE_URL=http://localhost:3000
```

## Structure du projet

```
ter-actes/
├── api/                        # Backend FastAPI
│   ├── app/
│   │   ├── main.py             # Point d’entrée FastAPI
│   │   ├── config.py           # Chargement des variables d’env
│   │   ├── database.py         # Connexion PostgreSQL
│   │   ├── auth.py             # Auth, JWT, mots de passe
│   │   ├── models.py           # Modèles ORM
│   │   ├── models_refs.py      # Modèles ORM référentiels
│   │   ├── schemas.py          # Schémas Pydantic
│   │   ├── routers_actes.py    # Endpoints publics /actes
│   │   ├── routers_admin.py    # Endpoints admin /admin/*
│   │   ├── routers_refs.py     # Endpoints référentiels
│   │   ├── pdf_utils.py        # Extraction texte & OCR
│   │   ├── email_utils.py      # Envoi d’e-mails
│   │   └── utils.py            # Fonctions utilitaires
│   ├── Dockerfile
│   └── requirements.txt
│
├── web/                            # Frontend Next.js
│   └── src/
│       ├── app/
│       │   ├── page.tsx            # Page publique
│       │   ├── acte/[id]/page.tsx  # Page de visualisation
│       │   ├── admin/              # Back-office admin/agent
│       │   │   ├── (protected)/    # Pages protégées
│       │   │   │   ├── page.tsx    # Tableau de bord
│       │   │   │   ├── upload/     # Upload d'actes
│       │   │   │   ├── users/      # Gestion utilisateurs
│       │   │   │   └── audit-logs/ # Journal d'audit
│       │   │   └── login/          # Connexion
│       │   ├── api/session/        # Routes API Next.js
│       │   └── styles/             # CSS
│       └── components/             # Composants React
│           ├── PDFViewer.tsx
│           ├── Toast.tsx
│           ├── Skeleton.tsx
│           └── AdvancedSearchPanel.tsx
│
├── docker-compose.yml
├── .env
└── README.md
```

## API Endpoints

### Routes publiques

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/actes` | Liste des actes |
| GET | `/actes/{id}` | Détail d'un acte |
| GET | `/actes/{id}/pdf` | Télécharger le PDF |
| GET | `/actes/search_fulltext` | Recherche plein texte |
| POST | `/actes/{id}/email` | Envoyer l'acte par e-mail |

### Routes admin (authentification requise)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/admin/login` | Connexion |
| POST | `/admin/logout` | Déconnexion |
| GET | `/admin/me` | Info utilisateur courant |
| GET | `/admin/actes` | Liste admin des actes |
| POST | `/admin/actes` | Créer un acte |
| POST | `/admin/actes/bulk` | Création multiple |
| PUT | `/admin/actes/{id}` | Modifier un acte |
| DELETE | `/admin/actes/{id}` | Supprimer un acte |
| POST | `/admin/analyse-pdf` | Analyse OCR d'un PDF |
| GET | `/admin/users` | Liste des utilisateurs |
| POST | `/admin/users` | Créer un utilisateur |
| PUT | `/admin/users/{id}` | Modifier un utilisateur |
| DELETE | `/admin/users/{id}` | Supprimer un utilisateur |
| GET | `/admin/audit-logs` | Journal d'audit |
| GET | `/admin/audit-logs/export` | Export CSV du journal |
| GET | `/admin/types` | Liste des types d'actes |
| GET | `/admin/services` | Liste des services |

## Sécurité

- **Authentification** : JWT avec cookies HttpOnly
- **Rôles** : Admin (accès complet) / Agent (accès limité)
- **Headers de sécurité** : CSP, X-Frame-Options, HSTS, etc.
- **Validation** : Vérification MIME et signature des PDF uploadés
- **Audit** : Traçabilité de toutes les actions sur les actes

## Types d'actes supportés

Les types d'actes sont configurables. Par défaut :
- Arrêté
- Délibération
- Décision
- Autre

## Services

Les services émetteurs sont configurables. Par défaut :
- Mairie
- Culture
- Voirie
- Urbanisme

## Commandes Docker utiles

```bash
# Lancer en arrière-plan
docker compose up -d

# Voir les logs
docker compose logs -f

# Logs d'un service spécifique
docker compose logs -f api

# Reconstruire après modification
docker compose build --no-cache
docker compose up

# Arrêter
docker compose down

# Arrêter et supprimer les volumes (reset BDD)
docker compose down -v
```
